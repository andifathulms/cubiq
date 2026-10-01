// 6x6 reduction: centres -> edge pairing -> parity -> 3x3 CFOP.
//
// Centres, face by face (U, D, L, F, R; B follows): greedy macro search.
// Outer turns never break a solved centre (they only spin a face's own
// block), so they are free setups. Each step tries (setup + macro) and
// keeps the one that puts the most target-colour stickers on the face
// while every finished face stays finished. Macros are slice sandwiches
// (slice, outer body, slice back) for bulk moves, and pure 3-cycle
// commutators (a b c b' a' b c' b') that can always place one more
// sticker. Zero-gain reshapes with a one-step lookahead get past local
// optima.
//
// Edge pairing: with centres solved, outer turns preserve centres and
// pairing. Centre-safe slice sandwiches (checked on the solved cube) and
// pure wing 3-cycles move wings between edge positions; each step keeps the
// candidate that most increases how many wings agree with their edge's
// majority colour pair.
//
// Parity and 3x3: the reduced cube reads off as a 3x3. Edge flip (OLL) and
// swap (PLL) parity are probed with 6x6 versions of the 4x4 algorithms,
// then the two-phase solution is staged into CFOP like the 4x4.

import { FACES, applyPerm, compose, fromScramble, invertMoves, isSolved } from './cubeN'
import {
  ALL_CENTER_IDS, CENTER_IDX, CUBE6, EDGE_POS, SOLVED6, WING_SLOTS,
  allPaired, apply6, centersSolved, edgePaired as edgePairedAt, isOuterWing as isOuter, pairedCount, toFacelet3,
} from './cube666'
import { solveCfop, type CfopFace } from './cfop'
import { solve3x3Facelet } from './twophase'
import { reportProgress } from './progress'

export interface Stage { name: string; kind: string; moves: string[]; move_count?: number }

