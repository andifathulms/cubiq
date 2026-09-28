'use client'
import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useCubiqStore } from '@/store'
import { CubePlayer } from '@/components/lab/CubePlayer'
import { Segmented } from '@/components/ui/Toggle'
import { LessonLayout, MoveLine } from '@/components/lessons/LessonShell'
import { ScrambleLine, StillCube, held } from '@/components/lessons/LessonCube'
import { TRACK_BY_ID, type Lesson } from '@/lib/lessons/catalog'
import { COLOUR_VAR, type Face } from '@/lib/lessons/crossEngine'
import { localSolve } from '@/lib/solvers/client'
import type { XCase, XSlot } from '@/lib/lessons/xcrossCases'

const SLOT_WORDS: Record<string, string> = { FR: 'front-right', FL: 'front-left', BR: 'back-right', BL: 'back-left' }

function SlotChip({ slot }: { slot: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="inline-flex rounded-[3px] overflow-hidden shadow-[inset_0_0_0_1px_rgba(0,0,0,.2)]">
        <i className="w-2.5 h-3" style={{ background: COLOUR_VAR[slot[0] as Face] }} />
        <i className="w-2.5 h-3" style={{ background: COLOUR_VAR[slot[1] as Face] }} />
      </span>
      <span className="font-semibold text-ink">{SLOT_WORDS[slot]}</span>
    </span>
  )
}

/** Fetch a lesson scramble from the worker; the first one builds the F2L
 *  tables, which takes a while once per visit. */
function useXCase(lessonId: string) {
  const [c, setC] = useState<XCase | null>(null)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [n, setN] = useState(0)
  useEffect(() => {
    let live = true
    localSolve<XCase>('/learn/xcross', { lesson: lessonId }, m => { if (live) setNote(m) })
      .then(r => { if (live) { setC(r); setNote('') } })
      .catch(e => { if (live) setErr(e instanceof Error ? e.message : String(e)) })
    return () => { live = false }
  }, [lessonId, n])
  const next = useCallback(() => { setC(null); setErr(''); setN(x => x + 1) }, [])
  return { c, note, err, next }
}

function Waiting({ note, err }: { note: string; err: string }) {
  if (err) return <p className="text-sm text-stop">Could not make a scramble: {err}</p>
  return (
    <p className="flex items-center gap-2 text-sm text-muted">
      <Loader2 size={15} className="animate-spin" />
      {note || 'Preparing a scramble'}{/Build|table/i.test(note) ? ' (first time only, can take 20 s)' : ''}…
    </p>
  )
}

const extraOf = (c: XCase, s: XSlot) => s.xcross.length - c.cross.length
const bestLen = (c: XCase) => Math.min(...c.slots.map(s => s.xcross.length))

