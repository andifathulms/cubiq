'use client'
import { useState } from 'react'
import { Layers, Loader, Play, Copy, Check } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { AnimatedCube } from '@/components/solvers/AnimatedCube'
import { useCubiqStore } from '@/store'

interface CFOPStage {
  name: string
  kind: 'cross' | 'xcross' | 'f2l' | 'oll' | 'pll'
  moves: string[]
  move_count: number
}

interface CFOPResult {
  face: string
  rotation: string
  stages: CFOPStage[]
  total_moves: number
  solution: string
  time_ms: number
}

const FACE_OPTIONS = ['best', 'D', 'U', 'F', 'B', 'R', 'L'] as const

const KIND_COLORS: Record<CFOPStage['kind'], string> = {
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

export function CFOPSolverCard() {
  const { settings, currentScramble } = useCubiqStore()
  const [face, setFace] = useState<(typeof FACE_OPTIONS)[number]>('best')
  const [solving, setSolving] = useState(false)
  const [result, setResult] = useState<CFOPResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [anim, setAnim] = useState<{ setup: string; alg: string; label: string } | null>(null)

  function animateStage(res: CFOPResult, stageIdx: number) {
    // Pre-apply the scramble, rotation and all previous stages; play this stage
    const prior = res.stages.slice(0, stageIdx).flatMap(s => s.moves)
    const setup = [currentScramble, res.rotation, ...prior].filter(Boolean).join(' ')
    setAnim({
      setup,
      alg: res.stages[stageIdx].moves.join(' '),
      label: res.stages[stageIdx].name,
    })
  }

  function animateFull(res: CFOPResult) {
    setAnim({ setup: currentScramble, alg: res.solution, label: 'full solution' })
  }

  async function handleSolve() {
    if (!currentScramble) return
    setSolving(true)
    setResult(null)
    setError(null)
    setAnim(null)
    try {
      const res = await fetch(`${settings.ml_service_url}/solve/cfop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: currentScramble, face }),
        signal: AbortSignal.timeout(60000),
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

  return (
    <GlassCard>
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl shrink-0" style={{ background: 'var(--accent-primary)15' }}>
          <Layers size={20} style={{ color: 'var(--accent-primary)' }} />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold font-display text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
            CFOP Solver
          </h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            Staged human-method solution: cross (or x-cross) → F2L pairs → OLL → PLL.
            Each stage is optimal; beam search picks the cross, pair order and variants
            that minimise total moves.
          </p>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Cross face</span>
            <div className="flex gap-1">
              {FACE_OPTIONS.map(f => (
                <button
                  key={f}
                  onClick={() => setFace(f)}
                  className="px-2 py-1 rounded-lg text-xs font-mono transition-colors"
                  style={{
                    background: face === f ? 'var(--accent-primary)25' : 'var(--bg-elevated)',
                    color: face === f ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {f}
                </button>
              ))}
            </div>

            <button
              onClick={handleSolve}
              disabled={solving || !currentScramble}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
              style={{
                background: 'var(--bg-elevated)',
                color: solving || !currentScramble ? 'var(--text-muted)' : 'var(--accent-primary)',
                border: '1px solid var(--border)',
              }}
            >
              {solving ? <Loader size={12} className="animate-spin" /> : <Play size={12} />}
              {solving ? (face === 'best' ? 'Solving all faces…' : 'Solving…') : 'Solve'}
            </button>
          </div>
        </div>
      </div>

      {!currentScramble && (
        <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          Generate a scramble on the Timer page first.
        </p>
      )}

      {error && (
        <p className="mt-3 text-xs px-3 py-2 rounded-xl" style={{ background: 'var(--accent-danger)15', color: 'var(--accent-danger)' }}>
          {error}
        </p>
      )}

      {solving && (
        <div className="mt-4 flex flex-col gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-9 rounded-xl animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
          ))}
        </div>
      )}

      {result && !solving && (
        <div className="mt-4 pt-4 border-t flex flex-col gap-2" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>
              cross on <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{result.face}</span>
              {result.rotation && <> — rotate <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{result.rotation}</span> first</>}
            </span>
            <span className="ml-auto font-mono tabular-nums">
              {result.total_moves} moves · {result.time_ms.toFixed(0)}ms
            </span>
            <button
              onClick={() => animateFull(result)}
              title="Animate full solution"
              className="p-1 rounded transition-colors shrink-0"
              style={{ color: 'var(--text-muted)' }}
            >
              <Play size={13} />
            </button>
            <CopyButton text={result.solution} />
          </div>

          {result.stages.map((stage, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-3 py-2 rounded-xl"
              style={{ background: 'var(--bg-elevated)' }}
            >
              <span
                className="text-[11px] font-display font-semibold w-24 shrink-0"
                style={{ color: KIND_COLORS[stage.kind] }}
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
                <p className="text-xs font-display" style={{ color: 'var(--text-muted)' }}>
                  {anim.label}
                </p>
                <button
                  onClick={() => setAnim(null)}
                  className="text-xs px-2 py-0.5 rounded"
                  style={{ color: 'var(--text-muted)', background: 'var(--bg-surface)' }}
                >
                  Close
                </button>
              </div>
              <AnimatedCube setup={anim.setup} alg={anim.alg} />
            </div>
          )}
        </div>
      )}
    </GlassCard>
  )
}