const SUF = ['', "'", '2']
const OUTER = FACES.flatMap(f => SUF.map(s => f + s))                                    // 18
const SLICES = FACES.flatMap(f => ['2', '3'].flatMap(d => SUF.map(s => d + f + s)))      // 36
const SLICE_QUARTERS = SLICES.filter(m => !m.endsWith('2'))                              // 24
const AXIS: Record<string, number> = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 }
const faceOf = (m: string) => m.replace(/^\d/, '')[0]
const layerOf = (m: string) => m.replace(/('|2)$/, '')
/** "2R" -> "2R'", "2R2" stays, "3Uw'" -> "3Uw" (a leading digit is a layer, not a half turn) */
const inv = (m: string) => (m.endsWith("'") ? m.slice(0, -1) : /^\d?[UDFBRL]w?2$/.test(m) ? m : m + "'")
const invSeq = (seq: readonly string[]) => [...seq].reverse().map(inv)

const N_ST = CUBE6.nStickers
const IDENT = Int32Array.from({ length: N_ST }, (_, i) => i)
function permOf(seq: readonly string[]): Int32Array {
  let p: Int32Array = IDENT
  for (const m of seq) {
    const mp = CUBE6.moves.get(m)
    if (!mp) throw new Error(`unknown 6x6 move ${m}`)
    p = compose(p, mp)
  }
  return p
}

interface PM { seq: string[]; perm: Int32Array }

/** Outer-move bodies: single turns and two-turn pairs on different layers. */
function outerBodies(maxLen: 1 | 2): string[][] {
  const out: string[][] = OUTER.map(m => [m])
  if (maxLen === 2) for (const a of OUTER) for (const b of OUTER) if (layerOf(a) !== layerOf(b)) out.push([a, b])
  return out
}

const SETUPS: PM[] = [{ seq: [], perm: IDENT }, ...OUTER.map(m => ({ seq: [m], perm: CUBE6.moves.get(m)! }))]
let SETUPS2: PM[] | null = null
/** Outer setups up to two turns (for the endgame, where pieces must line
 *  up exactly with a macro's slots). */
function setups2(): PM[] {
  if (SETUPS2) return SETUPS2
  SETUPS2 = [...SETUPS]
  for (const a of OUTER) for (const b of OUTER) {
    if (layerOf(a) !== layerOf(b)) SETUPS2.push({ seq: [a, b], perm: compose(CUBE6.moves.get(a)!, CUBE6.moves.get(b)!) })
  }
  return SETUPS2
}

// ── Centres ───────────────────────────────────────────────────────────────────

let CENTRE_MAIN: PM[] | null = null
let CENTRE_COMM: PM[] | null = null

function centreLibs(): [PM[], PM[]] {
  if (CENTRE_MAIN && CENTRE_COMM) return [CENTRE_MAIN, CENTRE_COMM]
  const seen = new Set<string>()
  const keyOf = (p: Int32Array) => ALL_CENTER_IDS.map(i => p[i]).join(',')
  const main: PM[] = []
  const add = (lib: PM[], seq: string[]) => {
    const perm = permOf(seq)
    const k = keyOf(perm)
    if (seen.has(k)) return
    seen.add(k)
    lib.push({ seq, perm })
  }
  // single slices and two-slice blocks (2R 3R together), sandwiching a body
  const openers: string[][] = [
    ...SLICES.map(s => [s]),
    ...FACES.flatMap(f => SUF.map(s => [`2${f}${s}`, `3${f}${s}`])),
  ]
  for (const op of openers) for (const body of outerBodies(2)) add(main, [...op, ...body, ...invSeq(op)])

  // pure 3-cycles: a b c b' a' b c' b' (a, c slices on one axis)
  const comm: PM[] = []
  for (const a of SLICE_QUARTERS) {
    for (const c of SLICE_QUARTERS) {
      if (c === a || AXIS[faceOf(c)] !== AXIS[faceOf(a)]) continue
      for (const b of OUTER) {
        if (AXIS[faceOf(b)] === AXIS[faceOf(a)]) continue
        const seq = [a, b, c, inv(b), inv(a), b, inv(c), inv(b)]
        const perm = permOf(seq)
        let moved = 0
        for (const i of ALL_CENTER_IDS) if (perm[i] !== i) moved++
        if (moved !== 3) continue
        const k = keyOf(perm)
        if (seen.has(k)) continue
        seen.add(k)
        comm.push({ seq, perm })
      }
    }
  }
  main.sort((x, y) => x.seq.length - y.seq.length)
  CENTRE_MAIN = main
  CENTRE_COMM = comm
  return [main, comm]
}

const stateKey = (s: Int8Array) => s.join('')

/** Greedy: put colour `target` on all 16 centre slots of face `target`,
 *  keeping every face in `keep` solved. */
function solveCentreFace(state: Int8Array, target: number, keep: number[], maxSteps = 60): string[] | null {
  const [main, comm] = centreLibs()
  const tSlots = CENTER_IDX[FACES[target]]
  const kSlots = keep.flatMap(f => CENTER_IDX[FACES[f]])
  const kColor = Int8Array.from(keep.flatMap(f => CENTER_IDX[FACES[f]].map(() => f)))
  const nT = tSlots.length, nK = kSlots.length
  const srcOf = (lib: PM[]) => {
    const t = new Int16Array(lib.length * nT), k = new Int16Array(lib.length * nK)
    lib.forEach(({ perm }, mi) => {
      for (let j = 0; j < nT; j++) t[mi * nT + j] = perm[tSlots[j]]
      for (let j = 0; j < nK; j++) k[mi * nK + j] = perm[kSlots[j]]
    })
    return { t, k }
  }
  const mainSrc = srcOf(main)
  let commSrc: ReturnType<typeof srcOf> | null = null
  const placed = (st: Int8Array) => { let n = 0; for (const i of tSlots) if (st[i] === target) n++; return n }

  type Cand = { gain: number; cost: number; s: PM; m: PM }
  const A = new Int8Array(N_ST)
  const search = (cur: Int8Array, base: number, lib: PM[], src: { t: Int16Array; k: Int16Array }, minGain: number, zeros?: Cand[]): Cand | null => {
    let best: Cand | null = null
    const maxMiss = nT - base - minGain
    for (const s of SETUPS) {
      for (let i = 0; i < N_ST; i++) A[i] = cur[s.perm[i]]
      for (let mi = 0, to = 0, ko = 0; mi < lib.length; mi++, to += nT, ko += nK) {
        let miss = 0
        for (let j = 0; j < nT && miss <= maxMiss; j++) if (A[src.t[to + j]] !== target) miss++
        if (miss > maxMiss) continue
        let ok = true
        for (let j = 0; j < nK; j++) if (A[src.k[ko + j]] !== kColor[j]) { ok = false; break }
        if (!ok) continue
        const gain = nT - miss - base
        const cost = s.seq.length + lib[mi].seq.length
        if (gain > 0) {
          if (!best || gain * 12 - cost > best.gain * 12 - best.cost) best = { gain, cost, s, m: lib[mi] }
        } else if (zeros && zeros.length < 300) zeros.push({ gain, cost, s, m: lib[mi] })
      }
    }
    return best
  }
  const applyCand = (cur: Int8Array, c: Cand) => applyPerm(applyPerm(cur, c.s.perm), c.m.perm)

  let cur = state
  const moves: string[] = []
  const visited = new Set([stateKey(cur)])
  let reshapes = 0
  for (let step = 0; step < maxSteps; step++) {
    const base = placed(cur)
    if (base === nT) return moves
    const zeros: Cand[] = []
    let best = search(cur, base, main, mainSrc, 1, zeros)
    if (!best) best = search(cur, base, comm, (commSrc ??= srcOf(comm)), 1)
    if (!best) {
      // zero-gain reshape that leads to a gain (one-step lookahead)
      if (reshapes++ >= 10) return null
      zeros.sort((a, b) => a.cost - b.cost)
      let chosen: Cand | null = null
      for (const z of zeros.slice(0, 60)) {
        const st2 = applyCand(cur, z)
        if (visited.has(stateKey(st2))) continue
        if (search(st2, placed(st2), main, mainSrc, 1) || search(st2, placed(st2), comm, commSrc!, 1)) { chosen = z; break }
      }
      if (!chosen) return null
      best = chosen
    }
    moves.push(...best.s.seq, ...best.m.seq)
    cur = applyCand(cur, best)
    visited.add(stateKey(cur))
  }
  return null
}

export function solveCenters(state: Int8Array): Stage[] | null {
  let cur = state
  const stages: Stage[] = []
  const keep: number[] = []
  // opposite pair first, then around the sides: the last two faces (R and
  // B) are then adjacent, so a slice can trade pieces between just them
  // (with R and L last, every slice through both crosses a finished face)
  for (const f of ['U', 'D', 'L', 'F', 'R'] as const) {
    const fi = FACES.indexOf(f)
    reportProgress(`Solving the ${f} centre`)
    const mv = solveCentreFace(cur, fi, keep)
    if (!mv) return null
    cur = apply6(cur, mv)
    keep.push(fi)
    stages.push({ name: `${f} centre`, kind: 'centers', moves: mv })
  }
  return centersSolved(cur) ? stages : null
}

// ── Edge pairing ──────────────────────────────────────────────────────────────

let PAIR_MAIN: PM[] | null = null
let PAIR_COMM: PM[] | null = null

const WING_A = WING_SLOTS.map(([a]) => a)
const WING_B = WING_SLOTS.map(([, b]) => b)

function wingKey(p: Int32Array): string {
  let s = ''
  for (let w = 0; w < 48; w++) s += p[WING_A[w]] + ',' + p[WING_B[w]] + ';'
  return s
}

function centreSafe(perm: Int32Array): boolean {
  for (const i of ALL_CENTER_IDS) if (SOLVED6[perm[i]] !== SOLVED6[i]) return false
  return true
}

function pairLibs(): [PM[], PM[]] {
  if (PAIR_MAIN && PAIR_COMM) return [PAIR_MAIN, PAIR_COMM]
  const seen = new Set<string>([wingKey(IDENT)])
  const main: PM[] = []
  const add = (lib: PM[], seq: string[]) => {
    const perm = permOf(seq)
    if (!centreSafe(perm)) return
    const k = wingKey(perm)
    if (seen.has(k)) return
    seen.add(k)
    lib.push({ seq, perm })
  }
  const bodies: string[][] = [
    ...outerBodies(2),
    ...OUTER.flatMap(x => OUTER.filter(y => layerOf(y) !== layerOf(x)).map(y => [x, y, inv(x)])),
    ['R', 'U', "R'", 'F', "R'", "F'", 'R'], ["L'", "U'", 'L', "F'", 'L', 'F', "L'"],
  ]
  const openers: string[][] = [
    ...SLICES.map(s => [s]),
    ...FACES.flatMap(f => SUF.map(s => [`2${f}${s}`, `3${f}${s}`])),
  ]
  for (const op of openers) for (const body of bodies) add(main, [...op, ...body, ...invSeq(op)])

  // pure wing 3-cycles: [slice, outer conjugate] = a (x y x') a' (x y' x'),
  // plus single-orbit parity swaps: the 4x4 OLL parity with one slice depth
  // swaps two wings of that orbit only and keeps the centres (checked), which
  // 3-cycles can never do
  const comm: PM[] = []
  for (const d of ['2', '3']) add(comm, "2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2".split(' ').map(m => m.replace(/^2/, d)))
  for (const a of SLICE_QUARTERS) {
    for (const x of OUTER) {
      for (const y of OUTER) {
        if (layerOf(x) === layerOf(y) || y.endsWith('2')) continue
        const B = [x, y, inv(x)]
        add(comm, [a, ...B, inv(a), ...invSeq(B)])
      }
    }
  }
  main.sort((x, y) => x.seq.length - y.seq.length)
  PAIR_MAIN = main
  PAIR_COMM = comm
  return [main, comm]
}

// ── Single-orbit wing swaps, placed exactly ────────────────────────────────
// A pairing can end needing ONE wing swap inside an orbit (an odd
// permutation), which no 3-cycle gives. The single-slice OLL parity swaps
// two fixed slots; outer setups carry any two wings of that orbit onto
// them, and undoing the setup leaves a pure swap of exactly those wings.

const WING_OF_STICKER = new Map<number, number>()
WING_SLOTS.forEach(([a], w) => WING_OF_STICKER.set(a, w))
// Setup turns for the swap: outer turns only. The swap keeps the centres
// only up to colour (it trades same-colour centre pieces), so a slice setup
// would carry different colours into those spots.
const CARRY_MOVES = OUTER
/** where the wing in slot w goes under move m */
const WGO: Map<string, Int16Array> = new Map(CARRY_MOVES.map(m => {
  const p = CUBE6.moves.get(m)!
  const go = new Int16Array(48)
  for (let d = 0; d < N_ST; d++) {
    const w = WING_OF_STICKER.get(p[d])
    if (w !== undefined && WING_OF_STICKER.has(d)) go[w] = WING_OF_STICKER.get(d)!
  }
  return [m, go]
}))

interface Swap { seq: string[]; slots: [number, number] }
let SWAPS: Swap[] | null = null
function wingSwaps(): Swap[] {
  if (SWAPS) return SWAPS
  SWAPS = ['2', '3'].map(d => {
    const seq = "2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2".split(' ').map(m => m.replace(/^2/, d))
    const after = apply6(SOLVED6, seq)
    const moved = WING_SLOTS.map(([a, b], w) => (after[a] !== SOLVED6[a] || after[b] !== SOLVED6[b] ? w : -1)).filter(w => w >= 0)
    if (moved.length !== 2) throw new Error('6x6 wing swap: expected exactly two wings')
    return { seq, slots: [moved[0], moved[1]] as [number, number] }
  })
  return SWAPS
}

/** Turns taking the wings in slots (x, y) onto (s1, s2) in either order. */
function carryPair(x: number, y: number, s1: number, s2: number): string[] | null {
  const start = x * 48 + y
  const prev = new Int32Array(2304).fill(-1), via = new Int16Array(2304)
  prev[start] = start
  const q = [start]
  for (let h = 0; h < q.length; h++) {
    const k = q[h], a = Math.floor(k / 48), b = k % 48
    if ((a === s1 && b === s2) || (a === s2 && b === s1)) {
      const path: string[] = []
      for (let c = k; c !== start; c = prev[c]) path.push(CARRY_MOVES[via[c]])
      return path.reverse()
    }
    CARRY_MOVES.forEach((m, mi) => {
      const go = WGO.get(m)!
      const nk = go[a] * 48 + go[b]
      if (prev[nk] === -1) { prev[nk] = k; via[nk] = mi; q.push(nk) }
    })
  }
  return null
}

/** An odd wing permutation (one wing must trade with one other) is out of
 *  reach of 3-cycles. Swap the two same-orbit wings of one unpaired edge —
 *  outer setups always reach that — and the rest is even again, which the
 *  3-cycles finish. Picks the swap whose result scores best. */
function bestSwap(cur: Int8Array, avoid: Set<string>): { moves: string[]; state: Int8Array } | null {
  let best: { score: number; moves: string[]; state: Int8Array } | null = null
  for (const sw of wingSwaps()) {
    const outer = isOuter(sw.slots[0])
    EDGE_POS.forEach((ws, p) => {
      if (edgePairedAt(cur, p)) return
      const [x, y] = ws.filter(w => isOuter(w) === outer)
      const setup = carryPair(x, y, sw.slots[0], sw.slots[1])
      if (!setup) return
      const moves = [...setup, ...sw.seq, ...invSeq(setup)]
      const state = apply6(cur, moves)
      if (!centersSolved(state) || avoid.has(stateKey(state))) return
      const score = pairScore(k => state[k])
      if (!best || score > best.score || (score === best.score && moves.length < best.moves.length)) best = { score, moves, state }
    })
  }
  return best
}

// ── Last two edges, exactly ────────────────────────────────────────────────
// With two edges left, search exactly over the wing slots in play. The
// 3-cycles each touch three different edges, so the search may borrow one
// already-paired edge and must hand it back paired. Generators: every
// 3-cycle conjugated by an outer setup (setup, cycle, setup undone) and
// every in-edge swap, kept when they touch no wing outside the chosen
// edges. A BFS over those stickers' colours finds the shortest finish.

const WING_STICKERS = WING_SLOTS.flat()

function finishEdges(cur: Int8Array, edges: number[], maxDepth: number, maxNodes: number): string[] | null {
  const [, comm] = pairLibs()
  const slots = edges.flatMap(p => EDGE_POS[p])
  const stk = slots.flatMap(w => WING_SLOTS[w])
  const n = stk.length
  const at = new Map(stk.map((x, k) => [x, k]))
  const others = WING_STICKERS.filter(x => !at.has(x))
  const gens: { moves: string[]; map: Int8Array }[] = []
  const seen = new Set<string>()
  const consider = (moves: string[], perm: (i: number) => number) => {
    for (const x of others) if (perm(x) !== x) return
    const map = new Int8Array(n)
    for (let k = 0; k < n; k++) {
      const src = at.get(perm(stk[k]))
      if (src === undefined) return
      map[k] = src
    }
    const key = map.join(',')
    if (seen.has(key) || map.every((v, k) => v === k)) return
    seen.add(key)
    gens.push({ moves, map })
  }
  for (const su of setups2()) {
    const inv = invSeq(su.seq)
    const sInv = permOf(inv)
    for (const c of comm) consider([...su.seq, ...c.seq, ...inv], i => su.perm[c.perm[sInv[i]]])
  }
  for (const sw of wingSwaps()) {
    for (const p of edges) {
      const [x, y] = EDGE_POS[p].filter(w => isOuter(w) === isOuter(sw.slots[0]))
      const setup = carryPair(x, y, sw.slots[0], sw.slots[1])
      if (!setup) continue
      const moves = [...setup, ...sw.seq, ...invSeq(setup)]
      const perm = permOf(moves)
      if (!centersSolved(applyPerm(cur, perm))) continue
      consider(moves, i => perm[i])
    }
  }
  const start = Int8Array.from(stk, x => cur[x])
  const done = (c: Int8Array) => {
    for (let o = 0; o < n; o += 8) {
      for (let w = 1; w < 4; w++) if (c[o + 2 * w] !== c[o] || c[o + 2 * w + 1] !== c[o + 1]) return false
    }
    return true
  }
  const key = (c: Int8Array) => c.join(',')
  const prev = new Map<string, [string, number] | null>([[key(start), null]])
  let frontier: Int8Array[] = [start]
  for (let depth = 0; depth <= maxDepth && frontier.length; depth++) {
    const next: Int8Array[] = []
    for (const c of frontier) {
      if (done(c)) {
        const path: string[][] = []
        for (let k = key(c), e = prev.get(k); e; k = e[0], e = prev.get(k)) path.push(gens[e[1]].moves)
        return path.reverse().flat()
      }
      if (depth === maxDepth) continue
      for (let g = 0; g < gens.length; g++) {
        const m = gens[g].map
        const nx = new Int8Array(n)
        for (let k = 0; k < n; k++) nx[k] = c[m[k]]
        const nk = key(nx)
        if (prev.has(nk)) continue
        prev.set(nk, [key(c), g])
        next.push(nx)
        if (prev.size > maxNodes) return null
      }
    }
    frontier = next
  }
  return null
}

export function finishTwoEdges(cur: Int8Array, P: number, Q: number): string[] | null {
  const direct = finishEdges(cur, [P, Q], 6, 200000)
  if (direct) return direct
  // borrow a paired edge as the third leg of the 3-cycles
  for (let R = 0; R < 12; R++) {
    if (R === P || R === Q) continue
    const fin = finishEdges(cur, [P, Q, R], 5, 400000)
    if (fin) return fin
  }
  return null
}

/** Sum over edge positions of how many of its wings agree with its most
 *  common colour pair (48 = every edge paired). */
function pairScore(get: (i: number) => number): number {
  let total = 0
  for (const ws of EDGE_POS) {
    let best = 1
    for (let i = 0; i < 4; i++) {
      const a = get(WING_A[ws[i]]), b = get(WING_B[ws[i]])
      let n = 1
      for (let j = i + 1; j < 4; j++) if (get(WING_A[ws[j]]) === a && get(WING_B[ws[j]]) === b) n++
      if (n > best) best = n
    }
    total += best
  }
  return total
}

function solvePairingOnce(state: Int8Array, maxSteps: number, rng: () => number): Stage[] | null {
  const [main, comm] = pairLibs()
  const stages: Stage[] = []
  let cur = state
  const visited = new Set([stateKey(cur)])
  let reshapes = 0
  let swaps = 0
  const A = new Int8Array(N_ST)
  type Cand = { gain: number; cost: number; s: PM; m: PM }
  const search = (st: Int8Array, base: number, lib: PM[], zeros?: Cand[], setups: PM[] = SETUPS): Cand | null => {
    let best: Cand | null = null
    for (const s of setups) {
      for (let i = 0; i < N_ST; i++) A[i] = st[s.perm[i]]
      for (const m of lib) {
        const p = m.perm
        const score = pairScore(i => A[p[i]])
        const gain = score - base
        const cost = s.seq.length + m.seq.length
        if (gain > 0) {
          // tiny random tie-break so restarts explore different paths
          const val = gain * 10 - cost + rng() * 0.5
          if (!best || val > best.gain * 10 - best.cost) best = { gain, cost, s, m }
        } else if (gain === 0 && zeros && zeros.length < 400) zeros.push({ gain, cost, s, m })
      }
    }
    return best
  }
  const applyCand = (st: Int8Array, c: Cand) => applyPerm(applyPerm(st, c.s.perm), c.m.perm)
  for (let step = 0; step < maxSteps; step++) {
    const before = pairedCount(cur)
    if (before === 12) return stages
    const base = pairScore(i => cur[i])
    const zeros: Cand[] = []
    let best = search(cur, base, main, zeros)
    if (!best) best = search(cur, base, comm)
    if (!best) best = search(cur, base, comm, undefined, setups2())
    if (!best && before === 10) {
      const left = EDGE_POS.map((_, p) => p).filter(p => !edgePairedAt(cur, p))
      const fin = finishTwoEdges(cur, left[0], left[1])
      if (fin) {
        cur = apply6(cur, fin)
        stages.push({ name: `pair edges (10 → ${pairedCount(cur)})`, kind: 'pairing', moves: fin })
        continue
      }
    }
    if (!best) {
      // one wing has to trade places with one other: an odd swap
      const sw = swaps++ < 4 ? bestSwap(cur, visited) : null
      if (sw) {
        cur = sw.state
        visited.add(stateKey(cur))
        const after = pairedCount(cur)
        stages.push({ name: after > before ? `pair edges (${before} → ${after})` : 'reshape edges', kind: 'pairing', moves: sw.moves })
        continue
      }
    }
    if (!best) {
      if (reshapes++ >= 12) return null
      zeros.sort((a, b) => a.cost - b.cost + (rng() - 0.5))
      let chosen: Cand | null = null
      for (const z of zeros.slice(0, 40)) {
        const st2 = applyCand(cur, z)
        if (visited.has(stateKey(st2))) continue
        const b2 = pairScore(i => st2[i])
        if (search(st2, b2, main) || search(st2, b2, comm)) { chosen = z; break }
      }
      if (!chosen) return null
      best = chosen
    }
    cur = applyCand(cur, best)
    visited.add(stateKey(cur))
    const after = pairedCount(cur)
    stages.push({
      name: after > before ? `pair edges (${before} → ${after})` : 'reshape edges',
      kind: 'pairing', moves: [...best.s.seq, ...best.m.seq],
    })
  }
  return null
}

export function solvePairing(state: Int8Array): Stage[] | null {
  // a few restarts with different tie-breaks if the greedy gets stuck
  for (let r = 0; r < 4; r++) {
    let seed = 12345 + r * 7919
    const rng = r === 0 ? () => 0 : () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    const out = solvePairingOnce(state, 120, rng)
    if (out) return mergePairingStages(out)
  }
  return null
}

/** One stage per newly paired edge group, so the list stays readable. */
function mergePairingStages(stages: Stage[]): Stage[] {
  const out: Stage[] = []
  let pending: string[] = []
  for (const st of stages) {
    pending.push(...st.moves)
    if (st.name !== 'reshape edges') {
      out.push({ name: st.name, kind: 'pairing', moves: pending })
      pending = []
    }
  }
  if (pending.length) out.push({ name: 'reshape edges', kind: 'pairing', moves: pending })
  return out
}

// ── Parity and the 3x3 stage ──────────────────────────────────────────────────

// 4x4 parity algorithms with the inner slice widened to both inner slices
// (2R 3R) and Uw to 3Uw, so a whole 6x6 edge moves like a 4x4 dedge.
const both = (s: string) => {
  const m = s.match(/^2([UDFBRL])(.*)$/)
  return m ? [`2${m[1]}${m[2]}`, `3${m[1]}${m[2]}`] : [s.replace(/^Uw/, '3Uw')]
}
export const OLL_PARITY_6 = "2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2".split(' ').flatMap(both)
export const PLL_PARITY_6 = '2R2 U2 2R2 Uw2 2R2 Uw2'.split(' ').flatMap(both)

const PARITY_COMBOS: [string, string[]][][] = [
  [],
  [['OLL parity', OLL_PARITY_6]],
  [['PLL parity', PLL_PARITY_6]],
  [['OLL parity', OLL_PARITY_6], ['PLL parity', PLL_PARITY_6]],
]

export function solve666(scramble: string, cfopFace: CfopFace | 'best' = 'D', beamWidth = 4) {
  const t0 = performance.now()
  let state = fromScramble(CUBE6, scramble)
  const stages: Stage[] = []

  const centres = solveCenters(state)
  if (!centres) throw new Error('6x6 centre solver failed')
  for (const st of centres) state = apply6(state, st.moves)
  stages.push(...centres)

  reportProgress('Pairing edges')
  const pairing = solvePairing(state)
  if (!pairing) throw new Error('6x6 edge pairing failed')
  for (const st of pairing) state = apply6(state, st.moves)
  stages.push(...pairing)
  if (!centersSolved(state) || !allPaired(state)) throw new Error('6x6 reduction incomplete (unexpected)')

  reportProgress('Checking parity and solving the 3×3 stage')
  let moves3: string[] | null = null
  for (const fixes of PARITY_COMBOS) {
    let trial = state
    for (const [, alg] of fixes) trial = apply6(trial, alg)
    if (!(centersSolved(trial) && allPaired(trial))) continue
    moves3 = solve3x3Facelet(toFacelet3(trial))
    if (moves3) {
      for (const [name, alg] of fixes) stages.push({ name, kind: 'parity', moves: [...alg] })
      state = trial
      break
    }
  }
  if (!moves3) throw new Error('6x6 reduced state unsolvable even after parity fixes')

  const cfop = solveCfop(invertMoves(moves3).join(' '), cfopFace, { beamWidth, tryXcross: true })
  const rotation = cfop.rotation
  if (rotation) state = apply6(state, rotation.split(' '))
  for (const st of cfop.stages) {
    state = apply6(state, st.moves)
    stages.push({ name: st.name, kind: st.kind, moves: st.moves })
  }
  if (!isSolved(CUBE6, state)) throw new Error('6x6 pipeline finished but the cube is not solved')

  for (const st of stages) st.move_count = st.moves.length
  const reductionKinds = new Set(['centers', 'pairing', 'parity'])
  const parts: string[] = []
  let usedRotation = false
  for (const st of stages) {
    if (!reductionKinds.has(st.kind) && rotation && !usedRotation) { parts.push(rotation); usedRotation = true }
    parts.push(...st.moves)
  }
  if (rotation && !usedRotation) parts.push(rotation)
  return {
    puzzle: '666',
    rotation,
    cfop_face: cfop.face,
    stages,
    reduction_moves: stages.filter(s => reductionKinds.has(s.kind)).reduce((n, s) => n + s.moves.length, 0),
    total_moves: stages.reduce((n, s) => n + s.moves.length, 0),
    solution: parts.join(' '),
    time_ms: performance.now() - t0,
  }
}
