// 4x4x4 piece views on the NxN sticker engine (port of cubiq-ml
// cube444.py). Moves: outer (U R F D L B), inner slices (2U ...), wide
// (Uw ...), rotations (x y z), each with ' and 2.

import { FACES, applyMoves, makeCube, standardLayers, type Face } from './cubeN'

export const CUBE4 = makeCube(4, standardLayers(4, 2, true), true)
export const SOLVED4 = CUBE4.solved

export const apply4 = (state: Int8Array, moves: readonly string[]) => applyMoves(CUBE4, state, moves)

const idx = CUBE4.idx

/** Centre sticker indices per face (the inner 2x2). */
export const CENTER_IDX: Record<Face, number[]> = Object.fromEntries(
  FACES.map(f => [f, [[1, 1], [1, 2], [2, 1], [2, 2]].map(([r, c]) => idx(f, r, c))]),
) as Record<Face, number[]>

// The 24 wing slots: (primary sticker, partner on the adjacent face).
// Border, non-corner stickers have |coords| sorted == [0.5, 1.5, 2.0].
export const WING_SLOTS: [number, number][] = []
{
  const seen = new Set<number>()
  for (let i = 0; i < CUBE4.nStickers; i++) {
    const p = CUBE4.pos[i]
    const coords = p.map(Math.abs)
    if ([...coords].sort((a, b) => a - b).join() !== '0.5,1.5,2') continue
    if (seen.has(i)) continue
    const aFace = coords.indexOf(2)
    const aBorder = coords.indexOf(1.5)
    const q = [...p] as [number, number, number]
    q[aFace] = 1.5 * Math.sign(p[aFace])
    q[aBorder] = 2 * Math.sign(p[aBorder])
    const n2: [number, number, number] = [0, 0, 0]
    n2[aBorder] = Math.sign(p[aBorder])
    const j = CUBE4.lookup(q, n2)
    seen.add(i)
    seen.add(j)
    WING_SLOTS.push([i, j])
  }
  if (WING_SLOTS.length !== 24) throw new Error('4x4 wing slots')
}

// The 12 dedge positions: pairs of wing slots on the same pair of faces.
export const DEDGES: [number, number][] = (() => {
  const byPair = new Map<string, number[]>()
  WING_SLOTS.forEach(([a, b], wi) => {
    const k = [Math.floor(a / 16), Math.floor(b / 16)].sort((x, y) => x - y).join()
    if (!byPair.has(k)) byPair.set(k, [])
    byPair.get(k)!.push(wi)
  })
  return [...byPair.values()].map(ws => [ws[0], ws[1]] as [number, number])
})()

export function wingColors(state: Int8Array, wingSlot: number): [number, number] {
  const [a, b] = WING_SLOTS[wingSlot]
  return [state[a], state[b]]
}

/** Each requested face's 4 centre stickers match that face's colour. */
export function centersSolved(state: Int8Array, faces: readonly Face[] = FACES): boolean {
  for (const f of faces) {
    const want = FACES.indexOf(f)
    for (const i of CENTER_IDX[f]) if (state[i] !== want) return false
  }
  return true
}

export function dedgePaired(state: Int8Array, dedge: number): boolean {
  const [w1, w2] = DEDGES[dedge]
  const [a1, b1] = WING_SLOTS[w1], [a2, b2] = WING_SLOTS[w2]
  return state[a1] === state[a2] && state[b1] === state[b2]
}

export function pairedCount(state: Int8Array): number {
  let n = 0
  for (let d = 0; d < 12; d++) if (dedgePaired(state, d)) n++
  return n
}

export const allPaired = (state: Int8Array) => pairedCount(state) === 12

// 3x3 (row, col) -> 4x4 sticker grid position to sample
const FACELET_GRID: [number, number][] = [
  [0, 0], [0, 1], [0, 3],
  [1, 0], [1, 1], [1, 3],
  [3, 0], [3, 1], [3, 3],
]

/** Read the reduced cube as a 3x3 kociemba facelet string (valid once
 *  centres are solved and all dedges are paired). */
export function toFacelet3(state: Int8Array): string {
  let out = ''
  for (const f of FACES) for (const [r, c] of FACELET_GRID) out += FACES[state[idx(f, r, c)]]
  return out
}
