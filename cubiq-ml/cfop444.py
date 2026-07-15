"""
Full 4x4 solve pipeline (reduction method):

  centers -> edge pairing -> [parity fixes] -> 3x3 stage (our CFOP solver)

After reduction the cube is read off as a 3x3 kociemba facelet string. 4x4
reduction can leave two states impossible on a real 3x3 — OLL parity (one
flipped dedge) and PLL parity (two swapped dedges). kociemba rejects those
facelets, so we probe: try to solve directly; on failure apply the OLL
parity alg, then the PLL parity alg, then both. Both algs preserve centres
and pairing, so re-extraction stays valid.

The 3x3 stage reuses the staged CFOP solver: kociemba gives any solution S
for the reduced state; inverse(S) is a virtual 3x3 scramble producing the
same state, which solve_cfop() decomposes into cross/F2L/OLL/PLL. Outer 3x3
moves map 1:1 to 4x4 outer moves, and the rotation prefix maps to x/y/z.
"""
from __future__ import annotations
import time
from typing import List, Optional

import kociemba
import numpy as np

from cube444 import (
    SOLVED, apply_moves, from_scramble, is_solved, to_3x3_facelet,
    centers_solved, all_paired, invert_moves,
)
from solver444 import solve_centers, solve_pairing, OLL_PARITY, PLL_PARITY
from cfop import solve_cfop

_PARITY_COMBOS = [
    ([], 'none'),
    ([('OLL parity', OLL_PARITY)], 'oll'),
    ([('PLL parity', PLL_PARITY)], 'pll'),
    ([('OLL parity', OLL_PARITY), ('PLL parity', PLL_PARITY)], 'both'),
]


def _try_kociemba(state: np.ndarray) -> Optional[List[str]]:
    try:
        solution = kociemba.solve(to_3x3_facelet(state))
        return solution.split() if solution.strip() else []
    except Exception:
        return None


def solve_444(scramble: str, cfop_face: str = 'D',
              beam_width: int = 4, try_xcross: bool = True) -> dict:
    """Solve a 4x4 scramble by reduction. Returns staged breakdown."""
    t0 = time.perf_counter()
    state = from_scramble(scramble)
    stages: List[dict] = []

    # ── Stage 1: centers ──
    center_stages = solve_centers(state)
    if center_stages is None:
        raise RuntimeError('center solver failed')
    for st in center_stages:
        state = apply_moves(state, st['moves'])
    stages += center_stages
    assert centers_solved(state)

    # ── Stage 2: edge pairing ──
    pairing_stages = solve_pairing(state)
    if pairing_stages is None:
        raise RuntimeError('edge pairing failed')
    for st in pairing_stages:
        state = apply_moves(state, st['moves'])
    stages += pairing_stages
    assert centers_solved(state) and all_paired(state)

    # ── Stage 3: parity probe + 3x3 solution via kociemba ──
    kociemba_moves: Optional[List[str]] = None
    for fixes, _label in _PARITY_COMBOS:
        trial = state
        for _name, alg in fixes:
            trial = apply_moves(trial, alg)
        if not (centers_solved(trial) and all_paired(trial)):
            continue
        kociemba_moves = _try_kociemba(trial)
        if kociemba_moves is not None:
            for name, alg in fixes:
                stages.append({'name': name, 'kind': 'parity', 'moves': list(alg)})
            state = trial
            break
    if kociemba_moves is None:
        raise RuntimeError('reduced state unsolvable even after parity fixes')

    # ── Stage 4: staged 3x3 CFOP on the reduced cube ──
    virtual_scramble = ' '.join(invert_moves(kociemba_moves))
    cfop = solve_cfop(virtual_scramble, face=cfop_face,
                      beam_width=beam_width, try_xcross=try_xcross)
    rotation = cfop['rotation']
    if rotation:
        state = apply_moves(state, rotation.split())
    for st in cfop['stages']:
        state = apply_moves(state, st['moves'])
        stages.append({'name': st['name'], 'kind': st['kind'], 'moves': st['moves']})

    if not is_solved(state):
        raise RuntimeError('pipeline finished but cube is not solved')

    for st in stages:
        st['move_count'] = len(st['moves'])
    reduction_moves = sum(s['move_count'] for s in stages if s['kind'] in ('centers', 'pairing', 'parity'))
    total = sum(s['move_count'] for s in stages)
    solution_parts = []
    consumed_rotation = False
    for st in stages:
        if st['kind'] in ('centers', 'pairing', 'parity'):
            solution_parts += st['moves']
        else:
            if rotation and not consumed_rotation:
                solution_parts.append(rotation)
                consumed_rotation = True
            solution_parts += st['moves']
    if rotation and not consumed_rotation:
        solution_parts.append(rotation)

    return {
        'puzzle': '444',
        'rotation': rotation,
        'cfop_face': cfop['face'],
        'stages': stages,
        'reduction_moves': reduction_moves,
        'total_moves': total,
        'solution': ' '.join(solution_parts),
        'time_ms': (time.perf_counter() - t0) * 1000,
    }
