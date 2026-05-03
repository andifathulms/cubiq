'use client'
import { useState, useEffect } from 'react'
import { Navbar } from '@/components/layout/Navbar'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { TimeChart } from '@/components/stats/TimeChart'
import { DistributionChart } from '@/components/stats/DistributionChart'
import { DailyHeatmap } from '@/components/stats/DailyHeatmap'
import { SessionComparison } from '@/components/stats/SessionComparison'
import { GlassCard } from '@/components/ui/GlassCard'
import { useCubiqStore } from '@/store'
import { computeStats, formatTime } from '@/lib/stats'

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-base font-semibold font-display mb-3"
      style={{ color: 'var(--text-primary)' }}
    >
      {children}
    </h2>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex flex-col gap-1 px-4 py-3 rounded-2xl"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
    >
      <span className="text-xs font-display uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span className="text-lg font-mono font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
        {value}
      </span>
    </div>
  )
}

export default function StatsPage() {
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])

  const { getActiveSession } = useCubiqStore()
  const session = getActiveSession()
  const stats = hydrated ? computeStats(session?.solves ?? []) : null

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col gap-6">
            <div>
              <h1
                className="text-2xl font-bold font-display mb-1"
                style={{ color: 'var(--text-primary)' }}
              >
                Statistics
              </h1>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {hydrated ? `${session?.name} — ${session?.solves.length ?? 0} solves` : '—'}
              </p>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              <StatCard label="Best" value={stats ? formatTime(stats.best) : '—'} />
              <StatCard label="ao5"  value={stats ? formatTime(stats.ao5)  : '—'} />
              <StatCard label="ao12" value={stats ? formatTime(stats.ao12) : '—'} />
              <StatCard label="ao50" value={stats ? formatTime(stats.ao50) : '—'} />
              <StatCard label="Mean" value={stats?.mean != null ? formatTime(Math.round(stats.mean)) : '—'} />
              <StatCard label="Count" value={stats ? String(stats.count) : '—'} />
            </div>

            {/* Time trend */}
            <GlassCard>
              <SectionTitle>Time Trend</SectionTitle>
              <TimeChart />
            </GlassCard>

            {/* Distribution + Heatmap side by side on desktop */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <GlassCard>
                <SectionTitle>Time Distribution</SectionTitle>
                <DistributionChart />
              </GlassCard>

              <GlassCard>
                <SectionTitle>Daily Activity</SectionTitle>
                <div className="py-2 overflow-x-auto">
                  <DailyHeatmap />
                </div>
                <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                  Last 13 weeks
                </p>
              </GlassCard>
            </div>

            {/* Session comparison */}
            <GlassCard>
              <SectionTitle>Session Comparison</SectionTitle>
              <SessionComparison />
            </GlassCard>
          </div>
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
