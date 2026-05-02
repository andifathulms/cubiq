'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Timer, BarChart2, History, Cpu } from 'lucide-react'
import { StatsPanel } from '@/components/stats/StatsPanel'

const navItems = [
  { href: '/', icon: Timer, label: 'Timer' },
  { href: '/stats', icon: BarChart2, label: 'Stats' },
  { href: '/history', icon: History, label: 'History' },
  { href: '/solvers', icon: Cpu, label: 'Solvers' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="hidden md:flex flex-col w-56 shrink-0 border-r h-full"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
    >
      <nav className="flex flex-col gap-1 p-3">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{
                color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
                background: active ? 'var(--bg-elevated)' : 'transparent',
              }}
            >
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="flex-1 overflow-y-auto p-3">
        <StatsPanel />
      </div>
    </aside>
  )
}
