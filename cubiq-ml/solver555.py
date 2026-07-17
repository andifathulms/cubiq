"""
5x5 reduction solver: centers (x + t orbits) -> edge grouping -> 3x3 CFOP.

Centers: same recipe as the 4x4 — IDA* per (face, orbit) over outer +
second-slice moves with exact C(24,4) colour-mask PDBs, maxed over target
and already-solved (face, orbit) pairs. Fixed centers give the frame.

Edge grouping: each edge = central edge + 2 wings. Outer moves preserve
centres AND groups; grouping macros are slice2+body+slice2' sandwiches
DISCOVERED by search and filtered to centre-safe permutations. To group
an edge: position its central edge and both wings simultaneously onto a
macro's source slots (exact BFS over the 6,624-state triple space), then
apply. The wing-flip endgame is covered by seeding the standard parity
alg (it swaps one edge's wings in place). A cycle-guarded zero-gain
reshape is the last resort.

3x3 stage: the reduced cube reads off as a 3x3 facelet; kociemba's
solution inverted gives a virtual scramble for the staged CFOP solver.
Outer 3x3 moves map 1:1 to 5x5 outer moves.
"""
from __future__ import annotations
import itertools
import time
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

from cube555 import (
    MOVES, FACES, SOLVED, apply_moves, from_scramble, is_solved,
    X_CENTER_IDX, T_CENTER_IDX, WING_SLOTS, CEDGE_SLOTS, EDGE_GROUPS,
    edge_paired, paired_count, wings_attached, all_paired, centers_solved,
    to_3x3_facelet, invert_moves,
)

_SUFFIXES = ['', "'", '2']
OUTER_MOVES = [f + s for f in FACES for s in _SUFFIXES]
SLICE_MOVES = ['2' + f + s for f in FACES for s in _SUFFIXES]
SLICE_SANDWICH = ['2' + f + s for f in FACES for s in ['', "'"]] + \
                 ['2' + f + '2' for f in FACES]
CENTER_SEARCH_MOVES = SLICE_MOVES + OUTER_MOVES

_LAYER = {m: m.rstrip("'2") for m in OUTER_MOVES + SLICE_MOVES}
_AXIS_OF_FACE = {'U': 0, 'D': 0, 'R': 1, 'L': 1, 'F': 2, 'B': 2}
_LAYER_ID = {'U': 0, '2U': 1, '2D': 2, 'D': 3,
             'R': 0, '2R': 1, '2L': 2, 'L': 3,
             'F': 0, '2F': 1, '2B': 2, 'B': 3}
_MOVE_AXIS = {m: _AXIS_OF_FACE[_LAYER[m].lstrip('2')] for m in OUTER_MOVES + SLICE_MOVES}
_MOVE_LAYER_ID = {m: _LAYER_ID[_LAYER[m]] for m in OUTER_MOVES + SLICE_MOVES}


def _inverse(m: str) -> str:
    if m.endswith("'"):
        return m[:-1]
    if m.endswith('2'):
        return m
    return m + "'"


# ── Centers ───────────────────────────────────────────────────────────────────

ORBITS = {'x': X_CENTER_IDX, 't': T_CENTER_IDX}
_ORBIT_GLOBAL = {k: [i for f in FACES for i in v[f]] for k, v in ORBITS.items()}
_ORBIT_POS = {k: {g: i for i, g in enumerate(v)} for k, v in _ORBIT_GLOBAL.items()}

CPERM: Dict[Tuple[str, str], Tuple[int, ...]] = {}
for _orbit in ORBITS:
    for _m in CENTER_SEARCH_MOVES:
        p = MOVES[_m]
        CPERM[(_orbit, _m)] = tuple(_ORBIT_POS[_orbit][int(p[g])]
                                    for g in _ORBIT_GLOBAL[_orbit])


def _apply_cperm(centers: Tuple[int, ...], orbit: str, move: str) -> Tuple[int, ...]:
    perm = CPERM[(orbit, move)]
    return tuple(centers[perm[i]] for i in range(24))


_CENTER_PDB: Dict[Tuple[str, int], Dict[int, int]] = {}


def _center_pdb(orbit: str, face_idx: int) -> Dict[int, int]:
    key = (orbit, face_idx)
    if key in _CENTER_PDB:
        return _CENTER_PDB[key]
    goal = 0
    for slot in range(face_idx * 4, face_idx * 4 + 4):
        goal |= 1 << slot
    dist = {goal: 0}
    frontier = [goal]
    while frontier:
        nxt = []
        for mask in frontier:
            for move in CENTER_SEARCH_MOVES:
                perm = CPERM[(orbit, move)]
                nm = 0
                for j in range(24):
                    if mask >> perm[j] & 1:
                        nm |= 1 << j
                if nm not in dist:
                    dist[nm] = dist[mask] + 1
                    nxt.append(nm)
        frontier = nxt
    _CENTER_PDB[key] = dist
    return dist


_PARTIAL_PDB: Dict[Tuple[str, frozenset], Dict[int, int]] = {}


def _center_pdb_partial(orbit: str, goal_slots: frozenset) -> Dict[int, int]:
    """Exact distance until the colour mask covers goal_slots (multi-source
    BFS from every covering mask)."""
    key = (orbit, goal_slots)
    if key in _PARTIAL_PDB:
        return _PARTIAL_PDB[key]
    goal_bits = 0
    for s in goal_slots:
        goal_bits |= 1 << s
    # enumerate all C(24,4) masks, seed the covering ones
    dist: Dict[int, int] = {}
    frontier = []
    for combo in itertools.combinations(range(24), 4):
        m = 0
        for s in combo:
            m |= 1 << s
        if m & goal_bits == goal_bits:
            dist[m] = 0
            frontier.append(m)
    while frontier:
        nxt = []
        for mask in frontier:
            for move in CENTER_SEARCH_MOVES:
                perm = CPERM[(orbit, move)]
                nm = 0
                for j in range(24):
                    if mask >> perm[j] & 1:
                        nm |= 1 << j
                if nm not in dist:
                    dist[nm] = dist[mask] + 1
                    nxt.append(nm)
        frontier = nxt
    _PARTIAL_PDB[key] = dist
    return dist


def _color_mask(centers: Sequence[int], color: int) -> int:
    m = 0
    for i, c in enumerate(centers):
        if c == color:
            m |= 1 << i
    return m


