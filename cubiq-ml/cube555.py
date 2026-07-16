"""
5x5x5 cube engine (sticker model, geometry-generated move tables).

Same construction as cube444: stickers have 3D positions + normals on a
5-unit cube; layer moves are rotations, permutations fall out of position
matching. Faces in kociemba order U,R,F,D,L,B, row-major, standard
viewing conventions.

5x5 specifics:
  - fixed face centers (odd cube) give an absolute reference frame
  - center pieces form two 24-slot orbits: x-centers (diagonal) and
    t-centers (axis-aligned)
  - each edge position holds 3 pieces: a central edge (12, like a 3x3
    edge) and two wings (24)
  - the middle slices (3R etc.) are modelled but NEVER used for solving:
    they rotate the fixed centers out of frame. WCA scrambles don't use
    them either.

Supported moves: outer (U..L), second slices (2U..2L), wide (Uw..Lw =
outer+slice2), each with ' and 2 suffixes.
"""
from __future__ import annotations
from typing import Dict, List, Sequence, Tuple

import numpy as np

FACES = ['U', 'R', 'F', 'D', 'L', 'B']
N = 5
N_STICKERS = 6 * N * N   # 150

_T = [-2.0, -1.0, 0.0, 1.0, 2.0]


def _grid_to_xyz(face: str, r: int, c: int) -> Tuple[float, float, float]:
    if face == 'U':
        return (_T[c], 2.5, -2.0 + r)
    if face == 'D':
        return (_T[c], -2.5, 2.0 - r)
    if face == 'F':
        return (_T[c], 2.0 - r, 2.5)
    if face == 'B':
        return (2.0 - c, 2.0 - r, -2.5)
    if face == 'R':
        return (2.5, 2.0 - r, 2.0 - c)
    if face == 'L':
        return (-2.5, 2.0 - r, -2.0 + c)
    raise ValueError(face)


_NORMALS = {
    'U': (0, 1, 0), 'D': (0, -1, 0), 'F': (0, 0, 1),
    'B': (0, 0, -1), 'R': (1, 0, 0), 'L': (-1, 0, 0),
}

_POS: List[Tuple[float, float, float]] = []
_LOOKUP: Dict[tuple, int] = {}
for _f in FACES:
    for _r in range(N):
        for _c in range(N):
            p = _grid_to_xyz(_f, _r, _c)
            n = _NORMALS[_f]
            _LOOKUP[(round(p[0] * 2), round(p[1] * 2), round(p[2] * 2), n)] = len(_POS)
            _POS.append(p)

_NRM = [
    _NORMALS[f] for f in FACES for _ in range(N * N)
]


def _rot(axis: int, quarter_turns: int, v: Sequence[float]) -> Tuple[float, float, float]:
    x, y, z = v
    for _ in range(quarter_turns % 4):
        if axis == 0:
            x, y, z = x, z, -y
        elif axis == 1:
            x, y, z = -z, y, x
        else:
            x, y, z = y, -x, z
    return x, y, z


def _layer_perm(axis: int, lo: float, hi: float, quarter_turns: int) -> np.ndarray:
    perm = np.arange(N_STICKERS, dtype=np.int64)
    for src in range(N_STICKERS):
        p, n = _POS[src], _NRM[src]
        if not (lo <= p[axis] <= hi):
            continue
        rp = _rot(axis, quarter_turns, p)
        rn = _rot(axis, quarter_turns, n)
        dest = _LOOKUP[(round(rp[0] * 2), round(rp[1] * 2), round(rp[2] * 2),
                        (round(rn[0]), round(rn[1]), round(rn[2])))]
        perm[dest] = src
    return perm


_BASE: Dict[str, Tuple[int, float, float, int]] = {
    'U':  (1,  1.5,  2.5, 1), '2U': (1,  0.5,  1.5, 1), '3U': (1, -0.5, 0.5, 1),
    'D':  (1, -2.5, -1.5, 3), '2D': (1, -1.5, -0.5, 3),
    'R':  (0,  1.5,  2.5, 1), '2R': (0,  0.5,  1.5, 1), '3R': (0, -0.5, 0.5, 1),
    'L':  (0, -2.5, -1.5, 3), '2L': (0, -1.5, -0.5, 3),
    'F':  (2,  1.5,  2.5, 1), '2F': (2,  0.5,  1.5, 1), '3F': (2, -0.5, 0.5, 1),
    'B':  (2, -2.5, -1.5, 3), '2B': (2, -1.5, -0.5, 3),
}

MOVES: Dict[str, np.ndarray] = {}
for _name, (_axis, _lo, _hi, _sign) in _BASE.items():
    for _suffix, _k in (('', 1), ('2', 2), ("'", 3)):
        MOVES[_name + _suffix] = _layer_perm(_axis, _lo, _hi, (_sign * _k) % 4)

for _f in FACES:
    for _suffix in ('', '2', "'"):
        MOVES[_f + 'w' + _suffix] = MOVES['2' + _f + _suffix][MOVES[_f + _suffix]]

for _name, _p in MOVES.items():
    assert sorted(_p.tolist()) == list(range(N_STICKERS)), _name

SOLVED = np.array([FACES.index(f) for f in FACES for _ in range(N * N)], dtype=np.int8)


def apply_moves(state: np.ndarray, moves: Sequence[str]) -> np.ndarray:
    for m in moves:
        state = state[MOVES[m]]
    return state


def from_scramble(scramble: str) -> np.ndarray:
    tokens = [t for t in scramble.split() if t]
    for t in tokens:
        if t not in MOVES:
            raise ValueError(f'unknown move {t!r}')
    return apply_moves(SOLVED.copy(), tokens)


