'use client'
import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Trash2, ChevronDown, Box } from 'lucide-react'
import { useCubiqStore } from '@/store'
import { formatTime, getEffectiveTime } from '@/lib/stats'
import { relativeTime } from '@/lib/progress'
import type { Session } from '@/types'

type Filter = 'all' | 'pb' | '+2' | 'DNF'
const PAGE = 50

export function SolveLog({ session, ao5, ao12, pbIdx }: {
  session: Session
  ao5: (number | null)[]
  ao12: (number | null)[]
  pbIdx: Set<number>
}) {
  const { updateSolve, deleteSolve } = useCubiqStore()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [shown, setShown] = useState(PAGE)
  const [open, setOpen] = useState<string | null>(null)
  const solves = session.solves

  const rows = useMemo(() => {
    const out: number[] = []
    const query = q.trim().toLowerCase()
    for (let i = solves.length - 1; i >= 0; i--) {
      const s = solves[i]
      if (filter === 'pb' && !pbIdx.has(i)) continue
      if (filter === '+2' && s.penalty !== '+2') continue
      if (filter === 'DNF' && s.penalty !== 'DNF') continue
      if (query && !(formatTime(getEffectiveTime(s)).includes(query) || s.scramble.toLowerCase().includes(query) || s.comment.toLowerCase().includes(query))) continue
      out.push(i)
    }
    return out
  }, [solves, filter, q, pbIdx])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="seg" role="group" aria-label="Filter solves">
          {([['all', 'All'], ['pb', 'PBs'], ['+2', '+2'], ['DNF', 'DNF']] as const).map(([v, l]) => (
            <button key={v} type="button" aria-pressed={filter === v} onClick={() => { setFilter(v); setShown(PAGE) }}>{l}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 flex-1 min-w-[180px] h-9 px-3 rounded-[10px] bg-raised border border-line focus-within:border-line-strong">
          <Search size={14} className="text-muted shrink-0" />
          <input
            value={q} onChange={e => { setQ(e.target.value); setShown(PAGE) }}
            placeholder="Search time, scramble, comment" aria-label="Search solves"
            className="flex-1 min-w-0 bg-transparent text-sm outline-none text-ink placeholder:text-faint"
          />
        </label>
        <span className="num text-[11px] text-muted">{rows.length} / {solves.length}</span>
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full border-collapse text-[12.5px] num">
          <thead>
            <tr className="text-left">
              {['#', 'Time', '', 'ao5', 'ao12', 'Scramble', 'When', ''].map((h, i) => (
                <th key={i} className={`label !text-[9.5px] px-2 py-2 border-b border-line font-semibold ${i === 5 ? 'hidden lg:table-cell' : ''} ${i === 6 ? 'hidden sm:table-cell' : ''}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-2 py-10 text-center text-sm text-muted font-sans">No solves match this filter.</td></tr>
            )}
            {rows.slice(0, shown).map(i => {
              const s = solves[i]
              const t = getEffectiveTime(s)
              const isOpen = open === s.id
              return (
                <Fragment key={s.id}>
                  <tr
                    className={`cursor-pointer hover:bg-raised transition-colors ${isOpen ? 'bg-raised' : ''}`}
                    onClick={() => setOpen(isOpen ? null : s.id)}
                  >
                    <td className="px-2 py-2.5 border-b border-line text-faint">{i + 1}</td>
                    <td className={`px-2 py-2.5 border-b border-line font-semibold ${pbIdx.has(i) ? 'text-pb' : 'text-ink'}`}>
                      {formatTime(t)}{s.penalty === '+2' ? '+' : ''}
                    </td>
                    <td className="px-2 py-2.5 border-b border-line">
                      {pbIdx.has(i) && <span className="pill pill-pb">PB</span>}
                      {s.penalty === '+2' && <span className="pill pill-plus2">+2</span>}
                      {s.penalty === 'DNF' && <span className="pill pill-dnf">DNF</span>}
                    </td>
                    <td className="px-2 py-2.5 border-b border-line text-muted">{ao5[i] !== null ? formatTime(Math.round(ao5[i]!)) : '—'}</td>
                    <td className="px-2 py-2.5 border-b border-line text-muted">{ao12[i] !== null ? formatTime(Math.round(ao12[i]!)) : '—'}</td>
                    <td className="px-2 py-2.5 border-b border-line text-faint max-w-[260px] truncate hidden lg:table-cell">{s.scramble}</td>
                    <td className="px-2 py-2.5 border-b border-line text-muted whitespace-nowrap hidden sm:table-cell font-sans">{relativeTime(s.created_at)}</td>
                    <td className="px-2 py-2.5 border-b border-line text-right">
                      <ChevronDown size={14} className={`inline text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-raised">
                      <td colSpan={8} className="px-3 pb-4 pt-1 border-b border-line">
                        <div className="flex flex-col gap-3 font-sans">
                          <p className="num text-xs text-ink-2 break-all">{s.scramble}</p>
                          <input
                            value={s.comment} aria-label="Comment"
                            onChange={e => updateSolve(session.id, s.id, { comment: e.target.value })}
                            placeholder="Add a note (what went wrong, method, lookahead…)"
                            className="w-full h-9 px-3 rounded-lg bg-surface border border-line text-sm outline-none focus:border-line-strong text-ink placeholder:text-faint"
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="seg" role="group" aria-label="Penalty">
                              {([['OK', null], ['+2', '+2'], ['DNF', 'DNF']] as const).map(([l, p]) => (
                                <button key={l} type="button" aria-pressed={s.penalty === p} className="num !text-[11px]" onClick={() => updateSolve(session.id, s.id, { penalty: p })}>{l}</button>
                              ))}
                            </div>
                            <Link className="btn btn-ghost btn-sm" href={`/lab?puzzle=${session.puzzle}&scramble=${encodeURIComponent(s.scramble)}`}>
                              <Box size={13} /> Open in Solve Lab
                            </Link>
                            <span className="flex-1" />
                            <span className="text-xs text-muted">{new Date(s.created_at).toLocaleString()}</span>
                            <button className="btn btn-ghost btn-sm hover:!text-stop" onClick={() => deleteSolve(session.id, s.id)}>
                              <Trash2 size={13} /> Delete
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length > shown && (
        <button className="btn btn-ghost self-center" onClick={() => setShown(n => n + PAGE)}>
          Show {Math.min(PAGE, rows.length - shown)} more
        </button>
      )}
    </div>
  )
}
