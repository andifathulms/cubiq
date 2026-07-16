"""
Megaminx layer-by-layer solver: greedy piece placement + macro last layer.

Pieces below the last layer are placed one at a time (easiest first within
each class) by IDA* over the 48 face moves. The heuristic is the max over
every already-solved piece plus the target of its EXACT single-piece
distance table — admissible, so each placement is optimal given the
placement order. Solve order mirrors the human method:

  star edges (D) -> D corners -> lower-band edges -> low-mid corners ->
  middle edges -> high-mid corners -> upper-band edges -> [last layer]
"""
from __future__ import annotations
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

import time

import numpy as np

from megaengine import (
    MegaState, FACES, FACE_MOVES, ETRANS, CTRANS,
    EDGE_CLASSES, CORNER_CLASSES, EDGE_DIST, CORNER_DIST,
    EDGE_FACES, CORNER_FACES, _U_ADJ,
    SOLVED_E, SOLVED_C, parse_scramble, canonicalize,
)

_FACE_OF = {m: m.rstrip("'2") for m in FACE_MOVES}

# ── Pairwise joint distance tables (exact, lazy) ─────────────────────────────
# dist[(kindA, pieceA, kindB, pieceB)][subA*60+subB] over the 48 face moves.
# Far stronger than single-piece tables: captures "placing A forces breaking
# and restoring B".
_PAIR_CACHE: Dict[tuple, np.ndarray] = {}


def _pair_table(kind_a: str, pa: int, kind_b: str, pb: int) -> np.ndarray:
    key = (kind_a, pa, kind_b, pb)
    if key in _PAIR_CACHE:
        return _PAIR_CACHE[key]
    ta = ETRANS if kind_a == 'edge' else CTRANS
    tb = ETRANS if kind_b == 'edge' else CTRANS
    mult_a = 2 if kind_a == 'edge' else 3
    mult_b = 2 if kind_b == 'edge' else 3
    home = (pa * mult_a) * 60 + pb * mult_b
    dist = np.full(3600, 255, dtype=np.uint8)
    dist[home] = 0
    frontier = [home]
    while frontier:
        nxt = []
        for s in frontier:
            sa, sb = s // 60, s % 60
            for m in FACE_MOVES:
                ns = int(ta[m][sa]) * 60 + int(tb[m][sb])
                if dist[ns] == 255:
                    dist[ns] = dist[s] + 1
                    nxt.append(ns)
        frontier = nxt
    _PAIR_CACHE[key] = dist
    return dist

# (class name, kind, piece list) in solve order — LL handled separately
PLACEMENT_PLAN: List[Tuple[str, str, List[int]]] = [
    ('star', 'edge', EDGE_CLASSES['star']),
    ('bottom corners', 'corner', CORNER_CLASSES['bottom']),
    ('lower band', 'edge', EDGE_CLASSES['lower']),
    ('low-mid corners', 'corner', CORNER_CLASSES['lowmid']),
    ('middle band', 'edge', EDGE_CLASSES['middle']),
    ('high-mid corners', 'corner', CORNER_CLASSES['highmid']),
    ('upper band', 'edge', EDGE_CLASSES['upper']),
]


class _Budget:
    __slots__ = ('nodes',)

    def __init__(self, nodes: int):
        self.nodes = nodes


