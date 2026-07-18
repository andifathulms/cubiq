"""
CFOP pipeline (Phase C): cross/x-cross -> F2L -> OLL -> PLL.

This is the "MDP at the decision layer": each stage is solved exactly
(cross and pairs by optimal IDA*, OLL/PLL by recognition), and the choice
layer — which cross solution, whether to x-cross, which pair next, which
optimal variant — is explored with beam search over total move count.

All work is canonicalized to the D face; other faces remap the scramble
through their rotation prefix, so returned moves are performable as read
after the prefix.
"""
from __future__ import annotations
import time
from typing import Dict, List, Optional, Sequence, Tuple

from solver import solve_all_crosses, FACE_ROTATION
from f2l import (
    F2LState, PAIR_NAMES, remap_scramble, solve_pairs, apply_moves,
    warm_tables, _heuristic,
)
from lastlayer import FullState, solve_oll, solve_pll

FACES = ['D', 'U', 'F', 'B', 'R', 'L']

_OPP = {'U': 'D', 'D': 'U', 'F': 'B', 'B': 'F', 'L': 'R', 'R': 'L'}
_AMT = {'': 1, '2': 2, "'": 3}


def _parse_face(tok: str):
    """(face, quarter-turns) for a plain face move, else None (a barrier)."""
    if len(tok) >= 1 and tok[0] in _OPP and tok[1:] in _AMT:
        return tok[0], _AMT[tok[1:]]
    return None


def _build(face: str, amt: int) -> Optional[str]:
    amt %= 4
    if amt == 0:
        return None
    return face + ('' if amt == 1 else '2' if amt == 2 else "'")


def cancel_staged(stages: List[dict]) -> Tuple[List[str], List[int]]:
    """Concatenate all stage moves and cancel redundancies — adjacent same-face
    moves (F F' → nothing, F F → F2 …) and same-face moves separated only by the
    commuting opposite face (F B F' → B). Returns the reduced move list and the
    per-stage surviving move counts (so the step markers still line up).
    Non-face tokens (rotations, wide/slice) act as barriers and never cancel."""
    seq = []  # [stage_idx, face_or_None, amt, raw_token]
    for si, st in enumerate(stages):
        for tok in st['moves']:
            p = _parse_face(tok)
            seq.append([si, p[0] if p else None, p[1] if p else 0, tok])

    out: List[list] = []
    for item in seq:
        _, f, a, _ = item
        if f is None:
            out.append(item)
            continue
        j = len(out) - 1
        while j >= 0 and out[j][1] == _OPP[f]:  # skip past commuting opposite face
            j -= 1
        if j >= 0 and out[j][1] == f:
            na = (out[j][2] + a) % 4
            if na == 0:
                out.pop(j)                      # both fully cancel
            else:
                out[j][2] = na                  # merge into the earlier move
        else:
            out.append(item)

    moves: List[str] = []
    counts = [0] * len(stages)
    for si, f, a, raw in out:
        tok = raw if f is None else _build(f, a)
        if tok:
            moves.append(tok)
            counts[si] += 1
    return moves, counts


def solve_xcross(scramble: str, face: str = 'D', max_solutions: int = 2) -> dict:
    """Optimal x-cross (cross + one F2L pair, solved jointly) for each of the
    4 pairs. Moves are in the post-rotation frame; pair names refer to slots
    as seen holding the cross face down."""
    warm_tables()
    t0 = time.perf_counter()
    remapped = remap_scramble(scramble, face)
    start = F2LState.from_scramble(remapped)
    solutions = []
    for pi, name in enumerate(PAIR_NAMES):
        sols = solve_pairs(start, [pi], max_solutions=max_solutions)
        solutions.append({
            'pair': name,
            'moves': sols[0] if sols else [],
            'move_count': len(sols[0]) if sols else 0,
            'alternatives': sols[1:],
        })
    solutions.sort(key=lambda s: s['move_count'])
    return {
        'face': face,
        'rotation': FACE_ROTATION[face],
        'solutions': solutions,
        'time_ms': (time.perf_counter() - t0) * 1000,
    }


class _Beam:
    __slots__ = ('moves', 'stages', 'state', 'solved')

    def __init__(self, moves: List[str], stages: List[dict], state: F2LState, solved: Tuple[int, ...]):
        self.moves = moves
        self.stages = stages
        self.state = state
        self.solved = solved

    def score(self) -> int:
        unsolved = [p for p in range(4) if p not in self.solved]
        return len(self.moves) + (_heuristic(self.state, unsolved) if unsolved else 0)


