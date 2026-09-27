// Small permutation-coordinate helpers shared by the table-driven solvers.

/** Lehmer rank of a permutation of 0..n-1 (lexicographic order). */
export function rankPerm(p: ArrayLike<number>, n: number): number {
  let r = 0
  for (let i = 0; i < n; i++) {
    let smaller = 0
    for (let j = i + 1; j < n; j++) if (p[j] < p[i]) smaller++
    r = r * (n - i) + smaller
  }
  return r
}

/** Inverse of rankPerm. */
export function unrankPerm(r: number, n: number, out: number[] = new Array(n)): number[] {
  const digits = new Array<number>(n)
  for (let i = n - 1; i >= 0; i--) {
    digits[i] = r % (n - i)
    r = Math.floor(r / (n - i))
  }
  const avail = Array.from({ length: n }, (_, i) => i)
  for (let i = 0; i < n; i++) out[i] = avail.splice(digits[i], 1)[0]
  return out
}

export const factorial = (n: number): number => (n <= 1 ? 1 : n * factorial(n - 1))

/** Breadth-first distance table over a state space given a neighbour
 *  function; dist 255 = unreached. Returns the table. */
export function bfsTable(
  size: number,
  starts: number[],
  nMoves: number,
  next: (state: number, move: number) => number,
): Uint8Array {
  const dist = new Uint8Array(size).fill(255)
  const queue = new Int32Array(size)
  let tail = 0
  for (const s of starts) {
    if (dist[s] === 255) {
      dist[s] = 0
      queue[tail++] = s
    }
  }
  for (let head = 0; head < tail; head++) {
    const s = queue[head]
    const d = dist[s] + 1
    for (let m = 0; m < nMoves; m++) {
      const ns = next(s, m)
      if (dist[ns] === 255) {
        dist[ns] = d
        queue[tail++] = ns
      }
    }
  }
  return dist
}