def _place(state: MegaState, solved_e: List[int], solved_c: List[int],
           target: int, kind: str, moves: Sequence[str],
           max_depth: int = 9, node_budget: int = 250_000) -> Optional[List[str]]:
    e_pieces = np.array(solved_e, dtype=np.int64)
    c_pieces = np.array(solved_c, dtype=np.int64)
    e_subs0 = state.edges[e_pieces] if len(e_pieces) else np.zeros(0, dtype=np.int64)
    c_subs0 = state.corners[c_pieces] if len(c_pieces) else np.zeros(0, dtype=np.int64)
    t_sub0 = int(state.edges[target] if kind == 'edge' else state.corners[target])
    t_row = (EDGE_DIST if kind == 'edge' else CORNER_DIST)[target]
    t_trans = [ETRANS[m] if kind == 'edge' else CTRANS[m] for m in moves]
    e_rows = EDGE_DIST[e_pieces] if len(e_pieces) else np.zeros((0, 60), dtype=np.uint8)
    c_rows = CORNER_DIST[c_pieces] if len(c_pieces) else np.zeros((0, 60), dtype=np.uint8)
    # pairwise exact tables: target vs every solved piece
    PE = (np.stack([_pair_table(kind, target, 'edge', p) for p in solved_e])
          if solved_e else np.zeros((0, 3600), dtype=np.uint8))
    PC = (np.stack([_pair_table(kind, target, 'corner', p) for p in solved_c])
          if solved_c else np.zeros((0, 3600), dtype=np.uint8))
    e_idx = np.arange(len(e_pieces))
    c_idx = np.arange(len(c_pieces))
    etr = [ETRANS[m] for m in moves]
    ctr = [CTRANS[m] for m in moves]
    faces = [_FACE_OF[m] for m in moves]
    n_moves = len(moves)
    path: List[str] = []

    def h_of(e_subs, c_subs, t_sub) -> int:
        h = int(t_row[t_sub])
        if len(e_pieces):
            h = max(h, int(e_rows[e_idx, e_subs].max()),
                    int(PE[e_idx, t_sub * 60 + e_subs].max()))
        if len(c_pieces):
            h = max(h, int(c_rows[c_idx, c_subs].max()),
                    int(PC[c_idx, t_sub * 60 + c_subs].max()))
        return h

    budget = _Budget(node_budget)

    def dfs(e_subs, c_subs, t_sub, depth, bound, last_face) -> bool:
        budget.nodes -= 1
        if budget.nodes <= 0:
            raise _OutOfBudget
        children = []
        for mi in range(n_moves):
            if faces[mi] == last_face:
                continue
            ne = etr[mi][e_subs]
            nc = ctr[mi][c_subs]
            nt = int(t_trans[mi][t_sub])
            if nt == t_sub and np.array_equal(ne, e_subs) and np.array_equal(nc, c_subs):
                continue
            h = h_of(ne, nc, nt)
            if depth + 1 + h > bound:
                continue
            children.append((h, mi, ne, nc, nt))
        children.sort(key=lambda x: x[0])
        for h, mi, ne, nc, nt in children:
            path.append(moves[mi])
            if h == 0:
                return True
            if dfs(ne, nc, nt, depth + 1, bound, faces[mi]):
                return True
            path.pop()
        return False

    h0 = h_of(e_subs0, c_subs0, t_sub0)
    if h0 == 0:
        return []
    try:
        for bound in range(h0, max_depth + 1):
            path.clear()
            if dfs(e_subs0, c_subs0, t_sub0, 0, bound, ''):
                return list(path)
    except _OutOfBudget:
        return None
    return None


class _OutOfBudget(Exception):
    pass


def _tiered_place(cur: MegaState, solved_e: List[int], solved_c: List[int],
                  target: int, kind: str, moves: Sequence[str]) -> Optional[List[str]]:
    """Tiered alphabets: local faces first (human-style insertions), widening
    on failure. Restricted alphabets stay admissible because the distance
    tables are computed over the full move set."""
    if kind == 'edge':
        cur_slot = int(cur.edges[target]) // 2
        local = set(EDGE_FACES[target]) | set(EDGE_FACES[cur_slot]) | {'U'}
    else:
        cur_slot = int(cur.corners[target]) // 3
        local = set(CORNER_FACES[target]) | set(CORNER_FACES[cur_slot]) | {'U'}
    tier1 = [m for m in moves if _FACE_OF[m] in local]
    tier2 = [m for m in moves if _FACE_OF[m] in (local | _U_ADJ)]
    for alphabet, depth, budget in ((tier1, 8, 80_000), (tier2, 8, 150_000),
                                    (moves, 10, 500_000)):
        sol = _place(cur, solved_e, solved_c, target, kind, alphabet,
                     max_depth=depth, node_budget=budget)
        if sol is not None:
            return sol
    return None


