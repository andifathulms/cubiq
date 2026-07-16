"""Skewb solver tests: literature self-checks + cubing.js referee."""
import json
import random
import subprocess
import time
from pathlib import Path

from solverskewb import get_table, solve_skewb, N_REACHABLE

random.seed(23)

print('1) building/loading God table...', flush=True)
t0 = time.perf_counter()
keys, dists = get_table()
print(f'   {time.perf_counter() - t0:.1f}s', flush=True)
assert len(keys) == N_REACHABLE, f'{len(keys)} != {N_REACHABLE}'
assert int(dists.max()) == 11, f"God's number should be 11, got {dists.max()}"
print(f"   {len(keys)} states reached (matches literature); max distance 11 (God's number ok)", flush=True)

print('2) solving 40 random scrambles...', flush=True)
TOKENS = [f + s for f in 'ULRB' for s in ['', "'"]]
pairs, lengths, times = [], [], []
for _ in range(40):
    scramble = ' '.join(random.choice(TOKENS) for _ in range(11))
    t0 = time.perf_counter()
    r = solve_skewb(scramble)
    times.append(time.perf_counter() - t0)
    assert r['move_count'] <= 11
    lengths.append(r['move_count'])
    pairs.append({'scramble': scramble, 'solution': ' '.join(r['moves'])})
    for alt in r['alternatives']:
        assert len(alt) == r['move_count']
        pairs.append({'scramble': scramble, 'solution': ' '.join(alt)})
print(f"   avg {sum(lengths)/len(lengths):.1f} moves (max {max(lengths)}), "
      f"avg {sum(times)/len(times)*1000:.1f}ms", flush=True)

print(f'3) cubing.js referee on {len(pairs)} pairs...', flush=True)
pairs_file = Path(__file__).parent / 'tables' / '_skewb_pairs.json'
pairs_file.parent.mkdir(exist_ok=True)
pairs_file.write_text(json.dumps(pairs))
script = r'''
import { puzzles } from 'cubing/puzzles'
import { Alg } from 'cubing/alg'
import { readFileSync } from 'fs'
const kp = await puzzles['skewb'].kpuzzle()
const pairs = JSON.parse(readFileSync(process.argv[1], 'utf8'))
let bad = 0
for (const { scramble, solution } of pairs) {
  const t = kp.algToTransformation(new Alg(scramble + ' ' + solution)).transformationData
  // corners must be exactly home; centers home by position (orientation is invisible)
  const c = t.CORNERS
  for (let i = 0; i < 8; i++) {
    if (c.permutation[i] !== i || c.orientationDelta[i] !== 0) { bad++; console.log('FAIL', scramble, '|', solution); break }
  }
  const cen = t.CENTERS
  for (let i = 0; i < 6; i++) {
    if (cen.permutation[i] !== i) { bad++; console.log('FAIL(centers)', scramble); break }
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

print('ALL SKEWB TESTS PASSED', flush=True)
