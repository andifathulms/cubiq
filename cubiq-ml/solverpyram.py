"""
Optimal Pyraminx solver via a complete God's-algorithm table.

Excluding the trivial tips, the Pyraminx core has 6 edges (even
permutations, even total flip) x 4 axial corners (orientation only, they
never permute): 360 * 32 * 81 = 933,120 states. The full space is BFS'd
once (God's number is 11, which the table must reproduce). Tips are
independent: each is fixed by at most one lowercase move appended after
the optimal core solution.

Move tables come from cubing.js's pyraminx kpuzzle (pyraminx_moves.json,
dumped by script — orbit convention: permutation[new] = old).
"""
from __future__ import annotations
import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

TABLES_DIR = Path(__file__).parent / 'tables'
TABLE_FILE = TABLES_DIR / 'distpyram.npy'
MOVES_JSON = Path(__file__).parent / 'pyraminx_moves.json'

CORE_MOVES = ['U', "U'", 'L', "L'", 'R', "R'", 'B', "B'"]
TIP_MOVES = ['u', 'l', 'r', 'b']

_raw = json.loads(MOVES_JSON.read_text())

# Edge sub-state: slot*2 + ori (12 values). TRANS_E[move][sub] -> sub
TRANS_E: Dict[str, np.ndarray] = {}
# Axial corners never permute: CDELTA[move][slot] = ori delta
CDELTA: Dict[str, np.ndarray] = {}
# Tip deltas (CORNERS2), for capital and lowercase moves
TDELTA: Dict[str, np.ndarray] = {}

for _m, _t in _raw.items():
    e = _t['EDGES']
    trans = np.zeros(12, dtype=np.int64)
    # permutation[new] = old: the piece at old slot s lands on new slot n
    inv = [0] * 6
    for n in range(6):
        inv[e['permutation'][n]] = n
    for s in range(6):
        for o in range(2):
            n = inv[s]
            trans[s * 2 + o] = n * 2 + (o + e['orientationDelta'][n]) % 2
    TRANS_E[_m] = trans
    c = _t['CORNERS']
    assert c['permutation'] == list(range(4)), f'axials must not permute ({_m})'
    CDELTA[_m] = np.array(c['orientationDelta'], dtype=np.int64)
    t2 = _t['CORNERS2']
    assert t2['permutation'] == list(range(4)), f'tips must not permute ({_m})'
    TDELTA[_m] = np.array(t2['orientationDelta'], dtype=np.int64)

_TRANS_E_STACK = np.stack([TRANS_E[m] for m in CORE_MOVES])
_CDELTA_STACK = np.stack([CDELTA[m] for m in CORE_MOVES])

N_INDEX = 720 * 32 * 81      # includes unreachable parity half
N_REACHABLE = 360 * 32 * 81  # 933,120


# ── Encoding ──────────────────────────────────────────────────────────────────

def _encode_batch(edges: np.ndarray, corners: np.ndarray) -> np.ndarray:
    """edges: (N,6) sub-states by piece; corners: (N,4) oris. -> (N,) index."""
    slots = edges // 2
    oris = edges % 2
    n = edges.shape[0]
    rank = np.zeros(n, dtype=np.int64)
    for i in range(6):
        smaller = np.zeros(n, dtype=np.int64)
        for j in range(i + 1, 6):
            smaller += (slots[:, j] < slots[:, i])
        rank = rank * (6 - i) + smaller
    flip = np.zeros(n, dtype=np.int64)
    for i in range(5):
        flip = flip * 2 + oris[:, i]
    tw = np.zeros(n, dtype=np.int64)
    for i in range(4):
        tw = tw * 3 + corners[:, i]
    return (rank * 32 + flip) * 81 + tw


_SOLVED_E = np.array([i * 2 for i in range(6)], dtype=np.int64)
_SOLVED_C = np.zeros(4, dtype=np.int64)


