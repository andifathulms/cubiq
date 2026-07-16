"""Megaminx solver tests: LL coverage + full solves with cubing.js referee."""
import json
import random
import subprocess
import time
from pathlib import Path

import numpy as np

import megaengine as me
from megall import LLSolver
from solvermega import solve_mega

random.seed(17)


def wca_scramble(lines=7):
    scr = []
    for _ in range(lines):
        scr += [random.choice(['R++', 'R--', 'D++', 'D--']) for _ in range(10)]
        scr.append(random.choice(['U', "U'"]))
    return ' '.join(scr)


print('1) LL macro coverage...', flush=True)
ll = LLSolver()
assert len(ll.edge_dist) == 960, len(ll.edge_dist)
assert len(ll.corner_dist) == 4860, len(ll.corner_dist)
print(f'   960/960 edge states, 4860/4860 corner states '
      f'({len(ll.edge_macros)} macros, {len(ll.corner_macros)} corner-safe)', flush=True)

print('2) full solves (engine-verified)...', flush=True)
pairs = []
totals, times = [], []
n = 3
for i in range(n):
    scramble = wca_scramble()
    t0 = time.perf_counter()
    r = solve_mega(scramble)
    times.append(time.perf_counter() - t0)
    totals.append(r['total_moves'])
    final = me.MegaState().apply(me.parse_scramble(scramble)).apply(r['solution'].split())
    canon, _, rot_idx = me.canonicalize(final)
    assert np.array_equal(canon.edges, me.SOLVED_E), scramble
    assert np.array_equal(canon.corners, me.SOLVED_C), scramble
    # rotation sequence that maps the final state to identity, for the referee
    rot_seq = me.ROT_SEQ[rot_idx]
    pairs.append({'scramble': scramble,
                  'solution': r['solution'] + (' ' + ' '.join(rot_seq) if rot_seq else '')})
    print(f"   scramble {i}: {r['total_moves']} moves in {times[-1]:.0f}s", flush=True)
print(f'   ok — avg {sum(totals)/len(totals):.0f} moves, avg {sum(times)/len(times):.0f}s', flush=True)

print('3) cubing.js referee...', flush=True)
pairs_file = Path(__file__).parent / 'tables' / '_mega_pairs.json'
pairs_file.parent.mkdir(exist_ok=True)
pairs_file.write_text(json.dumps(pairs))
script = r'''
import { puzzles } from 'cubing/puzzles'
import { Alg } from 'cubing/alg'
import { readFileSync } from 'fs'
const kp = await puzzles['megaminx'].kpuzzle()
const pairs = JSON.parse(readFileSync(process.argv[1], 'utf8'))
let bad = 0
for (const { scramble, solution } of pairs) {
  const t = kp.algToTransformation(new Alg(scramble + ' ' + solution)).transformationData
  for (const orbit of ['EDGES', 'CORNERS', 'CENTERS']) {
    const data = t[orbit]
    for (let i = 0; i < data.permutation.length; i++) {
      if (data.permutation[i] !== i || (orbit !== 'CENTERS' && data.orientationDelta[i] !== 0)) {
        bad++; console.log('FAIL', orbit, scramble.slice(0, 30)); i = 1e9
      }
    }
    if (bad) break
  }
}
console.log(bad === 0 ? 'REFEREE OK' : `REFEREE FAILURES: ${bad}`)
'''
proc = subprocess.run(
    ['node', '--input-type=module', '-e', script, str(pairs_file)],
    capture_output=True, text=True,
    cwd='/Users/andifathulmukminin/Documents/Project/cubiq',
)
print('   ' + proc.stdout.strip().replace('\n', '\n   '), flush=True)
assert 'REFEREE OK' in proc.stdout, proc.stdout + proc.stderr
pairs_file.unlink()

print('ALL MEGAMINX TESTS PASSED', flush=True)
