// 4x4 reduction, stages 1-2: centres and edge pairing (port of cubiq-ml
// solver444.py).
//
// Centres: outer moves only spin a face's own 2x2 block, so centre colours
// are driven by the 18 inner-slice moves. Each face is solved by IDA* over
// slice + outer moves; the heuristic is the max over the target face and
// every already-solved face of an exact pattern database (positions of that
// colour's 4 stickers among the 24 centre slots, C(24,4) = 10,626 states).
//
// Edge pairing: outer moves preserve centres AND pairing, so they are free
// setup moves. Pairing macros (slice + outer body + slice') are DISCOVERED
// by search and kept iff they merge wings from two dedge positions. To pair
// a dedge: position its two wings on a macro's source slots (optimal BFS
// over outer moves), simulate, and take the cheapest strict improvement.

import { FACES } from './cubeN'
import {
  CENTER_IDX, DEDGES, SOLVED4, WING_SLOTS, apply4, centersSolved, dedgePaired, pairedCount,
} from './cube444'
import { CUBE4 } from './cube444'
import { pySetOrder } from './pyset'

// ── Move groups ───────────────────────────────────────────────────────────────
const SUFFIXES = ['', "'", '2']
const OUTER_MOVES = FACES.flatMap(f => SUFFIXES.map(s => f + s))                  // 18
const SLICE_MOVES = FACES.flatMap(f => SUFFIXES.map(s => '2' + f + s))            // 18
const SLICE_QUARTERS = FACES.flatMap(f => ['', "'"].map(s => '2' + f + s))        // 12
const SLICE_SANDWICH = [...SLICE_QUARTERS, ...FACES.map(f => '2' + f + '2')]

