// Last-layer stage (Phase B of the CFOP pipeline) — port of cubiq-ml
// lastlayer.py: OLL and PLL recognition on a full-cube sub-state model.
//
// Recognition is brute force: try every alg under the 4 pre-AUFs and check
// the goal predicate (~230 trials of ~15 moves — microseconds). Algs are in
// standard notation (wide, M/S/E, x/y/z) and expanded to the 18 outer face
// moves by expandAlg, which tracks cube orientation so the emitted moves are
// frame-correct.

import { CORNER_TRANS, EDGE_TRANS, MOVE_INDEX, scrambleToSubstates } from './cube3'

// ── Full-cube state ───────────────────────────────────────────────────────────

export interface FullState {
  edges: number[]     // edges[piece] = slot*2 + ori
  corners: number[]   // corners[piece] = slot*3 + ori
}

export function fullFromScramble(scramble: string): FullState {
  const [edges, corners] = scrambleToSubstates(scramble)
  return { edges, corners }
}

export function applyFull(s: FullState, moves: readonly string[]): FullState {
  let { edges, corners } = s
  for (const m of moves) {
    const mi = MOVE_INDEX[m]
    const et = EDGE_TRANS[mi], ct = CORNER_TRANS[mi]
    edges = edges.map(x => et[x])
    corners = corners.map(x => ct[x])
  }
  return { edges, corners }
}

const isSolved = (s: FullState) =>
  s.edges.every((x, p) => x === p * 2) && s.corners.every((x, p) => x === p * 3)

/** Cross + all 4 pairs solved (everything except the U layer). */
function f2lSolved(s: FullState): boolean {
  for (let p = 4; p < 12; p++) if (s.edges[p] !== p * 2) return false
  for (let p = 4; p < 8; p++) if (s.corners[p] !== p * 3) return false
  return true
}

/** F2L solved and every U-layer piece in the U layer, oriented. */
function llOriented(s: FullState): boolean {
  if (!f2lSolved(s)) return false
  for (let p = 0; p < 4; p++) {
    const e = s.edges[p], c = s.corners[p]
    if (e % 2 !== 0 || Math.floor(e / 2) > 3) return false
    if (c % 3 !== 0 || Math.floor(c / 3) > 3) return false
  }
  return true
}

const AUFS = ['', 'U', 'U2', "U'"]

/** The final AUF ('' if none) if solved after at most one U turn, else null. */
function solvedUpToAuf(s: FullState): string | null {
  for (const auf of AUFS) if (isSolved(auf ? applyFull(s, [auf]) : s)) return auf
  return null
}

// ── Alg notation -> 18 face moves ─────────────────────────────────────────────

// Whole-cube rotations: content of face f moves to position map[f].
const BASE_ROT: Record<string, Record<string, string>> = {
  x: { F: 'U', U: 'B', B: 'D', D: 'F' },
  y: { R: 'F', F: 'L', L: 'B', B: 'R' },
  z: { U: 'R', R: 'D', D: 'L', L: 'U' },
}
const FACES6 = [...'UDFBRL']

function rotPow(axis: string, k: number): Record<string, string> {
  let m: Record<string, string> = Object.fromEntries(FACES6.map(f => [f, f]))
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) {
    const base = BASE_ROT[axis]
    m = Object.fromEntries(Object.entries(m).map(([f, p]) => [f, base[p] ?? p]))
  }
  return m
}

const SUFFIX_POW: Record<string, number> = { '': 1, '2': 2, "'": 3 }
const powSuffix = (k: number) => ({ 1: '', 2: '2', 3: "'" } as Record<number, string>)[((k % 4) + 4) % 4]

// Wide/slice moves: [rotation axis, rotation power per turn, [face, power per turn][]]
const COMPOUND: Record<string, [string, number, [string, number][]]> = {
  r: ['x', 1, [['L', 1]]],
  l: ['x', 3, [['R', 1]]],
  u: ['y', 1, [['D', 1]]],
  d: ['y', 3, [['U', 1]]],
  f: ['z', 1, [['B', 1]]],
  b: ['z', 3, [['F', 1]]],
  M: ['x', 3, [['L', 3], ['R', 1]]],
  S: ['z', 1, [['B', 1], ['F', 3]]],
  E: ['y', 3, [['U', 1], ['D', 3]]],
}

/** Expand an alg with rotations/wide/slice moves into outer face moves.
 *  posToFace[p] = original face currently at position p. */
