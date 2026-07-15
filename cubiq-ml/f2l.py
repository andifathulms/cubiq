"""
F2L pair / x-cross solver (Phase A of the CFOP pipeline).

Everything here is canonicalized to the D face: callers remap the scramble
through the face's rotation prefix (see solver.FACE_ROTATION / _ROT_MAP),
solve as if the cross face were D, and the resulting moves are already
expressed in the post-rotation frame.

Piece tracking:
  - Edges reuse solver.SUB_TRANS: sub-state = slot*2 + ori (24 values).
  - Corners get an equivalent 24-value sub-state (slot*3 + ori, 8 slots x 3
    orientations). Corner move tables are derived from pycuber at import time
    (measured, not hand-typed) using the Kociemba orientation convention:
    ori = index of the U/D-coloured sticker within the slot's face order.

Search:
  - IDA* over the full F2L state (4 cross edges + 4 pair edges + 4 pair
    corners), goal = cross + a chosen subset of pairs solved.
  - Heuristic: max over every piece that must end solved of the EXACT
    "cross + that piece" distance (tables over 24^4 x 24 = 7.9M states,
    built once with vectorized BFS and cached on disk). Each such table is
    admissible for the joint goal, so their max is admissible: solutions
    are optimal.
"""
from __future__ import annotations
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

from solver import (
    ALL_MOVES, MOVE_TABLES, SUB_TRANS, FACE_ROTATION, _ROT_MAP,
    N_STATES as N_CROSS,
)

TABLES_DIR = Path(__file__).parent / 'tables'

# Kociemba-convention corner slots and face orders (UD face first, then the
# two side faces in the order that makes orientation deltas well-defined).
CORNER_SLOTS = ['UFR', 'UFL', 'UBL', 'UBR', 'DFR', 'DFL', 'DBL', 'DBR']
_CORNER_FACE_ORDER: Dict[str, Tuple[str, str, str]] = {
    'UFR': ('U', 'R', 'F'), 'UFL': ('U', 'F', 'L'),
    'UBL': ('U', 'L', 'B'), 'UBR': ('U', 'B', 'R'),
    'DFR': ('D', 'F', 'R'), 'DFL': ('D', 'L', 'F'),
    'DBL': ('D', 'B', 'L'), 'DBR': ('D', 'R', 'B'),
}
_UD_COLORS = {'y', 'w'}   # pycuber: y = U, w = D

# Edge slot indices follow cubing.js order (see solver.FACE_CROSS):
# UF=0 UR=1 UB=2 UL=3 DF=4 DR=5 DB=6 DL=7 FR=8 FL=9 BR=10 BL=11
EDGE_SLOT_NAMES = ['UF', 'UR', 'UB', 'UL', 'DF', 'DR', 'DB', 'DL',
                   'FR', 'FL', 'BR', 'BL']
D_CROSS_EDGES = (4, 5, 6, 7)

# D-face F2L pairs: slot name -> (corner index, edge index)
F2L_PAIRS: Dict[str, Tuple[int, int]] = {
    'FR': (CORNER_SLOTS.index('DFR'), 8),
    'FL': (CORNER_SLOTS.index('DFL'), 9),
    'BR': (CORNER_SLOTS.index('DBR'), 10),
    'BL': (CORNER_SLOTS.index('DBL'), 11),
}
PAIR_NAMES = list(F2L_PAIRS.keys())
PAIR_LIST = list(F2L_PAIRS.values())
D_CROSS_SOLVED = sum((D_CROSS_EDGES[i] * 2) * 24 ** i for i in range(4))

MOVE_INDEX = {m: i for i, m in enumerate(ALL_MOVES)}
MOVE_FACE = {m: 'UDFBRL'.index(m[0]) for m in ALL_MOVES}


# ── Corner move tables (derived from pycuber) ─────────────────────────────────

def _measure_corner(cube, slot: str) -> Tuple[int, int]:
    """Return (piece_home_index, orientation) of the piece at `slot`."""
    piece = cube[slot]
    colors = frozenset(str(sq).strip('[]') for _, sq in piece)
    home = _CORNER_COLORSETS[colors]
    order = _CORNER_FACE_ORDER[slot]
    for face, sq in piece:
        if str(sq).strip('[]') in _UD_COLORS:
            return home, order.index(face)
    raise ValueError(f'corner at {slot} has no U/D sticker')


