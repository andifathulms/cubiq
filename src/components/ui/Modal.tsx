'use client'
import { useEffect } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  wide?: boolean
}

export function Modal({ open, onClose, title, children, wide }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
      <div
        className={`relative z-10 w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} max-h-[88dvh] overflow-y-auto bg-surface border border-line rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 sm:mx-4 animate-fade-in`}
        style={{ boxShadow: 'var(--shadow-lg)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-lg font-bold tracking-tight text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-raised transition-colors">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
