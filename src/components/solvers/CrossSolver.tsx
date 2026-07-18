'use client'
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Copy, Check, Play } from 'lucide-react'
import { useCubiqStore } from '@/store'
import { solveAllCrosses } from '@/lib/solver'
import { GlassCard } from '@/components/ui/GlassCard'
import type { CrossSolution } from '@/types'

const FACE_COLORS: Record<string, string> = {
  D: 'var(--face-D)',
  U: 'var(--face-U)',
  F: 'var(--face-F)',
  B: 'var(--face-B)',
  R: 'var(--face-R)',
  L: 'var(--face-L)',
}

const FACE_BG: Record<string, string> = {
  D: 'rgba(255,213,0,0.12)',
  U: 'rgba(255,255,255,0.08)',
  F: 'rgba(0,155,72,0.12)',
  B: 'rgba(0,70,173,0.12)',
  R: 'rgba(185,0,0,0.12)',
  L: 'rgba(255,88,0,0.12)',
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={handleCopy}
      title="Copy"
      className="p-1 rounded transition-colors"
      style={{ color: copied ? 'var(--accent-success)' : 'var(--text-muted)' }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  )
}

interface XCrossSolution {
  pair: string
  moves: string[]
  move_count: number
  alternatives: string[][]
}

interface XXCrossSolution {
  pairs: string
  moves: string[]
  move_count: number
  found: boolean
  alternatives: string[][]
}

