'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Timer, BarChart2, History, Cpu, PanelLeftClose, PanelLeft } from 'lucide-react'
import { StatsPanel } from '@/components/stats/StatsPanel'

const navItems = [
  { href: '/', icon: Timer, label: 'Timer' },
  { href: '/stats', icon: BarChart2, label: 'Stats' },
  { href: '/history', icon: History, label: 'History' },
  { href: '/solvers', icon: Cpu, label: 'Solvers' },
]

const STORAGE_KEY = 'cubiq:sidebar-collapsed'

export function Sidebar() {
  const pathname = usePathname()
  // Timer session stats are irrelevant on the standalone Solvers page.
  const showStats = pathname !== '/solvers'

  const [collapsed, setCollapsed] = useState(false)
  // Load the persisted preference after mount (avoids SSR/client mismatch).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed(localStorage.getItem(STORAGE_KEY) === '1')
  }, [])

  function toggle() {
    setCollapsed(c => {
      const next = !c
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      return next
    })
  }

  return (
    <aside
      className="hidden md:flex flex-col shrink-0 border-r h-full transition-[width] duration-200 ease-out"
      style={{
        width: collapsed ? '4rem' : '15rem',
        borderColor: 'var(--border)',
        background: 'var(--bg-surface)',
      }}
    >
      {/* Collapse toggle */}
      <div className={`flex items-center px-3 pt-3 ${collapsed ? 'justify-center' : 'justify-end'}`}>
        <button
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="p-2 rounded-lg transition-colors"
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
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 p-3 pt-1">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`group relative flex items-center gap-3 rounded-xl text-sm font-medium transition-all ${
                collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
              }`}
              style={{
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: active ? 'var(--bg-glass-strong)' : 'transparent',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-glass)' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
            >
              {active && !collapsed && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full"
                  style={{ background: 'var(--gradient-accent)' }}
                />
              )}
              <Icon size={17} style={{ color: active ? 'var(--accent-primary)' : 'inherit' }} />
              {!collapsed && label}
            </Link>
          )
        })}
      </nav>

      {showStats && !collapsed && (
        <>
          <div className="mx-3 my-1 border-t" style={{ borderColor: 'var(--border)' }} />
          <div className="flex-1 overflow-y-auto p-3">
            <StatsPanel />
          </div>
        </>
      )}
    </aside>
  )
}
