"""
Optimal Skewb solver via a complete God's-algorithm table.

The Skewb has 3,149,280 reachable positions (8 corners in two tetrads +
6 centers) under the 8 WCA moves (U L R B, order 3). The full reachable
set is BFS'd once from solved; because the naive index space (8! * 3^8 *
6! ~ 1.9e11) is sparse, the table is stored as a sorted key array with a
parallel distance array and searchsorted lookups (~28MB, disk-cached).

Solutions are gradient walks — provably optimal (God's number is 11,
which the table must reproduce). Center orientation is invisible and
ignored. Move tables come from cubing.js (skewb_moves.json).
"""
from __future__ import annotations
import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

TABLES_DIR = Path(__file__).parent / 'tables'
KEYS_FILE = TABLES_DIR / 'skewb_keys.npy'
DIST_FILE = TABLES_DIR / 'skewb_dist.npy'
MOVES_JSON = Path(__file__).parent / 'skewb_moves.json'

MOVES = ['U', "U'", 'L', "L'", 'R', "R'", 'B', "B'"]
N_REACHABLE = 3_149_280

_raw = json.loads(MOVES_JSON.read_text())

# corner sub-state (slot*3+ori, 24) map and center slot map per move
CTRANS: Dict[str, np.ndarray] = {}
CENMAP: Dict[str, np.ndarray] = {}
for _m, _t in _raw.items():
    c = _t['CORNERS']
    inv = [0] * 8
    for new in range(8):
        inv[c['permutation'][new]] = new
    t = np.zeros(24, dtype=np.int64)
    for s in range(8):
        for o in range(3):
            new = inv[s]
            t[s * 3 + o] = new * 3 + (o + c['orientationDelta'][new]) % 3
    CTRANS[_m] = t
    cen = _t['CENTERS']
    cinv = np.zeros(6, dtype=np.int64)
    for new in range(6):
        cinv[cen['permutation'][new]] = new
    CENMAP[_m] = cinv   # piece at slot s -> slot CENMAP[s]

_CTRANS_STACK = np.stack([CTRANS[m] for m in MOVES])
_CENMAP_STACK = np.stack([CENMAP[m] for m in MOVES])

_SOLVED_C = np.array([i * 3 for i in range(8)], dtype=np.int64)
_SOLVED_CEN = np.arange(6, dtype=np.int64)


# ── Encoding: corner Lehmer(8!) x ori(3^8) x center Lehmer(6!) ───────────────

def _encode_batch(corners: np.ndarray, centers: np.ndarray) -> np.ndarray:
    n = corners.shape[0]
    slots = corners // 3
    oris = corners % 3
    crank = np.zeros(n, dtype=np.int64)
    for i in range(8):
        smaller = np.zeros(n, dtype=np.int64)
        for j in range(i + 1, 8):
            smaller += (slots[:, j] < slots[:, i])
        crank = crank * (8 - i) + smaller
    ori = np.zeros(n, dtype=np.int64)
    for i in range(8):
        ori = ori * 3 + oris[:, i]
    cenrank = np.zeros(n, dtype=np.int64)
    for i in range(6):
        smaller = np.zeros(n, dtype=np.int64)
        for j in range(i + 1, 6):
            smaller += (centers[:, j] < centers[:, i])
        cenrank = cenrank * (6 - i) + smaller
    return (crank * 6561 + ori) * 720 + cenrank


