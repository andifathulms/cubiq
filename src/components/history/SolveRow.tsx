'use client'
import { useState } from 'react'
import { Trash2, MessageSquare, ChevronDown } from 'lucide-react'
import { useCubiqStore } from '@/store'
import { formatTime, getEffectiveTime, calcAo } from '@/lib/stats'
import { Badge } from '@/components/ui/Badge'
import type { Solve } from '@/types'

interface SolveRowProps {
  solve: Solve
  index: number
  sessionId: string
  precedingSolves: Solve[]
}

export function SolveRow({ solve, index, sessionId, precedingSolves }: SolveRowProps) {
  const { updateSolve, deleteSolve } = useCubiqStore()
  const [expanded, setExpanded] = useState(false)

  const allSolves = [...precedingSolves, solve]
  const ao5 = calcAo(allSolves, 5)
  const ao12 = calcAo(allSolves, 12)
  const effective = getEffectiveTime(solve)

  function applyPenalty(penalty: '+2' | 'DNF' | null) {
    updateSolve(sessionId, solve.id, {
      penalty: solve.penalty === penalty ? null : penalty,
    })
  }

  return (
    <>
      <tr
        className="border-b cursor-pointer hover:bg-[var(--bg-elevated)] transition-colors"
        style={{ borderColor: 'var(--border)' }}
        onClick={() => setExpanded(e => !e)}
      >
        <td className="px-3 py-2 text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {index + 1}
        </td>
        <td className="px-3 py-2 font-mono text-sm tabular-nums" style={{ color: 'var(--text-primary)' }}>
          {formatTime(effective)}
          {solve.penalty && (
            <span className="ml-1 text-xs" style={{ color: solve.penalty === 'DNF' ? 'var(--accent-danger)' : 'var(--accent-warning)' }}>
              ({solve.penalty})
            </span>
          )}
        </td>
        <td className="px-3 py-2 font-mono text-sm tabular-nums" style={{ color: 'var(--text-secondary)' }}>
          {ao5 !== null ? formatTime(Math.round(ao5)) : '—'}
        </td>
        <td className="px-3 py-2 font-mono text-sm tabular-nums" style={{ color: 'var(--text-secondary)' }}>
          {ao12 !== null ? formatTime(Math.round(ao12)) : '—'}
        </td>
        <td className="px-3 py-2 text-xs hidden md:table-cell max-w-[200px] truncate" style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {solve.scramble}
        </td>
        <td className="px-3 py-2 text-xs hidden sm:table-cell" style={{ color: 'var(--text-muted)' }}>
          {new Date(solve.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => applyPenalty('+2')}
              className="px-1.5 py-0.5 rounded text-xs font-mono transition-colors"
              style={{
                color: solve.penalty === '+2' ? 'var(--accent-warning)' : 'var(--text-muted)',
                background: solve.penalty === '+2' ? 'var(--accent-warning)15' : 'transparent',
              }}
            >
              +2
            </button>
            <button
              onClick={() => applyPenalty('DNF')}
              className="px-1.5 py-0.5 rounded text-xs font-mono transition-colors"
              style={{
                color: solve.penalty === 'DNF' ? 'var(--accent-danger)' : 'var(--text-muted)',
                background: solve.penalty === 'DNF' ? 'var(--accent-danger)15' : 'transparent',
              }}
            >
              DNF
            </button>
            <button
              onClick={() => deleteSolve(sessionId, solve.id)}
              className="p-1 rounded transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-danger)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </td>
        <td className="px-2 py-2">
          <ChevronDown
            size={14}
            style={{
              color: 'var(--text-muted)',
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s',
            }}
          />
        </td>
      </tr>
      {expanded && (
        <tr style={{ background: 'var(--bg-surface)' }}>
          <td colSpan={8} className="px-4 py-3">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-mono break-all" style={{ color: 'var(--text-secondary)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Scramble: </span>
                {solve.scramble}
              </p>
              <div className="flex items-center gap-2">
                <MessageSquare size={12} style={{ color: 'var(--text-muted)' }} />
                <input
                  value={solve.comment}
                  onChange={e => updateSolve(sessionId, solve.id, { comment: e.target.value })}
                  placeholder="Add a comment…"
                  className="flex-1 bg-transparent text-xs outline-none"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
