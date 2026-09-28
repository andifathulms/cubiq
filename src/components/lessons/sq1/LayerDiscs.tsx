'use client'
import { layerDetail, layerName } from '@/lib/lessons/sq1Shapes'

// Both layers drawn flat, shape only: corners as kites (2 slots), edges as
// triangles (1 slot), in true proportions, so a square layer looks square.
// The slash line is vertical and the half it turns (the right half) is
// shaded, on both discs. Corners that straddle the line are outlined red.

const R = 62
const RF = R / Math.cos(Math.PI / 12)   // flat-face radius at a slot boundary
const RC = R * Math.SQRT2 / 1.08        // corner tip, a little inside the frame
const pt = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180
  return `${(cx + r * Math.sin(a)).toFixed(1)},${(cy - r * Math.cos(a)).toFixed(1)}`
}

function Disc({ layer, cx, cy, offset, straddle, title, sub }: {
  layer: string          // 12 slot types (C c e)
  cx: number; cy: number
  offset: number         // drawing angle of slot 0
  straddle: number[]     // layer-local slots whose corner crosses the line
  title: string
  sub: string
}) {
  const pieces: React.ReactNode[] = []
  for (let i = 0; i < 12; i++) {
    const t = layer[i]
    if (t === 'c') continue
    const a0 = offset + 30 * i
    const bad = straddle.includes(i)
    if (t === 'C') {
      pieces.push(
        <polygon key={i} points={`${cx},${cy} ${pt(cx, cy, RF, a0)} ${pt(cx, cy, RC, a0 + 30)} ${pt(cx, cy, RF, a0 + 60)}`}
          fill="var(--ink-2)" fillOpacity={0.85} stroke={bad ? 'var(--stop)' : 'var(--surface)'} strokeWidth={bad ? 3 : 1.5} strokeLinejoin="round" />,
      )
    } else {
      pieces.push(
        <polygon key={i} points={`${cx},${cy} ${pt(cx, cy, RF, a0)} ${pt(cx, cy, RF, a0 + 30)}`}
          fill="var(--faint)" fillOpacity={0.55} stroke="var(--surface)" strokeWidth={1.5} strokeLinejoin="round" />,
      )
    }
  }
  return (
    <g>
      <path d={`M ${cx} ${cy - RC - 8} A ${RC + 8} ${RC + 8} 0 0 1 ${cx} ${cy + RC + 8} Z`} fill="var(--go)" fillOpacity={0.08} />
      {pieces}
      <line x1={cx} y1={cy - RC - 12} x2={cx} y2={cy + RC + 12} stroke="var(--go)" strokeWidth={1.5} strokeDasharray="5 4" />
      <text x={cx} y={cy + RC + 30} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--ink)">{title}</text>
      <text x={cx} y={cy + RC + 46} textAnchor="middle" fontSize="11" fill="var(--muted)">{sub}</text>
    </g>
  )
}

/** `types`: 24 slot types from the wedge model (typesOf); `straddle`:
 *  24-slot indices of corners across the slash line. */
export function LayerDiscs({ types, straddle = [], detail = false }: { types: string; straddle?: number[]; detail?: boolean }) {
  const top = types.slice(0, 12), bottom = types.slice(12)
  const name = detail ? layerDetail : layerName
  // top seen from above with the slash half on the right: slot 0 at 180°;
  // bottom seen from below: slot 0 at 0° — the slash half is right on both
  return (
    <svg viewBox="0 0 400 232" className="w-full max-w-[420px] h-auto" role="img" aria-label={`Top: ${name(top)}. Bottom: ${name(bottom)}.`}>
      <Disc layer={top} cx={100} cy={96} offset={180} straddle={straddle.filter(s => s < 12)} title="Top" sub={name(top)} />
      <Disc layer={bottom} cx={300} cy={96} offset={0} straddle={straddle.filter(s => s >= 12).map(s => s - 12)} title="Bottom (from below)" sub={name(bottom)} />
    </svg>
  )
}
