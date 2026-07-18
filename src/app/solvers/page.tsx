'use client'
import { Navbar } from '@/components/layout/Navbar'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { SolverWorkspace } from '@/components/solvers/SolverWorkspace'

export default function SolversPage() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <div className="max-w-6xl mx-auto px-4 py-8">
            <SolverWorkspace />
          </div>
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
