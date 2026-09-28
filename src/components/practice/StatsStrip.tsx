'use client'
import { calcAo, computeStats, formatStat, formatTime, getEffectiveTime } from '@/lib/stats'
import { isToday } from '@/lib/practice'
import type { Solve } from '@/types'

function Cell({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-surface px-3.5 py-3 flex flex-col gap-1.5 min-w-0 ${className}`}>
      <span className="label">{label}</span>
      <span className="num text-[15px] md:text-[17px] font-semibold leading-none text-ink truncate">{children}</span>
    </div>
  )
}

/** The numbers people glance at between solves. */
export function StatsStrip({ solves }: { solves: Solve[] }) {
  const n = solves.length
  const stats = computeStats(solves)
  const prevAo5 = n > 5 ? calcAo(solves.slice(0, -1), 5) : null
  const d5 = stats.ao5 !== null && prevAo5 !== null ? stats.ao5 - prevAo5 : null
  const today = solves.filter(s => isToday(s.created_at)).length

  const last5 = solves.slice(-5)
  const eff = last5.map(getEffectiveTime)
  const valid = eff.map((t, i) => [t ?? Infinity, i] as const)
  const bestI = last5.length === 5 ? valid.reduce((a, b) => (b[0] < a[0] ? b : a))[1] : -1
  const worstI = last5.length === 5 ? valid.reduce((a, b) => (b[0] >= a[0] ? b : a))[1] : -1

  return (
    <div className="grid grid-cols-3 md:grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,1.7fr)] gap-px bg-line border border-line rounded-2xl overflow-hidden">
      <Cell label="Single PB"><span className={stats.best !== null ? 'text-pb' : ''}>{formatStat(stats.best, n)}</span></Cell>
      <Cell label="ao5">
        {formatStat(stats.ao5, n, 5)}
        {d5 !== null && Math.abs(d5) >= 5 && (
          <span className={`ml-1.5 text-[11px] font-medium ${d5 < 0 ? 'text-go' : 'text-stop'}`}>
            {d5 < 0 ? '▼' : '▲'} {(Math.abs(d5) / 1000).toFixed(2)}
          </span>
        )}
      </Cell>
      <Cell label="ao12">{formatStat(stats.ao12, n, 12)}</Cell>
      <Cell label="ao100" className="hidden md:flex">{formatStat(stats.ao100, n, 100)}</Cell>
      <Cell label="Today" className="hidden md:flex">{today}</Cell>
      <div className="bg-surface px-3.5 py-3 hidden md:flex flex-col gap-1.5 min-w-0">
        <span className="label">Last 5</span>
        <span className="num text-[13px] leading-none flex gap-2.5 flex-wrap">
          {last5.length === 0 && <span className="text-faint">—</span>}
          {last5.map((s, i) => {
            const t = formatTime(eff[i])
            if (i === bestI) return <span key={s.id} className="text-pb font-semibold">({t})</span>
            if (i === worstI) return <span key={s.id} className="text-faint">({t})</span>
            return <span key={s.id} className="text-ink font-semibold">{t}</span>
          })}
        </span>
      </div>
    </div>
  )
}
