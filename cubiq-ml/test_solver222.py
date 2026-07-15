"""2x2 solver tests: God's-number self-check + pycuber-verified solves."""
import random
import time

import numpy as np
import pycuber as pc

from solver222 import get_table, solve_222, N_STATES

random.seed(5)

print('1) building/loading God table...', flush=True)
t0 = time.perf_counter()
dist = get_table()
print(f'   {time.perf_counter() - t0:.1f}s', flush=True)
reached = int((dist != 255).sum())
assert reached == N_STATES, f'only {reached}/{N_STATES} states reached'
assert int(dist.max()) == 11, f'God number should be 11 HTM, got {dist.max()}'
counts = {d: int((dist == d).sum()) for d in (0, 1, 11)}
assert counts[0] == 1 and counts[1] == 9, counts
print(f'   all {N_STATES} states reached; max distance 11 (God\'s number ok); '
      f'{counts[11]} antipodes', flush=True)

print('2) solving 40 random scrambles (incl. D/L/B moves)...', flush=True)
CORNERS = ['UFR', 'UFL', 'UBL', 'UBR', 'DFR', 'DFL', 'DBL', 'DBR']
ALL = [f + s for f in 'URFDLB' for s in ['', "'", '2']]
URF = [f + s for f in 'URF' for s in ['', "'", '2']]

def corners_solved_2x2(cube):
    """All 8 corners form a solved 2x2: each face's 4 corner stickers equal."""
    for face in 'URFDLB':
        g = cube.get_face(face)
        cs = [str(g[r][c]).strip('[]') for r, c in ((0, 0), (0, 2), (2, 0), (2, 2))]
        if len(set(cs)) != 1:
            return False
    return True

lengths, times = [], []
for i in range(40):
    pool = URF if i % 2 == 0 else ALL   # half WCA-style, half arbitrary faces
    scr = ' '.join(random.choice(pool) for _ in range(11))
    t0 = time.perf_counter()
    r = solve_222(scr)
    times.append(time.perf_counter() - t0)
    assert r['move_count'] <= 11
    c = pc.Cube()
    c(pc.Formula(scr))
    if r['moves']:
        c(pc.Formula(' '.join(r['moves'])))
    assert corners_solved_2x2(c), (scr, r['moves'])
    for alt in r['alternatives']:
        assert len(alt) == r['move_count']
        c2 = pc.Cube()
        c2(pc.Formula(scr))
        c2(pc.Formula(' '.join(alt)))
        assert corners_solved_2x2(c2), (scr, alt)
    lengths.append(r['move_count'])
print(f"   ok — avg {sum(lengths)/len(lengths):.1f} moves (max {max(lengths)}), "
      f"avg {sum(times)/len(times)*1000:.1f}ms per solve", flush=True)

print('ALL 2x2 TESTS PASSED', flush=True)
