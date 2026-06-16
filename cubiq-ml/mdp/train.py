"""
Autodidactic Iteration (ADI) training for the Rubik's Cube MDP.

ADI (Agostinelli et al. 2019 — "Solving the Rubik's Cube Without Human Knowledge"):
  1. Sample scrambles of depth d = 1 … k from the solved state (l scrambles per depth).
  2. For each scrambled state s, compute 18 neighbor states s' by applying each move.
  3. Target value: v*(s) = 1 + min_a V(s')   (Bellman backup, one step lookahead)
     At depth 1 from solved, targets start at ~1; deeper scrambles get higher targets.
  4. Target policy: one-hot on the action that minimises V(s').
  5. Train network to minimise MSE(value) + CrossEntropy(policy).
  6. Repeat, updating targets using the latest network weights each epoch.

Progress is written to mdp/checkpoint/metrics.json after each epoch so the
FastAPI server can serve live training status without shared state.
"""
from __future__ import annotations
import copy
import json
import os
import random
import threading
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim

from mdp.env import CubeEnv, ACTION_SPACE, N_ACTIONS
from mdp.model import CubeNet, build_model
from mdp.state import STATE_DIM

CHECKPOINT_DIR = Path(__file__).parent / 'checkpoint'
METRICS_FILE   = CHECKPOINT_DIR / 'metrics.json'
MODEL_FILE     = CHECKPOINT_DIR / 'model.pt'

# Global training state — written by background thread, read by API
_lock = threading.Lock()
_status: dict = {
    'running':    False,
    'trained':    False,
    'epoch':      0,
    'loss':       None,
    'value_loss': None,
    'policy_loss': None,
    'solve_rate': None,
    'history':    [],       # list of per-epoch dicts
}
_stop_flag = threading.Event()


# ── Status helpers ─────────────────────────────────────────────────────────────

def get_status() -> dict:
    with _lock:
        return dict(_status)


def _update_status(**kwargs):
    with _lock:
        _status.update(kwargs)
    _persist_metrics()


def _persist_metrics():
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    with _lock:
        data = dict(_status)
    try:
        METRICS_FILE.write_text(json.dumps(data, indent=2))
    except Exception:
        pass


def load_persisted_status():
    """Called at server startup to restore metrics from disk."""
    if METRICS_FILE.exists():
        try:
            data = json.loads(METRICS_FILE.read_text())
            with _lock:
                _status.update(data)
                _status['running'] = False  # never persist running=True
        except Exception:
            pass


# ── Data generation ────────────────────────────────────────────────────────────

def generate_batch(env: CubeEnv, k: int, l: int) -> tuple[np.ndarray, list]:
    """
    Generate l scrambles for each depth d in 1..k.
    Returns:
      states  — (k*l, STATE_DIM) float32 array
      cubes   — list of pycuber Cube objects (for neighbour expansion)
    """
    states, cubes = [], []
    for d in range(1, k + 1):
        for _ in range(l):
            vec, cube, _ = env.scramble(d)
            states.append(vec)
            cubes.append(cube)
    return np.array(states, dtype=np.float32), cubes


# ── ADI target computation ─────────────────────────────────────────────────────

def compute_targets(
    model: CubeNet,
    cubes: list,
    env: CubeEnv,
    device: str,
) -> tuple[np.ndarray, np.ndarray]:
    """
    For each cube, expand all 18 neighbours, run the network, and compute:
      target_value  = 1 + min_a V(neighbour_a)
      target_policy = one-hot on argmin_a V(neighbour_a)
    Returns:
      target_values  — (N,) float32
      target_policies — (N,) int64  (class indices)
    """
    model.eval()
    n = len(cubes)
    # Build (n*18, STATE_DIM) batch of all neighbour states
    neighbour_states = np.zeros((n * N_ACTIONS, STATE_DIM), dtype=np.float32)
    for i, cube in enumerate(cubes):
        for j, (move, ns, _) in enumerate(env.neighbors(cube)):
            neighbour_states[i * N_ACTIONS + j] = ns

    with torch.no_grad():
        x = torch.tensor(neighbour_states, device=device)
        v_all, _ = model(x)
        v_all = v_all.cpu().numpy().reshape(n, N_ACTIONS)  # (n, 18)

    # argmin breaks ties by always returning the first index. Early in training
    # the untrained value head outputs near-identical values for every neighbour,
    # so plain argmin collapses every target onto action 0 ('U') and the policy
    # head quickly mode-collapses to always predict it. Break ties randomly
    # among all near-minimal actions instead.
    rounded = np.round(v_all, decimals=4)
    row_min = rounded.min(axis=1, keepdims=True)
    is_min = rounded == row_min
    tie_break = np.where(is_min, np.random.random(v_all.shape), -np.inf)
    best_actions = tie_break.argmax(axis=1)

    target_values = 1.0 + v_all[np.arange(n), best_actions]
    return target_values.astype(np.float32), best_actions.astype(np.int64)


