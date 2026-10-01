// 6x6x6 piece views on the NxN sticker engine. Even cube: no fixed
// centres, so the colour scheme is fixed by convention (U white … as the
// solved state). Each face's 16 centre stickers fall into four 24-piece
// orbits that never mix: outer x-centres, inner x-centres and two mirror
// oblique orbits. Each of the 12 edge positions holds four wings in two
// orbits (outer |t| = 1.5, inner |t| = 0.5).

import { FACES, applyMoves, makeCube, standardLayers, type Face } from './cubeN'

export const CUBE6 = makeCube(6, standardLayers(6, 3, true), true)
export const SOLVED6 = CUBE6.solved
export const apply6 = (state: Int8Array, moves: readonly string[]) => applyMoves(CUBE6, state, moves)

const idx = CUBE6.idx

export type CenterOrbit = 'x' | 'ix' | 'obl' | 'obr'
export const CENTER_ORBITS: CenterOrbit[] = ['x', 'ix', 'obl', 'obr']
const ORBIT_CELLS: Record<CenterOrbit, [number, number][]> = {
  x: [[1, 1], [1, 4], [4, 4], [4, 1]],
  ix: [[2, 2], [2, 3], [3, 3], [3, 2]],
  obl: [[1, 2], [2, 4], [4, 3], [3, 1]],
  obr: [[1, 3], [3, 4], [4, 2], [2, 1]],
}

/** Centre sticker indices per face (all 16) and per (face, orbit). */
export const CENTER_IDX: Record<Face, number[]> = Object.fromEntries(
  FACES.map(f => [f, CENTER_ORBITS.flatMap(o => ORBIT_CELLS[o].map(([r, c]) => idx(f, r, c)))]),
) as Record<Face, number[]>
export const ORBIT_IDX: Record<CenterOrbit, Record<Face, number[]>> = Object.fromEntries(
  CENTER_ORBITS.map(o => [o, Object.fromEntries(FACES.map(f => [f, ORBIT_CELLS[o].map(([r, c]) => idx(f, r, c))]))]),
) as Record<CenterOrbit, Record<Face, number[]>>
export const ALL_CENTER_IDS = FACES.flatMap(f => CENTER_IDX[f])

// Wing slots: (sticker, partner on the adjacent face). Border, non-corner
// stickers have |coords| sorted = [t, 2.5, 3] with t = 0.5 or 1.5.
export const WING_SLOTS: [number, number][] = []
export const WING_T: number[] = []          // signed position along the edge
{
  const seen = new Set<number>()
  for (let i = 0; i < CUBE6.nStickers; i++) {
    if (seen.has(i)) continue
    const p = CUBE6.pos[i]
    const abs = p.map(Math.abs)
    const sorted = [...abs].sort((a, b) => a - b)
    if (sorted[1] !== 2.5 || sorted[2] !== 3 || sorted[0] === 2.5) continue
    const aFace = abs.indexOf(3)
    const aBorder = abs.indexOf(2.5)
    const aT = [0, 1, 2].find(a => a !== aFace && a !== aBorder)!
    const q = [...p] as [number, number, number]
    q[aFace] = 2.5 * Math.sign(p[aFace])
    q[aBorder] = 3 * Math.sign(p[aBorder])
    const n2: [number, number, number] = [0, 0, 0]
    n2[aBorder] = Math.sign(p[aBorder])
    const j = CUBE6.lookup(q, n2)
    seen.add(i)
    seen.add(j)
    WING_SLOTS.push([i, j])
    WING_T.push(p[aT])
  }
  if (WING_SLOTS.length !== 48) throw new Error('6x6 wing slots')
}
export const isOuterWing = (w: number) => Math.abs(WING_T[w]) === 1.5

/** The 12 edge positions, each its four wing slots in order along the edge. */
export const EDGE_POS: number[][] = (() => {
  const byPair = new Map<string, number[]>()
  WING_SLOTS.forEach(([a, b], wi) => {
    const k = [Math.floor(a / 36), Math.floor(b / 36)].sort((x, y) => x - y).join()
    if (!byPair.has(k)) byPair.set(k, [])
    byPair.get(k)!.push(wi)
  })
  return [...byPair.values()].map(ws => ws.sort((x, y) => WING_T[x] - WING_T[y]))
})()
export const POS_OF_WING: number[] = []
EDGE_POS.forEach((ws, pi) => ws.forEach(w => { POS_OF_WING[w] = pi }))

export function centersSolved(state: Int8Array, faces: readonly Face[] = FACES): boolean {
  for (const f of faces) {
    const want = FACES.indexOf(f)
    for (const i of CENTER_IDX[f]) if (state[i] !== want) return false
  }
  return true
}

/** All four wings of an edge position show the same colour pair. */
export function edgePaired(state: Int8Array, pos: number): boolean {
  const ws = EDGE_POS[pos]
  const [a0, b0] = WING_SLOTS[ws[0]]
  for (let k = 1; k < 4; k++) {
    const [a, b] = WING_SLOTS[ws[k]]
    if (state[a] !== state[a0] || state[b] !== state[b0]) return false
  }
  return true
}

export function pairedCount(state: Int8Array): number {
  let n = 0
  for (let p = 0; p < 12; p++) if (edgePaired(state, p)) n++
  return n
}
export const allPaired = (state: Int8Array) => pairedCount(state) === 12

// 3x3 (row, col) -> 6x6 sticker to sample once the cube is reduced
const FACELET_GRID: [number, number][] = [
  [0, 0], [0, 2], [0, 5],
  [2, 0], [2, 2], [2, 5],
  [5, 0], [5, 2], [5, 5],
]

/** Read the reduced cube as a 3x3 kociemba facelet string. */
export function toFacelet3(state: Int8Array): string {
  let out = ''
  for (const f of FACES) for (const [r, c] of FACELET_GRID) out += FACES[state[idx(f, r, c)]]
  return out
}
