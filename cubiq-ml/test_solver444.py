"""4x4 solver stage tests: centers + edge pairing (verified with magiccube)."""
import random
import time

import magiccube

from cube444 import (
    SOLVED, FACES, apply_moves, from_scramble,
    centers_solved, all_paired, paired_count,
)
from solver444 import solve_centers, solve_pairing, _discover_macros

random.seed(11)

TOKENS = [f + s for f in ['U', 'D', 'F', 'B', 'R', 'L', 'Uw', 'Dw', 'Fw', 'Bw', 'Rw', 'Lw']
          for s in ['', "'", '2']]


def random_scramble(n=40):
    return ' '.join(random.choice(TOKENS) for _ in range(n))


print('0) macro discovery...')
t0 = time.perf_counter()
macros = _discover_macros()
print(f'   {len(macros)} merge macros found in {time.perf_counter() - t0:.1f}s')
assert len(macros) >= 10

print('1) centers on 5 random scrambles...')
center_lens, times = [], []
for i in range(5):
    scr = random_scramble()
    state = from_scramble(scr)
    t0 = time.perf_counter()
    stages = solve_centers(state)
    times.append(time.perf_counter() - t0)
    assert stages is not None, scr
    moves = [m for st in stages for m in st['moves']]
    state = apply_moves(state, moves)
    assert centers_solved(state), (scr, moves)
    center_lens.append(len(moves))
    print(f'   scramble {i}: centers in {len(moves)} slice moves, {times[-1]:.1f}s')
print(f'   ok — avg {sum(center_lens)/len(center_lens):.1f} moves, avg {sum(times)/len(times):.1f}s')

print('2) edge pairing on the same pipeline...')
pair_lens, times = [], []
for i in range(5):
    scr = random_scramble()
    state = from_scramble(scr)
    cstages = solve_centers(state)
    assert cstages is not None
    state = apply_moves(state, [m for st in cstages for m in st['moves']])
    t0 = time.perf_counter()
    pstages = solve_pairing(state)
    times.append(time.perf_counter() - t0)
    assert pstages is not None, scr
    moves = [m for st in pstages for m in st['moves']]
    state = apply_moves(state, moves)
    assert centers_solved(state), 'pairing must preserve centers'
    assert all_paired(state), (scr, paired_count(state))
    pair_lens.append(len(moves))
    print(f'   scramble {i}: paired in {len(moves)} moves ({len(pstages)} steps), {times[-1]:.1f}s')
print(f'   ok — avg {sum(pair_lens)/len(pair_lens):.1f} moves, avg {sum(times)/len(times):.1f}s')

print('3) magiccube referee on reduction...')
scr = random_scramble()
state = from_scramble(scr)
all_moves = []
for solver in (solve_centers, solve_pairing):
    stages = solver(state)
    assert stages is not None
    mv = [m for st in stages for m in st['moves']]
    state = apply_moves(state, mv)
    all_moves += mv
ref = magiccube.Cube(4)
ref.rotate(scr)
ref.rotate(' '.join(all_moves))
facelets = ref.get_kociemba_facelet_positions()
# centres solved in referee too
for fi, f in enumerate(FACES):
    quad = [facelets[fi * 16 + r * 4 + c] for r in (1, 2) for c in (1, 2)]
    assert all(q == f for q in quad), (f, quad)
print('   ok — referee agrees centers are solved after full reduction')

print('ALL 4x4 STAGE TESTS PASSED')
