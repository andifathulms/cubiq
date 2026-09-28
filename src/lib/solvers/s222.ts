// Optimal 2x2 solver via a complete God's-algorithm table (port of
// cubiq-ml solver222.py).
//
// A 2x2 is the 8 corners of a 3x3. Fixing the DBL corner kills whole-cube
// rotation symmetry, leaving 7! * 3^6 = 3,674,160 states, BFS'd exhaustively
// over U/R/F (which never touch DBL). The table is exact, so solving is a
// gradient walk: every solution is optimal (God's number 11) and
// alternatives are enumerable. Scrambles may use any face: the state is
// canonicalised by the whole-cube rotation that homes DBL, solved there, and
// the solution's face letters are mapped back — no rotation prefix needed.
//
// Unlike the Python (piece-indexed Lehmer code), the table is indexed by
// slot-based coordinates — permutation rank x twist — whose move tables
// are independent, so the BFS is two lookups per edge. Same distances.

import { CORNER_TRANS, MOVE_INDEX } from './cube3'
import { reportProgress } from './progress'
import { bfsTable, rankPerm, unrankPerm } from './perm'

const FIXED_SLOT = 6                          // DBL — never moved by U/R/F
const MOVES_222 = ['U', "U'", 'U2', 'R', "R'", 'R2', 'F', "F'", 'F2']
const SLOT7 = [0, 1, 2, 3, 4, 5, 7]
const SLOT7_INDEX: Record<number, number> = Object.fromEntries(SLOT7.map((s, i) => [s, i]))
const N_PERM = 5040
const N_TWIST = 729
const N_STATES = N_PERM * N_TWIST             // 3,674,160

// Per move, for each of the 7 movable slots: destination slot + twist delta
const DEST: number[][] = []
const DELTA: number[][] = []
for (const m of MOVES_222) {
  const full = CORNER_TRANS[MOVE_INDEX[m]]
  const dest: number[] = [], delta: number[] = []
  for (const slot of SLOT7) {
    const nxt = full[slot * 3]
    dest.push(SLOT7_INDEX[Math.floor(nxt / 3)])
    delta.push(nxt % 3)
  }
  DEST.push(dest)
  DELTA.push(delta)
}

function encodeTwist(tw: number[]): number {
  let t = 0
  for (let i = 0; i < 6; i++) t = t * 3 + tw[i]
  return t
}

function decodeTwist(t: number): number[] {
  const tw = new Array<number>(7)
  let sum = 0
  for (let i = 5; i >= 0; i--) {
    tw[i] = t % 3
    sum += tw[i]
    t = Math.floor(t / 3)
  }
  tw[6] = (3 - (sum % 3)) % 3
  return tw
}

let PERM_MOVE: Int32Array[] | null = null
let TWIST_MOVE: Int32Array[] | null = null
let DIST: Uint8Array | null = null

function buildMoveTables() {
  PERM_MOVE = MOVES_222.map((_, mi) => {
    const t = new Int32Array(N_PERM)
    const p = new Array<number>(7), np = new Array<number>(7)
    for (let r = 0; r < N_PERM; r++) {
      unrankPerm(r, 7, p)
      for (let s = 0; s < 7; s++) np[DEST[mi][s]] = p[s]
      t[r] = rankPerm(np, 7)
    }
    return t
  })
  TWIST_MOVE = MOVES_222.map((_, mi) => {
    const t = new Int32Array(N_TWIST)
    const nt = new Array<number>(7)
    for (let c = 0; c < N_TWIST; c++) {
      const tw = decodeTwist(c)
      for (let s = 0; s < 7; s++) nt[DEST[mi][s]] = (tw[s] + DELTA[mi][s]) % 3
      t[c] = encodeTwist(nt)
    }
    return t
  })
}

const applyMove = (idx: number, mi: number) =>
  PERM_MOVE![mi][Math.floor(idx / N_TWIST)] * N_TWIST + TWIST_MOVE![mi][idx % N_TWIST]

export function getTable(): Uint8Array {
  if (DIST) return DIST
  reportProgress('Building the 2×2 table · 3.67M positions')
  buildMoveTables()
  DIST = bfsTable(N_STATES, [0], MOVES_222.length, applyMove)
  return DIST
}

// ── Whole-cube rotations on corner sub-states (for canonicalisation) ─────────

