'use client'
import { useState } from 'react'
import { ChevronDown, Plus, Pencil, Trash2 } from 'lucide-react'
import { useCubiqStore } from '@/store'

export function SessionSelector() {
  const { sessions, activeSessionId, setActiveSession, createSession, renameSession, deleteSession } = useCubiqStore()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const active = sessions.find(s => s.id === activeSessionId)

  function handleCreate() {
    if (!newName.trim()) return
    createSession(newName.trim())
    setNewName('')
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
