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
import { ScramblePanel } from '@/components/solvers/ScramblePanel'
import { TWISTY_PUZZLE_IDS } from '@/lib/cubing'

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
  // One scramble per puzzle, owned here so the sticky ScramblePanel (with its
  // 3D preview) drives whichever solver is on the right. ScramblePanel
  // auto-generates the first scramble for a puzzle when its slot is empty.
  const [scrambles, setScrambles] = useState<Record<string, string>>({})

  // Deep-link support: /solvers?puzzle=<id>&scramble=... selects a tab and seeds
  // that puzzle's scramble. Read on mount so it's hydration-safe.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const p = q.get('puzzle')
    const validP = p && TABS.some(t => t.id === p) ? p : null
    if (validP) setTab(validP)
    const s = q.get('scramble')
    if (s) setScrambles(prev => ({ ...prev, [validP ?? '333']: s }))
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  const setScr = (id: string, s: string) => setScrambles(prev => ({ ...prev, [id]: s }))
  const scr = scrambles[tab] ?? ''
  const active = TABS.find(t => t.id === tab)!
  const twistyId = TWISTY_PUZZLE_IDS[tab] ?? '3x3x3'

  return (
    <div className="flex flex-col gap-6">
      <div className="animate-fade-in">
        <h1 className="text-3xl font-bold font-display mb-1 tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Solvers
        </h1>
        <p className="text-sm max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
          Generate a scramble and solve it — one puzzle at a time. Everything runs against the cubiq-ml service.
        </p>
      </div>

      {/* Puzzle switcher */}
      <div className="flex flex-wrap gap-2">
        {TABS.map(t => {
          const on = t.id === tab
          const research = t.id === 'research'
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all shrink-0"
              style={{
                background: on ? 'var(--gradient-accent-soft)' : 'var(--bg-glass)',
                color: on ? 'var(--accent-primary)' : research ? 'var(--text-muted)' : 'var(--text-secondary)',
                border: `1px solid ${on ? 'var(--border-accent)' : 'var(--border)'}`,
                boxShadow: on ? '0 0 20px -8px rgba(110,231,247,0.4)' : 'none',
              }}
              onMouseEnter={e => { if (!on) e.currentTarget.style.borderColor = 'var(--border-hover)' }}
              onMouseLeave={e => { if (!on) e.currentTarget.style.borderColor = 'var(--border)' }}
            >
              <span aria-hidden className="text-xs opacity-80">{t.glyph}</span>
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Active puzzle context bar */}
      <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl card">
        <span aria-hidden className="text-base leading-none mt-px">{active.glyph}</span>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-semibold font-display" style={{ color: 'var(--text-primary)' }}>{active.label}</span>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{active.blurb}</p>
        </div>
      </div>

      {/* Research is a full-width standalone panel — no scramble/cube pairing */}
      {tab === 'research' ? (
        <div className="flex flex-col gap-6">
          <p className="text-xs px-3 py-2 rounded-xl" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
            Experimental — a from-scratch MDP/RL solver. Not a practical solver yet; this panel trains and evaluates the model.
          </p>
          <MDPPanel />
        </div>
      ) : (
        /* Every puzzle: sticky scramble + 3D cube on the left, solver(s) on the right */
        <div className="grid gap-6 items-start lg:grid-cols-[minmax(300px,360px)_1fr]">
          <div className="lg:sticky lg:top-4">
            <ScramblePanel puzzle={tab} twistyId={twistyId} scramble={scr} onScramble={s => setScr(tab, s)} />
          </div>

          <div className="flex flex-col gap-6 min-w-0">
            {tab === '333' && (
              <>
                <CrossSolver scramble={scr} />
                <CFOPSolverCard scramble={scr} />
                <MLSolverCard scramble={scr} />
              </>
            )}
            {tab === '222' && (
              <OptimalSolverCard
                title="2×2 Optimal Solver"
                description="Every 2×2 position is precomputed (all 3.6M states), so solutions are provably optimal — never more than 11 moves."
                endpoint="/solve/222" twistyId="2x2x2" scramble={scr}
              />
            )}
            {tab === '444' && <Cube444SolverCard scramble={scr} />}
            {tab === '555' && <Cube555SolverCard scramble={scr} />}
            {tab === 'pyram' && (
              <OptimalSolverCard
                title="Pyraminx Optimal Solver"
                description="The full 933k-state Pyraminx core is precomputed — optimal solutions of at most 11 moves, plus tip twists."
                endpoint="/solve/pyram" twistyId="pyraminx" scramble={scr}
              />
            )}
            {tab === 'skewb' && (
              <OptimalSolverCard
                title="Skewb Optimal Solver"
                description="All 3,149,280 Skewb positions are precomputed — provably optimal solutions, never more than 11 moves."
                endpoint="/solve/skewb" twistyId="skewb" scramble={scr}
              />
            )}
            {tab === 'minx' && <MegaminxSolverCard scramble={scr} />}
            {tab === 'sq1' && <Sq1SolverCard scramble={scr} />}
          </div>
        </div>
      )}
    </div>
  )
}
