'use client'
import { useEffect, useState } from 'react'
import { Box, Loader, Play, RefreshCw, Copy, Check } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { AnimatedCube } from '@/components/solvers/AnimatedCube'
import { generateScramble } from '@/lib/cubing'
import { useCubiqStore } from '@/store'

interface Stage444 {
  name: string
  kind: string
  moves: string[]
  move_count: number
}

interface Result444 {
  rotation: string
  cfop_face: string
  stages: Stage444[]
  reduction_moves: number
  total_moves: number
  solution: string
  time_ms: number
}

const KIND_COLORS: Record<string, string> = {
  centers: 'var(--accent-primary)',
  pairing: 'var(--accent-secondary)',
  parity: 'var(--accent-danger)',
  cross: 'var(--accent-primary)',
  xcross: 'var(--accent-primary)',
  f2l: 'var(--accent-secondary)',
  oll: 'var(--accent-warning)',
  pll: 'var(--accent-success)',
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      title="Copy"
      className="p-1 rounded transition-colors shrink-0"
      style={{ color: copied ? 'var(--accent-success)' : 'var(--text-muted)' }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  )
}

export function Cube444SolverCard({ initialScramble }: { initialScramble?: string } = {}) {
  const { settings } = useCubiqStore()
  const [scramble, setScramble] = useState(initialScramble ?? '')
  const [generating, setGenerating] = useState(false)
  const [solving, setSolving] = useState(false)
  const [result, setResult] = useState<Result444 | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [anim, setAnim] = useState<{ setup: string; alg: string; label: string; stages?: { name: string; kind: string; moveCount: number }[] } | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (initialScramble) { setScramble(initialScramble); setResult(null); setAnim(null) }
  }, [initialScramble])
  useEffect(() => {
    setScramble(s => s || generateScramble('444'))
  }, [])
  /* eslint-enable react-hooks/set-state-in-effect */

  function generate() {
    setGenerating(true)
    setResult(null)
    setAnim(null)
    setError(null)
    // local move-sequence generator — cubing.js's randomScrambleForEvent
    // needs a module worker, which fails under the webpack dev bundler
    setScramble(generateScramble('444'))
    setGenerating(false)
  }

  async function handleSolve() {
    if (!scramble) return
    setSolving(true)
    setResult(null)
    setError(null)
    setAnim(null)
    try {
      const res = await fetch(`${settings.ml_service_url}/solve/444`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: scramble, cfop_face: 'D' }),
        signal: AbortSignal.timeout(300000),
      })
      if (!res.ok) {
        const text = await res.text()
        let detail = 'Solve failed'
        try { detail = JSON.parse(text).detail ?? detail } catch { /* non-JSON error body */ }
        throw new Error(detail)
      }
      setResult(await res.json())
    } catch (e) {
      setError(e instanceof Error && e.name === 'TimeoutError'
        ? 'Request timed out — is the cubiq-ml service running?'
        : String(e))
    } finally {
      setSolving(false)
    }
  }

  function animateStage(res: Result444, stageIdx: number) {
    const prior: string[] = []
    let rotationApplied = false
    for (let i = 0; i < stageIdx; i++) {
      const st = res.stages[i]
      if (!['centers', 'pairing', 'parity'].includes(st.kind) && !rotationApplied && res.rotation) {
        prior.push(res.rotation)
        rotationApplied = true
      }
      prior.push(...st.moves)
    }
    const target = res.stages[stageIdx]
    if (!['centers', 'pairing', 'parity'].includes(target.kind) && !rotationApplied && res.rotation) {
      prior.push(res.rotation)
    }
    setAnim({
      setup: [scramble, ...prior].join(' '),
      alg: target.moves.join(' '),
      label: target.name,
    })
  }

  return (
    <GlassCard>
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl shrink-0" style={{ background: 'var(--accent-secondary)15' }}>
          <Box size={20} style={{ color: 'var(--accent-secondary)' }} />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold font-display text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
            4×4 Solver
          </h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            Reduction method: solve the 6 centers, pair the 24 edge wings into 12 edges
            (with parity fixes when needed), then finish as a 3×3 with the CFOP solver.
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={generate}
              disabled={generating || solving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
              style={{
                background: 'var(--bg-elevated)',
                color: generating ? 'var(--text-muted)' : 'var(--accent-secondary)',
                border: '1px solid var(--border)',
              }}
            >
              <RefreshCw size={12} className={generating ? 'animate-spin' : ''} />
              Scramble
            </button>
            <button
              onClick={handleSolve}
              disabled={solving || !scramble}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
              style={{
                background: 'var(--bg-elevated)',
                color: solving || !scramble ? 'var(--text-muted)' : 'var(--accent-primary)',
                border: '1px solid var(--border)',
              }}
            >
              {solving ? <Loader size={12} className="animate-spin" /> : <Play size={12} />}
              {solving ? 'Solving… (can take ~a minute)' : 'Solve'}
            </button>
          </div>
        </div>
      </div>

      {scramble && (
        <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--bg-elevated)' }}>
          <span className="flex-1 font-mono text-xs break-all" style={{ color: 'var(--text-secondary)' }}>
            {scramble}
          </span>
          <CopyButton text={scramble} />
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs px-3 py-2 rounded-xl" style={{ background: 'var(--accent-danger)15', color: 'var(--accent-danger)' }}>
          {error}
        </p>
      )}

      {solving && (
        <div className="mt-4 flex flex-col gap-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-9 rounded-xl animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
          ))}
        </div>
      )}

      {result && !solving && (
        <div className="mt-4 pt-4 border-t flex flex-col gap-2" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>
              reduction {result.reduction_moves}m · 3×3 stage on{' '}
              <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{result.cfop_face}</span>
            </span>
            <span className="ml-auto font-mono tabular-nums">
              {result.total_moves} moves · {(result.time_ms / 1000).toFixed(1)}s
            </span>
            <button
              onClick={() => setAnim({ setup: scramble, alg: result.solution, label: 'full solution', stages: result.stages.map(s => ({ name: s.name, kind: s.kind, moveCount: s.move_count })) })}
              title="Animate full solution"
              className="p-1 rounded transition-colors shrink-0"
              style={{ color: 'var(--text-muted)' }}
            >
              <Play size={13} />
            </button>
            <CopyButton text={result.solution} />
          </div>

          {result.stages.map((stage, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'var(--bg-elevated)' }}>
              <span
                className="text-[11px] font-display font-semibold w-28 shrink-0"
                style={{ color: KIND_COLORS[stage.kind] ?? 'var(--text-secondary)' }}
              >
                {stage.name}
              </span>
              <span className="flex-1 font-mono text-sm break-all" style={{ color: 'var(--text-primary)' }}>
                {stage.moves.length > 0 ? stage.moves.join(' ') : '—'}
              </span>
              <span className="text-xs font-mono tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
                {stage.move_count}m
              </span>
              {stage.moves.length > 0 && (
                <button
                  onClick={() => animateStage(result, i)}
                  title="Animate this stage"
                  className="p-1 rounded transition-colors shrink-0"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Play size={12} />
                </button>
              )}
            </div>
          ))}

          {anim && (
            <div className="mt-2 rounded-xl px-3 py-2" style={{ background: 'var(--bg-elevated)' }}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-display" style={{ color: 'var(--text-muted)' }}>{anim.label}</p>
                <button
                  onClick={() => setAnim(null)}
                  className="text-xs px-2 py-0.5 rounded"
                  style={{ color: 'var(--text-muted)', background: 'var(--bg-surface)' }}
                >
                  Close
                </button>
              </div>
              <AnimatedCube setup={anim.setup} alg={anim.alg} puzzle="4x4x4" stages={anim.stages} />
            </div>
          )}
        </div>
      )}
    </GlassCard>
  )
}
