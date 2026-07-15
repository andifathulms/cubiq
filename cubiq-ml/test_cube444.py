"""4x4 engine tests: algebraic identities + exact match vs magiccube referee."""
import random

import numpy as np
import magiccube

from cube444 import (
    MOVES, SOLVED, FACES, apply_moves, from_scramble, is_solved,
    WING_SLOTS, DEDGES, all_paired, centers_solved, to_3x3_facelet,
)

random.seed(3)


def state_str(state):
    return ''.join(FACES[c] for c in state)


# ── 1. Algebraic identities ───────────────────────────────────────────────────
print('1) algebraic identities...')
ident = SOLVED.copy()
for m in MOVES:
    s = apply_moves(SOLVED.copy(), [m] * 4)
    if m.endswith('2'):
        s = apply_moves(SOLVED.copy(), [m] * 2)
    assert is_solved(s), m
# x == R 2R 2L' L'
a = apply_moves(SOLVED.copy(), ['x'])
b = apply_moves(SOLVED.copy(), ['R', '2R', "2L'", "L'"])
assert np.array_equal(a, b), 'x decomposition'
# Rw == R 2R
a = apply_moves(SOLVED.copy(), ['Rw'])
b = apply_moves(SOLVED.copy(), ['R', '2R'])
assert np.array_equal(a, b), 'Rw decomposition'
# sexy move order 6 (outer moves act like 3x3)
s = SOLVED.copy()
for _ in range(6):
    s = apply_moves(s, ['R', 'U', "R'", "U'"])
assert is_solved(s), 'sexy move order 6'
print('   ok')

# ── 2. Exact match vs magiccube over random move sequences ───────────────────
print('2) exact match vs magiccube (independent implementation)...')
TOKENS = [f + s for f in ['U', 'D', 'F', 'B', 'R', 'L',
                          'Uw', 'Dw', 'Fw', 'Bw', 'Rw', 'Lw',
                          '2U', '2D', '2F', '2B', '2R', '2L']
          for s in ['', "'", '2']]
for t in range(40):
    seq = [random.choice(TOKENS) for _ in range(30)]
    mine = state_str(apply_moves(SOLVED.copy(), seq))
    ref = magiccube.Cube(4)
    ref.rotate(' '.join(seq))
    theirs = ref.get_kociemba_facelet_positions()
    assert mine == theirs, (seq, mine, theirs)
print('   ok (40 sequences x 30 moves, 96 stickers exact)')

# ── 3. Structure sanity: wings, dedges, reduced facelet ──────────────────────
print('3) piece-view sanity...')
assert len(WING_SLOTS) == 24 and len(DEDGES) == 12
assert all_paired(SOLVED) and centers_solved(SOLVED)
fl = to_3x3_facelet(SOLVED)
assert fl == ''.join(f * 9 for f in FACES)
# outer moves preserve centers and pairing
s = SOLVED.copy()
for _ in range(60):
    s = apply_moves(s, [random.choice([f + x for f in FACES for x in ['', "'", '2']])])
assert centers_solved(s) and all_paired(s), 'outer moves must preserve reduction'
print('   ok')

print('ALL 4x4 ENGINE TESTS PASSED')
