"""
Cross solver — port of src/lib/solver.ts.
Uses the same IDA* approach with BFS pruning tables.
"""
from typing import Dict, List, Tuple

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

# invPerm[old_slot] = new_slot (where does a piece at old_slot go after this move?)
INV_PERM: Dict[str, List[int]] = {}
for _m, (_perm, _) in MOVE_TABLES.items():
    _inv = [0] * 12
    for _i in range(12):
        _inv[_perm[_i]] = _i
    INV_PERM[_m] = _inv

MOVE_FACE: Dict[str, int] = {
    'U': 0, "U'": 0, 'U2': 0,
    'D': 1, "D'": 1, 'D2': 1,
    'F': 2, "F'": 2, 'F2': 2,
    'B': 3, "B'": 3, 'B2': 3,
    'R': 4, "R'": 4, 'R2': 4,
    'L': 5, "L'": 5, 'L2': 5,
}


def encode(s: List[int]) -> int:
    return (
        (s[0] * 2 + s[1]) +
        24 * (s[2] * 2 + s[3]) +
        576 * (s[4] * 2 + s[5]) +
        13824 * (s[6] * 2 + s[7])
    )


def apply_move_to_cross_state(s: List[int], move: str) -> List[int]:
    inv_perm = INV_PERM[move]
    _, ori = MOVE_TABLES[move]
    result = [0] * 8
    for i in range(4):
        slot = s[i * 2]
        new_slot = inv_perm[slot]
        result[i * 2] = new_slot
        result[i * 2 + 1] = (s[i * 2 + 1] + ori[new_slot]) % 2
    return result


def build_pruning_table(cross_pieces: Tuple[int, int, int, int]) -> bytearray:
    table = bytearray(b'\xff' * 331776)
    solved = [cross_pieces[0], 0, cross_pieces[1], 0, cross_pieces[2], 0, cross_pieces[3], 0]
    table[encode(solved)] = 0
    queue = [solved]
    qi = 0
    while qi < len(queue):
        state = queue[qi]; qi += 1
        depth = table[encode(state)]
        if depth >= 8:
            continue
        for move in ALL_MOVES:
            nxt = apply_move_to_cross_state(state, move)
            key = encode(nxt)
            if table[key] == 255:
                table[key] = depth + 1
                queue.append(nxt)
    return table


def _ida_search(state, depth, max_depth, last_face, path, table) -> bool:
    h = table[encode(state)]
    if h == 255:
        return False
    if depth + h > max_depth:
        return False
    if h == 0:
        return True
    for move in ALL_MOVES:
        face = MOVE_FACE[move]
        if face == last_face:
            continue
        nxt = apply_move_to_cross_state(state, move)
        path.append(move)
        if _ida_search(nxt, depth + 1, max_depth, face, path, table):
            return True
        path.pop()
    return False


def _ida_solve(initial_state: List[int], table: bytearray) -> List[str]:
    path: List[str] = []
    for max_depth in range(9):
        path.clear()
        if _ida_search(initial_state, 0, max_depth, -1, path, table):
            return list(path)
    return []


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


def solve_all_crosses(scramble: str) -> List[dict]:
    piece_slot, piece_ori = scramble_to_edge_state(scramble)
    results = []
    for face, cross in FACE_CROSS.items():
        table = build_pruning_table(cross)
        initial = [
            piece_slot[cross[0]], piece_ori[cross[0]],
            piece_slot[cross[1]], piece_ori[cross[1]],
            piece_slot[cross[2]], piece_ori[cross[2]],
            piece_slot[cross[3]], piece_ori[cross[3]],
        ]
        moves = _ida_solve(initial, table)
        results.append({
            'face': face,
            'rotation': FACE_ROTATION[face],
            'moves': moves,
            'move_count': len(moves),
        })
    return results
