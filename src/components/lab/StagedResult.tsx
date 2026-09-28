'use client'
import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Copy, Check, Play } from 'lucide-react'
import { CubePlayer } from './CubePlayer'
import { KIND_COLOR, type LabResult } from '@/lib/lab'
import { Segmented } from '@/components/ui/Toggle'

const Sq1View3D = dynamic(() => import('@/components/solvers/Sq1View3D').then(m => m.Sq1View3D), { ssr: false })
const Sq1AnimatedView = dynamic(() => import('@/components/solvers/Sq1AnimatedView').then(m => m.Sq1AnimatedView), { ssr: false })

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button" className="btn btn-ghost btn-sm"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {})
      }}
    >
      {copied ? <Check size={13} className="text-go" /> : <Copy size={13} />} {copied ? 'Copied' : label}
    </button>
  )
}

// readable ink on each sticker-coloured segment
const DARK_TEXT = new Set(['cross', 'xcross', 'oll', 'll', 'pairing', 'optimal', 'solution'])

/** One solution told stage by stage: move bar, stage rows, player. */
export function StagedResult({ puzzle, twisty, scramble, result }: {
  puzzle: string
  twisty: string
  scramble: string
  result: LabResult
}) {
  const [mode, setMode] = useState<{ stage: number | null }>({ stage: null })
  const [current, setCurrent] = useState<number | null>(null)
  const [sq1View, setSq1View] = useState<'3d' | 'disc'>('3d')

  // cumulative play boundaries for highlighting during "play all"
  const bounds = useMemo(() => {
    const out: number[] = []
    for (const s of result.stages) out.push((out[out.length - 1] ?? 0) + s.play.length)
    return out
  }, [result])

  const setup = mode.stage === null
    ? scramble
    : [scramble, ...result.stages.slice(0, mode.stage).flatMap(s => s.play)].join(' ')
  const alg = mode.stage === null
    ? result.stages.flatMap(s => s.play).join(' ')
    : result.stages[mode.stage].play.join(' ')

  const onMove = (i: number) => {
    if (mode.stage !== null) { setCurrent(mode.stage); return }
    const k = bounds.findIndex(b => i < b)
    setCurrent(k === -1 ? result.stages.length - 1 : k)
  }

  const totalCount = result.stages.reduce((n, s) => n + Math.max(1, s.count), 0)
  const showBar = result.stages.length > 1

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="num text-[13px] text-ink font-semibold">{result.summary}</span>
        <span className="num text-[11px] text-muted">solved in {result.timeMs < 1000 ? `${Math.round(result.timeMs)} ms` : `${(result.timeMs / 1000).toFixed(1)} s`}</span>
        <span className="flex-1" />
        <button className="btn btn-ghost btn-sm" onClick={() => { setMode({ stage: null }); setCurrent(null) }}>
          <Play size={13} /> Play all
        </button>
        <CopyButton text={result.solution} label="Copy solution" />
      </div>

      {/* Bar + player stay in view while the stage list scrolls underneath */}
      <div className="md:sticky md:top-0 z-10 -mx-4 md:-mx-5 px-4 md:px-5 pt-2 pb-3 bg-surface border-b border-line flex flex-col gap-3">
        {showBar && (
          <div className="flex h-8 rounded-lg overflow-hidden gap-[2px]" role="img" aria-label={`Moves per stage: ${result.stages.map(s => `${s.name} ${s.count}`).join(', ')}`}>
            {result.stages.map((s, i) => (
              <button
                key={i} type="button" title={`${s.name} · ${s.count} ${result.unit}`}
                onClick={() => setMode({ stage: i })}
                className="num text-[10px] font-semibold grid place-items-center min-w-0 overflow-hidden transition-opacity hover:opacity-90"
                style={{
                  flex: Math.max(1, s.count), background: KIND_COLOR[s.kind] ?? 'var(--line-strong)',
                  color: DARK_TEXT.has(s.kind) ? '#0E1014' : '#fff',
                  outline: current === i ? '2px solid var(--ink)' : undefined, outlineOffset: -2,
                  opacity: current !== null && current !== i ? 0.55 : 1,
                }}
              >
                {Math.max(1, s.count) / totalCount > 0.04 ? s.count : ''}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="label truncate">
            {mode.stage === null
              ? current !== null ? `Whole solution · now: ${result.stages[current].name}` : 'Whole solution'
              : `Stage · ${result.stages[mode.stage].name}`}
          </span>
          {puzzle === 'sq1' && (
            <Segmented label="Square-1 view" value={sq1View} onChange={setSq1View} options={[{ value: '3d', label: '3D' }, { value: 'disc', label: 'Top & bottom' }]} />
          )}
        </div>
        {puzzle === 'sq1'
          ? (sq1View === '3d' ? <Sq1View3D key={setup + alg} setup={setup} alg={alg} height={220} /> : <Sq1AnimatedView key={setup + alg} setup={setup} alg={alg} height={200} />)
          : <CubePlayer puzzle={twisty} setup={setup} alg={alg} onMove={onMove} height={230} />}
      </div>

      <ol className="flex flex-col gap-1.5">
        {result.stages.map((s, i) => (
          <li key={i}>
            <button
              type="button" onClick={() => setMode({ stage: i })}
              className={`w-full text-left grid grid-cols-[10px_minmax(90px,120px)_1fr_auto] items-start gap-x-3 gap-y-1 px-3 py-2.5 rounded-xl border transition-colors ${
                current === i ? 'border-go bg-[color-mix(in_srgb,var(--go)_8%,var(--raised))]' : 'border-transparent bg-raised hover:border-line-strong'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-[3px] mt-1" style={{ background: KIND_COLOR[s.kind] ?? 'var(--line-strong)' }} />
              <span className="text-[12.5px] font-semibold text-ink leading-snug">{s.name}</span>
              <span className="num text-[13px] text-ink-2 leading-relaxed break-words col-span-2 sm:col-span-1 order-last sm:order-none">
                {s.moves.length ? s.moves.join(' ') : '—'}
              </span>
              <span className="num text-[11px] text-muted pt-0.5 justify-self-end">{s.count}{result.unit === 'slashes' ? ' /' : 'm'}</span>
            </button>
          </li>
        ))}
      </ol>

      {result.alternatives.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="label">Other optimal solutions</span>
          {result.alternatives.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="num text-[12.5px] text-ink-2 flex-1 break-words">{a.join(' ')}</span>
              <CopyButton text={a.join(' ')} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
