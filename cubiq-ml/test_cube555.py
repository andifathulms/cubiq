"""5x5 engine tests: algebraic identities + exact match vs magiccube."""
import random

import magiccube

from cube555 import (MOVES, SOLVED, FACES, apply_moves, is_solved,
                     WING_SLOTS, CEDGE_SLOTS, all_paired, centers_solved,
                     to_3x3_facelet)

random.seed(31)

print('1) algebraic identities...')
for m in MOVES:
    reps = 2 if m.endswith('2') else 4
    assert is_solved(apply_moves(SOLVED.copy(), [m] * reps)), m
s = SOLVED.copy()
for _ in range(6):
    s = apply_moves(s, ['R', 'U', "R'", "U'"])
assert is_solved(s)
print('   ok')

print('2) exact match vs magiccube...')
TOKENS = [f + x for f in ['U', 'D', 'F', 'B', 'R', 'L', 'Uw', 'Dw', 'Fw', 'Bw', 'Rw', 'Lw']
          for x in ['', "'", '2']]
for t in range(25):
    seq = [random.choice(TOKENS) for _ in range(30)]
    mine = ''.join(FACES[c] for c in apply_moves(SOLVED.copy(), seq))
    ref = magiccube.Cube(5)
    ref.rotate(' '.join(seq))
    assert mine == ref.get_kociemba_facelet_positions(), seq
print('   ok (25 x 30 moves, 150 stickers exact)')

print('3) piece views...')
assert len(WING_SLOTS) == 24 and len(CEDGE_SLOTS) == 12
assert all_paired(SOLVED) and centers_solved(SOLVED)
assert to_3x3_facelet(SOLVED) == ''.join(f * 9 for f in FACES)
s = SOLVED.copy()
for _ in range(60):
    s = apply_moves(s, [random.choice([f + x for f in FACES for x in ['', "'", '2']])])
assert centers_solved(s) and all_paired(s)
print('   ok')
print('ALL 5x5 ENGINE TESTS PASSED')
