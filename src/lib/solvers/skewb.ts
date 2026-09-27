// Optimal Skewb solver via a complete God's-algorithm table (port of
// cubiq-ml solverskewb.py).
//
// 3,149,280 reachable positions under the 8 WCA moves (U L R B, order 3),
// BFS'd once from solved; solutions are gradient walks, provably optimal
// (God's number 11). Centre orientation is invisible and ignored. Move
// tables come from cubing.js (skewb_moves.json).
//
// The Python stored a sparse sorted-key table (~28MB). Here the index is
// dense and slot-based: every move is a 3-cycle, corner 3 never moves, and
// corners split into a tetrad {0,1,2,7} and a triple {4,5,6} that never
// mix — so the state is (even centre perm: 360) x (corner coordinate:
// even tetrad perm 12 x cyclic triple perm 3 x twists 3^7, of which a
// small BFS finds the 8,748 reachable combinations): exactly 3,149,280
// entries (3MB).

import rawMoves from './data/skewb_moves.json'
import { bfsTable, rankPerm, unrankPerm } from './perm'

type Orbit = { permutation: number[]; orientationDelta: number[] }
const RAW = rawMoves as Record<string, Record<'CORNERS' | 'CENTERS', Orbit>>

const MOVES = ['U', "U'", 'L', "L'", 'R', "R'", 'B', "B'"]
const N_REACHABLE = 3_149_280

const TETRAD = [0, 1, 2, 7]
const TRIPLE = [4, 5, 6]
const TWIST_SLOTS = [0, 1, 2, 4, 5, 6, 7]     // corner 3 is fixed

// even permutations only: lexicographic neighbours 2k/2k+1 differ in parity
const evenRank = (p: number[], n: number) => rankPerm(p, n) >> 1
function evenUnrank(r: number, n: number): number[] {
  const a = unrankPerm(2 * r, n)
  return parity(a) === 0 ? a : unrankPerm(2 * r + 1, n)
}
function parity(p: number[]): number {
  let inv = 0
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[j] < p[i]) inv++
  return inv & 1
}

/** Table over a small permutation coordinate: slot subset -> local perm. */
function subsetPermTable(slots: number[], m: string, size: number): Int32Array {
  const perm = RAW[m].CORNERS.permutation
  const local = new Map(slots.map((s, i) => [s, i]))
  const t = new Int32Array(size)
  for (let r = 0; r < size; r++) {
    const p = evenUnrank(r, slots.length)                    // p[localSlot] = localPiece
    const np = slots.map(n => p[local.get(perm[n])!])       // new[n] = old[perm[n]]
    t[r] = evenRank(np, slots.length)
  }
  return t
}

const encodeTw = (tw: number[]) => tw.reduce((c, o) => c * 3 + o, 0)
function decodeTw(c: number): number[] {
  const tw = new Array<number>(7)
  for (let i = 6; i >= 0; i--) { tw[i] = c % 3; c = Math.floor(c / 3) }
  return tw
}
function twistStep(tw: number[], m: string): number[] {
  const { permutation: perm, orientationDelta: delta } = RAW[m].CORNERS
  const full = new Array<number>(8).fill(0)
  TWIST_SLOTS.forEach((s, i) => { full[s] = tw[i] })
  return TWIST_SLOTS.map(n => (full[perm[n]] + delta[n]) % 3)
}

let CEN_MOVE: Int32Array[], CORNER_MOVE: Int32Array[]
let CORNER_INDEX: Int32Array      // raw corner code -> dense index, -1 if unreachable
let N_CORNER = 0
let DIST: Uint8Array | null = null

const N_RAW_TW = 2187              // 3^7
const N_RAW_CORNER = 12 * 3 * N_RAW_TW

