'use client'
import { useMemo } from 'react'
import { DIAGRAM_COLORS, diagramOf, type LLCase } from '@/lib/learn'

const GREY = 'var(--line-strong)'

/** Top view of a last-layer case: the U face plus the top row of each
 *  side. OLL shows only where yellow is; PLL shows colours and arrows. */
export function CaseDiagram({ c, size = 200 }: { c: LLCase; size?: number }) {
  const d = useMemo(() => diagramOf(c), [c])
  const oll = c.set === 'oll'
  const color = (f: string) => (oll ? (f === 'U' ? DIAGRAM_COLORS.U : GREY) : DIAGRAM_COLORS[f])
  const s = 46, gap = 4, o = 24, span = 3 * s + 2 * gap
  const cell = (i: number) => o + i * (s + gap)

  // a swap (a->b and b->a) is one double-headed arrow
  const arrows = useMemo(() => {
    const out: { a: [number, number]; b: [number, number]; both: boolean }[] = []
    for (const [a, b] of d.arrows) {
      const rev = out.find(x => x.a[0] === b[0] && x.a[1] === b[1] && x.b[0] === a[0] && x.b[1] === a[1])
      if (rev) rev.both = true
      else out.push({ a, b, both: false })
    }
    return out
  }, [d])
  const centre = ([r, c2]: [number, number]) => [cell(c2) + s / 2, cell(r) + s / 2]

  return (
    <svg viewBox={`0 0 ${span + 2 * o} ${span + 2 * o}`} width={size} height={size} role="img" aria-label={`${c.name} case diagram`} className="shrink-0">
      <defs>
        <marker id={`ah-${c.key}`} viewBox="0 0 10 10" refX="7.5" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse">
          <path d="M0 0L10 5 0 10z" fill="#0E1014" />
        </marker>
      </defs>
      <rect x={o - 12} y={o - 12} width={span + 24} height={span + 24} rx={16} fill="var(--raised)" />
      {d.top.map((f, i) => (
        <rect key={i} x={cell(i % 3)} y={cell(Math.floor(i / 3))} width={s} height={s} rx={8} fill={color(f)} />
      ))}
      {[0, 1, 2].map(k => (
        <g key={k}>
          <rect x={cell(k) + 5} y={o - 10} width={s - 10} height={6} rx={2} fill={color(d.back[k])} />
          <rect x={cell(k) + 5} y={o + span + 4} width={s - 10} height={6} rx={2} fill={color(d.front[k])} />
          <rect x={o - 10} y={cell(k) + 5} width={6} height={s - 10} rx={2} fill={color(d.left[k])} />
          <rect x={o + span + 4} y={cell(k) + 5} width={6} height={s - 10} rx={2} fill={color(d.right[k])} />
        </g>
      ))}
      {arrows.map(({ a, b, both }, i) => {
        const [x1, y1] = centre(a), [x2, y2] = centre(b)
        // stop short of the centres so heads sit inside the stickers
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), k = 12 / len
        return (
          <line
            key={i} x1={x1 + dx * (both ? k : 0)} y1={y1 + dy * (both ? k : 0)} x2={x2 - dx * k} y2={y2 - dy * k}
            stroke="#0E1014" strokeWidth={4} strokeLinecap="round"
            markerEnd={`url(#ah-${c.key})`} markerStart={both ? `url(#ah-${c.key})` : undefined}
          />
        )
      })}
    </svg>
  )
}
