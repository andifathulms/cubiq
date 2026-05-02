'use client'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useCubiqStore } from '@/store'
import { formatTime, getEffectiveTime, calcAo } from '@/lib/stats'
import type { Solve } from '@/types'

interface DataPoint {
  index: number
  time: number | null
  ao5: number | null
  ao12: number | null
  scramble: string
  date: string
}

function buildChartData(solves: Solve[]): DataPoint[] {
  return solves.map((solve, i) => ({
    index: i + 1,
    time: getEffectiveTime(solve),
    ao5: calcAo(solves.slice(0, i + 1), 5),
    ao12: calcAo(solves.slice(0, i + 1), 12),
    scramble: solve.scramble,
    date: new Date(solve.created_at).toLocaleString(),
  }))
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ name: string; value: number | null; color: string }>
  label?: number
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="glass rounded-xl px-3 py-2 text-xs"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
    >
      <p className="font-display mb-1" style={{ color: 'var(--text-muted)' }}>Solve #{label}</p>
      {payload.map(p => (
        <p key={p.name} className="font-mono" style={{ color: p.color }}>
          {p.name}: {p.value !== null ? formatTime(Math.round(p.value)) : 'DNF'}
        </p>
      ))}
    </div>
  )
}

export function TimeChart() {
  const { getActiveSession } = useCubiqStore()
  const session = getActiveSession()
  const solves = session?.solves ?? []

  if (solves.length < 2) {
    return (
      <div className="flex items-center justify-center h-48" style={{ color: 'var(--text-muted)' }}>
        <p className="text-sm">Need at least 2 solves to show chart</p>
      </div>
    )
  }

  const data = buildChartData(solves)
  const times = data.map(d => d.time).filter((t): t is number => t !== null)
  const minTime = Math.min(...times)
  const maxTime = Math.max(...times)
  const padding = (maxTime - minTime) * 0.1 || 500

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="index"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={v => formatTime(Math.round(v))}
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={false}
          domain={[Math.max(0, minTime - padding), maxTime + padding]}
          width={52}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)' }}
        />
        <Line
          type="monotone"
          dataKey="time"
          name="Single"
          stroke="var(--accent-primary)"
          dot={false}
          strokeWidth={1.5}
          connectNulls={false}
        />
        <Line
          type="monotone"
          dataKey="ao5"
          name="ao5"
          stroke="var(--accent-secondary)"
          dot={false}
          strokeWidth={2}
          connectNulls={false}
        />
        <Line
          type="monotone"
          dataKey="ao12"
          name="ao12"
          stroke="var(--accent-success)"
          dot={false}
          strokeWidth={2}
          strokeDasharray="5 3"
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
