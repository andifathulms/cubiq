// F2L pair / x-cross solver (Phase A of the CFOP pipeline) — port of
// cubiq-ml f2l.py.
//
// Everything is canonicalised to the D face: callers remap the scramble
// through the face's rotation prefix, solve as if the cross face were D,
// and the resulting moves are already in the post-rotation frame.
//
// Search: IDA* over the F2L state (4 cross edges + 4 pair edges + 4 pair
// corners), goal = cross + a chosen subset of pairs. Heuristic: max over
// every piece that must end solved of the EXACT "cross + that piece"
// distance (tables over 24^4 x 24 = 7.9M states). Each is admissible for
// the joint goal, so solutions are optimal.
//
// Table building (new here): only the FR corner and FR edge tables are
// BFS'd; the other six follow from them by y-rotation conjugation (the
// D-cross is y-symmetric), an O(n) index remap instead of a 0.7s BFS each.

import {
  ALL_MOVES, CORNER_SLOTS, CORNER_TRANS, EDGE_TRANS, MOVE_FACE, MOVE_INDEX, scrambleToSubstates,
} from './cube3'
import { crossMoveTable, encodeCross, N_CROSS } from './cross'

export const D_CROSS_EDGES = [4, 5, 6, 7]
export const D_CROSS_SOLVED = encodeCross(D_CROSS_EDGES.map(e => e * 2))

/** D-face F2L pairs: slot name -> [corner index, edge index] */
export const F2L_PAIRS: [string, [number, number]][] = [
  ['FR', [CORNER_SLOTS.indexOf('DFR'), 8]],
  ['FL', [CORNER_SLOTS.indexOf('DFL'), 9]],
  ['BR', [CORNER_SLOTS.indexOf('DBR'), 10]],
  ['BL', [CORNER_SLOTS.indexOf('DBL'), 11]],
]
export const PAIR_NAMES = F2L_PAIRS.map(([n]) => n)
const PAIR_LIST = F2L_PAIRS.map(([, p]) => p)

const N_TABLE = N_CROSS * 24   // 7,962,624

// ── Exact "cross + one piece" distance tables ─────────────────────────────────
// Index = crossIdx + 331776 * piece_substate

function bfsPieceTable(pieceTrans: Int32Array[], homeSub: number): Uint8Array {
  const cm = crossMoveTable()
  const nm = ALL_MOVES.length
  const CM = new Int32Array(nm * N_CROSS)
  for (let m = 0; m < nm; m++) CM.set(cm[m], m * N_CROSS)
  const PT = new Int32Array(nm * 24)
  for (let m = 0; m < nm; m++) for (let i = 0; i < 24; i++) PT[m * 24 + i] = pieceTrans[m][i] * N_CROSS

  const dist = new Uint8Array(N_TABLE).fill(255)
  const queue = new Int32Array(N_TABLE)
  const start = D_CROSS_SOLVED + N_CROSS * homeSub
  dist[start] = 0
  queue[0] = start
  let tail = 1
  for (let head = 0; head < tail; head++) {
    const s = queue[head]
    const c = s % N_CROSS
    const p = (s - c) / N_CROSS
    const d = dist[s] + 1
    for (let m = 0; m < nm; m++) {
      const ns = CM[m * N_CROSS + c] + PT[m * 24 + p]
      if (dist[ns] === 255) {
        dist[ns] = d
        queue[tail++] = ns
      }
    }
  }
  return dist
}

// y-rotation relabelling of move faces (content of face f -> position map[f])
const Y_FACE: Record<string, string> = { R: 'F', F: 'L', L: 'B', B: 'R', U: 'U', D: 'D' }
function yPow(k: number): number[] {
  // move index -> relabelled move index under y^k
  return ALL_MOVES.map(m => {
    let f = m[0]
    for (let i = 0; i < k; i++) f = Y_FACE[f]
    return MOVE_INDEX[f + m.slice(1)]
  })
}

/** Every sub-state map sigma with sigma(T_m(x)) = T_{f(m)}(sigma(x)) for all
 *  moves that keeps orientation 0 at slot `anchorSlot`. */
