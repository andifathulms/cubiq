'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { CFOPSolverCard } from '@/components/solvers/CFOPSolverCard'
import { Cube444SolverCard } from '@/components/solvers/Cube444SolverCard'
import { Cube555SolverCard } from '@/components/solvers/Cube555SolverCard'
import { MegaminxSolverCard } from '@/components/solvers/MegaminxSolverCard'
import { Sq1SolverCard } from '@/components/solvers/Sq1SolverCard'
import { OptimalSolverCard } from '@/components/solvers/OptimalSolverCard'
import { MLSolverCard } from '@/components/solvers/MLSolverCard'
import { MDPPanel } from '@/components/solvers/MDPPanel'

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

interface Tab {
  id: string
  label: string
  glyph: string           // small puzzle emoji/mark
  blurb: string
}

const TABS: Tab[] = [
  { id: '333', label: '3×3', glyph: '🧩', blurb: 'Cross, x-cross and full CFOP staging, plus a Kociemba optimal solve.' },
  { id: '222', label: '2×2', glyph: '◻', blurb: 'Every position precomputed — provably optimal, ≤ 11 moves.' },
  { id: '444', label: '4×4', glyph: '⬛', blurb: 'Reduction: centers → edge pairing → 3×3 finish, with parity handling.' },
  { id: '555', label: '5×5', glyph: '⬛', blurb: 'Reduction on the bigger cube: both center orbits, wing pairing, then CFOP.' },
  { id: 'pyram', label: 'Pyraminx', glyph: '△', blurb: 'The full 933k-state core precomputed — optimal ≤ 11 moves plus tips.' },
  { id: 'skewb', label: 'Skewb', glyph: '◈', blurb: 'All 3.1M positions precomputed — provably optimal, ≤ 11 moves.' },
  { id: 'minx', label: 'Megaminx', glyph: '⬠', blurb: 'Layer-by-layer greedy placement with commutator last-layer macros.' },
  { id: 'sq1', label: 'Square-1', glyph: '◗', blurb: 'Optimal shape stage, then exact two-phase piece descent.' },
  { id: 'research', label: 'Research', glyph: '🧪', blurb: 'Experimental MDP / reinforcement-learning solver. Training + evaluation.' },
]

export function SolverWorkspace() {
  const [tab, setTab] = useState('333')

  // Deep-link support: /solvers?puzzle=333 selects a tab on load
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('puzzle')
    if (p && TABS.some(t => t.id === p)) setTab(p)
  }, [])

  const active = TABS.find(t => t.id === tab)!

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold font-display mb-1" style={{ color: 'var(--text-primary)' }}>
          Solvers
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Generate a scramble and solve it — one puzzle at a time. Everything runs against the cubiq-ml service.
        </p>
      </div>

      {/* Puzzle switcher */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'thin' }}>
        {TABS.map(t => {
          const on = t.id === tab
          const research = t.id === 'research'
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors shrink-0"
              style={{
                background: on ? 'var(--accent-primary)20' : 'var(--bg-elevated)',
                color: on ? 'var(--accent-primary)' : research ? 'var(--text-muted)' : 'var(--text-secondary)',
                border: `1px solid ${on ? 'var(--accent-primary)40' : 'var(--border)'}`,
              }}
            >
              <span aria-hidden className="text-xs opacity-80">{t.glyph}</span>
              {t.label}
            </button>
          )
        })}
      </div>

      <p className="text-xs -mt-2" style={{ color: 'var(--text-muted)' }}>{active.blurb}</p>

      {/* One puzzle's solvers */}
      <div className="flex flex-col gap-6">
        {tab === '333' && (
          <>
            <CrossSolver />
            <CFOPSolverCard />
            <MLSolverCard />
          </>
        )}
        {tab === '222' && (
          <OptimalSolverCard
            title="2×2 Optimal Solver"
            description="Every 2×2 position is precomputed (all 3.6M states), so solutions are provably optimal — never more than 11 moves."
            puzzleType="222" endpoint="/solve/222" twistyId="2x2x2"
          />
        )}
        {tab === '444' && <Cube444SolverCard />}
        {tab === '555' && <Cube555SolverCard />}
        {tab === 'pyram' && (
          <OptimalSolverCard
            title="Pyraminx Optimal Solver"
            description="The full 933k-state Pyraminx core is precomputed — optimal solutions of at most 11 moves, plus tip twists."
            puzzleType="pyram" endpoint="/solve/pyram" twistyId="pyraminx"
          />
        )}
        {tab === 'skewb' && (
          <OptimalSolverCard
            title="Skewb Optimal Solver"
            description="All 3,149,280 Skewb positions are precomputed — provably optimal solutions, never more than 11 moves."
            puzzleType="skewb" endpoint="/solve/skewb" twistyId="skewb"
          />
        )}
        {tab === 'minx' && <MegaminxSolverCard />}
        {tab === 'sq1' && <Sq1SolverCard />}
        {tab === 'research' && (
          <>
            <p className="text-xs px-3 py-2 rounded-xl" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
              Experimental — a from-scratch MDP/RL solver. Not a practical solver yet; this panel trains and evaluates the model.
            </p>
            <MDPPanel />
          </>
        )}
      </div>
    </div>
  )
}