class _NodeBudget(Exception):
    pass


def _solve_one_center(states: Dict[str, Tuple[int, ...]], orbit: str, target: int,
                      keep: List[Tuple[str, int]], goal_slots: Optional[List[int]] = None,
                      max_depth: int = 16, node_budget: int = 3_000_000) -> Optional[List[str]]:
    """IDA*: get the target colour onto `goal_slots` of the target face in
    `orbit` (default: all 4) while every (orbit, face) in `keep` stays
    solved. Node-budgeted: returns None when exhausted."""
    slots = goal_slots if goal_slots is not None else list(range(target * 4, target * 4 + 4))
    full = goal_slots is None
    partial = None if full else _center_pdb_partial(orbit, frozenset(slots))
    path: List[str] = []
    budget = [node_budget]

    def h_of(st: Dict[str, Tuple[int, ...]]) -> int:
        h = 0
        for ob, f in keep:
            d = _center_pdb(ob, f)[_color_mask(st[ob], f)]
            if d > h:
                h = d
        if full:
            d = _center_pdb(orbit, target)[_color_mask(st[orbit], target)]
        else:
            d = partial[_color_mask(st[orbit], target)]
        if d > h:
            h = d
        return h

    def goal(st) -> bool:
        return (all(st[orbit][i] == target for i in slots)
                and all(all(st[ob][i] == f for i in range(f * 4, f * 4 + 4))
                        for ob, f in keep))

    def dfs(st, depth, bound, last_axis, last_lid) -> bool:
        budget[0] -= 1
        if budget[0] <= 0:
            raise _NodeBudget
        h = h_of(st)
        if depth + h > bound:
            return False
        if h == 0 and goal(st):
            return True
        for move in CENTER_SEARCH_MOVES:
            axis = _MOVE_AXIS[move]
            lid = _MOVE_LAYER_ID[move]
            if axis == last_axis and lid <= last_lid:
                continue
            ns = {ob: _apply_cperm(st[ob], ob, move) for ob in ORBITS}
            path.append(move)
            if dfs(ns, depth + 1, bound, axis, lid):
                return True
            path.pop()
        return False

    try:
        for bound in range(max_depth + 1):
            path.clear()
            if dfs(states, 0, bound, -1, -1):
                return list(path)
    except _NodeBudget:
        return None
    return None


def _beam_center_stage(states: Dict[str, Tuple[int, ...]], orbit: str, target: int,
                       keep: List[Tuple[str, int]], width: int = 700,
                       max_depth: int = 24) -> Optional[List[str]]:
    """Guided beam search fallback for stages where optimal IDA* blows up.
    Scored by the SUM of all PDB distances (a far better progress signal
    than the admissible max), so solutions are good but not optimal."""
    goals = keep + [(orbit, target)]

    def score(st) -> int:
        return sum(_center_pdb(ob, f)[_color_mask(st[ob], f)] for ob, f in goals)

    def key_of(st) -> bytes:
        return bytes(st['x']) + bytes(st['t'])

    beam = [(score(states), states, [])]
    seen = {key_of(states)}
    for _ in range(max_depth):
        nxt = []
        for _, st, path in beam:
            for move in CENTER_SEARCH_MOVES:
                ns = {ob: _apply_cperm(st[ob], ob, move) for ob in ORBITS}
                k = key_of(ns)
                if k in seen:
                    continue
                seen.add(k)
                sc = score(ns)
                if sc == 0:
                    return path + [move]
                nxt.append((sc, ns, path + [move]))
        if not nxt:
            return None
        nxt.sort(key=lambda x: x[0])
        beam = nxt[:width]
    return None


# ── Macro-greedy fallback: precomposed slice sandwiches on the live state ────

_CENTER_MACROS: Optional[List[Tuple[List[str], np.ndarray]]] = None
_ENDGAME_MACROS: Optional[List[Tuple[List[str], np.ndarray]]] = None
_SETUP_PERMS: Optional[List[Tuple[List[str], np.ndarray]]] = None


def _perm_of(seq: List[str]) -> np.ndarray:
    perm = np.arange(150, dtype=np.int64)
    for m in seq:
        perm = perm[MOVES[m]]
    return perm


def _center_macro_lib():
    global _CENTER_MACROS, _ENDGAME_MACROS, _SETUP_PERMS
    if _CENTER_MACROS is not None:
        return _CENTER_MACROS, _ENDGAME_MACROS, _SETUP_PERMS
    bodies: List[List[str]] = [[m] for m in OUTER_MOVES]
    for a in OUTER_MOVES:
        for b in OUTER_MOVES:
            if _LAYER[a] != _LAYER[b]:
                bodies.append([a, b])
    macros = []
    seen = set()
    all_center_ids = [i for f in FACES for i in X_CENTER_IDX[f] + T_CENTER_IDX[f]]

    def consider(seq: List[str]):
        perm = _perm_of(seq)
        key = tuple(int(perm[i]) for i in all_center_ids)
        if key in seen:
            return
        seen.add(key)
        macros.append((seq, perm))

    for s in SLICE_SANDWICH:
        for body in bodies:
            consider([s] + body + [_inverse(s)])
    # commutators [sandwich, rotation]
    for s in SLICE_SANDWICH:
        for b in OUTER_MOVES:
            sw = [s, b, _inverse(s)]
            sw_inv = [s, _inverse(b), _inverse(s)]
            for r in OUTER_MOVES:
                consider(sw + [r] + sw_inv + [_inverse(r)])
    main_macros = macros
    # ENDGAME library: commutators of two sandwiches whose centre supports
    # intersect in exactly ONE cell — pure single-sticker 3-cycles. Bare
    # sandwiches only swap (x,t) PAIRS, which provably cannot finish a face
    # at 7/8; these can. Kept separate (used only near face completion).
    macros = []
    seen = set()
    base = []
    for s in SLICE_SANDWICH:
        for b in OUTER_MOVES:
            seq = [s, b, _inverse(s)]
            after = apply_moves(SOLVED.copy(), seq)
            # COLOUR-level support: same-colour internal swaps are invisible
            # and harmless — the greedy's metrics are colour-based
            support = frozenset(i for i in all_center_ids if after[i] != SOLVED[i])
            if 0 < len(support) <= 6:
                inv_seq = [s, _inverse(b), _inverse(s)]
                base.append((seq, inv_seq, support))
    for i in range(len(base)):
        if len(macros) >= 20000:
            break
        for j in range(len(base)):
            if i == j:
                continue
            s1, i1, sup1 = base[i]
            s2, i2, sup2 = base[j]
            if len(sup1 & sup2) == 1:
                consider(s1 + s2 + i1 + i2)
    endgame_macros = macros
    setups = [([], np.arange(150, dtype=np.int64))] + \
             [([m], MOVES[m].copy()) for m in OUTER_MOVES]
    for a in OUTER_MOVES:
        for b in OUTER_MOVES:
            if _LAYER[a] != _LAYER[b]:
                setups.append(([a, b], MOVES[a][MOVES[b]]))
    _CENTER_MACROS, _ENDGAME_MACROS, _SETUP_PERMS = main_macros, endgame_macros, setups
    return main_macros, endgame_macros, setups


