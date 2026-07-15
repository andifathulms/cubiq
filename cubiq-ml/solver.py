"""
Cross solver — port of src/lib/solver.ts.

The cross of a face depends only on 4 edge pieces. Each tracked piece is a
(slot, orientation) pair — 24 sub-states — so the full cross space has
24^4 = 331,776 states. We BFS that entire space once per face (cached,
vectorized with numpy), which yields the EXACT distance-to-solved for every
state. Solving is then just walking down the distance gradient — every
solution returned is optimal, and enumerating all optimal solutions is cheap.

Solutions are expressed AFTER the rotation prefix (csTimer convention):
"z2  R' F L ..." means rotate z2 first, then perform the moves as read.
"""
from typing import Dict, List, Tuple
import numpy as np

FACE_CROSS: Dict[str, Tuple[int, int, int, int]] = {
    'D': (4, 5, 6, 7),
    'U': (0, 1, 2, 3),
    'F': (0, 4, 8, 9),
    'B': (2, 6, 10, 11),
    'R': (1, 5, 8, 10),
    'L': (3, 7, 9, 11),
}

FACE_ROTATION: Dict[str, str] = {
    'D': '', 'U': 'z2', 'F': "x'", 'B': 'x', 'R': 'z', 'L': "z'",
}

# How each rotation prefix maps an original face to its spatial position
# after the rotation. Moves in a solution are remapped through this so that
# "rotation + moves" performed as read actually solves the cross.
_ROT_MAP: Dict[str, Dict[str, str]] = {
    '':   {},
    'z2': {'U': 'D', 'D': 'U', 'R': 'L', 'L': 'R'},
    "x'": {'F': 'D', 'D': 'B', 'B': 'U', 'U': 'F'},
    'x':  {'F': 'U', 'U': 'B', 'B': 'D', 'D': 'F'},
    'z':  {'U': 'R', 'R': 'D', 'D': 'L', 'L': 'U'},
    "z'": {'U': 'L', 'L': 'D', 'D': 'R', 'R': 'U'},
}

# perm[new_slot] = old_slot  (new state at new_slot came from old_slot)
# ori [new_slot] = orientation delta applied at new_slot
MOVE_TABLES: Dict[str, Tuple[List[int], List[int]]] = {
    'U':   ([1,2,3,0,4,5,6,7,8,9,10,11],   [0,0,0,0,0,0,0,0,0,0,0,0]),
    "U'":  ([3,0,1,2,4,5,6,7,8,9,10,11],   [0,0,0,0,0,0,0,0,0,0,0,0]),
    'U2':  ([2,3,0,1,4,5,6,7,8,9,10,11],   [0,0,0,0,0,0,0,0,0,0,0,0]),
    'D':   ([0,1,2,3,7,4,5,6,8,9,10,11],   [0,0,0,0,0,0,0,0,0,0,0,0]),
    "D'":  ([0,1,2,3,5,6,7,4,8,9,10,11],   [0,0,0,0,0,0,0,0,0,0,0,0]),
    'D2':  ([0,1,2,3,6,7,4,5,8,9,10,11],   [0,0,0,0,0,0,0,0,0,0,0,0]),
    'F':   ([9,1,2,3,8,5,6,7,0,4,10,11],   [1,0,0,0,1,0,0,0,1,1,0,0]),
    "F'":  ([8,1,2,3,9,5,6,7,4,0,10,11],   [1,0,0,0,1,0,0,0,1,1,0,0]),
    'F2':  ([4,1,2,3,0,5,6,7,9,8,10,11],   [0,0,0,0,0,0,0,0,0,0,0,0]),
    'B':   ([0,1,10,3,4,5,11,7,8,9,6,2],   [0,0,1,0,0,0,1,0,0,0,1,1]),
    "B'":  ([0,1,11,3,4,5,10,7,8,9,2,6],   [0,0,1,0,0,0,1,0,0,0,1,1]),
    'B2':  ([0,1,6,3,4,5,2,7,8,9,11,10],   [0,0,0,0,0,0,0,0,0,0,0,0]),
    'R':   ([0,8,2,3,4,10,6,7,5,9,1,11],   [0,0,0,0,0,0,0,0,0,0,0,0]),
    "R'":  ([0,10,2,3,4,8,6,7,1,9,5,11],   [0,0,0,0,0,0,0,0,0,0,0,0]),
    'R2':  ([0,5,2,3,4,1,6,7,10,9,8,11],   [0,0,0,0,0,0,0,0,0,0,0,0]),
    'L':   ([0,1,2,11,4,5,6,9,8,3,10,7],   [0,0,0,0,0,0,0,0,0,0,0,0]),
    "L'":  ([0,1,2,9,4,5,6,11,8,7,10,3],   [0,0,0,0,0,0,0,0,0,0,0,0]),
    'L2':  ([0,1,2,7,4,5,6,3,8,11,10,9],   [0,0,0,0,0,0,0,0,0,0,0,0]),
}

ALL_MOVES = list(MOVE_TABLES.keys())
N_STATES = 24 ** 4  # 331,776

# invPerm[old_slot] = new_slot (where does a piece at old_slot go after this move?)
INV_PERM: Dict[str, List[int]] = {}
for _m, (_perm, _) in MOVE_TABLES.items():
    _inv = [0] * 12
    for _i in range(12):
        _inv[_perm[_i]] = _i
    INV_PERM[_m] = _inv