def solve_cfop_face(
    scramble: str,
    face: str = 'D',
    beam_width: int = 4,
    cross_alternatives: int = 2,
    pair_variants: int = 2,
    try_xcross: bool = True,
) -> dict:
    """Solve one cross face. Returns stages + totals; moves are expressed in
    the post-rotation frame (perform the rotation prefix first)."""
    warm_tables()
    t0 = time.perf_counter()
    remapped = remap_scramble(scramble, face)
    start = F2LState.from_scramble(remapped)

    # ── Stage 1: cross starts (plus optional x-cross starts) ──
    cross = next(s for s in solve_all_crosses(remapped, max_alternatives=cross_alternatives)
                 if s['face'] == 'D')
    beams: List[_Beam] = []
    for moves in [cross['moves']] + cross['alternatives']:
        beams.append(_Beam(
            list(moves),
            [{'name': 'cross', 'kind': 'cross', 'moves': list(moves)}],
            apply_moves(start, moves),
            (),
        ))
    if try_xcross:
        for pi in range(4):
            for sol in solve_pairs(start, [pi], max_solutions=1):
                beams.append(_Beam(
                    list(sol),
                    [{'name': f'x-cross ({PAIR_NAMES[pi]})', 'kind': 'xcross', 'moves': list(sol)}],
                    apply_moves(start, sol),
                    (pi,),
                ))

    # ── Stage 2: beam search over pair order and solution variants ──
    for level in range(4):
        expandable = [b for b in beams if len(b.solved) == level]
        rest = [b for b in beams if len(b.solved) != level]
        nxt: List[_Beam] = []
        seen = set()
        for b in expandable:
            for pi in range(4):
                if pi in b.solved:
                    continue
                targets = list(b.solved) + [pi]
                for sol in solve_pairs(b.state, targets, max_solutions=pair_variants):
                    nb = _Beam(
                        b.moves + list(sol),
                        b.stages + [{'name': f'pair {PAIR_NAMES[pi]}', 'kind': 'f2l', 'moves': list(sol)}],
                        apply_moves(b.state, sol),
                        tuple(sorted(targets)),
                    )
                    key = (nb.state.key(), nb.solved, len(nb.moves))
                    if key not in seen:
                        seen.add(key)
                        nxt.append(nb)
        nxt.sort(key=_Beam.score)
        beams = rest + nxt[:beam_width]

    finished = [b for b in beams if len(b.solved) == 4]
    finished.sort(key=lambda b: len(b.moves))

    # ── Stage 3: OLL + PLL on the best F2L candidates ──
    best: Optional[dict] = None
    for b in finished[:beam_width]:
        full = FullState.from_scramble(remapped).apply(b.moves)
        oll = solve_oll(full)
        if oll is None:
            continue
        full2 = full.apply(oll['moves'])
        pll = solve_pll(full2)
        if pll is None:
            continue
        stages = b.stages + [
            {'name': oll['case'] if oll['case'] != 'skip' else 'OLL skip',
             'kind': 'oll', 'moves': oll['moves']},
            {'name': f"PLL {pll['case']}" if pll['case'] != 'skip' else 'PLL skip',
             'kind': 'pll', 'moves': pll['moves']},
        ]
        total = b.moves + oll['moves'] + pll['moves']
        for st in stages:
            st['move_count'] = len(st['moves'])
        # Cancel redundant moves across stage boundaries (e.g. a pair ending in F
        # and the next starting F'). The staged list keeps the full, readable
        # moves; the executed solution and move count are reduced. Selection is
        # on the reduced count — the metric a solver actually cares about.
        reduced, eff_counts = cancel_staged(stages)
        if best is None or len(reduced) < best['total_moves']:
            for st, ec in zip(stages, eff_counts):
                st['eff_move_count'] = ec
            rotation = FACE_ROTATION[face]
            best = {
                'face': face,
                'rotation': rotation,
                'stages': stages,
                'staged_moves': len(total),
                'total_moves': len(reduced),
                'solution': (rotation + ' ' if rotation else '') + ' '.join(reduced),
            }

    if best is None:
        raise RuntimeError('CFOP pipeline produced no solution (unexpected)')
    best['time_ms'] = (time.perf_counter() - t0) * 1000
    return best


def solve_cfop(
    scramble: str,
    face: str = 'D',
    beam_width: int = 4,
    cross_alternatives: int = 2,
    pair_variants: int = 2,
    try_xcross: bool = True,
) -> dict:
    """face may be a specific face or 'best' (try all 6, return the shortest)."""
    if face != 'best':
        return solve_cfop_face(scramble, face, beam_width, cross_alternatives,
                               pair_variants, try_xcross)
    t0 = time.perf_counter()
    results = [solve_cfop_face(scramble, f, beam_width, cross_alternatives,
                               pair_variants, try_xcross) for f in FACES]
    best = min(results, key=lambda r: r['total_moves'])
    best['time_ms'] = (time.perf_counter() - t0) * 1000
    return best
