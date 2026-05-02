'use client'
import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from 'recharts'
import { useCubiqStore } from '@/store'
import { computeStats, formatTime } from '@/lib/stats'

const PALETTE = [
  'var(--accent-primary)',
  'var(--accent-secondary)',
  'var(--accent-success)',
  'var(--accent-warning)',
]

export function SessionComparison() {
  const { sessions } = useCubiqStore()
  const [selected, setSelected] = useState<Set<string>>(new Set(sessions.slice(0, 2).map(s => s.id)))

  const activeSessions = sessions.filter(s => selected.has(s.id))
  const metrics = ['best', 'ao5', 'ao12', 'mean'] as const

  const chartData = metrics.map(metric => {
    const entry: Record<string, string | number> = { metric: metric.toUpperCase() }
    for (const session of activeSessions) {
      const stats = computeStats(session.solves)
      const val = stats[metric]
      entry[session.name] = val !== null ? val / 1000 : 0
    }
    return entry
  })

  function toggleSession(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size > 1) next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  if (sessions.length < 2) {
    return (
      <div className="flex items-center justify-center h-48" style={{ color: 'var(--text-muted)' }}>
        <p className="text-sm">Need at least 2 sessions to compare</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Session toggle chips */}
      <div className="flex flex-wrap gap-2">
        {sessions.map((s, i) => (
          <button
            key={s.id}
            onClick={() => toggleSession(s.id)}
            className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
            style={{
              borderColor: selected.has(s.id) ? PALETTE[i % PALETTE.length] : 'var(--border)',
              color: selected.has(s.id) ? PALETTE[i % PALETTE.length] : 'var(--text-muted)',
              background: selected.has(s.id) ? `${PALETTE[i % PALETTE.length]}15` : 'transparent',
            }}
          >
            {s.name}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="metric"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={v => v > 0 ? formatTime(Math.round(v * 1000)) : ''}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--border)' }}
            tickLine={false}
            width={52}
          />
          <Tooltip
            formatter={(value) => [formatTime(Math.round(Number(value) * 1000)), '']}
            contentStyle={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              fontSize: 12,
              color: 'var(--text-primary)',
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }} />
          {activeSessions.map((session, i) => (
            <Bar
              key={session.id}
              dataKey={session.name}
              fill={PALETTE[sessions.indexOf(session) % PALETTE.length]}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