def _place_with_fallbacks(cur: MegaState, solved_e: List[int], solved_c: List[int],
                          target: int, kind: str, moves: Sequence[str]) -> Optional[List[str]]:
    sol = _tiered_place(cur, solved_e, solved_c, target, kind, moves)
    if sol is not None:
        return sol
    # last resort: temporarily un-preserve one solved piece (the blocker),
    # place the target, then re-place the dropped piece
    droppables = [('edge', p) for p in solved_e] + [('corner', p) for p in solved_c]
    for dk, dp in droppables[::-1][:8]:   # most recently solved first
        se = [p for p in solved_e if not (dk == 'edge' and p == dp)]
        sc = [p for p in solved_c if not (dk == 'corner' and p == dp)]
        sol1 = _tiered_place(cur, se, sc, target, kind, moves)
        if sol1 is None:
            continue
        mid = cur.apply(sol1)
        se2 = se + ([target] if kind == 'edge' else [])
        sc2 = sc + ([target] if kind == 'corner' else [])
        sol2 = _tiered_place(mid, se2, sc2, dp, dk, moves)
        if sol2 is not None:
            return sol1 + sol2
    return None


def solve_placement(state: MegaState) -> Optional[Tuple[List[dict], MegaState]]:
    """Place everything below the last layer. Returns (stages, new state)."""
    cur = state.copy()
    solved_e: List[int] = []
    solved_c: List[int] = []
    stages: List[dict] = []

    for name, kind, pieces in PLACEMENT_PLAN:
        # D moves are useless once the D layer is done
        moves = FACE_MOVES
        if name not in ('star', 'bottom corners'):
            moves = [m for m in FACE_MOVES if _FACE_OF[m] != 'D']
        remaining = list(pieces)
        stage_moves: List[str] = []
        while remaining:
            # easiest-first: pick the remaining piece with the smallest
            # current exact distance
            def cur_dist(p):
                return (EDGE_DIST[p][int(cur.edges[p])] if kind == 'edge'
                        else CORNER_DIST[p][int(cur.corners[p])])
            remaining.sort(key=cur_dist)
            target = remaining.pop(0)
            sol = _place_with_fallbacks(cur, solved_e, solved_c, target, kind, moves)
            if sol is None:
                return None
            cur = cur.apply(sol)
            stage_moves += sol
            if kind == 'edge':
                solved_e.append(target)
            else:
                solved_c.append(target)
        stages.append({'name': name, 'kind': 'placement', 'moves': stage_moves})
    return stages, cur


# ── Full solve ────────────────────────────────────────────────────────────────

_LL: Optional['object'] = None


def _get_ll():
    global _LL
    if _LL is None:
        from megall import LLSolver
        _LL = LLSolver()
    return _LL


def solve_mega(scramble: str) -> dict:
    """Full megaminx solve. Returns staged breakdown; moves are translated
    into the original (scramble) frame, so they are performable as read."""
    t0 = time.perf_counter()
    state = MegaState().apply(parse_scramble(scramble))
    canon, ftrans, _rot = canonicalize(state)

    placed = solve_placement(canon)
    if placed is None:
        raise RuntimeError('megaminx placement failed')
    stages, cur = placed

    ll_stages = _get_ll().solve(cur)
    if ll_stages is None:
        raise RuntimeError('megaminx last layer not covered (unexpected)')
    for st in ll_stages:
        cur = cur.apply(st['moves'])
    stages = stages + ll_stages

    if not (np.array_equal(cur.edges, SOLVED_E) and np.array_equal(cur.corners, SOLVED_C)):
        raise RuntimeError('megaminx pipeline finished unsolved')

    # translate canonical-frame moves into the original frame
    for st in stages:
        st['moves'] = [ftrans[m] for m in st['moves']]
        st['move_count'] = len(st['moves'])
    total = sum(st['move_count'] for st in stages)
    return {
        'puzzle': 'minx',
        'stages': stages,
        'total_moves': total,
        'solution': ' '.join(m for st in stages for m in st['moves']),
        'time_ms': (time.perf_counter() - t0) * 1000,
    }
