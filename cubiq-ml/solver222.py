"""
Optimal 2x2 solver via a complete God's-algorithm table.

A 2x2 is the 8 corners of a 3x3. Fixing the DBL corner kills whole-cube
rotation symmetry, leaving 7! * 3^6 = 3,674,160 states — small enough to
BFS exhaustively (moves U/R/F never touch the DBL slot). The resulting
distance table is exact, so solving is a gradient walk: every solution is
optimal (God's number for 2x2 is 11 HTM, which the table reproduces — a
strong self-check), and alternatives are enumerable.

Scrambles may use any face: the state is canonicalized by the whole-cube
rotation that sends the DBL piece home, solved in that frame with U/R/F,
and the solution's face letters are mapped back to the original frame — so
the output needs no rotation prefix.

Corner move tables are the pycuber-measured ones from f2l.py.
"""
from __future__ import annotations
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

from f2l import CORNER_TRANS, CORNER_SLOTS, MOVE_INDEX

TABLES_DIR = Path(__file__).parent / 'tables'
TABLE_FILE = TABLES_DIR / 'dist222.npy'

FIXED_SLOT = CORNER_SLOTS.index('DBL')       # 6 — never moved by U/R/F
MOVES_222 = ['U', "U'", 'U2', 'R', "R'", 'R2', 'F', "F'", 'F2']

# Movable slots (all but DBL) compressed to 0..6
_SLOT7 = [s for s in range(8) if s != FIXED_SLOT]
_SLOT7_INDEX = {s: i for i, s in enumerate(_SLOT7)}
N_STATES = 5040 * 729   # 7! * 3^6