export function expandAlg(alg: string): string[] {
  let posToFace: Record<string, string> = Object.fromEntries(FACES6.map(f => [f, f]))
  const out: string[] = []
  const emit = (face: string, power: number) => out.push(posToFace[face] + powSuffix(power))
  const rotate = (axis: string, power: number) => {
    const m = rotPow(axis, power)     // face content f -> position m[f]
    const inv: Record<string, string> = Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]))
    posToFace = Object.fromEntries(FACES6.map(p => [p, posToFace[inv[p] ?? p]]))
  }
  for (const token of alg.split(/\s+/).filter(Boolean)) {
    let base = token.replace(/['2]+$/, '')
    const k = SUFFIX_POW[token.slice(base.length)]
    if (k === undefined) throw new Error(`unknown token '${token}' in alg '${alg}'`)
    if (base.endsWith('w')) base = base[0].toLowerCase()
    if (base === 'x' || base === 'y' || base === 'z') rotate(base, k)
    else if (base in COMPOUND) {
      const [axis, rotPer, faces] = COMPOUND[base]
      for (const [face, fpow] of faces) emit(face, fpow * k)
      rotate(axis, rotPer * k)
    } else if (base.length === 1 && 'UDFBRL'.includes(base)) emit(base, k)
    else throw new Error(`unknown token '${token}' in alg '${alg}'`)
  }
  return out
}

// ── Alg databases (standard speedsolving algs) ────────────────────────────────

const OLL_ALGS: Record<string, string> = {
  'OLL 1':  "R U2 R2 F R F' U2 R' F R F'",
  'OLL 2':  "F R U R' U' F' f R U R' U' f'",
  'OLL 3':  "f R U R' U' f' U' F R U R' U' F'",
  'OLL 4':  "f R U R' U' f' U F R U R' U' F'",
  'OLL 5':  "r' U2 R U R' U r",
  'OLL 6':  "r U2 R' U' R U' r'",
  'OLL 7':  "r U R' U R U2 r'",
  'OLL 8':  "r' U' R U' R' U2 r",
  'OLL 9':  "R U R' U' R' F R2 U R' U' F'",
  'OLL 10': "R U R' U R' F R F' R U2 R'",
  'OLL 11': "r U R' U R' F R F' R U2 r'",
  'OLL 12': "F R U R' U' F' U F R U R' U' F'",
  'OLL 13': "F U R U' R2 F' R U R U' R'",
  'OLL 14': "R' F R U R' F' R F U' F'",
  'OLL 15': "r' U' r R' U' R U r' U r",
  'OLL 16': "r U r' R U R' U' r U' r'",
  'OLL 17': "R U R' U R' F R F' U2 R' F R F'",
  'OLL 18': "r U R' U R U2 r' r' U' R U' R' U2 r",
  'OLL 19': "M U R U R' U' M' R' F R F'",
  'OLL 20': "M U R U R' U' M2 U R U' r'",
  'OLL 21': "R U2 R' U' R U R' U' R U' R'",
  'OLL 22': "R U2 R2 U' R2 U' R2 U2 R",
  'OLL 23': "R2 D' R U2 R' D R U2 R",
  'OLL 24': "r U R' U' r' F R F'",
  'OLL 25': "F' r U R' U' r' F R",
  'OLL 26': "R U2 R' U' R U' R'",
  'OLL 27': "R U R' U R U2 R'",
  'OLL 28': "r U R' U' M U R U' R'",
  'OLL 29': "R U R' U' R U' R' F' U' F R U R'",
  'OLL 30': "F R' F R2 U' R' U' R U R' F2",
  'OLL 31': "R' U' F U R U' R' F' R",
  'OLL 32': "L U F' U' L' U L F L'",
  'OLL 33': "R U R' U' R' F R F'",
  'OLL 34': "R U R2 U' R' F R U R U' F'",
  'OLL 35': "R U2 R2 F R F' R U2 R'",
  'OLL 36': "L' U' L U' L' U L U L F' L' F",
  'OLL 37': "F R' F' R U R U' R'",
  'OLL 38': "R U R' U R U' R' U' R' F R F'",
  'OLL 39': "L F' L' U' L U F U' L'",
  'OLL 40': "R' F R U R' U' F' U R",
  'OLL 41': "R U R' U R U2 R' F R U R' U' F'",
  'OLL 42': "R' U' R U' R' U2 R F R U R' U' F'",
  'OLL 43': "R' U' F' U F R",
  'OLL 44': "f R U R' U' f'",
  'OLL 45': "F R U R' U' F'",
  'OLL 46': "R' U' R' F R F' U R",
  'OLL 47': "F' L' U' L U L' U' L U F",
  'OLL 48': "F R U R' U' R U R' U' F'",
  'OLL 49': "r U' r2 U r2 U r2 U' r",
  'OLL 50': "r' U r2 U' r2 U' r2 U r'",
  'OLL 51': "F U R U' R' U R U' R' F'",
  'OLL 52': "R' F' U' F U' R U R' U R",
  'OLL 53': "r' U' R U' R' U R U' R' U2 r",
  'OLL 54': "r U R' U R U' R' U R U2 r'",
  'OLL 55': "R U2 R2 U' R U' R' U2 F R F'",
  'OLL 56': "r U r' U R U' R' U R U' R' r U' r'",
  'OLL 57': "R U R' U' M' U R U' r'",
}

const PLL_ALGS: Record<string, string> = {
  Aa: "x R' U R' D2 R U' R' D2 R2 x'",
  Ab: "x R2 D2 R U R' D2 R U' R x'",
  E:  "x' R U' R' D R U R' D' R U R' D R U' R' D' x",
  F:  "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R",
  Ga: "R2 U R' U R' U' R U' R2 U' D R' U R D'",
  Gb: "R' U' R U D' R2 U R' U R U' R U' R2 D",
  Gc: "R2 U' R U' R U R' U R2 U D' R U' R' D",
  Gd: "R U R' U' D R2 U' R U' R' U R' U R2 D'",
  H:  'M2 U M2 U2 M2 U M2',
  Ja: "x R2 F R F' R U2 r' U r U2 x'",
  Jb: "R U R' F' R U R' U' R' F R2 U' R'",
  Na: "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'",
  Nb: "R' U R U' R' F' U' F R U R' F R' F' R U' R",
  Ra: "R U' R' U' R U R D R' U' R D' R' U2 R'",
  Rb: "R2 F R U R U' R' F' R U2 R' U2 R",
  T:  "R U R' U' R' F R2 U' R' U' R U R' F'",
  Ua: "M2 U M U2 M' U M2",
  Ub: "M2 U' M U2 M' U' M2",
  V:  "R' U R' U' y R' F' R2 U' R' U R' F R F",
  Y:  "F R U' R' U' R U R' F' R U R' U' R' F R F'",
  Z:  "M' U M2 U M2 U M' U2 M2",
}

let OLL_EXPANDED: [string, string[]][] | null = null
let PLL_EXPANDED: [string, string[]][] | null = null
const expanded = () => {
  OLL_EXPANDED ??= Object.entries(OLL_ALGS).map(([n, a]) => [n, expandAlg(a)])
  PLL_EXPANDED ??= Object.entries(PLL_ALGS).map(([n, a]) => [n, expandAlg(a)])
  return [OLL_EXPANDED, PLL_EXPANDED] as const
}

export interface LLStep { case: string; moves: string[] }

/** (pre-AUF + OLL alg) orienting the last layer; 'skip' when already
 *  oriented. Assumes F2L is solved. */
export function solveOll(state: FullState): LLStep | null {
  if (llOriented(state)) return { case: 'skip', moves: [] }
  let best: LLStep | null = null
  for (const auf of AUFS) {
    const pre = auf ? [auf] : []
    const s0 = pre.length ? applyFull(state, pre) : state
    for (const [name, alg] of expanded()[0]) {
      if (llOriented(applyFull(s0, alg))) {
        const moves = [...pre, ...alg]
        if (!best || moves.length < best.moves.length) best = { case: name, moves }
      }
    }
  }
  return best
}

/** (pre-AUF + PLL alg + final AUF) solving an oriented last layer. */
export function solvePll(state: FullState): LLStep | null {
  const auf0 = solvedUpToAuf(state)
  if (auf0 !== null) return { case: 'skip', moves: auf0 ? [auf0] : [] }
  let best: LLStep | null = null
  for (const auf of AUFS) {
    const pre = auf ? [auf] : []
    const s0 = pre.length ? applyFull(state, pre) : state
    for (const [name, alg] of expanded()[1]) {
      const fin = solvedUpToAuf(applyFull(s0, alg))
      if (fin !== null) {
        const moves = [...pre, ...alg, ...(fin ? [fin] : [])]
        if (!best || moves.length < best.moves.length) best = { case: name, moves }
      }
    }
  }
  return best
}