const compose = (a: Int32Array, b: Int32Array) => b.map(x => a[x])   // b then a

const BASE_ROT_TRANS: Record<string, Int32Array> = {
  // disjoint layer pairs commute: x = R L', y = U D', z = F B'
  x: compose(CORNER_TRANS[MOVE_INDEX.R], CORNER_TRANS[MOVE_INDEX["L'"]]),
  y: compose(CORNER_TRANS[MOVE_INDEX.U], CORNER_TRANS[MOVE_INDEX["D'"]]),
  z: compose(CORNER_TRANS[MOVE_INDEX.F], CORNER_TRANS[MOVE_INDEX["B'"]]),
}
const BASE_FACE_MAP: Record<string, Record<string, string>> = {
  x: { F: 'U', U: 'B', B: 'D', D: 'F', R: 'R', L: 'L' },
  y: { R: 'F', F: 'L', L: 'B', B: 'R', U: 'U', D: 'D' },
  z: { U: 'R', R: 'D', D: 'L', L: 'U', F: 'F', B: 'B' },
}

type Rotation = [Int32Array, Record<string, string>]
const ROTATIONS: Rotation[] = (() => {
  const out: Rotation[] = []
  const seen = new Set<string>()
  let frontier: Rotation[] = [[Int32Array.from({ length: 24 }, (_, i) => i), Object.fromEntries([...'UDFBRL'].map(f => [f, f]))]]
  while (frontier.length) {
    const nxt: Rotation[] = []
    for (const [trans, fmap] of frontier) {
      const k = trans.join(',')
      if (seen.has(k)) continue
      seen.add(k)
      out.push([trans, fmap])
      for (const ax of 'xyz') {
        const nf = Object.fromEntries([...'UDFBRL'].map(f => [f, BASE_FACE_MAP[ax][fmap[f]]]))
        nxt.push([compose(BASE_ROT_TRANS[ax], trans), nf])
      }
    }
    frontier = nxt
  }
  return out
})()

// ── Scramble -> canonical state ──────────────────────────────────────────────

function cornerStateFromScramble(scramble: string): number[] {
  let subs = Array.from({ length: 8 }, (_, s) => s * 3)
  for (const move of scramble.split(/\s+/).filter(Boolean)) {
    const mi = MOVE_INDEX[move]
    if (mi === undefined) throw new Error(`unsupported move '${move}' for 2x2`)
    subs = subs.map(s => CORNER_TRANS[mi][s])
  }
  return subs
}

/** Rotate so DBL is home; returns the table index and the rotation's face map. */
function canonicalize(subs: number[]): [number, Record<string, string>] {
  for (const [trans, fmap] of ROTATIONS) {
    const rotated = subs.map(s => trans[s])
    if (rotated[FIXED_SLOT] !== FIXED_SLOT * 3) continue
    const pieceAt = new Array<number>(7), twistAt = new Array<number>(7)
    for (const [pi, piece] of SLOT7.entries()) {
      const slot = SLOT7_INDEX[Math.floor(rotated[piece] / 3)]
      pieceAt[slot] = pi
      twistAt[slot] = rotated[piece] % 3
    }
    return [rankPerm(pieceAt, 7) * N_TWIST + encodeTwist(twistAt), fmap]
  }
  throw new Error('no rotation homes the DBL corner (invalid state)')
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
    for (let mi = 0; mi < MOVES_222.length; mi++) {
      const ns = applyMove(s, mi)
      if (dist[ns] === h - 1) {
        path.push(MOVES_222[mi])
        dfs(ns)
        path.pop()
        if (solutions.length >= limit) return
      }
    }
  }
  dfs(state)
  return solutions
}

export function solve222(scramble: string, maxAlternatives = 3) {
  const dist = getTable()
  const [state, fmap] = canonicalize(cornerStateFromScramble(scramble))
  // canonical-frame face c corresponds to original-frame face inv(fmap)[c]
  const inv = Object.fromEntries(Object.entries(fmap).map(([k, v]) => [v, k]))
  const sols = findOptimal(state, dist, maxAlternatives)
  const remapped = sols.map(sol => sol.map(m => inv[m[0]] + m.slice(1)))
  const moves = remapped[0] ?? []
  return { moves, move_count: moves.length, alternatives: remapped.slice(1), optimal: true }
}