# sub7 = slot7*3 + ori (0..20); TRANS7[move][sub7] -> sub7
TRANS7: Dict[str, np.ndarray] = {}
for _m in MOVES_222:
    full = CORNER_TRANS[MOVE_INDEX[_m]]
    t = np.zeros(21, dtype=np.int64)
    for _s7, _slot in enumerate(_SLOT7):
        for _o in range(3):
            nxt = int(full[_slot * 3 + _o])
            t[_s7 * 3 + _o] = _SLOT7_INDEX[nxt // 3] * 3 + nxt % 3
    TRANS7[_m] = t

_TRANS7_STACK = np.stack([TRANS7[m] for m in MOVES_222])


# ── Whole-cube rotations on corner sub-states (for canonicalization) ─────────

def _compose(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Apply b then a (both 24-entry corner sub-state maps)."""
    return a[b]

_ID24 = np.arange(24, dtype=np.int64)
_BASE_ROT_TRANS = {
    # disjoint layer pairs commute: x = R L', y = U D', z = F B'
    'x': _compose(CORNER_TRANS[MOVE_INDEX['R']], CORNER_TRANS[MOVE_INDEX["L'"]]),
    'y': _compose(CORNER_TRANS[MOVE_INDEX['U']], CORNER_TRANS[MOVE_INDEX["D'"]]),
    'z': _compose(CORNER_TRANS[MOVE_INDEX['F']], CORNER_TRANS[MOVE_INDEX["B'"]]),
}
# face-content -> position maps for the base rotations
_BASE_FACE_MAP = {
    'x': {'F': 'U', 'U': 'B', 'B': 'D', 'D': 'F', 'R': 'R', 'L': 'L'},
    'y': {'R': 'F', 'F': 'L', 'L': 'B', 'B': 'R', 'U': 'U', 'D': 'D'},
    'z': {'U': 'R', 'R': 'D', 'D': 'L', 'L': 'U', 'F': 'F', 'B': 'B'},
}

# All 24 rotations: (corner sub-state map, face map)
ROTATIONS: List[Tuple[np.ndarray, Dict[str, str]]] = []
_seen_rot = set()
_frontier = [(_ID24, {f: f for f in 'UDFBRL'})]
while _frontier:
    nxt = []
    for trans, fmap in _frontier:
        key = tuple(trans.tolist())
        if key in _seen_rot:
            continue
        _seen_rot.add(key)
        ROTATIONS.append((trans, fmap))
        for ax in 'xyz':
            nt = _compose(_BASE_ROT_TRANS[ax], trans)
            nf = {f: _BASE_FACE_MAP[ax][fmap[f]] for f in 'UDFBRL'}
            nxt.append((nt, nf))
    _frontier = nxt
assert len(ROTATIONS) == 24


# ── State encoding: Lehmer rank of the 7-permutation * 729 + base-3 ori ──────

def _encode_batch(subs: np.ndarray) -> np.ndarray:
    """subs: (N, 7) sub-states indexed by piece. Returns (N,) state indices."""
    slots = subs // 3          # (N,7) — permutation: piece i sits in slots[:,i]
    oris = subs % 3
    n = subs.shape[0]
    # Lehmer rank of each row's permutation
    rank = np.zeros(n, dtype=np.int64)
    for i in range(7):
        smaller = np.zeros(n, dtype=np.int64)
        for j in range(i + 1, 7):
            smaller += (slots[:, j] < slots[:, i])
        rank = rank * (7 - i) + smaller
    # orientation of the first 6 pieces (7th is determined mod 3)
    ori = np.zeros(n, dtype=np.int64)
    for i in range(6):
        ori = ori * 3 + oris[:, i]
    return rank * 729 + ori


_SOLVED7 = np.array([i * 3 for i in range(7)], dtype=np.int64)


def _build_table() -> np.ndarray:
    dist = np.full(N_STATES, 255, dtype=np.uint8)
    frontier = _SOLVED7[None, :]
    dist[_encode_batch(frontier)[0]] = 0
    d = 0
    while frontier.shape[0]:
        candidates = []
        for t in _TRANS7_STACK:
            candidates.append(t[frontier])
        allc = np.concatenate(candidates, axis=0)
        codes = _encode_batch(allc)
        order = np.argsort(codes, kind='stable')
        codes_sorted = codes[order]
        keep_mask = np.ones(codes_sorted.shape[0], dtype=bool)
        keep_mask[1:] = codes_sorted[1:] != codes_sorted[:-1]
        uniq_idx = order[keep_mask]
        new_mask = dist[codes[uniq_idx]] == 255
        uniq_idx = uniq_idx[new_mask]
        dist[codes[uniq_idx]] = d + 1
        frontier = allc[uniq_idx]
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


# ── Scramble -> canonical state ───────────────────────────────────────────────

def _corner_state_from_scramble(scramble: str) -> np.ndarray:
    """corner_subs[piece] = slot*3 + ori (8 pieces, full 18-move tables)."""
    subs = np.array([s * 3 for s in range(8)], dtype=np.int64)
    for move in scramble.split():
        if not move:
            continue
        if move not in MOVE_INDEX:
            raise ValueError(f'unsupported move {move!r} for 2x2')
        subs = CORNER_TRANS[MOVE_INDEX[move]][subs]
    return subs


def _canonicalize(subs: np.ndarray) -> Tuple[np.ndarray, Dict[str, str]]:
    """Rotate so the DBL piece is home. Returns (7-piece sub-states indexed
    by piece with DBL dropped, face map of the rotation used)."""
    for trans, fmap in ROTATIONS:
        rotated = trans[subs]
        if rotated[FIXED_SLOT] == FIXED_SLOT * 3:
            pieces = [p for p in range(8) if p != FIXED_SLOT]
            out = np.array(
                [_SLOT7_INDEX[int(rotated[p]) // 3] * 3 + int(rotated[p]) % 3 for p in pieces],
                dtype=np.int64,
            )
            return out, fmap
    raise RuntimeError('no rotation homes the DBL corner (invalid state)')


# ── Solve ─────────────────────────────────────────────────────────────────────

def _find_optimal(state7: np.ndarray, dist: np.ndarray, limit: int) -> List[List[str]]:
    solutions: List[List[str]] = []
    path: List[str] = []

    def dfs(s: np.ndarray):
        if len(solutions) >= limit:
            return
        h = dist[_encode_batch(s[None, :])[0]]
        if h == 0:
            solutions.append(list(path))
            return
        for m in MOVES_222:
            ns = TRANS7[m][s]
            if dist[_encode_batch(ns[None, :])[0]] == h - 1:
                path.append(m)
                dfs(ns)
                path.pop()
                if len(solutions) >= limit:
                    return

    dfs(state7)
    return solutions


def solve_222(scramble: str, max_alternatives: int = 3) -> dict:
    """Optimal 2x2 solution (<= 11 moves). Moves are already in the original
    frame — no rotation prefix needed."""
    dist = get_table()
    subs = _corner_state_from_scramble(scramble)
    state7, fmap = _canonicalize(subs)
    # canonical-frame face c corresponds to original-frame face inv(fmap)[c]
    inv = {v: k for k, v in fmap.items()}
    sols = _find_optimal(state7, dist, max_alternatives)
    remapped = [[inv[m[0]] + m[1:] for m in sol] for sol in sols]
    moves = remapped[0] if remapped else []
    return {
        'moves': moves,
        'move_count': len(moves),
        'alternatives': remapped[1:],
        'optimal': True,
    }
