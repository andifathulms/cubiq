// Megaminx engine — port of cubiq-ml megaengine.py: a piece model driven
// by cubing.js kpuzzle tables.
//
// Orbits: EDGES (30, flip), CORNERS (20, twist), CENTERS (12, position —
// orientation is invisible). Face moves never touch centres; the WCA
// scramble moves R++/D++ permute them, leaving the puzzle in a rotated
// frame. States are canonicalised by the 60-element rotation group and
// solution face letters are translated back by conjugation matching.
//
// State arrays are indexed BY PIECE: edges[piece] = slot*2 + flip,
// corners[piece] = slot*3 + twist.

import rawMoves from './data/megaminx_moves.json'

type Orbit = { permutation: number[]; orientationDelta: number[] }
const RAW = rawMoves as Record<string, Record<'EDGES' | 'CORNERS' | 'CENTERS', Orbit>>

export const FACES = ['U', 'F', 'L', 'BL', 'BR', 'R', 'D', 'B', 'DR', 'DL', 'FR', 'FL']
export const AMOUNTS = ['', '2', "'", "2'"]
export const FACE_MOVES = FACES.flatMap(f => AMOUNTS.map(a => f + a))   // 48

function subtrans(entry: Orbit, n: number, o: number): Int32Array {
  const { permutation: perm, orientationDelta: delta } = entry   // perm[new] = old
  const inv = new Array<number>(n)
  for (let nw = 0; nw < n; nw++) inv[perm[nw]] = nw
  const t = new Int32Array(n * o)
  for (let s = 0; s < n; s++) {
    for (let r = 0; r < o; r++) {
      const nw = inv[s]
      t[s * o + r] = nw * o + ((r + delta[nw]) % o)
    }
  }
  return t
}

export const ETRANS: Record<string, Int32Array> = {}
export const CTRANS: Record<string, Int32Array> = {}
const CENPERM: Record<string, Int32Array> = {}   // centres: new position of old slot
for (const [m, t] of Object.entries(RAW)) {
  ETRANS[m] = subtrans(t.EDGES, 30, 2)
  CTRANS[m] = subtrans(t.CORNERS, 20, 3)
  const inv = new Int32Array(12)
  t.CENTERS.permutation.forEach((old, nw) => { inv[old] = nw })
  CENPERM[m] = inv
}

export const SOLVED_E = Int32Array.from({ length: 30 }, (_, i) => i * 2)
export const SOLVED_C = Int32Array.from({ length: 20 }, (_, i) => i * 3)
const SOLVED_CEN = Int32Array.from({ length: 12 }, (_, i) => i)

/** numpy t[x] */
export const take = (t: Int32Array, x: Int32Array): Int32Array => x.map(v => t[v])

export interface MegaState {
  edges: Int32Array
  corners: Int32Array
  centers: Int32Array
}

export const solvedMega = (): MegaState => ({
  edges: SOLVED_E.slice(), corners: SOLVED_C.slice(), centers: SOLVED_CEN.slice(),
})

export function applyMega(s: MegaState, moves: readonly string[]): MegaState {
  let { edges: e, corners: c, centers: cen } = s
  for (const m of moves) {
    e = take(ETRANS[m], e)
    c = take(CTRANS[m], c)
    cen = take(CENPERM[m], cen)
  }
  return { edges: e, corners: c, centers: cen }
}

export function parseScramble(scramble: string): string[] {
  const out: string[] = []
  for (const tok of scramble.split(/\s+/).filter(Boolean)) {
    if (!(tok in RAW)) throw new Error(`unsupported megaminx move '${tok}'`)
    out.push(tok)
  }
  return out
}

const eq = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return a.length === b.length
}

// ── Rotation group (60 elements) and face translation ────────────────────────

const ROT_GEN = ['Uv', 'Rv'].flatMap(g => AMOUNTS.map(a => g + a))

type Rot = [Int32Array, Int32Array, Int32Array]
const ROTATIONS: Rot[] = (() => {
  const out: Rot[] = []
  const seen = new Set<string>()
  const id60 = Int32Array.from({ length: 60 }, (_, i) => i)
  let frontier: Rot[] = [[id60, id60, SOLVED_CEN]]
  while (frontier.length) {
    const nxt: Rot[] = []
    for (const [e, c, cen] of frontier) {
      const k = cen.join(',')
      if (seen.has(k)) continue
      seen.add(k)
      out.push([e, c, cen])
      for (const g of ROT_GEN) nxt.push([take(ETRANS[g], e), take(CTRANS[g], c), take(CENPERM[g], cen)])
    }
    frontier = nxt
  }
  if (out.length !== 60) throw new Error(`megaminx rotation group has ${out.length} elements`)
  return out
})()