# ── Evaluation ─────────────────────────────────────────────────────────────────

def evaluate(model: CubeNet, env: CubeEnv, n: int = 100, max_depth: int = 5,
             max_steps: int = 50, device: str = 'cpu') -> float:
    """Greedy rollout solve rate on n random scrambles of depth ≤ max_depth."""
    import copy as _copy
    model.eval()
    solved = 0
    for _ in range(n):
        depth = random.randint(1, max_depth)
        _, cube, _ = env.scramble(depth)
        for _ in range(max_steps):
            if env.is_solved(cube):
                solved += 1
                break
            _, probs = model.predict(env._cube_to_state(cube) if hasattr(env, '_cube_to_state') else
                                     __import__('mdp.state', fromlist=['_cube_to_state'])._cube_to_state(cube),
                                     device=device)
            action = int(probs.argmax())
            _, _, done, cube = env.step(cube, action)
            if done:
                solved += 1
                break
    return solved / n


# ── Training loop ──────────────────────────────────────────────────────────────

def train(
    epochs:     int = 100,
    k:          int = 26,    # max scramble depth
    l:          int = 20,    # scrambles per depth
    lr:         float = 1e-4,
    hidden:     int = 4096,
    trunk_layers: int = 2,
    device_str: str = 'cpu',
    eval_every: int = 10,
    resume:     bool = True,
):
    """
    Full ADI training run. Meant to be called in a background thread.
    Writes progress to METRICS_FILE every epoch.
    Call stop_training() to interrupt cleanly.
    """
    _stop_flag.clear()
    device = torch.device(device_str)
    env = CubeEnv()

    # Load or create model
    model = build_model(hidden=hidden, trunk_layers=trunk_layers).to(device)
    if resume and MODEL_FILE.exists():
        try:
            model.load_state_dict(torch.load(MODEL_FILE, map_location=device))
        except Exception:
            pass

    optimizer = optim.Adam(model.parameters(), lr=lr)
    value_loss_fn  = nn.MSELoss()
    policy_loss_fn = nn.CrossEntropyLoss()

    start_epoch = get_status().get('epoch', 0)
    _update_status(running=True)

    for ep in range(start_epoch + 1, start_epoch + epochs + 1):
        if _stop_flag.is_set():
            break

        t0 = time.perf_counter()

        # 1. Generate batch
        states, cubes = generate_batch(env, k, l)

        # 2. Compute ADI targets
        tgt_values, tgt_policies = compute_targets(model, cubes, env, device_str)

        # 3. Train one epoch
        model.train()
        x      = torch.tensor(states,      device=device)
        y_val  = torch.tensor(tgt_values,  device=device)
        y_pol  = torch.tensor(tgt_policies, device=device, dtype=torch.long)

        optimizer.zero_grad()
        pred_val, pred_pol = model(x)
        v_loss = value_loss_fn(pred_val, y_val)
        p_loss = policy_loss_fn(pred_pol, y_pol)
        loss   = v_loss + p_loss
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 10.0)
        optimizer.step()

        # 4. Evaluate periodically
        solve_rate = None
        if ep % eval_every == 0:
            solve_rate = evaluate(model, env, n=100, max_depth=min(k, 5), device=device_str)

        elapsed = time.perf_counter() - t0

        epoch_metrics = {
            'epoch':       ep,
            'loss':        float(loss.item()),
            'value_loss':  float(v_loss.item()),
            'policy_loss': float(p_loss.item()),
            'solve_rate':  solve_rate,
            'elapsed_s':   round(elapsed, 2),
        }

        # 5. Save checkpoint
        CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
        torch.save(model.state_dict(), MODEL_FILE)

        with _lock:
            _status['history'].append(epoch_metrics)
            if len(_status['history']) > 500:   # cap history size
                _status['history'] = _status['history'][-500:]

        _update_status(
            epoch=ep,
            loss=float(loss.item()),
            value_loss=float(v_loss.item()),
            policy_loss=float(p_loss.item()),
            solve_rate=solve_rate if solve_rate is not None else _status.get('solve_rate'),
            trained=True,
        )

    _update_status(running=False)


def stop_training():
    _stop_flag.set()


def load_model(device_str: str = 'cpu', hidden: int = 4096, trunk_layers: int = 2) -> CubeNet | None:
    """Load the latest saved model, or return None if no checkpoint exists."""
    if not MODEL_FILE.exists():
        return None
    device = torch.device(device_str)
    model = build_model(hidden=hidden, trunk_layers=trunk_layers).to(device)
    try:
        model.load_state_dict(torch.load(MODEL_FILE, map_location=device))
        model.eval()
        return model
    except Exception:
        return None