def _build_table() -> Tuple[np.ndarray, np.ndarray]:
    fc = _SOLVED_C[None, :]
    fcen = _SOLVED_CEN[None, :]
    keys = _encode_batch(fc, fcen)
    dists = np.zeros(1, dtype=np.uint8)
    d = 0
    while fc.shape[0]:
        cand_c, cand_cen = [], []
        for mi in range(len(MOVES)):
            cand_c.append(_CTRANS_STACK[mi][fc])
            cand_cen.append(_CENMAP_STACK[mi][fcen])
        allc = np.concatenate(cand_c, axis=0)
        allcen = np.concatenate(cand_cen, axis=0)
        codes = _encode_batch(allc, allcen)
        order = np.argsort(codes, kind='stable')
        cs = codes[order]
        keep = np.ones(cs.shape[0], dtype=bool)
        keep[1:] = cs[1:] != cs[:-1]
        uniq = order[keep]
        # drop already-known states
        pos = np.searchsorted(keys, codes[uniq])
        pos_c = np.clip(pos, 0, len(keys) - 1)
        new_mask = keys[pos_c] != codes[uniq]
        uniq = uniq[new_mask]
        if uniq.shape[0] == 0:
            break
        new_keys = codes[uniq]
        merged = np.concatenate([keys, new_keys])
        merged_d = np.concatenate([dists, np.full(len(new_keys), d + 1, dtype=np.uint8)])
        order2 = np.argsort(merged, kind='stable')
        keys, dists = merged[order2], merged_d[order2]
        fc, fcen = allc[uniq], allcen[uniq]
        d += 1
    return keys, dists


_KEYS: Optional[np.ndarray] = None
_DIST: Optional[np.ndarray] = None


def get_table() -> Tuple[np.ndarray, np.ndarray]:
    global _KEYS, _DIST
    if _KEYS is not None:
        return _KEYS, _DIST
    TABLES_DIR.mkdir(exist_ok=True)
    if KEYS_FILE.exists() and DIST_FILE.exists():
        _KEYS, _DIST = np.load(KEYS_FILE), np.load(DIST_FILE)
    else:
        _KEYS, _DIST = _build_table()
        np.save(KEYS_FILE, _KEYS)
        np.save(DIST_FILE, _DIST)
    return _KEYS, _DIST


def _lookup(keys: np.ndarray, dists: np.ndarray, code: int) -> Optional[int]:
    pos = int(np.searchsorted(keys, code))
    if pos >= len(keys) or keys[pos] != code:
        return None
    return int(dists[pos])


# ── Scramble / solve ──────────────────────────────────────────────────────────

def _normalize(move: str) -> List[str]:
    if move.endswith('2'):
        return [move[0] + "'"]     # order-3 moves: X2 == X'
    return [move]


def state_from_scramble(scramble: str) -> Tuple[np.ndarray, np.ndarray]:
    corners = _SOLVED_C.copy()
    centers = _SOLVED_CEN.copy()
    for tok in scramble.split():
        if not tok:
            continue
        for move in _normalize(tok):
            if move not in CTRANS:
                raise ValueError(f'unsupported skewb move {tok!r}')
            corners = CTRANS[move][corners]
            centers = CENMAP[move][centers]
    return corners, centers


def _find_optimal(corners: np.ndarray, centers: np.ndarray,
                  keys: np.ndarray, dists: np.ndarray, limit: int) -> List[List[str]]:
    solutions: List[List[str]] = []
    path: List[str] = []

    def dist_of(c, cen) -> Optional[int]:
        return _lookup(keys, dists, int(_encode_batch(c[None, :], cen[None, :])[0]))

    def dfs(c: np.ndarray, cen: np.ndarray):
        if len(solutions) >= limit:
            return
        h = dist_of(c, cen)
        if h == 0:
            solutions.append(list(path))
            return
        for m in MOVES:
            nc = CTRANS[m][c]
            ncen = CENMAP[m][cen]
            if dist_of(nc, ncen) == h - 1:
                path.append(m)
                dfs(nc, ncen)
                path.pop()
                if len(solutions) >= limit:
                    return

    dfs(corners, centers)
    return solutions


def solve_skewb(scramble: str, max_alternatives: int = 3) -> dict:
    """Optimal Skewb solution (<= 11 moves, God's number)."""
    keys, dists = get_table()
    corners, centers = state_from_scramble(scramble)
    code = int(_encode_batch(corners[None, :], centers[None, :])[0])
    if _lookup(keys, dists, code) is None:
        raise ValueError('unreachable skewb state (bad scramble?)')
    sols = _find_optimal(corners, centers, keys, dists, max_alternatives)
    moves = sols[0] if sols else []
    return {
        'moves': moves,
        'move_count': len(moves),
        'alternatives': sols[1:],
        'optimal': True,
    }