function SolutionRow({ sol, scramble, onAnimate }: { sol: CrossSolution; scramble: string; onAnimate: (alg: string) => void }) {
  const { settings } = useCubiqStore()
  const currentScramble = scramble
  const [showAlts, setShowAlts] = useState(false)
  const [xcross, setXcross] = useState<XCrossSolution[] | null>(null)
  const [xcrossOpen, setXcrossOpen] = useState(false)
  const [xcrossLoading, setXcrossLoading] = useState(false)
  const [xcrossError, setXcrossError] = useState<string | null>(null)
  const [xxcross, setXxcross] = useState<XXCrossSolution[] | null>(null)
  const [xxcrossOpen, setXxcrossOpen] = useState(false)
  const [xxcrossLoading, setXxcrossLoading] = useState(false)
  const [xxcrossError, setXxcrossError] = useState<string | null>(null)
  const moveStr = sol.moves.join(' ')
  const prefix = sol.rotation ? sol.rotation + ' ' : ''
  const display = prefix + (moveStr || '(already solved)')
  const alts = sol.alternatives ?? []

  async function toggleXcross() {
    if (xcrossOpen) {
      setXcrossOpen(false)
      return
    }
    setXcrossOpen(true)
    if (xcross || xcrossLoading) return
    setXcrossLoading(true)
    setXcrossError(null)
    try {
      const res = await fetch(`${settings.ml_service_url}/solve/xcross`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: currentScramble, face: sol.face }),
        signal: AbortSignal.timeout(30000),
      })
      if (!res.ok) throw new Error(`service returned ${res.status}`)
      const data = await res.json()
      setXcross(data.solutions)
    } catch {
      setXcrossError('x-cross needs the cubiq-ml service — is it running?')
    } finally {
      setXcrossLoading(false)
    }
  }

  async function toggleXXcross() {
    if (xxcrossOpen) { setXxcrossOpen(false); return }
    setXxcrossOpen(true)
    if (xxcross || xxcrossLoading) return
    setXxcrossLoading(true)
    setXxcrossError(null)
    try {
      const res = await fetch(`${settings.ml_service_url}/solve/xxcross`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: currentScramble, face: sol.face }),
        signal: AbortSignal.timeout(30000),
      })
      if (!res.ok) throw new Error(`service returned ${res.status}`)
      const data = await res.json()
      setXxcross(data.solutions)
    } catch {
      setXxcrossError('double x-cross needs the cubiq-ml service — is it running?')
    } finally {
      setXxcrossLoading(false)
    }
  }

  return (
    <div
      className="flex flex-col px-3 py-2.5 rounded-xl"
      style={{ background: FACE_BG[sol.face] }}
    >
    <div className="flex items-center gap-3">
      <span
        className="w-5 h-5 flex items-center justify-center rounded text-xs font-bold font-display shrink-0"
        style={{ background: FACE_COLORS[sol.face], color: '#000', opacity: 0.9 }}
      >
        {sol.face}
      </span>

      <span
        className="flex-1 font-mono text-sm break-all"
        style={{ color: 'var(--text-primary)' }}
      >
        {display}
      </span>

      <span
        className="text-xs font-mono tabular-nums shrink-0"
        style={{ color: 'var(--text-muted)' }}
      >
        {sol.move_count}m
      </span>

      <button
        onClick={() => onAnimate(prefix + moveStr)}
        title="Animate in cube preview"
        className="p-1 rounded transition-colors shrink-0"
        style={{ color: 'var(--text-muted)' }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-primary)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
      >
        <Play size={13} />
      </button>

      <CopyButton text={display} />
    </div>

    <div className="flex items-center gap-3 mt-1">
      {alts.length > 0 && (
        <button
          onClick={() => setShowAlts(v => !v)}
          className="text-[11px] font-mono transition-colors"
          style={{ color: 'var(--text-muted)' }}
        >
          {showAlts ? '− hide' : `+ ${alts.length} more optimal`}
        </button>
      )}
      <button
        onClick={toggleXcross}
        className="text-[11px] font-mono transition-colors"
        style={{ color: xcrossOpen ? 'var(--accent-primary)' : 'var(--text-muted)' }}
      >
        {xcrossOpen ? '− x-cross' : '+ x-cross'}
      </button>
      <button
        onClick={toggleXXcross}
        className="text-[11px] font-mono transition-colors"
        style={{ color: xxcrossOpen ? 'var(--accent-secondary)' : 'var(--text-muted)' }}
      >
        {xxcrossOpen ? '− double x-cross' : '+ double x-cross'}
      </button>
    </div>

    {showAlts && alts.map((alt, i) => (
      <div key={i} className="flex items-center gap-2 mt-1 pl-8">
        <span className="font-mono text-xs break-all" style={{ color: 'var(--text-secondary)' }}>
          {prefix + alt.join(' ')}
        </span>
        <CopyButton text={prefix + alt.join(' ')} />
      </div>
    ))}

    {xcrossOpen && (
      <div className="flex flex-col gap-1 mt-2 pl-8">
        {xcrossLoading && (
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>solving x-crosses…</span>
        )}
        {xcrossError && (
          <span className="text-[11px]" style={{ color: 'var(--accent-danger)' }}>{xcrossError}</span>
        )}
        {xcross?.map(xs => (
          <div key={xs.pair} className="flex items-center gap-2">
            <span className="text-[10px] font-mono w-14 shrink-0" style={{ color: 'var(--text-muted)' }}>
              +{xs.pair} pair
            </span>
            <span className="flex-1 font-mono text-xs break-all" style={{ color: 'var(--text-secondary)' }}>
              {prefix + xs.moves.join(' ')}
            </span>
            <span className="text-[10px] font-mono tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
              {xs.move_count}m
            </span>
            <button
              onClick={() => onAnimate(prefix + xs.moves.join(' '))}
              title="Animate in cube preview"
              className="p-1 rounded transition-colors shrink-0"
              style={{ color: 'var(--text-muted)' }}
            >
              <Play size={11} />
            </button>
            <CopyButton text={prefix + xs.moves.join(' ')} />
          </div>
        ))}
      </div>
    )}

    {xxcrossOpen && (
      <div className="flex flex-col gap-1 mt-2 pl-8">
        {xxcrossLoading && (
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>solving double x-crosses (cross + 2 pairs)…</span>
        )}
        {xxcrossError && (
          <span className="text-[11px]" style={{ color: 'var(--accent-danger)' }}>{xxcrossError}</span>
        )}
        {xxcross && !xxcrossLoading && (
          <span className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>
            shortest first — a good double x-cross exists on some pair pairs, not others
          </span>
        )}
        {xxcross?.map(xs => (
          <div key={xs.pairs} className="flex items-center gap-2">
            <span className="text-[10px] font-mono w-20 shrink-0" style={{ color: 'var(--text-muted)' }}>
              +{xs.pairs}
            </span>
            {xs.found ? (
              <>
                <span className="flex-1 font-mono text-xs break-all" style={{ color: 'var(--text-secondary)' }}>
                  {prefix + xs.moves.join(' ')}
                </span>
                <span className="text-[10px] font-mono tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {xs.move_count}m
                </span>
                <button
                  onClick={() => onAnimate(prefix + xs.moves.join(' '))}
                  title="Animate in cube preview"
                  className="p-1 rounded transition-colors shrink-0"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Play size={11} />
                </button>
                <CopyButton text={prefix + xs.moves.join(' ')} />
              </>
            ) : (
              <span className="flex-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                none within 16 moves — not worth it
              </span>
            )}
          </div>
        ))}
      </div>
    )}
    </div>
  )
}

