"""
Megaminx last layer: discovered-macro solver.

Macros are commutators [a,b] and conjugated commutators c [a,b] c' over
the U face and its 5 adjacent faces, kept iff they leave every non-LL
piece untouched. Their net effects on the 5 LL edges / 5 LL corners are
small permutation+orientation maps, so the LL is solved in two staged
BFS passes over macro alphabets:

  1. edges: all LL-preserving macros (plus bare U turns), state space
     60 even perms x 16 flips = 960
  2. corners: only macros whose edge effect is identity, state space
     60 even perms x 81 twists = 4860

Both spaces are fully enumerable, so coverage is testable, and BFS gives
macro-count-minimal solutions.
"""
from __future__ import annotations
import itertools
from typing import Dict, List, Optional, Tuple

import numpy as np

from megaengine import (
    MegaState, FACES, ETRANS, CTRANS, SOLVED_E, SOLVED_C,
    EDGE_CLASSES, CORNER_CLASSES, _U_ADJ,
)

LL_EDGE_SLOTS = EDGE_CLASSES['ll']        # 5 global edge slots
LL_CORNER_SLOTS = CORNER_CLASSES['ll']    # 5 global corner slots
_LL_E_INDEX = {s: i for i, s in enumerate(LL_EDGE_SLOTS)}
_LL_C_INDEX = {s: i for i, s in enumerate(LL_CORNER_SLOTS)}

_AMOUNTS = ['', '2', "'", "2'"]
_ALPHABET = [f + a for f in ['U'] + sorted(_U_ADJ) for a in _AMOUNTS]  # 24
_U_MOVES = ['U' + a for a in _AMOUNTS]


def _inv_move(m: str) -> str:
    base = m.rstrip("'2")
    suf = m[len(base):]
    return base + {'': "'", '2': "2'", "'": '', "2'": '2'}[suf]


def _seq_maps(seq: List[str]) -> Tuple[np.ndarray, np.ndarray]:
    e = np.arange(60, dtype=np.int64)
    c = np.arange(60, dtype=np.int64)
    for m in seq:
        e = ETRANS[m][e]
        c = CTRANS[m][c]
    return e, c


def _preserves_non_ll(e_map: np.ndarray, c_map: np.ndarray) -> bool:
    for s in range(30):
        if s not in _LL_E_INDEX and e_map[s * 2] != s * 2:
            return False
    for s in range(20):
        if s not in _LL_C_INDEX and c_map[s * 3] != s * 3:
            return False
    return True


