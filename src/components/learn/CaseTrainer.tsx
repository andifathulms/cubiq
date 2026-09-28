'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, Timer, RotateCcw, Box } from 'lucide-react'
import { useCubiqStore } from '@/store'
import { CaseDiagram } from './CaseDiagram'
import { CubePlayer } from '@/components/lab/CubePlayer'
import { Modal } from '@/components/ui/Modal'
import {
  CASES, CASE_BY_KEY, avg, invertAlg, levelOf, nextHint, queueFor,
  type CaseSet, type Grade, type LLCase,
} from '@/lib/learn'

type Phase = 'recognize' | 'revealed' | 'executing' | 'executed'
const GRADES: { g: Grade; label: string; key: string }[] = [
  { g: 'again', label: 'Again', key: '1' },
  { g: 'hard', label: 'Hard', key: '2' },
  { g: 'good', label: 'Good', key: '3' },
  { g: 'easy', label: 'Easy', key: '4' },
]
const secs = (ms: number | null | undefined) => (ms == null ? '—' : `${(ms / 1000).toFixed(2)} s`)

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-3.5 flex flex-col gap-1.5 min-w-0">
      <span className="label">{label}</span>
      <span className="num text-lg font-semibold leading-none text-ink">{value}</span>
      {sub && <span className="text-[11px] text-muted truncate">{sub}</span>}
    </div>
  )
}

