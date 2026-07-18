'use client'
import { useState, useEffect } from 'react'
import { useCubiqStore } from '@/store'
import { formatTime, getEffectiveTime } from '@/lib/stats'

interface StatRowProps {
  label: string
  value: string
  highlight?: boolean
}

function StatRow({ label, value, highlight }: StatRowProps) {
  return (
    <div className="flex justify-between items-baseline px-2.5 py-2 rounded-lg transition-colors hover:bg-[var(--bg-glass)]">
      <span className="eyebrow">{label}</span>
      <span
        className="text-sm font-mono font-bold tabular-nums"
        style={{ color: highlight ? 'var(--accent-success)' : 'var(--text-primary)' }}
      >
        {value}
      </span>
    </div>
  )
}

const PLACEHOLDER = ['current', 'best', 'ao5', 'ao12', 'ao50', 'ao100', 'mean', 'count']

export function StatsPanel() {
  const [hydrated, setHydrated] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHydrated(true), [])

  const { getStats, getActiveSession } = useCubiqStore()
  const stats = getStats()
  const session = getActiveSession()
  const solves = session?.solves ?? []

  const lastSolve = solves[solves.length - 1]
  const lastTime = lastSolve ? getEffectiveTime(lastSolve) : null
  const isPB = stats.best !== null && lastTime !== null && lastTime === stats.best && solves.length > 1

  return (
    <div className="flex flex-col gap-3">
      <h3 className="eyebrow px-1">Session Stats</h3>

      {/* Hero stat — the number that matters most right now */}
      <div
        className="card px-3.5 py-3 flex flex-col gap-0.5"
        style={isPB ? { borderColor: 'var(--accent-success)', boxShadow: '0 0 24px -8px rgba(52,211,153,0.4)' } : undefined}
      >
        <span className="eyebrow" style={{ color: isPB ? 'var(--accent-success)' : undefined }}>
          {isPB ? '★ New Personal Best' : 'Current'}
        </span>
        <span
          className="text-3xl font-mono font-bold tabular-nums leading-none mt-1"
          style={{ color: isPB ? 'var(--accent-success)' : 'var(--text-primary)' }}
        >
          {hydrated && lastSolve ? formatTime(lastTime) : '—'}
        </span>
      </div>

      <div className="flex flex-col gap-0.5">
        {!hydrated
          ? PLACEHOLDER.map(label => <StatRow key={label} label={label} value="—" />)
          : (
            <>
              <StatRow label="best" value={formatTime(stats.best)} highlight={stats.best !== null} />
              <StatRow label="ao5" value={formatTime(stats.ao5)} />
              <StatRow label="ao12" value={formatTime(stats.ao12)} />
              <StatRow label="ao50" value={formatTime(stats.ao50)} />
              <StatRow label="ao100" value={formatTime(stats.ao100)} />
              <StatRow label="mean" value={stats.mean !== null ? formatTime(Math.round(stats.mean)) : '—'} />
              <StatRow label="count" value={String(stats.count)} />
            </>
          )}
      </div>
    </div>
  )
}
