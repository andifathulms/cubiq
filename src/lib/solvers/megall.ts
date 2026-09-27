// Megaminx last layer: discovered-macro solver (port of cubiq-ml megall.py).
//
// Macros are commutators [a,b], conjugated commutators c [a,b] c' and
// [a, c b c'] over the U face and its 5 neighbours, kept iff they leave
// every non-LL piece untouched. Their net effects on the 5 LL edges / 5 LL
// corners are small maps, so the LL is solved by two staged BFS passes:
//   1. edges: all LL-preserving macros (plus bare U turns), 960 states
//   2. corners: only macros whose edge effect is identity, 4,860 states
// Both spaces are fully enumerable and BFS gives macro-count-minimal paths.

import { CORNER_CLASSES, CTRANS, EDGE_CLASSES, ETRANS, U_ADJ, applyMega, type MegaState } from './megaengine'

const LL_EDGE_SLOTS = EDGE_CLASSES.ll
const LL_CORNER_SLOTS = CORNER_CLASSES.ll
const LL_E_INDEX = new Map(LL_EDGE_SLOTS.map((s, i) => [s, i]))
const LL_C_INDEX = new Map(LL_CORNER_SLOTS.map((s, i) => [s, i]))

const AMOUNTS = ['', '2', "'", "2'"]
const ALPHABET = ['U', ...[...U_ADJ].sort()].flatMap(f => AMOUNTS.map(a => f + a))   // 24
const U_MOVES = AMOUNTS.map(a => 'U' + a)

