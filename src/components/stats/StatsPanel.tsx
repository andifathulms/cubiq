'use client'
import { useCubiqStore } from '@/store'
import { formatTime, getEffectiveTime } from '@/lib/stats'

interface StatRowProps {
  label: string
  value: string
  highlight?: boolean
}

function StatRow({ label, value, highlight }: StatRowProps) {
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b" style={{ borderColor: 'var(--border)' }}>
      <span className="text-xs font-display uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span
        className="text-sm font-mono tabular-nums"
        style={{ color: highlight ? 'var(--accent-success)' : 'var(--text-primary)' }}
      >
        {value}
      </span>
    </div>
  )
}

export function StatsPanel() {
  const { getStats, getActiveSession } = useCubiqStore()
  const stats = getStats()
  const session = getActiveSession()
  const solves = session?.solves ?? []

  const lastSolve = solves[solves.length - 1]
  const lastTime = lastSolve ? getEffectiveTime(lastSolve) : null

  // Is last solve a PB?
  const isPB = stats.best !== null && lastTime !== null && lastTime === stats.best && solves.length > 1

  return (
    <div className="flex flex-col gap-0">
      <h3
        className="text-xs font-display uppercase tracking-widest mb-2 px-1"
        style={{ color: 'var(--text-muted)' }}
      >
        Statistics
      </h3>
      <StatRow
        label="current"
        value={lastSolve ? formatTime(lastTime) : '—'}
        highlight={isPB}
      />
      <StatRow label="best" value={formatTime(stats.best)} />
      <StatRow label="ao5" value={formatTime(stats.ao5)} />
      <StatRow label="ao12" value={formatTime(stats.ao12)} />
      <StatRow label="ao50" value={formatTime(stats.ao50)} />
      <StatRow label="ao100" value={formatTime(stats.ao100)} />
      <StatRow
        label="mean"
        value={stats.mean !== null ? formatTime(Math.round(stats.mean)) : '—'}
      />
      <StatRow label="count" value={String(stats.count)} />
    </div>
  )
}
