'use client'
import { useMemo, useState } from 'react'
import { ArrowRight, Eye, Shuffle } from 'lucide-react'
import { useCubiqStore } from '@/store'
import { Sq1View3D } from '@/components/solvers/Sq1View3D'
import { LessonLayout } from '@/components/lessons/LessonShell'
import { LayerDiscs } from './LayerDiscs'
import { TRACK_BY_ID, type Lesson } from '@/lib/lessons/catalog'
import { generateScramble } from '@/lib/cubing'
import { SOLVED, applySq1Token, norm, parseSq1Tokens } from '@/lib/sq1'
import {
  cornersIn, depthTo44, layerName, routeDown, shapeCases, slashLegal, straddles, tokensText, typesOf,
  type ShapeCase, type W,
} from '@/lib/lessons/sq1Shapes'
import { NEW_PER_DAY, nextHint, type Grade } from '@/lib/learn'

const stateOf = (s: string): W => parseSq1Tokens(s).reduce(applySq1Token, SOLVED)
const tw = (w: W, u: number, d: number) => applySq1Token(w, { kind: 'twist', u, d })
const slash = (w: W) => applySq1Token(w, { kind: 'slash' })
const split = (w: W) => { const t = typesOf(w); return [cornersIn(t.slice(0, 12)), cornersIn(t.slice(12))] }
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]
const shuffle = <T,>(xs: T[]) => [...xs].sort(() => Math.random() - 0.5)
const twistText = (u: number, d: number) => `(${norm(u)},${norm(d)})`

function Still({ scramble, alg = '' }: { scramble: string; alg?: string }) {
  return (
    <div className="rounded-xl bg-sunk/60 px-2 py-2 grid place-items-center">
      <Sq1View3D key={scramble + alg} setup={scramble} alg={alg} height={alg ? 240 : 200} controls={!!alg} />
    </div>
  )
}

function ScrambleText({ s }: { s: string }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className="label">Scramble</span>
      <p className="num text-[13px] leading-relaxed text-ink-2 break-words">{s}</p>
    </div>
  )
}

function Options<T extends string | number>({ options, answer, chosen, onPick, render }: {
  options: T[]; answer: (o: T) => boolean; chosen: T | null; onPick: (o: T) => void; render?: (o: T) => React.ReactNode
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-w-lg">
      {options.map(o => {
        const state = chosen === null ? '' : answer(o) ? 'right' : o === chosen ? 'wrong' : 'other'
        return (
          <button
            key={String(o)} disabled={chosen !== null} onClick={() => onPick(o)}
            className={`py-2.5 rounded-xl border num text-[15px] font-semibold transition-colors ${
              state === 'right' ? 'border-go text-go bg-[color-mix(in_srgb,var(--go)_9%,transparent)]'
                : state === 'wrong' ? 'border-stop text-stop' : state === 'other' ? 'border-line text-faint' : 'border-line text-ink hover:border-line-strong'
            }`}
          >
            {render ? render(o) : String(o)}
          </button>
        )
      })}
    </div>
  )
}

// ── Case makers ───────────────────────────────────────────────────────────────

function readCase() {
  const scramble = generateScramble('sq1')
  return { scramble, w: stateOf(scramble) }
}

/** Bottom lined up, top blocked: which top turn lets the slash through? */
function slashCase() {
  for (;;) {
    const scramble = generateScramble('sq1')
    const w = stateOf(scramble)
    const ds = Array.from({ length: 12 }, (_, d) => norm(d)).filter(d => straddles(tw(w, 0, d)).every(s => s < 12))
    const d0 = pick(ds)
    const us = Array.from({ length: 12 }, (_, u) => norm(u))
    const blocked = us.filter(u => !slashLegal(tw(w, u, d0)))
    if (!blocked.length) continue
    const u0 = pick(blocked)
    const q = tw(w, u0, d0)
    const good = us.filter(u => u !== 0 && slashLegal(tw(q, u, 0)))
    const bad = us.filter(u => u !== 0 && !slashLegal(tw(q, u, 0)))
    if (!good.length || bad.length < 3) continue
    const answer = pick(good)
    const options = shuffle([answer, ...shuffle(bad).slice(0, 3)]).sort((a, b) => a - b)
    return { scramble: `${scramble} ${twistText(u0, d0)}`, w: q, options, good }
  }
}

