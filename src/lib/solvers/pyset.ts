// Iteration order of a CPython set of 2-element frozensets of small ints.
//
// cubiq-ml's 4x4 pairing iterates such a set, and that order breaks ties
// between equally good candidates. CPython's order is deterministic (int
// and frozenset hashes are not randomised), so it is emulated here — the
// 64-bit frozenset hash and set insertion with linear probing, perturbation
// and resizing (CPython 3.x setobject.c) — to reproduce the Python choices.

// (BigInt() calls rather than literals: the project targets ES2017)
const B = BigInt
const M64 = (B(1) << B(64)) - B(1)
const [N1, N2, N5, N11, N16, N25] = [1, 2, 5, 11, 16, 25].map(B)

const shuffleBits = (h: bigint) => (((h ^ B(89869747)) ^ (h << N16)) * B(3644798167)) & M64

/** hash(frozenset({a, b})) for distinct small non-negative ints, as uint64 */
function frozensetPairHash(a: number, b: number): bigint {
  // the 6 empty slots of its 8-slot table cancel out (even count)
  let h = shuffleBits(BigInt(a)) ^ shuffleBits(BigInt(b))
  h ^= (N2 + N1) * B(1927868237)
  h &= M64
  h ^= (h >> N11) ^ (h >> N25)
  h = (h * B(69069) + B(907133923)) & M64
  if (h === M64) h = B(590923713)
  return h
}

const LINEAR_PROBES = 9

function insertClean(table: (bigint | null)[], mask: number, hash: bigint) {
  let perturb = hash
  let i = Number(hash & B(mask))
  for (;;) {
    if (table[i] === null) { table[i] = hash; return }
    if (i + LINEAR_PROBES <= mask) {
      for (let j = 1; j <= LINEAR_PROBES; j++) {
        if (table[i + j] === null) { table[i + j] = hash; return }
      }
    }
    perturb >>= N5
    i = Number((B(i) * N5 + N1 + perturb) & B(mask))
  }
}

/** Distinct [min, max] pairs in the order `for x in set(...)` yields them
 *  when they are added in the given order. */
export function pySetOrder(pairs: [number, number][]): [number, number][] {
  let mask = 7
  let table: (bigint | null)[] = new Array(8).fill(null)
  const byHash = new Map<bigint, [number, number]>()
  let used = 0
  for (const [a, b] of pairs) {
    const h = frozensetPairHash(a, b)
    if (byHash.has(h)) continue            // equal element already present
    byHash.set(h, [a, b])
    insertClean(table, mask, h)            // no deletions, so probing == clean insert
    used++
    if (used * 5 >= mask * 3) {            // fill == used without deletions
      const minused = used > 50000 ? used * 2 : used * 4
      let size = 8
      while (size <= minused) size <<= 1
      const old = table
      mask = size - 1
      table = new Array(size).fill(null)
      for (const h2 of old) if (h2 !== null) insertClean(table, mask, h2)
    }
  }
  return table.filter((h): h is bigint => h !== null).map(h => byHash.get(h)!)
}
