"""
4x4 reduction solver, stages 1-2: centers and edge pairing.

Centers:
  Outer moves only spin a face's own 2x2 block (a no-op on colours), so
  centre colours are driven entirely by the 18 inner-slice moves. Each face
  is solved with IDA* over slice moves; the heuristic is the max over the
  target face and every already-solved face of an exact pattern database
  (positions of that colour's 4 stickers among the 24 centre slots,
  C(24,4)=10,626 states — admissible, built once by backward BFS).

Edge pairing:
  Outer moves preserve centres AND dedge pairing, so they are free setup
  moves. Pairing macros have the shape  slice + outer-sequence + slice⁻¹,
  which is centres-safe by construction. The macro library is DISCOVERED by
  search (not hand-typed): all short outer bodies are enumerated and a macro
  is kept iff its wing permutation merges wings from two different dedge
  positions into one. To pair a dedge: position its two wings on the macro's
  source slots (optimal BFS over outer moves, 552-state space), simulate,
  and accept the cheapest candidate that strictly increases the paired
  count. Terminates in <= 11 steps (10 -> 12 happens in one step; a lone
  unpaired dedge is impossible).
"""
from __future__ import annotations
import itertools
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

from cube444 import (
    MOVES, FACES, SOLVED, CENTER_IDX, WING_SLOTS, DEDGES,
    apply_moves, centers_solved, dedge_paired, paired_count,
)

# ── Move groups ───────────────────────────────────────────────────────────────
_SUFFIXES = ['', "'", '2']
OUTER_MOVES = [f + s for f in FACES for s in _SUFFIXES]                    # 18
SLICE_MOVES = ['2' + f + s for f in FACES for s in _SUFFIXES]              # 18
SLICE_QUARTERS = ['2' + f + s for f in FACES for s in ['', "'"]]           # 12
SLICE_SANDWICH = SLICE_QUARTERS + ['2' + f + '2' for f in FACES]           # + halves

_LAYER = {m: m.rstrip("'2") for m in OUTER_MOVES + SLICE_MOVES}

# Axis + layer id for commuting-move pruning: layers on the same axis commute,
# so only allow them in canonical (strictly increasing layer id) order.
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


# ── Centre-slot permutations (24 global centre stickers) ─────────────────────
CENTER_GLOBAL: List[int] = [i for f in FACES for i in CENTER_IDX[f]]
_CENTER_POS = {g: i for i, g in enumerate(CENTER_GLOBAL)}

# Outer moves matter too: they rotate a face's own centre stickers among
# themselves, which changes the state whenever that face holds mixed colours.
CENTER_SEARCH_MOVES = SLICE_MOVES + OUTER_MOVES

CPERM: Dict[str, Tuple[int, ...]] = {}
for _m in CENTER_SEARCH_MOVES:
    p = MOVES[_m]
    CPERM[_m] = tuple(_CENTER_POS[p[g]] for g in CENTER_GLOBAL)

