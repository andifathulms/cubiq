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

// Rotation prefix shown alongside the solution (display-only, matches csTimer)
const FACE_ROTATION: Record<Face, string> = {
  D: '', U: 'z2', F: "x'", B: 'x', R: 'z', L: "z'",
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

// Precompute inverse permutations: invPerm[old_slot] = new_slot
// (where does a piece currently in old_slot end up after this move?)
const INV_PERM: Record<string, number[]> = {}
for (const [m, [perm]] of Object.entries(MOVE_TABLES)) {
  const inv = new Array<number>(12)
  for (let i = 0; i < 12; i++) inv[perm[i]] = i
  INV_PERM[m] = inv
}

// Face index for same-face pruning in IDA*
const MOVE_FACE: Record<string, number> = {
  U: 0, "U'": 0, U2: 0,
  D: 1, "D'": 1, D2: 1,
  F: 2, "F'": 2, F2: 2,
  B: 3, "B'": 3, B2: 3,
  R: 4, "R'": 4, R2: 4,
  L: 5, "L'": 5, L2: 5,
}

// ── State encoding ────────────────────────────────────────────────────────────
// State = [slot0,ori0, slot1,ori1, slot2,ori2, slot3,ori3] for the 4 cross pieces.
// Each (slot,ori) pair encodes as slot*2+ori (0-23). 4 pieces → 24^4 = 331,776 keys.

function encode(s: number[]): number {
  return (s[0] * 2 + s[1]) +
    24  * (s[2] * 2 + s[3]) +
    576 * (s[4] * 2 + s[5]) +
    13824 * (s[6] * 2 + s[7])
}

function applyMoveToState(s: number[], move: string): number[] {
  const invPerm = INV_PERM[move]
  const [, ori] = MOVE_TABLES[move]
  const result = new Array<number>(8)
  for (let i = 0; i < 4; i++) {
    const slot = s[i * 2]
    const newSlot = invPerm[slot]
    result[i * 2]     = newSlot
    result[i * 2 + 1] = (s[i * 2 + 1] + ori[newSlot]) % 2
  }
  return result
}

// ── BFS pruning table ─────────────────────────────────────────────────────────
// table[encoded_state] = min moves to reach solved (255 = unvisited).
// BFS starts from solved state and expands outward up to depth 8.

function buildPruningTable(crossPieces: readonly [number, number, number, number]): Uint8Array {
  const table = new Uint8Array(331776).fill(255)
  const solvedState = [crossPieces[0], 0, crossPieces[1], 0, crossPieces[2], 0, crossPieces[3], 0]
  table[encode(solvedState)] = 0

  // BFS using a typed queue for efficiency
  const queue: number[][] = [solvedState]
  let qi = 0
  while (qi < queue.length) {
    const state = queue[qi++]
    const depth = table[encode(state)]
    if (depth >= 8) continue
    for (const move of ALL_MOVES) {
      const next = applyMoveToState(state, move)
      const key = encode(next)
      if (table[key] === 255) {
        table[key] = depth + 1
        queue.push(next)
      }
    }
  }
  return table
}

// ── IDA* ──────────────────────────────────────────────────────────────────────

function idaSearch(
  state: number[],
  depth: number,
  maxDepth: number,
  lastFace: number,
  path: string[],
  table: Uint8Array,
): boolean {
  const h = table[encode(state)]
  if (h === 255) return false        // unreachable (shouldn't happen on valid states)
  if (depth + h > maxDepth) return false
  if (h === 0) return true           // solved

  for (const move of ALL_MOVES) {
    const face = MOVE_FACE[move]
    if (face === lastFace) continue  // same-face pruning
    const next = applyMoveToState(state, move)
    path.push(move)
    if (idaSearch(next, depth + 1, maxDepth, face, path, table)) return true
    path.pop()
  }
  return false
}

function idaSolve(initialState: number[], table: Uint8Array): string[] {
  const path: string[] = []
  for (let maxDepth = 0; maxDepth <= 8; maxDepth++) {
    path.length = 0
    if (idaSearch(initialState, 0, maxDepth, -1, path, table)) return [...path]
  }
  return []
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function solveAllCrosses(scramble: string): Promise<CrossSolution[]> {
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
    const table = buildPruningTable(cross)
    const initialState = [
      pieceSlot[cross[0]], pieceOri[cross[0]],
      pieceSlot[cross[1]], pieceOri[cross[1]],
      pieceSlot[cross[2]], pieceOri[cross[2]],
      pieceSlot[cross[3]], pieceOri[cross[3]],
    ]
    const moves = idaSolve(initialState, table)
    solutions.push({
      face,
      rotation: FACE_ROTATION[face],
      moves,
      move_count: moves.length,
    })
  }

  return solutions
}
