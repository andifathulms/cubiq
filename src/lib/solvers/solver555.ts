// 5x5 reduction: centres (x + t orbits) -> edge grouping -> 3x3 CFOP
// (port of cubiq-ml solver555.py; helpers that were never reached there —
// partial-goal PDBs, the double-flip seed — are left out).
//
// Centres: IDA* per (face, orbit) over outer + second-slice moves with exact
// C(24,4) colour-mask PDBs, maxed over target and solved (orbit, face)
// pairs, with a guided beam fallback. Later faces use a macro-greedy
// whole-face solver (precomposed slice sandwiches on the live state).
//
// Edge grouping: grouping macros are slice2+body+slice2' sandwiches
// DISCOVERED by search and filtered to centre-safe permutations; wings are
// attached one at a time by positioning (wing, central edge) onto a macro's
// source slots. Endgames position both wings + central edge(s) jointly; a
// conjugated OLL-parity swap repairs the wing-parity obstruction.
//
// 3x3 stage: the reduced cube reads off as a 3x3 facelet; the two-phase
// solution, inverted, is a virtual scramble for the staged CFOP solver.

import { FACES, compose, fromScramble, invertMoves, isSolved } from './cubeN'
import {
  CEDGE_SLOTS, CUBE5, EDGE_GROUPS, SOLVED5, T_CENTER_IDX, WING_SLOTS, X_CENTER_IDX,
  allPaired, apply5, centersSolved, toFacelet3, wingsAttached,
} from './cube555'
import { solveCfop } from './cfop'
import { solve3x3Facelet } from './twophase'

const SUFFIXES = ['', "'", '2']
const OUTER_MOVES = FACES.flatMap(f => SUFFIXES.map(s => f + s))
const SLICE_MOVES = FACES.flatMap(f => SUFFIXES.map(s => '2' + f + s))
const SLICE_SANDWICH = [...FACES.flatMap(f => ['', "'"].map(s => '2' + f + s)), ...FACES.map(f => '2' + f + '2')]
const CENTER_SEARCH_MOVES = [...SLICE_MOVES, ...OUTER_MOVES]
const ALL_LAYER_MOVES = [...OUTER_MOVES, ...SLICE_MOVES]

