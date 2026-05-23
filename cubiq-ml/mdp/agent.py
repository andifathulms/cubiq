"""
Policy execution agents for the trained CubeNet.

greedy_solve — follows argmax(policy) at each step
mcts_solve   — MCTS guided by value + policy prior
"""
from __future__ import annotations
import math
import time
from collections import defaultdict

import numpy as np
import pycuber as pc

from mdp.env import CubeEnv, ACTION_SPACE, N_ACTIONS
from mdp.model import CubeNet
from mdp.state import _cube_to_state


def greedy_solve(
    model:     CubeNet,
    cube:      pc.Cube,
    env:       CubeEnv,
    max_moves: int = 50,
    device:    str = 'cpu',
) -> dict:
    """
    Follow the policy greedily (argmax) until solved or max_moves reached.
    Returns { moves, move_count, solved, time_ms }.
    """
    t0 = time.perf_counter()
    moves: list[str] = []
    current = cube

    for _ in range(max_moves):
        if env.is_solved(current):
            break
        state_vec = _cube_to_state(current)
        _, probs = model.predict(state_vec, device=device)
        action = int(probs.argmax())
        move = ACTION_SPACE[action]
        _, _, done, current = env.step(current, action)
        moves.append(move)
        if done:
            break

    solved = env.is_solved(current)
    return {
        'moves':      moves,
        'move_count': len(moves),
        'solved':     solved,
        'time_ms':    (time.perf_counter() - t0) * 1000,
    }


# ── MCTS ───────────────────────────────────────────────────────────────────────

class _MCTSNode:
    __slots__ = ('visits', 'value_sum', 'prior', 'children', 'cube')

    def __init__(self, cube: pc.Cube, prior: float = 0.0):
        self.cube      = cube
        self.prior     = prior
        self.visits    = 0
        self.value_sum = 0.0
        self.children: dict[int, _MCTSNode] = {}

    @property
    def q(self) -> float:
        return self.value_sum / self.visits if self.visits > 0 else 0.0

    def ucb(self, parent_visits: int, c_puct: float = 1.5) -> float:
        return -self.q + c_puct * self.prior * math.sqrt(parent_visits) / (1 + self.visits)


def mcts_solve(
    model:       CubeNet,
    cube:        pc.Cube,
    env:         CubeEnv,
    simulations: int = 200,
    max_moves:   int = 50,
    c_puct:      float = 1.5,
    device:      str = 'cpu',
) -> dict:
    """
    MCTS with network value + policy prior.
    At each real step, expand the tree from the current position, then pick
    the most-visited child action.
    """
    t0 = time.perf_counter()
    moves: list[str] = []
    current = cube

    for _ in range(max_moves):
        if env.is_solved(current):
            break

        root = _MCTSNode(current)
        # Initialise root children from policy prior
        state_vec = _cube_to_state(current)
        _, probs = model.predict(state_vec, device=device)
        for a, p in enumerate(probs):
            _, _, done, nc = env.step(current, a)
            root.children[a] = _MCTSNode(nc, prior=float(p))
            if done:
                # Solved in one move — take it immediately
                move = ACTION_SPACE[a]
                moves.append(move)
                return {
                    'moves':      moves,
                    'move_count': len(moves),
                    'solved':     True,
                    'time_ms':    (time.perf_counter() - t0) * 1000,
                }

        # Run simulations
        for _ in range(simulations):
            node = root
            path: list[_MCTSNode] = [node]

            # Selection
            while node.children and node.visits > 0:
                best_a = max(node.children, key=lambda a: node.children[a].ucb(node.visits, c_puct))
                node = node.children[best_a]
                path.append(node)

            # Expansion + evaluation
            sv = _cube_to_state(node.cube)
            value, probs = model.predict(sv, device=device)
            if not node.children:
                for a, p in enumerate(probs):
                    _, _, _, nc = env.step(node.cube, a)
                    node.children[a] = _MCTSNode(nc, prior=float(p))

            # Backprop (negative value = fewer moves = better)
            for n in reversed(path):
                n.visits    += 1
                n.value_sum += value

        # Pick most-visited child action
        best_action = max(root.children, key=lambda a: root.children[a].visits)
        move = ACTION_SPACE[best_action]
        moves.append(move)
        current = root.children[best_action].cube

    solved = env.is_solved(current)
    return {
        'moves':      moves,
        'move_count': len(moves),
        'solved':     solved,
        'time_ms':    (time.perf_counter() - t0) * 1000,
    }


def policy_distribution(
    model: CubeNet,
    cube:  pc.Cube,
    device: str = 'cpu',
) -> dict:
    """
    Return value estimate and per-move probabilities for the current state.
    Returns { value_estimate, moves: [{ move, prob }] }.
    """
    state_vec = _cube_to_state(cube)
    value, probs = model.predict(state_vec, device=device)
    return {
        'value_estimate': round(value, 3),
        'moves': [
            {'move': ACTION_SPACE[i], 'prob': round(float(probs[i]), 4)}
            for i in range(N_ACTIONS)
        ],
    }
