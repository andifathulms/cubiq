'use client'
import { useEffect, useState } from 'react'
import { Zap, Loader, Play, RefreshCw, Copy, Check } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { AnimatedCube } from '@/components/solvers/AnimatedCube'
import { generateScramble } from '@/lib/cubing'
import { useCubiqStore } from '@/store'

interface OptimalResult {
  moves: string[]
  move_count: number
  alternatives: string[][]
  optimal: boolean
  time_ms: number
}

interface Props {
  title: string
  description: string
  puzzleType: string      // session PuzzleType, e.g. '222' | 'pyram'
  endpoint: string        // e.g. '/solve/222'
  twistyId: string        // TwistyPlayer puzzle id, e.g. '2x2x2' | 'pyraminx'
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

export function OptimalSolverCard({ title, description, puzzleType, endpoint, twistyId }: Props) {
  const { settings, currentScramble } = useCubiqStore()
  const activePuzzle = useCubiqStore(
    s => s.sessions.find(sess => sess.id === s.activeSessionId)?.puzzle ?? '333'
  )
  const [scramble, setScramble] = useState('')
  const [solving, setSolving] = useState(false)
  const [result, setResult] = useState<OptimalResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAnim, setShowAnim] = useState(false)

  // Follow the timer scramble when a matching session is active
  useEffect(() => {
    if (activePuzzle === puzzleType && currentScramble) {
      setScramble(currentScramble)
      setResult(null)
      setShowAnim(false)
    }
  }, [activePuzzle, currentScramble, puzzleType])

  function generate() {
    setScramble(generateScramble(puzzleType))
    setResult(null)
    setError(null)
    setShowAnim(false)
  }

  async function handleSolve() {
    if (!scramble) return
    setSolving(true)
    setResult(null)
    setError(null)
    setShowAnim(false)
    try {
      const res = await fetch(`${settings.ml_service_url}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: scramble }),
        signal: AbortSignal.timeout(30000),
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
        <div className="p-2 rounded-xl shrink-0" style={{ background: 'var(--accent-success)15' }}>
          <Zap size={20} style={{ color: 'var(--accent-success)' }} />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold font-display text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
            {title}
          </h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            {description}
            {activePuzzle === puzzleType && ' Following your session scramble.'}
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={generate}
              disabled={solving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
              style={{
                background: 'var(--bg-elevated)',
                color: 'var(--accent-success)',
                border: '1px solid var(--border)',
              }}
            >
              <RefreshCw size={12} />
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
              Solve
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

      {result && !solving && (
        <div className="mt-4 pt-4 border-t flex flex-col gap-2" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'var(--bg-elevated)' }}>
            <span
              className="text-[10px] font-display font-semibold px-1.5 py-0.5 rounded shrink-0"
              style={{ background: 'var(--accent-success)20', color: 'var(--accent-success)' }}
            >
              OPTIMAL
            </span>
            <span className="flex-1 font-mono text-sm break-all" style={{ color: 'var(--text-primary)' }}>
              {result.moves.length > 0 ? result.moves.join(' ') : '(already solved)'}
            </span>
            <span className="text-xs font-mono tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
              {result.move_count}m
            </span>
            <button
              onClick={() => setShowAnim(v => !v)}
              title="Animate"
              className="p-1 rounded transition-colors shrink-0"
              style={{ color: showAnim ? 'var(--accent-primary)' : 'var(--text-muted)' }}
            >
              <Play size={13} />
            </button>
            <CopyButton text={result.moves.join(' ')} />
          </div>

          {result.alternatives.map((alt, i) => (
            <div key={i} className="flex items-center gap-2 pl-8">
              <span className="font-mono text-xs break-all" style={{ color: 'var(--text-secondary)' }}>
                {alt.join(' ')}
              </span>
              <CopyButton text={alt.join(' ')} />
            </div>
          ))}

          {showAnim && (
            <div className="mt-1 rounded-xl px-3 py-2" style={{ background: 'var(--bg-elevated)' }}>
              <AnimatedCube setup={scramble} alg={result.moves.join(' ')} puzzle={twistyId} height={220} />
            </div>
          )}
        </div>
      )}
    </GlassCard>
  )
}
