"""
4x4x4 cube engine (sticker model, geometry-generated move tables).

State = 96 stickers (6 faces x 4x4 grid, row-major), each holding its home
face letter. Faces are laid out in kociemba order U,R,F,D,L,B with the same
viewing conventions as the standard 3x3 facelet string, so extracting the
reduced 3x3 state is a direct read-off.

Move permutations are generated geometrically: each sticker has a 3D centre
position and an outward normal on a 4-unit cube; a layer move rotates the
stickers whose positions fall in that layer, and the permutation comes from
matching rotated (position, normal) pairs. Nothing is hand-typed, so the
tables cannot be internally inconsistent.

Supported moves: outer (U R F D L B), inner slices (2U 2R ...), wide (Uw Rw
... = outer+inner), whole-cube rotations (x y z), each with ' and 2 suffixes.
"""
from __future__ import annotations
from typing import Dict, List, Sequence, Tuple

import numpy as np

FACES = ['U', 'R', 'F', 'D', 'L', 'B']
N = 4
N_STICKERS = 6 * N * N   # 96

# Tangent coordinates for grid index 0..3 (centre of each sticker square)
_T = [-1.5, -0.5, 0.5, 1.5]


def _grid_to_xyz(face: str, r: int, c: int) -> Tuple[float, float, float]:
    """Sticker centre position, kociemba viewing conventions.
    Axes: x -> R, y -> U, z -> F."""
    if face == 'U':
        return (_T[c], 2.0, -1.5 + r)        # rows back->front
    if face == 'D':
        return (_T[c], -2.0, 1.5 - r)        # rows front->back
    if face == 'F':
        return (_T[c], 1.5 - r, 2.0)         # rows top->bottom
    if face == 'B':
        return (1.5 - c, 1.5 - r, -2.0)      # viewed from behind, R on left
    if face == 'R':
        return (2.0, 1.5 - r, 1.5 - c)       # viewed from right, F on left
    if face == 'L':
        return (-2.0, 1.5 - r, -1.5 + c)     # viewed from left, B on left
    raise ValueError(face)


_NORMALS = {
    'U': (0, 1, 0), 'D': (0, -1, 0), 'F': (0, 0, 1),
    'B': (0, 0, -1), 'R': (1, 0, 0), 'L': (-1, 0, 0),
}

# index -> (position, normal); lookup key -> index
_POS: List[Tuple[float, float, float]] = []
_NRM: List[Tuple[int, int, int]] = []
_LOOKUP: Dict[tuple, int] = {}
for _f in FACES:
    for _r in range(N):
        for _c in range(N):
            p = _grid_to_xyz(_f, _r, _c)
            n = _NORMALS[_f]
            _LOOKUP[(round(p[0] * 2), round(p[1] * 2), round(p[2] * 2), n)] = len(_POS)
            _POS.append(p)
            _NRM.append(n)


def _rot(axis: int, quarter_turns: int, v: Sequence[float]) -> Tuple[float, float, float]:
    """Rotate v about the given axis (0=x,1=y,2=z) by quarter_turns * -90deg —
    one quarter turn equals the clockwise turn of that axis's positive face."""
    x, y, z = v
    for _ in range(quarter_turns % 4):
        if axis == 0:   # R-like: F->U
            x, y, z = x, z, -y
        elif axis == 1: # U-like: F->L
            x, y, z = -z, y, x
        else:           # F-like: U->R
            x, y, z = y, -x, z
    return x, y, z


def _layer_perm(axis: int, coord_min: float, coord_max: float, quarter_turns: int) -> np.ndarray:
    """perm[dest] = src for one layer rotation (newState[dest] = old[src])."""
    perm = np.arange(N_STICKERS, dtype=np.int64)
    for src in range(N_STICKERS):
        p, n = _POS[src], _NRM[src]
        if not (coord_min <= p[axis] <= coord_max):
            continue
        rp = _rot(axis, quarter_turns, p)
        rn = _rot(axis, quarter_turns, n)
        dest = _LOOKUP[(round(rp[0] * 2), round(rp[1] * 2), round(rp[2] * 2),
                        (round(rn[0]), round(rn[1]), round(rn[2])))]
        perm[dest] = src
    return perm


# ── Build the move table ──────────────────────────────────────────────────────
# Base layers: (axis, range, direction sign for a clockwise turn of that face)
_BASE: Dict[str, Tuple[int, float, float, int]] = {
    'U':  (1,  1.0,  2.0, 1), '2U': (1,  0.0,  1.0, 1),
    'D':  (1, -2.0, -1.0, 3), '2D': (1, -1.0,  0.0, 3),
    'R':  (0,  1.0,  2.0, 1), '2R': (0,  0.0,  1.0, 1),
    'L':  (0, -2.0, -1.0, 3), '2L': (0, -1.0,  0.0, 3),
    'F':  (2,  1.0,  2.0, 1), '2F': (2,  0.0,  1.0, 1),
    'B':  (2, -2.0, -1.0, 3), '2B': (2, -1.0,  0.0, 3),
    'x':  (0, -2.0,  2.0, 1),
    'y':  (1, -2.0,  2.0, 1),
    'z':  (2, -2.0,  2.0, 1),
}

MOVES: Dict[str, np.ndarray] = {}
for _name, (_axis, _lo, _hi, _sign) in _BASE.items():
    for _suffix, _k in (('', 1), ('2', 2), ("'", 3)):
        MOVES[_name + _suffix] = _layer_perm(_axis, _lo, _hi, (_sign * _k) % 4)

