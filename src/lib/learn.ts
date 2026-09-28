// Learn: OLL/PLL cases generated from the CFOP engine's algorithm tables,
// and a small spaced-repetition scheduler.
//
// A case is the state its algorithm solves: the inverse of the (face-move
// expanded) algorithm applied to a solved cube. Its top layer is read off
// the sticker model for the diagram; PLL arrows come from where each
// last-layer piece has to go.

import { OLL_ALGS, PLL_ALGS, expandAlg, applyFull } from '@/lib/solvers/lastlayer'
import { FACES, fromScramble, invertMoves, makeCube, standardLayers } from '@/lib/solvers/cubeN'

export type CaseSet = 'pll' | 'oll'

export interface LLCase {
  key: string          // 'pll:T', 'oll:27'
  set: CaseSet
  name: string         // 'T', 'OLL 27'
  short: string        // grid label: 'T', '27'
  alg: string          // as written (wide moves, rotations)
}

export const CASES: Record<CaseSet, LLCase[]> = {
  pll: Object.entries(PLL_ALGS).map(([n, alg]) => ({ key: `pll:${n}`, set: 'pll', name: `${n}-perm`, short: n, alg })),
  oll: Object.entries(OLL_ALGS).map(([n, alg]) => ({ key: `oll:${n.replace('OLL ', '')}`, set: 'oll', name: n, short: n.replace('OLL ', ''), alg })),
}
export const CASE_BY_KEY: Record<string, LLCase> = Object.fromEntries([...CASES.pll, ...CASES.oll].map(c => [c.key, c]))

/** Inverse of an alg written in human notation (x, r, M… kept as is). */
export function invertAlg(alg: string): string {
  return invertMoves(alg.split(/\s+/).filter(Boolean)).join(' ')
}

// ── Diagram ───────────────────────────────────────────────────────────────────

let cube3: ReturnType<typeof makeCube> | null = null

/** Yellow-on-top colouring (the usual way LL cases are drawn): the solver's
 *  U face shows yellow, F green, R orange, B blue, L red. */
export const DIAGRAM_COLORS: Record<string, string> = {
  U: '#FFD23F', R: '#FF8A2A', F: '#22B45A', D: '#F2F4F7', L: '#FF4B55', B: '#3D7BFF',
}

export interface Diagram {
  top: string[]                 // 9 face letters, row 0 = back
  back: string[]; right: string[]; front: string[]; left: string[]   // 3 each, in drawing order
  arrows: [[number, number], [number, number]][]   // [from cell, to cell] as [row, col]
}

const EDGE_CELL: [number, number][] = [[2, 1], [1, 2], [0, 1], [1, 0]]    // UF UR UB UL
const CORNER_CELL: [number, number][] = [[2, 2], [2, 0], [0, 0], [0, 2]]  // UFR UFL UBL UBR

export function diagramOf(c: LLCase): Diagram {
  cube3 ??= makeCube(3, standardLayers(3, 1, false), false)
  const face = expandAlg(c.alg)
  const state = fromScramble(cube3, invertMoves(face).join(' '))
  const at = (f: string, r: number, col: number) => FACES[state[cube3!.idx(f as never, r, col)]]
  const top = [0, 1, 2].flatMap(r => [0, 1, 2].map(col => at('U', r, col)))
  const d: Diagram = {
    top,
    back: [2, 1, 0].map(col => at('B', 0, col)),      // B is viewed from behind: its col 2 is on the left
    right: [2, 1, 0].map(col => at('R', 0, col)),     // top to bottom = back to front
    front: [0, 1, 2].map(col => at('F', 0, col)),
    left: [0, 1, 2].map(col => at('L', 0, col)),
    arrows: [],
  }
  if (c.set === 'pll') {
    // piece p sits in slot s -> it has to travel s -> p
    const solved = { edges: Array.from({ length: 12 }, (_, i) => i * 2), corners: Array.from({ length: 8 }, (_, i) => i * 3) }
    const s = applyFull(solved, invertMoves(face))
    for (let p = 0; p < 4; p++) {
      const es = Math.floor(s.edges[p] / 2)
      if (es !== p && es < 4) d.arrows.push([EDGE_CELL[es], EDGE_CELL[p]])
      const cs = Math.floor(s.corners[p] / 3)
      if (cs !== p && cs < 4) d.arrows.push([CORNER_CELL[cs], CORNER_CELL[p]])
    }
  }
  return d
}

// ── Spaced repetition ────────────────────────────────────────────────────────

export type Grade = 'again' | 'hard' | 'good' | 'easy'

export interface CardState {
  due: number          // epoch ms
  interval: number     // days
  ease: number
  reps: number
  lapses: number
  introduced: string   // ISO date the card was first seen
  recogMs?: number[]   // recent recognition times
  execMs?: number[]    // recent execution times
}

const DAY = 86_400_000
export const NEW_PER_DAY = 5

export function schedule(prev: CardState | undefined, grade: Grade, now = Date.now()): CardState {
  const s: CardState = prev
    ? { ...prev }
    : { due: now, interval: 0, ease: 2.5, reps: 0, lapses: 0, introduced: new Date(now).toISOString() }
  if (grade === 'again') {
    s.lapses += prev?.reps ? 1 : 0
    s.reps = 0
    s.interval = 0
    s.ease = Math.max(1.3, s.ease - 0.2)
    s.due = now + 60_000
    return s
  }
  if (grade === 'hard') {
    s.interval = s.reps === 0 ? 0.5 : Math.max(1, s.interval * 1.2)
    s.ease = Math.max(1.3, s.ease - 0.15)
  } else if (grade === 'good') {
    s.interval = s.reps === 0 ? 1 : s.reps === 1 ? 3 : Math.round(s.interval * s.ease)
  } else {
    s.interval = s.reps === 0 ? 3 : Math.round(s.interval * s.ease * 1.3)
    s.ease += 0.15
  }
  s.reps += 1
  s.due = now + s.interval * DAY
  return s
}

/** Short hint for a grade button: when the case comes back. */
export function nextHint(prev: CardState | undefined, grade: Grade): string {
  const d = schedule(prev, grade, 0).interval
  if (d === 0) return '1 min'
  if (d < 1) return `${Math.round(d * 24)} h`
  return `${Math.round(d)} d`
}

export type Level = 'new' | 'learning' | 'mastered'
export function levelOf(s: CardState | undefined): Level {
  if (!s || s.reps === 0) return s ? 'learning' : 'new'
  return s.interval >= 7 ? 'mastered' : 'learning'
}

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString()

/** Today's queue: due reviews first (oldest first), then new cases up to
 *  the daily limit. */
export function queueFor(set: CaseSet, cards: Record<string, CardState>, now = Date.now()): { due: LLCase[]; fresh: LLCase[] } {
  const list = CASES[set]
  const due = list.filter(c => cards[c.key] && cards[c.key].due <= now).sort((a, b) => cards[a.key].due - cards[b.key].due)
  const newToday = list.filter(c => cards[c.key] && isToday(cards[c.key].introduced)).length
  const fresh = list.filter(c => !cards[c.key]).slice(0, Math.max(0, NEW_PER_DAY - newToday))
  return { due, fresh }
}

export function avg(xs: number[] | undefined): number | null {
  return xs && xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}
