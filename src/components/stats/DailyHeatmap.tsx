'use client'
import { useMemo } from 'react'
import { useCubiqStore } from '@/store'
import { getEffectiveTime, formatTime } from '@/lib/stats'

interface DayData {
  date: string        // YYYY-MM-DD
  count: number
  best: number | null
  mean: number | null
}

function buildDayMap(solves: ReturnType<typeof useCubiqStore.getState>['sessions'][0]['solves']): Map<string, DayData> {
  const map = new Map<string, DayData>()
  for (const solve of solves) {
    const dateKey = solve.created_at.slice(0, 10)
    const existing = map.get(dateKey) ?? { date: dateKey, count: 0, best: null, mean: null }
    const t = getEffectiveTime(solve)
    const newBest = t !== null ? (existing.best === null ? t : Math.min(existing.best, t)) : existing.best
    map.set(dateKey, { ...existing, count: existing.count + 1, best: newBest })
  }
  // Compute means
  for (const [key, day] of map) {
    const dayTimes = solves
      .filter(s => s.created_at.slice(0, 10) === key)
      .map(getEffectiveTime)
      .filter((t): t is number => t !== null)
    if (dayTimes.length > 0) {
      day.mean = dayTimes.reduce((a, b) => a + b, 0) / dayTimes.length
    }
  }
  return map
}

function getLast13Weeks(): string[] {
  const weeks: string[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = new Date(today)
  start.setDate(today.getDate() - 7 * 13 + 1)

  const cur = new Date(start)
  while (cur <= today) {
    weeks.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return weeks
}

function intensityColor(count: number, maxCount: number): string {
  if (count === 0) return 'var(--bg-elevated)'
  const ratio = count / Math.max(maxCount, 1)
  const opacity = 0.2 + ratio * 0.8
  return `rgba(110, 231, 247, ${opacity})`
}

interface CellProps {
  day: DayData | undefined
  date: string
  maxCount: number
}

function HeatCell({ day, date, maxCount }: CellProps) {
  const count = day?.count ?? 0
  const best = day?.best
  const mean = day?.mean

  const label = new Date(date + 'T12:00:00').toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  })

  return (
    <div
      className="w-4 h-4 rounded-sm cursor-default relative group"
      style={{ background: intensityColor(count, maxCount) }}
      title={`${label}\n${count} solve${count !== 1 ? 's' : ''}${best ? `\nBest: ${formatTime(best)}` : ''}${mean ? `\nMean: ${formatTime(Math.round(mean))}` : ''}`}
    />
  )
}

export function DailyHeatmap() {
  const { getActiveSession } = useCubiqStore()
  const session = getActiveSession()
  const solves = session?.solves ?? []

  const dayMap = useMemo(() => buildDayMap(solves), [solves])
  const allDates = useMemo(() => getLast13Weeks(), [])
  const maxCount = useMemo(() => Math.max(0, ...Array.from(dayMap.values()).map(d => d.count)), [dayMap])

  // Group into weeks (columns), each column = 7 days
  const weekCols: string[][] = []
  for (let i = 0; i < allDates.length; i += 7) {
    weekCols.push(allDates.slice(i, i + 7))
  }

  const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', '']

  return (
    <div className="flex gap-1 overflow-x-auto">
      {/* Day labels */}
      <div className="flex flex-col gap-1 mr-1">
        {dayLabels.map((label, i) => (
          <div key={i} className="h-4 text-[10px] flex items-center" style={{ color: 'var(--text-muted)', width: 24 }}>
            {label}
          </div>
        ))}
      </div>

      {weekCols.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-1">
          {week.map(date => (
            <HeatCell
              key={date}
              date={date}
              day={dayMap.get(date)}
              maxCount={maxCount}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
