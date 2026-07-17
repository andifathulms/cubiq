'use client'
import { useState } from 'react'
import { Cpu, CheckCircle, XCircle, Loader, Play, Copy, Check } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { useCubiqStore } from '@/store'

type ServiceStatus = 'idle' | 'checking' | 'online' | 'offline'

interface SolveResult {
  moves: string[]
  move_count: number
  time_ms: number
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

export function MLSolverCard({ scramble }: { scramble?: string } = {}) {
  const { settings, updateSettings } = useCubiqStore()
  const storeScramble = useCubiqStore(s => s.currentScramble)
  const currentScramble = scramble ?? storeScramble
  const [status, setStatus] = useState<ServiceStatus>('idle')
  const [serviceInfo, setServiceInfo] = useState<{ model?: string; version?: string } | null>(null)
  const [urlInput, setUrlInput] = useState(settings.ml_service_url)
  const [solving, setSolving] = useState(false)
  const [solveResult, setSolveResult] = useState<SolveResult | null>(null)
  const [solveError, setSolveError] = useState<string | null>(null)

  async function checkHealth() {
    const url = urlInput.trim()
    updateSettings({ ml_service_url: url })
    setStatus('checking')
    setServiceInfo(null)
    try {
      const res = await fetch(`${url}/health`, {
        signal: AbortSignal.timeout(4000),
      })
      if (res.ok) {
        const data = await res.json()
        setServiceInfo({ model: data.model, version: data.version })
        setStatus('online')
      } else {
        setStatus('offline')
      }
    } catch {
      setStatus('offline')
    }
  }

  function saveUrl() {
    updateSettings({ ml_service_url: urlInput.trim() })
  }

  async function handleSolve() {
    if (!currentScramble || status !== 'online') return
    setSolving(true)
    setSolveResult(null)
    setSolveError(null)
    try {
      const res = await fetch(`${urlInput.trim()}/solve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: currentScramble, method: 'kociemba' }),
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) {
        const text = await res.text()
        let detail = 'Solve failed'
        try { detail = JSON.parse(text).detail ?? detail } catch { /* non-JSON error body */ }
        throw new Error(detail)
      }
      setSolveResult(await res.json())
    } catch (e) {
      setSolveError(String(e))
    } finally {
      setSolving(false)
    }
  }

  const statusIcon = {
    idle: null,
    checking: <Loader size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />,
    online: <CheckCircle size={14} style={{ color: 'var(--accent-success)' }} />,
    offline: <XCircle size={14} style={{ color: 'var(--accent-danger)' }} />,
  }[status]

  const statusText = {
    idle: 'Not checked',
    checking: 'Connecting…',
    online: 'Service online',
    offline: 'Service offline',
  }[status]

  return (
    <GlassCard>
      <div className="flex items-start gap-3">
        <div
          className="p-2 rounded-xl shrink-0"
          style={{ background: 'var(--accent-secondary)15' }}
        >
          <Cpu size={20} style={{ color: 'var(--accent-secondary)' }} />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold font-display text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
            Optimal Solver
          </h3>
          <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            Kociemba two-phase algorithm via the{' '}
            <code className="font-mono text-[11px]" style={{ color: 'var(--accent-primary)' }}>cubiq-ml</code>{' '}
            service. Finds the optimal solution for any scramble.
          </p>

          {/* Service URL + connect */}
          <div className="flex gap-2 mb-3">
            <input
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onBlur={saveUrl}
              onKeyDown={e => { if (e.key === 'Enter') saveUrl() }}
              placeholder="http://localhost:8000"
              className="flex-1 text-xs px-2 py-1.5 rounded-lg outline-none font-mono"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              onClick={checkHealth}
              disabled={status === 'checking'}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
              style={{
                background: 'var(--bg-elevated)',
                color: status === 'checking' ? 'var(--text-muted)' : 'var(--accent-primary)',
                border: '1px solid var(--border)',
              }}
            >
              Connect
            </button>
          </div>

          {/* Status row */}
          <div className="flex items-center gap-1.5">
            {statusIcon}
            <span className="text-xs" style={{ color: status === 'online' ? 'var(--accent-success)' : 'var(--text-muted)' }}>
              {statusText}
            </span>
            {serviceInfo?.model && (
              <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                — {serviceInfo.model} v{serviceInfo.version}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Solve panel — only shown when service is online */}
      {status === 'online' && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-display uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Optimal Solve
            </p>
            <button
              onClick={handleSolve}
              disabled={solving || !currentScramble}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
              style={{
                background: 'var(--bg-elevated)',
                color: solving || !currentScramble ? 'var(--text-muted)' : 'var(--accent-primary)',
                border: '1px solid var(--border)',
              }}
            >
              {solving
                ? <Loader size={12} className="animate-spin" />
                : <Play size={12} />
              }
              {solving ? 'Solving…' : 'Solve'}
            </button>
          </div>

          {!currentScramble && !solving && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Generate a scramble to solve.
            </p>
          )}

          {solveError && (
            <p className="text-xs px-3 py-2 rounded-xl" style={{ background: 'var(--accent-danger)15', color: 'var(--accent-danger)' }}>
              {solveError}
            </p>
          )}

          {solving && (
            <div className="h-11 rounded-xl animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
          )}

          {solveResult && !solving && (
            <div className="flex flex-col gap-2">
              <div
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{ background: 'var(--bg-elevated)' }}
              >
                <span className="flex-1 font-mono text-sm break-all" style={{ color: 'var(--text-primary)' }}>
                  {solveResult.moves.length > 0 ? solveResult.moves.join(' ') : '(already solved)'}
                </span>
                <span className="text-xs font-mono tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {solveResult.move_count}m
                </span>
                <span className="text-xs tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {solveResult.time_ms.toFixed(0)}ms
                </span>
                <CopyButton text={solveResult.moves.join(' ')} />
              </div>

              {solveResult.move_count > 0 && (
                <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>
                  This is the optimal solution. Apply it to restore the cube to a solved state.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Offline hint */}
      {status === 'offline' && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Start the cubiq-ml service:
          </p>
          <pre
            className="mt-2 text-xs font-mono px-3 py-2 rounded-xl overflow-x-auto"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          >
            {`cd cubiq-ml\nsource .venv/bin/activate\nuvicorn main:app --reload`}
          </pre>
        </div>
      )}
    </GlassCard>
  )
}
