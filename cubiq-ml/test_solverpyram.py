"""Pyraminx solver tests: God's-number self-check + cubing.js referee."""
import json
import random
import subprocess
import time
from pathlib import Path

from solverpyram import get_table, solve_pyram, N_REACHABLE

random.seed(9)

print('1) building/loading God table...', flush=True)
t0 = time.perf_counter()
dist = get_table()
print(f'   {time.perf_counter() - t0:.1f}s', flush=True)
reached = int((dist != 255).sum())
assert reached == N_REACHABLE, f'{reached} != {N_REACHABLE}'
assert int(dist[dist != 255].max()) == 11, f"God's number should be 11, got {dist[dist != 255].max()}"
print(f"   {reached} states reached (exactly the even-parity half); max distance 11 (God's number ok)", flush=True)

print('2) solving 40 random scrambles...', flush=True)
CORE = [f + s for f in 'ULRB' for s in ['', "'", '2']]
TIPS = ['u', 'l', 'r', 'b']

pairs = []
lengths, times = [], []
for _ in range(40):
    scr = [random.choice(CORE) for _ in range(11)]
    for t in TIPS:
        k = random.randint(0, 2)
        if k == 1:
            scr.append(t)
        elif k == 2:
            scr.append(t + "'")
    scramble = ' '.join(scr)
    t0 = time.perf_counter()
    r = solve_pyram(scramble)
    times.append(time.perf_counter() - t0)
    core_len = sum(1 for m in r['moves'] if m[0] in 'ULRB')
    assert core_len <= 11, (scramble, r['moves'])
    lengths.append(r['move_count'])
    pairs.append({'scramble': scramble, 'solution': ' '.join(r['moves'])})
    for alt in r['alternatives']:
        pairs.append({'scramble': scramble, 'solution': ' '.join(alt)})
print(f"   avg {sum(lengths)/len(lengths):.1f} moves (incl. tips), avg {sum(times)/len(times)*1000:.1f}ms", flush=True)

print(f'3) cubing.js referee on {len(pairs)} (scramble, solution) pairs...', flush=True)
Path('/tmp_pyram_pairs.json') if False else None
pairs_file = Path(__file__).parent / 'tables' / '_pyram_pairs.json'
pairs_file.parent.mkdir(exist_ok=True)
pairs_file.write_text(json.dumps(pairs))
script = r'''
import { puzzles } from 'cubing/puzzles'
import { Alg } from 'cubing/alg'
import { readFileSync } from 'fs'
const kp = await puzzles['pyraminx'].kpuzzle()
const pairs = JSON.parse(readFileSync(process.argv[1], 'utf8'))
let bad = 0
for (const { scramble, solution } of pairs) {
  const t = kp.algToTransformation(new Alg(scramble + ' ' + solution)).transformationData
  for (const [orbit, data] of Object.entries(t)) {
    const n = data.permutation.length
    for (let i = 0; i < n; i++) {
      if (data.permutation[i] !== i || data.orientationDelta[i] !== 0) { bad++; console.log('FAIL', scramble, '|', solution); i = n; break }
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

print('ALL PYRAMINX TESTS PASSED', flush=True)