# Wide moves = outer + inner slice (same axis, so order is irrelevant)
for _f in FACES:
    for _suffix in ('', '2', "'"):
        MOVES[_f + 'w' + _suffix] = MOVES['2' + _f + _suffix][MOVES[_f + _suffix]]

# sanity: every table is a permutation and move^4 == identity
for _name, _p in MOVES.items():
    assert sorted(_p.tolist()) == list(range(N_STICKERS)), _name
_id = np.arange(N_STICKERS)
for _f in list(_BASE):
    q = MOVES[_f if _f in MOVES else _f]
    r = q[q][q][q] if _f not in ('x', 'y', 'z') else q[q][q][q]
    assert np.array_equal(r, _id), _f


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
    """Visually solved: every face is a single colour."""
    s = state.reshape(6, N * N)
    return bool((s == s[:, :1]).all())


# ── Piece-level views ─────────────────────────────────────────────────────────

def _sticker_index(face: str, r: int, c: int) -> int:
    return FACES.index(face) * 16 + r * 4 + c


# Centre sticker indices per face (the inner 2x2)
CENTER_IDX: Dict[str, List[int]] = {
    f: [_sticker_index(f, r, c) for r in (1, 2) for c in (1, 2)] for f in FACES
}

# The 24 wing slots. Each entry is (primary_sticker, secondary_sticker):
# a wing shows two stickers on adjacent faces. Built geometrically: edge-strip
# stickers are those with exactly one tangent coordinate at +-1.5 and grid
# position on the border but not a corner.
WING_SLOTS: List[Tuple[int, int]] = []
_seen = set()
for _i in range(N_STICKERS):
    p = _POS[_i]
    # border sticker of its face, not a corner: exactly one tangent coord ±1.5
    coords = [abs(p[a]) for a in range(3)]
    if sorted(coords) != [0.5, 1.5, 2.0]:
        continue
    if _i in _seen:
        continue
    # partner: the sticker of the same physical wing on the adjacent face —
    # swap which axis is "on the face" (2.0) and which is the border (1.5)
    a_face = coords.index(2.0)
    a_border = coords.index(1.5)
    q = list(p)
    q[a_face] = 1.5 * np.sign(p[a_face])
    q[a_border] = 2.0 * np.sign(p[a_border])
    n2 = [0, 0, 0]
    n2[a_border] = int(np.sign(p[a_border]))
    j = _LOOKUP[(round(q[0] * 2), round(q[1] * 2), round(q[2] * 2), tuple(n2))]
    _seen.add(_i)
    _seen.add(j)
    WING_SLOTS.append((_i, j))

assert len(WING_SLOTS) == 24

# The 12 dedge positions: pairs of wing-slot indices that sit side by side
# (same pair of faces). Grouped geometrically by the unordered face pair.
DEDGES: List[Tuple[int, int]] = []
_by_facepair: Dict[frozenset, List[int]] = {}
for _wi, (_a, _b) in enumerate(WING_SLOTS):
    fp = frozenset((_a // 16, _b // 16))
    _by_facepair.setdefault(fp, []).append(_wi)
for _fp, _ws in _by_facepair.items():
    assert len(_ws) == 2
    DEDGES.append((_ws[0], _ws[1]))
assert len(DEDGES) == 12

# Corner sticker triples (3x3-facelet extraction uses grid corners)
_CORNER_GRID = [(0, 0), (0, 3), (3, 0), (3, 3)]


def wing_colors(state: np.ndarray, wing_slot: int) -> Tuple[int, int]:
    a, b = WING_SLOTS[wing_slot]
    return int(state[a]), int(state[b])


def centers_solved(state: np.ndarray, faces: Sequence[str] = FACES) -> bool:
    """Each requested face's 4 centre stickers match that face's colour
    (fixed colour scheme — centres go back to their original faces)."""
    for f in faces:
        want = FACES.index(f)
        if any(state[i] != want for i in CENTER_IDX[f]):
            return False
    return True


def dedge_paired(state: np.ndarray, dedge: int) -> bool:
    w1, w2 = DEDGES[dedge]
    return wing_colors(state, w1) == wing_colors(state, w2)


def all_paired(state: np.ndarray) -> bool:
    return all(dedge_paired(state, d) for d in range(12))


def paired_count(state: np.ndarray) -> int:
    return sum(dedge_paired(state, d) for d in range(12))


# ── Reduced-state -> 3x3 facelet string ──────────────────────────────────────

_FACELET_GRID = {
    # 3x3 (row, col) -> 4x4 sticker grid position to sample
    (0, 0): (0, 0), (0, 1): (0, 1), (0, 2): (0, 3),
    (1, 0): (1, 0), (1, 1): (1, 1), (1, 2): (1, 3),
    (2, 0): (3, 0), (2, 1): (3, 1), (2, 2): (3, 3),
}


def to_3x3_facelet(state: np.ndarray) -> str:
    """Read the reduced cube as a 3x3 kociemba facelet string. Only valid when
    centres are solved and all dedges are paired (edge stickers sampled from
    one wing of each pair)."""
    out = []
    for f in FACES:
        for r3 in range(3):
            for c3 in range(3):
                r4, c4 = _FACELET_GRID[(r3, c3)]
                out.append(FACES[state[_sticker_index(f, r4, c4)]])
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
