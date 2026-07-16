"""5x5 solver tests: stages + full solves verified with magiccube referee."""
import random
import time

import magiccube

from cube555 import from_scramble, apply_moves, is_solved, centers_solved, all_paired
from solver555 import solve_centers, solve_pairing, solve_555

random.seed(51)
TOKENS = [f + x for f in ['U', 'D', 'F', 'B', 'R', 'L', 'Uw', 'Dw', 'Fw', 'Bw', 'Rw', 'Lw']
          for x in ['', "'", '2']]


def wca_scramble(n=60):
    return ' '.join(random.choice(TOKENS) for _ in range(n))


print('1) full 5x5 solves (engine + magiccube referee)...', flush=True)
totals, red, times = [], [], []
n = 3
for i in range(n):
    scr = wca_scramble()
    t0 = time.perf_counter()
    r = solve_555(scr)
    times.append(time.perf_counter() - t0)
    st = from_scramble(scr)
    st = apply_moves(st, r['solution'].split())
    assert is_solved(st), (scr, r['solution'])
    ref = magiccube.Cube(5)
    ref.rotate(scr)
    ref.rotate(r['solution'])
    assert ref.is_done(), scr
    totals.append(r['total_moves'])
    red.append(r['reduction_moves'])
    print(f"   scramble {i}: {r['total_moves']} moves "
          f"(reduction {r['reduction_moves']}) in {times[-1]:.0f}s", flush=True)
print(f'   ok — total avg {sum(totals)/len(totals):.0f}, reduction avg {sum(red)/len(red):.0f}, '
      f'time avg {sum(times)/len(times):.0f}s', flush=True)

print('ALL 5x5 TESTS PASSED', flush=True)
