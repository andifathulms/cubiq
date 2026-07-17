'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  BrainCircuit, Play, Square, Loader, RefreshCw, BarChart2,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { GlassCard } from '@/components/ui/GlassCard'
import { useCubiqStore } from '@/store'

// ── Types ──────────────────────────────────────────────────────────────────────

interface TrainStatus {
  trained: boolean
  running: boolean
  epoch: number
  loss: number | null
  value_loss: number | null
  policy_loss: number | null
  solve_rate: number | null
  model: string
}

interface EpochMetric {
  epoch: number
  loss: number | null
  solve_rate: number | null
}

interface MoveProb {
  move: string
  prob: number
}

interface PolicyResult {
  value_estimate: number
  moves: MoveProb[]
}

interface SolveResult {
  moves: string[]
  move_count: number
  solved: boolean
  time_ms: number
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatChip({
  label,
  value,
  color,
}: {
  label: string
  value: string | number | null
  color?: string
}) {
  return (
    <div
      className="flex flex-col items-center px-3 py-2 rounded-xl"
      style={{ background: 'var(--bg-elevated)' }}
    >
      <span className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>
        {label}
      </span>
      <span className="text-sm font-mono font-bold" style={{ color: color ?? 'var(--text-primary)' }}>
        {value ?? '—'}
      </span>
    </div>
  )
}

function PolicyBar({ move, prob }: { move: string; prob: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-7 text-right font-mono shrink-0" style={{ color: 'var(--text-secondary)' }}>
        {move}
      </span>
      <div className="flex-1 rounded-full h-1.5 overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${(prob * 100).toFixed(1)}%`,
            background: prob > 0.1 ? 'var(--accent-primary)' : 'var(--text-muted)',
          }}
        />
      </div>
      <span className="w-10 font-mono tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
        {(prob * 100).toFixed(1)}%
      </span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function MDPPanel() {
  const { settings, currentScramble } = useCubiqStore()
  const baseUrl = settings.ml_service_url.trim()

  const [status, setStatus] = useState<TrainStatus | null>(null)
  const [metrics, setMetrics] = useState<EpochMetric[]>([])
  const [policy, setPolicy] = useState<PolicyResult | null>(null)
  const [solveResult, setSolveResult] = useState<SolveResult | null>(null)
  const [solveMethod, setSolveMethod] = useState<'greedy' | 'mcts'>('greedy')
  const [kocResult, setKocResult] = useState<{ moves: string[]; move_count: number } | null>(null)

  const [loadingStatus, setLoadingStatus] = useState(false)
  const [loadingPolicy, setLoadingPolicy] = useState(false)
  const [solvingMdp, setSolvingMdp] = useState(false)

  const [trainEpochs, setTrainEpochs] = useState(50)
  const [trainK, setTrainK] = useState(10)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Fetches ────────────────────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    setLoadingStatus(true)
    try {
      const res = await fetch(`${baseUrl}/mdp/status`, { signal: AbortSignal.timeout(4000) })
      if (res.ok) setStatus(await res.json())
    } catch { /* service offline */ }
    finally { setLoadingStatus(false) }
  }, [baseUrl])

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch(`${baseUrl}/mdp/metrics`, { signal: AbortSignal.timeout(4000) })
      if (res.ok) {
        const data = await res.json()
        setMetrics(data.epochs ?? [])
      }
    } catch { /* ignore */ }
  }, [baseUrl])

  const fetchPolicy = useCallback(async (scramble: string) => {
    if (!scramble) return
    setLoadingPolicy(true)
    try {
      const res = await fetch(
        `${baseUrl}/mdp/policy?state=${encodeURIComponent(scramble)}`,
        { signal: AbortSignal.timeout(6000) },
      )
      if (res.ok) setPolicy(await res.json())
    } catch { /* ignore */ }
    finally { setLoadingPolicy(false) }
  }, [baseUrl])

  // ── Effects ────────────────────────────────────────────────────────────────
  /* eslint-disable react-hooks/set-state-in-effect */

  useEffect(() => {
    fetchStatus()
    fetchMetrics()
  }, [fetchStatus, fetchMetrics])

  // Poll while training is running
  useEffect(() => {
    if (status?.running) {
      pollRef.current = setInterval(() => {
        fetchStatus()
        fetchMetrics()
      }, 2000)
    } else {
      if (pollRef.current) clearInterval(pollRef.current)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [status?.running, fetchStatus, fetchMetrics])

  // Refresh policy whenever scramble changes and model is trained
  useEffect(() => {
    if (status?.trained && currentScramble) {
      fetchPolicy(currentScramble)
      setSolveResult(null)
      setKocResult(null)
    }
  }, [currentScramble, status?.trained, fetchPolicy])
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Actions ────────────────────────────────────────────────────────────────

  async function startTraining() {
    try {
      await fetch(`${baseUrl}/mdp/train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epochs: trainEpochs, k: trainK, l: 20, resume: true }),
      })
      await fetchStatus()
    } catch { /* ignore */ }
  }

  async function stopTraining() {
    try {
      await fetch(`${baseUrl}/mdp/train/stop`, { method: 'POST' })
      await fetchStatus()
    } catch { /* ignore */ }
  }

  async function handleMdpSolve() {
    if (!currentScramble || !status?.trained) return
    setSolvingMdp(true)
    setSolveResult(null)
    setKocResult(null)
    try {
      // Run MDP solve and Kociemba in parallel for comparison
      const [mdpRes, kocRes] = await Promise.all([
        fetch(`${baseUrl}/mdp/solve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: currentScramble, method: solveMethod, max_moves: 50 }),
          signal: AbortSignal.timeout(30000),
        }),
        fetch(`${baseUrl}/solve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: currentScramble, method: 'kociemba' }),
          signal: AbortSignal.timeout(10000),
        }),
      ])
      if (mdpRes.ok) setSolveResult(await mdpRes.json())
      if (kocRes.ok) {
        const kd = await kocRes.json()
        setKocResult({ moves: kd.moves, move_count: kd.move_count })
      }
    } catch { /* ignore */ }
    finally { setSolvingMdp(false) }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const isOnline = status !== null

  return (
    <GlassCard>
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="p-2 rounded-xl shrink-0" style={{ background: 'var(--accent-primary)15' }}>
          <BrainCircuit size={20} style={{ color: 'var(--accent-primary)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold font-display text-sm" style={{ color: 'var(--text-primary)' }}>
              MDP Research Dashboard
            </h3>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-mono uppercase tracking-wide"
              style={{
                background: isOnline ? 'var(--accent-success)18' : 'var(--accent-danger)18',
                color: isOnline ? 'var(--accent-success)' : 'var(--accent-danger)',
              }}
            >
              {isOnline ? 'connected' : 'offline'}
            </span>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Autodidactic Iteration (ADI) — trains a dual-head value+policy network to solve the cube via reinforcement learning.
          </p>
        </div>
        <button
          onClick={() => { fetchStatus(); fetchMetrics() }}
          disabled={loadingStatus}
          className="p-1.5 rounded-lg transition-colors shrink-0"
          style={{ color: 'var(--text-muted)', background: 'var(--bg-elevated)' }}
          title="Refresh status"
        >
          <RefreshCw size={13} className={loadingStatus ? 'animate-spin' : ''} />
        </button>
      </div>

      {!isOnline && (
        <div
          className="mb-4 px-3 py-2.5 rounded-xl text-xs"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
        >
          Connect to cubiq-ml via the <strong>Optimal Solver</strong> card above, then refresh.
        </div>
      )}

      {isOnline && (
        <>
          {/* Training stats */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            <StatChip label="Epoch" value={status?.epoch ?? 0} color="var(--accent-primary)" />
            <StatChip
              label="Loss"
              value={status?.loss != null ? status.loss.toFixed(3) : null}
            />
            <StatChip
              label="Solve rate"
              value={status?.solve_rate != null ? `${(status.solve_rate * 100).toFixed(0)}%` : null}
              color={
                status?.solve_rate != null
                  ? status.solve_rate > 0.5
                    ? 'var(--accent-success)'
                    : status.solve_rate > 0.1
                      ? 'var(--accent-warning)'
                      : 'var(--text-secondary)'
                  : undefined
              }
            />
            <StatChip
              label="Model"
              value={status?.trained ? 'ready' : 'untrained'}
              color={status?.trained ? 'var(--accent-success)' : 'var(--text-muted)'}
            />
          </div>

          {/* Training controls */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>Epochs</span>
              <input
                type="number"
                value={trainEpochs}
                onChange={e => setTrainEpochs(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={status?.running}
                className="w-16 px-2 py-1 rounded-lg text-center font-mono outline-none"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>Max depth</span>
              <input
                type="number"
                value={trainK}
                onChange={e => setTrainK(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={status?.running}
                className="w-14 px-2 py-1 rounded-lg text-center font-mono outline-none"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {status?.running ? (
              <button
                onClick={stopTraining}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ml-auto"
                style={{ background: 'var(--accent-danger)18', color: 'var(--accent-danger)', border: '1px solid var(--accent-danger)40' }}
              >
                <Square size={11} />
                Stop
              </button>
            ) : (
              <button
                onClick={startTraining}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ml-auto"
                style={{ background: 'var(--bg-elevated)', color: 'var(--accent-primary)', border: '1px solid var(--border)' }}
              >
                <Play size={11} />
                {status?.trained ? 'Continue Training' : 'Start Training'}
              </button>
            )}
          </div>

          {/* Training status bar */}
          {status?.running && (
            <div className="mb-4 flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Loader size={12} className="animate-spin shrink-0" style={{ color: 'var(--accent-primary)' }} />
              <span>Training epoch {status.epoch}…</span>
              {status.loss != null && <span className="font-mono">loss {status.loss.toFixed(4)}</span>}
            </div>
          )}

          {/* Metrics chart */}
          {metrics.length > 1 && (
            <div className="mb-6">
              <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                Training history
              </p>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={metrics} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="epoch"
                    tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                    labelStyle={{ color: 'var(--text-muted)' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="loss"
                    name="Loss"
                    stroke="var(--accent-secondary)"
                    dot={false}
                    strokeWidth={1.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="solve_rate"
                    name="Solve rate"
                    stroke="var(--accent-success)"
                    dot={false}
                    strokeWidth={1.5}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* MDP solve section */}
          <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-wider font-display" style={{ color: 'var(--text-muted)' }}>
                MDP Solve
              </p>
              <div className="flex items-center gap-2">
                {/* Method selector */}
                <div
                  className="flex rounded-lg overflow-hidden text-xs border"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {(['greedy', 'mcts'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setSolveMethod(m)}
                      className="px-2.5 py-1 font-mono transition-colors"
                      style={{
                        background: solveMethod === m ? 'var(--accent-primary)20' : 'var(--bg-elevated)',
                        color: solveMethod === m ? 'var(--accent-primary)' : 'var(--text-muted)',
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleMdpSolve}
                  disabled={solvingMdp || !currentScramble || !status?.trained}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
                  style={{
                    background: 'var(--bg-elevated)',
                    color: (solvingMdp || !currentScramble || !status?.trained)
                      ? 'var(--text-muted)'
                      : 'var(--accent-primary)',
                    border: '1px solid var(--border)',
                  }}
                >
                  {solvingMdp ? <Loader size={12} className="animate-spin" /> : <Play size={12} />}
                  {solvingMdp ? 'Solving…' : 'Solve'}
                </button>
              </div>
            </div>

            {!status?.trained && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Train the model first before running the MDP solver.
              </p>
            )}

            {status?.trained && !currentScramble && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Generate a scramble on the Timer page to solve.
              </p>
            )}

            {/* Solve comparison */}
            {(solveResult || kocResult) && !solvingMdp && (
              <div className="flex flex-col gap-2">
                {/* MDP result */}
                {solveResult && (
                  <div
                    className="px-3 py-2.5 rounded-xl"
                    style={{ background: 'var(--bg-elevated)' }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        MDP ({solveMethod})
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{
                            background: solveResult.solved ? 'var(--accent-success)18' : 'var(--accent-danger)18',
                            color: solveResult.solved ? 'var(--accent-success)' : 'var(--accent-danger)',
                          }}
                        >
                          {solveResult.solved ? 'solved' : 'failed'}
                        </span>
                        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                          {solveResult.move_count}m · {solveResult.time_ms.toFixed(0)}ms
                        </span>
                      </div>
                    </div>
                    <p className="text-xs font-mono break-all" style={{ color: 'var(--text-primary)' }}>
                      {solveResult.moves.length > 0 ? solveResult.moves.join(' ') : '(already solved)'}
                    </p>
                  </div>
                )}

                {/* Kociemba comparison */}
                {kocResult && (
                  <div
                    className="px-3 py-2.5 rounded-xl"
                    style={{ background: 'var(--bg-elevated)' }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                        Kociemba (optimal)
                      </span>
                      <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                        {kocResult.move_count}m
                      </span>
                    </div>
                    <p className="text-xs font-mono break-all" style={{ color: 'var(--text-secondary)' }}>
                      {kocResult.moves.join(' ')}
                    </p>
                  </div>
                )}

                {/* Efficiency ratio */}
                {solveResult?.solved && kocResult && kocResult.move_count > 0 && (
                  <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>
                    MDP used{' '}
                    <span className="font-mono" style={{ color: 'var(--accent-primary)' }}>
                      {(solveResult.move_count / kocResult.move_count).toFixed(1)}×
                    </span>{' '}
                    the optimal move count.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Policy distribution */}
          {status?.trained && (
            <div className="border-t pt-4 mt-4" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] uppercase tracking-wider font-display" style={{ color: 'var(--text-muted)' }}>
                  Policy distribution
                </p>
                <div className="flex items-center gap-2">
                  {loadingPolicy && (
                    <Loader size={11} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                  )}
                  {policy && (
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                      V̂ = {policy.value_estimate}
                    </span>
                  )}
                  <button
                    onClick={() => currentScramble && fetchPolicy(currentScramble)}
                    disabled={loadingPolicy || !currentScramble}
                    className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg transition-colors"
                    style={{
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <BarChart2 size={10} />
                    Refresh
                  </button>
                </div>
              </div>

              {!policy && !loadingPolicy && (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Generate a scramble to see what the policy recommends.
                </p>
              )}

              {loadingPolicy && (
                <div className="flex flex-col gap-1.5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-4 rounded animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
                  ))}
                </div>
              )}

              {policy && !loadingPolicy && (
                <div className="flex flex-col gap-1.5">
                  {[...policy.moves]
                    .sort((a, b) => b.prob - a.prob)
                    .map(mp => (
                      <PolicyBar key={mp.move} move={mp.move} prob={mp.prob} />
                    ))
                  }
                </div>
              )}
            </div>
          )}
        </>
      )}
    </GlassCard>
  )
}