def is_solved(state: np.ndarray) -> bool:
    s = state.reshape(6, N * N)
    return bool((s == s[:, :1]).all())


# ── Piece views ───────────────────────────────────────────────────────────────

def _idx(face: str, r: int, c: int) -> int:
    return FACES.index(face) * 25 + r * 5 + c


# center orbits per face (grid coords): x-centers diagonal, t-centers axis
X_CENTER_IDX: Dict[str, List[int]] = {
    f: [_idx(f, r, c) for r, c in ((1, 1), (1, 3), (3, 1), (3, 3))] for f in FACES
}
T_CENTER_IDX: Dict[str, List[int]] = {
    f: [_idx(f, r, c) for r, c in ((1, 2), (2, 1), (2, 3), (3, 2))] for f in FACES
}
FIXED_CENTER_IDX: Dict[str, int] = {f: _idx(f, 2, 2) for f in FACES}

# sanity: fixed centers never move except under middle-slice moves
for _m, _p in MOVES.items():
    if _m.startswith('3'):
        continue
    for _f in FACES:
        i = FIXED_CENTER_IDX[_f]
        assert _p[i] == i, (_m, _f)

# Wing slots: border, off-center (tangent |coord| == 1); central edges: border
# tangent coord == 0. Each is a (sticker_on_face, sticker_on_side) pair.
WING_SLOTS: List[Tuple[int, int]] = []
CEDGE_SLOTS: List[Tuple[int, int]] = []
_seen = set()
for _i in range(N_STICKERS):
    if _i in _seen:
        continue
    p = _POS[_i]
    coords = sorted(abs(x) for x in p)
    if coords == [1.0, 2.0, 2.5] or coords == [0.0, 2.0, 2.5]:
        a_face = [a for a in range(3) if abs(p[a]) == 2.5][0]
        a_border = [a for a in range(3) if abs(p[a]) == 2.0][0]
        q = list(p)
        q[a_face] = 2.0 * np.sign(p[a_face])
        q[a_border] = 2.5 * np.sign(p[a_border])
        n2 = [0, 0, 0]
        n2[a_border] = int(np.sign(p[a_border]))
        j = _LOOKUP[(round(q[0] * 2), round(q[1] * 2), round(q[2] * 2), tuple(n2))]
        _seen.add(_i)
        _seen.add(j)
        if coords[0] == 1.0:
            WING_SLOTS.append((_i, j))
        else:
            CEDGE_SLOTS.append((_i, j))

assert len(WING_SLOTS) == 24 and len(CEDGE_SLOTS) == 12

# Edge positions: group each central edge with its two flanking wing slots
# (same unordered face pair).
_wing_by_facepair: Dict[frozenset, List[int]] = {}
for _wi, (_a, _b) in enumerate(WING_SLOTS):
    _wing_by_facepair.setdefault(frozenset((_a // 25, _b // 25)), []).append(_wi)

EDGE_GROUPS: List[Tuple[int, int, int]] = []   # (cedge_idx, wing_idx1, wing_idx2)
for _ci, (_a, _b) in enumerate(CEDGE_SLOTS):
    ws = _wing_by_facepair[frozenset((_a // 25, _b // 25))]
    assert len(ws) == 2
    EDGE_GROUPS.append((_ci, ws[0], ws[1]))


def edge_paired(state: np.ndarray, gi: int) -> bool:
    """Edge group consistent: both wings show the same (face, colour) pair
    as the central edge."""
    ci, w1, w2 = EDGE_GROUPS[gi]
    ca, cb = CEDGE_SLOTS[ci]
    ref = (int(state[ca]), int(state[cb]))
    for wi in (w1, w2):
        a, b = WING_SLOTS[wi]
        if (int(state[a]), int(state[b])) != ref:
            return False
    return True


def paired_count(state: np.ndarray) -> int:
    return sum(edge_paired(state, g) for g in range(12))


def wings_attached(state: np.ndarray) -> int:
    """Finer pairing metric: how many of the 24 wings individually match
    their group's central edge (a group is paired iff both do)."""
    n = 0
    for ci, w1, w2 in EDGE_GROUPS:
        ca, cb = CEDGE_SLOTS[ci]
        ref = (int(state[ca]), int(state[cb]))
        for wi in (w1, w2):
            a, b = WING_SLOTS[wi]
            if (int(state[a]), int(state[b])) == ref:
                n += 1
    return n


def all_paired(state: np.ndarray) -> bool:
    return all(edge_paired(state, g) for g in range(12))


def centers_solved(state: np.ndarray, faces: Sequence[str] = FACES) -> bool:
    for f in faces:
        want = FACES.index(f)
        for i in X_CENTER_IDX[f] + T_CENTER_IDX[f]:
            if state[i] != want:
                return False
    return True


# ── Reduced -> 3x3 facelet ────────────────────────────────────────────────────

_FACELET_GRID = {
    (0, 0): (0, 0), (0, 1): (0, 2), (0, 2): (0, 4),
    (1, 0): (2, 0), (1, 1): (2, 2), (1, 2): (2, 4),
    (2, 0): (4, 0), (2, 1): (4, 2), (2, 2): (4, 4),
}


def to_3x3_facelet(state: np.ndarray) -> str:
    out = []
    for f in FACES:
        for r3 in range(3):
            for c3 in range(3):
                r5, c5 = _FACELET_GRID[(r3, c3)]
                out.append(FACES[state[_idx(f, r5, c5)]])
    return ''.join(out)


def invert_moves(moves: Sequence[str]) -> List[str]:
    inv = []
    for m in reversed(moves):
        if m.endswith("'"):
            inv.append(m[:-1])
        elif m.endswith('2'):
            inv.append(m)
        else:
            inv.append(m + "'")
    return inv
