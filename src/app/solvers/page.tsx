'use client'
import dynamic from 'next/dynamic'
import { Navbar } from '@/components/layout/Navbar'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { MLSolverCard } from '@/components/solvers/MLSolverCard'
import { MDPPanel } from '@/components/solvers/MDPPanel'

// Solver loads cubing.js & runs IDA* — keep off SSR
const CrossSolver = dynamic(
  () => import('@/components/solvers/CrossSolver').then(m => m.CrossSolver),
  { ssr: false, loading: () => (
    <div className="flex flex-col gap-2">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-11 rounded-xl animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
      ))}
    </div>
  )}
)

export default function SolversPage() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-8">
            <div>
              <h1
                className="text-2xl font-bold font-display mb-1"
                style={{ color: 'var(--text-primary)' }}
              >
                Solvers
              </h1>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Cross solutions are computed locally. ML solver connects to the cubiq-ml service.
              </p>
            </div>

            <CrossSolver />

            <MLSolverCard />

            <MDPPanel />
          </div>
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
