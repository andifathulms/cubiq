// Piece views of an NxN cube (N >= 6) on the sticker engine, shared by the
// 6x6 and 7x7 solvers.
//
// Centres: each face's (N-2)^2 inner stickers, minus the fixed centre on odd
// cubes. Turns never mix centre orbits, and the solved colour scheme is the
// engine's (on even cubes it is a convention; on odd cubes the fixed
// centres agree with it).
//
// Edges: each of the 12 positions holds N-2 border stickers pairs. On odd
// cubes the middle one is the midge (it fixes the edge's colours, like a 3x3
// edge); the rest are wings, in orbits by distance |t| from the middle.
// An edge is paired when every wing shows the same colours as the midge
// (odd) or as each other (even).
//
// Slices: the solvers use slice depths 2 .. floor(N/2); the middle
// slice of an odd cube would move the fixed centres.

import { FACES, applyMoves, makeCube, standardLayers, type CubeN, type Face } from './cubeN'

export interface BigCube {
  N: number
  label: string                         // '6x6'
  cube: CubeN
  solved: Int8Array
  depths: string[]                      // slice prefixes the solver may use
  midSlices: string[]                   // odd cubes: the middle slices (inside commutators only)
  fixedCentres: number[]                // odd cubes: the six fixed centre stickers
  centerIdx: Record<Face, number[]>
  allCenterIds: number[]
  wingSlots: [number, number][]
  wingOrbit: number[]                   // |t| of each wing
  edgePos: number[][]                   // wings of each edge position, along the edge
  midges: [number, number][] | null     // per edge position (odd cubes)
  apply: (state: Int8Array, moves: readonly string[]) => Int8Array
  centersSolved: (state: Int8Array) => boolean
  edgePaired: (state: Int8Array, pos: number) => boolean
  pairedCount: (state: Int8Array) => number
  toFacelet3: (state: Int8Array) => string
}

export function makeBigCube(N: number): BigCube {
  const maxDepth = Math.floor(N / 2)   // 6x6: 3; 7x7: 3 (its middle slice, 4, stays unused)
  const cube = makeCube(N, standardLayers(N, Math.ceil(N / 2), true), true)
  const solved = cube.solved
  const H = N / 2
  const odd = N % 2 === 1
  const mid = (N - 1) / 2
  const idx = cube.idx

  const centerIdx = Object.fromEntries(FACES.map(f => {
    const ids: number[] = []
    for (let r = 1; r < N - 1; r++) for (let c = 1; c < N - 1; c++) {
      if (odd && r === mid && c === mid) continue
      ids.push(idx(f, r, c))
    }
    return [f, ids]
  })) as Record<Face, number[]>
  const allCenterIds = FACES.flatMap(f => centerIdx[f])

  // border stickers: |coords| sorted = [t, H - 0.5, H], t < H - 0.5
  const wingSlots: [number, number][] = []
  const wingT: number[] = []
  const midgeByKey = new Map<string, [number, number]>()
  const pairKey = (a: number, b: number) => [Math.floor(a / (N * N)), Math.floor(b / (N * N))].sort((x, y) => x - y).join()
  {
    const seen = new Set<number>()
    for (let i = 0; i < cube.nStickers; i++) {
      if (seen.has(i)) continue
      const p = cube.pos[i]
      const abs = p.map(Math.abs)
      const s = [...abs].sort((a, b) => a - b)
      if (s[2] !== H || s[1] !== H - 0.5 || s[0] === H - 0.5) continue
      const aFace = abs.indexOf(H)
      const aBorder = abs.indexOf(H - 0.5)
      const aT = [0, 1, 2].find(a => a !== aFace && a !== aBorder)!
      const q = [...p] as [number, number, number]
      q[aFace] = (H - 0.5) * Math.sign(p[aFace])
      q[aBorder] = H * Math.sign(p[aBorder])
      const n2: [number, number, number] = [0, 0, 0]
      n2[aBorder] = Math.sign(p[aBorder])
      const j = cube.lookup(q, n2)
      seen.add(i)
      seen.add(j)
      if (p[aT] === 0) midgeByKey.set(pairKey(i, j), [i, j])
      else { wingSlots.push([i, j]); wingT.push(p[aT]) }
    }
  }
  const byPair = new Map<string, number[]>()
  wingSlots.forEach(([a, b], w) => {
    const k = pairKey(a, b)
    if (!byPair.has(k)) byPair.set(k, [])
    byPair.get(k)!.push(w)
  })
  const keys = [...byPair.keys()]
  const edgePos = keys.map(k => byPair.get(k)!.sort((x, y) => wingT[x] - wingT[y]))
  const midges = odd ? keys.map(k => midgeByKey.get(k)!) : null
  if (edgePos.length !== 12 || wingSlots.length !== 12 * (N - 2 - (odd ? 1 : 0))) throw new Error(`${N}x${N} edge slots`)

  const centersSolved = (st: Int8Array) => {
    for (let f = 0; f < 6; f++) for (const i of centerIdx[FACES[f]]) if (st[i] !== f) return false
    return true
  }
  const edgePaired = (st: Int8Array, pos: number) => {
    const ws = edgePos[pos]
    const [ra, rb] = midges ? midges[pos] : wingSlots[ws[0]]
    for (const w of ws) {
      const [a, b] = wingSlots[w]
      if (st[a] !== st[ra] || st[b] !== st[rb]) return false
    }
    return true
  }
  const pairedCount = (st: Int8Array) => { let n = 0; for (let p = 0; p < 12; p++) if (edgePaired(st, p)) n++; return n }

  // 3x3 read-off: corners, one edge sticker and one centre sticker per cell
  const e = odd ? mid : 2
  const grid: [number, number][] = [[0, 0], [0, e], [0, N - 1], [e, 0], [e, e], [e, N - 1], [N - 1, 0], [N - 1, e], [N - 1, N - 1]]
  const toFacelet3 = (st: Int8Array) => {
    let out = ''
    for (const f of FACES) for (const [r, c] of grid) out += FACES[st[idx(f, r, c)]]
    return out
  }

  return {
    N, label: `${N}x${N}`, cube, solved,
    depths: Array.from({ length: maxDepth - 1 }, (_, i) => String(i + 2)),
    midSlices: odd ? ['R', 'U', 'F'].map(f => `${mid + 1}${f}`) : [],
    fixedCentres: odd ? FACES.map(f => idx(f, mid, mid)) : [],
    centerIdx, allCenterIds, wingSlots, wingOrbit: wingT.map(Math.abs), edgePos, midges,
    apply: (st, moves) => applyMoves(cube, st, moves),
    centersSolved, edgePaired, pairedCount, toFacelet3,
  }
}
