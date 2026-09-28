// The cross lessons' engine. Everything is in the frame the lessons teach:
// white on the bottom, green in front — so the white cross is the D cross
// and scrambles are written for that hold (no rotation). Colours in this
// frame: U yellow, D white, F green, R orange, B blue, L red.
//
// Edges are cube3 sub-states (slot*2 + orientation, slots UF UR UB UL DF DR
// DB DL FR FL BR BL). The white edges live at DF DR DB DL when solved.
// Orientation 0 means the white sticker is on the U/D face (top and bottom
// slots) or on the F/B face (middle-layer slots).

import { ALL_MOVES, EDGE_TRANS, MOVE_FACE, MOVE_INDEX, scrambleToSubstates } from '@/lib/solvers/cube3'
import { crossMoveTable, crossTable, encodeCross } from '@/lib/solvers/cross'

export const SLOT_NAMES = ['UF', 'UR', 'UB', 'UL', 'DF', 'DR', 'DB', 'DL', 'FR', 'FL', 'BR', 'BL'] as const
export type Face = 'U' | 'D' | 'F' | 'B' | 'R' | 'L'

export const COLOUR_NAME: Record<Face, string> = { U: 'yellow', D: 'white', F: 'green', R: 'orange', B: 'blue', L: 'red' }
/** Sticker tokens for this frame (the app's tokens are named by WCA face) */
export const COLOUR_VAR: Record<Face, string> = {
  U: 'var(--st-D)', D: 'var(--st-U)', F: 'var(--st-F)', R: 'var(--st-L)', B: 'var(--st-B)', L: 'var(--st-R)',
}

/** The four white edges, by home slot DF DR DB DL */
export const WHITE_EDGES: readonly number[] = [4, 5, 6, 7]
export const EDGE_SIDE: Face[] = ['F', 'R', 'B', 'L']   // side colour of edge i
export const edgeName = (i: number) => `white-${COLOUR_NAME[EDGE_SIDE[i]]}`

// ── Where an edge is ─────────────────────────────────────────────────────────

export type Layer = 'top' | 'middle' | 'bottom'
export interface Spot {
  slot: number
  layer: Layer
  whiteOn: Face         // face the white sticker points at
  otherOn: Face         // face the side colour points at
}

export function spotOf(sub: number): Spot {
  const slot = sub >> 1
  const ori = sub & 1
  const name = SLOT_NAMES[slot]
  const [a, b] = [name[0] as Face, name[1] as Face]
  const layer: Layer = slot < 4 ? 'top' : slot < 8 ? 'bottom' : 'middle'
  // a = U/D (top/bottom) or F/B (middle): the face orientation 0 refers to
  return ori === 0 ? { slot, layer, whiteOn: a, otherOn: b } : { slot, layer, whiteOn: b, otherOn: a }
}

const faceWord = (f: Face) => COLOUR_NAME[f]

/** Plain-words location, e.g. "top layer, above orange, white facing up". */
export function describe(i: number, sub: number): string {
  const s = spotOf(sub)
  const side = SLOT_NAMES[s.slot][1] as Face
  if (s.layer === 'middle') {
    const [a, b] = SLOT_NAMES[s.slot].split('') as Face[]
    return `middle layer, between ${faceWord(a)} and ${faceWord(b)}, white facing ${faceWord(s.whiteOn)}`
  }
  if (s.layer === 'top') {
    return s.whiteOn === 'U'
      ? `top layer, above ${faceWord(side)}, white facing up`
      : `top layer, above ${faceWord(side)}, white facing out (flipped)`
  }
  if (sub === WHITE_EDGES[i] * 2) return 'home, solved'
  return s.whiteOn === 'D'
    ? `bottom layer, under ${faceWord(side)}, white down but in the wrong slot`
    : `bottom layer, under ${faceWord(side)}, white facing out (flipped)`
}

export const isDown = (sub: number) => (sub >> 1) >= 4 && (sub >> 1) < 8 && (sub & 1) === 0

// ── One edge on its own ──────────────────────────────────────────────────────

const SOLO = new Map<number, Uint8Array>()

/** Moves to take edge i home when nothing else matters (BFS over its 24
 *  places). */
export function soloTable(i: number): Uint8Array {
  const hit = SOLO.get(i)
  if (hit) return hit
  const dist = new Uint8Array(24).fill(255)
  const home = WHITE_EDGES[i] * 2
  dist[home] = 0
  const q = [home]
  for (let h = 0; h < q.length; h++) {
    for (const t of EDGE_TRANS) {
      // edge moves are invertible and the move set is closed under inverse,
      // so BFS forward from home gives the distance to home
      const n = t[q[h]]
      if (dist[n] === 255) { dist[n] = dist[q[h]] + 1; q.push(n) }
    }
  }
  SOLO.set(i, dist)
  return dist
}