export function CaseTrainer({ set }: { set: CaseSet }) {
  const training = useCubiqStore(s => s.training)
  const gradeCase = useCubiqStore(s => s.gradeCase)
  const resetTraining = useCubiqStore(s => s.resetTraining)
  const [current, setCurrent] = useState<{ c: LLCase; extra: boolean } | null>(null)
  const [phase, setPhase] = useState<Phase>('recognize')
  const [recog, setRecog] = useState<number | null>(null)
  const [exec, setExec] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const [preview, setPreview] = useState<LLCase | null>(null)
  const [showCube, setShowCube] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [t0, setT0] = useState(0)   // recognition start (performance.now)
  const [e0, setE0] = useState(0)   // execution start

  const { due, fresh } = useMemo(() => queueFor(set, training), [set, training])
  const left = due.length + fresh.length

  const start = useCallback((c: LLCase, extra = false) => {
    setCurrent({ c, extra })
    setPhase('recognize')
    setRecog(null)
    setExec(null)
    setShowCube(false)
    setT0(performance.now())
  }, [])

  const pickNext = useCallback(() => {
    const q = queueFor(set, useCubiqStore.getState().training)
    const c = q.due[0] ?? q.fresh[0]
    if (c) start(c)
    else setCurrent(null)
  }, [set, start])

  // first case (and when switching between PLL and OLL)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { pickNext() }, [pickNext])

  // live clock for the recognition / execution timers
  useEffect(() => {
    if (phase !== 'recognize' && phase !== 'executing') return
    const id = setInterval(() => setNow(performance.now()), 50)
    return () => clearInterval(id)
  }, [phase])

  const reveal = useCallback(() => {
    if (phase !== 'recognize') return
    setRecog(performance.now() - t0)
    setPhase('revealed')
  }, [phase, t0])

  const toggleExec = useCallback(() => {
    if (phase === 'revealed' || phase === 'executed') {
      setE0(performance.now())
      setExec(null)
      setPhase('executing')
    } else if (phase === 'executing') {
      setExec(performance.now() - e0)
      setPhase('executed')
    }
  }, [phase, e0])

  const grade = useCallback((g: Grade) => {
    if (!current || phase === 'recognize') return
    gradeCase(current.c.key, g, { recogMs: recog ?? undefined, execMs: exec ?? undefined })
    pickNext()
  }, [current, phase, recog, exec, gradeCase, pickNext])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || document.querySelector('[role="dialog"]')) return
      if (e.code === 'Space') {
        e.preventDefault()
        if (e.repeat) return
        if (phase === 'recognize') reveal()
        else toggleExec()
      } else {
        const gr = GRADES.find(x => x.key === e.key)
        if (gr) grade(gr.g)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, reveal, toggleExec, grade])

  const cases = CASES[set]
  const learned = cases.filter(c => training[c.key])
  const mastered = cases.filter(c => levelOf(training[c.key]) === 'mastered').length
  const recogAvg = avg(learned.flatMap(c => training[c.key].recogMs ?? []))
  const execAvg = avg(learned.flatMap(c => training[c.key].execMs ?? []))
  const card = current ? training[current.c.key] : undefined

  const liveRecog = phase === 'recognize' && now ? Math.max(0, now - t0) : recog
  const liveExec = phase === 'executing' && now ? Math.max(0, now - e0) : exec

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
      <div className="flex flex-col gap-4 min-w-0">
        {current ? (
          <section className="card p-4 md:p-6 flex flex-col md:flex-row gap-6 md:items-center">
            <div className="self-center"><CaseDiagram c={current.c} size={220} /></div>
            <div className="flex flex-col gap-4 flex-1 min-w-0">
              <span className="label">
                {current.extra ? 'Extra practice' : card ? `Review · ${left} left today` : `New case · ${left} left today`}
              </span>
              <h2 className="font-display text-3xl font-bold tracking-tight min-h-9">
                {phase === 'recognize' ? <span className="text-faint">Which case is this?</span> : current.c.name}
              </h2>
              <div
                className={`num text-[15px] leading-relaxed rounded-xl bg-raised px-3.5 py-3 transition-[filter] ${phase === 'recognize' ? 'blur-[6px] select-none' : ''}`}
                aria-hidden={phase === 'recognize'}
              >
                {current.c.alg}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[12px] num text-muted">
                <span className="px-2 py-1 rounded-md bg-raised">recognition {secs(liveRecog)}</span>
                <span className="px-2 py-1 rounded-md bg-raised">execution {secs(liveExec)}</span>
              </div>
              {phase === 'recognize' ? (
                <button className="btn btn-primary self-start" onClick={reveal}><Eye size={15} /> Reveal <kbd className="!bg-transparent !border-go-ink/30 !text-go-ink">Space</kbd></button>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-ghost btn-sm" onClick={toggleExec}>
                      <Timer size={14} /> {phase === 'executing' ? 'Stop timing' : exec ? 'Time again' : 'Time my execution'} <kbd>Space</kbd>
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowCube(v => !v)}><Box size={14} /> {showCube ? 'Hide cube' : 'Show on cube'}</button>
                  </div>
                  <div className="grid grid-cols-4 gap-2" role="group" aria-label="How well did you know it?">
                    {GRADES.map(({ g, label, key }) => (
                      <button
                        key={g} onClick={() => grade(g)}
                        className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border transition-colors ${
                          g === 'good' ? 'border-go text-go bg-[color-mix(in_srgb,var(--go)_9%,transparent)]' : 'border-line text-ink-2 hover:border-line-strong'
                        }`}
                      >
                        <span className="text-[13px] font-semibold">{label}</span>
                        <span className="num text-[10px] text-muted">{key} · {nextHint(card, g)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="card p-6 flex flex-col gap-3 items-start">
            <span className="label">All caught up</span>
            <h2 className="font-display text-2xl font-bold tracking-tight">No {set.toUpperCase()} cases due right now</h2>
            <p className="text-sm text-ink-2">New cases unlock at {5} per day and reviews come back on schedule. You can keep going with a random case.</p>
            <button className="btn btn-primary" onClick={() => start(cases[Math.floor(Math.random() * cases.length)], true)}>Practise a random case</button>
          </section>
        )}

        {current && showCube && (
          <section className="card p-3 md:p-4">
            <CubePlayer puzzle="3x3x3" setup={`z2 ${invertAlg(current.c.alg)}`} alg={current.c.alg} height={260} />
          </section>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Stat label="Recognition" value={secs(recogAvg)} sub="average, recent reviews" />
          <Stat label="Execution" value={secs(execAvg)} sub="average when timed" />
          <Stat label="Due today" value={String(left)} sub={`${due.length} review · ${fresh.length} new`} />
        </div>
      </div>

      <aside className="card p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold">{set.toUpperCase()} mastery</h3>
          <span className="num text-[11px] text-muted">{mastered} / {cases.length}</span>
        </div>
        <div className={`grid gap-1.5 ${set === 'pll' ? 'grid-cols-7' : 'grid-cols-8'}`}>
          {cases.map(c => {
            const lv = levelOf(training[c.key])
            const on = current?.c.key === c.key
            return (
              <button
                key={c.key} onClick={() => setPreview(c)} title={`${c.name} · ${lv}`}
                className={`aspect-square rounded-md grid place-items-center num text-[10px] font-semibold transition-transform hover:scale-105 ${on ? 'ring-2 ring-pb' : ''}`}
                style={{
                  background: lv === 'mastered' ? 'var(--go)' : lv === 'learning' ? 'color-mix(in srgb, var(--go) 32%, var(--raised))' : 'var(--raised)',
                  color: lv === 'mastered' ? 'var(--go-ink)' : 'var(--ink)',
                }}
              >
                {c.short}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-go" />mastered</span>
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-[color-mix(in_srgb,var(--go)_32%,var(--raised))]" />learning</span>
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-raised border border-line" />new</span>
        </div>
        <p className="text-xs text-muted">Mastered means you&apos;ve graded it well enough to push the next review a week or more out.</p>
        {confirmReset ? (
          <div className="flex items-center gap-2">
            <button className="btn btn-sm bg-stop text-white" onClick={() => { resetTraining(`${set}:`); setConfirmReset(false); pickNext() }}>Reset {set.toUpperCase()} progress</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(false)}>Keep</button>
          </div>
        ) : (
          <button className="btn btn-ghost btn-sm self-start" onClick={() => setConfirmReset(true)}><RotateCcw size={13} /> Reset progress</button>
        )}
      </aside>

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.name ?? ''} wide>
        {preview && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-5 items-center">
              <CaseDiagram c={preview} size={180} />
              <div className="flex flex-col gap-3 flex-1 min-w-0">
                <div className="num text-[15px] leading-relaxed rounded-xl bg-raised px-3.5 py-3">{preview.alg}</div>
                <span className="text-xs text-muted">
                  {training[preview.key] ? `${levelOf(training[preview.key])} · next review ${new Date(training[preview.key].due).toLocaleDateString()}` : 'Not started yet'}
                </span>
                <button className="btn btn-primary self-start" onClick={() => { start(CASE_BY_KEY[preview.key], true); setPreview(null) }}>Drill this case now</button>
              </div>
            </div>
            <CubePlayer puzzle="3x3x3" setup={`z2 ${invertAlg(preview.alg)}`} alg={preview.alg} height={240} />
          </div>
        )}
      </Modal>
    </div>
  )
}
