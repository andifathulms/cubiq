"""
Cube state → 480-dimensional one-hot neural network input.

Encoding (matches DeepCubeA):
  - 8 corner slots × 24 entries (8 piece_ids × 3 orientations, zero-padded to 24)
  - 12 edge slots × 24 entries (12 piece_ids × 2 orientations, zero-padded to 24)
Total: (8 + 12) × 24 = 480 dims

Piece identity is determined by color set (invariant under moves).
Orientation is determined by where the U/D sticker faces for corners,
and whether the U/D or F/B sticker faces the correct face for edges.
"""
from __future__ import annotations
import numpy as np
import pycuber as pc

# Canonical slot names in fixed order
_CORNER_NAMES: list[str] = ['UFR', 'UFL', 'UBL', 'UBR', 'DFR', 'DFL', 'DBL', 'DBR']
_EDGE_NAMES:   list[str] = ['UF', 'UL', 'UB', 'UR', 'DF', 'DL', 'DB', 'DR', 'FR', 'FL', 'BL', 'BR']

# Precompute color sets for each canonical piece from the solved cube
_SOLVED = pc.Cube()
_CORNER_COLORS: list[frozenset] = [
    frozenset(str(c).strip('[]') for _, c in _SOLVED[n]) for n in _CORNER_NAMES
]
_EDGE_COLORS: list[frozenset] = [
    frozenset(str(c).strip('[]') for _, c in _SOLVED[n]) for n in _EDGE_NAMES
]

# U/D sticker colors (pycuber defaults)
_UD_COLORS = {'y', 'w'}   # y = U (yellow), w = D (white)
_FB_COLORS = {'g', 'b'}   # g = F (green),  b = B (blue)

N_CORNERS  = 8
N_EDGES    = 12
_SLOTS     = 24
STATE_DIM  = (N_CORNERS + N_EDGES) * _SLOTS   # 480


def _piece_colors(piece) -> frozenset:
    return frozenset(str(c).strip('[]') for _, c in piece)


def _corner_identity(piece) -> int:
    colors = _piece_colors(piece)
    for i, ref in enumerate(_CORNER_COLORS):
        if colors == ref:
            return i
    return 0


def _edge_identity(piece) -> int:
    colors = _piece_colors(piece)
    for i, ref in enumerate(_EDGE_COLORS):
        if colors == ref:
            return i
    return 0


def _corner_orientation(piece) -> int:
    """
    0: U/D sticker is on a U or D face (correctly oriented)
    1: U/D sticker is on a non-UD face in the 'CW' position
    2: U/D sticker is on a non-UD face in the 'CCW' position
    We simplify to: 0 if UD sticker on UD face, else 1 or 2 based on face.
    """
    for face, colour in piece:
        color_str = str(colour).strip('[]')
        if color_str in _UD_COLORS:
            if face in ('U', 'D'):
                return 0
            elif face in ('R', 'F'):
                return 1
            else:
                return 2
    return 0


def _edge_orientation(piece) -> int:
    """0: correctly oriented, 1: flipped."""
    for face, colour in piece:
        color_str = str(colour).strip('[]')
        if color_str in _UD_COLORS:
            return 0 if face in ('U', 'D') else 1
        if color_str in _FB_COLORS:
            return 0 if face in ('F', 'B') else 1
    return 0


def _cube_to_state(cube: pc.Cube) -> np.ndarray:
    vec = np.zeros(STATE_DIM, dtype=np.float32)

    # Corners: slots 0..7, each occupies 24 entries
    for slot, name in enumerate(_CORNER_NAMES):
        piece    = cube[name]
        piece_id = _corner_identity(piece)
        ori      = _corner_orientation(piece)
        idx      = slot * _SLOTS + piece_id * 3 + ori
        if idx < STATE_DIM:
            vec[idx] = 1.0

    # Edges: slots 8..19, each occupies 24 entries
    offset = N_CORNERS * _SLOTS
    for slot, name in enumerate(_EDGE_NAMES):
        piece    = cube[name]
        piece_id = _edge_identity(piece)
        ori      = _edge_orientation(piece)
        idx      = offset + slot * _SLOTS + piece_id * 2 + ori
        if idx < STATE_DIM:
            vec[idx] = 1.0

    return vec


def scramble_to_state(scramble: str) -> np.ndarray:
    """Apply a WCA scramble string and return the 480-dim state vector."""
    cube = pc.Cube()
    if scramble.strip():
        cube(pc.Formula(scramble.strip()))
    return _cube_to_state(cube)


def solved_state() -> np.ndarray:
    return _cube_to_state(pc.Cube())


def is_solved_vec(vec: np.ndarray) -> bool:
    return np.array_equal(vec, solved_state())
