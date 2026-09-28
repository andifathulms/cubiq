'use client'
import { AppShell, PageHeader } from '@/components/layout/AppShell'
import { MDPPanel } from '@/components/solvers/MDPPanel'

export default function ResearchPage() {
  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10 flex flex-col gap-6">
        <PageHeader eyebrow="Labs · experimental" title="Research: MDP solver" />
        <p className="text-sm text-ink-2 max-w-2xl">
          A from-scratch reinforcement-learning solver. It isn&apos;t a practical solver yet: this dashboard trains and
          evaluates the model, and it needs the Python <span className="num text-xs">cubiq-ml</span> service running locally
          (set its URL in Settings). Every other part of Cubiq runs in your browser.
        </p>
        <MDPPanel />
      </div>
    </AppShell>
  )
}