export function CrossSolver({ scramble }: { scramble?: string } = {}) {
  const storeScramble = useCubiqStore(s => s.currentScramble)
  const activePuzzle = useCubiqStore(
    s => s.sessions.find(sess => sess.id === s.activeSessionId)?.puzzle ?? '333'
  )
  // When a scramble is passed (solver page), the solver is self-contained and
  // always 3×3; otherwise it follows the active timer session.
  const currentScramble = scramble ?? storeScramble
  const is3x3 = scramble !== undefined || activePuzzle === '333'
  const [solutions, setSolutions] = useState<CrossSolution[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [anim, setAnim] = useState<{ setup: string; alg: string } | null>(null)
  const [lastSolvedScramble, setLastSolvedScramble] = useState<string>('')

  const solve = useCallback(async (scramble: string) => {
    if (!scramble) return
    setLoading(true)
    setError(null)
    try {
      const result = await solveAllCrosses(scramble)
      setSolutions(result)
      setLastSolvedScramble(scramble)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-solve when the scramble changes (solve() sets loading synchronously)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (is3x3 && currentScramble && currentScramble !== lastSolvedScramble) {
      solve(currentScramble)
    }
  }, [currentScramble, lastSolvedScramble, solve, is3x3])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!is3x3) {
    return (
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-bold font-display" style={{ color: 'var(--text-primary)' }}>
          Cross Solver
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          The cross solver works on 3×3 scrambles — switch to a 3×3 session,
          or use the 4×4 solver below for big-cube scrambles.
        </p>
      </div>
    )
  }

  function handleAnimate(alg: string) {
    setAnim({ setup: currentScramble, alg })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold font-display" style={{ color: 'var(--text-primary)' }}>
            Cross Solver
          </h2>
          {lastSolvedScramble && (
            <p className="text-xs mt-0.5 font-mono break-all" style={{ color: 'var(--text-muted)' }}>
              {lastSolvedScramble}
            </p>
          )}
        </div>
        <button
          onClick={() => solve(currentScramble)}
          disabled={loading || !currentScramble}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors"
          style={{
            background: 'var(--bg-elevated)',
            color: loading ? 'var(--text-muted)' : 'var(--accent-primary)',
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Solving…' : 'Solve'}
        </button>
      </div>

      {error && (
        <p className="text-sm px-3 py-2 rounded-xl" style={{ background: 'var(--accent-danger)15', color: 'var(--accent-danger)' }}>
          {error}
        </p>
      )}

      {!currentScramble && !loading && (
        <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>
          Generate a scramble to solve.
        </p>
      )}

      {loading && (
        <div className="flex flex-col gap-2">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-11 rounded-xl animate-pulse"
              style={{ background: 'var(--bg-elevated)' }}
            />
          ))}
        </div>
      )}

      {solutions && !loading && (
        <div className="flex flex-col gap-2">
          {[...solutions]
            .sort((a, b) => a.move_count - b.move_count)
            .map(sol => (
              <SolutionRow key={sol.face} sol={sol} scramble={currentScramble} onAnimate={handleAnimate} />
            ))}
        </div>
      )}

      {/* Animated cube preview — scramble is pre-applied, only the solution plays */}
      {anim && (
        <GlassCard className="mt-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-display" style={{ color: 'var(--text-muted)' }}>
              Solution animation
            </p>
            <button
              onClick={() => setAnim(null)}
              className="text-xs px-2 py-0.5 rounded"
              style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)' }}
            >
              Close
            </button>
          </div>
          <AnimatedCube setup={anim.setup} alg={anim.alg} />
        </GlassCard>
      )}
    </div>
  )
}

import { AnimatedCube } from '@/components/solvers/AnimatedCube'
