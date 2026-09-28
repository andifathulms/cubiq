'use client'
import { useEffect, useState } from 'react'
import { ChevronDown, Pencil, Trash2, Check, Plus } from 'lucide-react'
import { useCubiqStore } from '@/store'
import { Modal } from '@/components/ui/Modal'
import { PuzzleGlyph } from '@/components/ui/PuzzleGlyph'
import { PUZZLES, PUZZLE_LABEL } from '@/lib/practice'
import { computeStats, formatStat } from '@/lib/stats'

/** Current session as a chip; tapping opens the sessions sheet. */
export function SessionChip({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHydrated(true), [])
  const session = useCubiqStore(s => s.sessions.find(x => x.id === s.activeSessionId))

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2.5 h-9 pl-1.5 pr-3 rounded-full bg-raised hover:bg-sunk text-ink text-[13px] font-medium transition-colors max-w-full"
        aria-haspopup="dialog"
      >
        <span className="grid place-items-center w-6 h-6 rounded-full bg-surface">
          <PuzzleGlyph puzzle={hydrated ? session?.puzzle ?? '333' : '333'} size={13} />
        </span>
        <span className="truncate">
          {hydrated ? `${PUZZLE_LABEL[session?.puzzle ?? '333'] ?? session?.puzzle} · ${session?.name}` : 'Session'}
        </span>
        {!compact && hydrated && <span className="text-muted text-xs hidden sm:inline">· {session?.solves.length ?? 0} solves</span>}
        <ChevronDown size={14} className="text-muted shrink-0" />
      </button>
      <SessionSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function SessionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { sessions, activeSessionId, setActiveSession, createSession, renameSession, deleteSession } = useCubiqStore()
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newPuzzle, setNewPuzzle] = useState('333')

  function create() {
    const name = newName.trim() || `${PUZZLE_LABEL[newPuzzle]} session`
    createSession(name, newPuzzle)
    setNewName('')
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Sessions">
      <ul className="flex flex-col gap-2">
        {sessions.map(s => {
          const active = s.id === activeSessionId
          const st = computeStats(s.solves)
          return (
            <li
              key={s.id}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-colors ${
                active ? 'border-go bg-[color-mix(in_srgb,var(--go)_9%,var(--raised))]' : 'border-transparent bg-raised hover:border-line-strong'
              }`}
            >
              <PuzzleGlyph puzzle={s.puzzle} size={16} />
              {editing === s.id ? (
                <input
                  autoFocus value={editName} aria-label="Session name"
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && editName.trim()) { renameSession(s.id, editName.trim()); setEditing(null) }
                    if (e.key === 'Escape') setEditing(null)
                  }}
                  className="flex-1 min-w-0 bg-surface border border-line rounded-lg px-2 py-1 text-sm outline-none focus:border-line-strong"
                />
              ) : (
                <button className="flex-1 min-w-0 text-left" onClick={() => { setActiveSession(s.id); onClose() }}>
                  <span className="block text-sm font-semibold text-ink truncate">{s.name}</span>
                  <span className="num block text-[11px] text-muted">
                    {PUZZLE_LABEL[s.puzzle] ?? s.puzzle} · {s.solves.length} solves · ao12 {formatStat(st.ao12, s.solves.length, 12)}
                  </span>
                </button>
              )}
              {editing === s.id ? (
                <button className="btn btn-ghost btn-sm" aria-label="Save name" onClick={() => { if (editName.trim()) renameSession(s.id, editName.trim()); setEditing(null) }}>
                  <Check size={14} />
                </button>
              ) : confirmDelete === s.id ? (
                <span className="flex items-center gap-1.5">
                  <button className="btn btn-sm bg-stop text-white" onClick={() => { deleteSession(s.id); setConfirmDelete(null) }}>Delete {s.solves.length} solves</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>Keep</button>
                </span>
              ) : (
                <span className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                  <button className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface" aria-label={`Rename ${s.name}`} onClick={() => { setEditing(s.id); setEditName(s.name) }}>
                    <Pencil size={14} />
                  </button>
                  <button
                    className="p-1.5 rounded-lg text-muted hover:text-stop hover:bg-surface disabled:opacity-30"
                    aria-label={`Delete ${s.name}`} disabled={sessions.length <= 1}
                    onClick={() => setConfirmDelete(s.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              )}
            </li>
          )
        })}
      </ul>

      <div className="mt-5 pt-5 border-t border-line flex flex-col gap-3">
        <span className="label">New session</span>
        <div className="grid grid-cols-4 gap-1.5">
          {PUZZLES.map(p => (
            <button
              key={p.id} type="button" aria-pressed={newPuzzle === p.id} onClick={() => setNewPuzzle(p.id)}
              className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl border text-[11px] font-medium transition-colors ${
                newPuzzle === p.id ? 'border-go text-ink bg-[color-mix(in_srgb,var(--go)_9%,transparent)]' : 'border-line text-muted hover:text-ink hover:border-line-strong'
              }`}
            >
              <PuzzleGlyph puzzle={p.id} size={16} />
              {p.short}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create() }}
            placeholder={`${PUZZLE_LABEL[newPuzzle]} session`} aria-label="New session name"
            className="flex-1 min-w-0 bg-raised border border-line rounded-[10px] px-3 text-sm outline-none focus:border-line-strong"
          />
          <button className="btn btn-primary" onClick={create}><Plus size={15} /> Create</button>
        </div>
      </div>
    </Modal>
  )
}
