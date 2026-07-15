"""End-to-end 4x4 pipeline test, verified with the magiccube referee."""
import random
import time

import magiccube

from cube444 import from_scramble, apply_moves, is_solved
from cfop444 import solve_444, OLL_PARITY, PLL_PARITY
from cube444 import SOLVED, centers_solved, all_paired

random.seed(21)

TOKENS = [f + s for f in ['U', 'D', 'F', 'B', 'R', 'L', 'Uw', 'Dw', 'Fw', 'Bw', 'Rw', 'Lw']
          for s in ['', "'", '2']]

# magiccube may not know x/y/z — expand via engine-verified identities
_ROT_EXPAND = {
    'x': ['R', '2R', "2L'", "L'"], "x'": ['R', '2R', "2L'", "L'"] * 3,
    'x2': ['R', '2R', "2L'", "L'"] * 2,
    'y': ['U', '2U', "2D'", "D'"], "y'": ['U', '2U', "2D'", "D'"] * 3,
    'y2': ['U', '2U', "2D'", "D'"] * 2,
    'z': ['F', '2F', "2B'", "B'"], "z'": ['F', '2F', "2B'", "B'"] * 3,
    'z2': ['F', '2F', "2B'", "B'"] * 2,
}


def expand_rotations(moves):
    out = []
    for m in moves:
        out += _ROT_EXPAND.get(m, [m])
    return out


def random_scramble(n=40):
    return ' '.join(random.choice(TOKENS) for _ in range(n))


print('1) parity algs preserve reduction...', flush=True)
for name, alg in (('OLL', OLL_PARITY), ('PLL', PLL_PARITY)):
    s = apply_moves(SOLVED.copy(), alg)
    assert centers_solved(s), f'{name} parity breaks centers'
    assert all_paired(s), f'{name} parity breaks pairing'
print('   ok', flush=True)

print('2) full 4x4 solves (engine + magiccube referee)...', flush=True)
totals, red, times = [], [], []
parities_seen = set()
n = 6
for i in range(n):
    scr = random_scramble()
    r = solve_444(scr)
    all_moves = expand_rotations(r['solution'].split())
    # engine check
    st = from_scramble(scr)
    st = apply_moves(st, all_moves)
    assert is_solved(st), (scr, r['solution'])
    # independent referee
    ref = magiccube.Cube(4)
    ref.rotate(scr)
    ref.rotate(' '.join(all_moves))
    assert ref.is_done(), (scr, r['solution'])
    par = [s['name'] for s in r['stages'] if s['kind'] == 'parity']
    parities_seen.add(tuple(par))
    totals.append(r['total_moves'])
    red.append(r['reduction_moves'])
    times.append(r['time_ms'] / 1000)
    print(f"   scramble {i}: {r['total_moves']} moves "
          f"(reduction {r['reduction_moves']}, parity: {par or 'none'}) in {times[-1]:.1f}s", flush=True)
print(f'   ok — total avg {sum(totals)/len(totals):.0f} moves, '
      f'reduction avg {sum(red)/len(red):.0f}, time avg {sum(times)/len(times):.1f}s', flush=True)
print(f'   parity combos seen: {parities_seen}', flush=True)

print('ALL 4x4 END-TO-END TESTS PASSED', flush=True)
