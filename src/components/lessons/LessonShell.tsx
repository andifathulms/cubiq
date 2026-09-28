'use client'
import { Check, Hand } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCubiqStore } from '@/store'
import { PASS_HITS, WINDOW, standing, type LessonProgress } from '@/lib/lessons/progress'
import { TRACKS, type Lesson, type Track } from '@/lib/lessons/catalog'

export function lessonStatus(l: Lesson, p: LessonProgress | undefined): string {
  if (p?.passed) return 'Passed'
  if (!p) return 'Not started'
  if (l.levels && l.levels.length > 1) return `Level ${p.level + 1} of ${l.levels.length}`
  const { hits } = standing(p)
  return l.watchOnly || l.trainer ? 'Started' : `${hits} of ${PASS_HITS} hits`
}

/** Track and lesson list; the open lesson is highlighted. */
export function LessonNav({ openId, onOpen }: { openId: string; onOpen: (id: string) => void }) {
  const lessons = useCubiqStore(s => s.lessons)
  return (
    <nav className="flex flex-col gap-5" aria-label="Lessons">
      {TRACKS.map(t => (
        <div key={t.id} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <i className="w-3 h-3 rounded-[3px] shadow-[inset_0_0_0_1px_rgba(0,0,0,.18)]" style={{ background: t.colour }} />
            <span className="label">{t.title}</span>
            <span className="num text-[10.5px] text-faint ml-auto">
              {t.lessons.filter(l => lessons[l.id]?.passed).length}/{t.lessons.length}
            </span>
          </div>
          <ol className="flex flex-col gap-1">
            {t.lessons.map((l, i) => {
              const on = l.id === openId
              const p = lessons[l.id]
              return (
                <li key={l.id}>
                  <button
                    type="button" onClick={() => onOpen(l.id)} aria-current={on ? 'page' : undefined}
                    className={`w-full text-left flex items-center gap-3 rounded-xl px-3 py-2 transition-colors ${on ? 'bg-raised' : 'hover:bg-raised/60'}`}
                  >
                    <span
                      className={`num text-[11px] font-semibold w-6 h-6 shrink-0 rounded-lg grid place-items-center border ${p?.passed ? 'bg-go border-go text-go-ink' : 'border-line-strong text-muted'}`}
                    >
                      {p?.passed ? <Check size={13} strokeWidth={3} /> : i + 1}
                    </span>
                    <span className="flex flex-col min-w-0">
                      <span className={`text-[13.5px] leading-snug ${on ? 'font-semibold text-ink' : 'text-ink-2'}`}>{l.title}</span>
                      <span className="text-[11px] text-muted">{lessonStatus(l, p)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </nav>
  )
}

/** Level, last-10 dots and what passing takes. */
export function ProgressStrip({ lesson }: { lesson: Lesson }) {
  const p = useCubiqStore(s => s.lessons[lesson.id])
  const resetLesson = useCubiqStore(s => s.resetLesson)
  const level = lesson.levels?.[p?.level ?? 0]
  const results = p?.results ?? []
  const { hits } = standing(p)
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-raised px-4 py-3">
      {lesson.levels && lesson.levels.length > 1 && (
        <span className="flex items-center gap-2 text-[13px]">
          <span className="label">Level {(p?.level ?? 0) + 1}/{lesson.levels.length}</span>
          <span className="text-ink-2">{level?.label}</span>
        </span>
      )}
      {!lesson.watchOnly && !lesson.trainer && (
        <span className="flex items-center gap-2" aria-label={`${hits} hits in the last ${results.length} tries`}>
          <span className="flex gap-1">
            {Array.from({ length: WINDOW }, (_, i) => {
              const r = results[i]
              return (
                <i
                  key={i}
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: r === undefined ? 'var(--line)' : r ? 'var(--go)' : 'var(--stop)' }}
                />
              )
            })}
          </span>
          <span className="text-[12px] text-muted">{PASS_HITS} of the last {WINDOW} {lesson.levels && lesson.levels.length > 1 ? 'moves you up' : 'passes'}</span>
        </span>
      )}
      <span className="ml-auto flex items-center gap-3">
        {p?.passed && <span className="text-[12px] font-semibold text-go flex items-center gap-1"><Check size={13} /> Passed</span>}
        {p && <button className="text-[12px] text-muted hover:text-ink underline-offset-2 hover:underline" onClick={() => resetLesson(lesson.id)}>Reset</button>}
      </span>
    </div>
  )
}

/** Title block + "what to look at" + slots for the example and the drill. */
export function LessonLayout({ track, lesson, example, drill }: {
  track: Track
  lesson: Lesson
  example: ReactNode
  drill: ReactNode
}) {
  return (
    <article className="flex flex-col gap-4 min-w-0">
      <header className="card p-4 md:p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="label flex items-center gap-2">
            <i className="w-2.5 h-2.5 rounded-[3px]" style={{ background: track.colour }} />
            {track.title} · lesson {track.lessons.indexOf(lesson) + 1} of {track.lessons.length}
          </span>
          <h2 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-balance">{lesson.title}</h2>
          <p className="text-[15px] text-ink-2 max-w-[65ch]">{lesson.goal}</p>
        </div>
        <div className="flex flex-col gap-2">
          <span className="label">What to look at</span>
          <ol className="flex flex-col gap-2 max-w-[70ch]">
            {lesson.see.map((s, i) => (
              <li key={i} className="grid grid-cols-[24px_1fr] gap-2 text-[14px] leading-relaxed text-ink-2">
                <span className="num text-[11px] font-semibold text-go pt-[3px]">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </div>
        {(track.hold || track.after) && (
          <p className="text-[12.5px] text-muted flex flex-wrap items-center gap-x-4 gap-y-1">
            {track.hold && <span className="flex items-center gap-1.5"><Hand size={12} className="shrink-0" /> {track.hold}</span>}
            {track.after && <span>{track.after}.</span>}
          </p>
        )}
      </header>
      <section className="card p-4 md:p-6 flex flex-col gap-4">
        <span className="label">Worked example</span>
        {example}
      </section>
      <section className="card p-4 md:p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="label">Drill</span>
          <p className="text-[14px] text-ink-2">{lesson.drill}</p>
        </div>
        {!lesson.trainer && <ProgressStrip lesson={lesson} />}
        {drill}
      </section>
    </article>
  )
}

/** Found it / Within 2 / Missed — the self-grade after a planning drill. */
export function PlanGrade({ onGrade }: { onGrade: (g: 'found' | 'close' | 'missed') => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="How did your plan compare?">
      {([['found', 'Found it'], ['close', 'Within 2'], ['missed', 'Missed']] as const).map(([k, l]) => (
        <button
          key={k} onClick={() => onGrade(k)}
          className={`py-2.5 rounded-xl border text-[13px] font-semibold transition-colors ${k === 'found' ? 'border-go text-go bg-[color-mix(in_srgb,var(--go)_9%,transparent)]' : 'border-line text-ink-2 hover:border-line-strong'}`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

/** A move sequence as plain chips (no face colours: lessons use their own
 *  hold, where the WCA face colours would mislead). */
export function MoveLine({ moves, current = -1 }: { moves: readonly string[]; current?: number }) {
  if (!moves.length) return <span className="num text-sm text-muted">(already solved)</span>
  return (
    <span className="flex flex-wrap gap-1">
      {moves.map((m, i) => (
        <span
          key={i}
          className={`num text-[14px] font-semibold leading-none rounded-[7px] border px-1.5 pt-1.5 pb-[7px] min-w-[30px] text-center ${i === current ? 'bg-go text-go-ink border-go' : 'bg-surface text-ink border-line'}`}
        >
          {m}
        </span>
      ))}
    </span>
  )
}
