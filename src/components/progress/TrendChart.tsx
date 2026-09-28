'use client'
import { useMemo, useState } from 'react'
import { formatTime, getEffectiveTime } from '@/lib/stats'
import { useWidth } from './useWidth'
import type { Solve } from '@/types'

const M = { l: 46, r: 12, t: 12, b: 26 }

function niceTicks(lo: number, hi: number, n = 4): number[] {
  const span = hi - lo
  const raw = span / n
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(f => f * mag).find(s => s >= raw) ?? 10 * mag
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v)
  return out
}

/** Every single (faint dots), rolling ao12 (line + soft area) and the PB
 *  staircase; hover shows the nearest solve. */
export function TrendChart({ solves, idx, ao12, best, example }: {
  solves: Solve[]
  idx: number[]
  ao12: (number | null)[]
  best: (number | null)[]
  example?: boolean
}) {
  const [ref, W] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const H = W > 640 ? 330 : 240

  const data = useMemo(() => idx.map(i => ({ i, t: getEffectiveTime(solves[i]), a: ao12[i], b: best[i] })), [idx, solves, ao12, best])
  const vals = data.flatMap(d => [d.t, d.a]).filter((v): v is number => v !== null).sort((a, b) => a - b)
  if (data.length < 2 || vals.length < 2) return <div ref={ref} style={{ height: H }} />

  // clip the slowest outliers so one bad solve doesn't flatten the chart
  const lo = vals[0], hi = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.97))]
  const pad = (hi - lo) * 0.08 || 500
  const y0 = Math.max(0, lo - pad), y1 = hi + pad
  const x = (k: number) => M.l + (W - M.l - M.r) * (data.length === 1 ? 0.5 : k / (data.length - 1))
  const y = (v: number) => M.t + (H - M.t - M.b) * (1 - (Math.min(v, y1) - y0) / (y1 - y0))
  const ticks = niceTicks(y0 / 1000, y1 / 1000).map(s => s * 1000)

  const line = (key: 'a' | 'b', step = false) => {
    let d = '', open = false
    data.forEach((p, k) => {
      const v = p[key]
      if (v === null) { open = false; return }
      if (!open) { d += `M${x(k).toFixed(1)},${y(v).toFixed(1)}`; open = true }
      else if (step) d += `H${x(k).toFixed(1)}V${y(v).toFixed(1)}`
      else d += `L${x(k).toFixed(1)},${y(v).toFixed(1)}`
    })
    return d
  }
  const aoPath = line('a')
  const firstA = data.findIndex(p => p.a !== null)
  let lastA = -1
  for (let k = data.length - 1; k >= 0; k--) if (data[k].a !== null) { lastA = k; break }
  const area = firstA >= 0 ? `${aoPath}V${H - M.b}H${x(firstA).toFixed(1)}Z` : ''
  const dateLabel = (k: number) => new Date(solves[data[k].i].created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const h = hover !== null ? data[hover] : null

  return (
    <div ref={ref} className="relative">
      <svg
        width={W} height={H} role="img"
        aria-label={example ? 'Example trend chart' : `Trend of ${data.length} solves with rolling ao12`}
        onMouseMove={e => {
          const r = (e.currentTarget as SVGElement).getBoundingClientRect()
          const k = Math.round(((e.clientX - r.left - M.l) / (W - M.l - M.r)) * (data.length - 1))
          setHover(Math.max(0, Math.min(data.length - 1, k)))
        }}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map(v => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke="var(--line)" />
            <text x={M.l - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="var(--font-mono)">{formatTime(v)}</text>
          </g>
        ))}
        {[0, Math.floor((data.length - 1) / 2), data.length - 1].map((k, n) => (
          <text key={n} x={x(k)} y={H - 7} fontSize="10" fill="var(--muted)" fontFamily="var(--font-mono)" textAnchor={n === 0 ? 'start' : n === 1 ? 'middle' : 'end'}>
            {dateLabel(k)}
          </text>
        ))}
        {data.map((p, k) => p.t !== null && (
          <circle key={k} cx={x(k)} cy={y(p.t)} r={data.length > 400 ? 1.4 : 2} fill="var(--muted)" fillOpacity={0.4} />
        ))}
        {area && <path d={area} fill="var(--go)" fillOpacity={0.08} />}
        <path d={aoPath} fill="none" stroke="var(--go)" strokeWidth={2.2} strokeLinejoin="round" />
        <path d={line('b', true)} fill="none" stroke="var(--pb)" strokeWidth={1.6} />
        {lastA >= 0 && <circle cx={x(lastA)} cy={y(data[lastA].a!)} r={4} fill="var(--go)" />}
        {h && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={H - M.b} stroke="var(--line-strong)" strokeDasharray="3 3" />
            {h.t !== null && <circle cx={x(hover)} cy={y(h.t)} r={4.5} fill="var(--ink)" stroke="var(--surface)" strokeWidth={2} />}
          </g>
        )}
      </svg>
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-lg border border-line bg-surface px-2.5 py-2 text-[11px] shadow-md num"
          style={{ left: Math.min(W - 150, Math.max(0, x(hover) + 10)) }}
        >
          <div className="text-muted">#{h.i + 1} · {dateLabel(hover)}</div>
          <div className="text-ink font-semibold">{formatTime(h.t)}</div>
          {h.a !== null && <div className="text-go">ao12 {formatTime(Math.round(h.a))}</div>}
        </div>
      )}
    </div>
  )
}