def _macro_center_face(state: np.ndarray, target: int, keep_faces: List[int],
                       max_steps: int = 24, verbose: bool = False) -> Optional[List[str]]:
    """Greedy whole-face solver: apply (outer setup + macro) that strictly
    increases the number of target-colour stickers among ALL 8 of the target
    face's centre slots, while every kept COMPLETE face stays solved.
    Solving both orbits together sidesteps the same-face x/t conflict: the
    natural sandwich effect swaps (x, t) pairs between faces."""
    macros, endgame_macros, setups = _center_macro_lib()
    tf = FACES[target]
    target_slots = np.array(X_CENTER_IDX[tf] + T_CENTER_IDX[tf], dtype=np.int64)
    keep_slots = [(np.array(X_CENTER_IDX[FACES[f]] + T_CENTER_IDX[FACES[f]], dtype=np.int64), f)
                  for f in keep_faces]

    def placed(st) -> int:
        return int((st[target_slots] == target).sum())

    def keeps_ok(st) -> bool:
        return all(bool((st[ks] == f).all()) for ks, f in keep_slots)

    def find_gain(cur_st, base, collect_zero=False, lib=None):
        best = None
        zeros = []
        for smoves, sperm in setups:
            st1 = cur_st[sperm]
            for mseq, mperm in (lib if lib is not None else macros):
                st2 = st1[mperm]
                gain = placed(st2) - base
                if gain < 0 or (gain == 0 and not collect_zero):
                    continue
                if gain == 0 and len(zeros) >= 200:
                    continue
                if not keeps_ok(st2):
                    continue
                cost = len(smoves) + len(mseq)
                if gain > 0:
                    if best is None or (-gain, cost) < (-best[0], best[1]):
                        best = (gain, cost, smoves + mseq, st2)
                else:
                    zeros.append((cost, smoves + mseq, st2))
        return best, zeros

    cur = state.copy()
    total: List[str] = []
    visited = {cur.tobytes()}
    reshapes = 0
    for _step in range(max_steps):
        base = placed(cur)
        if verbose:
            print(f'    [face {FACES[target]}] step {_step}: {base}/8', flush=True)
        if base == 8:
            return total
        best, zeros = find_gain(cur, base, collect_zero=True)
        if best is None:
            # pair-swaps provably cannot finish 7/8 (and can stall earlier) —
            # bring in the pure single-sticker 3-cycle commutators
            best, _ = find_gain(cur, base, lib=endgame_macros)
            if verbose:
                print(f'    [face {FACES[target]}] endgame 3-cycles: '
                      f'{"found" if best else "none"}', flush=True)
        if verbose and best is None:
            print(f'    [face {FACES[target]}] no gain; zeros={len(zeros)} reshapes={reshapes}', flush=True)
        if best is None:
            # take a zero-gain swap only if a strict gain follows it
            # (2-ply lookahead), guarded by a visited set
            if reshapes >= 6:
                return None
            reshapes += 1
            zeros.sort(key=lambda z: z[0])
            chosen = None
            lookaheads = 0
            for cost, moves_z, st2 in zeros:
                if st2.tobytes() in visited:
                    continue
                if lookaheads >= 40:
                    break
                lookaheads += 1
                nxt, _ = find_gain(st2, placed(st2), collect_zero=False)
                if nxt is not None:
                    chosen = (0, cost, moves_z, st2)
                    break
            if chosen is None and zeros:
                # no verified path — take the cheapest unvisited reshape blind
                for cost, moves_z, st2 in zeros:
                    if st2.tobytes() not in visited:
                        chosen = (0, cost, moves_z, st2)
                        break
            if chosen is None:
                return None
            best = chosen
        total += best[2]
        cur = best[3]
        visited.add(cur.tobytes())
    return None


def _center_face_with_fallbacks(cur: np.ndarray, fi: int,
                                keep_faces: List[int]) -> Optional[List[str]]:
    mv = _macro_center_face(cur, fi, keep_faces)
    if mv is not None:
        return mv
    # un-preserve one completed face (most recent first), solve the target,
    # then re-solve the dropped face
    for drop in reversed(keep_faces):
        rest = [f for f in keep_faces if f != drop]
        mv1 = _macro_center_face(cur, fi, rest)
        if mv1 is None:
            continue
        mid = apply_moves(cur.copy(), mv1)
        mv2 = _macro_center_face(mid, drop, rest + [fi])
        if mv2 is not None:
            return mv1 + mv2
    return None


