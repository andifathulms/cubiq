// NxNxN cube engine (sticker model, geometry-generated move tables) — the
// shared core of cubiq-ml's cube444.py / cube555.py, parametrised by N.
//
// State = 6*N*N stickers (faces U,R,F,D,L,B in kociemba order, row-major,
// standard viewing conventions), each holding its home face index. Move
// permutations come from rotating each sticker's 3D centre + outward normal
// and matching the result, so nothing is hand-typed.
//
// Convention: perm[dest] = src, i.e. newState[dest] = oldState[perm[dest]].

export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const
export type Face = (typeof FACES)[number]

type Vec = [number, number, number]

const NORMALS: Record<Face, Vec> = {
  U: [0, 1, 0], D: [0, -1, 0], F: [0, 0, 1],
  B: [0, 0, -1], R: [1, 0, 0], L: [-1, 0, 0],
}

/** Rotate v about axis (0=x,1=y,2=z) by quarterTurns * -90deg: one quarter
 *  turn equals the clockwise turn of that axis's positive face. */
function rot(axis: number, quarterTurns: number, v: Vec): Vec {
  let [x, y, z] = v
  for (let i = 0; i < ((quarterTurns % 4) + 4) % 4; i++) {
    if (axis === 0) [x, y, z] = [x, z, -y]
    else if (axis === 1) [x, y, z] = [-z, y, x]
    else [x, y, z] = [y, -x, z]
  }
  return [x, y, z]
}

/** Layer spec: axis, coordinate range, quarter-turn sign for a clockwise turn. */
export type LayerSpec = [axis: number, lo: number, hi: number, sign: number]

export interface CubeN {
  N: number
  nStickers: number
  pos: Vec[]
  nrm: Vec[]
  moves: Map<string, Int32Array>
  solved: Int8Array
  /** sticker index lookup by (2*position, normal) */
  lookup: (p: Vec, n: Vec) => number
  idx: (face: Face, r: number, c: number) => number
}

const key = (p: Vec, n: Vec) =>
  `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)},${Math.round(p[2] * 2)},${Math.round(n[0])},${Math.round(n[1])},${Math.round(n[2])}`

/** Standard layer specs: outer faces, inner slices 2..k ('2U'...), and
 *  whole-cube rotations when requested. */
export function standardLayers(N: number, slices: number, rotations: boolean): Record<string, LayerSpec> {
  const H = N / 2
  const base: Record<string, LayerSpec> = {}
  const posFace: [string, number][] = [['U', 1], ['R', 0], ['F', 2]]
  const negFace: [string, number][] = [['D', 1], ['L', 0], ['B', 2]]
  for (let k = 1; k <= slices; k++) {
    const pre = k === 1 ? '' : String(k)
    for (const [f, axis] of posFace) base[pre + f] = [axis, H - k, H - k + 1, 1]
    // the middle slice of an odd cube is only named from the positive faces
    if (!(N % 2 === 1 && k === (N + 1) / 2)) {
      for (const [f, axis] of negFace) base[pre + f] = [axis, -(H - k + 1), -(H - k), 3]
    }
  }
  if (rotations) {
    base.x = [0, -H, H, 1]
    base.y = [1, -H, H, 1]
    base.z = [2, -H, H, 1]
  }
  return base
}