export function soloRoute(i: number, sub: number): string[] {
  const dist = soloTable(i)
  const route: string[] = []
  let s = sub
  while (dist[s] > 0) {
    const mi = EDGE_TRANS.findIndex(t => dist[t[s]] === dist[s] - 1)
    route.push(ALL_MOVES[mi])
    s = EDGE_TRANS[mi][s]
  }
  return route
}

// ── The whole cross ──────────────────────────────────────────────────────────

export function crossSubs(scramble: string): number[] {
  const [edges] = scrambleToSubstates(scramble)
  return WHITE_EDGES.map(e => edges[e])
}

export const crossIndex = (subs: readonly number[]) => encodeCross(subs)

export function crossDistance(subs: readonly number[]): number {
  return crossTable('D')[encodeCross(subs)]
}

/** Up to `limit` optimal solutions (all the same length). */
export function optimalCrosses(subs: readonly number[], limit = 12): string[][] {
  const dist = crossTable('D')
  const cm = crossMoveTable()
  const out: string[][] = []
  const path: string[] = []
  const dfs = (s: number, lastFace: number) => {
    if (out.length >= limit) return
    if (dist[s] === 0) { out.push([...path]); return }
    for (let mi = 0; mi < ALL_MOVES.length; mi++) {
      if (MOVE_FACE[mi] === lastFace) continue
      const ns = cm[mi][s]
      if (dist[ns] !== dist[s] - 1) continue
      path.push(ALL_MOVES[mi])
      dfs(ns, MOVE_FACE[mi])
      path.pop()
      if (out.length >= limit) return
    }
  }
  dfs(encodeCross(subs), -1)
  return out
}

export const applyMove = (subs: readonly number[], m: string) => {
  const t = EDGE_TRANS[MOVE_INDEX[m]]
  return subs.map(s => t[s])
}

// ── What each move does ──────────────────────────────────────────────────────

export type StepKind = 'align' | 'setup-bottom' | 'place-two' | 'place' | 'lift' | 'bring' | 'other'
export interface Step {
  move: string
  kind: StepKind
  text: string
  edges: number[]       // which white edges the words are about
}

const list = (ids: number[]) => ids.map(edgeName).join(' and ')

/** Label every move of a cross solution with what it does to the white
 *  edges, by tracking them through it. */
export function labelSteps(start: readonly number[], moves: readonly string[]): Step[] {
  const states = [start.slice()]
  for (const m of moves) states.push(applyMove(states.at(-1)!, m))
  return moves.map((m, k) => {
    const before = states[k], after = states[k + 1]
    const idx = [0, 1, 2, 3]
    const placed = idx.filter(i => !isDown(before[i]) && isDown(after[i]))
    const lifted = idx.filter(i => isDown(before[i]) && !isDown(after[i]))
    const moved = idx.filter(i => before[i] !== after[i])
    if (m[0] === 'D') {
      if (after.every((s, i) => s === WHITE_EDGES[i] * 2)) {
        return { move: m, kind: 'align', text: 'lines the cross up with the centres', edges: [] }
      }
      const next = moves[k + 1]
      if (next) {
        const nb = states[k + 1], na = states[k + 2]
        const coming = idx.filter(i => !isDown(nb[i]) && isDown(na[i]))
        if (coming.length) {
          return { move: m, kind: 'setup-bottom', text: `turns the bottom so ${list(coming)} can drop in next to ${coming.length > 1 ? 'their' : 'its'} neighbours`, edges: coming }
        }
      }
      return { move: m, kind: 'setup-bottom', text: 'turns the bottom to move placed edges out of the way', edges: moved }
    }
    if (placed.length === 1 && !lifted.length) {
      // one turn, two jobs: it also carries another edge to where the next
      // move drops it in (a side turn only reaches one bottom slot, so this
      // is the most one move can do for two edges)
      const nb = states[k + 1], na = states[k + 2]
      const nextPlaced = na ? idx.filter(i => !isDown(nb[i]) && isDown(na[i])) : []
      const helped = moved.filter(i => !placed.includes(i) && nextPlaced.includes(i))
      if (helped.length) {
        return { move: m, kind: 'place-two', text: `places ${list(placed)} and sets up ${list(helped)} for the next move`, edges: [...placed, ...helped] }
      }
    }
    if (placed.length === 1) {
      const extra = lifted.length ? `, lifting ${list(lifted)} for now` : ''
      return { move: m, kind: 'place', text: `places ${list(placed)}${extra}`, edges: [...placed, ...lifted] }
    }
    if (lifted.length) {
      return { move: m, kind: 'lift', text: `lifts ${list(lifted)} out, to put ${lifted.length > 1 ? 'them' : 'it'} back better`, edges: lifted }
    }
    if (moved.length) {
      // name only the edges the next move places: that is why this move is here
      const nb = states[k + 1], na = states[k + 2]
      const target = na ? moved.filter(i => !isDown(nb[i]) && isDown(na[i])) : []
      if (target.length) {
        const text = m[0] === 'U'
          ? `turns the top so ${list(target)} ${target.length > 1 ? 'sit' : 'sits'} above ${target.length > 1 ? 'their slots' : 'its slot'}`
          : `sets up ${list(target)} for the next move`
        return { move: m, kind: 'bring', text, edges: target }
      }
      const text = m[0] === 'U' ? 'turns the top to set up the moves after it'
        : moved.length === 1 ? `brings ${list(moved)} into position` : `moves ${list(moved)} into position`
      return { move: m, kind: 'bring', text, edges: moved }
    }
    return { move: m, kind: 'other', text: 'sets up the next move', edges: [] }
  })
}