function conjugators(trans: Int32Array[], f: number[], nOri: number, anchorSlot: number): Int32Array[] {
  const out: Int32Array[] = []
  for (let c = 0; c < 24; c++) {
    const sigma = new Int32Array(24).fill(-1)
    sigma[0] = c
    const stack = [0]
    let ok = true
    while (stack.length && ok) {
      const x = stack.pop()!
      for (let m = 0; m < trans.length && ok; m++) {
        const y = trans[m][x]
        const v = trans[f[m]][sigma[x]]
        if (sigma[y] === -1) { sigma[y] = v; stack.push(y) }
        else if (sigma[y] !== v) ok = false
      }
    }
    if (!ok || sigma.includes(-1) || new Set(sigma).size !== 24) continue
    if (sigma[anchorSlot * nOri] % nOri !== 0) continue
    out.push(sigma)
  }
  return out
}

interface Conj { edge: Int32Array; corner: Int32Array; cross: Int32Array }
let CONJ: Conj[] | null = null

/** Conjugation maps for y^1..y^3 (index k-1). cross[c] = image cross index. */
function conjugations(): Conj[] {
  if (CONJ) return CONJ
  CONJ = [1, 2, 3].map(k => {
    const f = yPow(k)
    const corner = conjugators(CORNER_TRANS, f, 3, PAIR_LIST[0][0])[0]
    // the edge equations have extra (non-geometric) solutions: keep the one
    // that carries every F2L pair onto another pair, like the corner map
    const pairOf = (c: number) => PAIR_LIST.find(([pc]) => pc === c)?.[1]
    const edge = conjugators(EDGE_TRANS, f, 2, D_CROSS_EDGES[0]).find(sig =>
      corner && PAIR_LIST.every(([pc, pe]) =>
        Math.floor(sig[pe * 2] / 2) === pairOf(Math.floor(corner[pc * 3] / 3))))
    if (!edge || !corner) throw new Error('F2L symmetry derivation failed')
    // digit j (piece D_CROSS_EDGES[j]) moves to the digit of its image piece
    const target = D_CROSS_EDGES.map(e => D_CROSS_EDGES.indexOf(Math.floor(edge[e * 2] / 2)))
    if (target.includes(-1)) throw new Error('F2L symmetry does not preserve the D cross')
    const cross = new Int32Array(N_CROSS)
    const pow = [1, 24, 576, 13824]
    for (let c = 0; c < N_CROSS; c++) {
      let x = c, out = 0
      for (let j = 0; j < 4; j++) {
        out += edge[x % 24] * pow[target[j]]
        x = Math.floor(x / 24)
      }
      cross[c] = out
    }
    return { edge, corner, cross }
  })
  return CONJ
}

/** Derive the table of piece sigma(home) from `src` (tracked piece home
 *  sub-state `home`). A y rotation can carry the tracked piece's home onto
 *  the image slot with non-zero orientation (cubing.js edge orientation is
 *  F/B-based); a uniform orientation shift of the tracked piece commutes
 *  with every move, so it is undone on the piece coordinate alone. */
function conjugateTable(src: Uint8Array, conj: Conj, sigma: Int32Array, home: number, nOri: number): Uint8Array {
  const off = sigma[home] % nOri
  const pieceMap = sigma.map(x => x - (x % nOri) + ((x % nOri) - off + nOri) % nOri)
  const out = new Uint8Array(N_TABLE)
  for (let p = 0; p < 24; p++) {
    const so = N_CROSS * p
    const to = N_CROSS * pieceMap[p]
    for (let c = 0; c < N_CROSS; c++) out[conj.cross[c] + to] = src[c + so]
  }
  return out
}

const PIECE_TABLES = new Map<string, Uint8Array>()

/** kind 'corner' | 'edge'; index = home slot of the tracked piece */
export function getPieceTable(kind: 'corner' | 'edge', index: number): Uint8Array {
  const key = `${kind}${index}`
  const cached = PIECE_TABLES.get(key)
  if (cached) return cached
  warmTables()
  return PIECE_TABLES.get(key)!
}

