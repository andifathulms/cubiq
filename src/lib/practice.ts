// Practice-screen helpers: scramble presentation and record detection.
// Pure functions — the components stay presentational.

import type { Solve } from '@/types'
import { calcAo, getEffectiveTime } from '@/lib/stats'

export const PUZZLES: { id: string; label: string; short: string }[] = [
  { id: '333', label: '3×3', short: '3×3' },
  { id: '222', label: '2×2', short: '2×2' },
  { id: '444', label: '4×4', short: '4×4' },
  { id: '555', label: '5×5', short: '5×5' },
  { id: '666', label: '6×6', short: '6×6' },
  { id: '777', label: '7×7', short: '7×7' },
  { id: 'pyram', label: 'Pyraminx', short: 'Pyra' },
  { id: 'skewb', label: 'Skewb', short: 'Skewb' },
  { id: 'minx', label: 'Megaminx', short: 'Mega' },
  { id: 'sq1', label: 'Square-1', short: 'Sq-1' },
]
export const PUZZLE_LABEL: Record<string, string> = Object.fromEntries(PUZZLES.map(p => [p.id, p.label]))

const CUBES = new Set(['222', '333', '444', '555', '666', '777'])

export interface ScrambleToken {
  text: string
  face: string | null   // U D F B R L for cube puzzles, else null (neutral chip)
}

/** Face a cube move turns: 'R', "Rw'", '2R', '3Fw2' -> R. */
function cubeFace(tok: string): string | null {
  const m = tok.match(/^\d*([UDFBRL])/)
  return m ? m[1] : null
}

/** Scramble split into reading groups: fives for cubes and other twisty
 *  puzzles, one WCA line (ending in U/U') for Megaminx, twist + slash pairs
 *  for Square-1. */
export function groupScramble(scramble: string, puzzle: string): ScrambleToken[][] {
  const s = scramble.trim()
  if (!s) return []
  if (puzzle === 'sq1') {
    // "(1,0) / (-1,2) / …" -> tokens "(1,0) /"
    const parts = s.match(/\(\s*-?\d+\s*,\s*-?\d+\s*\)\s*\/?|\//g) ?? []
    const toks = parts.map(p => ({ text: p.replace(/\s+/g, ' ').replace(/\s*\/$/, ' /').trim(), face: null }))
    return chunk(toks, 4)
  }
  const raw = s.split(/\s+/)
  if (puzzle === 'minx') {
    const groups: ScrambleToken[][] = []
    let cur: ScrambleToken[] = []
    for (const t of raw) {
      cur.push({ text: t, face: null })
      if (t === 'U' || t === "U'") { groups.push(cur); cur = [] }
    }
    if (cur.length) groups.push(cur)
    return groups
  }
  const toks = raw.map(t => ({ text: t, face: CUBES.has(puzzle) ? cubeFace(t) : null }))
  return chunk(toks, 5)
}

function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n))
  return out
}

export function moveCount(scramble: string, puzzle: string): number {
  if (puzzle === 'sq1') return (scramble.match(/\//g) ?? []).length
  return scramble.trim() ? scramble.trim().split(/\s+/).length : 0
}

/** Best rolling average of n over the whole history (null if none). */
export function bestAo(solves: Solve[], n: number): number | null {
  let best: number | null = null
  for (let i = n; i <= solves.length; i++) {
    const a = calcAo(solves.slice(i - n, i), n)
    if (a !== null && (best === null || a < best)) best = a
  }
  return best
}

export interface Records { single: boolean; ao5: boolean; ao12: boolean }

/** Which records the LAST solve set, compared with everything before it.
 *  The first solve of a session sets nothing (nothing to beat). */
export function recordsOfLast(solves: Solve[]): Records {
  const none = { single: false, ao5: false, ao12: false }
  if (solves.length < 2) return none
  const prev = solves.slice(0, -1)
  const last = getEffectiveTime(solves[solves.length - 1])
  const prevTimes = prev.map(getEffectiveTime).filter((t): t is number => t !== null)
  const single = last !== null && prevTimes.length > 0 && last < Math.min(...prevTimes)
  const beats = (n: number) => {
    if (solves.length < n + 1) return false
    const now = calcAo(solves, n)
    const before = bestAo(prev, n)
    return now !== null && before !== null && now < before
  }
  return { single, ao5: beats(5), ao12: beats(12) }
}

export function isToday(iso: string): boolean {
  const d = new Date(iso), now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

/** Screen-reader / toast text for a time in ms. */
export function spokenTime(ms: number | null): string {
  if (ms === null) return 'DNF'
  return `${(ms / 1000).toFixed(2)} seconds`
}