function buildMoveTables() {
  CEN_MOVE = MOVES.map(m => {
    const perm = RAW[m].CENTERS.permutation
    const t = new Int32Array(360)
    for (let r = 0; r < 360; r++) {
      const p = evenUnrank(r, 6)
      t[r] = evenRank(perm.map(old => p[old]), 6)
    }
    return t
  })
  const tet = MOVES.map(m => subsetPermTable(TETRAD, m, 12))
  const tri = MOVES.map(m => subsetPermTable(TRIPLE, m, 3))
  const tw = MOVES.map(m => Int32Array.from({ length: N_RAW_TW }, (_, c) => encodeTw(twistStep(decodeTw(c), m))))
  const rawNext = (c: number, mi: number) => {
    const t = c % N_RAW_TW
    const pp = (c - t) / N_RAW_TW
    return (tet[mi][Math.floor(pp / 3)] * 3 + tri[mi][pp % 3]) * N_RAW_TW + tw[mi][t]
  }
  // twists are coupled to the permutations, so compact the combined
  // corner coordinate to its reachable set
  const rawDist = bfsTable(N_RAW_CORNER, [0], MOVES.length, rawNext)
  CORNER_INDEX = new Int32Array(N_RAW_CORNER).fill(-1)
  const codes: number[] = []
  for (let c = 0; c < N_RAW_CORNER; c++) if (rawDist[c] !== 255) { CORNER_INDEX[c] = codes.length; codes.push(c) }
  N_CORNER = codes.length
  CORNER_MOVE = MOVES.map((_, mi) => Int32Array.from(codes, c => CORNER_INDEX[rawNext(c, mi)]))
}

function applyMove(idx: number, mi: number): number {
  const c = idx % N_CORNER
  return CEN_MOVE[mi][(idx - c) / N_CORNER] * N_CORNER + CORNER_MOVE[mi][c]
}

export function getTable(): Uint8Array {
  if (DIST) return DIST
  buildMoveTables()
  const size = 360 * N_CORNER
  if (size !== N_REACHABLE) throw new Error(`skewb index size ${size} != ${N_REACHABLE}`)
  DIST = bfsTable(size, [0], MOVES.length, applyMove)
  return DIST
}

// ── Scramble / solve ──────────────────────────────────────────────────────────

const normalize = (move: string) => (move.endsWith('2') ? move[0] + "'" : move)   // order 3

function stateFromScramble(scramble: string): number {
  let corners = [0, 1, 2, 3, 4, 5, 6, 7]         // piece at slot
  let twist = [0, 0, 0, 0, 0, 0, 0, 0]
  let centers = [0, 1, 2, 3, 4, 5]
  for (const tok of scramble.split(/\s+/).filter(Boolean)) {
    const t = RAW[normalize(tok)]
    if (!t) throw new Error(`unsupported skewb move '${tok}'`)
    const { permutation: perm, orientationDelta: delta } = t.CORNERS
    corners = perm.map(old => corners[old])
    twist = perm.map((old, n) => (twist[old] + delta[n]) % 3)
    centers = t.CENTERS.permutation.map(old => centers[old])
  }
  const local = (slots: number[]) => {
    const home = new Map(slots.map((s, i) => [s, i]))
    return slots.map(s => home.get(corners[s]))
  }
  const tet = local(TETRAD), tri = local(TRIPLE)
  if (corners[3] !== 3 || twist[3] !== 0 || tet.includes(undefined) || tri.includes(undefined)) {
    throw new Error('unreachable skewb state (bad scramble?)')
  }
  const raw = (evenRank(tet as number[], 4) * 3 + evenRank(tri as number[], 3)) * N_RAW_TW
    + encodeTw(TWIST_SLOTS.map(s => twist[s]))
  const ci = CORNER_INDEX[raw]
  if (ci < 0) throw new Error('unreachable skewb state (bad scramble?)')
  return evenRank(centers, 6) * N_CORNER + ci
}

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
    for (let mi = 0; mi < MOVES.length; mi++) {
      const ns = applyMove(s, mi)
      if (dist[ns] === h - 1) {
        path.push(MOVES[mi])
        dfs(ns)
        path.pop()
        if (solutions.length >= limit) return
      }
    }
  }
  dfs(state)
  return solutions
}

export function solveSkewb(scramble: string, maxAlternatives = 3) {
  const dist = getTable()
  const state = stateFromScramble(scramble)
  const sols = findOptimal(state, dist, maxAlternatives)
  const moves = sols[0] ?? []
  return { moves, move_count: moves.length, alternatives: sols.slice(1), optimal: true }
}
