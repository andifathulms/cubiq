'use client'
import { heatmapWeeks } from '@/lib/progress'

/** Practice consistency: one square per day for the last 12 weeks. */
export function Heatmap({ perDay }: { perDay: Map<string, number> }) {
  const weeks = heatmapWeeks(12)
  const max = Math.max(1, ...perDay.values())
  return (
    <div className="flex gap-1.5">
      <div className="grid grid-rows-7 gap-[3px] text-[9px] text-muted num pr-1">
        {['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((d, i) => <span key={i} className="h-full flex items-center leading-none">{d}</span>)}
      </div>
      <div className="grid grid-flow-col grid-rows-7 gap-[3px] flex-1" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
        {weeks.flat().map(({ key, date, future }) => {
          const c = perDay.get(key) ?? 0
          const label = `${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${c} solve${c === 1 ? '' : 's'}`
          return (
            <span
              key={key} title={label} aria-label={label}
              className="aspect-square rounded-[3px]"
              style={{
                background: future ? 'transparent' : c ? 'var(--go)' : 'var(--raised)',
                opacity: c ? 0.3 + (0.7 * c) / max : 1,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
