'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, Eye, Map as MapIcon, Shuffle } from 'lucide-react'
import { useCubiqStore } from '@/store'
import { CubePlayer } from '@/components/lab/CubePlayer'
import { ScramblePreview } from '@/components/practice/ScramblePreview'
import { LessonLayout, MoveLine, PlanGrade } from '@/components/lessons/LessonShell'
import { EdgeMap } from './EdgeMap'
import { TRACK_BY_ID, type Lesson } from '@/lib/lessons/catalog'
import { crossCaseFor, edgeToPrice } from '@/lib/lessons/crossCases'
import {
  COLOUR_VAR, EDGE_SIDE, describe, edgeName, labelSteps, soloRoute, soloTable,
  type CrossCase,
} from '@/lib/lessons/crossEngine'

// The cube as the lessons hold it: white on the bottom. cubing.js starts
// with white on top, so every view gets a z2 first.
const held = (scramble: string) => `z2 ${scramble}`

function Chip({ edge }: { edge: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-semibold text-ink whitespace-nowrap">
      <span className="inline-flex rounded-[3px] overflow-hidden shadow-[inset_0_0_0_1px_rgba(0,0,0,.2)]">
        <i className="w-2.5 h-3" style={{ background: 'var(--st-U)' }} />
        <i className="w-2.5 h-3" style={{ background: COLOUR_VAR[EDGE_SIDE[edge]] }} />
      </span>
      {edgeName(edge)}
    </span>
  )
}

function ScrambleLine({ scramble }: { scramble: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label">Scramble · white on the bottom, green in front</span>
      <p className="num text-[13px] leading-relaxed text-ink-2 break-words">{scramble}</p>
    </div>
  )
}

