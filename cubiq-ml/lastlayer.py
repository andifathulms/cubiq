"""
Last-layer stage (Phase B of the CFOP pipeline): OLL and PLL recognition.

Works on a full-cube sub-state representation (12 edges + 8 corners) driven
by the same measured move tables as f2l.py. Recognition is brute-force: try
every alg in the database under the 4 possible pre-AUFs and check the goal
predicate — at ~230 trials of ~15 moves each this is microseconds-fast and
needs no hand-maintained pattern tables.

Algs are written in standard notation (wide moves, M/S/E slices, x/y/z
rotations) and expanded to the 18 outer face moves by `expand_alg`, tracking
cube orientation so the emitted moves are frame-correct.
"""
from __future__ import annotations
from typing import Dict, List, Optional, Sequence, Tuple

from solver import ALL_MOVES, SUB_TRANS
from f2l import CORNER_TRANS, MOVE_INDEX, scramble_to_substates

# ── Full-cube state ───────────────────────────────────────────────────────────

_SOLVED_EDGES = tuple(s * 2 for s in range(12))
_SOLVED_CORNERS = tuple(s * 3 for s in range(8))

# U-layer pieces (home slots): edges UF,UR,UB,UL = 0..3; corners UFR..UBR = 0..3
_U_EDGES = (0, 1, 2, 3)
_U_CORNERS = (0, 1, 2, 3)


class FullState:
    __slots__ = ('edges', 'corners')

    def __init__(self, edges: Tuple[int, ...], corners: Tuple[int, ...]):
        self.edges = edges      # edges[piece] = slot*2 + ori
        self.corners = corners  # corners[piece] = slot*3 + ori

    @staticmethod
    def solved() -> 'FullState':
        return FullState(_SOLVED_EDGES, _SOLVED_CORNERS)

    @staticmethod
    def from_scramble(scramble: str) -> 'FullState':
        e, c = scramble_to_substates(scramble)
        return FullState(tuple(e), tuple(c))

    def apply(self, moves: Sequence[str]) -> 'FullState':
        edges, corners = self.edges, self.corners
        for m in moves:
            mi = MOVE_INDEX[m]
            et, ct = SUB_TRANS[mi], CORNER_TRANS[mi]
            edges = tuple(int(et[s]) for s in edges)
            corners = tuple(int(ct[s]) for s in corners)
        return FullState(edges, corners)

    def is_solved(self) -> bool:
        return self.edges == _SOLVED_EDGES and self.corners == _SOLVED_CORNERS

    def f2l_solved(self) -> bool:
        """Cross + all 4 pairs solved (everything except the U layer)."""
        return (all(self.edges[p] == p * 2 for p in range(4, 12))
                and all(self.corners[p] == p * 3 for p in range(4, 8)))

    def ll_oriented(self) -> bool:
        """F2L solved and every U-layer piece in the U layer, oriented."""
        if not self.f2l_solved():
            return False
        for p in _U_EDGES:
            s = self.edges[p]
            if s % 2 != 0 or s // 2 not in _U_EDGES:
                return False
        for p in _U_CORNERS:
            s = self.corners[p]
            if s % 3 != 0 or s // 3 not in _U_CORNERS:
                return False
        return True

    def solved_up_to_auf(self) -> Optional[str]:
        """Return the final AUF move ('' if none) if the cube is solved after
        at most one U turn, else None."""
        for auf in ('', 'U', 'U2', "U'"):
            s = self.apply([auf]) if auf else self
            if s.is_solved():
                return auf
        return None


# ── Alg notation → 18 face moves ──────────────────────────────────────────────

# Whole-cube rotations: content of face f moves to position map[f].
_BASE_ROT: Dict[str, Dict[str, str]] = {
    'x': {'F': 'U', 'U': 'B', 'B': 'D', 'D': 'F'},
    'y': {'R': 'F', 'F': 'L', 'L': 'B', 'B': 'R'},
    'z': {'U': 'R', 'R': 'D', 'D': 'L', 'L': 'U'},
}


def _rot_pow(axis: str, k: int) -> Dict[str, str]:
    m = {f: f for f in 'UDFBRL'}
    for _ in range(k % 4):
        base = _BASE_ROT[axis]
        m = {f: base.get(p, p) for f, p in m.items()}
    return m


def _suffix_to_pow(suffix: str) -> int:
    return {'': 1, '2': 2, "'": 3}[suffix]


def _pow_to_suffix(k: int) -> str:
    return {1: '', 2: '2', 3: "'"}[k % 4]


