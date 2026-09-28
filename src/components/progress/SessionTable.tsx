'use client'
import { useCubiqStore } from '@/store'
import { computeStats, formatStat } from '@/lib/stats'
import { PuzzleGlyph } from '@/components/ui/PuzzleGlyph'
import { PUZZLE_LABEL } from '@/lib/practice'

/** Every session side by side; click a row to switch to it. */
export function SessionTable() {
  const { sessions, activeSessionId, setActiveSession } = useCubiqStore()
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px] num">
        <thead>
          <tr className="text-left">
            {['Session', 'Solves', 'Best', 'ao5', 'ao12', 'Mean'].map(h => (
              <th key={h} className="label !text-[9.5px] px-2 py-2 border-b border-line font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sessions.map(s => {
            const st = computeStats(s.solves)
            const n = s.solves.length
            const active = s.id === activeSessionId
            return (
              <tr key={s.id} onClick={() => setActiveSession(s.id)} className={`cursor-pointer hover:bg-raised ${active ? 'bg-raised' : ''}`}>
                <td className="px-2 py-2.5 border-b border-line font-sans">
                  <span className="flex items-center gap-2 text-ink font-medium">
                    <PuzzleGlyph puzzle={s.puzzle} size={13} />
                    <span className="truncate max-w-[180px]">{s.name}</span>
                    <span className="text-muted text-xs font-normal">{PUZZLE_LABEL[s.puzzle]}</span>
                    {active && <span className="pill pill-go">VIEWING</span>}
                  </span>
                </td>
                <td className="px-2 py-2.5 border-b border-line text-muted">{n}</td>
                <td className="px-2 py-2.5 border-b border-line text-pb font-semibold">{formatStat(st.best, n)}</td>
                <td className="px-2 py-2.5 border-b border-line text-ink">{formatStat(st.ao5, n, 5)}</td>
                <td className="px-2 py-2.5 border-b border-line text-ink">{formatStat(st.ao12, n, 12)}</td>
                <td className="px-2 py-2.5 border-b border-line text-muted">{formatStat(st.mean, n)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
