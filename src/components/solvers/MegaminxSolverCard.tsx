'use client'
import { useEffect, useState } from 'react'
import { Pentagon, Loader, Play, Copy, Check } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { AnimatedCube } from '@/components/solvers/AnimatedCube'
import { useCubiqStore } from '@/store'

interface MinxStage {
  name: string
  kind: string
  moves: string[]
  move_count: number
}

interface MinxResult {
  stages: MinxStage[]
  total_moves: number
  solution: string
  time_ms: number
}

const STAGE_COLORS: Record<string, string> = {
  star: 'var(--accent-primary)',
  'bottom corners': 'var(--accent-primary)',
  'lower band': 'var(--accent-secondary)',
  'low-mid corners': 'var(--accent-secondary)',
  'middle band': 'var(--accent-secondary)',
  'high-mid corners': 'var(--accent-secondary)',
  'upper band': 'var(--accent-secondary)',
  'LL edges': 'var(--accent-warning)',
  'LL corners': 'var(--accent-success)',
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

export function MegaminxSolverCard({ scramble }: { scramble: string }) {
  const settings = useCubiqStore(s => s.settings)
  const [solving, setSolving] = useState(false)
  const [result, setResult] = useState<MinxResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [anim, setAnim] = useState<{ setup: string; alg: string; label: string; stages?: { name: string; kind: string; moveCount: number }[] } | null>(null)

  // A new scramble (from the shared panel) invalidates any prior solution.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setResult(null)
    setError(null)
    setAnim(null)
  }, [scramble])
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleSolve() {
    if (!scramble) return
    setSolving(true)
    setResult(null)
    setError(null)
    setAnim(null)
    try {
      const res = await fetch(`${settings.ml_service_url}/solve/minx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: scramble }),
        signal: AbortSignal.timeout(600000),
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

  function animateStage(res: MinxResult, stageIdx: number) {
    const prior = res.stages.slice(0, stageIdx).flatMap(s => s.moves)
    setAnim({
      setup: [scramble, ...prior].join(' '),
      alg: res.stages[stageIdx].moves.join(' '),
      label: res.stages[stageIdx].name,
    })
  }

  return (
    <GlassCard>
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl shrink-0" style={{ background: 'var(--accent-warning)15' }}>
          <Pentagon size={20} style={{ color: 'var(--accent-warning)' }} />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold font-display text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
            Megaminx Solver
          </h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            Layer-by-layer: star → corners → bands piece by piece (each placement optimal
            given the order), then a discovered-macro last layer.
          </p>

          <button
            onClick={handleSolve}
            disabled={solving || !scramble}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-transform active:scale-[0.98]"
            style={{
              background: solving || !scramble ? 'var(--bg-elevated)' : 'var(--gradient-accent)',
              color: solving || !scramble ? 'var(--text-muted)' : '#08080c',
            }}
          >
            {solving ? <Loader size={14} className="animate-spin" /> : <Play size={14} />}
            {solving ? 'Solving… (1–2 minutes)' : 'Solve'}
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs px-3 py-2 rounded-xl" style={{ background: 'var(--accent-danger)15', color: 'var(--accent-danger)' }}>
          {error}
        </p>
      )}

      {solving && (
        <div className="mt-4 flex flex-col gap-2">
          {[...Array(9)].map((_, i) => (
            <div key={i} className="h-9 rounded-xl animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
          ))}
        </div>
      )}

      {result && !solving && (
        <div className="mt-4 pt-4 border-t flex flex-col gap-2" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>layer-by-layer reconstruction</span>
            <span className="ml-auto font-mono tabular-nums">
              {result.total_moves} moves · {(result.time_ms / 1000).toFixed(0)}s
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
                style={{ color: STAGE_COLORS[stage.name] ?? 'var(--text-secondary)' }}
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
              <AnimatedCube setup={anim.setup} alg={anim.alg} puzzle="megaminx" height={280} stages={anim.stages} />
            </div>
          )}
        </div>
      )}
    </GlassCard>
  )
}