/** 6/2 or 5/3: which twist's slash gives 4/4? */
function balanceCase() {
  for (;;) {
    const scramble = generateScramble('sq1')
    const w = stateOf(scramble)
    if (split(w).includes(4)) continue
    const legal: [number, number][] = []
    for (let u = -5; u <= 6; u++) for (let d = -5; d <= 6; d++) if (slashLegal(tw(w, u, d))) legal.push([u, d])
    const is44 = ([u, d]: [number, number]) => { const [a, b] = split(slash(tw(w, u, d))); return a === 4 && b === 4 }
    const good = legal.filter(is44), bad = legal.filter(x => !is44(x))
    if (!good.length || bad.length < 3) continue
    const answer = pick(good)
    const options = shuffle([answer, ...shuffle(bad).slice(0, 3)]).map(([u, d]) => twistText(u, d))
    return { scramble, w, options, good: good.map(([u, d]) => twistText(u, d)), answer: twistText(...answer) }
  }
}

// ── Examples ──────────────────────────────────────────────────────────────────

function ReadExample() {
  const [c, setC] = useState(readCase)
  const [a, b] = split(c.w)
  const t = typesOf(c.w)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ScrambleText s={c.scramble} />
        <button className="btn btn-ghost btn-sm" onClick={() => setC(readCase())}><Shuffle size={13} /> Another example</button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 items-center">
        <Still scramble={c.scramble} />
        <div className="flex flex-col gap-3 items-center">
          <LayerDiscs types={t} />
          <p className="text-[13.5px] text-ink-2 text-center">
            Top: {layerName(t.slice(0, 12))}. Bottom: {layerName(t.slice(12))}. Split <span className="num font-semibold text-ink">{a}/{b}</span>.
          </p>
        </div>
      </div>
    </div>
  )
}

function SlashExample() {
  const [c, setC] = useState(slashCase)
  const fix = c.good[0]
  const after = tw(c.w, fix, 0)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ScrambleText s={c.scramble} />
        <button className="btn btn-ghost btn-sm" onClick={() => setC(slashCase())}><Shuffle size={13} /> Another example</button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2 items-center">
          <span className="label">Blocked: red corners sit across the line</span>
          <LayerDiscs types={typesOf(c.w)} straddle={straddles(c.w)} />
        </div>
        <div className="flex flex-col gap-2 items-center">
          <span className="label">After {twistText(fix, 0)}: both ends on a gap</span>
          <LayerDiscs types={typesOf(after)} />
        </div>
      </div>
      <p className="text-[13px] text-muted">Top turns that work here: {c.good.map(u => twistText(u, 0)).join(', ')}.</p>
    </div>
  )
}

function BalanceExample() {
  const [c, setC] = useState(balanceCase)
  const [u, d] = parseSq1Tokens(c.answer).map(t => (t.kind === 'twist' ? [t.u, t.d] : [0, 0]))[0]
  const after = slash(tw(c.w, u, d))
  const [a, b] = split(c.w)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ScrambleText s={c.scramble} />
        <button className="btn btn-ghost btn-sm" onClick={() => setC(balanceCase())}><Shuffle size={13} /> Another example</button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2 items-center">
          <span className="label">Split {a}/{b}</span>
          <LayerDiscs types={typesOf(tw(c.w, u, d))} />
          <span className="text-[12.5px] text-muted text-center">after the twist {c.answer}: the shaded halves swap</span>
        </div>
        <div className="flex flex-col gap-2 items-center">
          <span className="label">After {c.answer} /: split 4/4</span>
          <LayerDiscs types={typesOf(after)} />
        </div>
      </div>
      <Still scramble={c.scramble} alg={`${c.answer} /`} />
    </div>
  )
}