def solve_centers(state: np.ndarray) -> Optional[List[dict]]:
    cur = state.copy()
    stages: List[dict] = []
    keep: List[Tuple[str, int]] = []
    keep_faces: List[int] = []
    # First two faces per-orbit via optimal IDA* (few constraints — fast).
    # Later faces whole-face via macro greedy: keeping only COMPLETE faces
    # sidesteps the same-face x/t conflict. Solving 5 faces forces the 6th.
    for f in ['U', 'F']:
        fi = FACES.index(f)
        face_start = cur.copy()
        face_stages: List[dict] = []
        ok = True
        for orbit in ('x', 't'):
            states = {ob: tuple(int(cur[g]) for g in _ORBIT_GLOBAL[ob]) for ob in ORBITS}
            moves = _solve_one_center(states, orbit, fi, keep + [])
            if moves is None:
                moves = _beam_center_stage(states, orbit, fi, keep)
            if moves is None:
                ok = False
                break
            cur = apply_moves(cur, moves)
            keep.append((orbit, fi))
            face_stages.append({'name': f'{f} {orbit}-centers', 'kind': 'centers', 'moves': moves})
        if not ok:
            # whole-face macro greedy as safety net (complete-face keeps only)
            keep = [k for k in keep if k[1] != fi]
            cur = face_start
            moves = _center_face_with_fallbacks(cur, fi, keep_faces)
            if moves is None:
                return None
            cur = apply_moves(cur, moves)
            keep += [('x', fi), ('t', fi)]
            face_stages = [{'name': f'{f} centers', 'kind': 'centers', 'moves': moves}]
        stages += face_stages
        keep_faces.append(fi)
    for f in ['R', 'B', 'L']:
        fi = FACES.index(f)
        moves = _center_face_with_fallbacks(cur, fi, keep_faces)
        if moves is None:
            return None
        cur = apply_moves(cur, moves)
        keep_faces.append(fi)
        keep += [('x', fi), ('t', fi)]
        stages.append({'name': f'{f} centers', 'kind': 'centers', 'moves': moves})
    return stages


# ── Edge grouping ─────────────────────────────────────────────────────────────

_WING_STICKER_POS = {}
for _wi, (_a, _b) in enumerate(WING_SLOTS):
    _WING_STICKER_POS[_a] = _wi
    _WING_STICKER_POS[_b] = _wi
_CEDGE_STICKER_POS = {}
for _ci, (_a, _b) in enumerate(CEDGE_SLOTS):
    _CEDGE_STICKER_POS[_a] = _ci
    _CEDGE_STICKER_POS[_b] = _ci

WPERM: Dict[str, Tuple[int, ...]] = {}
CEPERM: Dict[str, Tuple[int, ...]] = {}
for _m in OUTER_MOVES + SLICE_MOVES:
    p = MOVES[_m]
    WPERM[_m] = tuple(_WING_STICKER_POS[int(p[WING_SLOTS[i][0]])] for i in range(24))
    CEPERM[_m] = tuple(_CEDGE_STICKER_POS[int(p[CEDGE_SLOTS[i][0]])] for i in range(12))

_WPERM_INV = {m: tuple(np.argsort(np.array(wp)).tolist()) for m, wp in WPERM.items()}
# central-edge sub-state (slot*2 + flip) transition per move: flip = whether
# the piece's first sticker crossed to the slot's second position
CE_SUBTRANS: Dict[str, Tuple[int, ...]] = {}
for _m in OUTER_MOVES + SLICE_MOVES:
    p = MOVES[_m]
    t = [0] * 24
    for dest in range(12):
        da, db = CEDGE_SLOTS[dest]
        sa = int(p[da])
        # find source slot and whether crossed
        src = _CEDGE_STICKER_POS[sa]
        crossed = (sa == CEDGE_SLOTS[src][1])
        for o in range(2):
            t[src * 2 + o] = dest * 2 + (o ^ crossed)
    CE_SUBTRANS[_m] = tuple(t)
_CE_SUBTRANS_INV = {m: tuple(int(x) for x in np.argsort(np.array(t)))
                    for m, t in CE_SUBTRANS.items()}

_CEPERM_INV = {m: tuple(np.argsort(np.array(cp)).tolist()) for m, cp in CEPERM.items()}

OLL_PARITY = "2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2".split()

# OLL_PARITY's support on the 5x5 is exactly two wing slots (verified at
# import below). Conjugation g + P + g^-1 therefore swaps ANY two wings
# tightly — everything g disturbs, g^-1 restores. The conjugator is found
# by BFS over ALL moves (slices included) on ordered wing-slot pairs.
def _parity_wing_slots() -> Tuple[int, int]:
    st = apply_moves(SOLVED.copy(), OLL_PARITY)
    changed = [wi for wi, (a, b) in enumerate(WING_SLOTS)
               if st[a] != SOLVED[a] or st[b] != SOLVED[b]]
    assert len(changed) == 2, changed
    return changed[0], changed[1]


_P_SLOTS = _parity_wing_slots()
_ALL_LAYER_MOVES = OUTER_MOVES + SLICE_MOVES


def _conjugator_to(pair_from: Tuple[int, int], pair_to: Tuple[int, int],
                   max_depth: int = 8) -> Optional[List[str]]:
    """Move sequence whose forward wing map takes pair_from onto pair_to."""
    if pair_from == pair_to:
        return []
    prev = {pair_from: (pair_from, '')}
    frontier = [pair_from]
    for _ in range(max_depth):
        nxt = []
        for cur in frontier:
            for m in _ALL_LAYER_MOVES:
                inv = _WPERM_INV[m]
                new = (inv[cur[0]], inv[cur[1]])
                if new not in prev:
                    prev[new] = (cur, m)
                    if new == pair_to:
                        path = []
                        node = new
                        while node != pair_from:
                            node, mv = prev[node]
                            path.append(mv)
                        return list(reversed(path))
                    nxt.append(new)
        frontier = nxt
    return None


def _invert_seq(seq: List[str]) -> List[str]:
    return [_inverse(m) for m in reversed(seq)]


def _tight_swap(slot_a: int, slot_b: int) -> Optional[List[str]]:
    """Sequence swapping exactly the wings at slot_a and slot_b."""
    for target in (_P_SLOTS, (_P_SLOTS[1], _P_SLOTS[0])):
        g = _conjugator_to((slot_a, slot_b), target)
        if g is not None:
            return g + OLL_PARITY + _invert_seq(g)
    return None


_ODD_NEUTRAL: Optional[List[str]] = None


def _odd_neutral_macro() -> Optional[List[str]]:
    """A centers-safe macro with ODD wing permutation — used to correct the
    parity of a center repair without paying another repair."""
    global _ODD_NEUTRAL
    if _ODD_NEUTRAL is not None:
        return _ODD_NEUTRAL
    for m in _discover_macros():
        if _wing_perm_parity(m['seq']) == 1:
            _ODD_NEUTRAL = m['seq']
            return _ODD_NEUTRAL
    return None