# Sub-state transition: sub = slot*2 + ori (0..23). The transition is the
# same for every face — only the solved state differs per face.
# SUB_TRANS[move_idx][sub] = sub after the move.
SUB_TRANS = np.zeros((len(ALL_MOVES), 24), dtype=np.int64)
for _mi, _m in enumerate(ALL_MOVES):
    _inv_perm = INV_PERM[_m]
    _, _ori = MOVE_TABLES[_m]
    for _slot in range(12):
        for _o in range(2):
            _ns = _inv_perm[_slot]
            SUB_TRANS[_mi][_slot * 2 + _o] = _ns * 2 + ((_o + _ori[_ns]) % 2)


def _apply_move_encoded(state: int, move_idx: int) -> int:
    t = SUB_TRANS[move_idx]
    return int(
        t[state % 24]
        + 24 * t[(state // 24) % 24]
        + 576 * t[(state // 576) % 24]
        + 13824 * t[(state // 13824) % 24]
    )


def _build_distance_table(cross_pieces: Tuple[int, int, int, int]) -> np.ndarray:
    """Exact distance-to-solved for every state, via vectorized BFS."""
    dist = np.full(N_STATES, 255, dtype=np.uint8)
    solved = (cross_pieces[0] * 2) + 24 * (cross_pieces[1] * 2) + \
             576 * (cross_pieces[2] * 2) + 13824 * (cross_pieces[3] * 2)
    dist[solved] = 0
    frontier = np.array([solved], dtype=np.int64)
    d = 0
    while frontier.size:
        s0 = frontier % 24
        s1 = (frontier // 24) % 24
        s2 = (frontier // 576) % 24
        s3 = (frontier // 13824) % 24
        nxt = []
        for t in SUB_TRANS:
            nxt.append(t[s0] + 24 * t[s1] + 576 * t[s2] + 13824 * t[s3])
        cand = np.unique(np.concatenate(nxt))
        cand = cand[dist[cand] == 255]
        dist[cand] = d + 1
        frontier = cand
        d += 1
    return dist


_TABLES: Dict[str, np.ndarray] = {}


def _get_table(face: str) -> np.ndarray:
    if face not in _TABLES:
        _TABLES[face] = _build_distance_table(FACE_CROSS[face])
    return _TABLES[face]


def _find_optimal_solutions(state: int, dist: np.ndarray, limit: int) -> List[List[str]]:
    """Enumerate optimal solutions by walking down the exact distance gradient."""
    solutions: List[List[str]] = []

    def dfs(s: int, path: List[str]):
        if len(solutions) >= limit:
            return
        h = dist[s]
        if h == 0:
            solutions.append(list(path))
            return
        for mi, move in enumerate(ALL_MOVES):
            ns = _apply_move_encoded(s, mi)
            if dist[ns] == h - 1:
                path.append(move)
                dfs(ns, path)
                path.pop()
                if len(solutions) >= limit:
                    return

    dfs(state, [])
    return solutions


def _remap_moves(moves: List[str], rotation: str) -> List[str]:
    """Express moves in the post-rotation frame so 'rotation + moves' is performable."""
    mapping = _ROT_MAP[rotation]
    return [mapping.get(m[0], m[0]) + m[1:] for m in moves]


def scramble_to_edge_state(scramble: str) -> Tuple[List[int], List[int]]:
    """Apply scramble to solved state, return (piece_slot, piece_ori).
    piece_slot[piece_id] = which slot it's in after the scramble.
    piece_ori[piece_id]  = its orientation (0 or 1).
    """
    pieces = list(range(12))
    oris = [0] * 12
    for move in scramble.split():
        if move not in MOVE_TABLES:
            continue
        perm, ori_delta = MOVE_TABLES[move]
        new_pieces = [0] * 12
        new_oris = [0] * 12
        for new_slot in range(12):
            old_slot = perm[new_slot]
            new_pieces[new_slot] = pieces[old_slot]
            new_oris[new_slot] = (oris[old_slot] + ori_delta[new_slot]) % 2
        pieces, oris = new_pieces, new_oris
    piece_slot = [0] * 12
    piece_ori = [0] * 12
    for slot in range(12):
        pid = pieces[slot]
        piece_slot[pid] = slot
        piece_ori[pid] = oris[slot]
    return piece_slot, piece_ori


def solve_all_crosses(scramble: str, max_alternatives: int = 3) -> List[dict]:
    piece_slot, piece_ori = scramble_to_edge_state(scramble)
    results = []
    for face, cross in FACE_CROSS.items():
        dist = _get_table(face)
        state = 0
        for i, pid in enumerate(cross):
            state += (piece_slot[pid] * 2 + piece_ori[pid]) * (24 ** i)
        rotation = FACE_ROTATION[face]
        all_optimal = _find_optimal_solutions(state, dist, max_alternatives)
        remapped = [_remap_moves(m, rotation) for m in all_optimal]
        moves = remapped[0] if remapped else []
        results.append({
            'face': face,
            'rotation': rotation,
            'moves': moves,
            'move_count': len(moves),
            'alternatives': remapped[1:],
        })
    return results
