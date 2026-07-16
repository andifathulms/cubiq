"""
Megaminx engine: piece model driven by cubing.js kpuzzle tables.

Orbits: EDGES (30, flip), CORNERS (20, twist), CENTERS (12, position —
orientation is invisible). Face moves never touch centers; the WCA
scramble moves R++/D++ permute them, leaving the puzzle in a rotated
frame. States are canonicalized by the (60-element) rotation group:
find the rotation that restores centers, apply it to edges/corners, and
translate solution face letters back by conjugation matching.

State arrays are indexed BY PIECE: edges[piece] = slot*2 + flip,
corners[piece] = slot*3 + twist.
"""
from __future__ import annotations
import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

MOVES_JSON = Path(__file__).parent / 'megaminx_moves.json'
_raw = json.loads(MOVES_JSON.read_text())

FACES = ['U', 'F', 'L', 'BL', 'BR', 'R', 'D', 'B', 'DR', 'DL', 'FR', 'FL']
AMOUNTS = ['', '2', "'", "2'"]
FACE_MOVES = [f + a for f in FACES for a in AMOUNTS]           # 48
SCRAMBLE_MOVES = ['R++', 'R--', 'D++', 'D--']
N_EDGES, N_CORNERS = 30, 20


def _subtrans(entry: dict, n: int, o: int) -> np.ndarray:
    """kpuzzle orbit entry -> sub-state map (sub = slot*o + ori)."""
    perm = entry['permutation']     # perm[new] = old
    delta = entry['orientationDelta']
    inv = [0] * n
    for new in range(n):
        inv[perm[new]] = new
    t = np.zeros(n * o, dtype=np.int64)
    for s in range(n):
        for r in range(o):
            new = inv[s]
            t[s * o + r] = new * o + (r + delta[new]) % o
    return t


ETRANS: Dict[str, np.ndarray] = {}
CTRANS: Dict[str, np.ndarray] = {}
CENPERM: Dict[str, np.ndarray] = {}   # centers: new_pos_of[old_slot]
for _m, _t in _raw.items():
    ETRANS[_m] = _subtrans(_t['EDGES'], 30, 2)
    CTRANS[_m] = _subtrans(_t['CORNERS'], 20, 3)
    perm = _t['CENTERS']['permutation']
    inv = np.zeros(12, dtype=np.int64)
    for new in range(12):
        inv[perm[new]] = new
    CENPERM[_m] = inv

for _f in FACES:
    assert np.array_equal(CENPERM[_f], np.arange(12)), f'{_f} must fix centers'

SOLVED_E = np.array([i * 2 for i in range(30)], dtype=np.int64)
SOLVED_C = np.array([i * 3 for i in range(20)], dtype=np.int64)
SOLVED_CEN = np.arange(12, dtype=np.int64)


class MegaState:
    __slots__ = ('edges', 'corners', 'centers')

    def __init__(self, edges=None, corners=None, centers=None):
        self.edges = SOLVED_E.copy() if edges is None else edges
        self.corners = SOLVED_C.copy() if corners is None else corners
        self.centers = SOLVED_CEN.copy() if centers is None else centers

    def apply(self, moves) -> 'MegaState':
        e, c, cen = self.edges, self.corners, self.centers
        for m in moves:
            e = ETRANS[m][e]
            c = CTRANS[m][c]
            cen = CENPERM[m][cen]
        return MegaState(e, c, cen)

    def copy(self) -> 'MegaState':
        return MegaState(self.edges.copy(), self.corners.copy(), self.centers.copy())


def parse_scramble(scramble: str) -> List[str]:
    out = []
    for line in scramble.replace('\n', ' ').split():
        tok = line.strip()
        if not tok:
            continue
        if tok not in _raw:
            raise ValueError(f'unsupported megaminx move {tok!r}')
        out.append(tok)
    return out


# ── Rotation group (60 elements) and face translation ────────────────────────

_ROT_GEN = [g + a for g in ('Uv', 'Rv') for a in AMOUNTS]

# each rotation: (edge map, corner map, center map); ROT_SEQ holds the
# Uv/Rv generator sequence that realises it (for referee checks)
ROTATIONS: List[Tuple[np.ndarray, np.ndarray, np.ndarray]] = []
ROT_SEQ: List[List[str]] = []
_seen = set()
_frontier = [(np.arange(60), np.arange(60), np.arange(12), [])]
while _frontier:
    nxt = []
    for e, c, cen, seq in _frontier:
        key = cen.tobytes()
        if key in _seen:
            continue
        _seen.add(key)
        ROTATIONS.append((e, c, cen))
        ROT_SEQ.append(seq)
        for g in _ROT_GEN:
            nxt.append((ETRANS[g][e], CTRANS[g][c], CENPERM[g][cen], seq + [g]))
    _frontier = nxt
