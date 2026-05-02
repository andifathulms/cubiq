'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Timer, BarChart2, History, Cpu } from 'lucide-react'

const navItems = [
  { href: '/', icon: Timer, label: 'Timer' },
  { href: '/stats', icon: BarChart2, label: 'Stats' },
  { href: '/history', icon: History, label: 'History' },
  { href: '/solvers', icon: Cpu, label: 'Solvers' },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 flex border-t z-40"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
    >
      {navItems.map(({ href, icon: Icon, label }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-xs font-medium transition-colors"
            style={{ color: active ? 'var(--accent-primary)' : 'var(--text-muted)' }}
          >
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
