'use client'
import dynamic from 'next/dynamic'
import { Navbar } from '@/components/layout/Navbar'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { MLSolverCard } from '@/components/solvers/MLSolverCard'
import { CFOPSolverCard } from '@/components/solvers/CFOPSolverCard'
import { Cube444SolverCard } from '@/components/solvers/Cube444SolverCard'
import { MegaminxSolverCard } from '@/components/solvers/MegaminxSolverCard'
import { OptimalSolverCard } from '@/components/solvers/OptimalSolverCard'
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

            <CFOPSolverCard />

            <OptimalSolverCard
              title="2×2 Optimal Solver"
              description="Every 2×2 position is precomputed (all 3.6M states), so solutions are provably optimal — never more than 11 moves."
              puzzleType="222"
              endpoint="/solve/222"
              twistyId="2x2x2"
            />

            <OptimalSolverCard
              title="Pyraminx Optimal Solver"
              description="The full 933k-state Pyraminx core is precomputed — optimal solutions of at most 11 moves, plus tip twists."
              puzzleType="pyram"
              endpoint="/solve/pyram"
              twistyId="pyraminx"
            />

            <Cube444SolverCard />

            <MegaminxSolverCard />

            <MLSolverCard />

            <MDPPanel />
          </div>
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
