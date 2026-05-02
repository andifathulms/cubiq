'use client'
import { useCubiqStore } from '@/store'
import { SolveRow } from './SolveRow'

export function SolveTable() {
  const { getActiveSession } = useCubiqStore()
  const session = getActiveSession()
  const solves = session?.solves ?? []

  if (solves.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <p className="text-lg font-display" style={{ color: 'var(--text-muted)' }}>No solves yet</p>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Start the timer to record your first solve</p>
      </div>
    )
  }

  const reversedSolves = [...solves].reverse()

  return (
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
          {reversedSolves.map((solve, i) => {
            const originalIndex = solves.length - 1 - i
            return (
              <SolveRow
                key={solve.id}
                solve={solve}
                index={originalIndex}
                sessionId={session!.id}
                precedingSolves={solves.slice(0, originalIndex)}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
