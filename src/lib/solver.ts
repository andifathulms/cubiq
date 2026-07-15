import type { CrossSolution } from '@/types'

type Face = 'D' | 'U' | 'F' | 'B' | 'R' | 'L'

// ── Edge indices for each face's 4 cross pieces ───────────────────────────────
const FACE_CROSS: Record<Face, [number, number, number, number]> = {
  D: [4, 5, 6, 7],
  U: [0, 1, 2, 3],
  F: [0, 4, 8, 9],
  B: [2, 6, 10, 11],
  R: [1, 5, 8, 10],
  L: [3, 7, 9, 11],
}

// Rotation prefix for each face (csTimer convention: hold the cross face down)
const FACE_ROTATION: Record<Face, string> = {
  D: '', U: 'z2', F: "x'", B: 'x', R: 'z', L: "z'",
}

// How each rotation maps an original face to its spatial position afterwards.
// Solution moves are remapped through this so that "rotation + moves"
// performed as read actually solves the cross.
const ROT_MAP: Record<string, Record<string, string>> = {
  '':   {},
  'z2': { U: 'D', D: 'U', R: 'L', L: 'R' },
  "x'": { F: 'D', D: 'B', B: 'U', U: 'F' },
  'x':  { F: 'U', U: 'B', B: 'D', D: 'F' },
  'z':  { U: 'R', R: 'D', D: 'L', L: 'U' },
  "z'": { U: 'L', L: 'D', D: 'R', R: 'U' },
}

// ── 18-move edge tables from cubing.js KTransformation ───────────────────────
// perm[new_slot] = old_slot   (new state gets piece from old_slot)
// ori [new_slot] = orientation delta at new_slot
const MOVE_TABLES: Record<string, readonly [readonly number[], readonly number[]]> = {
  'U':   [[1,2,3,0,4,5,6,7,8,9,10,11],   [0,0,0,0,0,0,0,0,0,0,0,0]],
  "U'":  [[3,0,1,2,4,5,6,7,8,9,10,11],   [0,0,0,0,0,0,0,0,0,0,0,0]],
  'U2':  [[2,3,0,1,4,5,6,7,8,9,10,11],   [0,0,0,0,0,0,0,0,0,0,0,0]],
  'D':   [[0,1,2,3,7,4,5,6,8,9,10,11],   [0,0,0,0,0,0,0,0,0,0,0,0]],
  "D'":  [[0,1,2,3,5,6,7,4,8,9,10,11],   [0,0,0,0,0,0,0,0,0,0,0,0]],
  'D2':  [[0,1,2,3,6,7,4,5,8,9,10,11],   [0,0,0,0,0,0,0,0,0,0,0,0]],
  'F':   [[9,1,2,3,8,5,6,7,0,4,10,11],   [1,0,0,0,1,0,0,0,1,1,0,0]],
  "F'":  [[8,1,2,3,9,5,6,7,4,0,10,11],   [1,0,0,0,1,0,0,0,1,1,0,0]],
  'F2':  [[4,1,2,3,0,5,6,7,9,8,10,11],   [0,0,0,0,0,0,0,0,0,0,0,0]],
  'B':   [[0,1,10,3,4,5,11,7,8,9,6,2],   [0,0,1,0,0,0,1,0,0,0,1,1]],
  "B'":  [[0,1,11,3,4,5,10,7,8,9,2,6],   [0,0,1,0,0,0,1,0,0,0,1,1]],
  'B2':  [[0,1,6,3,4,5,2,7,8,9,11,10],   [0,0,0,0,0,0,0,0,0,0,0,0]],
  'R':   [[0,8,2,3,4,10,6,7,5,9,1,11],   [0,0,0,0,0,0,0,0,0,0,0,0]],
  "R'":  [[0,10,2,3,4,8,6,7,1,9,5,11],   [0,0,0,0,0,0,0,0,0,0,0,0]],
  'R2':  [[0,5,2,3,4,1,6,7,10,9,8,11],   [0,0,0,0,0,0,0,0,0,0,0,0]],
  'L':   [[0,1,2,11,4,5,6,9,8,3,10,7],   [0,0,0,0,0,0,0,0,0,0,0,0]],
  "L'":  [[0,1,2,9,4,5,6,11,8,7,10,3],   [0,0,0,0,0,0,0,0,0,0,0,0]],
  'L2':  [[0,1,2,7,4,5,6,3,8,11,10,9],   [0,0,0,0,0,0,0,0,0,0,0,0]],
}

const ALL_MOVES = Object.keys(MOVE_TABLES)
const N_STATES = 24 ** 4 // 331,776

