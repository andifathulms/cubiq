'use client'
import { useState, useEffect } from 'react'
import { AppShell, PageHeader } from '@/components/layout/AppShell'
import { SessionSelector } from '@/components/session/SessionSelector'
import { TimeChart } from '@/components/stats/TimeChart'
import { DistributionChart } from '@/components/stats/DistributionChart'
import { DailyHeatmap } from '@/components/stats/DailyHeatmap'
import { SessionComparison } from '@/components/stats/SessionComparison'
import { SolveTable } from '@/components/history/SolveTable'
import { GlassCard } from '@/components/ui/GlassCard'
import { useCubiqStore } from '@/store'
import { computeStats, formatStat } from '@/lib/stats'

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="card flex flex-col gap-2 px-4 py-3.5">
      <span className="label">{label}</span>
      <span className={`num text-xl font-semibold leading-none ${accent ? 'text-pb' : 'text-ink'}`}>{value}</span>
    </div>
  )
}

export default function ProgressPage() {
  const [hydrated, setHydrated] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHydrated(true), [])

  const session = useCubiqStore(s => s.sessions.find(x => x.id === s.activeSessionId))
  const solves = hydrated ? session?.solves ?? [] : []
  const stats = computeStats(solves)
  const n = solves.length

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10 flex flex-col gap-6">
        <PageHeader eyebrow="Progress" title={hydrated ? session?.name ?? 'Session' : '—'}>
          <SessionSelector />
        </PageHeader>

        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          <StatCard label="Best" value={formatStat(stats.best, n)} accent={stats.best !== null} />
          <StatCard label="ao5" value={formatStat(stats.ao5, n, 5)} />
          <StatCard label="ao12" value={formatStat(stats.ao12, n, 12)} />
          <StatCard label="ao50" value={formatStat(stats.ao50, n, 50)} />
          <StatCard label="Mean" value={formatStat(stats.mean, n)} />
          <StatCard label="Count" value={String(n)} />
        </div>

        <GlassCard><h2 className="font-display font-semibold mb-4">Trend</h2><TimeChart /></GlassCard>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <GlassCard><h2 className="font-display font-semibold mb-4">Distribution</h2><DistributionChart /></GlassCard>
          <GlassCard><h2 className="font-display font-semibold mb-4">Consistency</h2><DailyHeatmap /></GlassCard>
        </div>
        <GlassCard><h2 className="font-display font-semibold mb-4">Sessions compared</h2><SessionComparison /></GlassCard>
        <section id="log" className="flex flex-col gap-4">
          <h2 className="font-display text-xl font-bold">Solve log</h2>
          <SolveTable />
        </section>
      </div>
    </AppShell>
  )
}
