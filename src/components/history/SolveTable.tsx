'use client'
import { useState } from 'react'
import { Search } from 'lucide-react'
import { useCubiqStore } from '@/store'
import { formatTime, getEffectiveTime } from '@/lib/stats'
import { SolveRow } from './SolveRow'
import type { Penalty } from '@/types'

type PenaltyFilter = 'all' | 'ok' | '+2' | 'DNF'

export function SolveTable() {
  const { getActiveSession } = useCubiqStore()
  const session = getActiveSession()
  const solves = session?.solves ?? []

  const [search, setSearch] = useState('')
  const [penaltyFilter, setPenaltyFilter] = useState<PenaltyFilter>('all')

  if (solves.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-lg font-display" style={{ color: 'var(--text-muted)' }}>No solves yet</p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Start the timer to record your first solve</p>
      </div>
    )
  }

  const reversedSolves = [...solves].reverse()

  const filtered = reversedSolves.filter(solve => {
    if (penaltyFilter === 'ok' && solve.penalty !== null) return false
    if (penaltyFilter === '+2' && solve.penalty !== '+2') return false
    if (penaltyFilter === 'DNF' && solve.penalty !== 'DNF') return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const time = formatTime(getEffectiveTime(solve)).toLowerCase()
      return (
        time.includes(q) ||
        solve.scramble.toLowerCase().includes(q) ||
        solve.comment.toLowerCase().includes(q)
      )
    }
    return true
  })

  const penaltyOptions: { label: string; value: PenaltyFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'OK', value: 'ok' },
    { label: '+2', value: '+2' },
    { label: 'DNF', value: 'DNF' },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div
          className="flex items-center gap-2 flex-1 min-w-[180px] px-3 py-1.5 rounded-xl"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        >
          <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search time, scramble, comment…"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>

        <div className="flex gap-1">
          {penaltyOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setPenaltyFilter(opt.value)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: penaltyFilter === opt.value ? 'var(--accent-primary)20' : 'var(--bg-elevated)',
                color: penaltyFilter === opt.value ? 'var(--accent-primary)' : 'var(--text-muted)',
                border: `1px solid ${penaltyFilter === opt.value ? 'var(--accent-primary)' : 'var(--border)'}`,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {filtered.length} / {solves.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['#', 'Time', 'ao5', 'ao12', 'Scramble', 'Date', 'Actions', ''].map(h => (
                <th
                  key={h}
                  className="px-3 py-2 text-xs font-display uppercase tracking-wider"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                  No solves match your filter
                </td>
              </tr>
            ) : (
              filtered.map((solve) => {
                const originalIndex = solves.findIndex(s => s.id === solve.id)
                return (
                  <SolveRow
                    key={solve.id}
                    solve={solve}
                    index={originalIndex}
                    sessionId={session!.id}
                    precedingSolves={solves.slice(0, originalIndex)}
                  />
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
