'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, Timer } from 'lucide-react'
import { AppShell, PageHeader } from '@/components/layout/AppShell'
import { SessionChip } from '@/components/session/SessionChip'
import { DataTransfer } from '@/components/session/DataTransfer'
import { Segmented } from '@/components/ui/Toggle'
import { TrendChart } from '@/components/progress/TrendChart'
import { Histogram } from '@/components/progress/Histogram'
import { Heatmap } from '@/components/progress/Heatmap'
import { SolveLog } from '@/components/progress/SolveLog'
import { SessionTable } from '@/components/progress/SessionTable'
import { useCubiqStore } from '@/store'
import { formatTime, getEffectiveTime } from '@/lib/stats'
import {
  previousIndices, rangeIndices, relativeTime, rollingAo, runningBest, solvesPerDay, streak, summarize,
  type Range,
} from '@/lib/progress'
import type { Solve } from '@/types'

function Panel({ title, aside, children, className = '' }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-4 md:p-5 flex flex-col gap-4 min-w-0 ${className}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-display text-[15px] font-bold tracking-tight text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Kpi({ label, value, sub, delta, gold, className = '' }: { label: string; value: string; sub?: string; delta?: number | null; gold?: boolean; className?: string }) {
  return (
    <div className={`card p-4 flex flex-col gap-2 min-w-0 ${gold ? 'border-[color-mix(in_srgb,var(--pb)_45%,var(--line))]' : ''} ${className}`}>
      <span className="label">{label}</span>
      <span className={`num text-[22px] md:text-[24px] font-semibold leading-none ${gold ? 'text-pb' : 'text-ink'}`}>{value}</span>
      <span className="num text-[11px] text-muted truncate">
        {delta != null && Math.abs(delta) >= 5
          ? <span className={delta < 0 ? 'text-go' : 'text-stop'}>{delta < 0 ? '▼' : '▲'} {(Math.abs(delta) / 1000).toFixed(2)}<span className="hidden sm:inline"> vs previous</span></span>
          : sub ?? ' '}
      </span>
    </div>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-muted num">
      <span className="flex items-center gap-1.5"><i className="w-1.5 h-1.5 rounded-full bg-muted/50" />single</span>
      <span className="flex items-center gap-1.5"><i className="w-3 h-[3px] rounded bg-go" />ao12</span>
      <span className="flex items-center gap-1.5"><i className="w-3 h-[2px] rounded bg-pb" />PB</span>
    </div>
  )
}

/** Deterministic example data for the empty state (clearly labelled). */
function exampleSolves(): Solve[] {
  let seed = 7
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const now = Date.now()
  return Array.from({ length: 80 }, (_, i) => ({
    id: `ex${i}`, penalty: null, scramble: '', comment: '',
    time_ms: Math.round(1000 * (24 - 6 * (i / 80) + (r() + r() + r() - 1.5) * 3)),
    created_at: new Date(now - (80 - i) * 3_600_000 * 6).toISOString(),
  }))
}

function FirstSteps({ count }: { count: number }) {
  const steps = [
    ['Do your first solve', 1],
    ['Reach an ao5', 5],
    ['Reach an ao12', 12],
  ] as const
  return (
    <section className="card p-5 md:p-6 flex flex-col md:flex-row gap-6 md:items-center">
      <div className="flex flex-col gap-2 md:w-[46%]">
        <span className="label">Getting started</span>
        <h2 className="font-display text-xl font-bold tracking-tight">Your progress fills in as you solve</h2>
        <p className="text-sm text-ink-2">Records, trends and consistency appear here automatically. Averages need 5 and 12 solves.</p>
        <Link href="/" className="btn btn-primary self-start mt-2"><Timer size={15} /> Go to Practice</Link>
      </div>
      <ol className="flex-1 flex flex-col gap-2">
        {steps.map(([label, need]) => {
          const done = count >= need
          return (
            <li key={label} className="flex items-center gap-3 p-3 rounded-xl bg-raised">
              <span className={`grid place-items-center w-6 h-6 rounded-full ${done ? 'bg-go text-go-ink' : 'border border-line-strong'}`}>
                {done && <Check size={14} />}
              </span>
              <span className={`text-sm flex-1 ${done ? 'text-muted line-through' : 'text-ink'}`}>{label}</span>
              <span className="num text-[11px] text-muted">{Math.min(count, need)}/{need}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export default function ProgressPage() {
  const [hydrated, setHydrated] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHydrated(true), [])
  const session = useCubiqStore(s => s.sessions.find(x => x.id === s.activeSessionId))
  const [range, setRange] = useState<Range>('30d')

  const solves = useMemo(() => (hydrated ? session?.solves ?? [] : []), [hydrated, session])
  const ao5 = useMemo(() => rollingAo(solves, 5), [solves])
  const ao12 = useMemo(() => rollingAo(solves, 12), [solves])
  const best = useMemo(() => runningBest(solves), [solves])
  const pbIdx = useMemo(() => {
    const set = new Set<number>()
    best.forEach((b, i) => { if (i > 0 && b !== null && b !== best[i - 1] && getEffectiveTime(solves[i]) === b) set.add(i) })
    return set
  }, [best, solves])

  const idx = useMemo(() => rangeIndices(solves, range), [solves, range])
  const prevIdx = useMemo(() => previousIndices(solves, range), [solves, range])
  const cur = summarize(solves, idx, ao5, ao12)
  const prev = prevIdx.length ? summarize(solves, prevIdx, ao5, ao12) : null
  const perDay = useMemo(() => solvesPerDay(solves), [solves])
  const days = streak(perDay)
  const times = idx.map(i => getEffectiveTime(solves[i])).filter((t): t is number => t !== null)
  const delta = (a: number | null, b: number | null | undefined) => (a !== null && b != null ? a - b : null)

  const example = useMemo(() => exampleSolves(), [])
  const exIdx = useMemo(() => example.map((_, i) => i), [example])
  const empty = hydrated && solves.length === 0

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10 flex flex-col gap-5">
        <PageHeader eyebrow="Progress" title="Am I getting faster?">
          <SessionChip compact />
          <Segmented
            label="Range" value={range} onChange={setRange}
            options={[{ value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: 'all', label: 'All time' }]}
          />
        </PageHeader>

        {hydrated && solves.length < 12 && <FirstSteps count={solves.length} />}

        {empty ? (
          <Panel title="Trend" aside={<span className="pill pill-go">EXAMPLE DATA</span>}>
            <TrendChart solves={example} idx={exIdx} ao12={rollingAo(example, 12)} best={runningBest(example)} example />
            <p className="text-xs text-muted">An example of what 80 solves look like: faint dots are singles, the green line your ao12, the gold steps your best.</p>
          </Panel>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Kpi label="Single PB" gold={cur.best !== null} value={cur.best !== null ? formatTime(cur.best) : '—'} sub={cur.bestAt ? `set ${relativeTime(cur.bestAt)}` : 'no solves in range'} />
              <Kpi label="Best ao5" value={cur.bestAo5 !== null ? formatTime(Math.round(cur.bestAo5)) : '—'} delta={delta(cur.bestAo5, prev?.bestAo5)} sub="needs 5 solves" />
              <Kpi label="Best ao12" value={cur.bestAo12 !== null ? formatTime(Math.round(cur.bestAo12)) : '—'} delta={delta(cur.bestAo12, prev?.bestAo12)} sub="needs 12 solves" />
              <Kpi label="Mean" value={cur.mean !== null ? formatTime(Math.round(cur.mean)) : '—'} delta={delta(cur.mean, prev?.mean)} sub={`${Math.round(cur.dnfRate * 100)}% DNF`} />
              <Kpi className="col-span-2 md:col-span-1" label="Streak" value={`${days} day${days === 1 ? '' : 's'}`} sub={`${cur.count} solves in range`} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-4 items-start">
              <Panel title="Trend" aside={<Legend />}>
                {idx.length >= 2
                  ? <TrendChart solves={solves} idx={idx} ao12={ao12} best={best} />
                  : <p className="text-sm text-muted py-16 text-center">Two or more solves in this range draw the trend.</p>}
              </Panel>
              <div className="flex flex-col gap-4">
                <Panel title="Distribution" aside={<span className="text-[11px] text-muted">green = faster than your mean</span>}>
                  {times.length >= 5 ? <Histogram times={times} /> : <p className="text-sm text-muted py-8 text-center">Needs 5 solves in range.</p>}
                </Panel>
                <Panel title="Consistency" aside={<span className="label">last 12 weeks</span>}>
                  <Heatmap perDay={perDay} />
                </Panel>
              </div>
            </div>
          </>
        )}

        {hydrated && session && solves.length > 0 && (
          <Panel title="Solve log" aside={<DataTransfer compact />} className="scroll-mt-6">
            <div id="log" />
            <SolveLog session={session} ao5={ao5} ao12={ao12} pbIdx={pbIdx} />
          </Panel>
        )}

        {hydrated && <Panel title="All sessions"><SessionTable /></Panel>}
        {empty && <Panel title="Your data"><DataTransfer /></Panel>}
      </div>
    </AppShell>
  )
}
