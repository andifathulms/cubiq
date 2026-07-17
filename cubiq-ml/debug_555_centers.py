"""Instrumented 5x5 centers walk — shows which stage/fallback fails."""
import sys
import time
import random

import numpy as np

from cube555 import from_scramble, apply_moves, centers_solved, FACES
from solver555 import (
    _solve_one_center, _macro_center_stage, _beam_center_stage,
    _ORBIT_GLOBAL, ORBITS, apply_moves as _am,
)

random.seed(int(sys.argv[1]) if len(sys.argv) > 1 else 41)
TOKENS = [f + x for f in ['U', 'D', 'F', 'B', 'R', 'L', 'Uw', 'Dw', 'Fw', 'Bw', 'Rw', 'Lw']
          for x in ['', "'", '2']]
scr = ' '.join(random.choice(TOKENS) for _ in range(60))
state = from_scramble(scr)
keep = []
for f in ['U', 'F', 'R', 'B', 'L']:
    fi = FACES.index(f)
    for orbit in ('x', 't'):
        states = {ob: tuple(int(state[g]) for g in _ORBIT_GLOBAL[ob]) for ob in ORBITS}
        t0 = time.perf_counter()
        mv = _solve_one_center(states, orbit, fi, keep)
        method = 'ida*'
        if mv is None:
            mv = _macro_center_stage(state, orbit, fi, keep)
            method = 'macro'
        if mv is None:
            mv = _beam_center_stage(states, orbit, fi, keep)
            method = 'beam'
        el = time.perf_counter() - t0
        if mv is None:
            print(f'{f} {orbit}: ALL FALLBACKS FAILED ({el:.1f}s)', flush=True)
            # diagnostics for macro-greedy
            orbit_idx = ORBITS[orbit]
            tslots = np.array(orbit_idx[FACES[fi]], dtype=np.int64)
            print(f'  placed now: {int((state[tslots] == fi).sum())}/4', flush=True)
            print(f'  keeps: {keep}', flush=True)
            raise SystemExit(1)
        state = apply_moves(state, mv)
        keep.append((orbit, fi))
        print(f'{f} {orbit}: {len(mv)}m via {method} in {el:.1f}s', flush=True)
print(f'ALL CENTERS (incl. D forced): {centers_solved(state)}', flush=True)