export function makeCube(N: number, layers: Record<string, LayerSpec>, wide: boolean): CubeN {
  const m = (N - 1) / 2
  const H = N / 2
  const T = Array.from({ length: N }, (_, i) => i - m)
  const gridToXyz = (face: Face, r: number, c: number): Vec => {
    switch (face) {
      case 'U': return [T[c], H, -m + r]
      case 'D': return [T[c], -H, m - r]
      case 'F': return [T[c], m - r, H]
      case 'B': return [m - c, m - r, -H]
      case 'R': return [H, m - r, m - c]
      case 'L': return [-H, m - r, -m + c]
    }
  }

  const pos: Vec[] = []
  const nrm: Vec[] = []
  const table = new Map<string, number>()
  for (const f of FACES) {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const p = gridToXyz(f, r, c)
        table.set(key(p, NORMALS[f]), pos.length)
        pos.push(p)
        nrm.push(NORMALS[f])
      }
    }
  }
  const nStickers = pos.length
  const lookup = (p: Vec, n: Vec) => {
    const i = table.get(key(p, n))
    if (i === undefined) throw new Error('sticker lookup failed')
    return i
  }

  const layerPerm = (axis: number, lo: number, hi: number, q: number): Int32Array => {
    const perm = new Int32Array(nStickers)
    for (let i = 0; i < nStickers; i++) perm[i] = i
    for (let src = 0; src < nStickers; src++) {
      const p = pos[src]
      if (!(lo <= p[axis] && p[axis] <= hi)) continue
      perm[lookup(rot(axis, q, p), rot(axis, q, nrm[src]))] = src
    }
    return perm
  }

  const moves = new Map<string, Int32Array>()
  for (const [name, [axis, lo, hi, sign]] of Object.entries(layers)) {
    for (const [suffix, k] of [['', 1], ['2', 2], ["'", 3]] as const) {
      moves.set(name + suffix, layerPerm(axis, lo, hi, (sign * k) % 4))
    }
  }
  if (wide) {
    // wide = outer + second slice (same axis, so order is irrelevant)
    for (const f of FACES) {
      for (const suffix of ['', '2', "'"]) {
        moves.set(f + 'w' + suffix, compose(moves.get('2' + f + suffix)!, moves.get(f + suffix)!))
        // three-layer wide (6x6 and up): 3Rw = R + 2R + 3R
        const third = moves.get('3' + f + suffix)
        if (N >= 6 && third) moves.set('3' + f + 'w' + suffix, compose(third, moves.get(f + 'w' + suffix)!))
      }
    }
  }

  const solved = new Int8Array(nStickers)
  for (let i = 0; i < nStickers; i++) solved[i] = Math.floor(i / (N * N))

  return {
    N, nStickers, pos, nrm, moves, solved, lookup,
    idx: (face, r, c) => FACES.indexOf(face) * N * N + r * N + c,
  }
}

/** numpy a[b]: result[i] = a[b[i]] — in the perm[dest]=src convention this
 *  is the permutation of doing a, then b. */
export function compose(a: Int32Array, b: Int32Array): Int32Array {
  const out = new Int32Array(a.length)
  for (let i = 0; i < a.length; i++) out[i] = a[b[i]]
  return out
}

export function applyPerm(state: Int8Array, perm: Int32Array): Int8Array {
  const out = new Int8Array(state.length)
  for (let i = 0; i < state.length; i++) out[i] = state[perm[i]]
  return out
}

export function applyMoves(cube: CubeN, state: Int8Array, moves: readonly string[]): Int8Array {
  for (const m of moves) {
    const p = cube.moves.get(m)
    if (!p) throw new Error(`unknown move '${m}'`)
    state = applyPerm(state, p)
  }
  return state
}

export function fromScramble(cube: CubeN, scramble: string): Int8Array {
  return applyMoves(cube, cube.solved, scramble.split(/\s+/).filter(Boolean))
}

export function isSolved(cube: CubeN, state: Int8Array): boolean {
  const n2 = cube.N * cube.N
  for (let f = 0; f < 6; f++) {
    const c = state[f * n2]
    for (let i = 1; i < n2; i++) if (state[f * n2 + i] !== c) return false
  }
  return true
}

export function invertMoves(moves: readonly string[]): string[] {
  const inv: string[] = []
  for (let i = moves.length - 1; i >= 0; i--) {
    const m = moves[i]
    if (m.endsWith("'")) inv.push(m.slice(0, -1))
    else if (m.endsWith('2')) inv.push(m)
    else inv.push(m + "'")
  }
  return inv
}
