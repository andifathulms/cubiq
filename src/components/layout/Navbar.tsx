'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Download, Upload, Settings, X } from 'lucide-react'
import { useCubiqStore } from '@/store'
import { importFromJSON } from '@/lib/export'
import { Modal } from '@/components/ui/Modal'
import { SessionSelector } from '@/components/session/SessionSelector'
import { SettingsPanel } from '@/components/session/SettingsPanel'

export function Navbar() {
  const { exportData, importData } = useCubiqStore()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge')

  function handleImport() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async e => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      const text = await file.text()
      try {
        importData(text, importMode)
      } catch {
        alert('Invalid export file.')
      }
    }
    input.click()
  }

  return (
    <>
      <nav
        className="flex items-center justify-between px-4 h-14 border-b shrink-0"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
      >
        <Link href="/" className="flex items-center gap-2">
          <span
            className="text-xl font-bold font-display"
            style={{ color: 'var(--accent-primary)' }}
          >
            Cubiq
          </span>
        </Link>

        <SessionSelector />

        <div className="flex items-center gap-1">
          <button
            onClick={handleImport}
            title="Import solves"
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <Upload size={18} />
          </button>
          <button
            onClick={exportData}
            title="Export solves"
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <Download size={18} />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            title="Settings"
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <Settings size={18} />
          </button>
        </div>
      </nav>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings">
        <SettingsPanel />
      </Modal>
    </>
  )
}