def _build_table() -> np.ndarray:
    dist = np.full(N_INDEX, 255, dtype=np.uint8)
    fe = _SOLVED_E[None, :]
    fc = _SOLVED_C[None, :]
    dist[_encode_batch(fe, fc)[0]] = 0
    d = 0
    while fe.shape[0]:
        ce, cc = [], []
        for mi in range(len(CORE_MOVES)):
            ce.append(_TRANS_E_STACK[mi][fe])
            cc.append((fc + _CDELTA_STACK[mi]) % 3)
        alle = np.concatenate(ce, axis=0)
        allc = np.concatenate(cc, axis=0)
        codes = _encode_batch(alle, allc)
        order = np.argsort(codes, kind='stable')
        cs = codes[order]
        keep = np.ones(cs.shape[0], dtype=bool)
        keep[1:] = cs[1:] != cs[:-1]
        uniq = order[keep]
        new = dist[codes[uniq]] == 255
        uniq = uniq[new]
        dist[codes[uniq]] = d + 1
        fe, fc = alle[uniq], allc[uniq]
        d += 1
    return dist


_DIST: Optional[np.ndarray] = None


def get_table() -> np.ndarray:
    global _DIST
    if _DIST is not None:
        return _DIST
    TABLES_DIR.mkdir(exist_ok=True)
    if TABLE_FILE.exists():
        _DIST = np.load(TABLE_FILE)
    else:
        _DIST = _build_table()
        np.save(TABLE_FILE, _DIST)
    return _DIST


# ── Scramble parsing ──────────────────────────────────────────────────────────

def _normalize(move: str) -> List[str]:
    """Pyraminx moves have order 3: X2 == X'."""
    if move.endswith('2'):
        return [move[0] + "'"]
    return [move]


def state_from_scramble(scramble: str) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    edges = _SOLVED_E.copy()
    corners = _SOLVED_C.copy()
    tips = np.zeros(4, dtype=np.int64)
    for tok in scramble.split():
        if not tok:
            continue
        for move in _normalize(tok):
            if move not in _raw:
                raise ValueError(f'unsupported pyraminx move {tok!r}')
            if move[0] in 'ULRB':
                edges = TRANS_E[move][edges]
                corners = (corners + CDELTA[move]) % 3
            tips = (tips + TDELTA[move]) % 3
    return edges, corners, tips


def _tip_fixes(tips: np.ndarray) -> List[str]:
    fixes = []
    for tm in TIP_MOVES:
        delta = TDELTA[tm]
        slot = int(np.argmax(delta != 0))
        o = int(tips[slot])
        if o == 0:
            continue
        d = int(delta[slot])
        # need o + k*d = 0 mod 3 with k in {1, 2}; k=2 means the inverse move
        k = next(k for k in (1, 2) if (o + k * d) % 3 == 0)
        fixes.append(tm if k == 1 else tm + "'")
    return fixes


# ── Solve ─────────────────────────────────────────────────────────────────────

def _find_optimal(edges: np.ndarray, corners: np.ndarray,
                  dist: np.ndarray, limit: int) -> List[List[str]]:
    solutions: List[List[str]] = []
    path: List[str] = []

    def dfs(e: np.ndarray, c: np.ndarray):
        if len(solutions) >= limit:
            return
        h = dist[_encode_batch(e[None, :], c[None, :])[0]]
        if h == 0:
            solutions.append(list(path))
            return
        for m in CORE_MOVES:
            ne = TRANS_E[m][e]
            nc = (c + CDELTA[m]) % 3
            if dist[_encode_batch(ne[None, :], nc[None, :])[0]] == h - 1:
                path.append(m)
                dfs(ne, nc)
                path.pop()
                if len(solutions) >= limit:
                    return

    dfs(edges, corners)
    return solutions


def solve_pyram(scramble: str, max_alternatives: int = 3) -> dict:
    """Optimal Pyraminx solution: core (<= 11 moves, God's number) + tips."""
    dist = get_table()
    edges, corners, tips = state_from_scramble(scramble)
    sols = _find_optimal(edges, corners, dist, max_alternatives)

    results = []
    for sol in sols:
        t = tips.copy()
        for m in sol:
            t = (t + TDELTA[m]) % 3
        results.append(sol + _tip_fixes(t))
    moves = results[0] if results else []
    return {
        'moves': moves,
        'move_count': len(moves),
        'alternatives': results[1:],
        'optimal': True,
    }