// ── Scrambles ────────────────────────────────────────────────────────────────

const FACES = 'UDFBRL'
const SUFFIX = ['', "'", '2']
const rnd = (n: number) => Math.floor(Math.random() * n)

export function randomMoves(n: number): string[] {
  const out: string[] = []
  let last = -1, prev = -1
  while (out.length < n) {
    const f = rnd(6)
    // no same face twice, and no opposite-face triple like U D U
    if (f === last || (f >> 1 === last >> 1 && f === prev)) continue
    out.push(FACES[f] + SUFFIX[rnd(3)])
    prev = last
    last = f
  }
  return out
}

export function invert(moves: readonly string[]): string[] {
  return [...moves].reverse().map(m => (m.endsWith("'") ? m[0] : m.endsWith('2') ? m : m + "'"))
}

/** Moves that leave every white edge where it is but mix everything else:
 *  blocks of X U^k X' with X a side quarter turn. */
function crossSafeNoise(blocks = 6): string[] {
  const out: string[] = []
  for (let b = 0; b < blocks; b++) {
    const x = 'FBRL'[rnd(4)] + (rnd(2) ? "'" : '')
    const u = 'U' + SUFFIX[rnd(3)]
    out.push(x, u, invert([x])[0])
    if (rnd(2)) out.push('U' + SUFFIX[rnd(3)])
  }
  return simplify(out)
}

/** Merge same-face neighbours (U U' → nothing, R R → R2). */
export function simplify(moves: readonly string[]): string[] {
  const amount = (m: string) => (m.endsWith("'") ? 3 : m.endsWith('2') ? 2 : 1)
  const out: string[] = []
  for (const m of moves) {
    const top = out.at(-1)
    if (top && top[0] === m[0]) {
      const a = (amount(top) + amount(m)) % 4
      out.pop()
      if (a) out.push(m[0] + ['', '', '2', "'"][a])
    } else out.push(m)
  }
  return out
}

export interface CrossCase {
  scramble: string        // for white on the bottom, green in front
  subs: number[]          // white edges after it
  solutions: string[][]   // optimal, the one to show first
  length: number
}

/** A full random cross whose optimum is min..max moves long. */
export function fullCase(min: number, max: number, want?: (c: CrossCase) => boolean, tries = 400): CrossCase {
  let fallback: CrossCase | null = null
  for (let t = 0; t < tries; t++) {
    const scramble = randomMoves(22).join(' ')
    const subs = crossSubs(scramble)
    const length = crossDistance(subs)
    if (length < min || length > max) continue
    const c: CrossCase = { scramble, subs, solutions: optimalCrosses(subs), length }
    if (!want || want(c)) return c
    fallback ??= c
  }
  return fallback ?? fullCase(min, max)
}

/** Some white edges out (the rest solved), optimum min..max. */
export function partialCase(out: number, min: number, max: number, want?: (c: CrossCase) => boolean, tries = 600): CrossCase {
  let fallback: CrossCase | null = null
  for (let t = 0; t < tries; t++) {
    const which = [0, 1, 2, 3].sort(() => Math.random() - 0.5).slice(0, out)
    const subs = WHITE_EDGES.map(e => e * 2)
    const used = new Set(WHITE_EDGES.filter((_, i) => !which.includes(i)))
    for (const i of which) {
      let s: number
      do s = rnd(24)
      while (used.has(s >> 1) || s === WHITE_EDGES[i] * 2)
      used.add(s >> 1)
      subs[i] = s
    }
    const length = crossDistance(subs)
    if (length < min || length > max) continue
    const solutions = optimalCrosses(subs)
    const setup = invert(solutions[0])
    const scramble = simplify([...crossSafeNoise(), ...setup]).join(' ')
    const c: CrossCase = { scramble, subs: crossSubs(scramble), solutions, length }
    if (!want || want(c)) return c
    fallback ??= c
  }
  return fallback ?? partialCase(out, min, max)
}

/** Put first the optimal solution whose labelled steps satisfy `pred`. */
export function preferSolution(c: CrossCase, pred: (steps: Step[]) => boolean): CrossCase | null {
  const k = c.solutions.findIndex(s => pred(labelSteps(c.subs, s)))
  if (k < 0) return null
  const solutions = [c.solutions[k], ...c.solutions.filter((_, j) => j !== k)]
  return { ...c, solutions }
}