function CaseCard({ c, reveal }: { c: ShapeCase; reveal: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {/* drawn as the scramble leaves it, so the slash line matches the route's first move */}
      <div className="grid place-items-center"><LayerDiscs types={typesOf(stateOf(c.scramble))} detail /></div>
      {reveal && (
        <div className="flex flex-col gap-3 animate-fade-in">
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="label">Route to cube shape · {c.slashes} slash{c.slashes > 1 ? 'es' : ''}</span>
            <span className="num text-[15px] font-semibold text-ink">{c.route}</span>
          </div>
          <Still scramble={c.scramble} alg={c.route} />
        </div>
      )}
    </div>
  )
}

function CubeExample() {
  const cases = useMemo(() => shapeCases(), [])
  const [c, setC] = useState(() => pick(cases))
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] text-ink-2 max-w-[60ch]">
          There are <span className="num font-semibold text-ink">{cases.length}</span> ways to have 4 corners on each layer without being a cube. Each has a fixed shortest route.
        </p>
        <button className="btn btn-ghost btn-sm" onClick={() => setC(pick(cases))}><Shuffle size={13} /> Another case</button>
      </div>
      <CaseCard c={c} reveal />
    </div>
  )
}

// ── Drills ────────────────────────────────────────────────────────────────────

function QuizDrill<T extends string | number>({ lesson, make, question, options, isRight, explain, render }: {
  lesson: Lesson
  make: () => { scramble: string; w: W } & Record<string, unknown>
  question: string
  options: (c: ReturnType<typeof make>) => T[]
  isRight: (c: ReturnType<typeof make>, o: T) => boolean
  explain: (c: ReturnType<typeof make>) => React.ReactNode
  render?: (o: T) => React.ReactNode
}) {
  const recordLesson = useCubiqStore(s => s.recordLesson)
  const [c, setC] = useState(make)
  const [chosen, setChosen] = useState<T | null>(null)
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_minmax(0,1fr)] items-start">
      <Still scramble={c.scramble} />
      <div className="flex flex-col gap-3 min-w-0">
        <ScrambleText s={c.scramble} />
        <p className="text-[15px] text-ink">{question}</p>
        <Options
          options={options(c)} answer={o => isRight(c, o)} chosen={chosen} render={render}
          onPick={o => { setChosen(o); recordLesson(lesson.id, isRight(c, o)) }}
        />
        {chosen !== null && (
          <div className="flex flex-col gap-3 animate-fade-in">
            <span className={`text-[13.5px] font-semibold ${isRight(c, chosen) ? 'text-go' : 'text-stop'}`}>{isRight(c, chosen) ? 'Right.' : 'Not quite.'}</span>
            {explain(c)}
            <button className="btn btn-primary btn-sm self-start" onClick={() => { setC(make()); setChosen(null) }}>Next <ArrowRight size={13} /></button>
          </div>
        )}
      </div>
    </div>
  )
}

const GRADES: { g: Grade; label: string }[] = [
  { g: 'again', label: 'Again' }, { g: 'hard', label: 'Hard' }, { g: 'good', label: 'Good' }, { g: 'easy', label: 'Easy' },
]