/** Build all 8 pair tables: 2 BFS + 6 conjugated copies. */
export function warmTables(): void {
  if (PIECE_TABLES.size === 8) return
  const [fc, fe] = PAIR_LIST[0]
  const baseC = bfsPieceTable(CORNER_TRANS, fc * 3)
  const baseE = bfsPieceTable(EDGE_TRANS, fe * 2)
  PIECE_TABLES.set(`corner${fc}`, baseC)
  PIECE_TABLES.set(`edge${fe}`, baseE)
  for (const conj of conjugations()) {
    const c = Math.floor(conj.corner[fc * 3] / 3)
    const e = Math.floor(conj.edge[fe * 2] / 2)
    PIECE_TABLES.set(`corner${c}`, conjugateTable(baseC, conj, conj.corner, fc * 3, 3))
    PIECE_TABLES.set(`edge${e}`, conjugateTable(baseE, conj, conj.edge, fe * 2, 2))
  }
  if (PIECE_TABLES.size !== 8) throw new Error('F2L tables incomplete')
}

// ── F2L state and IDA* ────────────────────────────────────────────────────────

export interface F2LState {
  cross: number             // encoded 4 D-cross edges (base 24)
  pe: number[]              // sub-state of edges FR, FL, BR, BL
  pc: number[]              // sub-state of corners DFR, DFL, DBR, DBL (pair order)
}

export function f2lFromScramble(scramble: string): F2LState {
  const [edges, corners] = scrambleToSubstates(scramble)
  return {
    cross: encodeCross(D_CROSS_EDGES.map(e => edges[e])),
    pe: PAIR_LIST.map(([, e]) => edges[e]),
    pc: PAIR_LIST.map(([c]) => corners[c]),
  }
}

export function applyF2L(s: F2LState, mi: number): F2LState {
  const et = EDGE_TRANS[mi], ct = CORNER_TRANS[mi]
  return {
    cross: crossMoveTable()[mi][s.cross],
    pe: [et[s.pe[0]], et[s.pe[1]], et[s.pe[2]], et[s.pe[3]]],
    pc: [ct[s.pc[0]], ct[s.pc[1]], ct[s.pc[2]], ct[s.pc[3]]],
  }
}

export function applyF2LMoves(s: F2LState, moves: readonly string[]): F2LState {
  for (const m of moves) s = applyF2L(s, MOVE_INDEX[m])
  return s
}

export const f2lKey = (s: F2LState) => `${s.cross},${s.pe.join(',')},${s.pc.join(',')}`

function pairSolved(s: F2LState, pi: number): boolean {
  const [c, e] = PAIR_LIST[pi]
  return s.pe[pi] === e * 2 && s.pc[pi] === c * 3
}

function goal(s: F2LState, targets: readonly number[]): boolean {
  return s.cross === D_CROSS_SOLVED && targets.every(p => pairSolved(s, p))
}

/** Max over target pairs of the exact cross+piece distances (admissible). */
export function heuristic(s: F2LState, targets: readonly number[]): number {
  let h = 0
  for (const pi of targets) {
    const [c, e] = PAIR_LIST[pi]
    const hc = getPieceTable('corner', c)[s.cross + N_CROSS * s.pc[pi]]
    const he = getPieceTable('edge', e)[s.cross + N_CROSS * s.pe[pi]]
    if (hc > h) h = hc
    if (he > h) h = he
  }
  if (h === 0 && !goal(s, targets)) h = 1
  return h
}

/** IDA* to solve cross + `targets` pairs from `state` (already-solved pairs
 *  in `targets` must be preserved — they are part of the goal). Returns up
 *  to maxSolutions optimal move sequences. */
export function solvePairs(state: F2LState, targets: readonly number[], maxDepth = 14, maxSolutions = 2): string[][] {
  const solutions: string[][] = []
  const path: string[] = []
  const dfs = (s: F2LState, depth: number, bound: number, lastFace: number) => {
    if (solutions.length >= maxSolutions) return
    const h = heuristic(s, targets)
    if (depth + h > bound) return
    if (h === 0 && goal(s, targets)) {
      solutions.push([...path])
      return
    }
    for (let mi = 0; mi < ALL_MOVES.length; mi++) {
      if (MOVE_FACE[mi] === lastFace) continue
      path.push(ALL_MOVES[mi])
      dfs(applyF2L(s, mi), depth + 1, bound, MOVE_FACE[mi])
      path.pop()
      if (solutions.length >= maxSolutions) return
    }
  }
  for (let bound = 0; bound <= maxDepth; bound++) {
    dfs(state, 0, bound, -1)
    if (solutions.length) return solutions
  }
  return solutions
}
