'use client'
import { useEffect, useState } from 'react'
import { AppShell, PageHeader } from '@/components/layout/AppShell'
import { CaseTrainer } from '@/components/learn/CaseTrainer'
import { CrossDrill } from '@/components/learn/CrossDrill'
import { LessonsHub } from '@/components/lessons/LessonsHub'
import { CASES } from '@/lib/learn'

type Tab = 'lessons' | 'pll' | 'oll' | 'cross'
const TABS: { id: Tab; label: string }[] = [
  { id: 'lessons', label: 'Lessons' },
  { id: 'pll', label: `PLL · ${CASES.pll.length}` },
  { id: 'oll', label: `OLL · ${CASES.oll.length}` },
  { id: 'cross', label: 'Cross planning' },
]
const BLURB: Record<Tab, string> = {
  lessons: 'Learn what to look at, step by step. Each lesson shows the idea on a real scramble, then drills it against the optimal answer until you find it 8 times out of 10.',
  pll: 'Recognise the case, reveal, execute it on your cube and grade yourself. Cases you know well come back less often; new ones unlock five a day.',
  oll: 'The 57 orientation cases, drawn from the same algorithms the CFOP solver uses. Yellow shows where the top colour is.',
  cross: 'Plan the cross within inspection time, then compare with the optimal cross from the exact solver.',
}

export default function LearnPage() {
  const [tab, setTab] = useState<Tab>('pll')
  const [hydrated, setHydrated] = useState(false)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setHydrated(true)
    const h = window.location.hash.slice(1)
    if (h === 'lessons' || h === 'pll' || h === 'oll' || h === 'cross') setTab(h)
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  const choose = (t: Tab) => {
    setTab(t)
    history.replaceState(null, '', `#${t}`)
  }

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10 flex flex-col gap-6">
        <PageHeader eyebrow="Learn" title="What should I drill?">
          <div className="seg" role="tablist" aria-label="Drill">
            {TABS.map(t => (
              <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => choose(t.id)}>{t.label}</button>
            ))}
          </div>
        </PageHeader>
        <p className="text-sm text-ink-2 max-w-[70ch] -mt-2">{BLURB[tab]}</p>
        {hydrated && (tab === 'lessons' ? <LessonsHub /> : tab === 'cross' ? <CrossDrill /> : <CaseTrainer key={tab} set={tab} />)}
      </div>
    </AppShell>
  )
}