// ── State encoding ────────────────────────────────────────────────────────────
// Each tracked cross piece is a (slot, orientation) sub-state: slot*2+ori, 0-23.
// Full state = base-24 combination of the 4 pieces' sub-states (24^4 keys).
// The sub-state transition per move is the same for every face — only the
// solved state differs — so SUB_TRANS is computed once, globally.
// SUB_TRANS[moveIdx][sub] = sub after that move.
const SUB_TRANS: Int32Array[] = ALL_MOVES.map(m => {
  const [perm, ori] = MOVE_TABLES[m]
  const inv = new Array<number>(12)
  for (let i = 0; i < 12; i++) inv[perm[i]] = i
  const t = new Int32Array(24)
  for (let slot = 0; slot < 12; slot++) {
    for (let o = 0; o < 2; o++) {
      const ns = inv[slot]
      t[slot * 2 + o] = ns * 2 + ((o + ori[ns]) % 2)
    }
  }
  return t
})

function applyMoveEncoded(state: number, moveIdx: number): number {
  const t = SUB_TRANS[moveIdx]
  return t[state % 24]
    + 24 * t[Math.floor(state / 24) % 24]
    + 576 * t[Math.floor(state / 576) % 24]
    + 13824 * t[Math.floor(state / 13824) % 24]
}

// ── Exact distance tables (BFS over the full 331,776-state space) ────────────
// Because the whole space is enumerated, dist[state] is the EXACT number of
// moves to solve — solving is a walk down the gradient, always optimal.
// Built lazily once per face, then cached for the lifetime of the page.

const TABLE_CACHE = new Map<Face, Uint8Array>()

function getDistanceTable(face: Face): Uint8Array {
  const cached = TABLE_CACHE.get(face)
  if (cached) return cached

  const cross = FACE_CROSS[face]
  const dist = new Uint8Array(N_STATES).fill(255)
  const solved = cross[0] * 2 + 24 * (cross[1] * 2) + 576 * (cross[2] * 2) + 13824 * (cross[3] * 2)
  dist[solved] = 0

  const queue = new Int32Array(N_STATES)
  queue[0] = solved
  let head = 0
  let tail = 1
  while (head < tail) {
    const s = queue[head++]
    const d = dist[s]
    for (let mi = 0; mi < SUB_TRANS.length; mi++) {
      const ns = applyMoveEncoded(s, mi)
      if (dist[ns] === 255) {
        dist[ns] = d + 1
        queue[tail++] = ns
      }
    }
  }

  TABLE_CACHE.set(face, dist)
  return dist
}

// ── Optimal solution enumeration ──────────────────────────────────────────────

function findOptimalSolutions(state: number, dist: Uint8Array, limit: number): string[][] {
  const solutions: string[][] = []
  const path: string[] = []

  function dfs(s: number) {
    if (solutions.length >= limit) return
    const h = dist[s]
    if (h === 0) {
      solutions.push([...path])
      return
    }
    for (let mi = 0; mi < ALL_MOVES.length; mi++) {
      const ns = applyMoveEncoded(s, mi)
      if (dist[ns] === h - 1) {
        path.push(ALL_MOVES[mi])
        dfs(ns)
        path.pop()
        if (solutions.length >= limit) return
      }
    }
  }

  dfs(state)
  return solutions
}

function remapMoves(moves: string[], rotation: string): string[] {
  const mapping = ROT_MAP[rotation]
  return moves.map(m => (mapping[m[0]] ?? m[0]) + m.slice(1))
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function solveAllCrosses(scramble: string, maxAlternatives = 3): Promise<CrossSolution[]> {
  const { cube3x3x3 } = await import('cubing/puzzles')
  const { Alg } = await import('cubing/alg')

  const kpuzzle = await cube3x3x3.kpuzzle()
  const scrambled = kpuzzle.defaultPattern().applyAlg(new Alg(scramble))

  // Map piece → (slot, orientation) from the scrambled pattern
  const pieceSlot = new Array<number>(12)
  const pieceOri  = new Array<number>(12)
  const { pieces, orientation } = scrambled.patternData['EDGES']
  for (let slot = 0; slot < 12; slot++) {
    pieceSlot[pieces[slot]] = slot
    pieceOri[pieces[slot]]  = orientation[slot]
  }

  const faces: Face[] = ['D', 'U', 'F', 'B', 'R', 'L']
  const solutions: CrossSolution[] = []

  for (const face of faces) {
    const cross = FACE_CROSS[face]
    const dist = getDistanceTable(face)
    let state = 0
    for (let i = 0; i < 4; i++) {
      state += (pieceSlot[cross[i]] * 2 + pieceOri[cross[i]]) * 24 ** i
    }
    const rotation = FACE_ROTATION[face]
    const allOptimal = findOptimalSolutions(state, dist, maxAlternatives)
    const remapped = allOptimal.map(m => remapMoves(m, rotation))
    const moves = remapped[0] ?? []
    solutions.push({
      face,
      rotation,
      moves,
      move_count: moves.length,
      alternatives: remapped.slice(1),
    })
  }

  return solutions
}
