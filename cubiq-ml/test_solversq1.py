"""Square-1 solver tests: engine vs cubing.js, shape stage, full solves
with a cubing.js identity referee. Solutions are applied with slash-legality
checking enabled, so an illegal slash in a solution fails loudly."""
import json
import random
import subprocess
import time
from pathlib import Path

import solversq1 as S

random.seed(41)


def random_scramble(n=12):
    w, eq = S.SOLVED, 0
    toks = []
    for _ in range(n):
        opts = [o for o in S.legal_twists(w) if o != (0, 0)]
        u, d = random.choice(opts)
        toks += [('twist', u, d), ('slash', 0, 0)]
        w, eq = S.apply_tokens(w, eq, toks[-2:])
    return S.tokens_to_str(toks)


def to_cubingjs(tokens):
    """Token sequence -> cubing.js square1 move names."""
    out = []
    for kind, u, d in tokens:
        if kind == 'slash':
            out.append('_SLASH_')
        else:
            un, dn = S._norm(u), S._norm(d)
            if un:
                out.append(f'U_SQ_{abs(un)}' + ("'" if un < 0 else ''))
            if dn:
                out.append(f'D_SQ_{abs(dn)}' + ("'" if dn < 0 else ''))
    return ' '.join(out)


print('1) engine vs cubing.js (random walks)...', flush=True)
walks = []
random.seed(42)
for _ in range(15):
    w, eq = S.SOLVED, 0
    toks = []
    for _ in range(12):
        opts = S.legal_twists(w)
        u, d = random.choice(opts)
        toks += [('twist', u, d), ('slash', 0, 0)]
        w, eq = S.apply_tokens(w, eq, toks[-2:])
    walks.append({'moves': to_cubingjs(toks), 'wedges': list(w)})

walks_file = Path(__file__).parent / 'tables' / '_sq1_walks.json'
walks_file.parent.mkdir(exist_ok=True)
walks_file.write_text(json.dumps(walks))
script = r'''
import { puzzles } from 'cubing/puzzles'
import { Alg } from 'cubing/alg'
import { readFileSync } from 'fs'
const kp = await puzzles['square1'].kpuzzle()
const walks = JSON.parse(readFileSync(process.argv[1], 'utf8'))
let bad = 0
for (const { moves, wedges } of walks) {
  const t = kp.algToTransformation(new Alg(moves)).transformationData
  const perm = t['WEDGES'].permutation
  for (let i = 0; i < 24; i++) {
    if (perm[i] !== wedges[i]) { bad++; console.log('FAIL', moves.slice(0, 40)); break }
  }
}
console.log(bad === 0 ? 'ENGINE OK' : `ENGINE FAILURES: ${bad}`)
'''
proc = subprocess.run(
    ['node', '--input-type=module', '-e', script, str(walks_file)],
    capture_output=True, text=True,
    cwd='/Users/andifathulmukminin/Documents/Project/cubiq',
)
print('   ' + proc.stdout.strip(), flush=True)
assert 'ENGINE OK' in proc.stdout, proc.stdout + proc.stderr
walks_file.unlink()

print('2) shape stage...', flush=True)
random.seed(43)
for _ in range(20):
    scr = random_scramble()
    w, eq = S.apply_tokens(S.SOLVED, 0, S.parse_scramble(scr))
    toks = S.solve_shape(w)
    assert toks is not None
    w2, _ = S.apply_tokens(w, eq, toks)
    assert S._is_cube_shape(S.shape_of(w2)), scr
print('   20/20 reach cube shape', flush=True)

print('3) piece tables...', flush=True)
T = S._tables()
assert int((T['cdist'] >= 0).sum()) == 40320
assert int((T['edist'] >= 0).sum()) == 80640
print(f"   corner 40320/40320, edge 80640/80640, "
      f"{len(T['cgens'])} corner gens, {len(T['egens'])} edge gens", flush=True)

print('4) full solves (engine-verified, legality-checked)...', flush=True)
random.seed(44)
pairs = []
totals, times = [], []
for i in range(10):
    scr = random_scramble()
    t0 = time.perf_counter()
    r = S.solve_sq1(scr)
    times.append(time.perf_counter() - t0)
    totals.append(r['total_moves'])
    all_toks = S.parse_scramble(scr) + S.parse_scramble(r['solution'])
    w, eq = S.apply_tokens(S.SOLVED, 0, all_toks, check=True)
    assert w == S.SOLVED and eq == 0, scr
    pairs.append({'moves': to_cubingjs(all_toks)})
print(f'   10/10 solved — avg {sum(totals)/len(totals):.1f} slashes, '
      f'max {max(totals)}, avg {sum(times)/len(times)*1000:.0f}ms', flush=True)

print('5) cubing.js referee on full solves...', flush=True)
pairs_file = Path(__file__).parent / 'tables' / '_sq1_pairs.json'
pairs_file.write_text(json.dumps(pairs))
script2 = r'''
import { puzzles } from 'cubing/puzzles'
import { Alg } from 'cubing/alg'
import { readFileSync } from 'fs'
const kp = await puzzles['square1'].kpuzzle()
const pairs = JSON.parse(readFileSync(process.argv[1], 'utf8'))
let bad = 0
for (const { moves } of pairs) {
  const t = kp.algToTransformation(new Alg(moves)).transformationData
  for (const orbit of Object.keys(t)) {
    const data = t[orbit]
    for (let i = 0; i < data.permutation.length; i++) {
      if (data.permutation[i] !== i || data.orientationDelta[i] !== 0) {
        bad++; console.log('FAIL', orbit); i = 1e9
      }
    }
    if (bad) break
  }
}
console.log(bad === 0 ? 'REFEREE OK' : `REFEREE FAILURES: ${bad}`)
'''
proc = subprocess.run(
    ['node', '--input-type=module', '-e', script2, str(pairs_file)],
    capture_output=True, text=True,
    cwd='/Users/andifathulmukminin/Documents/Project/cubiq',
)
print('   ' + proc.stdout.strip(), flush=True)
assert 'REFEREE OK' in proc.stdout, proc.stdout + proc.stderr
pairs_file.unlink()

print('ALL SQUARE-1 TESTS PASSED', flush=True)
