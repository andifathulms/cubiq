'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, Shuffle } from 'lucide-react'
import { useCubiqStore } from '@/store'
import { ScrambleChips } from '@/components/practice/ScrambleChips'
import { ScramblePreview } from '@/components/practice/ScramblePreview'
import { CubePlayer } from '@/components/lab/CubePlayer'
import { Segmented } from '@/components/ui/Toggle'
import { generateScramble } from '@/lib/cubing'
import { solveAllCrosses, type CrossFace, type CrossResult } from '@/lib/solvers/cross'

type Colour = 'white' | 'yellow' | 'any'
// WCA scrambling orientation: white on U, yellow on D
const FACE_OF: Record<Exclude<Colour, 'any'>, CrossFace> = { white: 'U', yellow: 'D' }
const COLOUR_NAME: Record<CrossFace, string> = { U: 'white', D: 'yellow', F: 'green', B: 'blue', R: 'red', L: 'orange' }
const COLOUR_VAR: Record<CrossFace, string> = { U: 'var(--st-U)', D: 'var(--st-D)', F: 'var(--st-F)', B: 'var(--st-B)', R: 'var(--st-R)', L: 'var(--st-L)' }
const PLAN_MS = 15000

/** Plan the cross in inspection time, then compare with the optimum. */
export function CrossDrill() {
  const { crossStats, recordCross } = useCubiqStore()
  const [colour, setColour] = useState<Colour>('white')
  const [scramble, setScramble] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [graded, setGraded] = useState(false)
  const [started, setStarted] = useState(0)
  const [now, setNow] = useState(0)
  const [showCube, setShowCube] = useState(false)

  const next = useCallback(() => {
    setScramble(generateScramble('333'))
    setRevealed(false)
    setGraded(false)
    setShowCube(false)
    setStarted(performance.now())
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { next() }, [next])

  useEffect(() => {
    if (revealed) return
    const id = setInterval(() => setNow(performance.now()), 100)
    return () => clearInterval(id)
  }, [revealed])

  const solutions = useMemo<CrossResult[]>(() => (scramble ? solveAllCrosses(scramble, 2) : []), [scramble])
  const target = colour === 'any'
    ? [...solutions].sort((a, b) => a.move_count - b.move_count)[0]
    : solutions.find(s => s.face === FACE_OF[colour])
  const elapsed = revealed || !now ? 0 : Math.max(0, now - started)
  const leftMs = Math.max(0, PLAN_MS - elapsed)
  const r = 26, c = 2 * Math.PI * r

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return
      if (e.code === 'Space') { e.preventDefault(); if (!revealed) setRevealed(true); else next() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, next])

  const total = crossStats.optimal + crossStats.close + crossStats.missed
  const moveText = (s: CrossResult) => (s.rotation ? s.rotation + ' ' : '') + (s.moves.join(' ') || '(already solved)')

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px] items-start">
      <section className="card p-4 md:p-6 flex flex-col gap-5 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            label="Cross colour" value={colour} onChange={v => { setColour(v); next() }}
            options={[{ value: 'white', label: 'White' }, { value: 'yellow', label: 'Yellow' }, { value: 'any', label: 'Colour neutral' }]}
          />
          <button className="btn btn-ghost btn-sm" onClick={next}><Shuffle size={14} /> New scramble</button>
        </div>

        <div className="flex flex-col items-center gap-4 py-2">
          <ScrambleChips scramble={scramble} puzzle="333" size="md" />
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 64 64" width="56" height="56" className="-rotate-90" aria-hidden>
              <circle cx="32" cy="32" r={r} fill="none" stroke="var(--line)" strokeWidth="6" />
              <circle
                cx="32" cy="32" r={r} fill="none" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - leftMs / PLAN_MS)}
                stroke={leftMs < 3000 ? 'var(--stop)' : leftMs < 7000 ? 'var(--plus2)' : 'var(--go)'}
              />
            </svg>
            <div className="flex flex-col">
              <span className="num text-2xl font-semibold leading-none">{revealed ? '—' : Math.ceil(leftMs / 1000)}</span>
              <span className="text-xs text-muted">{revealed ? 'revealed' : leftMs ? 'seconds to plan' : 'time — reveal when ready'}</span>
            </div>
          </div>
          <p className="text-sm text-ink-2 text-center max-w-md">
            Scramble in WCA orientation (white top, green front). Plan the {colour === 'any' ? 'shortest' : colour} cross
            {colour === 'white' ? ' as you would with white on the bottom' : ''}, then reveal.
          </p>
          {!revealed && <button className="btn btn-primary" onClick={() => setRevealed(true)}><Eye size={15} /> Reveal optimal cross <kbd className="!bg-transparent !border-go-ink/30 !text-go-ink">Space</kbd></button>}
        </div>

        {revealed && target && (
          <div className="flex flex-col gap-4 animate-fade-in">
            <div className="rounded-xl bg-raised p-4 flex flex-col gap-2">
              <span className="label" style={{ color: COLOUR_VAR[target.face] }}>Optimal {COLOUR_NAME[target.face]} cross · {target.move_count} moves</span>
              <span className="num text-lg font-semibold break-words">{moveText(target)}</span>
              {target.alternatives.length > 0 && (
                <span className="num text-xs text-muted break-words">also: {(target.rotation ? target.rotation + ' ' : '') + target.alternatives[0].join(' ')}</span>
              )}
            </div>
            {!graded ? (
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="How did your plan compare?">
                {([['optimal', 'Found it'], ['close', 'Within 2 moves'], ['missed', 'Missed']] as const).map(([k, l]) => (
                  <button
                    key={k} onClick={() => { recordCross(k); setGraded(true) }}
                    className={`py-2.5 rounded-xl border text-[13px] font-semibold transition-colors ${k === 'optimal' ? 'border-go text-go' : 'border-line text-ink-2 hover:border-line-strong'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            ) : (
              <button className="btn btn-primary self-start" onClick={next}>Next scramble <kbd className="!bg-transparent !border-go-ink/30 !text-go-ink">Space</kbd></button>
            )}
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCube(v => !v)}>{showCube ? 'Hide cube' : 'Show on cube'}</button>
            </div>
            {showCube && <CubePlayer puzzle="3x3x3" setup={scramble} alg={moveText(target).replace('(already solved)', '')} height={240} />}
            {colour === 'any' && (
              <div className="flex flex-col gap-1.5">
                <span className="label">Every colour</span>
                {[...solutions].sort((a, b) => a.move_count - b.move_count).map(s => (
                  <div key={s.face} className="flex items-center gap-3 text-sm">
                    <i className="w-3 h-3 rounded-sm" style={{ background: COLOUR_VAR[s.face] }} />
                    <span className="w-16 text-ink-2 capitalize">{COLOUR_NAME[s.face]}</span>
                    <span className="num text-xs text-muted w-8">{s.move_count}m</span>
                    <span className="num text-xs text-ink-2 break-words flex-1">{moveText(s)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <aside className="flex flex-col gap-4">
        <section className="card p-4 flex flex-col gap-3">
          <h3 className="font-display font-bold">Your planning</h3>
          {total === 0 ? (
            <p className="text-sm text-muted">Grade a few plans and your hit rate shows up here.</p>
          ) : (
            <>
              <div className="flex h-3 rounded-full overflow-hidden bg-raised">
                <i style={{ flex: crossStats.optimal, background: 'var(--go)' }} />
                <i style={{ flex: crossStats.close, background: 'var(--plus2)' }} />
                <i style={{ flex: crossStats.missed, background: 'var(--stop)' }} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {([['Found', crossStats.optimal, 'text-go'], ['Close', crossStats.close, 'text-plus2'], ['Missed', crossStats.missed, 'text-stop']] as const).map(([l, v, cls]) => (
                  <div key={l} className="flex flex-col gap-1">
                    <span className={`num text-lg font-semibold ${cls}`}>{Math.round((100 * v) / total)}%</span>
                    <span className="text-[11px] text-muted">{l} · {v}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
        <section className="card p-4 flex flex-col gap-2">
          <span className="label">Scramble preview</span>
          <p className="text-xs text-muted">No cube in hand? Plan from the net.</p>
          <div className="grid place-items-center rounded-xl bg-sunk/60 py-2">
            <ScramblePreview scramble={scramble} puzzle="333" mode="net" size={220} />
          </div>
        </section>
      </aside>
    </div>
  )
}
