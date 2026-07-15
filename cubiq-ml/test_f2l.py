"""Phase A tests: corner tables, pair solving, x-cross. Run with .venv/bin/python test_f2l.py"""
import random
import time

import pycuber as pc

from solver import ALL_MOVES, solve_all_crosses
from f2l import (
    CORNER_SLOTS, EDGE_SLOT_NAMES, F2L_PAIRS, PAIR_NAMES,
    F2LState, scramble_to_substates, solve_pairs, apply_moves,
    warm_tables, _measure_corner,
)

random.seed(7)


def random_scramble(n=20):
    return ' '.join(random.choice(ALL_MOVES) for _ in range(n))


def pieces_solved(cube, names):
    ref = pc.Cube()
    return all(cube[n] == ref[n] for n in names)


# ── 1. Corner sub-state tracking matches direct pycuber measurement ──────────
print('1) corner/edge sub-state tracking vs pycuber...')
for _ in range(50):
    scr = random_scramble()
    edge_subs, corner_subs = scramble_to_substates(scr)
    c = pc.Cube()
    c(pc.Formula(scr))
    for si, slot in enumerate(CORNER_SLOTS):
        home, ori = _measure_corner(c, slot)
        assert corner_subs[home] == si * 3 + ori, (scr, slot)
print('   ok (50 scrambles x 8 corners)')

# ── 2. Warm tables ────────────────────────────────────────────────────────────
print('2) building/loading cross+piece distance tables...')
t0 = time.perf_counter()
warm_tables()
print(f'   ok ({time.perf_counter() - t0:.1f}s)')

# ── 3. Solve cross + each single pair; verify with pycuber ───────────────────
print('3) cross + single pair (x-cross) correctness & timing...')
PAIR_CUBIES = {'FR': ['DFR', 'FR'], 'FL': ['DFL', 'FL'], 'BR': ['DBR', 'BR'], 'BL': ['DBL', 'BL']}
CROSS_CUBIES = ['DF', 'DR', 'DB', 'DL']
times, lengths = [], []
for t in range(10):
    scr = random_scramble()
    state = F2LState.from_scramble(scr)
    for pi, pname in enumerate(PAIR_NAMES):
        t0 = time.perf_counter()
        sols = solve_pairs(state, [pi], max_solutions=1)
        times.append(time.perf_counter() - t0)
        assert sols, (scr, pname)
        lengths.append(len(sols[0]))
        c = pc.Cube()
        c(pc.Formula(scr))
        if sols[0]:
            c(pc.Formula(' '.join(sols[0])))
        assert pieces_solved(c, CROSS_CUBIES + PAIR_CUBIES[pname]), (scr, pname, sols[0])
print(f'   ok (40 solves) avg {sum(times)/len(times)*1000:.0f}ms max {max(times)*1000:.0f}ms; '
      f'avg len {sum(lengths)/len(lengths):.1f} max {max(lengths)}')

# ── 4. Sequential F2L: cross first, then pairs one by one, preserving all ────
print('4) full sequential F2L (cross -> 4 pairs)...')
times = []
for t in range(5):
    scr = random_scramble()
    cross_moves = solve_all_crosses(scr, max_alternatives=1)[0]  # D face is first
    assert cross_moves['face'] == 'D'
    all_moves = list(cross_moves['moves'])
    state = apply_moves(F2LState.from_scramble(scr), all_moves)
    solved_targets = []
    t0 = time.perf_counter()
    for pi in range(4):
        solved_targets.append(pi)
        sols = solve_pairs(state, solved_targets, max_solutions=1)
        assert sols is not None and len(sols) > 0, (scr, pi)
        state = apply_moves(state, sols[0])
        all_moves += sols[0]
    times.append(time.perf_counter() - t0)
    c = pc.Cube()
    c(pc.Formula(scr))
    c(pc.Formula(' '.join(all_moves)))
    all_cubies = CROSS_CUBIES + [n for v in PAIR_CUBIES.values() for n in v]
    assert pieces_solved(c, all_cubies), (scr, all_moves)
    print(f'   scramble {t}: F2L in {len(all_moves)} moves, pairs took {times[-1]:.2f}s')
print(f'   ok (5 full F2L) avg pair-phase {sum(times)/len(times):.2f}s')

print('ALL PHASE A TESTS PASSED')
