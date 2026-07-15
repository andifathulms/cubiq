'use client'
import { useState } from 'react'
import { ChevronDown, Plus, Pencil, Trash2 } from 'lucide-react'
import { useCubiqStore } from '@/store'

const PUZZLES: { id: string; label: string }[] = [
  { id: '222', label: '2×2' },
  { id: '333', label: '3×3' },
  { id: '444', label: '4×4' },
  { id: '555', label: '5×5' },
  { id: 'pyram', label: 'Pyra' },
  { id: 'skewb', label: 'Skewb' },
  { id: 'minx', label: 'Mega' },
  { id: 'sq1', label: 'Sq-1' },
]

const PUZZLE_LABEL: Record<string, string> = Object.fromEntries(PUZZLES.map(p => [p.id, p.label]))

export function SessionSelector() {
  const { sessions, activeSessionId, setActiveSession, createSession, renameSession, deleteSession } = useCubiqStore()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPuzzle, setNewPuzzle] = useState('333')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const active = sessions.find(s => s.id === activeSessionId)

  function handleCreate() {
    if (!newName.trim()) return
    createSession(newName.trim(), newPuzzle)
    setNewName('')
    setNewPuzzle('333')
    setCreating(false)
    setOpen(false)
  }

  function handleRename(id: string) {
    if (!editName.trim()) return
    renameSession(id, editName.trim())
    setEditingId(null)
  }

  function handleDelete(id: string) {
    if (sessions.length <= 1) return
    deleteSession(id)
    if (id === activeSessionId) setOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors"
        style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}
      >
        <span className="max-w-[120px] truncate">{active?.name ?? 'Session'}</span>
        {active && active.puzzle !== '333' && (
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
            style={{ background: 'var(--bg-glass)', color: 'var(--accent-primary)' }}
          >
            {PUZZLE_LABEL[active.puzzle] ?? active.puzzle}
          </span>
        )}
        <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 w-56 rounded-2xl shadow-xl z-50 overflow-hidden"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        >
          <ul className="py-1 max-h-60 overflow-y-auto">
            {sessions.map(s => (
              <li key={s.id} className="group flex items-center gap-1 px-2">
                {editingId === s.id ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRename(s.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    onBlur={() => handleRename(s.id)}
                    className="flex-1 bg-transparent text-sm py-1.5 px-2 outline-none"
                    style={{ color: 'var(--text-primary)' }}
                  />
                ) : (
                  <button
                    onClick={() => { setActiveSession(s.id); setOpen(false) }}
                    className="flex-1 text-left text-sm py-1.5 px-2 rounded-lg truncate"
                    style={{
                      color: s.id === activeSessionId ? 'var(--accent-primary)' : 'var(--text-primary)',
                      background: s.id === activeSessionId ? 'var(--bg-glass)' : 'transparent',
                    }}
                  >
                    {s.name}
                    <span className="ml-1.5 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                      {PUZZLE_LABEL[s.puzzle] ?? s.puzzle}
                    </span>
                  </button>
                )}
                <button
                  onClick={() => { setEditingId(s.id); setEditName(s.name) }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Pencil size={12} />
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  className={`p-1 rounded transition-opacity ${sessions.length <= 1 ? 'opacity-20 cursor-not-allowed' : 'opacity-0 group-hover:opacity-100'}`}
                  style={{ color: 'var(--accent-danger)' }}
                  disabled={sessions.length <= 1}
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>

          <div className="border-t p-2" style={{ borderColor: 'var(--border)' }}>
            {creating ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-1">
                  <input
                    autoFocus
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCreate()
                      if (e.key === 'Escape') setCreating(false)
                    }}
                    placeholder="Session name"
                    className="flex-1 bg-transparent text-sm px-2 py-1 outline-none border rounded-lg"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                  <button
                    onClick={handleCreate}
                    className="px-2 py-1 rounded-lg text-xs font-medium"
                    style={{ background: 'var(--accent-primary)', color: 'var(--bg-base)' }}
                  >
                    Add
                  </button>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {PUZZLES.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setNewPuzzle(p.id)}
                      className="px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors"
                      style={{
                        background: newPuzzle === p.id ? 'var(--accent-primary)25' : 'transparent',
                        color: newPuzzle === p.id ? 'var(--accent-primary)' : 'var(--text-muted)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 w-full px-2 py-1.5 rounded-lg text-sm transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Plus size={14} />
                New session
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