def _wing_perm_parity(seq: List[str]) -> int:
    """Parity (0 even / 1 odd) of the wing permutation of a move sequence."""
    perm = list(range(24))
    for m in seq:
        wp = WPERM[m]
        perm = [perm[wp[i]] for i in range(24)]
    par = 0
    seen = [False] * 24
    for i in range(24):
        if seen[i]:
            continue
        ln = 0
        j = i
        while not seen[j]:
            seen[j] = True
            j = perm[j]
            ln += 1
        par ^= (ln - 1) & 1
    return par


def _tight_swap_variants(slot_a: int, slot_b: int, limit: int = 12):
    """Yield several sequences all swapping exactly the wings at (a, b) but
    via different conjugators — same wing effect, different (invisible)
    center damage, so a failing center repair can try another variant."""
    yielded = 0
    for r in [None] + OUTER_MOVES:
        if yielded >= limit:
            return
        if r is None:
            a2, b2 = slot_a, slot_b
            wrap, unwrap = [], []
        else:
            inv = _WPERM_INV[r]
            a2, b2 = inv[slot_a], inv[slot_b]
            wrap, unwrap = [r], [_inverse(r)]
        core = _tight_swap(a2, b2)
        if core is None:
            continue
        yielded += 1
        yield wrap + core + unwrap


# Rigid double-group flip: the 3x3 "flip UF and UB" alg in outer moves.
# Groups travel rigidly under outer moves, so its 5x5 effect is exactly two
# groups flipped in place (central edge flipped, wings mirrored) — generated
# with kociemba rather than recalled from memory.
_DOUBLE_FLIP: Optional[List[str]] = None
_DF_GROUPS: Optional[Tuple[int, int]] = None