function CaseTrainerDrill({ lesson }: { lesson: Lesson }) {
  const cases = useMemo(() => shapeCases(), [])
  const training = useCubiqStore(s => s.training)
  const gradeCase = useCubiqStore(s => s.gradeCase)
  const completeLesson = useCubiqStore(s => s.completeLesson)
  const learned = cases.filter(c => (training[c.key]?.reps ?? 0) > 0).length
  const queue = () => {
    const tr = useCubiqStore.getState().training
    const now = Date.now()
    const due = cases.filter(c => tr[c.key] && tr[c.key].due <= now).sort((a, b) => tr[a.key].due - tr[b.key].due)
    const today = new Date().toDateString()
    const newToday = cases.filter(c => tr[c.key] && new Date(tr[c.key].introduced).toDateString() === today).length
    const fresh = cases.filter(c => !tr[c.key]).slice(0, Math.max(0, NEW_PER_DAY - newToday))
    return [...due, ...fresh]
  }
  const [cur, setCur] = useState<ShapeCase | null>(() => queue()[0] ?? null)
  const [shown, setShown] = useState(false)
  const grade = (g: Grade) => {
    if (!cur) return
    gradeCase(cur.key, g, {})
    const tr = useCubiqStore.getState().training
    if (cases.every(c => (tr[c.key]?.reps ?? 0) > 0)) completeLesson(lesson.id)
    setShown(false)
    setCur(queue()[0] ?? null)
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-raised px-4 py-3">
        <span className="label">Cases learned</span>
        <span className="num text-[13px] text-ink">{learned} / {cases.length}</span>
        <span className="text-[12px] text-muted">New cases unlock {NEW_PER_DAY} a day; reviews come back on schedule.</span>
      </div>
      {cur ? (
        <>
          <CaseCard c={cur} reveal={shown} />
          {!shown ? (
            <button className="btn btn-primary self-start" onClick={() => setShown(true)}><Eye size={15} /> Reveal the route</button>
          ) : (
            <div className="grid grid-cols-4 gap-2" role="group" aria-label="How well did you know it?">
              {GRADES.map(({ g, label }) => (
                <button
                  key={g} onClick={() => grade(g)}
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border transition-colors ${g === 'good' ? 'border-go text-go bg-[color-mix(in_srgb,var(--go)_9%,transparent)]' : 'border-line text-ink-2 hover:border-line-strong'}`}
                >
                  <span className="text-[13px] font-semibold">{label}</span>
                  <span className="num text-[10px] text-muted">{nextHint(training[cur.key], g)}</span>
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-3 items-start">
          <p className="text-sm text-ink-2">No cases due right now. Come back tomorrow for new ones, or practise a random case.</p>
          <button className="btn btn-primary btn-sm" onClick={() => { setCur(pick(cases)); setShown(false) }}>Practise a random case</button>
        </div>
      )}
    </div>
  )
}

export function Sq1Lesson({ lesson }: { lesson: Lesson }) {
  let example: React.ReactNode, drill: React.ReactNode
  switch (lesson.kind) {
    case 'sq1-read':
      example = <ReadExample />
      drill = (
        <QuizDrill<number>
          lesson={lesson} make={readCase} question="How many corners are on the top layer?"
          options={() => [2, 3, 4, 5, 6]} isRight={(c, o) => split(c.w)[0] === o}
          explain={c => <div className="grid place-items-center"><LayerDiscs types={typesOf(c.w)} /></div>}
        />
      )
      break
    case 'sq1-slash':
      example = <SlashExample />
      drill = (
        <QuizDrill<number>
          lesson={lesson} make={slashCase} question="Which top turn lets the slash through?"
          options={c => c.options as number[]} isRight={(c, o) => (c.good as number[]).includes(o)} render={u => twistText(u, 0)}
          explain={c => (
            <div className="flex flex-col items-center gap-2">
              <LayerDiscs types={typesOf(c.w)} straddle={straddles(c.w)} />
              <span className="text-[12.5px] text-muted">Top turns that work: {(c.good as number[]).map(u => twistText(u, 0)).join(', ')}</span>
            </div>
          )}
        />
      )
      break
    case 'sq1-balance':
      example = <BalanceExample />
      drill = (
        <QuizDrill<string>
          lesson={lesson} make={balanceCase} question="Which twist, followed by a slash, gives 4 corners on each layer?"
          options={c => c.options as string[]} isRight={(c, o) => (c.good as string[]).includes(o)}
          explain={c => {
            const route = routeDown(c.w, k => depthTo44().get(k))
            return (
              <div className="flex flex-col gap-2">
                <span className="text-[12.5px] text-muted">Every twist that works: {(c.good as string[]).join(', ')}</span>
                <Still scramble={c.scramble} alg={route.length ? tokensText(route) : `${c.answer} /`} />
              </div>
            )
          }}
        />
      )
      break
    default:
      example = <CubeExample />
      drill = <CaseTrainerDrill lesson={lesson} />
  }
  return <LessonLayout track={TRACK_BY_ID.sq1} lesson={lesson} example={example} drill={drill} />
}
