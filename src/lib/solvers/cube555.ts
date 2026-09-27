// 5x5x5 piece views on the NxN sticker engine (port of cubiq-ml
// cube555.py). Fixed face centres give an absolute frame; centre pieces
// form two 24-slot orbits (x-centres diagonal, t-centres axis-aligned);
// each edge position holds a central edge and two wings. Middle slices
// (3R ...) are modelled but never used for solving.

import { FACES, applyMoves, makeCube, standardLayers, type Face } from './cubeN'

export const CUBE5 = makeCube(5, standardLayers(5, 3, false), true)
export const SOLVED5 = CUBE5.solved

export const apply5 = (state: Int8Array, moves: readonly string[]) => applyMoves(CUBE5, state, moves)

const idx = CUBE5.idx

export const X_CENTER_IDX: Record<Face, number[]> = Object.fromEntries(
  FACES.map(f => [f, [[1, 1], [1, 3], [3, 1], [3, 3]].map(([r, c]) => idx(f, r, c))]),
) as Record<Face, number[]>
export const T_CENTER_IDX: Record<Face, number[]> = Object.fromEntries(
  FACES.map(f => [f, [[1, 2], [2, 1], [2, 3], [3, 2]].map(([r, c]) => idx(f, r, c))]),
) as Record<Face, number[]>

// Wing slots (|tangent| == 1) and central edges (tangent == 0): each is a
// (sticker on face, sticker on side) pair.
export const WING_SLOTS: [number, number][] = []
export const CEDGE_SLOTS: [number, number][] = []
{
  const seen = new Set<number>()
  for (let i = 0; i < CUBE5.nStickers; i++) {
    if (seen.has(i)) continue
    const p = CUBE5.pos[i]
    const abs = p.map(Math.abs)
    const sorted = [...abs].sort((a, b) => a - b).join()
    if (sorted !== '1,2,2.5' && sorted !== '0,2,2.5') continue
    const aFace = abs.indexOf(2.5)
    const aBorder = abs.indexOf(2)
    const q = [...p] as [number, number, number]
    q[aFace] = 2 * Math.sign(p[aFace])
    q[aBorder] = 2.5 * Math.sign(p[aBorder])
    const n2: [number, number, number] = [0, 0, 0]
    n2[aBorder] = Math.sign(p[aBorder])
    const j = CUBE5.lookup(q, n2)
    seen.add(i)
    seen.add(j)
    if (sorted === '1,2,2.5') WING_SLOTS.push([i, j])
    else CEDGE_SLOTS.push([i, j])
  }
  if (WING_SLOTS.length !== 24 || CEDGE_SLOTS.length !== 12) throw new Error('5x5 edge slots')
}

/** Edge positions: [central edge index, wing index 1, wing index 2]. */
export const EDGE_GROUPS: [number, number, number][] = (() => {
  const byPair = new Map<string, number[]>()
  const pairKey = (a: number, b: number) => [Math.floor(a / 25), Math.floor(b / 25)].sort((x, y) => x - y).join()
  WING_SLOTS.forEach(([a, b], wi) => {
    const k = pairKey(a, b)
    if (!byPair.has(k)) byPair.set(k, [])
    byPair.get(k)!.push(wi)
  })
  return CEDGE_SLOTS.map(([a, b], ci) => {
    const ws = byPair.get(pairKey(a, b))!
    return [ci, ws[0], ws[1]] as [number, number, number]
  })
})()

/** Both wings show the same (face, colour) pair as the central edge. */
export function edgePaired(state: Int8Array, gi: number): boolean {
  const [ci, w1, w2] = EDGE_GROUPS[gi]
  const [ca, cb] = CEDGE_SLOTS[ci]
  for (const wi of [w1, w2]) {
    const [a, b] = WING_SLOTS[wi]
    if (state[a] !== state[ca] || state[b] !== state[cb]) return false
  }
  return true
}

/** How many of the 24 wings match their group's central edge. */
export function wingsAttached(state: Int8Array): number {
  let n = 0
  for (const [ci, w1, w2] of EDGE_GROUPS) {
    const [ca, cb] = CEDGE_SLOTS[ci]
    for (const wi of [w1, w2]) {
      const [a, b] = WING_SLOTS[wi]
      if (state[a] === state[ca] && state[b] === state[cb]) n++
    }
  }
  return n
}

export function allPaired(state: Int8Array): boolean {
  for (let g = 0; g < 12; g++) if (!edgePaired(state, g)) return false
  return true
}

export function centersSolved(state: Int8Array): boolean {
  for (const f of FACES) {
    const want = FACES.indexOf(f)
    for (const i of X_CENTER_IDX[f]) if (state[i] !== want) return false
    for (const i of T_CENTER_IDX[f]) if (state[i] !== want) return false
  }
  return true
}

const FACELET_GRID: [number, number][] = [
  [0, 0], [0, 2], [0, 4],
  [2, 0], [2, 2], [2, 4],
  [4, 0], [4, 2], [4, 4],
]

export function toFacelet3(state: Int8Array): string {
  let out = ''
  for (const f of FACES) for (const [r, c] of FACELET_GRID) out += FACES[state[idx(f, r, c)]]
  return out
}
