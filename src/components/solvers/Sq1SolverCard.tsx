'use client'
import { useEffect, useState } from 'react'
import { CircleDot, Loader, Play, Copy, Check } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { Sq1AnimatedView } from '@/components/solvers/Sq1AnimatedView'
import { Sq1View3D } from '@/components/solvers/Sq1View3D'
import { AnimatedCube } from '@/components/solvers/AnimatedCube'
import { useCubiqStore } from '@/store'

interface StageSq1 {
  name: string
  kind: string
  moves: string[]
  move_count: number
}

interface ResultSq1 {
  stages: StageSq1[]
  total_moves: number
  solution: string
  time_ms: number
}

const KIND_COLORS: Record<string, string> = {
  shape: 'var(--accent-primary)',
  pieces: 'var(--accent-secondary)',
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

export function Sq1SolverCard({ scramble }: { scramble: string }) {
  const settings = useCubiqStore(s => s.settings)
  const [solving, setSolving] = useState(false)
  const [result, setResult] = useState<ResultSq1 | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [anim, setAnim] = useState<{ setup: string; alg: string; label: string } | null>(null)
  const [view, setView] = useState<'3d' | 'disc' | 'net'>('3d')

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
      const res = await fetch(`${settings.ml_service_url}/solve/sq1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: scramble }),
        signal: AbortSignal.timeout(120000),
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

  function animateStage(res: ResultSq1, stageIdx: number) {
    const prior = res.stages.slice(0, stageIdx).flatMap(st => st.moves)
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
          <CircleDot size={20} style={{ color: 'var(--accent-warning)' }} />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold font-display text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
            Square-1 Solver
          </h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            Optimal-slash shape stage, then exact table descent: corners home, then edges
            with corner-preserving composites (including the parity bridge).
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
            Solve
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-xs px-3 py-2 rounded-xl" style={{ background: 'var(--accent-danger)15', color: 'var(--accent-danger)' }}>
          {error}
        </p>
      )}

      {result && !solving && (
        <div className="mt-4 pt-4 border-t flex flex-col gap-2" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>shape, then pieces</span>
            <span className="ml-auto font-mono tabular-nums">
              {result.total_moves} slashes · {(result.time_ms / 1000).toFixed(1)}s
            </span>
            <button
              onClick={() => setAnim({ setup: scramble, alg: result.solution, label: 'full solution' })}
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
                className="text-[11px] font-display font-semibold w-24 shrink-0"
                style={{ color: KIND_COLORS[stage.kind] ?? 'var(--text-secondary)' }}
              >
                {stage.name}
              </span>
              <span className="flex-1 font-mono text-sm break-all" style={{ color: 'var(--text-primary)' }}>
                {stage.moves.length > 0 ? stage.moves.join(' ') : '—'}
              </span>
              <span className="text-xs font-mono tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
                {stage.move_count}/
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
                <div className="flex items-center gap-1">
                  {(['3d', 'disc', 'net'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setView(m)}
                      className="text-xs px-2 py-0.5 rounded transition-colors"
                      style={{
                        color: view === m ? 'var(--accent-primary)' : 'var(--text-muted)',
                        background: view === m ? 'var(--accent-primary)15' : 'var(--bg-surface)',
                      }}
                    >
                      {m === '3d' ? '3D' : m === 'disc' ? '2D' : 'net'}
                    </button>
                  ))}
                  <button
                    onClick={() => setAnim(null)}
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ color: 'var(--text-muted)', background: 'var(--bg-surface)' }}
                  >
                    Close
                  </button>
                </div>
              </div>
              {view === '3d' && <Sq1View3D setup={anim.setup} alg={anim.alg} />}
              {view === 'disc' && <Sq1AnimatedView setup={anim.setup} alg={anim.alg} />}
              {view === 'net' && <AnimatedCube setup={anim.setup} alg={anim.alg} puzzle="square1" />}
            </div>
          )}
        </div>
      )}
    </GlassCard>
  )
}
