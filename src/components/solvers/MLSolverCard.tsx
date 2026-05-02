'use client'
import { useState, useEffect } from 'react'
import { Cpu, CheckCircle, XCircle, Loader } from 'lucide-react'
import { GlassCard } from '@/components/ui/GlassCard'
import { useCubiqStore } from '@/store'

type ServiceStatus = 'idle' | 'checking' | 'online' | 'offline'

export function MLSolverCard() {
  const { settings, updateSettings } = useCubiqStore()
  const [status, setStatus] = useState<ServiceStatus>('idle')
  const [serviceInfo, setServiceInfo] = useState<{ model?: string; version?: string } | null>(null)
  const [urlInput, setUrlInput] = useState(settings.ml_service_url)

  async function checkHealth() {
    setStatus('checking')
    setServiceInfo(null)
    try {
      const res = await fetch(`${settings.ml_service_url}/health`, {
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
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold font-display text-sm" style={{ color: 'var(--text-primary)' }}>
              MDP Solver
            </h3>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-mono"
              style={{ background: 'var(--accent-secondary)15', color: 'var(--accent-secondary)' }}
            >
              Coming Soon
            </span>
          </div>

          <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            A reinforcement-learning solver trained via Markov Decision Process will find
            optimal solutions for any cube state. Connect the{' '}
            <code className="font-mono text-[11px]" style={{ color: 'var(--accent-primary)' }}>cubiq-ml</code>{' '}
            FastAPI service to enable it.
          </p>

          {/* Service URL input */}
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
                — {serviceInfo.model} {serviceInfo.version}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* What it will do */}
      <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <p className="text-xs font-display uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
          Planned capabilities
        </p>
        <ul className="flex flex-col gap-1.5">
          {[
            'Full optimal solve via MDP/RL policy network',
            'Cross + F2L step-by-step solution',
            'CFOP hint engine for training',
            'Solve any scramble in ≤20 moves',
          ].map(item => (
            <li key={item} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--accent-secondary)' }}>›</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </GlassCard>
  )
}