# Wide/slice moves as (rotation_axis, rot_power_per_turn, [(face, power_per_turn), ...])
_COMPOUND: Dict[str, Tuple[str, int, List[Tuple[str, int]]]] = {
    'r': ('x', 1, [('L', 1)]),
    'l': ('x', 3, [('R', 1)]),
    'u': ('y', 1, [('D', 1)]),
    'd': ('y', 3, [('U', 1)]),
    'f': ('z', 1, [('B', 1)]),
    'b': ('z', 3, [('F', 1)]),
    'M': ('x', 3, [('L', 3), ('R', 1)]),
    'S': ('z', 1, [('B', 1), ('F', 3)]),
    'E': ('y', 3, [('U', 1), ('D', 3)]),
}


def expand_alg(alg: str) -> List[str]:
    """Expand an alg with rotations/wide/slice moves into outer face moves.
    Tracks orientation: pos_to_face[p] = original face currently at position p."""
    pos_to_face = {f: f for f in 'UDFBRL'}
    out: List[str] = []

    def emit(face: str, power: int):
        out.append(pos_to_face[face] + _pow_to_suffix(power))

    def rotate(axis: str, power: int):
        nonlocal pos_to_face
        m = _rot_pow(axis, power)  # face content f -> position m[f]
        inv = {v: k for k, v in m.items()}
        pos_to_face = {p: pos_to_face[inv.get(p, p)] for p in 'UDFBRL'}

    for token in alg.split():
        base = token.rstrip("'2")
        suffix = token[len(base):]
        k = _suffix_to_pow(suffix)
        if base.endswith('w'):
            base = base[0].lower()
        if base in ('x', 'y', 'z'):
            rotate(base, k)
        elif base in _COMPOUND:
            axis, rot_per, faces = _COMPOUND[base]
            for face, fpow in faces:
                emit(face, fpow * k)
            rotate(axis, rot_per * k)
        elif base in 'UDFBRL':
            emit(base, k)
        else:
            raise ValueError(f'unknown token {token!r} in alg {alg!r}')
    return out


# ── Alg databases (standard speedsolving algs) ────────────────────────────────

OLL_ALGS: Dict[str, str] = {
    'OLL 1':  "R U2 R2 F R F' U2 R' F R F'",
    'OLL 2':  "F R U R' U' F' f R U R' U' f'",
    'OLL 3':  "f R U R' U' f' U' F R U R' U' F'",
    'OLL 4':  "f R U R' U' f' U F R U R' U' F'",
    'OLL 5':  "r' U2 R U R' U r",
    'OLL 6':  "r U2 R' U' R U' r'",
    'OLL 7':  "r U R' U R U2 r'",
    'OLL 8':  "r' U' R U' R' U2 r",
    'OLL 9':  "R U R' U' R' F R2 U R' U' F'",
    'OLL 10': "R U R' U R' F R F' R U2 R'",
    'OLL 11': "r U R' U R' F R F' R U2 r'",
    'OLL 12': "F R U R' U' F' U F R U R' U' F'",
    'OLL 13': "F U R U' R2 F' R U R U' R'",
    'OLL 14': "R' F R U R' F' R F U' F'",
    'OLL 15': "r' U' r R' U' R U r' U r",
    'OLL 16': "r U r' R U R' U' r U' r'",
    'OLL 17': "R U R' U R' F R F' U2 R' F R F'",
    'OLL 18': "r U R' U R U2 r' r' U' R U' R' U2 r",
    'OLL 19': "M U R U R' U' M' R' F R F'",
    'OLL 20': "M U R U R' U' M2 U R U' r'",
    'OLL 21': "R U2 R' U' R U R' U' R U' R'",
    'OLL 22': "R U2 R2 U' R2 U' R2 U2 R",
    'OLL 23': "R2 D' R U2 R' D R U2 R",
    'OLL 24': "r U R' U' r' F R F'",
    'OLL 25': "F' r U R' U' r' F R",
    'OLL 26': "R U2 R' U' R U' R'",
    'OLL 27': "R U R' U R U2 R'",
    'OLL 28': "r U R' U' M U R U' R'",
    'OLL 29': "R U R' U' R U' R' F' U' F R U R'",
    'OLL 30': "F R' F R2 U' R' U' R U R' F2",
    'OLL 31': "R' U' F U R U' R' F' R",
    'OLL 32': "L U F' U' L' U L F L'",
    'OLL 33': "R U R' U' R' F R F'",
    'OLL 34': "R U R2 U' R' F R U R U' F'",
    'OLL 35': "R U2 R2 F R F' R U2 R'",
    'OLL 36': "L' U' L U' L' U L U L F' L' F",
    'OLL 37': "F R' F' R U R U' R'",
    'OLL 38': "R U R' U R U' R' U' R' F R F'",
    'OLL 39': "L F' L' U' L U F U' L'",
    'OLL 40': "R' F R U R' U' F' U R",
    'OLL 41': "R U R' U R U2 R' F R U R' U' F'",
    'OLL 42': "R' U' R U' R' U2 R F R U R' U' F'",
    'OLL 43': "R' U' F' U F R",
    'OLL 44': "f R U R' U' f'",
    'OLL 45': "F R U R' U' F'",
    'OLL 46': "R' U' R' F R F' U R",
    'OLL 47': "F' L' U' L U L' U' L U F",
    'OLL 48': "F R U R' U' R U R' U' F'",
    'OLL 49': "r U' r2 U r2 U r2 U' r",
    'OLL 50': "r' U r2 U' r2 U' r2 U r'",
    'OLL 51': "F U R U' R' U R U' R' F'",
    'OLL 52': "R' F' U' F U' R U R' U R",
    'OLL 53': "r' U' R U' R' U R U' R' U2 r",
    'OLL 54': "r U R' U R U' R' U R U2 r'",
    'OLL 55': "R U2 R2 U' R U' R' U2 F R F'",
    'OLL 56': "r U r' U R U' R' U R U' R' r U' r'",
    'OLL 57': "R U R' U' M' U R U' r'",
}