assert len(ROTATIONS) == 60, len(ROTATIONS)

# Face translation per rotation, by conjugation matching:
# canonical move f corresponds to original move m' with T_m' = rho^-1 T_f rho
_EDGE_MAP_TO_MOVE = {ETRANS[m].tobytes(): m for m in FACE_MOVES}


def _rotation_face_translation(rot_idx: int) -> Dict[str, str]:
    e_rot, _, _ = ROTATIONS[rot_idx]
    inv = np.zeros(60, dtype=np.int64)
    for i in range(60):
        inv[e_rot[i]] = i
    table = {}
    for f in FACE_MOVES:
        conj = inv[ETRANS[f][e_rot]]
        m = _EDGE_MAP_TO_MOVE.get(conj.tobytes())
        assert m is not None, f'conjugation of {f} not a face move'
        table[f] = m
    return table


_FACE_TRANSLATIONS: Dict[int, Dict[str, str]] = {}


def canonicalize(state: MegaState) -> Tuple[MegaState, Dict[str, str], int]:
    """Rotate so centers are home. Returns (canonical state, face translation
    mapping canonical-frame moves to original-frame moves, rotation index)."""
    for idx, (e, c, cen) in enumerate(ROTATIONS):
        if np.array_equal(cen[state.centers], SOLVED_CEN):
            canon = MegaState(e[state.edges], c[state.corners], SOLVED_CEN.copy())
            if idx not in _FACE_TRANSLATIONS:
                _FACE_TRANSLATIONS[idx] = _rotation_face_translation(idx)
            return canon, _FACE_TRANSLATIONS[idx], idx
    raise RuntimeError('no rotation restores centers (invalid state)')


# ── Face membership and piece classes ─────────────────────────────────────────

EDGE_FACES: List[frozenset] = []
for s in range(30):
    fs = {f for f in FACES if ETRANS[f][s * 2] != s * 2}
    assert len(fs) == 2, (s, fs)
    EDGE_FACES.append(frozenset(fs))

CORNER_FACES: List[frozenset] = []
for s in range(20):
    fs = {f for f in FACES if CTRANS[f][s * 3] != s * 3}
    assert len(fs) == 3, (s, fs)
    CORNER_FACES.append(frozenset(fs))

_D_ADJ = {f for f in FACES if f not in ('U', 'D')
          and any('D' in ef and f in ef for ef in EDGE_FACES)}
_U_ADJ = {f for f in FACES if f not in ('U', 'D')
          and any('U' in ef and f in ef for ef in EDGE_FACES)}
assert len(_D_ADJ) == 5 and len(_U_ADJ) == 5


def _edge_class(s: int) -> str:
    fs = EDGE_FACES[s]
    if 'D' in fs:
        return 'star'
    if 'U' in fs:
        return 'll'
    if fs <= _D_ADJ:
        return 'lower'
    if fs <= _U_ADJ:
        return 'upper'
    return 'middle'


def _corner_class(s: int) -> str:
    fs = CORNER_FACES[s]
    if 'D' in fs:
        return 'bottom'
    if 'U' in fs:
        return 'll'
    return 'lowmid' if len(fs & _D_ADJ) == 2 else 'highmid'


EDGE_CLASSES = {cls: [s for s in range(30) if _edge_class(s) == cls]
                for cls in ('star', 'lower', 'middle', 'upper', 'll')}
CORNER_CLASSES = {cls: [s for s in range(20) if _corner_class(s) == cls]
                  for cls in ('bottom', 'lowmid', 'highmid', 'll')}
assert [len(v) for v in EDGE_CLASSES.values()] == [5, 5, 10, 5, 5]
assert [len(v) for v in CORNER_CLASSES.values()] == [5, 5, 5, 5]


# ── Exact per-piece distance tables (over the 48 face moves) ─────────────────

def _piece_table(trans_list: List[np.ndarray], home: int, size: int) -> np.ndarray:
    dist = np.full(size, 255, dtype=np.uint8)
    dist[home] = 0
    frontier = [home]
    while frontier:
        nxt = []
        for s in frontier:
            for t in trans_list:
                ns = int(t[s])
                if dist[ns] == 255:
                    dist[ns] = dist[s] + 1
                    nxt.append(ns)
        frontier = nxt
    return dist


_E_TRANS_LIST = [ETRANS[m] for m in FACE_MOVES]
_C_TRANS_LIST = [CTRANS[m] for m in FACE_MOVES]
EDGE_DIST = np.stack([_piece_table(_E_TRANS_LIST, s * 2, 60) for s in range(30)])
CORNER_DIST = np.stack([_piece_table(_C_TRANS_LIST, s * 3, 60) for s in range(20)])
