// Optimal Pyraminx solver via a complete God's-algorithm table (port of
// cubiq-ml solverpyram.py).
//
// Excluding the trivial tips, the core is 6 edges (even permutations, even
// total flip) x 4 axial corners (orientation only — they never permute):
// 360 * 32 * 81 = 933,120 states, BFS'd once (God's number 11). Tips are
// independent: each is fixed by at most one lowercase move appended after
// the optimal core solution. Move tables come from cubing.js's pyraminx
// kpuzzle (orbit convention: permutation[new] = old).
//
// The table is indexed by slot-based coordinates (edge permutation rank x
// flip x axial twist), whose move tables are independent; the Python used
// piece-indexed codes. Distances are identical.

import rawMoves from './data/pyraminx_moves.json'
import { bfsTable, rankPerm, unrankPerm } from './perm'

type Orbit = { permutation: number[]; orientationDelta: number[] }
const RAW = rawMoves as Record<string, Record<'EDGES' | 'CORNERS' | 'CORNERS2', Orbit>>

const CORE_MOVES = ['U', "U'", 'L', "L'", 'R', "R'", 'B', "B'"]
const TIP_MOVES = ['u', 'l', 'r', 'b']

const N_PERM = 720      // includes the unreachable odd half
const N_FLIP = 32
const N_TW = 81

let PERM_MOVE: Int32Array[], FLIP_MOVE: Int32Array[], TW_MOVE: Int32Array[]
let DIST: Uint8Array | null = null

function encodeFlip(f: number[]): number {
  let c = 0
  for (let i = 0; i < 5; i++) c = c * 2 + f[i]
  return c
}
function decodeFlip(c: number): number[] {
  const f = new Array<number>(6)
  let sum = 0
  for (let i = 4; i >= 0; i--) { f[i] = c & 1; sum += f[i]; c >>= 1 }
  f[5] = sum & 1
  return f
}
function encodeTw(t: number[]): number {
  let c = 0
  for (let i = 0; i < 4; i++) c = c * 3 + t[i]
  return c
}
function decodeTw(c: number): number[] {
  const t = new Array<number>(4)
  for (let i = 3; i >= 0; i--) { t[i] = c % 3; c = Math.floor(c / 3) }
  return t
}

function buildMoveTables() {
  PERM_MOVE = CORE_MOVES.map(m => {
    const perm = RAW[m].EDGES.permutation
    const t = new Int32Array(N_PERM)
    const p = new Array<number>(6), np = new Array<number>(6)
    for (let r = 0; r < N_PERM; r++) {
      unrankPerm(r, 6, p)
      for (let n = 0; n < 6; n++) np[n] = p[perm[n]]
      t[r] = rankPerm(np, 6)
    }
    return t
  })
  FLIP_MOVE = CORE_MOVES.map(m => {
    const { permutation: perm, orientationDelta: delta } = RAW[m].EDGES
    const t = new Int32Array(N_FLIP)
    const nf = new Array<number>(6)
    for (let c = 0; c < N_FLIP; c++) {
      const f = decodeFlip(c)
      for (let n = 0; n < 6; n++) nf[n] = (f[perm[n]] + delta[n]) % 2
      t[c] = encodeFlip(nf)
    }
    return t
  })
  TW_MOVE = CORE_MOVES.map(m => {
    const delta = RAW[m].CORNERS.orientationDelta
    const t = new Int32Array(N_TW)
    for (let c = 0; c < N_TW; c++) t[c] = encodeTw(decodeTw(c).map((o, i) => (o + delta[i]) % 3))
    return t
  })
}

function applyMove(idx: number, mi: number): number {
  const tw = idx % N_TW
  const rest = (idx - tw) / N_TW
  const flip = rest % N_FLIP
  const perm = (rest - flip) / N_FLIP
  return (PERM_MOVE[mi][perm] * N_FLIP + FLIP_MOVE[mi][flip]) * N_TW + TW_MOVE[mi][tw]
}

export function getTable(): Uint8Array {
  if (DIST) return DIST
  buildMoveTables()
  DIST = bfsTable(N_PERM * N_FLIP * N_TW, [0], CORE_MOVES.length, applyMove)
  return DIST
}

// ── Scramble parsing ──────────────────────────────────────────────────────────

/** Pyraminx moves have order 3: X2 == X'. */
const normalize = (move: string) => (move.endsWith('2') ? move[0] + "'" : move)

function stateFromScramble(scramble: string): [number, number[]] {
  let pieceAt = [0, 1, 2, 3, 4, 5]
  let flipAt = [0, 0, 0, 0, 0, 0]
  let tw = [0, 0, 0, 0]
  let tips = [0, 0, 0, 0]
  for (const tok of scramble.split(/\s+/).filter(Boolean)) {
    const move = normalize(tok)
    const t = RAW[move]
    if (!t) throw new Error(`unsupported pyraminx move '${tok}'`)
    if ('ULRB'.includes(move[0])) {
      const { permutation: perm, orientationDelta: delta } = t.EDGES
      pieceAt = perm.map(old => pieceAt[old])
      flipAt = perm.map((old, n) => (flipAt[old] + delta[n]) % 2)
      tw = tw.map((o, i) => (o + t.CORNERS.orientationDelta[i]) % 3)
    }
    tips = tips.map((o, i) => (o + t.CORNERS2.orientationDelta[i]) % 3)
  }
  return [(rankPerm(pieceAt, 6) * N_FLIP + encodeFlip(flipAt)) * N_TW + encodeTw(tw), tips]
}

function tipFixes(tips: number[]): string[] {
  const fixes: string[] = []
  for (const tm of TIP_MOVES) {
    const delta = RAW[tm].CORNERS2.orientationDelta
    const slot = delta.findIndex(d => d !== 0)
    const o = tips[slot]
    if (o === 0) continue
    // need o + k*d = 0 mod 3 with k in {1, 2}; k=2 means the inverse move
    const k = (o + delta[slot]) % 3 === 0 ? 1 : 2
    fixes.push(k === 1 ? tm : tm + "'")
  }
  return fixes
}

// ── Solve ─────────────────────────────────────────────────────────────────────

function findOptimal(state: number, dist: Uint8Array, limit: number): string[][] {
  const solutions: string[][] = []
  const path: string[] = []
  const dfs = (s: number) => {
    if (solutions.length >= limit) return
    const h = dist[s]
    if (h === 0) {
      solutions.push([...path])
      return
    }
    for (let mi = 0; mi < CORE_MOVES.length; mi++) {
      const ns = applyMove(s, mi)
      if (dist[ns] === h - 1) {
        path.push(CORE_MOVES[mi])
        dfs(ns)
        path.pop()
        if (solutions.length >= limit) return
      }
    }
  }
  dfs(state)
  return solutions
}

export function solvePyram(scramble: string, maxAlternatives = 3) {
  const dist = getTable()
  const [state, tips] = stateFromScramble(scramble)
  if (dist[state] === 255) throw new Error('unreachable pyraminx state (bad scramble?)')
  const results = findOptimal(state, dist, maxAlternatives).map(sol => {
    const t = [...tips]
    for (const m of sol) {
      const d = RAW[m].CORNERS2.orientationDelta
      for (let i = 0; i < 4; i++) t[i] = (t[i] + d[i]) % 3
    }
    return [...sol, ...tipFixes(t)]
  })
  const moves = results[0] ?? []
  return { moves, move_count: moves.length, alternatives: results.slice(1), optimal: true }
}