_CENTER_FACE = [i // 4 for i in range(24)]   # colour of each centre slot when solved


def _apply_cperm(centers: Tuple[int, ...], move: str) -> Tuple[int, ...]:
    perm = CPERM[move]
    return tuple(centers[perm[i]] for i in range(24))


# ── Centre PDBs: exact distance to "this colour's 4 stickers on face f" ─────
_CENTER_PDB: Dict[int, Dict[int, int]] = {}


def _center_pdb(face_idx: int) -> Dict[int, int]:
    if face_idx in _CENTER_PDB:
        return _CENTER_PDB[face_idx]
    goal = 0
    for slot in range(face_idx * 4, face_idx * 4 + 4):
        goal |= 1 << slot
    dist = {goal: 0}
    frontier = [goal]
    while frontier:
        nxt = []
        for mask in frontier:
            for move in CENTER_SEARCH_MOVES:
                perm = CPERM[move]
                # slot j receives from perm[j]; sticker at slot i goes to inv[i]
                new_mask = 0
                for j in range(24):
                    if mask >> perm[j] & 1:
                        new_mask |= 1 << j
                if new_mask not in dist:
                    dist[new_mask] = dist[mask] + 1
                    nxt.append(new_mask)
        frontier = nxt
    _CENTER_PDB[face_idx] = dist
    return dist


def _color_mask(centers: Sequence[int], color: int) -> int:
    mask = 0
    for i, c in enumerate(centers):
        if c == color:
            mask |= 1 << i
    return mask


def _centers_h(centers: Sequence[int], faces: Sequence[int]) -> int:
    h = 0
    for f in faces:
        d = _center_pdb(f)[_color_mask(centers, f)]
        if d > h:
            h = d
    return h


def _solve_one_center(centers: Tuple[int, ...], target: int, keep: List[int],
                      max_depth: int = 16) -> Optional[List[str]]:
    """IDA* over slice moves: put `target` colour's stickers on face `target`
    while faces in `keep` stay solved."""
    faces = keep + [target]
    path: List[str] = []

    def goal(c: Tuple[int, ...]) -> bool:
        return all(c[i] == f for f in faces for i in range(f * 4, f * 4 + 4))

    def dfs(c: Tuple[int, ...], depth: int, bound: int,
            last_axis: int, last_layer_id: int) -> bool:
        h = _centers_h(c, faces)
        if depth + h > bound:
            return False
        if h == 0 and goal(c):
            return True
        for move in CENTER_SEARCH_MOVES:
            axis = _MOVE_AXIS[move]
            lid = _MOVE_LAYER_ID[move]
            # same layer twice is redundant; commuting layers only in order
            if axis == last_axis and lid <= last_layer_id:
                continue
            path.append(move)
            if dfs(_apply_cperm(c, move), depth + 1, bound, axis, lid):
                return True
            path.pop()
        return False

    for bound in range(max_depth + 1):
        path.clear()
        if dfs(centers, 0, bound, -1, -1):
            return list(path)
    return None


def solve_centers(state: np.ndarray) -> Optional[List[dict]]:
    """Solve all 6 centres (fixed colour scheme). Returns stage dicts."""
    centers = tuple(int(state[g]) for g in CENTER_GLOBAL)
    order = [FACES.index(f) for f in ['U', 'D', 'F', 'R', 'B']]  # L follows
    stages = []
    solved: List[int] = []
    for target in order:
        moves = _solve_one_center(centers, target, solved)
        if moves is None:
            return None
        for m in moves:
            centers = _apply_cperm(centers, m)
        solved.append(target)
        stages.append({'name': f'{FACES[target]} center', 'kind': 'centers', 'moves': moves})
    return stages


# ── Wing-slot permutations ────────────────────────────────────────────────────
# Wings move as units between the 24 wing slots. WPERM[m][dest] = src slot.
_WING_STICKER_POS = {}
for _wi, (_a, _b) in enumerate(WING_SLOTS):
    _WING_STICKER_POS[_a] = (_wi, 0)
    _WING_STICKER_POS[_b] = (_wi, 1)

WIDE_MOVES = [f + 'w' + s for f in FACES for s in _SUFFIXES]

WPERM: Dict[str, Tuple[int, ...]] = {}
for _m in OUTER_MOVES + SLICE_MOVES + WIDE_MOVES:
    p = MOVES[_m]
    perm = []
    for _wi, (_a, _b) in enumerate(WING_SLOTS):
        src_slot, _ = _WING_STICKER_POS[p[_a]]
        perm.append(src_slot)
    WPERM[_m] = tuple(perm)

_DEDGE_OF = {}
for _di, (_w1, _w2) in enumerate(DEDGES):
    _DEDGE_OF[_w1] = _di
    _DEDGE_OF[_w2] = _di


# ── Pairing macro discovery ───────────────────────────────────────────────────

_EXTRA_BODIES = [
    ['R', 'U', "R'", 'F', "R'", "F'", 'R'],   # flip insert (last-two-edges)
    ["L'", "U'", 'L', "F'", 'L', 'F', "L'"],
]

# Known algs seeded into the macro library. OLL parity flips one dedge in
# place (with the wing-parity compensation built in) — the only fix for a
# flipped-in-place dedge, which no short slice sandwich can repair. PLL
# parity swaps two dedges. Both preserve centres.
OLL_PARITY = "2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2".split()
PLL_PARITY = "2R2 U2 2R2 Uw2 2R2 Uw2".split()
_SEED_MACROS = [OLL_PARITY, PLL_PARITY]


def _wing_perm_of(seq: List[str]) -> Tuple[int, ...]:
    perm = tuple(range(24))
    for m in seq:
        wp = WPERM[m]
        perm = tuple(perm[wp[i]] for i in range(24))
    return perm


_MACROS: Optional[List[dict]] = None


def _discover_macros(max_body: int = 3, cap: int = 200) -> List[dict]:
    """Find slice+body+slice' macros whose wing permutation merges wings from
    two different dedges into one dedge position (centres-safe by shape)."""
    global _MACROS
    if _MACROS is not None:
        return _MACROS
    bodies: List[List[str]] = []
    for ln in range(1, max_body + 1):
        for combo in itertools.product(OUTER_MOVES, repeat=ln):
            ok = all(_LAYER[combo[i]] != _LAYER[combo[i + 1]] for i in range(ln - 1))
            if ok:
                bodies.append(list(combo))
    bodies += _EXTRA_BODIES

    candidates = [[s] + body + [_inverse(s)] for s in SLICE_SANDWICH for body in bodies]
    candidates += _SEED_MACROS

    seen_perms = set()
    macros: List[dict] = []
    for seq in candidates:
            # centres-safety is NOT automatic: the outer body can rotate
            # displaced ring centres out of the closing slice's return path.
            # A macro is safe iff its centre permutation maps every face's
            # slots within that face — checked on the solved cube.
            if not centers_solved(apply_moves(SOLVED.copy(), seq)):
                continue
            perm = _wing_perm_of(seq)
            if perm in seen_perms:
                continue
            # merges: dest dedge receives wings from two different dedges.
            # flips: dest receives both wings from ONE dedge position but
            # colour-flipped (repairs a flipped-in-place dedge — the
            # last-two-edges case, unreachable by merge macros because outer
            # moves map dedge positions to dedge positions).
            merges, flips = [], []
            after = apply_moves(SOLVED.copy(), seq)
            for di, (w1, w2) in enumerate(DEDGES):
                s1, s2 = perm[w1], perm[w2]
                d1, d2 = _DEDGE_OF[s1], _DEDGE_OF[s2]
                if d1 != d2:
                    merges.append((di, s1, s2))
                elif not dedge_paired(after, di):
                    flips.append((di, s1, s2))
            if not merges and not flips:
                continue
            # l2e-capable: two merge destinations drawing from exactly the
            # same 2 source positions (fixes two crossed dedges at once)
            l2e = False
            for ii in range(len(merges)):
                for jj in range(len(merges)):
                    if ii == jj:
                        continue
                    _, x1, x2 = merges[ii]
                    _, y1, y2 = merges[jj]
                    if (len({x1, x2, y1, y2}) == 4 and
                            {_DEDGE_OF[x1], _DEDGE_OF[x2]} == {_DEDGE_OF[y1], _DEDGE_OF[y2]}):
                        l2e = True
            seen_perms.add(perm)
            macros.append({'seq': seq, 'merges': merges, 'flips': flips, 'l2e': l2e})
    macros.sort(key=lambda m: len(m['seq']))
    # keep flip- and l2e-capable macros even past the length cap
    kept = macros[:cap]
    extras = [m for m in macros[cap:] if m['flips'] or m['l2e']]
    _MACROS = kept + extras[:60]
    return _MACROS


# Inverse wing perms: where does the wing at slot i END UP after the move?
_WPERM_INV: Dict[str, Tuple[int, ...]] = {}
for _m, _wp in WPERM.items():
    inv = [0] * 24
    for _i in range(24):
        inv[_wp[_i]] = _i
    _WPERM_INV[_m] = tuple(inv)


# ── Optimal wing positioning over outer moves (552-state BFS) ────────────────

def _position_wings(w_from: Tuple[int, int], w_to: Tuple[int, int],
                    max_depth: int = 6) -> Optional[List[str]]:
    """Shortest outer-move sequence taking the wing at slot w_from[0] to
    w_to[0] and w_from[1] to w_to[1] simultaneously."""
    start = w_from
    if start == w_to:
        return []
    prev: Dict[Tuple[int, int], Tuple[Tuple[int, int], str]] = {start: (start, '')}
    frontier = [start]
    for _ in range(max_depth):
        nxt = []
        for cur in frontier:
            for m in OUTER_MOVES:
                inv = _WPERM_INV[m]
                new = (inv[cur[0]], inv[cur[1]])
                if new not in prev:
                    prev[new] = (cur, m)
                    if new == w_to:
                        path = []
                        node = new
                        while node != start:
                            node, mv = prev[node]
                            path.append(mv)
                        return list(reversed(path))
                    nxt.append(new)
        frontier = nxt
    return None


def _wing_slots_showing(state: np.ndarray, c1: int, c2: int) -> List[int]:
    out = []
    for wi, (a, b) in enumerate(WING_SLOTS):
        if {int(state[a]), int(state[b])} == {c1, c2}:
            out.append(wi)
    return out


def _pairing_candidates(cur: np.ndarray, macros: List[dict], base: int,
                        min_gain: int = 1, avoid: Optional[set] = None):
    """Yield the best (moves, gain, state) candidate with gain >= min_gain.
    With min_gain=0, candidates that merely reshape the configuration are
    allowed (used to escape endgame local optima); `avoid` filters states
    already visited to prevent cycles."""
    # The dedges that need merging are the ones whose wings OCCUPY the
    # unpaired positions (each such position holds wings from two different
    # dedges) — not the home dedges of those positions.
    unpaired = [d for d in range(12) if not dedge_paired(cur, d)]
    target_colorsets = set()
    for d in unpaired:
        for wslot in DEDGES[d]:
            a, b = WING_SLOTS[wslot]
            target_colorsets.add(frozenset((int(cur[a]), int(cur[b]))))
    targets = []
    for cs in target_colorsets:
        c1, c2 = tuple(cs)
        slots = _wing_slots_showing(cur, c1, c2)
        if len(slots) == 2:
            targets.append(slots)

    best: Optional[dict] = None
    prune = min_gain >= 1
    bfs_memo: Dict[tuple, Optional[List[str]]] = {}
    for macro in macros:  # sorted by length ascending
        if prune and best is not None and best['cost'] <= len(macro['seq']):
            break  # setup >= 0, so no later macro can beat this
        for (dest, src1, src2) in macro['merges'] + macro['flips']:
            for slots in targets:
                for assign in ((slots[0], slots[1]), (slots[1], slots[0])):
                    key = (assign, (src1, src2))
                    if key not in bfs_memo:
                        bfs_memo[key] = _position_wings(assign, (src1, src2))
                    setup = bfs_memo[key]
                    if setup is None:
                        continue
                    total = setup + macro['seq']
                    if prune and best is not None and len(total) >= best['cost']:
                        continue
                    trial = apply_moves(cur.copy(), total)
                    gain = paired_count(trial) - base
                    if gain >= min_gain and centers_solved(trial):
                        if gain == 0 and (avoid is None or trial.tobytes() in avoid):
                            continue
                        # prefer higher gain, then fewer moves
                        if best is None or (-gain, len(total)) < (-best['gain'], best['cost']):
                            best = {'moves': total, 'cost': len(total),
                                    'gain': gain, 'state': trial}
    return best


# ── Last-two-edges: simultaneous double merge ────────────────────────────────

_DIST2_CACHE: Dict[Tuple[int, int], Dict[Tuple[int, int], int]] = {}


def _dist2_table(target: Tuple[int, int]) -> Dict[Tuple[int, int], int]:
    """Exact distance (outer moves) from any ordered wing-slot pair to target."""
    if target in _DIST2_CACHE:
        return _DIST2_CACHE[target]
    dist = {target: 0}
    frontier = [target]
    while frontier:
        nxt = []
        for (u, v) in frontier:
            for m in OUTER_MOVES:
                wp = WPERM[m]  # move-inverse walk covers the group either way
                pre = (wp[u], wp[v])
                if pre not in dist:
                    dist[pre] = dist[(u, v)] + 1
                    nxt.append(pre)
        frontier = nxt
    _DIST2_CACHE[target] = dist
    return dist


def _position_four(w_from: Tuple[int, int, int, int],
                   w_to: Tuple[int, int, int, int],
                   max_depth: int = 9) -> Optional[List[str]]:
    """Outer-move sequence taking 4 wings to 4 slots simultaneously (IDA*
    with the max of two exact pair-distance tables as heuristic)."""
    dA = _dist2_table((w_to[0], w_to[1]))
    dB = _dist2_table((w_to[2], w_to[3]))
    if (w_from[0], w_from[1]) not in dA or (w_from[2], w_from[3]) not in dB:
        return None
    path: List[str] = []

    def h(s):
        return max(dA[(s[0], s[1])], dB[(s[2], s[3])])

    def dfs(s, depth, bound, last_layer):
        hh = h(s)
        if depth + hh > bound:
            return False
        if hh == 0:
            return True
        for m in OUTER_MOVES:
            if _LAYER[m] == last_layer:
                continue
            inv = _WPERM_INV[m]
            ns = (inv[s[0]], inv[s[1]], inv[s[2]], inv[s[3]])
            path.append(m)
            if dfs(ns, depth + 1, bound, _LAYER[m]):
                return True
            path.pop()
        return False

    for bound in range(max_depth + 1):
        path.clear()
        if dfs(w_from, 0, bound, ''):
            return list(path)
    return None


def _l2e_candidate(cur: np.ndarray, macros: List[dict], base: int) -> Optional[dict]:
    """Fix two broken dedges at once: place both dedges' wings on a macro's
    two merge destinations and apply it."""
    unpaired = [d for d in range(12) if not dedge_paired(cur, d)]
    colorsets = set()
    for d in unpaired:
        for wslot in DEDGES[d]:
            a, b = WING_SLOTS[wslot]
            colorsets.add(frozenset((int(cur[a]), int(cur[b]))))
    broken = []
    for cs in colorsets:
        c1, c2 = tuple(cs)
        slots = _wing_slots_showing(cur, c1, c2)
        if len(slots) == 2:
            broken.append(tuple(slots))
    if len(broken) < 2:
        return None

    # Structural constraint: outer moves carry a position's two slots
    # together, so our 4 wings (co-positioned in the 2 broken positions) can
    # only reach source quadruples drawn from exactly 2 positions with the
    # same co-position interleaving. Filter combos to those before the
    # (expensive) 4-wing positioning search.
    X, Y = broken[0], broken[1]
    # order Y so that y1 shares a position with x1
    if _DEDGE_OF[Y[0]] != _DEDGE_OF[X[0]]:
        Y = (Y[1], Y[0])
    if _DEDGE_OF[Y[0]] != _DEDGE_OF[X[0]] or _DEDGE_OF[Y[1]] != _DEDGE_OF[X[1]]:
        return None  # not the crossed structure

    for macro in macros:
        if not macro.get('l2e'):
            continue
        for i in range(len(macro['merges'])):
            for j in range(len(macro['merges'])):
                if i == j:
                    continue
                _, a1, a2 = macro['merges'][i]
                _, b1, b2 = macro['merges'][j]
                if len({a1, a2, b1, b2}) != 4:
                    continue
                # sources must span exactly the same 2 positions, interleaved
                if {_DEDGE_OF[a1], _DEDGE_OF[a2]} != {_DEDGE_OF[b1], _DEDGE_OF[b2]}:
                    continue
                bb = (b1, b2) if _DEDGE_OF[b1] == _DEDGE_OF[a1] else (b2, b1)
                for (xs, ys) in (((X[0], X[1]), (Y[0], Y[1])),
                                 ((X[1], X[0]), (Y[1], Y[0])),
                                 ((Y[0], Y[1]), (X[0], X[1])),
                                 ((Y[1], Y[0]), (X[1], X[0]))):
                    setup = _position_four((xs[0], xs[1], ys[0], ys[1]),
                                           (a1, a2, bb[0], bb[1]), max_depth=7)
                    if setup is None:
                        continue
                    total = setup + macro['seq']
                    trial = apply_moves(cur.copy(), total)
                    if paired_count(trial) > base and centers_solved(trial):
                        return {'moves': total, 'cost': len(total),
                                'gain': paired_count(trial) - base,
                                'state': trial}
    return None


def solve_pairing(state: np.ndarray, max_steps: int = 30) -> Optional[List[dict]]:
    """Pair all 12 dedges. Returns stage dicts (one per pairing step)."""
    macros = _discover_macros()
    stages: List[dict] = []
    cur = state.copy()
    shuffles = 0
    visited: set = set()

    for _step in range(max_steps):
        base = paired_count(cur)
        if base == 12:
            return stages

        best = _pairing_candidates(cur, macros, base)
        if best is None:
            # Endgame: fix two broken dedges simultaneously (double merge).
            best = _l2e_candidate(cur, macros, base)
        if best is None:
            # Last resort: a zero-gain reshape, guarded against cycles.
            if shuffles >= 6:
                return None
            shuffles += 1
            visited.add(cur.tobytes())
            best = _pairing_candidates(cur, macros, base, min_gain=0, avoid=visited)
            if best is None:
                return None
            cur = best['state']
            stages.append({'name': 'reshape edges', 'kind': 'pairing', 'moves': best['moves']})
            continue

        cur = best['state']
        stages.append({
            'name': f"pair edges ({base} → {base + best['gain']})",
            'kind': 'pairing',
            'moves': best['moves'],
        })
    return None