const LAYER: Record<string, string> = Object.fromEntries(
  [...OUTER_MOVES, ...SLICE_MOVES].map(m => [m, m.replace(/['2]+$/, '')]))
const AXIS_OF_FACE: Record<string, number> = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 }
const LAYER_ID: Record<string, number> = {
  U: 0, '2U': 1, '2D': 2, D: 3, R: 0, '2R': 1, '2L': 2, L: 3, F: 0, '2F': 1, '2B': 2, B: 3,
}
const MOVE_AXIS: Record<string, number> = Object.fromEntries(
  [...OUTER_MOVES, ...SLICE_MOVES].map(m => [m, AXIS_OF_FACE[LAYER[m].replace(/^2/, '')]]))
const MOVE_LAYER_ID: Record<string, number> = Object.fromEntries(
  [...OUTER_MOVES, ...SLICE_MOVES].map(m => [m, LAYER_ID[LAYER[m]]]))

export function inverseMove(m: string): string {
  if (m.endsWith("'")) return m.slice(0, -1)
  if (m.endsWith('2')) return m
  return m + "'"
}

// ── Centre-slot permutations (24 global centre stickers) ─────────────────────
const CENTER_GLOBAL = FACES.flatMap(f => CENTER_IDX[f])
const CENTER_POS = new Map(CENTER_GLOBAL.map((g, i) => [g, i]))
// Outer moves matter too: they rotate a face's own centre stickers, which
// changes the state whenever that face holds mixed colours.
const CENTER_SEARCH_MOVES = [...SLICE_MOVES, ...OUTER_MOVES]
const CPERM: Record<string, number[]> = Object.fromEntries(CENTER_SEARCH_MOVES.map(m => {
  const p = CUBE4.moves.get(m)!
  return [m, CENTER_GLOBAL.map(g => CENTER_POS.get(p[g])!)]
}))

// A centre state is kept as 6 colour masks (bit i = colour sits in slot i);
// moves permute masks through per-move byte lookup tables.
const MASK_LUT: Record<string, Int32Array> = Object.fromEntries(CENTER_SEARCH_MOVES.map(move => {
  const perm = CPERM[move]            // slot j receives from perm[j]
  const lut = new Int32Array(3 * 256)
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
  return [move, lut]
}))

const permuteMask = (mask: number, lut: Int32Array) =>
  lut[mask & 255] | lut[256 + ((mask >> 8) & 255)] | lut[512 + ((mask >> 16) & 255)]

// Combinatorial rank of a 4-of-24 mask (0..10,625)
const BINOM: number[][] = Array.from({ length: 25 }, (_, n) =>
  Array.from({ length: 5 }, (_, k) => (k > n ? 0 : k === 0 ? 1 : binom(n, k))))
function binom(n: number, k: number): number {
  let r = 1
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
  return r
}
function maskRank(mask: number): number {
  let r = 0
  for (let k = 1; mask; k++) {
    const low = mask & -mask
    r += BINOM[31 - Math.clz32(low)][k]
    mask ^= low
  }
  return r
}

// ── Centre PDBs: exact distance to "this colour's 4 stickers on face f" ─────
const CENTER_PDB = new Map<number, Uint8Array>()

function centerPdb(faceIdx: number): Uint8Array {
  const cached = CENTER_PDB.get(faceIdx)
  if (cached) return cached
  const goal = 0b1111 << (faceIdx * 4)
  const dist = new Uint8Array(10626).fill(255)
  dist[maskRank(goal)] = 0
  const luts = CENTER_SEARCH_MOVES.map(m => MASK_LUT[m])
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
  CENTER_PDB.set(faceIdx, dist)
  return dist
}

function colorMask(centers: ArrayLike<number>, color: number): number {
  let m = 0
  for (let i = 0; i < 24; i++) if (centers[i] === color) m |= 1 << i
  return m
}

/** IDA*: put `target` colour on face `target` while `keep` faces stay solved. */
function solveOneCenter(masks: number[], target: number, keep: number[], maxDepth = 16): string[] | null {
  const faces = [...keep, target]
  const pdbs = faces.map(f => centerPdb(f))
  const goals = faces.map(f => 0b1111 << (f * 4))
  const path: string[] = []
  const moves = CENTER_SEARCH_MOVES.map(m => ({ m, lut: MASK_LUT[m], axis: MOVE_AXIS[m], lid: MOVE_LAYER_ID[m] }))
  const dfs = (ms: number[], depth: number, bound: number, lastAxis: number, lastLid: number): boolean => {
    let h = 0
    for (let i = 0; i < faces.length; i++) {
      const d = pdbs[i][maskRank(ms[faces[i]])]
      if (d > h) h = d
    }
    if (depth + h > bound) return false
    if (h === 0 && faces.every((f, i) => ms[f] === goals[i])) return true
    for (const { m, lut, axis, lid } of moves) {
      // same layer twice is redundant; commuting layers only in order
      if (axis === lastAxis && lid <= lastLid) continue
      path.push(m)
      if (dfs(ms.map(x => permuteMask(x, lut)), depth + 1, bound, axis, lid)) return true
      path.pop()
    }
    return false
  }
  for (let bound = 0; bound <= maxDepth; bound++) {
    path.length = 0
    if (dfs(masks, 0, bound, -1, -1)) return [...path]
  }
  return null
}

export interface Stage { name: string; kind: string; moves: string[]; move_count?: number }

/** Solve all 6 centres (fixed colour scheme). */
export function solveCenters(state: Int8Array): Stage[] | null {
  const centers = CENTER_GLOBAL.map(g => state[g])
  let masks = FACES.map((_, f) => colorMask(centers, f))
  const stages: Stage[] = []
  const solved: number[] = []
  for (const target of ['U', 'D', 'F', 'R', 'B'].map(f => FACES.indexOf(f as never))) {   // L follows
    const moves = solveOneCenter(masks, target, solved)
    if (!moves) return null
    for (const m of moves) masks = masks.map(x => permuteMask(x, MASK_LUT[m]))
    solved.push(target)
    stages.push({ name: `${FACES[target]} center`, kind: 'centers', moves })
  }
  return stages
}

// ── Wing-slot permutations: WPERM[m][dest] = src slot ────────────────────────
const WING_STICKER_POS = new Map<number, number>()
WING_SLOTS.forEach(([a, b], wi) => { WING_STICKER_POS.set(a, wi); WING_STICKER_POS.set(b, wi) })
const WIDE_MOVES = FACES.flatMap(f => SUFFIXES.map(s => f + 'w' + s))

const WPERM: Record<string, number[]> = Object.fromEntries(
  [...OUTER_MOVES, ...SLICE_MOVES, ...WIDE_MOVES].map(m => {
    const p = CUBE4.moves.get(m)!
    return [m, WING_SLOTS.map(([a]) => WING_STICKER_POS.get(p[a])!)]
  }))
// where does the wing at slot i END UP after the move?
const WPERM_INV: Record<string, number[]> = Object.fromEntries(Object.entries(WPERM).map(([m, wp]) => {
  const inv = new Array<number>(24)
  wp.forEach((src, i) => { inv[src] = i })
  return [m, inv]
}))

const DEDGE_OF = new Map<number, number>()
DEDGES.forEach(([w1, w2], di) => { DEDGE_OF.set(w1, di); DEDGE_OF.set(w2, di) })

// ── Pairing macro discovery ───────────────────────────────────────────────────

const EXTRA_BODIES = [
  ['R', 'U', "R'", 'F', "R'", "F'", 'R'],   // flip insert (last-two-edges)
  ["L'", "U'", 'L', "F'", 'L', 'F', "L'"],
]
// OLL parity flips one dedge in place (the only fix for a flipped-in-place
// dedge); PLL parity swaps two dedges. Both preserve centres.
export const OLL_PARITY = "2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2".split(' ')
export const PLL_PARITY = '2R2 U2 2R2 Uw2 2R2 Uw2'.split(' ')

function wingPermOf(seq: readonly string[]): number[] {
  let perm = [...Array(24).keys()]
  for (const m of seq) {
    const wp = WPERM[m]
    perm = wp.map(src => perm[src])
  }
  return perm
}

type Merge = [dest: number, s1: number, s2: number]
interface Macro { seq: string[]; merges: Merge[]; flips: Merge[]; l2e: boolean }

let MACROS: Macro[] | null = null

function discoverMacros(maxBody = 3, cap = 200): Macro[] {
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
  bodies.push(...EXTRA_BODIES)

  const candidates: string[][] = []
  for (const s of SLICE_SANDWICH) for (const body of bodies) candidates.push([s, ...body, inverseMove(s)])
  candidates.push(OLL_PARITY, PLL_PARITY)

  const seenPerms = new Set<string>()
  const macros: Macro[] = []
  for (const seq of candidates) {
    // centres-safety is NOT automatic: the body can rotate displaced ring
    // centres out of the closing slice's return path — check on solved
    const after = apply4(SOLVED4, seq)
    if (!centersSolved(after)) continue
    const perm = wingPermOf(seq)
    const pk = perm.join(',')
    if (seenPerms.has(pk)) continue
    const merges: Merge[] = [], flips: Merge[] = []
    DEDGES.forEach(([w1, w2], di) => {
      const s1 = perm[w1], s2 = perm[w2]
      if (DEDGE_OF.get(s1) !== DEDGE_OF.get(s2)) merges.push([di, s1, s2])
      else if (!dedgePaired(after, di)) flips.push([di, s1, s2])
    })
    if (!merges.length && !flips.length) continue
    // l2e-capable: two merge destinations drawing from the same 2 positions
    let l2e = false
    for (let ii = 0; ii < merges.length; ii++) {
      for (let jj = 0; jj < merges.length; jj++) {
        if (ii === jj) continue
        const [, x1, x2] = merges[ii], [, y1, y2] = merges[jj]
        const a = [DEDGE_OF.get(x1), DEDGE_OF.get(x2)], b = [DEDGE_OF.get(y1), DEDGE_OF.get(y2)]
        if (new Set([x1, x2, y1, y2]).size === 4 && sameSet(a, b)) l2e = true
      }
    }
    seenPerms.add(pk)
    macros.push({ seq, merges, flips, l2e })
  }
  macros.sort((a, b) => a.seq.length - b.seq.length)
  // keep flip- and l2e-capable macros even past the length cap
  const kept = macros.slice(0, cap)
  const extras = macros.slice(cap).filter(m => m.flips.length || m.l2e)
  MACROS = [...kept, ...extras.slice(0, 60)]
  return MACROS
}

function sameSet<T>(a: T[], b: T[]): boolean {
  const sa = new Set(a), sb = new Set(b)
  return sa.size === sb.size && [...sa].every(x => sb.has(x))
}

// ── Optimal wing positioning over outer moves (552-state BFS) ────────────────
// A full BFS tree per start pair, cached: its parent pointers equal those
// of an early-exit BFS, so paths match the original search exactly.

const BFS_TREES = new Map<number, [Int16Array, Int8Array, Int8Array]>()   // prev, move, depth

function wingTree(from0: number, from1: number): [Int16Array, Int8Array, Int8Array] {
  const start = from0 * 24 + from1
  const cached = BFS_TREES.get(start)
  if (cached) return cached
  const prev = new Int16Array(576).fill(-1)
  const move = new Int8Array(576).fill(-1)
  const depth = new Int8Array(576).fill(-1)
  const invs = OUTER_MOVES.map(m => WPERM_INV[m])
  prev[start] = start
  depth[start] = 0
  const queue = [start]
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head]
    const a = Math.floor(k / 24), b = k % 24
    for (let mi = 0; mi < invs.length; mi++) {
      const nk = invs[mi][a] * 24 + invs[mi][b]
      if (depth[nk] !== -1) continue
      prev[nk] = k
      move[nk] = mi
      depth[nk] = depth[k] + 1
      queue.push(nk)
    }
  }
  const tree: [Int16Array, Int8Array, Int8Array] = [prev, move, depth]
  BFS_TREES.set(start, tree)
  return tree
}

function positionWings(from: [number, number], to: [number, number], maxDepth = 6): string[] | null {
  const [prev, move, depth] = wingTree(from[0], from[1])
  let k = to[0] * 24 + to[1]
  if (depth[k] < 0 || depth[k] > maxDepth) return null
  const path: string[] = []
  while (depth[k] > 0) {
    path.push(OUTER_MOVES[move[k]])
    k = prev[k]
  }
  return path.reverse()
}

function wingSlotsShowing(state: Int8Array, c1: number, c2: number): number[] {
  const out: number[] = []
  WING_SLOTS.forEach(([a, b], wi) => {
    const x = state[a], y = state[b]
    if ((x === c1 && y === c2) || (x === c2 && y === c1)) out.push(wi)
  })
  return out
}

/** The colour pairs of wings sitting in unpaired positions, in the order a
 *  Python set of frozensets iterates them (tie-breaking depends on it). */
function unpairedColorsets(cur: Int8Array): [number, number][] {
  const sets: [number, number][] = []
  for (let d = 0; d < 12; d++) {
    if (dedgePaired(cur, d)) continue
    for (const w of DEDGES[d]) {
      const [a, b] = WING_SLOTS[w]
      const x = cur[a], y = cur[b]
      sets.push(x < y ? [x, y] : [y, x])
    }
  }
  return pySetOrder(sets)
}

interface Candidate { moves: string[]; cost: number; gain: number; state: Int8Array }

const stateKey = (s: Int8Array) => s.join('')

/** Best (moves, gain, state) candidate with gain >= minGain. With minGain 0,
 *  pure reshapes are allowed (endgame local optima); `avoid` holds visited
 *  states to prevent cycles. */
function pairingCandidates(cur: Int8Array, macros: Macro[], base: number, minGain = 1, avoid: Set<string> | null = null): Candidate | null {
  const targets: number[][] = []
  for (const [c1, c2] of unpairedColorsets(cur)) {
    const slots = wingSlotsShowing(cur, c1, c2)
    if (slots.length === 2) targets.push(slots)
  }
  let best: Candidate | null = null
  const prune = minGain >= 1
  const memo = new Map<string, string[] | null>()
  for (const macro of macros) {   // sorted by length ascending
    if (prune && best && best.cost <= macro.seq.length) break   // setup >= 0
    for (const [, src1, src2] of [...macro.merges, ...macro.flips]) {
      for (const slots of targets) {
        for (const assign of [[slots[0], slots[1]], [slots[1], slots[0]]] as [number, number][]) {
          const k = `${assign}|${src1},${src2}`
          if (!memo.has(k)) memo.set(k, positionWings(assign, [src1, src2]))
          const setup = memo.get(k)!
          if (!setup) continue
          const total = [...setup, ...macro.seq]
          if (prune && best && total.length >= best.cost) continue
          const trial = apply4(cur, total)
          const gain = pairedCount(trial) - base
          if (gain >= minGain && centersSolved(trial)) {
            if (gain === 0 && (avoid === null || avoid.has(stateKey(trial)))) continue
            // prefer higher gain, then fewer moves
            if (!best || -gain < -best.gain || (gain === best.gain && total.length < best.cost)) {
              best = { moves: total, cost: total.length, gain, state: trial }
            }
          }
        }
      }
    }
  }
  return best
}

// ── Last-two-edges: simultaneous double merge ────────────────────────────────

const DIST2_CACHE = new Map<number, Map<number, number>>()

/** Exact distance (outer moves) from any ordered wing-slot pair to target. */
function dist2Table(t0: number, t1: number): Map<number, number> {
  const tk = t0 * 24 + t1
  const cached = DIST2_CACHE.get(tk)
  if (cached) return cached
  const dist = new Map<number, number>([[tk, 0]])
  let frontier = [tk]
  while (frontier.length) {
    const nxt: number[] = []
    for (const k of frontier) {
      const u = Math.floor(k / 24), v = k % 24
      for (const m of OUTER_MOVES) {
        const wp = WPERM[m]
        const pre = wp[u] * 24 + wp[v]
        if (!dist.has(pre)) {
          dist.set(pre, dist.get(k)! + 1)
          nxt.push(pre)
        }
      }
    }
    frontier = nxt
  }
  DIST2_CACHE.set(tk, dist)
  return dist
}

/** Outer-move sequence taking 4 wings to 4 slots simultaneously (IDA* with
 *  the max of two exact pair-distance tables). */
function positionFour(from: number[], to: number[], maxDepth = 9): string[] | null {
  const dA = dist2Table(to[0], to[1])
  const dB = dist2Table(to[2], to[3])
  if (!dA.has(from[0] * 24 + from[1]) || !dB.has(from[2] * 24 + from[3])) return null
  const path: string[] = []
  const h = (s: number[]) => Math.max(dA.get(s[0] * 24 + s[1])!, dB.get(s[2] * 24 + s[3])!)
  const dfs = (s: number[], depth: number, bound: number, lastLayer: string): boolean => {
    const hh = h(s)
    if (depth + hh > bound) return false
    if (hh === 0) return true
    for (const m of OUTER_MOVES) {
      if (LAYER[m] === lastLayer) continue
      const inv = WPERM_INV[m]
      path.push(m)
      if (dfs([inv[s[0]], inv[s[1]], inv[s[2]], inv[s[3]]], depth + 1, bound, LAYER[m])) return true
      path.pop()
    }
    return false
  }
  for (let bound = 0; bound <= maxDepth; bound++) {
    path.length = 0
    if (dfs(from, 0, bound, '')) return [...path]
  }
  return null
}

/** Fix two broken dedges at once: place both dedges' wings on a macro's two
 *  merge destinations and apply it. */
function l2eCandidate(cur: Int8Array, macros: Macro[], base: number): Candidate | null {
  const broken: [number, number][] = []
  for (const [c1, c2] of unpairedColorsets(cur)) {
    const slots = wingSlotsShowing(cur, c1, c2)
    if (slots.length === 2) broken.push([slots[0], slots[1]])
  }
  if (broken.length < 2) return null
  // outer moves carry a position's two slots together, so our 4 wings can
  // only reach source quadruples from exactly 2 positions, same interleaving
  const X = broken[0]
  let Y = broken[1]
  if (DEDGE_OF.get(Y[0]) !== DEDGE_OF.get(X[0])) Y = [Y[1], Y[0]]
  if (DEDGE_OF.get(Y[0]) !== DEDGE_OF.get(X[0]) || DEDGE_OF.get(Y[1]) !== DEDGE_OF.get(X[1])) return null

  for (const macro of macros) {
    if (!macro.l2e) continue
    for (let i = 0; i < macro.merges.length; i++) {
      for (let j = 0; j < macro.merges.length; j++) {
        if (i === j) continue
        const [, a1, a2] = macro.merges[i]
        const [, b1, b2] = macro.merges[j]
        if (new Set([a1, a2, b1, b2]).size !== 4) continue
        if (!sameSet([DEDGE_OF.get(a1), DEDGE_OF.get(a2)], [DEDGE_OF.get(b1), DEDGE_OF.get(b2)])) continue
        const bb = DEDGE_OF.get(b1) === DEDGE_OF.get(a1) ? [b1, b2] : [b2, b1]
        for (const [xs, ys] of [[[X[0], X[1]], [Y[0], Y[1]]], [[X[1], X[0]], [Y[1], Y[0]]],
          [[Y[0], Y[1]], [X[0], X[1]]], [[Y[1], Y[0]], [X[1], X[0]]]]) {
          const setup = positionFour([xs[0], xs[1], ys[0], ys[1]], [a1, a2, bb[0], bb[1]], 7)
          if (!setup) continue
          const total = [...setup, ...macro.seq]
          const trial = apply4(cur, total)
          if (pairedCount(trial) > base && centersSolved(trial)) {
            return { moves: total, cost: total.length, gain: pairedCount(trial) - base, state: trial }
          }
        }
      }
    }
  }
  return null
}

/** Pair all 12 dedges. Returns stage dicts (one per pairing step). */
export function solvePairing(state: Int8Array, maxSteps = 30): Stage[] | null {
  const macros = discoverMacros()
  const stages: Stage[] = []
  let cur = state
  let shuffles = 0
  const visited = new Set<string>()
  for (let step = 0; step < maxSteps; step++) {
    const base = pairedCount(cur)
    if (base === 12) return stages
    let best = pairingCandidates(cur, macros, base)
    // endgame: fix two broken dedges simultaneously (double merge)
    if (!best) best = l2eCandidate(cur, macros, base)
    if (!best) {
      // last resort: a zero-gain reshape, guarded against cycles
      if (shuffles >= 6) return null
      shuffles++
      visited.add(stateKey(cur))
      best = pairingCandidates(cur, macros, base, 0, visited)
      if (!best) return null
      cur = best.state
      stages.push({ name: 'reshape edges', kind: 'pairing', moves: best.moves })
      continue
    }
    cur = best.state
    stages.push({ name: `pair edges (${base} → ${base + best.gain})`, kind: 'pairing', moves: best.moves })
  }
  return null
}
