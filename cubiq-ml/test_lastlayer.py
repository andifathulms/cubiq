"""Phase B tests: alg validity + exhaustive OLL/PLL coverage."""
from itertools import permutations, product

from lastlayer import (
    FullState, expand_alg, solve_oll, solve_pll,
    OLL_ALGS, PLL_ALGS, _OLL_EXPANDED, _PLL_EXPANDED,
)

solved = FullState.solved()

# ── 1. Every OLL alg must preserve F2L; every PLL alg must also preserve LL
#      orientation (pure permutation) ──────────────────────────────────────────
print('1) alg validity...')
bad = []
for name, alg in _OLL_EXPANDED.items():
    if not solved.apply(alg).f2l_solved():
        bad.append(name)
for name, alg in _PLL_EXPANDED.items():
    s = solved.apply(alg)
    if not (s.f2l_solved() and s.ll_oriented()):
        bad.append(name)
if bad:
    print('   INVALID ALGS:', bad)
else:
    print('   ok (57 OLL + 21 PLL all preserve their stage invariants)')

# ── 2. Exhaustive OLL coverage: all 216 orientation signatures ────────────────
print('2) OLL coverage over all 216 orientation states...')
uncovered = []
count = 0
for eo in product((0, 1), repeat=4):
    if sum(eo) % 2:
        continue
    for co in product((0, 1, 2), repeat=4):
        if sum(co) % 3:
            continue
        count += 1
        edges = tuple((p * 2 + eo[p]) if p < 4 else p * 2 for p in range(12))
        corners = tuple((p * 3 + co[p]) if p < 4 else p * 3 for p in range(8))
        state = FullState(edges, corners)
        if solve_oll(state) is None:
            uncovered.append((eo, co))
print(f'   {count - len(uncovered)}/{count} covered' + (f'; UNCOVERED: {uncovered}' if uncovered else ''))

# ── 3. Exhaustive PLL coverage: all 288 oriented permutation states ───────────
print('3) PLL coverage over all 288 permutation states...')
def parity(p):
    inv = sum(1 for i in range(len(p)) for j in range(i + 1, len(p)) if p[i] > p[j])
    return inv % 2

pll_uncovered = []
count = 0
for pe in permutations(range(4)):
    for pc in permutations(range(4)):
        if parity(pe) != parity(pc):
            continue
        count += 1
        # piece p sits in slot pe[p] / pc[p], oriented
        edges = tuple((pe[p] * 2) if p < 4 else p * 2 for p in range(12))
        corners = tuple((pc[p] * 3) if p < 4 else p * 3 for p in range(8))
        state = FullState(edges, corners)
        if solve_pll(state) is None:
            pll_uncovered.append((pe, pc))
print(f'   {count - len(pll_uncovered)}/{count} covered' + (f'; UNCOVERED: {pll_uncovered}' if pll_uncovered else ''))

if not bad and not uncovered and not pll_uncovered:
    print('ALL PHASE B TESTS PASSED')
else:
    raise SystemExit(1)