/** Every slot: x-cross length, extra over the cross, and cross-then-pair. */
function SlotTable({ c, picked }: { c: XCase; picked?: string }) {
  const best = bestLen(c)
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-[13px] min-w-[420px]">
        <thead>
          <tr className="bg-raised text-left">
            {['Slot', 'X-cross', 'Extra over the cross', 'Cross, then pair'].map(h => (
              <th key={h} className="label !text-[10px] px-3 py-2 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {c.slots.map(s => {
            const top = s.xcross.length === best
            return (
              <tr key={s.slot} className={`border-t border-line ${top ? 'bg-[color-mix(in_srgb,var(--go)_8%,transparent)]' : ''}`}>
                <td className="px-3 py-2"><SlotChip slot={s.slot} />{picked === s.slot && <span className="ml-2 text-[11px] text-muted">your pick</span>}</td>
                <td className={`px-3 py-2 num ${top ? 'text-go font-semibold' : 'text-ink'}`}>{s.xcross.length} moves{top ? ' · best' : ''}</td>
                <td className="px-3 py-2 num text-ink-2">+{extraOf(c, s)}</td>
                <td className="px-3 py-2 num text-muted">{c.cross.length} + {s.pairAfter.length} = {c.cross.length + s.pairAfter.length}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** The best slot solved both ways, on one cube. */
function Compare({ c }: { c: XCase }) {
  const best = c.slots.reduce((a, s) => (s.xcross.length < a.xcross.length ? s : a))
  const [way, setWay] = useState<'x' | 'split'>('x')
  const [at, setAt] = useState(-1)
  const moves = way === 'x' ? best.xcross : [...c.cross, ...best.pairAfter]
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
      <CubePlayer key={way} puzzle="3x3x3" setup={held(c.scramble)} alg={moves.join(' ')} height={240} onMove={setAt} />
      <div className="flex flex-col gap-3 min-w-0">
        <Segmented
          label="Solve it" value={way} onChange={v => { setWay(v); setAt(-1) }}
          options={[{ value: 'x', label: `X-cross · ${best.xcross.length}` }, { value: 'split', label: `Cross, then pair · ${c.cross.length + best.pairAfter.length}` }]}
        />
        <p className="text-[13px] text-ink-2">
          {way === 'x'
            ? <>Cross and the <SlotChip slot={best.slot} /> pair planned together.</>
            : <>The optimal cross ({c.cross.length}), then the <SlotChip slot={best.slot} /> pair on its own ({best.pairAfter.length}).</>}
        </p>
        <MoveLine moves={moves} current={at} />
        <p className="text-[12.5px] text-muted">
          X-cross saves {c.cross.length + best.pairAfter.length - best.xcross.length} moves here.
        </p>
      </div>
    </div>
  )
}

function Example({ lesson }: { lesson: Lesson }) {
  const { c, note, err, next } = useXCase(lesson.id)
  if (!c) return <Waiting note={note} err={err} />
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ScrambleLine scramble={c.scramble} />
        <button className="btn btn-ghost btn-sm" onClick={next}>Another example</button>
      </div>
      <SlotTable c={c} />
      <Compare c={c} />
    </div>
  )
}

function WatchDrill({ lesson }: { lesson: Lesson }) {
  const completeLesson = useCubiqStore(s => s.completeLesson)
  const passed = useCubiqStore(s => s.lessons[lesson.id]?.passed)
  const { c, note, err, next } = useXCase(`${lesson.id}`)
  const [seen, setSeen] = useState(1)
  const total = lesson.watchOnly ?? 3
  if (!c) return <Waiting note={note} err={err} />
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="label">Scramble {Math.min(seen, total)} of {total}</span>
        {seen < total ? (
          <button className="btn btn-primary btn-sm" onClick={() => { setSeen(v => v + 1); next() }}>Next scramble <ArrowRight size={13} /></button>
        ) : passed ? (
          <span className="text-[13px] font-semibold text-go">Lesson passed</span>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={() => completeLesson(lesson.id)}>I&apos;ve seen the difference</button>
        )}
      </div>
      <ScrambleLine scramble={c.scramble} />
      <SlotTable c={c} />
      <Compare c={c} />
    </div>
  )
}

function PickDrill({ lesson }: { lesson: Lesson }) {
  const recordLesson = useCubiqStore(s => s.recordLesson)
  const planMs = lesson.levels?.[0]?.planMs
  const { c, note, err, next } = useXCase(lesson.id)
  const [picked, setPicked] = useState<string | null>(null)
  const [t0, setT0] = useState(0)
  const [now, setNow] = useState(0)

  useEffect(() => {
    if (!c || picked || !planMs) return
    const start = performance.now()
    const id = setInterval(() => { setT0(t => t || start); setNow(performance.now()) }, 100)
    return () => clearInterval(id)
  }, [c, picked, planMs])

  if (!c) return <Waiting note={note} err={err} />
  const best = bestLen(c)
  const left = planMs && t0 ? Math.max(0, planMs - (now - t0)) : planMs ?? 0
  const pick = (slot: string) => {
    if (picked) return
    setPicked(slot)
    recordLesson(lesson.id, c.slots.find(s => s.slot === slot)!.xcross.length === best, lesson.levels?.length ?? 1)
  }
  const hit = picked && c.slots.find(s => s.slot === picked)!.xcross.length === best
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_minmax(0,1fr)] items-start">
        <StillCube scramble={c.scramble} />
        <div className="flex flex-col gap-3 min-w-0">
          <ScrambleLine scramble={c.scramble} />
          <p className="text-[14px] text-ink-2">
            The optimal cross is <span className="num font-semibold text-ink">{c.cross.length}</span> moves. Which slot gives the shortest x-cross?
          </p>
          {planMs && !picked && (
            <span className={`num text-sm ${left < 5000 ? 'text-stop' : 'text-muted'}`}>{Math.ceil(left / 1000)} s{left ? '' : ': pick when ready'}</span>
          )}
          <div className="grid grid-cols-2 gap-2 max-w-md">
            {c.slots.map(s => {
              const state = !picked ? '' : s.xcross.length === best ? 'right' : s.slot === picked ? 'wrong' : 'other'
              return (
                <button
                  key={s.slot} onClick={() => pick(s.slot)} disabled={!!picked}
                  className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-[13px] transition-colors ${
                    state === 'right' ? 'border-go bg-[color-mix(in_srgb,var(--go)_9%,transparent)]'
                      : state === 'wrong' ? 'border-stop' : state === 'other' ? 'border-line opacity-60' : 'border-line hover:border-line-strong'
                  }`}
                >
                  <SlotChip slot={s.slot} />
                  {picked && <span className="num text-[12px] text-muted">{s.xcross.length}</span>}
                </button>
              )
            })}
          </div>
          {picked && (
            <div className="flex flex-wrap items-center gap-3">
              <span className={`text-[13.5px] font-semibold ${hit ? 'text-go' : 'text-stop'}`}>{hit ? 'Best slot.' : 'Another slot is shorter.'}</span>
              <button className="btn btn-primary btn-sm ml-auto" onClick={() => { setPicked(null); setT0(0); setNow(0); next() }}>Next <ArrowRight size={13} /></button>
            </div>
          )}
        </div>
      </div>
      {picked && (
        <div className="flex flex-col gap-4 animate-fade-in">
          <SlotTable c={c} picked={picked} />
          <Compare c={c} />
        </div>
      )}
    </div>
  )
}

export function XcrossLesson({ lesson }: { lesson: Lesson }) {
  return (
    <LessonLayout
      track={TRACK_BY_ID.xcross}
      lesson={lesson}
      example={<Example key={lesson.id} lesson={lesson} />}
      drill={lesson.kind === 'xc-watch' ? <WatchDrill key={lesson.id} lesson={lesson} /> : <PickDrill key={lesson.id} lesson={lesson} />}
    />
  )
}
