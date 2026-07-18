'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  const pathname = usePathname()
  // The Solvers page is a standalone tool — timer sessions don't apply there.
  const showSession = pathname !== '/solvers'

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
        className="flex items-center justify-between px-4 h-16 border-b shrink-0 backdrop-blur-xl z-40"
        style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--bg-surface) 80%, transparent)' }}
      >
        <Link href="/" className="flex items-center gap-2.5 group">
          <span
            className="flex items-center justify-center w-8 h-8 rounded-xl font-display font-bold text-base shrink-0 transition-transform duration-200 group-hover:scale-105"
            style={{
              background: 'var(--gradient-accent)',
              color: '#08080c',
              boxShadow: '0 4px 16px -4px rgba(110, 231, 247, 0.5)',
            }}
          >
            C
          </span>
          <span className="text-lg font-bold font-display tracking-tight hidden sm:block" style={{ color: 'var(--text-primary)' }}>
            Cubiq
          </span>
        </Link>

        {showSession ? <SessionSelector /> : <span />}

        <div className="flex items-center gap-0.5">
          {[
            { onClick: handleImport, title: 'Import solves', Icon: Upload },
            { onClick: exportData, title: 'Export solves', Icon: Download },
            { onClick: () => setSettingsOpen(true), title: 'Settings', Icon: Settings },
          ].map(({ onClick, title, Icon }) => (
            <button
              key={title}
              onClick={onClick}
              title={title}
              className="p-2.5 rounded-xl transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => {
                e.currentTarget.style.color = 'var(--text-primary)'
                e.currentTarget.style.background = 'var(--bg-glass)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = 'var(--text-muted)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <Icon size={18} />
            </button>
          ))}
        </div>
      </nav>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings">
        <SettingsPanel />
      </Modal>
    </>
  )
}