def _build_corner_trans() -> np.ndarray:
    """CORNER_TRANS[move_idx][slot*3+ori] = sub-state after the move."""
    import pycuber as pc
    trans = np.zeros((len(ALL_MOVES), 24), dtype=np.int64)
    for mi, move in enumerate(ALL_MOVES):
        c = pc.Cube()
        c(pc.Formula(move))
        for si, slot in enumerate(CORNER_SLOTS):
            home, delta = _measure_corner(c, slot)
            for o in range(3):
                trans[mi][home * 3 + o] = si * 3 + ((o + delta) % 3)
    return trans


def _init_corner_colorsets():
    import pycuber as pc
    ref = pc.Cube()
    sets = {}
    for i, slot in enumerate(CORNER_SLOTS):
        colors = frozenset(str(sq).strip('[]') for _, sq in ref[slot])
        sets[colors] = i
    return sets


_CORNER_COLORSETS = _init_corner_colorsets()
CORNER_TRANS = _build_corner_trans()


# ── Scramble → piece sub-states ───────────────────────────────────────────────

def scramble_to_substates(scramble: str) -> Tuple[List[int], List[int]]:
    """Return (edge_subs[12], corner_subs[8]) — sub-state of each piece
    (indexed by home slot) after applying the scramble to a solved cube."""
    edge_subs = [s * 2 for s in range(12)]
    corner_subs = [s * 3 for s in range(8)]
    for move in scramble.split():
        if move not in MOVE_INDEX:
            continue
        mi = MOVE_INDEX[move]
        et, ct = SUB_TRANS[mi], CORNER_TRANS[mi]
        edge_subs = [int(et[s]) for s in edge_subs]
        corner_subs = [int(ct[s]) for s in corner_subs]
    return edge_subs, corner_subs


def remap_scramble(scramble: str, face: str) -> str:
    """Remap a scramble so the given cross face becomes D (conjugation by
    the face's rotation prefix)."""
    rotation = FACE_ROTATION[face]
    mapping = _ROT_MAP[rotation]
    out = []
    for m in scramble.split():
        if m and m[0] in 'UDFBRL':
            out.append(mapping.get(m[0], m[0]) + m[1:])
        else:
            out.append(m)
    return ' '.join(out)


# ── Exact "cross + one piece" distance tables ─────────────────────────────────
# Index = crossIdx + 331776 * piece_substate  (7,962,624 states, uint8)