def _ll_effect(e_map: np.ndarray, c_map: np.ndarray) -> Tuple[tuple, tuple]:
    """Net effect on LL pieces: for each LL home slot, (dest slot idx, ori)."""
    ee = tuple(
        (_LL_E_INDEX[int(e_map[s * 2]) // 2], int(e_map[s * 2]) % 2)
        for s in LL_EDGE_SLOTS
    )
    cc = tuple(
        (_LL_C_INDEX[int(c_map[s * 3]) // 3], int(c_map[s * 3]) % 3)
        for s in LL_CORNER_SLOTS
    )
    return ee, cc


_MACROS: Optional[List[dict]] = None


def discover_ll_macros() -> List[dict]:
    global _MACROS
    if _MACROS is not None:
        return _MACROS
    candidates: List[List[str]] = [[m] for m in _U_MOVES]
    # commutators
    comms = []
    for a in _ALPHABET:
        for b in _ALPHABET:
            if a.rstrip("'2") == b.rstrip("'2"):
                continue
            comms.append([a, b, _inv_move(a), _inv_move(b)])
    candidates += comms
    # conjugated commutators
    for c in _ALPHABET:
        for comm in comms:
            candidates.append([c] + comm + [_inv_move(c)])
    # commutators with a conjugated second operand: [a, c b c'] — the classic
    # piece-isolating shape (needed for pure corner cycles/twists)
    for a in _ALPHABET:
        for c in _ALPHABET:
            if a.rstrip("'2") == c.rstrip("'2"):
                continue
            for b in _ALPHABET:
                if b.rstrip("'2") == c.rstrip("'2"):
                    continue
                # [a, y] with y = c b c'  ->  a c b c' a' c b' c'
                candidates.append([a, c, b, _inv_move(c), _inv_move(a),
                                   c, _inv_move(b), _inv_move(c)])

    seen = set()
    macros: List[dict] = []

    def consider(seq: List[str]):
        e_map, c_map = _seq_maps(seq)
        if not _preserves_non_ll(e_map, c_map):
            return
        eff = _ll_effect(e_map, c_map)
        if eff in seen:
            return
        identity = all(d == i and o == 0 for i, (d, o) in enumerate(eff[0])) and \
                   all(d == i and o == 0 for i, (d, o) in enumerate(eff[1]))
        if identity:
            return
        seen.add(eff)
        macros.append({'seq': seq, 'edges': eff[0], 'corners': eff[1]})

    for seq in candidates:
        consider(seq)
    # inverse-closure: greedy path reconstruction toward solved requires that
    # every macro's inverse is also available
    for m in list(macros):
        inv_seq = [_inv_move(x) for x in reversed(m['seq'])]
        consider(inv_seq)

    macros.sort(key=lambda m: len(m['seq']))
    _MACROS = macros
    return macros


# ── LL state encoding ─────────────────────────────────────────────────────────
# edge state: for each LL slot i, (piece index j, flip) — encode perm rank*32+flips
_FACT5 = [24, 6, 2, 1, 1]


def _perm_rank(p: List[int]) -> int:
    r = 0
    for i in range(5):
        smaller = sum(1 for j in range(i + 1, 5) if p[j] < p[i])
        r += smaller * _FACT5[i]
    return r


def _edge_state(state: MegaState) -> Tuple[int, ...]:
    """(piece_at_slot..., flip_at_slot...) for LL slots."""
    out_p = [0] * 5
    out_o = [0] * 5
    for j, piece_slot in enumerate(LL_EDGE_SLOTS):
        sub = int(state.edges[piece_slot])
        out_p[_LL_E_INDEX[sub // 2]] = j
        out_o[_LL_E_INDEX[sub // 2]] = sub % 2
    return tuple(out_p + out_o)


def _corner_state(state: MegaState) -> Tuple[int, ...]:
    out_p = [0] * 5
    out_o = [0] * 5
    for j, piece_slot in enumerate(LL_CORNER_SLOTS):
        sub = int(state.corners[piece_slot])
        out_p[_LL_C_INDEX[sub // 3]] = j
        out_o[_LL_C_INDEX[sub // 3]] = sub % 3
    return tuple(out_p + out_o)


def _apply_eff_edge(st: Tuple[int, ...], eff: tuple) -> Tuple[int, ...]:
    """eff[home_idx] = (dest_idx, ori_delta) describes where the piece that
    STARTS at slot home_idx goes. Apply to (piece_at_slot, flip_at_slot)."""
    p, o = list(st[:5]), list(st[5:])
    np_, no = [0] * 5, [0] * 5
    for src, (dest, dori) in enumerate(eff):
        np_[dest] = p[src]
        no[dest] = (o[src] + dori) % 2
    return tuple(np_ + no)


def _apply_eff_corner(st: Tuple[int, ...], eff: tuple) -> Tuple[int, ...]:
    p, o = list(st[:5]), list(st[5:])
    np_, no = [0] * 5, [0] * 5
    for src, (dest, dori) in enumerate(eff):
        np_[dest] = p[src]
        no[dest] = (o[src] + dori) % 3
    return tuple(np_ + no)


_SOLVED_LL = tuple(list(range(5)) + [0] * 5)


def _bfs_stage(macros: List[dict], key: str, apply_eff) -> Dict[tuple, Tuple[int, int]]:
    """BFS from solved over macro effects. Returns state -> (dist, macro_idx
    of the INVERSE step towards solved is reconstructed by re-search)."""
    dist: Dict[tuple, int] = {_SOLVED_LL: 0}
    frontier = [_SOLVED_LL]
    while frontier:
        nxt = []
        for st in frontier:
            for mi, m in enumerate(macros):
                ns = apply_eff(st, m[key])
                if ns not in dist:
                    dist[ns] = dist[st] + 1
                    nxt.append(ns)
        frontier = nxt
    return dist


class LLSolver:
    def __init__(self):
        macros = discover_ll_macros()
        self.edge_macros = macros  # all (U turns move edges too)
        self.corner_macros = [
            m for m in macros
            if all(d == i and o == 0 for i, (d, o) in enumerate(m['edges']))
        ]
        self.edge_dist = _bfs_stage(self.edge_macros, 'edges', _apply_eff_edge)
        self.corner_dist = _bfs_stage(self.corner_macros, 'corners', _apply_eff_corner)

    def _solve_stage(self, st, macros, key, apply_eff, dist) -> Optional[List[List[str]]]:
        if st not in dist:
            return None
        seqs: List[List[str]] = []
        while st != _SOLVED_LL:
            d = dist[st]
            for m in macros:
                ns = apply_eff(st, m[key])
                if dist.get(ns, 10 ** 9) == d - 1:
                    seqs.append(m['seq'])
                    st = ns
                    break
            else:
                return None
        return seqs

    def solve(self, state: MegaState) -> Optional[List[dict]]:
        """Returns LL stage dicts, or None if uncovered (shouldn't happen)."""
        est = _edge_state(state)
        eseqs = self._solve_stage(est, self.edge_macros, 'edges',
                                  _apply_eff_edge, self.edge_dist)
        if eseqs is None:
            return None
        cur = state.apply([m for s in eseqs for m in s])
        cst = _corner_state(cur)
        cseqs = self._solve_stage(cst, self.corner_macros, 'corners',
                                  _apply_eff_corner, self.corner_dist)
        if cseqs is None:
            return None
        return [
            {'name': 'LL edges', 'kind': 'll',
             'moves': [m for s in eseqs for m in s]},
            {'name': 'LL corners', 'kind': 'll',
             'moves': [m for s in cseqs for m in s]},
        ]
