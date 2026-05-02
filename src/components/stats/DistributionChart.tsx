'use client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts'
import { useCubiqStore } from '@/store'
import { getEffectiveTime, formatTime } from '@/lib/stats'

interface Bucket {
  label: string
  count: number
  rangeMs: [number, number]
}

function buildBuckets(times: number[], bucketSizeMs = 1000): Bucket[] {
  if (times.length === 0) return []
  const min = Math.floor(Math.min(...times) / bucketSizeMs) * bucketSizeMs
  const max = Math.ceil(Math.max(...times) / bucketSizeMs) * bucketSizeMs
  const buckets: Bucket[] = []
  for (let start = min; start < max; start += bucketSizeMs) {
    const end = start + bucketSizeMs
    buckets.push({
      label: formatTime(start),
      count: times.filter(t => t >= start && t < end).length,
      rangeMs: [start, end],
    })
  }
  return buckets
}

// Interpolate red→green based on relative speed (lower index = faster = greener)
function bucketColor(index: number, total: number): string {
  const ratio = total <= 1 ? 0 : index / (total - 1)
  const r = Math.round(248 * ratio + 52 * (1 - ratio))
  const g = Math.round(113 * ratio + 211 * (1 - ratio))
  const b = Math.round(113 * ratio + 153 * (1 - ratio))
  return `rgb(${r},${g},${b})`
}

export function DistributionChart() {
  const { getActiveSession } = useCubiqStore()
  const session = getActiveSession()
  const solves = session?.solves ?? []
  const times = solves.map(getEffectiveTime).filter((t): t is number => t !== null)

  if (times.length < 5) {
    return (
      <div className="flex items-center justify-center h-48" style={{ color: 'var(--text-muted)' }}>
        <p className="text-sm">Need at least 5 solves to show distribution</p>
      </div>
    )
  }

  const buckets = buildBuckets(times)

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={buckets} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={false}
          allowDecimals={false}
          width={28}
        />
        <Tooltip
          cursor={{ fill: 'var(--bg-elevated)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null
            const d = payload[0].payload as Bucket
            return (
              <div
                className="glass rounded-xl px-3 py-2 text-xs"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
              >
                <p className="font-mono" style={{ color: 'var(--text-primary)' }}>
                  {formatTime(d.rangeMs[0])} – {formatTime(d.rangeMs[1])}
                </p>
                <p style={{ color: 'var(--text-secondary)' }}>{d.count} solve{d.count !== 1 ? 's' : ''}</p>
              </div>
            )
          }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {buckets.map((_, i) => (
            <Cell key={i} fill={bucketColor(i, buckets.length)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
