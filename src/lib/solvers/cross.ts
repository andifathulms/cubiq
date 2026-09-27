// Cross solver core (port of cubiq-ml solver.py, itself a port of the
// original src/lib/solver.ts).
//
// The cross of a face depends only on its 4 edges. Each tracked edge is a
// (slot, orientation) sub-state (24 values), so the cross space has
// 24^4 = 331,776 states. It is BFS'd once per face, giving the EXACT
// distance of every state: solving is a walk down the gradient, every
// solution is optimal, and enumerating alternatives is cheap.
//
// Solutions are expressed AFTER the rotation prefix (csTimer convention):
// "z2  R' F L ..." means rotate z2 first, then perform the moves as read.

import { ALL_MOVES, EDGE_TRANS, FACE_ROTATION, remapMoves, scrambleToSubstates } from './cube3'
import { bfsTable } from './perm'

export type CrossFace = 'D' | 'U' | 'F' | 'B' | 'R' | 'L'

export const FACE_CROSS: Record<CrossFace, [number, number, number, number]> = {
  D: [4, 5, 6, 7],
  U: [0, 1, 2, 3],
  F: [0, 4, 8, 9],
  B: [2, 6, 10, 11],
  R: [1, 5, 8, 10],
  L: [3, 7, 9, 11],
}
export const CROSS_FACES: CrossFace[] = ['D', 'U', 'F', 'B', 'R', 'L']

export const N_CROSS = 24 ** 4 // 331,776

/** Encoded cross state (base-24 digits = the 4 edges' sub-states). */
export function encodeCross(subs: readonly number[]): number {
  return subs[0] + 24 * subs[1] + 576 * subs[2] + 13824 * subs[3]
}

let CROSS_MOVE: Int32Array[] | null = null

/** CROSS_MOVE[move][crossIdx] — the same for every face (only the solved
 *  state differs). */
export function crossMoveTable(): Int32Array[] {
  if (CROSS_MOVE) return CROSS_MOVE
  CROSS_MOVE = EDGE_TRANS.map(t => {
    const out = new Int32Array(N_CROSS)
    for (let s = 0; s < N_CROSS; s++) {
      out[s] = t[s % 24] + 24 * t[Math.floor(s / 24) % 24]
        + 576 * t[Math.floor(s / 576) % 24] + 13824 * t[Math.floor(s / 13824)]
    }
    return out
  })
  return CROSS_MOVE
}

const TABLES = new Map<CrossFace, Uint8Array>()

export function crossTable(face: CrossFace): Uint8Array {
  const cached = TABLES.get(face)
  if (cached) return cached
  const cm = crossMoveTable()
  const solved = encodeCross(FACE_CROSS[face].map(e => e * 2))
  const dist = bfsTable(N_CROSS, [solved], ALL_MOVES.length, (s, m) => cm[m][s])
  TABLES.set(face, dist)
  return dist
}

function findOptimalSolutions(state: number, dist: Uint8Array, limit: number): string[][] {
  const cm = crossMoveTable()
  const solutions: string[][] = []
  const path: string[] = []
  const dfs = (s: number) => {
    if (solutions.length >= limit) return
    const h = dist[s]
    if (h === 0) {
      solutions.push([...path])
      return
    }
    for (let mi = 0; mi < ALL_MOVES.length; mi++) {
      const ns = cm[mi][s]
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

export interface CrossResult {
  face: CrossFace
  rotation: string
  moves: string[]
  move_count: number
  alternatives: string[][]
}

export function solveCross(scramble: string, face: CrossFace, maxAlternatives = 3): CrossResult {
  const [edges] = scrambleToSubstates(scramble)
  const state = encodeCross(FACE_CROSS[face].map(e => edges[e]))
  const rotation = FACE_ROTATION[face]
  const remapped = findOptimalSolutions(state, crossTable(face), maxAlternatives)
    .map(m => remapMoves(m, rotation))
  const moves = remapped[0] ?? []
  return { face, rotation, moves, move_count: moves.length, alternatives: remapped.slice(1) }
}

export function solveAllCrosses(scramble: string, maxAlternatives = 3): CrossResult[] {
  return CROSS_FACES.map(f => solveCross(scramble, f, maxAlternatives))
}