/** Every white edge: where it is and what it costs on its own. */
function EdgeReadout({ subs }: { subs: readonly number[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label">Reading the scramble</span>
      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
        {subs.map((s, i) => {
          const cost = soloTable(i)[s]
          return (
            <li key={i} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-3 px-3 py-2 text-[13px]">
              <Chip edge={i} />
              <span className="text-ink-2">{describe(i, s)}</span>
              <span className="num text-[11px] text-muted whitespace-nowrap">{cost === 0 ? 'done' : `${cost} alone`}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** The optimal solution, move by move, following the cube as it plays. */
function Walkthrough({ c, height = 250 }: { c: CrossCase; height?: number }) {
  const [at, setAt] = useState(-1)
  const moves = c.solutions[0]
  const steps = useMemo(() => labelSteps(c.subs, moves), [c, moves])
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
      <CubePlayer puzzle="3x3x3" setup={held(c.scramble)} alg={moves.join(' ')} height={height} onMove={i => setAt(i)} />
      <div className="flex flex-col gap-2 min-w-0">
        <span className="label">Optimal cross · {moves.length} moves</span>
        <ol className="flex flex-col gap-1.5">
          {steps.map((s, i) => (
            <li
              key={i}
              className={`grid grid-cols-[40px_1fr] items-baseline gap-2 rounded-lg px-2 py-1.5 transition-colors ${i === at ? 'bg-[color-mix(in_srgb,var(--go)_12%,transparent)]' : ''}`}
            >
              <span className="num text-[14px] font-semibold text-ink">{s.move}</span>
              <span className="text-[13px] text-ink-2">{s.text}</span>
            </li>
          ))}
          {!steps.length && <li className="text-sm text-muted">Already solved.</li>}
        </ol>
        {c.solutions.length > 1 && (
          <div className="flex flex-col gap-1.5 pt-1">
            <span className="text-[12px] text-muted">
              {c.solutions.length > 11 ? 'Many other' : `${c.solutions.length - 1} other`} optimal solution{c.solutions.length > 2 ? 's' : ''}, e.g.
            </span>
            <MoveLine moves={c.solutions[1]} />
          </div>
        )}
      </div>
    </div>
  )
}

function CrossExample({ lesson }: { lesson: Lesson }) {
  const [c, setC] = useState<CrossCase>(() => crossCaseFor(lesson.id))
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ScrambleLine scramble={c.scramble} />
        <button className="btn btn-ghost btn-sm" onClick={() => setC(crossCaseFor(lesson.id))}><Shuffle size={13} /> Another example</button>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 items-start">
        <EdgeReadout subs={c.subs} />
        <div className="grid place-items-center"><EdgeMap subs={c.subs} /></div>
      </div>
      <Walkthrough c={c} />
    </div>
  )
}

// ── Drills ────────────────────────────────────────────────────────────────────

function StillCube({ scramble }: { scramble: string }) {
  return (
    <div className="grid place-items-center rounded-xl bg-sunk/60 py-2">
      <ScramblePreview scramble={held(scramble)} puzzle="333" mode="3d" size={220} />
      <span className="text-[11px] text-muted pb-1">drag to look around</span>
    </div>
  )
}

function FindDrill({ lesson }: { lesson: Lesson }) {
  const recordLesson = useCubiqStore(s => s.recordLesson)
  const fresh = () => { const c = crossCaseFor(lesson.id); return { c, edge: Math.floor(Math.random() * 4), picked: null as number | null } }
  const [q, setQ] = useState(fresh)
  const truth = q.c.subs[q.edge] >> 1
  const pick = (slot: number) => {
    if (q.picked !== null) return
    setQ({ ...q, picked: slot })
    recordLesson(lesson.id, slot === truth)
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_minmax(0,1fr)] items-start">
      <StillCube scramble={q.c.scramble} />
      <div className="flex flex-col gap-3 min-w-0">
        <p className="text-[15px] text-ink">Where is <Chip edge={q.edge} />?</p>
        <EdgeMap
          subs={q.c.subs} only={q.picked === null ? [] : [q.edge]} onPick={q.picked === null ? pick : undefined}
          marks={q.picked === null ? {} : { [q.picked]: q.picked === truth ? 'right' : 'wrong', [truth]: 'right' }}
          label="Tap the slot where the edge is"
        />
        {q.picked !== null && (
          <div className="flex flex-wrap items-center gap-3">
            <span className={`text-[13.5px] font-semibold ${q.picked === truth ? 'text-go' : 'text-stop'}`}>
              {q.picked === truth ? 'Right.' : 'Not there.'}
            </span>
            <span className="text-[13.5px] text-ink-2">It is in the {describe(q.edge, q.c.subs[q.edge])}.</span>
            <button className="btn btn-primary btn-sm ml-auto" onClick={() => setQ(fresh())}>Next <ArrowRight size={13} /></button>
          </div>
        )}
      </div>
    </div>
  )
}

function CostDrill({ lesson }: { lesson: Lesson }) {
  const recordLesson = useCubiqStore(s => s.recordLesson)
  const fresh = () => { const c = crossCaseFor(lesson.id); return { c, ...edgeToPrice(c), guess: null as number | null } }
  const [q, setQ] = useState(fresh)
  const guess = (n: number) => {
    if (q.guess !== null) return
    setQ({ ...q, guess: n })
    recordLesson(lesson.id, n === q.cost)
  }
  const sub = q.c.subs[q.edge]
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_minmax(0,1fr)] items-start">
      <StillCube scramble={q.c.scramble} />
      <div className="flex flex-col gap-3 min-w-0">
        <p className="text-[15px] text-ink">How many moves does <Chip edge={q.edge} /> need to get home, ignoring the other edges?</p>
        <div className="grid grid-cols-3 gap-2 max-w-sm">
          {[1, 2, 3].map(n => (
            <button
              key={n} onClick={() => guess(n)} disabled={q.guess !== null && n !== q.guess && n !== q.cost}
              className={`py-3 rounded-xl border num text-lg font-semibold transition-colors ${
                q.guess === null ? 'border-line hover:border-line-strong text-ink'
                  : n === q.cost ? 'border-go text-go bg-[color-mix(in_srgb,var(--go)_9%,transparent)]'
                    : n === q.guess ? 'border-stop text-stop' : 'border-line text-faint'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        {q.guess !== null && (
          <div className="flex flex-col gap-3">
            <p className="text-[13.5px] text-ink-2">
              <span className={`font-semibold ${q.guess === q.cost ? 'text-go' : 'text-stop'}`}>{q.guess === q.cost ? 'Right.' : `It takes ${q.cost}.`}</span>{' '}
              It is in the {describe(q.edge, sub)}. Shortest route on its own:
            </p>
            <MoveLine moves={soloRoute(q.edge, sub)} />
            <EdgeMap subs={q.c.subs} only={[q.edge]} />
            <button className="btn btn-primary btn-sm self-start" onClick={() => setQ(fresh())}>Next <ArrowRight size={13} /></button>
          </div>
        )}
      </div>
    </div>
  )
}

function PlanTimer({ leftMs, totalMs }: { leftMs: number; totalMs: number }) {
  const r = 22, c = 2 * Math.PI * r
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 56 56" width="44" height="44" className="-rotate-90" aria-hidden>
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
        <circle
          cx="28" cy="28" r={r} fill="none" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - leftMs / totalMs)}
          stroke={leftMs < 3000 ? 'var(--stop)' : leftMs < 7000 ? 'var(--plus2)' : 'var(--go)'}
        />
      </svg>
      <span className="num text-xl font-semibold">{Math.ceil(leftMs / 1000)}</span>
      <span className="text-xs text-muted">{leftMs ? 'seconds to plan' : 'time: reveal when ready'}</span>
    </span>
  )
}

function PlanDrill({ lesson }: { lesson: Lesson }) {
  const level = useCubiqStore(s => s.lessons[lesson.id]?.level ?? 0)
  const recordLesson = useCubiqStore(s => s.recordLesson)
  const planMs = lesson.levels?.[level]?.planMs
  const [c, setC] = useState<CrossCase>(() => crossCaseFor(lesson.id, level))
  const [revealed, setRevealed] = useState(false)
  const [hint, setHint] = useState(false)
  const [t0, setT0] = useState(() => performance.now())
  const [now, setNow] = useState(0)

  const next = useCallback(() => {
    const lv = useCubiqStore.getState().lessons[lesson.id]?.level ?? 0
    setC(crossCaseFor(lesson.id, lv))
    setRevealed(false)
    setHint(false)
    setT0(performance.now())
    setNow(0)
  }, [lesson.id])

  useEffect(() => {
    if (revealed || !planMs) return
    const id = setInterval(() => setNow(performance.now()), 100)
    return () => clearInterval(id)
  }, [revealed, planMs])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.code !== 'Space' || t.tagName === 'INPUT' || document.querySelector('[role="dialog"]')) return
      if (!revealed) { e.preventDefault(); setRevealed(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed])

  const grade = (g: 'found' | 'close' | 'missed') => {
    recordLesson(lesson.id, g === 'found', lesson.levels?.length ?? 1)
    next()
  }
  const leftMs = planMs ? Math.max(0, planMs - (now ? now - t0 : 0)) : 0

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_minmax(0,1fr)] items-start">
        <StillCube scramble={c.scramble} />
        <div className="flex flex-col gap-3 min-w-0">
          <ScrambleLine scramble={c.scramble} />
          <p className="text-[14px] text-ink-2">
            Plan the white cross{c.length ? <> in <span className="num font-semibold text-ink">{c.length}</span> moves</> : ''}, then reveal.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {planMs && !revealed && <PlanTimer leftMs={leftMs} totalMs={planMs} />}
            {!revealed && (
              <>
                <button className="btn btn-primary" onClick={() => setRevealed(true)}><Eye size={15} /> Reveal <kbd className="!bg-transparent !border-go-ink/30 !text-go-ink">Space</kbd></button>
                <button className="btn btn-ghost btn-sm" onClick={() => setHint(h => !h)}><MapIcon size={13} /> {hint ? 'Hide' : 'Show'} the layer map</button>
              </>
            )}
          </div>
          {hint && !revealed && <EdgeMap subs={c.subs} />}
        </div>
      </div>
      {revealed && (
        <div className="flex flex-col gap-4 animate-fade-in">
          <Walkthrough c={c} height={230} />
          <span className="text-[13px] text-ink-2">How did your plan compare?</span>
          <PlanGrade onGrade={grade} />
        </div>
      )}
    </div>
  )
}

export function CrossLesson({ lesson }: { lesson: Lesson }) {
  const drill = lesson.kind === 'cross-find' ? <FindDrill key={lesson.id} lesson={lesson} />
    : lesson.kind === 'cross-cost' ? <CostDrill key={lesson.id} lesson={lesson} />
      : <PlanDrill key={lesson.id} lesson={lesson} />
  return (
    <LessonLayout
      track={TRACK_BY_ID.cross}
      lesson={lesson}
      example={<CrossExample key={lesson.id} lesson={lesson} />}
      drill={drill}
    />
  )
}