const baseOf = (m: string) => m.replace(/['2]+$/, '')

function invMove(m: string): string {
  const base = baseOf(m)
  const suf = m.slice(base.length)
  return base + ({ '': "'", '2': "2'", "'": '', "2'": '2' } as Record<string, string>)[suf]
}

type Eff = [number, number][]   // for each LL home slot: [dest slot idx, ori delta]
interface Macro { seq: string[]; edges: Eff; corners: Eff }

function seqMaps(seq: readonly string[]): [Int32Array, Int32Array] {
  let e = Int32Array.from({ length: 60 }, (_, i) => i)
  let c = Int32Array.from({ length: 60 }, (_, i) => i)
  for (const m of seq) {
    const et = ETRANS[m], ct = CTRANS[m]
    e = e.map(x => et[x])
    c = c.map(x => ct[x])
  }
  return [e, c]
}

function preservesNonLL(e: Int32Array, c: Int32Array): boolean {
  for (let s = 0; s < 30; s++) if (!LL_E_INDEX.has(s) && e[s * 2] !== s * 2) return false
  for (let s = 0; s < 20; s++) if (!LL_C_INDEX.has(s) && c[s * 3] !== s * 3) return false
  return true
}

function llEffect(e: Int32Array, c: Int32Array): [Eff, Eff] {
  return [
    LL_EDGE_SLOTS.map(s => [LL_E_INDEX.get(Math.floor(e[s * 2] / 2))!, e[s * 2] % 2]),
    LL_CORNER_SLOTS.map(s => [LL_C_INDEX.get(Math.floor(c[s * 3] / 3))!, c[s * 3] % 3]),
  ]
}

const isIdentity = (eff: Eff) => eff.every(([d, o], i) => d === i && o === 0)

let MACROS: Macro[] | null = null

export function discoverLLMacros(): Macro[] {
  if (MACROS) return MACROS
  const candidates: string[][] = U_MOVES.map(m => [m])
  const comms: string[][] = []
  for (const a of ALPHABET) {
    for (const b of ALPHABET) {
      if (baseOf(a) === baseOf(b)) continue
      comms.push([a, b, invMove(a), invMove(b)])
    }
  }
  candidates.push(...comms)
  for (const c of ALPHABET) for (const comm of comms) candidates.push([c, ...comm, invMove(c)])
  // [a, c b c'] — the classic piece-isolating shape (pure corner cycles/twists)
  for (const a of ALPHABET) {
    for (const c of ALPHABET) {
      if (baseOf(a) === baseOf(c)) continue
      for (const b of ALPHABET) {
        if (baseOf(b) === baseOf(c)) continue
        candidates.push([a, c, b, invMove(c), invMove(a), c, invMove(b), invMove(c)])
      }
    }
  }

  const seen = new Set<string>()
  const macros: Macro[] = []
  const consider = (seq: string[]) => {
    const [e, c] = seqMaps(seq)
    if (!preservesNonLL(e, c)) return
    const [ee, cc] = llEffect(e, c)
    const key = JSON.stringify([ee, cc])
    if (seen.has(key)) return
    if (isIdentity(ee) && isIdentity(cc)) return
    seen.add(key)
    macros.push({ seq, edges: ee, corners: cc })
  }
  for (const seq of candidates) consider(seq)
  // inverse-closure: path reconstruction toward solved needs every inverse
  for (const m of [...macros]) consider([...m.seq].reverse().map(invMove))

  macros.sort((a, b) => a.seq.length - b.seq.length)
  MACROS = macros
  return macros
}

// ── LL state encoding: (piece_at_slot x5, ori_at_slot x5) ────────────────────

type LL = number[]
const SOLVED_LL: LL = [0, 1, 2, 3, 4, 0, 0, 0, 0, 0]
const llKey = (s: LL) => s.join(',')

function edgeState(state: MegaState): LL {
  const p = [0, 0, 0, 0, 0], o = [0, 0, 0, 0, 0]
  LL_EDGE_SLOTS.forEach((pieceSlot, j) => {
    const sub = state.edges[pieceSlot]
    const i = LL_E_INDEX.get(Math.floor(sub / 2))!
    p[i] = j
    o[i] = sub % 2
  })
  return [...p, ...o]
}

function cornerState(state: MegaState): LL {
  const p = [0, 0, 0, 0, 0], o = [0, 0, 0, 0, 0]
  LL_CORNER_SLOTS.forEach((pieceSlot, j) => {
    const sub = state.corners[pieceSlot]
    const i = LL_C_INDEX.get(Math.floor(sub / 3))!
    p[i] = j
    o[i] = sub % 3
  })
  return [...p, ...o]
}

/** eff[src] = [dest, oriDelta] moves the piece starting at slot src. */
function applyEff(st: LL, eff: Eff, nOri: number): LL {
  const out = new Array<number>(10)
  eff.forEach(([dest, dori], src) => {
    out[dest] = st[src]
    out[5 + dest] = (st[5 + src] + dori) % nOri
  })
  return out
}

function bfsStage(macros: Macro[], key: 'edges' | 'corners', nOri: number): Map<string, number> {
  const dist = new Map<string, number>([[llKey(SOLVED_LL), 0]])
  let frontier = [SOLVED_LL]
  while (frontier.length) {
    const nxt: LL[] = []
    for (const st of frontier) {
      const d = dist.get(llKey(st))!
      for (const m of macros) {
        const ns = applyEff(st, m[key], nOri)
        const k = llKey(ns)
        if (!dist.has(k)) {
          dist.set(k, d + 1)
          nxt.push(ns)
        }
      }
    }
    frontier = nxt
  }
  return dist
}

export class LLSolver {
  private edgeMacros: Macro[]
  private cornerMacros: Macro[]
  private edgeDist: Map<string, number>
  private cornerDist: Map<string, number>

  constructor() {
    const macros = discoverLLMacros()
    this.edgeMacros = macros                  // all (U turns move edges too)
    this.cornerMacros = macros.filter(m => isIdentity(m.edges))
    this.edgeDist = bfsStage(this.edgeMacros, 'edges', 2)
    this.cornerDist = bfsStage(this.cornerMacros, 'corners', 3)
  }

  private solveStage(st: LL, macros: Macro[], key: 'edges' | 'corners', nOri: number, dist: Map<string, number>): string[][] | null {
    if (!dist.has(llKey(st))) return null
    const seqs: string[][] = []
    while (llKey(st) !== llKey(SOLVED_LL)) {
      const d = dist.get(llKey(st))!
      let moved = false
      for (const m of macros) {
        const ns = applyEff(st, m[key], nOri)
        if (dist.get(llKey(ns)) === d - 1) {
          seqs.push(m.seq)
          st = ns
          moved = true
          break
        }
      }
      if (!moved) return null
    }
    return seqs
  }

  /** LL stages, or null if uncovered (shouldn't happen). */
  solve(state: MegaState): { name: string; kind: string; moves: string[] }[] | null {
    const eseqs = this.solveStage(edgeState(state), this.edgeMacros, 'edges', 2, this.edgeDist)
    if (!eseqs) return null
    const cur = applyMega(state, eseqs.flat())
    const cseqs = this.solveStage(cornerState(cur), this.cornerMacros, 'corners', 3, this.cornerDist)
    if (!cseqs) return null
    return [
      { name: 'LL edges', kind: 'll', moves: eseqs.flat() },
      { name: 'LL corners', kind: 'll', moves: cseqs.flat() },
    ]
  }
}
