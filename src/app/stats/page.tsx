'use client'
import { Navbar } from '@/components/layout/Navbar'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'

export default function StatsPage() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col items-center justify-center pb-16 md:pb-0">
          <p className="text-2xl font-bold font-display" style={{ color: 'var(--text-muted)' }}>
            Charts coming in Phase 2
          </p>
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