const LAYER: Record<string, string> = Object.fromEntries(ALL_LAYER_MOVES.map(m => [m, m.replace(/['2]+$/, '')]))
const AXIS_OF_FACE: Record<string, number> = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 }
const LAYER_ID: Record<string, number> = {
  U: 0, '2U': 1, '2D': 2, D: 3, R: 0, '2R': 1, '2L': 2, L: 3, F: 0, '2F': 1, '2B': 2, B: 3,
}
const MOVE_AXIS: Record<string, number> = Object.fromEntries(ALL_LAYER_MOVES.map(m => [m, AXIS_OF_FACE[LAYER[m].replace(/^2/, '')]]))
const MOVE_LAYER_ID: Record<string, number> = Object.fromEntries(ALL_LAYER_MOVES.map(m => [m, LAYER_ID[LAYER[m]]]))

function inverse(m: string): string {
  if (m.endsWith("'")) return m.slice(0, -1)
  if (m.endsWith('2')) return m
  return m + "'"
}
const invertSeq = (seq: readonly string[]) => [...seq].reverse().map(inverse)

export interface Stage { name: string; kind: string; moves: string[]; move_count?: number }

const stateKey = (s: Int8Array) => s.join('')

// ── Centres: colour-mask representation ───────────────────────────────────────
// Each orbit's 24 slots (face-major, 4 per face) hold colours; a state is kept
// as 6 colour masks per orbit and moves permute masks via byte lookup tables.

type Orbit = 'x' | 't'
const ORBITS: Orbit[] = ['x', 't']
const ORBIT_GLOBAL: Record<Orbit, number[]> = {
  x: FACES.flatMap(f => X_CENTER_IDX[f]),
  t: FACES.flatMap(f => T_CENTER_IDX[f]),
}

const MASK_LUT: Record<Orbit, Record<string, Int32Array>> = { x: {}, t: {} }
for (const ob of ORBITS) {
  const pos = new Map(ORBIT_GLOBAL[ob].map((g, i) => [g, i]))
  for (const m of CENTER_SEARCH_MOVES) {
    const p = CUBE5.moves.get(m)!
    const perm = ORBIT_GLOBAL[ob].map(g => pos.get(p[g])!)   // slot j receives from perm[j]
    const lut = new Int32Array(768)
    for (let byte = 0; byte < 3; byte++) {
      for (let v = 0; v < 256; v++) {
        let out = 0
        for (let j = 0; j < 24; j++) {
          const src = perm[j] - byte * 8
          if (src >= 0 && src < 8 && (v >> src) & 1) out |= 1 << j
        }
        lut[byte * 256 + v] = out
      }
    }
    MASK_LUT[ob][m] = lut
  }
}

const permuteMask = (mask: number, lut: Int32Array) =>
  lut[mask & 255] | lut[256 + ((mask >> 8) & 255)] | lut[512 + ((mask >> 16) & 255)]

const BINOM: number[][] = Array.from({ length: 25 }, (_, n) => Array.from({ length: 5 }, (_, k) => {
  if (k > n) return 0
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return r
}))
function maskRank(mask: number): number {
  let r = 0
  for (let k = 1; mask; k++) {
    const low = mask & -mask
    r += BINOM[31 - Math.clz32(low)][k]
    mask ^= low
  }
  return r
}

/** masks[orbitIdx*6 + colour] */
type CMasks = number[]

function centerMasks(state: Int8Array): CMasks {
  const out: number[] = []
  for (const ob of ORBITS) {
    for (let color = 0; color < 6; color++) {
      let m = 0
      ORBIT_GLOBAL[ob].forEach((g, i) => { if (state[g] === color) m |= 1 << i })
      out.push(m)
    }
  }
  return out
}

function applyMoveMasks(ms: CMasks, move: string): CMasks {
  const lx = MASK_LUT.x[move], lt = MASK_LUT.t[move]
  const out = new Array<number>(12)
  for (let i = 0; i < 6; i++) out[i] = permuteMask(ms[i], lx)
  for (let i = 6; i < 12; i++) out[i] = permuteMask(ms[i], lt)
  return out
}

const CENTER_PDB = new Map<string, Uint8Array>()

function centerPdb(ob: Orbit, face: number): Uint8Array {
  const key = ob + face
  const cached = CENTER_PDB.get(key)
  if (cached) return cached
  const goal = 0b1111 << (face * 4)
  const dist = new Uint8Array(10626).fill(255)
  dist[maskRank(goal)] = 0
  const luts = CENTER_SEARCH_MOVES.map(m => MASK_LUT[ob][m])
  let frontier = [goal]
  for (let d = 1; frontier.length; d++) {
    const nxt: number[] = []
    for (const mask of frontier) {
      for (const lut of luts) {
        const nm = permuteMask(mask, lut)
        const r = maskRank(nm)
        if (dist[r] === 255) {
          dist[r] = d
          nxt.push(nm)
        }
      }
    }
    frontier = nxt
  }
  CENTER_PDB.set(key, dist)
  return dist
}


class NodeBudget extends Error {}

/** IDA*: target colour onto all 4 target slots of `orbit` while every
 *  (orbit, face) in `keep` stays solved. Node-budgeted. */
function solveOneCenter(ms: CMasks, orbit: Orbit, target: number, keep: [Orbit, number][],
  maxDepth = 16, nodeBudget = 3_000_000): string[] | null {
  const goals: [Orbit, number][] = [...keep, [orbit, target]]
  const pdbs = goals.map(([ob, f]) => centerPdb(ob, f))
  const offs = goals.map(([ob, f]) => (ob === 'x' ? 0 : 6) + f)
  const goalMasks = goals.map(([, f]) => 0b1111 << (f * 4))
  const moves = CENTER_SEARCH_MOVES.map(m => ({ m, axis: MOVE_AXIS[m], lid: MOVE_LAYER_ID[m] }))
  const path: string[] = []
  let budget = nodeBudget
  const dfs = (st: CMasks, depth: number, bound: number, lastAxis: number, lastLid: number): boolean => {
    if (--budget <= 0) throw new NodeBudget()
    // keep faces first, then the target — max is order-independent
    let h = 0
    for (let i = 0; i < goals.length; i++) {
      const d = pdbs[i][maskRank(st[offs[i]])]
      if (d > h) h = d
    }
    if (depth + h > bound) return false
    if (h === 0 && offs.every((o, i) => st[o] === goalMasks[i])) return true
    for (const { m, axis, lid } of moves) {
      if (axis === lastAxis && lid <= lastLid) continue
      path.push(m)
      if (dfs(applyMoveMasks(st, m), depth + 1, bound, axis, lid)) return true
      path.pop()
    }
    return false
  }
  try {
    for (let bound = 0; bound <= maxDepth; bound++) {
      path.length = 0
      if (dfs(ms, 0, bound, -1, -1)) return [...path]
    }
  } catch (e) {
    if (e instanceof NodeBudget) return null
    throw e
  }
  return null
}

/** Guided beam search fallback, scored by the SUM of PDB distances (a far
 *  better progress signal than the admissible max). */
function beamCenterStage(ms: CMasks, orbit: Orbit, target: number, keep: [Orbit, number][],
  width = 700, maxDepth = 24): string[] | null {
  const goals: [Orbit, number][] = [...keep, [orbit, target]]
  const pdbs = goals.map(([ob, f]) => centerPdb(ob, f))
  const offs = goals.map(([ob, f]) => (ob === 'x' ? 0 : 6) + f)
  const score = (st: CMasks) => {
    let s = 0
    for (let i = 0; i < goals.length; i++) s += pdbs[i][maskRank(st[offs[i]])]
    return s
  }
  let beam: [number, CMasks, string[]][] = [[score(ms), ms, []]]
  const seen = new Set([ms.join(',')])
  for (let depth = 0; depth < maxDepth; depth++) {
    const nxt: [number, CMasks, string[]][] = []
    for (const [, st, path] of beam) {
      for (const move of CENTER_SEARCH_MOVES) {
        const ns = applyMoveMasks(st, move)
        const k = ns.join(',')
        if (seen.has(k)) continue
        seen.add(k)
        const sc = score(ns)
        if (sc === 0) return [...path, move]
        nxt.push([sc, ns, [...path, move]])
      }
    }
    if (!nxt.length) return null
    nxt.sort((a, b) => a[0] - b[0])
    beam = nxt.slice(0, width)
  }
  return null
}

// ── Macro-greedy fallback: precomposed slice sandwiches on the live state ────

type PermMacro = [string[], Int32Array]
let CENTER_MACROS: PermMacro[] | null = null
let ENDGAME_MACROS: PermMacro[] | null = null
let SETUP_PERMS: PermMacro[] | null = null

const IDENTITY150 = Int32Array.from({ length: 150 }, (_, i) => i)
function permOf(seq: readonly string[]): Int32Array {
  let perm: Int32Array = IDENTITY150
  for (const m of seq) perm = compose(perm, CUBE5.moves.get(m)!)
  return perm
}

const ALL_CENTER_IDS = FACES.flatMap(f => [...X_CENTER_IDX[f], ...T_CENTER_IDX[f]])

function centerMacroLib(): [PermMacro[], PermMacro[], PermMacro[]] {
  if (CENTER_MACROS && ENDGAME_MACROS && SETUP_PERMS) return [CENTER_MACROS, ENDGAME_MACROS, SETUP_PERMS]
  const bodies: string[][] = OUTER_MOVES.map(m => [m])
  for (const a of OUTER_MOVES) for (const b of OUTER_MOVES) if (LAYER[a] !== LAYER[b]) bodies.push([a, b])

  let macros: PermMacro[] = []
  let seen = new Set<string>()
  const consider = (seq: string[]) => {
    const perm = permOf(seq)
    const key = ALL_CENTER_IDS.map(i => perm[i]).join(',')
    if (seen.has(key)) return
    seen.add(key)
    macros.push([seq, perm])
  }
  for (const s of SLICE_SANDWICH) for (const body of bodies) consider([s, ...body, inverse(s)])
  // commutators [sandwich, rotation]
  for (const s of SLICE_SANDWICH) {
    for (const b of OUTER_MOVES) {
      const sw = [s, b, inverse(s)]
      const swInv = [s, inverse(b), inverse(s)]
      for (const r of OUTER_MOVES) consider([...sw, r, ...swInv, inverse(r)])
    }
  }
  const mainMacros = macros

  // ENDGAME library: commutators of two sandwiches whose centre supports
  // meet in exactly ONE cell — pure single-sticker 3-cycles. Bare sandwiches
  // only swap (x,t) PAIRS, which cannot finish a face at 7/8.
  macros = []
  seen = new Set()
  const base: [string[], string[], Set<number>][] = []
  for (const s of SLICE_SANDWICH) {
    for (const b of OUTER_MOVES) {
      const seq = [s, b, inverse(s)]
      const after = apply5(SOLVED5, seq)
      // colour-level support: same-colour internal swaps are invisible
      const support = new Set(ALL_CENTER_IDS.filter(i => after[i] !== SOLVED5[i]))
      if (support.size > 0 && support.size <= 6) base.push([seq, [s, inverse(b), inverse(s)], support])
    }
  }
  for (let i = 0; i < base.length; i++) {
    if (macros.length >= 20000) break
    for (let j = 0; j < base.length; j++) {
      if (i === j) continue
      const [s1, i1, sup1] = base[i]
      const [s2, i2, sup2] = base[j]
      let inter = 0
      for (const x of sup1) if (sup2.has(x)) inter++
      if (inter === 1) consider([...s1, ...s2, ...i1, ...i2])
    }
  }
  const endgameMacros = macros

  const setups: PermMacro[] = [[[], IDENTITY150], ...OUTER_MOVES.map(m => [[m], CUBE5.moves.get(m)!] as PermMacro)]
  for (const a of OUTER_MOVES) {
    for (const b of OUTER_MOVES) {
      if (LAYER[a] !== LAYER[b]) setups.push([[a, b], compose(CUBE5.moves.get(a)!, CUBE5.moves.get(b)!)])
    }
  }
  CENTER_MACROS = mainMacros
  ENDGAME_MACROS = endgameMacros
  SETUP_PERMS = setups
  return [mainMacros, endgameMacros, setups]
}

/** Greedy whole-face solver: apply (outer setup + macro) that strictly
 *  increases the number of target-colour stickers among the target face's
 *  8 centre slots, while every kept COMPLETE face stays solved. */
function macroCenterFace(state: Int8Array, target: number, keepFaces: number[], maxSteps = 24): string[] | null {
  const [macros, endgameMacros, setups] = centerMacroLib()
  const tf = FACES[target]
  const targetSlots = [...X_CENTER_IDX[tf], ...T_CENTER_IDX[tf]]
  const keepSlots = keepFaces.map(f => [[...X_CENTER_IDX[FACES[f]], ...T_CENTER_IDX[FACES[f]]], f] as [number[], number])
  const placed = (st: Int8Array) => targetSlots.reduce((n, i) => n + (st[i] === target ? 1 : 0), 0)

  type Found = { gain: number; cost: number; moves: string[]; st: Int8Array }
  type Zero = { cost: number; moves: string[]; sperm: Int32Array; mperm: Int32Array; st?: Int8Array }
  const materialize = (cur: Int8Array, sperm: Int32Array, mperm: Int32Array) => {
    const out = new Int8Array(150)
    for (let i = 0; i < 150; i++) out[i] = cur[sperm[mperm[i]]]
    return out
  }
  // Per macro: where the target / kept slots draw their stickers from
  // (flat: macro mi's 8 target sources at [mi*8, mi*8+8), keep likewise).
  const keepFlat = keepSlots.flatMap(([slots]) => slots)
  const keepColor = Int8Array.from(keepSlots.flatMap(([slots, f]) => slots.map(() => f)))
  const nT = targetSlots.length, nK = keepFlat.length
  const srcs = (lib: PermMacro[]) => {
    const t = new Int16Array(lib.length * nT), k = new Int16Array(lib.length * nK)
    lib.forEach(([, mperm], mi) => {
      targetSlots.forEach((i, j) => { t[mi * nT + j] = mperm[i] })
      keepFlat.forEach((i, j) => { k[mi * nK + j] = mperm[i] })
    })
    return { t, k }
  }
  const macroSrc = srcs(macros)
  let endgameSrc: ReturnType<typeof srcs> | null = null

  // Candidates are scored on the few stickers that matter: after setup s the
  // state is A = cur[sperm], after the macro st2[i] = A[mperm[i]]. Full
  // states are only built when needed. `firstOnly` stops at the first strict
  // gain (the 2-ply lookahead only asks whether one exists).
  const findGain = (cur: Int8Array, base: number, collectZero: boolean, endgame = false, firstOnly = false): [Found | null, Zero[]] => {
    const lib = endgame ? endgameMacros : macros
    const { t, k } = endgame ? (endgameSrc ??= srcs(endgameMacros)) : macroSrc
    let best: Found | null = null
    const zeros: Zero[] = []
    const A = new Int8Array(150)
    // a candidate is dead once its misses exceed this (gain would be < 0,
    // or <= 0 when zero-gain moves are not collected)
    const maxMiss = nT - base - (collectZero ? 0 : 1)
    for (const [smoves, sperm] of setups) {
      for (let i = 0; i < 150; i++) A[i] = cur[sperm[i]]
      for (let mi = 0, to = 0, ko = 0; mi < lib.length; mi++, to += nT, ko += nK) {
        let miss = 0
        for (let j = 0; j < nT && miss <= maxMiss; j++) if (A[t[to + j]] !== target) miss++
        if (miss > maxMiss) continue
        const gain = nT - miss - base
        if (gain === 0 && zeros.length >= 200) continue
        let ok = true
        for (let j = 0; j < nK; j++) if (A[k[ko + j]] !== keepColor[j]) { ok = false; break }
        if (!ok) continue
        const [mseq, mperm] = lib[mi]
        const cost = smoves.length + mseq.length
        if (gain > 0) {
          if (!best || -gain < -best.gain || (gain === best.gain && cost < best.cost)) {
            best = { gain, cost, moves: [...smoves, ...mseq], st: materialize(cur, sperm, mperm) }
            if (firstOnly) return [best, zeros]
          }
        } else {
          zeros.push({ cost, moves: [...smoves, ...mseq], sperm, mperm })
        }
      }
    }
    return [best, zeros]
  }

  let cur = state
  const total: string[] = []
  const visited = new Set([stateKey(cur)])
  let reshapes = 0
  for (let step = 0; step < maxSteps; step++) {
    const base = placed(cur)
    if (base === 8) return total
    let [best, zeros] = findGain(cur, base, true)
    // pair-swaps cannot finish 7/8 — bring in the single-sticker 3-cycles
    if (!best) best = findGain(cur, base, false, true)[0]
    if (!best) {
      // take a zero-gain swap only if a strict gain follows it (2-ply
      // lookahead), guarded by a visited set
      if (reshapes >= 6) return null
      reshapes++
      zeros = zeros.map((z, i) => [z, i] as const).sort((a, b) => a[0].cost - b[0].cost || a[1] - b[1]).map(([z]) => z)
      const stOf = (z: Zero) => (z.st ??= materialize(cur, z.sperm, z.mperm))
      let chosen: Found | null = null
      let lookaheads = 0
      for (const z of zeros) {
        const st2 = stOf(z)
        if (visited.has(stateKey(st2))) continue
        if (lookaheads >= 40) break
        lookaheads++
        if (findGain(st2, placed(st2), false, false, true)[0]) {
          chosen = { gain: 0, cost: z.cost, moves: z.moves, st: st2 }
          break
        }
      }
      if (!chosen && zeros.length) {
        // no verified path — take the cheapest unvisited reshape blind
        for (const z of zeros) {
          const st2 = stOf(z)
          if (!visited.has(stateKey(st2))) {
            chosen = { gain: 0, cost: z.cost, moves: z.moves, st: st2 }
            break
          }
        }
      }
      if (!chosen) return null
      best = chosen
    }
    total.push(...best.moves)
    cur = best.st
    visited.add(stateKey(cur))
  }
  return null
}

function centerFaceWithFallbacks(cur: Int8Array, fi: number, keepFaces: number[]): string[] | null {
  const mv = macroCenterFace(cur, fi, keepFaces)
  if (mv) return mv
  // un-preserve one completed face (most recent first), solve the target,
  // then re-solve the dropped face
  for (const drop of [...keepFaces].reverse()) {
    const rest = keepFaces.filter(f => f !== drop)
    const mv1 = macroCenterFace(cur, fi, rest)
    if (!mv1) continue
    const mid = apply5(cur, mv1)
    const mv2 = macroCenterFace(mid, drop, [...rest, fi])
    if (mv2) return [...mv1, ...mv2]
  }
  return null
}

export function solveCenters(state: Int8Array): Stage[] | null {
  let cur = state
  const stages: Stage[] = []
  let keep: [Orbit, number][] = []
  const keepFaces: number[] = []
  // First two faces per-orbit via optimal IDA* (few constraints — fast).
  // Later faces whole-face via macro greedy (complete-face keeps only
  // sidesteps the same-face x/t conflict). Solving 5 faces forces the 6th.
  for (const f of ['U', 'F']) {
    const fi = FACES.indexOf(f as never)
    const faceStart = cur
    let faceStages: Stage[] = []
    let ok = true
    for (const orbit of ORBITS) {
      const ms = centerMasks(cur)
      let moves = solveOneCenter(ms, orbit, fi, keep)
      if (!moves) moves = beamCenterStage(ms, orbit, fi, keep)
      if (!moves) { ok = false; break }
      cur = apply5(cur, moves)
      keep.push([orbit, fi])
      faceStages.push({ name: `${f} ${orbit}-centers`, kind: 'centers', moves })
    }
    if (!ok) {
      // whole-face macro greedy as safety net (complete-face keeps only)
      keep = keep.filter(k => k[1] !== fi)
      cur = faceStart
      const moves = centerFaceWithFallbacks(cur, fi, keepFaces)
      if (!moves) return null
      cur = apply5(cur, moves)
      keep.push(['x', fi], ['t', fi])
      faceStages = [{ name: `${f} centers`, kind: 'centers', moves }]
    }
    stages.push(...faceStages)
    keepFaces.push(fi)
  }
  for (const f of ['R', 'B', 'L']) {
    const fi = FACES.indexOf(f as never)
    const moves = centerFaceWithFallbacks(cur, fi, keepFaces)
    if (!moves) return null
    cur = apply5(cur, moves)
    keepFaces.push(fi)
    keep.push(['x', fi], ['t', fi])
    stages.push({ name: `${f} centers`, kind: 'centers', moves })
  }
  return stages
}

// ── Edge grouping ─────────────────────────────────────────────────────────────

const WING_STICKER_POS = new Map<number, number>()
WING_SLOTS.forEach(([a, b], wi) => { WING_STICKER_POS.set(a, wi); WING_STICKER_POS.set(b, wi) })
const CEDGE_STICKER_POS = new Map<number, number>()
CEDGE_SLOTS.forEach(([a, b], ci) => { CEDGE_STICKER_POS.set(a, ci); CEDGE_STICKER_POS.set(b, ci) })

const invertPerm = (p: number[]) => {
  const inv = new Array<number>(p.length)
  p.forEach((v, i) => { inv[v] = i })
  return inv
}

const WPERM: Record<string, number[]> = {}
const CEPERM: Record<string, number[]> = {}
// central-edge sub-state (slot*2 + flip) transition: flip = whether the
// piece's first sticker crossed to the slot's second position
const CE_SUBTRANS: Record<string, number[]> = {}
for (const m of ALL_LAYER_MOVES) {
  const p = CUBE5.moves.get(m)!
  WPERM[m] = WING_SLOTS.map(([a]) => WING_STICKER_POS.get(p[a])!)
  CEPERM[m] = CEDGE_SLOTS.map(([a]) => CEDGE_STICKER_POS.get(p[a])!)
  const t = new Array<number>(24).fill(0)
  CEDGE_SLOTS.forEach(([da], dest) => {
    const sa = p[da]
    const src = CEDGE_STICKER_POS.get(sa)!
    const crossed = sa === CEDGE_SLOTS[src][1] ? 1 : 0
    for (let o = 0; o < 2; o++) t[src * 2 + o] = dest * 2 + (o ^ crossed)
  })
  CE_SUBTRANS[m] = t
}
const WPERM_INV: Record<string, number[]> = Object.fromEntries(Object.entries(WPERM).map(([m, p]) => [m, invertPerm(p)]))
const CEPERM_INV: Record<string, number[]> = Object.fromEntries(Object.entries(CEPERM).map(([m, p]) => [m, invertPerm(p)]))

const OLL_PARITY = "2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2".split(' ')

// OLL_PARITY's support on the 5x5 is exactly two wing slots, so
// conjugation g + P + g^-1 swaps ANY two wings tightly.
const P_SLOTS: [number, number] = (() => {
  const st = apply5(SOLVED5, OLL_PARITY)
  const changed = WING_SLOTS.map(([a, b], wi) => [a, b, wi]).filter(([a, b]) => st[a] !== SOLVED5[a] || st[b] !== SOLVED5[b]).map(([, , wi]) => wi)
  if (changed.length !== 2) throw new Error('parity alg support')
  return [changed[0], changed[1]]
})()

/** Early-exit-equivalent BFS: a cached full BFS tree per start state (its
 *  parent pointers equal those of the original early-exit searches). */
function makeTreeSearch(nStates: number, moves: string[], step: (state: number, move: string) => number) {
  const trees = new Map<number, [Int32Array, Int16Array, Int16Array]>()
  const tree = (start: number) => {
    let t = trees.get(start)
    if (t) return t
    const prev = new Int32Array(nStates).fill(-1)
    const move = new Int16Array(nStates).fill(-1)
    const depth = new Int16Array(nStates).fill(-1)
    depth[start] = 0
    prev[start] = start
    const queue = [start]
    for (let head = 0; head < queue.length; head++) {
      const s = queue[head]
      for (let mi = 0; mi < moves.length; mi++) {
        const ns = step(s, moves[mi])
        if (depth[ns] !== -1) continue
        depth[ns] = depth[s] + 1
        prev[ns] = s
        move[ns] = mi
        queue.push(ns)
      }
    }
    t = [prev, move, depth]
    trees.set(start, t)
    return t
  }
  return (from: number, to: number, maxDepth: number): string[] | null => {
    if (from === to) return []
    const [prev, move, depth] = tree(from)
    if (depth[to] < 0 || depth[to] > maxDepth) return null
    const path: string[] = []
    for (let k = to; k !== from; k = prev[k]) path.push(moves[move[k]])
    return path.reverse()
  }
}

// ordered wing pair over all layer moves (conjugator search)
const pairSearch = makeTreeSearch(576, ALL_LAYER_MOVES, (s, m) => {
  const inv = WPERM_INV[m]
  return inv[Math.floor(s / 24)] * 24 + inv[s % 24]
})
// (wing, wing, central edge) over outer moves
const tripleSearch = makeTreeSearch(576 * 12, OUTER_MOVES, (s, m) => {
  const wi = WPERM_INV[m], ci = CEPERM_INV[m]
  const c = s % 12, w = (s - c) / 12
  return (wi[Math.floor(w / 24)] * 24 + wi[w % 24]) * 12 + ci[c]
})
// (wing, central edge) over outer moves
const wingCeSearch = makeTreeSearch(24 * 12, OUTER_MOVES, (s, m) =>
  WPERM_INV[m][Math.floor(s / 12)] * 12 + CEPERM_INV[m][s % 12])

/** Sequence swapping exactly the wings at slotA and slotB. */
function tightSwap(slotA: number, slotB: number): string[] | null {
  for (const target of [P_SLOTS, [P_SLOTS[1], P_SLOTS[0]]]) {
    const g = pairSearch(slotA * 24 + slotB, target[0] * 24 + target[1], 8)
    if (g) return [...g, ...OLL_PARITY, ...invertSeq(g)]
  }
  return null
}

function wingPermParity(seq: readonly string[]): number {
  let perm = [...Array(24).keys()]
  for (const m of seq) {
    const wp = WPERM[m]
    perm = wp.map(i => perm[i])
  }
  let par = 0
  const seen = new Array(24).fill(false)
  for (let i = 0; i < 24; i++) {
    if (seen[i]) continue
    let ln = 0
    for (let j = i; !seen[j]; j = perm[j]) { seen[j] = true; ln++ }
    par ^= (ln - 1) & 1
  }
  return par
}

/** Several sequences swapping exactly the wings at (a, b) via different
 *  conjugators — same wing effect, different (invisible) centre damage. */
function* tightSwapVariants(slotA: number, slotB: number, limit = 12): Generator<string[]> {
  let yielded = 0
  for (const r of [null, ...OUTER_MOVES]) {
    if (yielded >= limit) return
    let a2 = slotA, b2 = slotB
    let wrap: string[] = [], unwrap: string[] = []
    if (r !== null) {
      const inv = WPERM_INV[r]
      a2 = inv[slotA]
      b2 = inv[slotB]
      wrap = [r]
      unwrap = [inverse(r)]
    }
    const core = tightSwap(a2, b2)
    if (!core) continue
    yielded++
    yield [...wrap, ...core, ...unwrap]
  }
}

const GROUP_OF_WING = new Map<number, number>()
EDGE_GROUPS.forEach(([, w1, w2], gi) => { GROUP_OF_WING.set(w1, gi); GROUP_OF_WING.set(w2, gi) })

interface Macro { seq: string[]; wperm?: number[]; ceperm?: number[]; cesub?: number[]; cesubInv?: number[] }
let MACROS: Macro[] | null = null

function discoverMacros(maxBody = 3, cap = 220): Macro[] {
  if (MACROS) return MACROS
  const bodies: string[][] = []
  let level: string[][] = [[]]
  for (let ln = 1; ln <= maxBody; ln++) {
    const next: string[][] = []
    for (const prefix of level) for (const m of OUTER_MOVES) next.push([...prefix, m])
    level = next
    for (const combo of next) {
      let ok = true
      for (let i = 0; i + 1 < combo.length; i++) if (LAYER[combo[i]] === LAYER[combo[i + 1]]) { ok = false; break }
      if (ok) bodies.push(combo)
    }
  }
  bodies.push(['R', 'U', "R'", 'F', "R'", "F'", 'R'])
  bodies.push(["L'", "U'", 'L', "F'", 'L', 'F', "L'"])

  const candidates: string[][] = []
  for (const s of SLICE_SANDWICH) for (const b of bodies) candidates.push([s, ...b, inverse(s)])
  candidates.push(OLL_PARITY)

  const seen = new Set<string>()
  const macros: Macro[] = []
  const parityKept: Macro[] = []
  for (const seq of candidates) {
    if (!centersSolved(apply5(SOLVED5, seq))) continue
    let wperm = [...Array(24).keys()]
    for (const m of seq) {
      const wp = WPERM[m]
      wperm = wp.map(i => wperm[i])
    }
    const key = wperm.join(',')
    if (seen.has(key)) continue
    // useful iff it moves wings between positions or swaps within one
    const useful = wperm.some((w, i) => GROUP_OF_WING.get(w) !== GROUP_OF_WING.get(i)) || wperm.some((w, i) => w !== i)
    if (!useful) continue
    seen.add(key)
    const entry: Macro = { seq }
    macros.push(entry)
    if (seq === OLL_PARITY) parityKept.push(entry)
  }
  macros.sort((a, b) => a.seq.length - b.seq.length)
  // guarantee the parity seed survives any cap
  const kept = macros.slice(0, cap)
  for (const pk of parityKept) if (!kept.includes(pk)) kept.push(pk)
  MACROS = kept
  return kept
}

function macroWingMaps(macro: Macro): [number[], number[]] {
  if (!macro.wperm) {
    let wperm = [...Array(24).keys()]
    let ceperm = [...Array(12).keys()]
    let cesub = [...Array(24).keys()]
    for (const m of macro.seq) {
      const wp = WPERM[m], cp = CEPERM[m], ct = CE_SUBTRANS[m]
      wperm = wp.map(i => wperm[i])
      ceperm = cp.map(i => ceperm[i])
      cesub = cesub.map(x => ct[x])
    }
    macro.wperm = wperm
    macro.ceperm = ceperm
    macro.cesub = cesub
  }
  return [macro.wperm, macro.ceperm!]
}

const SOLVED_CE_COLORS = CEDGE_SLOTS.map(([a, b]) => [SOLVED5[a], SOLVED5[b]])
const sameColors = (x: number, y: number, c: number[]) => (x === c[0] && y === c[1]) || (x === c[1] && y === c[0])

/** For each group: current slot of its central edge (by home colours). */
function centralEdgeSlot(cur: Int8Array, gi: number): number | null {
  const [ci] = EDGE_GROUPS[gi]
  const colors = SOLVED_CE_COLORS[ci]
  for (let cj = 0; cj < 12; cj++) {
    const [a, b] = CEDGE_SLOTS[cj]
    if (sameColors(cur[a], cur[b], colors)) return cj
  }
  return null
}

/** (wing slot, its central edge's slot) for every unattached wing. */
function looseWings(cur: Int8Array): [number, number][] {
  const out: [number, number][] = []
  EDGE_GROUPS.forEach(([ci], gi) => {
    const colors = SOLVED_CE_COLORS[ci]
    const ceCur = centralEdgeSlot(cur, gi)
    if (ceCur === null) return
    const [ra, rb] = CEDGE_SLOTS[ceCur]
    WING_SLOTS.forEach(([a, b], wi) => {
      if (!sameColors(cur[a], cur[b], colors)) return
      // attached iff in the central edge's own group showing matching colours
      const inGroup = EDGE_GROUPS[ceCur][1] === wi || EDGE_GROUPS[ceCur][2] === wi
      const matches = cur[a] === cur[ra] && cur[b] === cur[rb]
      if (!(inGroup && matches)) out.push([wi, ceCur])
    })
  })
  return out
}

interface Candidate { moves: string[]; cost: number; gain: number; state: Int8Array }

const better = (gain: number, cost: number, best: Candidate | null) =>
  !best || -gain < -best.gain || (gain === best.gain && cost < best.cost)

// ── Four-piece positioning (wing, wing, ce-sub, ce-sub) over outer moves ─────
const FOUR_CACHE = new Map<number, [Int32Array, Int8Array]>()
const fourKey = (w0: number, w1: number, c0: number, c1: number) => ((w0 * 24 + w1) * 24 + c0) * 24 + c1

function fourPieceMap(frm: number): [Int32Array, Int8Array] {
  const cached = FOUR_CACHE.get(frm)
  if (cached) return cached
  const prev = new Int32Array(331776).fill(-1)
  const move = new Int8Array(331776).fill(-1)
  prev[frm] = frm
  const queue = [frm]
  for (let head = 0; head < queue.length; head++) {
    const s = queue[head]
    const c1 = s % 24, r1 = (s - c1) / 24
    const c0 = r1 % 24, r2 = (r1 - c0) / 24
    const w1 = r2 % 24, w0 = (r2 - w1) / 24
    for (let mi = 0; mi < OUTER_MOVES.length; mi++) {
      const m = OUTER_MOVES[mi]
      const wi = WPERM_INV[m], ct = CE_SUBTRANS[m]
      const ns = fourKey(wi[w0], wi[w1], ct[c0], ct[c1])
      if (prev[ns] !== -1) continue
      prev[ns] = s
      move[ns] = mi
      queue.push(ns)
    }
  }
  if (FOUR_CACHE.size > 2) FOUR_CACHE.clear()
  FOUR_CACHE.set(frm, [prev, move])
  return [prev, move]
}

function positionFourPieces(frm: number, to: number): string[] | null {
  const [prev, move] = fourPieceMap(frm)
  if (prev[to] === -1) return null
  const path: string[] = []
  for (let k = to; k !== frm; k = prev[k]) path.push(OUTER_MOVES[move[k]])
  return path.reverse()
}

/** Attach one wing at a time: position (wing, its central edge) onto a
 *  macro's (wing-source, cedge-source) slots and apply; accept by
 *  simulated wingsAttached gain. */
function pairingCandidates(cur: Int8Array, macros: Macro[], base: number, minGain = 1, avoid: Set<string> | null = null): Candidate | null {
  const loose = looseWings(cur)
  let best: Candidate | null = null
  const prune = minGain >= 1
  const memo = new Map<number, string[] | null>()
  for (const macro of macros) {
    if (prune && best && best.cost <= macro.seq.length) break
    const [wperm, ceperm] = macroWingMaps(macro)
    for (const [ci, w1, w2] of EDGE_GROUPS) {
      const sc = ceperm[ci]
      for (const d of [w1, w2]) {
        const sw = wperm[d]
        for (const [pw, pce] of loose) {
          const k = ((pw * 12 + pce) * 24 + sw) * 12 + sc
          if (!memo.has(k)) memo.set(k, wingCeSearch(pw * 12 + pce, sw * 12 + sc, 6))
          const setup = memo.get(k)!
          if (!setup) continue
          const total = [...setup, ...macro.seq]
          if (prune && best && total.length >= best.cost) continue
          const trial = apply5(cur, total)
          const gain = wingsAttached(trial) - base
          if (gain >= minGain && centersSolved(trial)) {
            if (gain === 0 && (avoid === null || avoid.has(stateKey(trial)))) continue
            if (better(gain, total.length, best)) best = { moves: total, cost: total.length, gain, state: trial }
          }
        }
      }
    }
  }

  // endgame: with few loose wings, position BOTH wings of a group plus its
  // central edge simultaneously (L2E-style)
  if (!best && loose.length > 0 && loose.length <= 4) {
    const byCe = new Map<number, number[]>()
    for (const [pw, pce] of loose) {
      if (!byCe.has(pce)) byCe.set(pce, [])
      byCe.get(pce)!.push(pw)
    }
    // cross case: two groups each missing one wing, wings swapped between
    // them — position all four pieces (both wings + both central edges)
    if (byCe.size === 2 && [...byCe.values()].every(v => v.length === 1)) {
      const [[ceA, [wA]], [ceB, [wB]]] = [...byCe.entries()].sort((a, b) => a[0] - b[0])
      const ceSub = (slot: number) => {
        const [a, b] = CEDGE_SLOTS[slot]
        const disp = [cur[a], cur[b]]
        for (let h = 0; h < 12; h++) {
          const canon = SOLVED_CE_COLORS[h]
          if (sameColors(disp[0], disp[1], canon)) return slot * 2 + (disp[0] === canon[0] && disp[1] === canon[1] ? 0 : 1)
        }
        return slot * 2
      }
      const ceASub = ceSub(ceA), ceBSub = ceSub(ceB)
      const groupOfCe = (c: number) => EDGE_GROUPS.findIndex(([ci]) => ci === c)
      search: for (const macro of macros) {
        const [wperm] = macroWingMaps(macro)
        macro.cesubInv ??= invertPerm(macro.cesub!)
        const cesubInv = macro.cesubInv
        for (const [wFirst, wSecond] of [[wA, wB], [wB, wA]]) {
          for (const [c1Final, c2Final] of [[ceA, ceB], [ceB, ceA]]) {
            const g1 = groupOfCe(c1Final), g2 = groupOfCe(c2Final)
            for (const d1 of EDGE_GROUPS[g1].slice(1)) {
              for (const d2 of EDGE_GROUPS[g2].slice(1)) {
                for (const o1 of [0, 1]) {
                  for (const o2 of [0, 1]) {
                    const setup = positionFourPieces(
                      fourKey(wFirst, wSecond, ceASub, ceBSub),
                      fourKey(wperm[d1], wperm[d2], cesubInv[c1Final * 2 + o1], cesubInv[c2Final * 2 + o2]))
                    if (!setup) continue
                    const total = [...setup, ...macro.seq]
                    const trial = apply5(cur, total)
                    const gain = wingsAttached(trial) - base
                    if (gain > 0 && centersSolved(trial)) {
                      best = { moves: total, cost: total.length, gain, state: trial }
                      break search
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    for (const [pce, pws] of byCe) {
      if (pws.length !== 2) continue
      for (const macro of macros) {
        const [wperm, ceperm] = macroWingMaps(macro)
        for (const [ci, w1, w2] of EDGE_GROUPS) {
          const s1 = wperm[w1], s2 = wperm[w2], sc = ceperm[ci]
          for (const assign of [[pws[0], pws[1]], [pws[1], pws[0]]]) {
            const setup = tripleSearch((assign[0] * 24 + assign[1]) * 12 + pce, (s1 * 24 + s2) * 12 + sc, 7)
            if (!setup) continue
            const total = [...setup, ...macro.seq]
            const trial = apply5(cur, total)
            const gain = wingsAttached(trial) - base
            if (gain > 0 && centersSolved(trial) && better(gain, total.length, best)) {
              best = { moves: total, cost: total.length, gain, state: trial }
            }
          }
        }
      }
    }
  }
  return best
}

/** Greedy wing attachment with restarts: rotating the macro preference
 *  changes the whole trajectory and dodges a stranded endgame. */
export function solvePairing(state: Int8Array, maxSteps = 40, restarts = 2): Stage[] | null {
  const baseMacros = discoverMacros()
  for (let attempt = 0; attempt < restarts; attempt++) {
    const rot = (attempt * 61) % Math.max(1, baseMacros.length)
    const result = solvePairingOnce(state, [...baseMacros.slice(rot), ...baseMacros.slice(0, rot)], maxSteps)
    if (result) return result
  }
  return null
}

function solvePairingOnce(state: Int8Array, macros: Macro[], maxSteps: number): Stage[] | null {
  const stages: Stage[] = []
  let cur = state
  let shuffles = 0
  let parityFixes = 0
  const visited = new Set<string>()
  for (let step = 0; step < maxSteps; step++) {
    const base = wingsAttached(cur)
    if (base === 24) return stages
    const best = pairingCandidates(cur, macros, base)
    if (best) {
      cur = best.state
      stages.push({ name: `attach wings (${base} → ${base + best.gain})`, kind: 'pairing', moves: best.moves })
      continue
    }
    // stagnation: zero-gain reshapes, accepted only when a strict gain
    // provably follows (2-ply lookahead)
    if (shuffles >= 8) return null
    shuffles++
    visited.add(stateKey(cur))
    let chosen: Candidate | null = null
    for (let t = 0; t < 8; t++) {
      const z = pairingCandidates(cur, macros, base, 0, visited)
      if (!z) break
      visited.add(stateKey(z.state))
      if (pairingCandidates(z.state, macros, wingsAttached(z.state))) {
        chosen = z
        break
      }
    }
    if (chosen) {
      cur = chosen.state
      stages.push({ name: 'reshape edges', kind: 'pairing', moves: chosen.moves })
      continue
    }
    // LAST RESORT: a conjugated-parity tight swap changes the wing parity
    // (the unfixable obstruction), then centres re-solve
    if (parityFixes >= 2) return null
    const looseNow = looseWings(cur).map(([w]) => w)
    let fixed = false
    fix: for (let i = 0; i < looseNow.length; i++) {
      for (let j = i + 1; j < looseNow.length; j++) {
        for (const seq of tightSwapVariants(looseNow[i], looseNow[j])) {
          const trial = apply5(cur, seq)
          if (wingsAttached(trial) <= base) continue
          const repair = solveCenters(trial)
          if (!repair) continue
          const rm = repair.flatMap(st => st.moves)
          // the swap toggles wing parity (the point); the repair must not
          // toggle it back — try the next conjugation variant if it does
          if (wingPermParity([...seq, ...rm]) !== 1) continue
          cur = apply5(trial, rm)
          stages.push({ name: 'wing parity fix', kind: 'pairing', moves: [...seq, ...rm] })
          parityFixes++
          fixed = true
          break fix
        }
      }
    }
    if (!fixed) return null
  }
  return null
}

// ── Full solve ────────────────────────────────────────────────────────────────

export function solve555(scramble: string) {
  const t0 = performance.now()
  let state = fromScramble(CUBE5, scramble)
  const stages: Stage[] = []

  const centerStages = solveCenters(state)
  if (!centerStages) throw new Error('5x5 center solver failed')
  for (const st of centerStages) state = apply5(state, st.moves)
  stages.push(...centerStages)
  if (!centersSolved(state)) throw new Error('5x5 centers not solved (unexpected)')

  const pairingStages = solvePairing(state)
  if (!pairingStages) throw new Error('5x5 edge grouping failed')
  for (const st of pairingStages) state = apply5(state, st.moves)
  stages.push(...pairingStages)
  if (!centersSolved(state) || !allPaired(state)) throw new Error('5x5 reduction incomplete (unexpected)')

  const moves3 = solve3x3Facelet(toFacelet3(state))
  if (!moves3) throw new Error('5x5 reduced state is not a legal 3x3 (unexpected)')
  const cfop = solveCfop(invertMoves(moves3).join(' '), 'D')
  if (cfop.rotation) throw new Error('5x5 3x3-stage rotation unsupported')   // face 'D' never rotates
  for (const st of cfop.stages) {
    state = apply5(state, st.moves)
    stages.push({ name: st.name, kind: st.kind, moves: st.moves })
  }
  if (!isSolved(CUBE5, state)) throw new Error('5x5 pipeline finished unsolved')

  for (const st of stages) st.move_count = st.moves.length
  return {
    puzzle: '555',
    stages,
    reduction_moves: stages.filter(s => s.kind === 'centers' || s.kind === 'pairing').reduce((n, s) => n + s.moves.length, 0),
    total_moves: stages.reduce((n, s) => n + s.moves.length, 0),
    solution: stages.flatMap(st => st.moves).join(' '),
    time_ms: performance.now() - t0,
  }
}
