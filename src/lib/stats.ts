import type { Solve, SessionStats } from '@/types'

export function getEffectiveTime(solve: Solve): number | null {
  if (solve.penalty === 'DNF') return null
  if (solve.penalty === '+2') return solve.time_ms + 2000
  return solve.time_ms
}

export function formatTime(ms: number | null): string {
  if (ms === null) return 'DNF'
  const total = ms / 1000
  if (total >= 60) {
    const mins = Math.floor(total / 60)
    const secs = (total % 60).toFixed(2).padStart(5, '0')
    return `${mins}:${secs}`
  }
  return total.toFixed(2)
}

export function calcAo(solves: Solve[], n: number): number | null {
  if (solves.length < n) return null
  const last = solves.slice(-n)
  const times = last.map(getEffectiveTime)
  const dnfCount = times.filter(t => t === null).length

  if (n <= 5 && dnfCount >= 1) return null
  if (n > 5 && dnfCount >= 2) return null

  const sorted = [...times].sort((a, b) => {
    if (a === null) return 1
    if (b === null) return -1
    return a - b
  })

  const trimmed = sorted.slice(1, -1)
  const valid = trimmed.filter((t): t is number => t !== null)
  if (valid.length === 0) return null
  return valid.reduce((a, b) => a + b, 0) / valid.length
}

export function computeStats(solves: Solve[]): SessionStats {
  const times = solves.map(getEffectiveTime).filter((t): t is number => t !== null)
  return {
    count: solves.length,
    best: times.length ? Math.min(...times) : null,
    worst: times.length ? Math.max(...times) : null,
    mean: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
    ao5: calcAo(solves, 5),
    ao12: calcAo(solves, 12),
    ao50: calcAo(solves, 50),
    ao100: calcAo(solves, 100),
  }
}
