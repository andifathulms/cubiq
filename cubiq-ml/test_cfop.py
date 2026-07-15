"""Phase C tests: full CFOP pipeline correctness (verified with pycuber)."""
import random
import time

import pycuber as pc

from solver import ALL_MOVES, FACE_ROTATION, _ROT_MAP
from cfop import solve_cfop

random.seed(99)


def random_scramble(n=20):
    return ' '.join(random.choice(ALL_MOVES) for _ in range(n))


def displayed_to_original(rotation, moves):
    """Convert post-rotation-frame moves back to the original frame."""
    inv = {v: k for k, v in _ROT_MAP[rotation].items()}
    return [inv.get(m[0], m[0]) + m[1:] for m in moves]


def is_solved(cube):
    ref = pc.Cube()
    return all(cube.get_face(f) == ref.get_face(f) for f in 'URFDLB')


print('1) D-face CFOP solves 10 random scrambles...')
totals, times = [], []
for _ in range(10):
    scr = random_scramble()
    r = solve_cfop(scr, face='D')
    all_moves = [m for st in r['stages'] for m in st['moves']]
    assert r['total_moves'] == len(all_moves)
    c = pc.Cube()
    c(pc.Formula(scr))
    c(pc.Formula(' '.join(displayed_to_original(r['rotation'], all_moves))))
    assert is_solved(c), (scr, r['solution'])
    totals.append(r['total_moves'])
    times.append(r['time_ms'])
print(f"   ok — moves avg {sum(totals)/len(totals):.1f} min {min(totals)} max {max(totals)}; "
      f"time avg {sum(times)/len(times):.0f}ms max {max(times):.0f}ms")

print('2) best-face CFOP solves 3 random scrambles...')
for _ in range(3):
    scr = random_scramble()
    r = solve_cfop(scr, face='best')
    all_moves = [m for st in r['stages'] for m in st['moves']]
    c = pc.Cube()
    c(pc.Formula(scr))
    c(pc.Formula(' '.join(displayed_to_original(r['rotation'], all_moves))))
    assert is_solved(c), (scr, r)
    stage_summary = ', '.join(f"{st['name']}:{st['move_count']}" for st in r['stages'])
    print(f"   face {r['face']} — {r['total_moves']} moves in {r['time_ms']:.0f}ms ({stage_summary})")
print('ALL PHASE C TESTS PASSED')
