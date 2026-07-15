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

function SolutionRow({ sol, onAnimate }: { sol: CrossSolution; onAnimate: (sol: CrossSolution) => void }) {
  const [showAlts, setShowAlts] = useState(false)
  const moveStr = sol.moves.join(' ')
  const prefix = sol.rotation ? sol.rotation + ' ' : ''
  const display = prefix + (moveStr || '(already solved)')
  const alts = sol.alternatives ?? []

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
        onClick={() => onAnimate(sol)}
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

    {alts.length > 0 && (
      <button
        onClick={() => setShowAlts(v => !v)}
        className="self-start mt-1 text-[11px] font-mono transition-colors"
        style={{ color: 'var(--text-muted)' }}
      >
        {showAlts ? '− hide' : `+ ${alts.length} more optimal`}
      </button>
    )}

    {showAlts && alts.map((alt, i) => (
      <div key={i} className="flex items-center gap-2 mt-1 pl-8">
        <span className="font-mono text-xs break-all" style={{ color: 'var(--text-secondary)' }}>
          {prefix + alt.join(' ')}
        </span>
        <CopyButton text={prefix + alt.join(' ')} />
      </div>
    ))}
    </div>
  )
}

export function CrossSolver() {
  const { currentScramble } = useCubiqStore()
  const [solutions, setSolutions] = useState<CrossSolution[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [animScramble, setAnimScramble] = useState<string | null>(null)
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

  // Auto-solve when scramble changes
  useEffect(() => {
    if (currentScramble && currentScramble !== lastSolvedScramble) {
      solve(currentScramble)
    }
  }, [currentScramble, lastSolvedScramble, solve])

  function handleAnimate(sol: CrossSolution) {
    const prefix = sol.rotation ? sol.rotation + ' ' : ''
    setAnimScramble(currentScramble + ' ' + prefix + sol.moves.join(' '))
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
          Go to the Timer page to generate a scramble first
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
              <SolutionRow key={sol.face} sol={sol} onAnimate={handleAnimate} />
            ))}
        </div>
      )}

      {/* Animated cube preview */}
      {animScramble && (
        <GlassCard className="mt-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-display" style={{ color: 'var(--text-muted)' }}>
              Solution animation
            </p>
            <button
              onClick={() => setAnimScramble(null)}
              className="text-xs px-2 py-0.5 rounded"
              style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)' }}
            >
              Close
            </button>
          </div>
          <AnimatedCube alg={animScramble} />
        </GlassCard>
      )}
    </div>
  )
}

function AnimatedCube({ alg }: { alg: string }) {
  const containerRef = React.useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    async function mount() {
      await import('cubing/twisty')
      if (!containerRef.current) return
      const existing = containerRef.current.querySelector('twisty-player')
      if (existing) existing.remove()
      const player = document.createElement('twisty-player') as unknown as HTMLElement
      player.setAttribute('alg', alg)
      player.setAttribute('puzzle', '3x3x3')
      player.setAttribute('visualization', '3D')
      player.setAttribute('background', 'none')
      player.setAttribute('tempo-scale', '3')
      player.style.width = '100%'
      player.style.height = '260px'
      containerRef.current!.appendChild(player)
    }
    mount()
  }, [alg])

  return <div ref={containerRef} className="w-full" style={{ height: 260 }} />
}

// We need React imported for the ref in AnimatedCube
import React from 'react'
