'use client'
import dynamic from 'next/dynamic'
import { useState, useEffect } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Navbar } from '@/components/layout/Navbar'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { TimerDisplay } from '@/components/timer/TimerDisplay'
import { TimerControls } from '@/components/timer/TimerControls'
import { InspectionTimer } from '@/components/timer/InspectionTimer'
import { ScrambleDisplay } from '@/components/scramble/ScrambleDisplay'
import { ScrambleGenerator } from '@/components/scramble/ScrambleGenerator'
import { useCubiqStore } from '@/store'
import { formatTime, getEffectiveTime } from '@/lib/stats'

const CubePreview3D = dynamic(
  () => import('@/components/scramble/CubePreview3D').then(m => m.CubePreview3D),
  { ssr: false, loading: () => <div style={{ width: 220, height: 220 }} /> }
)

function SolvePenaltyBar() {
  const { getActiveSession, updateSolve, deleteSolve } = useCubiqStore()
  const session = getActiveSession()
  const solves = session?.solves ?? []
  const lastSolve = solves[solves.length - 1]
  if (!lastSolve) return null

  const effective = getEffectiveTime(lastSolve)

  return (
    <div className="flex items-center gap-3 justify-center mt-2">
      <span className="text-sm font-mono tabular-nums" style={{ color: 'var(--text-secondary)' }}>
        {formatTime(effective)}
        {lastSolve.penalty && (
          <span className="ml-1 text-xs" style={{ color: lastSolve.penalty === 'DNF' ? 'var(--accent-danger)' : 'var(--accent-warning)' }}>
            ({lastSolve.penalty})
          </span>
        )}
      </span>
      <button
        onClick={() => updateSolve(session!.id, lastSolve.id, { penalty: lastSolve.penalty === '+2' ? null : '+2' })}
        className="px-2 py-0.5 rounded text-xs font-mono border transition-colors"
        style={{
          borderColor: lastSolve.penalty === '+2' ? 'var(--accent-warning)' : 'var(--border)',
          color: lastSolve.penalty === '+2' ? 'var(--accent-warning)' : 'var(--text-muted)',
        }}
      >
        +2
      </button>
      <button
        onClick={() => updateSolve(session!.id, lastSolve.id, { penalty: lastSolve.penalty === 'DNF' ? null : 'DNF' })}
        className="px-2 py-0.5 rounded text-xs font-mono border transition-colors"
        style={{
          borderColor: lastSolve.penalty === 'DNF' ? 'var(--accent-danger)' : 'var(--border)',
          color: lastSolve.penalty === 'DNF' ? 'var(--accent-danger)' : 'var(--text-muted)',
        }}
      >
        DNF
      </button>
      <button
        onClick={() => deleteSolve(session!.id, lastSolve.id)}
        className="px-2 py-0.5 rounded text-xs font-mono border transition-colors"
        style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
      >
        Del
      </button>
    </div>
  )
}

export default function TimerPage() {
  const { currentScramble, settings, updateSettings, timerState } = useCubiqStore()
  const [isHydrated, setIsHydrated] = useState(false)
  useEffect(() => setIsHydrated(true), [])

  const hideScramble = timerState === 'running'

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main className="flex-1 flex flex-col overflow-y-auto pb-16 md:pb-0 relative">
          {/* Scramble area */}
          <div
            className="flex items-center justify-center gap-2 pt-6 px-4 transition-opacity duration-200"
            style={{ opacity: hideScramble ? 0 : 1, pointerEvents: hideScramble ? 'none' : 'auto' }}
          >
            <ScrambleGenerator />
            <ScrambleDisplay scramble={currentScramble} />
          </div>

          {/* Timer area */}
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4 select-none">
            <TimerControls />
            <InspectionTimer />
            <TimerDisplay />
            {isHydrated && timerState === 'stopped' && <SolvePenaltyBar />}
            {isHydrated && (timerState === 'idle' || timerState === 'stopped') && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Hold spacebar to start
              </p>
            )}
          </div>

          {/* 3D Cube preview */}
          {isHydrated && (
            <div
              className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-30 transition-opacity duration-300"
              style={{ opacity: hideScramble ? 0 : 1, pointerEvents: hideScramble ? 'none' : 'auto' }}
            >
              {settings.cube_preview_visible ? (
                <div className="glass rounded-2xl p-2 relative group">
                  <CubePreview3D scramble={currentScramble} interactive />
                  <button
                    onClick={() => updateSettings({ cube_preview_visible: false })}
                    className="absolute top-1 right-1 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                  >
                    <EyeOff size={12} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => updateSettings({ cube_preview_visible: true })}
                  className="p-2 rounded-xl glass transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  title="Show cube"
                >
                  <Eye size={16} />
                </button>
              )}
            </div>
          )}
        </main>
      </div>

      <MobileNav />
    </div>
  )
}