const EDGE_MAP_TO_MOVE = new Map(FACE_MOVES.map(m => [ETRANS[m].join(','), m]))

function rotationFaceTranslation(rotIdx: number): Record<string, string> {
  const [eRot] = ROTATIONS[rotIdx]
  const inv = new Int32Array(60)
  for (let i = 0; i < 60; i++) inv[eRot[i]] = i
  const table: Record<string, string> = {}
  for (const f of FACE_MOVES) {
    const conj = take(inv, take(ETRANS[f], eRot))
    const m = EDGE_MAP_TO_MOVE.get(conj.join(','))
    if (!m) throw new Error(`conjugation of ${f} not a face move`)
    table[f] = m
  }
  return table
}

/** Rotate so centres are home. Returns the canonical state and the face
 *  translation from canonical-frame moves to original-frame moves. */
export function canonicalize(state: MegaState): [MegaState, Record<string, string>] {
  for (let idx = 0; idx < ROTATIONS.length; idx++) {
    const [e, c, cen] = ROTATIONS[idx]
    if (eq(take(cen, state.centers), SOLVED_CEN)) {
      return [
        { edges: take(e, state.edges), corners: take(c, state.corners), centers: SOLVED_CEN.slice() },
        rotationFaceTranslation(idx),
      ]
    }
  }
  throw new Error('no rotation restores centers (invalid state)')
}

// ── Face membership and piece classes ─────────────────────────────────────────

export const EDGE_FACES: Set<string>[] = Array.from({ length: 30 }, (_, s) =>
  new Set(FACES.filter(f => ETRANS[f][s * 2] !== s * 2)))
export const CORNER_FACES: Set<string>[] = Array.from({ length: 20 }, (_, s) =>
  new Set(FACES.filter(f => CTRANS[f][s * 3] !== s * 3)))

export const D_ADJ = new Set(FACES.filter(f => f !== 'U' && f !== 'D' &&
  EDGE_FACES.some(ef => ef.has('D') && ef.has(f))))
export const U_ADJ = new Set(FACES.filter(f => f !== 'U' && f !== 'D' &&
  EDGE_FACES.some(ef => ef.has('U') && ef.has(f))))

const subset = (a: Set<string>, b: Set<string>) => [...a].every(x => b.has(x))

function edgeClass(s: number): string {
  const fs = EDGE_FACES[s]
  if (fs.has('D')) return 'star'
  if (fs.has('U')) return 'll'
  if (subset(fs, D_ADJ)) return 'lower'
  if (subset(fs, U_ADJ)) return 'upper'
  return 'middle'
}

function cornerClass(s: number): string {
  const fs = CORNER_FACES[s]
  if (fs.has('D')) return 'bottom'
  if (fs.has('U')) return 'll'
  return [...fs].filter(f => D_ADJ.has(f)).length === 2 ? 'lowmid' : 'highmid'
}

export const EDGE_CLASSES: Record<string, number[]> = Object.fromEntries(
  ['star', 'lower', 'middle', 'upper', 'll'].map(cls => [cls, [...Array(30).keys()].filter(s => edgeClass(s) === cls)]))
export const CORNER_CLASSES: Record<string, number[]> = Object.fromEntries(
  ['bottom', 'lowmid', 'highmid', 'll'].map(cls => [cls, [...Array(20).keys()].filter(s => cornerClass(s) === cls)]))

// ── Exact per-piece distance tables (over the 48 face moves) ─────────────────

function pieceTable(trans: Int32Array[], home: number): Uint8Array {
  const dist = new Uint8Array(60).fill(255)
  dist[home] = 0
  let frontier = [home]
  while (frontier.length) {
    const nxt: number[] = []
    for (const s of frontier) {
      for (const t of trans) {
        const ns = t[s]
        if (dist[ns] === 255) {
          dist[ns] = dist[s] + 1
          nxt.push(ns)
        }
      }
    }
    frontier = nxt
  }
  return dist
}

export const EDGE_DIST: Uint8Array[] = Array.from({ length: 30 }, (_, s) => pieceTable(FACE_MOVES.map(m => ETRANS[m]), s * 2))
export const CORNER_DIST: Uint8Array[] = Array.from({ length: 20 }, (_, s) => pieceTable(FACE_MOVES.map(m => CTRANS[m]), s * 3))
