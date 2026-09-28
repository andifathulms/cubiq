'use client'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useCubiqStore } from '@/store'
import { LessonNav } from './LessonShell'
import { CrossLesson } from './cross/CrossLesson'
import { XcrossLesson } from './xcross/XcrossLesson'
import { Sq1Lesson } from './sq1/Sq1Lesson'
import { LESSON_BY_ID, TRACKS } from '@/lib/lessons/catalog'

const REMEMBER = 'cubiq:lesson'

function firstOpen(): string {
  try {
    const saved = localStorage.getItem(REMEMBER)
    if (saved && LESSON_BY_ID[saved]) return saved
  } catch { /* storage blocked: fall through */ }
  const done = useCubiqStore.getState().lessons
  const all = TRACKS.flatMap(t => t.lessons)
  return (all.find(l => !done[l.id]?.passed) ?? all[0]).id
}

/** Learn › Lessons: the lesson list beside the open lesson. */
export function LessonsHub() {
  const [openId, setOpenId] = useState(firstOpen)
  const [navOpen, setNavOpen] = useState(false)
  const open = (id: string) => {
    setOpenId(id)
    try { localStorage.setItem(REMEMBER, id) } catch { /* not saved: fine */ }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const lesson = LESSON_BY_ID[openId]
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)] items-start">
      <aside className="card p-3 lg:sticky lg:top-6">
        {/* phones: the list folds away behind the open lesson's name */}
        <button
          type="button" className="lg:hidden w-full flex items-center justify-between gap-3 px-2 py-1.5 text-left"
          aria-expanded={navOpen} onClick={() => setNavOpen(v => !v)}
        >
          <span className="flex flex-col">
            <span className="label">All lessons</span>
            <span className="text-[14px] font-semibold text-ink">{lesson.title}</span>
          </span>
          <ChevronDown size={16} className={`text-muted transition-transform ${navOpen ? 'rotate-180' : ''}`} />
        </button>
        <div className={`${navOpen ? 'block mt-3' : 'hidden'} lg:block lg:mt-0`}>
          <LessonNav openId={openId} onOpen={id => { setNavOpen(false); open(id) }} />
        </div>
      </aside>
      {lesson.track === 'cross' && <CrossLesson key={lesson.id} lesson={lesson} />}
      {lesson.track === 'xcross' && <XcrossLesson key={lesson.id} lesson={lesson} />}
      {lesson.track === 'sq1' && <Sq1Lesson key={lesson.id} lesson={lesson} />}
    </div>
  )
}
