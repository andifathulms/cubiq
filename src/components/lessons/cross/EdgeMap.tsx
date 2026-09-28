'use client'
import { COLOUR_VAR, EDGE_SIDE, SLOT_NAMES, edgeName, spotOf, type Face } from '@/lib/lessons/crossEngine'

// The three layers side by side, each seen from above with green in front
// (at the bottom of the square). Top and bottom layers hold edges on their
// sides; the middle layer holds them at the corners. A piece shows both its
// stickers: for the top and bottom layers the inner sticker faces up/down
// and the thin outer strip faces the side; in the middle layer the two
// strips face the two sides.

const P = 132, G = 26, M = 10, Y0 = 26
const DIR: Record<Face, [number, number]> = { F: [0, 1], B: [0, -1], R: [1, 0], L: [-1, 0], U: [0, 0], D: [0, 0] }
const WHITE = 'var(--st-U)'
const PANELS = [
  { title: 'Top layer', slots: [0, 1, 2, 3] },
  { title: 'Middle layer', slots: [8, 9, 10, 11] },
  { title: 'Bottom layer', slots: [4, 5, 6, 7] },
]

type Mark = 'pick' | 'right' | 'wrong'

export function EdgeMap({ subs, only, onPick, marks = {}, label = 'Where the white edges are' }: {
  subs: readonly number[]             // the four white edges' sub-states
  only?: number[]                     // draw just these edges (default all)
  onPick?: (slot: number) => void     // tap mode
  marks?: Record<number, Mark>        // slot -> outline
  label?: string
}) {
  const at = new Map<number, number>()   // slot -> edge index
  subs.forEach((s, i) => { if (!only || only.includes(i)) at.set(s >> 1, i) })
  const W = M * 2 + P * 3 + G * 2

  const piece = (slot: number, cx: number, cy: number) => {
    const name = SLOT_NAMES[slot]
    const i = at.get(slot)
    const spot = i === undefined ? null : spotOf(subs[i])
    const colourOn = (f: Face) => (spot ? (spot.whiteOn === f ? WHITE : COLOUR_VAR[EDGE_SIDE[i!]]) : 'none')
    const mark = marks[slot]
    const ring = mark === 'right' ? 'var(--go)' : mark === 'wrong' ? 'var(--stop)' : mark === 'pick' ? 'var(--ink)' : null
    const empty = !spot
    const stroke = 'rgba(0,0,0,.45)'
    let shapes: React.ReactNode
    let box: [number, number, number, number]
    if (slot >= 8) {
      const [fb, rl] = [name[0] as Face, name[1] as Face]
      const sx = DIR[rl][0], sy = DIR[fb][1]
      const x = cx + sx * (P / 2 - 26), y = cy + sy * (P / 2 - 26)
      shapes = <>
        <rect x={x - 12} y={y - 12} width={24} height={24} rx={4} fill={empty ? 'none' : 'var(--sunk)'} stroke={stroke} />
        <rect x={x - 12} y={y + sy * 17 - 3.5} width={24} height={7} rx={2} fill={colourOn(fb)} stroke={stroke} />
        <rect x={x + sx * 17 - 3.5} y={y - 12} width={7} height={24} rx={2} fill={colourOn(rl)} stroke={stroke} />
      </>
      box = [x - 24, y - 24, 48, 48]
    } else {
      const ud = name[0] as Face, side = name[1] as Face
      const [dx, dy] = DIR[side]
      const horiz = dy !== 0
      const ix = cx + dx * (P / 2 - 30), iy = cy + dy * (P / 2 - 30)
      const sx = cx + dx * (P / 2 - 14), sy = cy + dy * (P / 2 - 14)
      const [iw, ih] = horiz ? [36, 18] : [18, 36]
      const [sw, sh] = horiz ? [36, 7] : [7, 36]
      shapes = <>
        <rect x={ix - iw / 2} y={iy - ih / 2} width={iw} height={ih} rx={4} fill={colourOn(ud)} stroke={stroke} />
        <rect x={sx - sw / 2} y={sy - sh / 2} width={sw} height={sh} rx={2} fill={colourOn(side)} stroke={stroke} />
      </>
      const x1 = Math.min(ix - iw / 2, sx - sw / 2), y1 = Math.min(iy - ih / 2, sy - sh / 2)
      const x2 = Math.max(ix + iw / 2, sx + sw / 2), y2 = Math.max(iy + ih / 2, sy + sh / 2)
      box = [x1 - 5, y1 - 5, x2 - x1 + 10, y2 - y1 + 10]
    }
    const title = i === undefined ? `${name} (empty)` : `${edgeName(i)} at ${name}`
    return (
      <g
        key={slot}
        {...(onPick ? {
          role: 'button', tabIndex: 0, 'aria-label': `Slot ${name}`, style: { cursor: 'pointer' },
          onClick: () => onPick(slot),
          onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(slot) } },
        } : {})}
      >
        <title>{title}</title>
        <rect x={box[0]} y={box[1]} width={box[2]} height={box[3]} rx={8}
          fill={onPick ? 'transparent' : 'none'} stroke={ring ?? 'none'} strokeWidth={2.5} className={onPick ? 'hover:fill-[color-mix(in_srgb,var(--go)_10%,transparent)]' : undefined} />
        {empty
          ? <rect x={box[0] + 4} y={box[1] + 4} width={box[2] - 8} height={box[3] - 8} rx={6} fill="none" stroke="var(--line-strong)" strokeDasharray="3 3" />
          : shapes}
      </g>
    )
  }

  return (
    <svg viewBox={`0 0 ${W} ${Y0 + P + 30}`} className="w-full max-w-[520px] h-auto" role={onPick ? 'group' : 'img'} aria-label={label}>
      {PANELS.map((pnl, k) => {
        const x0 = M + k * (P + G), cx = x0 + P / 2, cy = Y0 + P / 2
        return (
          <g key={pnl.title}>
            <text x={cx} y={16} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--muted)" style={{ letterSpacing: '.08em', textTransform: 'uppercase' }}>{pnl.title}</text>
            <rect x={x0} y={Y0} width={P} height={P} rx={12} fill="var(--raised)" stroke="var(--line)" />
            {/* centre colours around each layer: green front, orange right, blue back, red left */}
            <rect x={cx - 16} y={Y0 + P + 3} width={32} height={4} rx={2} fill={COLOUR_VAR.F} />
            <rect x={x0 + P + 3} y={cy - 16} width={4} height={32} rx={2} fill={COLOUR_VAR.R} />
            <rect x={cx - 16} y={Y0 - 7} width={32} height={4} rx={2} fill={COLOUR_VAR.B} />
            <rect x={x0 - 7} y={cy - 16} width={4} height={32} rx={2} fill={COLOUR_VAR.L} />
            {pnl.slots.map(s => piece(s, cx, cy))}
          </g>
        )
      })}
      <text x={W / 2} y={Y0 + P + 24} textAnchor="middle" fontSize="10.5" fill="var(--faint)">seen from above · green in front · white on the bottom</text>
    </svg>
  )
}