def _double_flip_seed() -> Tuple[List[str], Tuple[int, int]]:
    global _DOUBLE_FLIP, _DF_GROUPS
    if _DOUBLE_FLIP is not None:
        return _DOUBLE_FLIP, _DF_GROUPS
    import kociemba
    f = list('UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB')
    f[7], f[19] = f[19], f[7]     # flip UF
    f[1], f[46] = f[46], f[1]     # flip UB
    sol = kociemba.solve(''.join(f)).split()
    seed = _invert_seq(sol)       # applied to solved, produces the two flips
    st = apply_moves(SOLVED.copy(), seed)
    # a rigidly flipped group still LOOKS paired (all three pieces mirror
    # together) — identify the operated groups geometrically: UF and UB
    def _group_of_faces(fs):
        for g, (ci, _, _) in enumerate(EDGE_GROUPS):
            a, b = CEDGE_SLOTS[ci]
            if {a // 25, b // 25} == fs:
                return g
        raise RuntimeError(fs)
    gUF = _group_of_faces({FACES.index('U'), FACES.index('F')})
    gUB = _group_of_faces({FACES.index('U'), FACES.index('B')})
    assert centers_solved(st) and all_paired(st)
    _DOUBLE_FLIP, _DF_GROUPS = seed, (gUF, gUB)
    return _DOUBLE_FLIP, _DF_GROUPS


def _ce_pair_conjugator(frm: Tuple[int, int], to: Tuple[int, int],
                        max_depth: int = 7) -> Optional[List[str]]:
    """Outer-only BFS mapping an ordered pair of GROUP positions onto
    another (groups move rigidly under outer moves)."""
    if frm == to:
        return []
    prev = {frm: (frm, '')}
    frontier = [frm]
    for _ in range(max_depth):
        nxt = []
        for cur in frontier:
            for m in OUTER_MOVES:
                ci = _CEPERM_INV[m]
                new = (ci[cur[0]], ci[cur[1]])
                if new not in prev:
                    prev[new] = (cur, m)
                    if new == to:
                        path = []
                        node = new
                        while node != frm:
                            node, mv = prev[node]
                            path.append(mv)
                        return list(reversed(path))
                    nxt.append(new)
        frontier = nxt
    return None


def _tight_double_flip(group_a: int, group_b: int) -> Optional[List[str]]:
    """Sequence flipping exactly the edge groups at positions a and b."""
    seed, (fa, fb) = _double_flip_seed()
    ca, cb = EDGE_GROUPS[group_a][0], EDGE_GROUPS[group_b][0]
    ta, tb = EDGE_GROUPS[fa][0], EDGE_GROUPS[fb][0]
    for target in ((ta, tb), (tb, ta)):
        h = _ce_pair_conjugator((ca, cb), target)
        if h is not None:
            return h + seed + _invert_seq(h)
    return None


_MACROS: Optional[List[dict]] = None


def _discover_macros(max_body: int = 3, cap: int = 220) -> List[dict]:
    global _MACROS
    if _MACROS is not None:
        return _MACROS
    bodies: List[List[str]] = []
    for ln in range(1, max_body + 1):
        for combo in itertools.product(OUTER_MOVES, repeat=ln):
            if all(_LAYER[combo[i]] != _LAYER[combo[i + 1]] for i in range(ln - 1)):
                bodies.append(list(combo))
    bodies.append(['R', 'U', "R'", 'F', "R'", "F'", 'R'])
    bodies.append(["L'", "U'", 'L', "F'", 'L', 'F', "L'"])

    candidates = [[s] + b + [_inverse(s)] for s in SLICE_SANDWICH for b in bodies]
    candidates.append(OLL_PARITY)

    seen = set()
    macros: List[dict] = []
    parity_kept = []
    for seq in candidates:
        after = apply_moves(SOLVED.copy(), seq)
        if not centers_solved(after):
            continue
        wperm = tuple(range(24))
        for m in seq:
            wp = WPERM[m]
            wperm = tuple(wperm[wp[i]] for i in range(24))
        if wperm in seen:
            continue
        # useful iff it moves wings between edge positions (merge potential)
        # or swaps wings within a position (flip potential)
        useful = any(_group_of_wing(wperm[w]) != _group_of_wing(w) for w in range(24)) \
            or wperm != tuple(range(24))
        if not useful:
            continue
        seen.add(wperm)
        entry = {'seq': seq}
        macros.append(entry)
        if seq == OLL_PARITY:
            parity_kept.append(entry)
    macros.sort(key=lambda m: len(m['seq']))
    # guarantee the parity seed survives any cap
    kept = macros[:cap]
    for pk in parity_kept:
        if pk not in kept:
            kept.append(pk)
    _MACROS = kept
    return _MACROS


_GROUP_OF_WING = {}
for _gi, (_ci, _w1, _w2) in enumerate(EDGE_GROUPS):
    _GROUP_OF_WING[_w1] = _gi
    _GROUP_OF_WING[_w2] = _gi


def _group_of_wing(w: int) -> int:
    return _GROUP_OF_WING[w]


# triple positioning: (wing1, wing2, cedge) -> targets, over outer moves
def _position_triple(frm: Tuple[int, int, int], to: Tuple[int, int, int],
                     max_depth: int = 7) -> Optional[List[str]]:
    if frm == to:
        return []
    prev = {frm: (frm, '')}
    frontier = [frm]
    for _ in range(max_depth):
        nxt = []
        for cur in frontier:
            for m in OUTER_MOVES:
                wi = _WPERM_INV[m]
                ci = _CEPERM_INV[m]
                new = (wi[cur[0]], wi[cur[1]], ci[cur[2]])
                if new not in prev:
                    prev[new] = (cur, m)
                    if new == to:
                        path = []
                        node = new
                        while node != frm:
                            node, mv = prev[node]
                            path.append(mv)
                        return list(reversed(path))
                    nxt.append(new)
        frontier = nxt
    return None


def _find_edge_pieces(state: np.ndarray, gi: int) -> Optional[Tuple[int, int, int]]:
    """Current wing slots + central-edge slot of the pieces belonging to
    edge group gi (identified by the home colour pair)."""
    ci, w1, w2 = EDGE_GROUPS[gi]
    ca, cb = CEDGE_SLOTS[ci]
    colors = {int(SOLVED[ca]), int(SOLVED[cb])}
    wings = []
    for wi, (a, b) in enumerate(WING_SLOTS):
        if {int(state[a]), int(state[b])} == colors:
            wings.append(wi)
    ce = None
    for cj, (a, b) in enumerate(CEDGE_SLOTS):
        if {int(state[a]), int(state[b])} == colors:
            ce = cj
    if len(wings) != 2 or ce is None:
        return None
    return wings[0], wings[1], ce


def _macro_wing_maps(macro: dict) -> Tuple[Tuple[int, ...], Tuple[int, ...]]:
    if 'wperm' not in macro:
        wperm = tuple(range(24))
        ceperm = tuple(range(12))
        cesub = tuple(range(24))
        for m in macro['seq']:
            wp, cp, ct = WPERM[m], CEPERM[m], CE_SUBTRANS[m]
            wperm = tuple(wperm[wp[i]] for i in range(24))
            ceperm = tuple(ceperm[cp[i]] for i in range(12))
            cesub = tuple(ct[cesub[i]] for i in range(24))
        macro['wperm'] = wperm
        macro['ceperm'] = ceperm
        macro['cesub'] = cesub
    return macro['wperm'], macro['ceperm']


def _loose_wing_slots(cur: np.ndarray) -> List[int]:
    out = []
    for gi, (ci, w1, w2) in enumerate(EDGE_GROUPS):
        ca, cb = CEDGE_SLOTS[ci]
        colors = {int(SOLVED[ca]), int(SOLVED[cb])}
        ce_cur = None
        for cj, (a, b) in enumerate(CEDGE_SLOTS):
            if {int(cur[a]), int(cur[b])} == colors:
                ce_cur = cj
                break
        if ce_cur is None:
            continue
        ce_ref = (int(cur[CEDGE_SLOTS[ce_cur][0]]), int(cur[CEDGE_SLOTS[ce_cur][1]]))
        for wi, (a, b) in enumerate(WING_SLOTS):
            if {int(cur[a]), int(cur[b])} == colors:
                in_group = wi in EDGE_GROUPS[ce_cur][1:]
                matches = (int(cur[a]), int(cur[b])) == ce_ref
                if not (in_group and matches):
                    out.append(wi)
    return out


def _pairing_candidates(cur: np.ndarray, macros: List[dict], base: int,
                        min_gain: int = 1, avoid: Optional[set] = None) -> Optional[dict]:
    """Attach one wing at a time: position (wing, its central edge) onto a
    macro's (wing-source, cedge-source) slots and apply; accept by simulated
    wings_attached gain. Two-piece positioning keeps the setup space tiny."""
    # locate each colour-group's pieces
    loose: List[Tuple[int, int]] = []   # (wing_slot, ce_slot) for unattached wings
    for gi, (ci, w1, w2) in enumerate(EDGE_GROUPS):
        ca, cb = CEDGE_SLOTS[ci]
        colors = {int(SOLVED[ca]), int(SOLVED[cb])}
        ce_cur = None
        for cj, (a, b) in enumerate(CEDGE_SLOTS):
            if {int(cur[a]), int(cur[b])} == colors:
                ce_cur = cj
                break
        if ce_cur is None:
            continue
        ce_ref = (int(cur[CEDGE_SLOTS[ce_cur][0]]), int(cur[CEDGE_SLOTS[ce_cur][1]]))
        for wi, (a, b) in enumerate(WING_SLOTS):
            if {int(cur[a]), int(cur[b])} == colors:
                # attached iff in the ce's own group showing matching colours
                in_group = wi in EDGE_GROUPS[ce_cur][1:]
                matches = (int(cur[a]), int(cur[b])) == ce_ref
                if not (in_group and matches):
                    loose.append((wi, ce_cur))

    best: Optional[dict] = None

    prune = min_gain >= 1
    bfs_memo: Dict[tuple, Optional[List[str]]] = {}
    for macro in macros:
        if prune and best is not None and best['cost'] <= len(macro['seq']):
            break
        wperm, ceperm = _macro_wing_maps(macro)
        for g, (ci, w1, w2) in enumerate(EDGE_GROUPS):
            sc = ceperm[ci]
            for d in (w1, w2):
                sw = wperm[d]
                for (pw, pce) in loose:
                    key = ((pw, pce), (sw, sc))
                    if key not in bfs_memo:
                        bfs_memo[key] = _position_wing_ce((pw, pce), (sw, sc))
                    setup = bfs_memo[key]
                    if setup is None:
                        continue
                    total = setup + macro['seq']
                    if prune and best is not None and len(total) >= best['cost']:
                        continue
                    trial = apply_moves(cur.copy(), total)
                    gain = wings_attached(trial) - base
                    if gain >= min_gain and centers_solved(trial):
                        if gain == 0 and (avoid is None or trial.tobytes() in avoid):
                            continue
                        if best is None or (-gain, len(total)) < (-best['gain'], best['cost']):
                            best = {'moves': total, 'cost': len(total),
                                    'gain': gain, 'state': trial}

    # endgame: with few loose wings, single-wing positioning can't set up
    # swap/parity macros — position BOTH wings of a group plus its central
    # edge simultaneously (L2E-style)
    if best is None and 0 < len(loose) <= 4:
        by_ce: Dict[int, List[int]] = {}
        for pw, pce in loose:
            by_ce.setdefault(pce, []).append(pw)
        # cross case: two groups each missing one wing, wings swapped between
        # them — position all four pieces (both wings + both central edges)
        if len(by_ce) == 2 and all(len(v) == 1 for v in by_ce.values()):
            (ceA, (wA,)), (ceB, (wB,)) = sorted(by_ce.items())

            def _ce_sub(slot: int) -> int:
                a, b = CEDGE_SLOTS[slot]
                disp = (int(cur[a]), int(cur[b]))
                for h, (ha, hb) in enumerate(CEDGE_SLOTS):
                    if {int(SOLVED[ha]), int(SOLVED[hb])} == set(disp):
                        canon = (int(SOLVED[ha]), int(SOLVED[hb]))
                        return slot * 2 + (0 if disp == canon else 1)
                return slot * 2

            ceA_sub = _ce_sub(ceA)
            ceB_sub = _ce_sub(ceB)
            for macro in macros:
                if best is not None:
                    break
                wperm, ceperm = _macro_wing_maps(macro)
                cesub = macro['cesub']
                cesub_inv = macro.get('cesub_inv')
                if cesub_inv is None:
                    cesub_inv = [0] * 24
                    for i in range(24):
                        cesub_inv[cesub[i]] = i
                    macro['cesub_inv'] = cesub_inv
                for (w_first, w_second) in ((wA, wB), (wB, wA)):
                    for (c1_final, c2_final) in ((ceA, ceB), (ceB, ceA)):
                        g1 = next(g for g, (ci, _, _) in enumerate(EDGE_GROUPS) if ci == c1_final)
                        g2 = next(g for g, (ci, _, _) in enumerate(EDGE_GROUPS) if ci == c2_final)
                        for d1 in EDGE_GROUPS[g1][1:]:
                            for d2 in EDGE_GROUPS[g2][1:]:
                                for o1 in (0, 1):
                                    for o2 in (0, 1):
                                        targets = (wperm[d1], wperm[d2],
                                                   cesub_inv[c1_final * 2 + o1],
                                                   cesub_inv[c2_final * 2 + o2])
                                        setup = _position_four_pieces(
                                            (w_first, w_second, ceA_sub, ceB_sub), targets)
                                        if setup is None:
                                            continue
                                        total = setup + macro['seq']
                                        trial = apply_moves(cur.copy(), total)
                                        gain = wings_attached(trial) - base
                                        if gain > 0 and centers_solved(trial):
                                            best = {'moves': total, 'cost': len(total),
                                                    'gain': gain, 'state': trial}
                                            break
                                    if best is not None:
                                        break
                                if best is not None:
                                    break
                            if best is not None:
                                break
                        if best is not None:
                            break
                    if best is not None:
                        break
        for pce, pws in by_ce.items():
            if len(pws) != 2:
                continue
            for macro in macros:
                wperm, ceperm = _macro_wing_maps(macro)
                for g, (ci, w1, w2) in enumerate(EDGE_GROUPS):
                    s1, s2, sc = wperm[w1], wperm[w2], ceperm[ci]
                    for assign in ((pws[0], pws[1]), (pws[1], pws[0])):
                        setup = _position_triple((assign[0], assign[1], pce), (s1, s2, sc))
                        if setup is None:
                            continue
                        total = setup + macro['seq']
                        trial = apply_moves(cur.copy(), total)
                        gain = wings_attached(trial) - base
                        if gain > 0 and centers_solved(trial):
                            if best is None or (-gain, len(total)) < (-best['gain'], best['cost']):
                                best = {'moves': total, 'cost': len(total),
                                        'gain': gain, 'state': trial}
    return best


def _position_triple(frm: Tuple[int, int, int], to: Tuple[int, int, int],
                     max_depth: int = 7) -> Optional[List[str]]:
    """Outer-move BFS positioning (wing, wing, central edge) simultaneously."""
    if frm == to:
        return []
    prev = {frm: (frm, '')}
    frontier = [frm]
    for _ in range(max_depth):
        nxt = []
        for curp in frontier:
            for m in OUTER_MOVES:
                wi = _WPERM_INV[m]
                ci = _CEPERM_INV[m]
                new = (wi[curp[0]], wi[curp[1]], ci[curp[2]])
                if new not in prev:
                    prev[new] = (curp, m)
                    if new == to:
                        path = []
                        node = new
                        while node != frm:
                            node, mv = prev[node]
                            path.append(mv)
                        return list(reversed(path))
                    nxt.append(new)
        frontier = nxt
    return None


_FOUR_MAP_CACHE: Dict[tuple, dict] = {}


def _four_piece_map(frm: Tuple[int, int, int, int]) -> dict:
    """Full outer-move BFS from `frm` over (wing, wing, cedge-SUB,
    cedge-SUB) states — central-edge orientation matters, so ces are
    tracked as slot*2+flip. Every subsequent target is an O(1) lookup."""
    if frm in _FOUR_MAP_CACHE:
        return _FOUR_MAP_CACHE[frm]
    prev = {frm: (frm, '')}
    frontier = [frm]
    while frontier:
        nxt = []
        for curp in frontier:
            for m in OUTER_MOVES:
                wi = _WPERM_INV[m]
                ct = CE_SUBTRANS[m]
                new = (wi[curp[0]], wi[curp[1]], ct[curp[2]], ct[curp[3]])
                if new not in prev:
                    prev[new] = (curp, m)
                    nxt.append(new)
        frontier = nxt
    if len(_FOUR_MAP_CACHE) > 2:
        _FOUR_MAP_CACHE.clear()
    _FOUR_MAP_CACHE[frm] = prev
    return prev


def _position_four_pieces(frm: Tuple[int, int, int, int],
                          to: Tuple[int, int, int, int]) -> Optional[List[str]]:
    prev = _four_piece_map(frm)
    if to not in prev:
        return None
    path = []
    node = to
    while node != frm:
        node, mv = prev[node]
        path.append(mv)
    return list(reversed(path))


def _position_wing_ce(frm: Tuple[int, int], to: Tuple[int, int],
                      max_depth: int = 6) -> Optional[List[str]]:
    """Outer-move BFS positioning a (wing, central edge) pair."""
    if frm == to:
        return []
    prev = {frm: (frm, '')}
    frontier = [frm]
    for _ in range(max_depth):
        nxt = []
        for curp in frontier:
            for m in OUTER_MOVES:
                wi = _WPERM_INV[m]
                ci = _CEPERM_INV[m]
                new = (wi[curp[0]], ci[curp[1]])
                if new not in prev:
                    prev[new] = (curp, m)
                    if new == to:
                        path = []
                        node = new
                        while node != frm:
                            node, mv = prev[node]
                            path.append(mv)
                        return list(reversed(path))
                    nxt.append(new)
        frontier = nxt
    return None


def solve_pairing(state: np.ndarray, max_steps: int = 40,
                  restarts: int = 2) -> Optional[List[dict]]:
    """Greedy wing attachment with randomized restarts: a rare cross-parity
    endgame can strand one greedy path, but rotating the macro preference
    changes the whole trajectory and dodges it."""
    base_macros = _discover_macros()
    for attempt in range(restarts):
        rot = (attempt * 61) % max(1, len(base_macros))
        macros = base_macros[rot:] + base_macros[:rot]
        result = _solve_pairing_once(state, macros, max_steps)
        if result is not None:
            return result
    return None


def _solve_pairing_once(state: np.ndarray, macros: List[dict],
                        max_steps: int) -> Optional[List[dict]]:
    stages: List[dict] = []
    cur = state.copy()
    shuffles = 0
    parity_fixes = 0
    visited: set = set()

    for _step in range(max_steps):
        base = wings_attached(cur)
        if base == 24:
            return stages
        best = _pairing_candidates(cur, macros, base)
        if best is None:
            # stagnation: try zero-gain reshapes, but only accept one from
            # which a strict gain provably follows (2-ply lookahead)
            if shuffles >= 8:
                return None
            shuffles += 1
            visited.add(cur.tobytes())
            chosen = None
            for _try in range(8):
                z = _pairing_candidates(cur, macros, base, min_gain=0, avoid=visited)
                if z is None:
                    break
                visited.add(z['state'].tobytes())
                nxt = _pairing_candidates(z['state'], macros,
                                          wings_attached(z['state']))
                if nxt is not None:
                    chosen = z
                    break
            if chosen is None:
                # LAST RESORT: conjugated-parity tight swap changes the wing
                # parity (the unfixable obstruction), then centers re-solve
                if parity_fixes >= 2:
                    return None
                loose_now = _loose_wing_slots(cur)
                fixed = False
                for i in range(len(loose_now)):
                    for j in range(i + 1, len(loose_now)):
                        for seq in _tight_swap_variants(loose_now[i], loose_now[j]):
                            trial = apply_moves(cur.copy(), seq)
                            if wings_attached(trial) <= base:
                                continue
                            repair = solve_centers(trial)
                            if repair is None:
                                continue
                            rm = [m for st in repair for m in st['moves']]
                            # the swap toggles wing parity (that's the point);
                            # the repair must not toggle it back — try the
                            # next conjugation variant if it does
                            if _wing_perm_parity(seq + rm) != 1:
                                continue
                            cur = apply_moves(trial, rm)
                            stages.append({'name': 'wing parity fix', 'kind': 'pairing',
                                           'moves': seq + rm})
                            parity_fixes += 1
                            fixed = True
                            break
                        if fixed:
                            break
                    if fixed:
                        break
                if not fixed:
                    return None
                continue
            cur = chosen['state']
            stages.append({'name': 'reshape edges', 'kind': 'pairing', 'moves': chosen['moves']})
            continue
        cur = best['state']
        stages.append({
            'name': f"attach wings ({base} → {base + best['gain']})",
            'kind': 'pairing',
            'moves': best['moves'],
        })
    return None


# ── Full solve ────────────────────────────────────────────────────────────────

def solve_555(scramble: str, cfop_face: str = 'D',
              beam_width: int = 4, try_xcross: bool = True) -> dict:
    import kociemba
    from cfop import solve_cfop

    t0 = time.perf_counter()
    state = from_scramble(scramble)
    stages: List[dict] = []

    center_stages = solve_centers(state)
    if center_stages is None:
        raise RuntimeError('5x5 center solver failed')
    for st in center_stages:
        state = apply_moves(state, st['moves'])
    stages += center_stages
    assert centers_solved(state)

    pairing_stages = solve_pairing(state)
    if pairing_stages is None:
        raise RuntimeError('5x5 edge grouping failed')
    for st in pairing_stages:
        state = apply_moves(state, st['moves'])
    stages += pairing_stages
    assert centers_solved(state) and all_paired(state)

    solution = kociemba.solve(to_3x3_facelet(state))
    kmoves = solution.split() if solution.strip() else []
    virtual_scramble = ' '.join(invert_moves(kmoves))
    cfop = solve_cfop(virtual_scramble, face=cfop_face,
                      beam_width=beam_width, try_xcross=try_xcross)
    rotation = cfop['rotation']
    if rotation:
        raise RuntimeError('5x5 3x3-stage rotation unsupported')  # face='D' never rotates
    for st in cfop['stages']:
        state = apply_moves(state, st['moves'])
        stages.append({'name': st['name'], 'kind': st['kind'], 'moves': st['moves']})

    if not is_solved(state):
        raise RuntimeError('5x5 pipeline finished unsolved')

    for st in stages:
        st['move_count'] = len(st['moves'])
    reduction = sum(s['move_count'] for s in stages if s['kind'] in ('centers', 'pairing'))
    total = sum(s['move_count'] for s in stages)
    return {
        'puzzle': '555',
        'stages': stages,
        'reduction_moves': reduction,
        'total_moves': total,
        'solution': ' '.join(m for st in stages for m in st['moves']),
        'time_ms': (time.perf_counter() - t0) * 1000,
    }
