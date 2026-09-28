// Progress-page computations (pure). Times are effective ms (+2 applied,
// DNF = null) throughout.

import type { Solve } from '@/types'
import { calcAo, getEffectiveTime } from '@/lib/stats'

export type Range = '7d' | '30d' | 'all'
const DAY = 86_400_000

export function rangeStart(range: Range, now = Date.now()): number {
  return range === '7d' ? now - 7 * DAY : range === '30d' ? now - 30 * DAY : -Infinity
}

/** Indices (into the full list) of solves inside the range. */
export function rangeIndices(solves: Solve[], range: Range, now = Date.now()): number[] {
  const from = rangeStart(range, now)
  const out: number[] = []
  solves.forEach((s, i) => { if (Date.parse(s.created_at) >= from) out.push(i) })
  return out
}

/** ao-n ending at every index (null until n solves / DNF average). */
export function rollingAo(solves: Solve[], n: number): (number | null)[] {
  return solves.map((_, i) => (i + 1 < n ? null : calcAo(solves.slice(i + 1 - n, i + 1), n)))
}

/** Running best single up to each index. */
export function runningBest(solves: Solve[]): (number | null)[] {
  let best: number | null = null
  return solves.map(s => {
    const t = getEffectiveTime(s)
    if (t !== null && (best === null || t < best)) best = t
    return best
  })
}

export interface Summary {
  count: number
  best: number | null
  bestAt: string | null
  bestAo5: number | null
  bestAo12: number | null
  mean: number | null
  dnfRate: number
}

export function summarize(solves: Solve[], idx: number[], ao5: (number | null)[], ao12: (number | null)[]): Summary {
  let best: number | null = null, bestAt: string | null = null, sum = 0, valid = 0, dnf = 0
  let b5: number | null = null, b12: number | null = null
  for (const i of idx) {
    const t = getEffectiveTime(solves[i])
    if (t === null) dnf++
    else {
      sum += t; valid++
      if (best === null || t < best) { best = t; bestAt = solves[i].created_at }
    }
    if (ao5[i] !== null && (b5 === null || ao5[i]! < b5)) b5 = ao5[i]
    if (ao12[i] !== null && (b12 === null || ao12[i]! < b12)) b12 = ao12[i]
  }
  return { count: idx.length, best, bestAt, bestAo5: b5, bestAo12: b12, mean: valid ? sum / valid : null, dnfRate: idx.length ? dnf / idx.length : 0 }
}

/** Same-length window immediately before the range (for deltas). */
export function previousIndices(solves: Solve[], range: Range, now = Date.now()): number[] {
  if (range === 'all') return []
  const span = range === '7d' ? 7 * DAY : 30 * DAY
  const to = now - span, from = to - span
  const out: number[] = []
  solves.forEach((s, i) => { const t = Date.parse(s.created_at); if (t >= from && t < to) out.push(i) })
  return out
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function solvesPerDay(solves: Solve[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const s of solves) {
    const k = dayKey(new Date(s.created_at))
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

/** Consecutive practice days ending today (or yesterday, if today is still empty). */
export function streak(perDay: Map<string, number>, now = new Date()): number {
  const d = new Date(now)
  if (!perDay.get(dayKey(d))) d.setDate(d.getDate() - 1)
  let n = 0
  while (perDay.get(dayKey(d))) { n++; d.setDate(d.getDate() - 1) }
  return n
}

/** The last `weeks` weeks as columns of 7 days (Mon..Sun), oldest first. */
export function heatmapWeeks(weeks: number, now = new Date()): { key: string; date: Date; future: boolean }[][] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const mondayOffset = (today.getDay() + 6) % 7
  const start = new Date(today)
  start.setDate(today.getDate() - mondayOffset - (weeks - 1) * 7)
  const cols = []
  for (let w = 0; w < weeks; w++) {
    const col = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(start)
      date.setDate(start.getDate() + w * 7 + d)
      col.push({ key: dayKey(date), date, future: date > today })
    }
    cols.push(col)
  }
  return cols
}

/** A readable bin width for a histogram spanning `span` ms. */
export function niceStep(span: number, targetBins = 14): number {
  const raw = span / targetBins
  const steps = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 30000, 60000]
  return steps.find(s => s >= raw) ?? 60000
}

export function relativeTime(iso: string, now = Date.now()): string {
  const s = Math.round((now - Date.parse(iso)) / 1000)
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d} d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