PLL_ALGS: Dict[str, str] = {
    'Aa': "x R' U R' D2 R U' R' D2 R2 x'",
    'Ab': "x R2 D2 R U R' D2 R U' R x'",
    'E':  "x' R U' R' D R U R' D' R U R' D R U' R' D' x",
    'F':  "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R",
    'Ga': "R2 U R' U R' U' R U' R2 U' D R' U R D'",
    'Gb': "R' U' R U D' R2 U R' U R U' R U' R2 D",
    'Gc': "R2 U' R U' R U R' U R2 U D' R U' R' D",
    'Gd': "R U R' U' D R2 U' R U' R' U R' U R2 D'",
    'H':  "M2 U M2 U2 M2 U M2",
    'Ja': "x R2 F R F' R U2 r' U r U2 x'",
    'Jb': "R U R' F' R U R' U' R' F R2 U' R'",
    'Na': "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'",
    'Nb': "R' U R U' R' F' U' F R U R' F R' F' R U' R",
    'Ra': "R U' R' U' R U R D R' U' R D' R' U2 R'",
    'Rb': "R2 F R U R U' R' F' R U2 R' U2 R",
    'T':  "R U R' U' R' F R2 U' R' U' R U R' F'",
    'Ua': "M2 U M U2 M' U M2",
    'Ub': "M2 U' M U2 M' U' M2",
    'V':  "R' U R' U' y R' F' R2 U' R' U R' F R F",
    'Y':  "F R U' R' U' R U R' F' R U R' U' R' F R F'",
    'Z':  "M' U M2 U M2 U M' U2 M2",
}

# Pre-expanded (face-move-only) versions, computed once
_OLL_EXPANDED: Dict[str, List[str]] = {n: expand_alg(a) for n, a in OLL_ALGS.items()}
_PLL_EXPANDED: Dict[str, List[str]] = {n: expand_alg(a) for n, a in PLL_ALGS.items()}

_AUFS = ('', 'U', 'U2', "U'")


# ── Recognition ───────────────────────────────────────────────────────────────

def solve_oll(state: FullState) -> Optional[dict]:
    """Find (pre-AUF + OLL alg) that orients the last layer of `state`.
    Returns {case, moves} with the shortest matching sequence, or None.
    Assumes F2L is solved. Returns case 'skip' with [] if already oriented."""
    if state.ll_oriented():
        return {'case': 'skip', 'moves': []}
    best: Optional[dict] = None
    for auf in _AUFS:
        pre = [auf] if auf else []
        s0 = state.apply(pre) if pre else state
        for name, alg in _OLL_EXPANDED.items():
            if s0.apply(alg).ll_oriented():
                moves = pre + alg
                if best is None or len(moves) < len(best['moves']):
                    best = {'case': name, 'moves': moves}
    return best


def solve_pll(state: FullState) -> Optional[dict]:
    """Find (pre-AUF + PLL alg + final AUF) that solves `state`.
    Assumes the last layer is oriented. Returns {case, moves} or None."""
    auf0 = state.solved_up_to_auf()
    if auf0 is not None:
        return {'case': 'skip', 'moves': [auf0] if auf0 else []}
    best: Optional[dict] = None
    for auf in _AUFS:
        pre = [auf] if auf else []
        s0 = state.apply(pre) if pre else state
        for name, alg in _PLL_EXPANDED.items():
            s1 = s0.apply(alg)
            final = s1.solved_up_to_auf()
            if final is not None:
                moves = pre + alg + ([final] if final else [])
                if best is None or len(moves) < len(best['moves']):
                    best = {'case': name, 'moves': moves}
    return best
