'use client'
import { AppShell } from '@/components/layout/AppShell'
import { SolverWorkspace } from '@/components/solvers/SolverWorkspace'

export default function SolveLabPage() {
  return (
    <AppShell>
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <SolverWorkspace />
      </div>
    </AppShell>
  )
}
