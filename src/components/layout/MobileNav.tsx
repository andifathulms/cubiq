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
      className="md:hidden fixed bottom-0 left-0 right-0 flex border-t z-40 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
      style={{ borderColor: 'var(--border)', background: 'color-mix(in srgb, var(--bg-surface) 85%, transparent)' }}
    >
      {navItems.map(({ href, icon: Icon, label }) => {
        const active = pathname === href
        return (
          <Link
            key={href}
            href={href}
            className="relative flex-1 flex flex-col items-center justify-center py-2.5 gap-1 text-[11px] font-medium transition-colors"
            style={{ color: active ? 'var(--accent-primary)' : 'var(--text-muted)' }}
          >
            {active && (
              <span
                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full"
                style={{ background: 'var(--gradient-accent)' }}
              />
            )}
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
