'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Timer, TrendingUp, Box, Settings } from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import { Modal } from '@/components/ui/Modal'
import { SettingsPanel } from '@/components/session/SettingsPanel'
import { useCubiqStore } from '@/store'

export const NAV = [
  { href: '/', icon: Timer, label: 'Practice' },
  { href: '/progress', icon: TrendingUp, label: 'Progress' },
  { href: '/lab', icon: Box, label: 'Solve Lab' },
] as const

function useActivePath() {
  // trailingSlash export: '/stats/' -> '/stats' ('/' stays '/')
  return usePathname().replace(/(.)\/$/, '$1')
}

/** App frame: rail nav (desktop), tab bar (phone), settings modal. Nav
 *  fades while a solve is running so only the time is visible. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useActivePath()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const solving = useCubiqStore(s => s.timerState === 'running' || s.timerState === 'inspection')
  const fade = { opacity: solving ? 0.08 : 1, transition: 'opacity 0.25s ease', pointerEvents: solving ? 'none' as const : undefined }

  return (
    <div className="flex h-dvh overflow-hidden">
      <nav
        aria-label="Main"
        className="hidden md:flex flex-col items-center gap-1.5 w-[84px] shrink-0 border-r border-line bg-surface py-4"
        style={fade}
      >
        <Link href="/" className="mb-4" aria-label="Cubiq home"><Logo size={34} /></Link>
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`group flex flex-col items-center gap-1.5 w-[68px] py-2.5 rounded-xl text-[10.5px] font-medium transition-colors ${
                active ? 'bg-raised text-ink' : 'text-muted hover:text-ink hover:bg-raised/60'
              }`}
            >
              <Icon size={20} strokeWidth={1.8} className={active ? 'text-go' : ''} />
              {label}
            </Link>
          )
        })}
        <span className="flex-1" />
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex flex-col items-center gap-1.5 w-[68px] py-2.5 rounded-xl text-[10.5px] font-medium text-muted hover:text-ink hover:bg-raised/60 transition-colors"
        >
          <Settings size={20} strokeWidth={1.8} />
          Settings
        </button>
      </nav>

      <main className="flex-1 min-w-0 overflow-y-auto pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0 relative">
        {children}
      </main>

      <nav
        aria-label="Main"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 grid border-t border-line bg-surface/95 backdrop-blur-xl pt-2 pb-[calc(8px+env(safe-area-inset-bottom))]"
        style={{ ...fade, gridTemplateColumns: `repeat(${NAV.length + 1}, 1fr)` }}
      >
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 text-[10px] font-medium ${active ? 'text-ink' : 'text-muted'}`}
            >
              <Icon size={21} strokeWidth={1.8} className={active ? 'text-go' : ''} />
              {label}
            </Link>
          )
        })}
        <button onClick={() => setSettingsOpen(true)} className="flex flex-col items-center gap-1 text-[10px] font-medium text-muted">
          <Settings size={21} strokeWidth={1.8} />
          Settings
        </button>
      </nav>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Settings">
        <SettingsPanel onNavigate={() => setSettingsOpen(false)} />
      </Modal>
    </div>
  )
}

/** Standard page header: eyebrow, title, optional actions on the right. */
export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex flex-col gap-1.5 min-w-0">
        {eyebrow && <span className="label">{eyebrow}</span>}
        <h1 className="font-display text-[28px] md:text-[34px] leading-[1.05] font-bold tracking-[-0.02em] text-ink">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  )
}
