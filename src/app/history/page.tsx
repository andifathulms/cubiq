'use client'
import { Navbar } from '@/components/layout/Navbar'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { SolveTable } from '@/components/history/SolveTable'
import { useCubiqStore } from '@/store'

export default function HistoryPage() {
  const { getActiveSession } = useCubiqStore()
  const session = getActiveSession()

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-y-auto pb-16 md:pb-0">
          <div className="max-w-4xl mx-auto w-full px-4 py-8">
            <div className="animate-fade-in mb-6">
              <h1
                className="text-3xl font-bold font-display mb-1 tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                Solve History
              </h1>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {session?.name} — {session?.solves.length ?? 0} solves
              </p>
            </div>
            <SolveTable />
          </div>
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
