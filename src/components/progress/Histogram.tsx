'use client'
import { formatTime } from '@/lib/stats'
import { niceStep } from '@/lib/progress'
import { useWidth } from './useWidth'

const H = 150
const M = { l: 4, r: 4, t: 8, b: 22 }

/** Distribution of times; bars faster than the mean are green. */
export function Histogram({ times }: { times: number[] }) {
  const [ref, W] = useWidth<HTMLDivElement>(320)
  if (times.length < 5) return <div ref={ref} className="h-[150px]" />
  const sorted = [...times].sort((a, b) => a - b)
  const lo = sorted[0], hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))]
  const step = niceStep(hi - lo || 1000)
  const start = Math.floor(lo / step) * step
  const nBins = Math.max(1, Math.ceil((hi - start + 1) / step))
  const bins = Array.from({ length: nBins }, () => 0)
  for (const t of times) bins[Math.min(nBins - 1, Math.max(0, Math.floor((t - start) / step)))]++
  const max = Math.max(...bins)
  const mean = times.reduce((a, b) => a + b, 0) / times.length
  const bw = (W - M.l - M.r) / nBins
  const labelEvery = Math.ceil(nBins / 5)

  return (
    <div ref={ref}>
      <svg width={W} height={H} role="img" aria-label={`Distribution of ${times.length} times`}>
        {bins.map((c, k) => {
          const h = ((H - M.t - M.b) * c) / max
          const from = start + k * step
          return (
            <rect
              key={k} x={M.l + k * bw + 1} y={H - M.b - h} width={Math.max(1, bw - 2)} height={h} rx={2}
              fill={from + step <= mean ? 'var(--go)' : 'var(--line-strong)'}
            >
              <title>{`${formatTime(from)}–${formatTime(from + step)}: ${c} solve${c === 1 ? '' : 's'}`}</title>
            </rect>
          )
        })}
        {bins.map((_, k) => k % labelEvery === 0 && (
          <text key={k} x={M.l + k * bw} y={H - 6} fontSize="10" fill="var(--muted)" fontFamily="var(--font-mono)">
            {formatTime(start + k * step)}
          </text>
        ))}
      </svg>
    </div>
  )
}