def _cross_neighbors(cross_idx: np.ndarray, trans: np.ndarray) -> np.ndarray:
    s0 = cross_idx % 24
    s1 = (cross_idx // 24) % 24
    s2 = (cross_idx // 576) % 24
    s3 = (cross_idx // 13824) % 24
    return trans[s0] + 24 * trans[s1] + 576 * trans[s2] + 13824 * trans[s3]


def _build_piece_table(piece_trans: np.ndarray, piece_home_sub: int) -> np.ndarray:
    """BFS the (D-cross x piece) product space from solved."""
    n = N_CROSS * 24
    dist = np.full(n, 255, dtype=np.uint8)
    cross_solved = sum((D_CROSS_EDGES[i] * 2) * 24 ** i for i in range(4))
    start = cross_solved + N_CROSS * piece_home_sub
    dist[start] = 0
    frontier = np.array([start], dtype=np.int64)
    d = 0
    while frontier.size:
        cross_idx = frontier % N_CROSS
        piece_sub = frontier // N_CROSS
        nxt = []
        for mi in range(len(ALL_MOVES)):
            nc = _cross_neighbors(cross_idx, SUB_TRANS[mi])
            np_sub = piece_trans[mi][piece_sub]
            nxt.append(nc + N_CROSS * np_sub)
        cand = np.unique(np.concatenate(nxt))
        cand = cand[dist[cand] == 255]
        dist[cand] = d + 1
        frontier = cand
        d += 1
    return dist


_PIECE_TABLES: Dict[str, np.ndarray] = {}


def _get_piece_table(kind: str, index: int) -> np.ndarray:
    """kind: 'corner' or 'edge'; index: home slot of the tracked piece."""
    key = f'{kind}{index}'
    if key in _PIECE_TABLES:
        return _PIECE_TABLES[key]
    TABLES_DIR.mkdir(exist_ok=True)
    path = TABLES_DIR / f'dcross_{key}.npy'
    if path.exists():
        table = np.load(path)
    else:
        if kind == 'corner':
            table = _build_piece_table(CORNER_TRANS, index * 3)
        else:
            table = _build_piece_table(SUB_TRANS, index * 2)
        np.save(path, table)
    _PIECE_TABLES[key] = table
    return table


def warm_tables():
    """Build/load all 8 pair tables (call at startup or lazily)."""
    for corner_i, edge_i in F2L_PAIRS.values():
        _get_piece_table('corner', corner_i)
        _get_piece_table('edge', edge_i)


# ── F2L state and IDA* ────────────────────────────────────────────────────────

class F2LState:
    """Tracks the 8 edges and 4 corners relevant to D-face F2L."""
    __slots__ = ('cross', 'pair_edges', 'pair_corners')

    def __init__(self, cross: int, pair_edges: Tuple[int, ...], pair_corners: Tuple[int, ...]):
        self.cross = cross                # encoded 4 D-cross edges (base 24)
        self.pair_edges = pair_edges      # sub-state of edges FR, FL, BR, BL
        self.pair_corners = pair_corners  # sub-state of corners DFR, DFL, DBL, DBR

    @staticmethod
    def from_scramble(scramble: str) -> 'F2LState':
        edge_subs, corner_subs = scramble_to_substates(scramble)
        cross = sum(edge_subs[D_CROSS_EDGES[i]] * 24 ** i for i in range(4))
        pair_edges = tuple(edge_subs[e] for _, e in F2L_PAIRS.values())
        pair_corners = tuple(corner_subs[c] for c, _ in F2L_PAIRS.values())
        return F2LState(cross, pair_edges, pair_corners)

    def apply(self, mi: int) -> 'F2LState':
        et, ct = SUB_TRANS[mi], CORNER_TRANS[mi]
        s = self.cross
        cross = int(et[s % 24]) + 24 * int(et[(s // 24) % 24]) \
            + 576 * int(et[(s // 576) % 24]) + 13824 * int(et[(s // 13824) % 24])
        return F2LState(
            cross,
            tuple(int(et[e]) for e in self.pair_edges),
            tuple(int(ct[c]) for c in self.pair_corners),
        )

    def key(self) -> tuple:
        return (self.cross, self.pair_edges, self.pair_corners)

    def pair_solved(self, pair_idx: int) -> bool:
        corner_i, edge_i = PAIR_LIST[pair_idx]
        return (self.pair_edges[pair_idx] == edge_i * 2
                and self.pair_corners[pair_idx] == corner_i * 3)

    def cross_solved(self) -> bool:
        return self.cross == D_CROSS_SOLVED


def _heuristic(state: F2LState, targets: Sequence[int]) -> int:
    """Max over target pairs of the exact cross+piece distances (admissible)."""
    h = 0
    for pi in targets:
        corner_i, edge_i = PAIR_LIST[pi]
        tc = _PIECE_TABLES.get(f'corner{corner_i}')
        te = _PIECE_TABLES.get(f'edge{edge_i}')
        if tc is None:
            tc = _get_piece_table('corner', corner_i)
        if te is None:
            te = _get_piece_table('edge', edge_i)
        hc = tc[state.cross + N_CROSS * state.pair_corners[pi]]
        he = te[state.cross + N_CROSS * state.pair_edges[pi]]
        h = max(h, int(hc), int(he))
    if h == 0 and not _goal(state, targets):
        h = 1
    return h


def _goal(state: F2LState, targets: Sequence[int]) -> bool:
    return state.cross_solved() and all(state.pair_solved(p) for p in targets)


def solve_pairs(
    state: F2LState,
    targets: Sequence[int],
    max_depth: int = 14,
    max_solutions: int = 2,
) -> List[List[str]]:
    """
    IDA* to solve cross + `targets` pairs from `state` (cross and any other
    already-solved pairs in `targets` must be preserved — they are part of
    the goal). Returns up to max_solutions optimal move sequences.
    """
    solutions: List[List[str]] = []
    path: List[str] = []

    def dfs(s: F2LState, depth: int, bound: int, last_face: int) -> None:
        if len(solutions) >= max_solutions:
            return
        h = _heuristic(s, targets)
        if depth + h > bound:
            return
        if h == 0 and _goal(s, targets):
            solutions.append(list(path))
            return
        for mi, move in enumerate(ALL_MOVES):
            if MOVE_FACE[move] == last_face:
                continue
            path.append(move)
            dfs(s.apply(mi), depth + 1, bound, MOVE_FACE[move])
            path.pop()
            if len(solutions) >= max_solutions:
                return

    for bound in range(max_depth + 1):
        dfs(state, 0, bound, -1)
        if solutions:
            return solutions
    return solutions


def apply_moves(state: F2LState, moves: Sequence[str]) -> F2LState:
    for m in moves:
        state = state.apply(MOVE_INDEX[m])
    return state
