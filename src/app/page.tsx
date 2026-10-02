'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Shuffle, Box, Keyboard, Eye } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { SessionChip } from '@/components/session/SessionChip'
import { ScrambleChips } from '@/components/practice/ScrambleChips'
import { TimerFace } from '@/components/practice/TimerFace'
import { StatsStrip } from '@/components/practice/StatsStrip'
import { ScramblePreview } from '@/components/practice/ScramblePreview'
import { Confetti } from '@/components/practice/Confetti'
import { ShortcutsDialog } from '@/components/practice/ShortcutsDialog'
import { useTimerEngine } from '@/components/practice/useTimerEngine'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Toggle'
import { useCubiqStore } from '@/store'
import { moveCount, PUZZLE_LABEL, recordsOfLast } from '@/lib/practice'
import type { Solve } from '@/types'

const SOLVER_PUZZLES = new Set(['222', '333', '444', '555', '666', '777', 'pyram', 'skewb', 'minx', 'sq1'])
const NO_RECORDS = { single: false, ao5: false, ao12: false }

export default function PracticePage() {
  const router = useRouter()
  const [hydrated, setHydrated] = useState(false)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHydrated(true), [])

  const { currentScramble, timerState, settings, updateSettings, nextScramble, updateSolve, deleteSolve, restoreSolve } = useCubiqStore()
  const session = useCubiqStore(s => s.sessions.find(x => x.id === s.activeSessionId))
  const solves = useMemo(() => session?.solves ?? [], [session])
  const puzzle = session?.puzzle ?? '333'

  const stageRef = useRef<HTMLDivElement>(null)
  useTimerEngine(stageRef)

  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [undo, setUndo] = useState<{ solve: Solve; index: number; sessionId: string } | null>(null)
  const [confetti, setConfetti] = useState(0)

  useEffect(() => { if (hydrated && !currentScramble) nextScramble() }, [hydrated, currentScramble, nextScramble])

  const records = useMemo(() => (timerState === 'stopped' ? recordsOfLast(solves) : NO_RECORDS), [solves, timerState])

  // Celebrate once, when a solve that set a record lands
  const lastCount = useRef<number | null>(null)
  useEffect(() => {
    if (!hydrated) return
    if (lastCount.current !== null && solves.length === lastCount.current + 1) {
      const r = recordsOfLast(solves)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (r.single || r.ao5 || r.ao12) setConfetti(c => c + 1)
    }
    lastCount.current = solves.length
  }, [solves, hydrated])

  const deleteLast = useCallback(() => {
    if (!session || !solves.length) return
    const index = solves.length - 1
    setUndo({ solve: solves[index], index, sessionId: session.id })
    deleteSolve(session.id, solves[index].id)
    useCubiqStore.getState().setTimerState('idle')
    useCubiqStore.getState().setCurrentTime(0)
  }, [session, solves, deleteSolve])

  useEffect(() => {
    if (!undo) return
    const t = setTimeout(() => setUndo(null), 6000)
    return () => clearTimeout(t)
  }, [undo])

  const labHref = `/lab?puzzle=${puzzle}&scramble=${encodeURIComponent(currentScramble)}`

  // Page shortcuts (only between solves)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || document.querySelector('[role="dialog"]')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const st = useCubiqStore.getState()
      if (st.timerState !== 'idle' && st.timerState !== 'stopped') return
      const last = solves[solves.length - 1]
      if (e.key === 'n' || e.key === 'N') nextScramble()
      else if (e.key === '?') setShortcutsOpen(true)
      else if ((e.key === 's' || e.key === 'S') && SOLVER_PUZZLES.has(puzzle)) router.push(labHref)
      else if (last && session && e.key === '2') updateSolve(session.id, last.id, { penalty: last.penalty === '+2' ? null : '+2' })
      else if (last && session && (e.key === 'd' || e.key === 'D')) updateSolve(session.id, last.id, { penalty: last.penalty === 'DNF' ? null : 'DNF' })
      else if (last && (e.key === 'Backspace' || e.key === 'Delete')) { e.preventDefault(); deleteLast() }
      else return
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [solves, session, puzzle, labHref, nextScramble, updateSolve, deleteLast, router])

  const running = timerState === 'running'
  const focus = running || timerState === 'inspection'
  const fade = (on: boolean) => ({ opacity: on ? 0.08 : 1, transition: 'opacity 0.25s ease', pointerEvents: on ? 'none' as const : undefined })
  const dock = settings.cube_dock

  return (
    <AppShell>
      <div className="flex flex-col min-h-full px-4 md:px-8 pt-4 md:pt-6 pb-4 md:pb-6 gap-5">
        <header className="flex items-center justify-between gap-3" style={fade(focus)}>
          <SessionChip />
          <div className="flex items-center gap-1.5">
            <button className="btn btn-ghost btn-sm" onClick={nextScramble} title="New scramble (N)">
              <Shuffle size={14} /> <span className="hidden sm:inline">New scramble</span> <kbd className="hidden lg:inline">N</kbd>
            </button>
            {SOLVER_PUZZLES.has(puzzle) && (
              <Link href={labHref} className="btn btn-ghost btn-sm" title="Open this scramble in Solve Lab (S)">
                <Box size={14} /> <span className="hidden sm:inline">Solve it</span>
              </Link>
            )}
            <button className="btn btn-ghost btn-sm lg:hidden" onClick={() => setPreviewOpen(true)} aria-label="Show scrambled cube">
              <Eye size={14} />
            </button>
            <button className="btn btn-ghost btn-sm hidden md:inline-flex" onClick={() => setShortcutsOpen(true)} aria-label="Keyboard shortcuts">
              <Keyboard size={14} />
            </button>
          </div>
        </header>

        <section className="flex flex-col items-center gap-2.5 pt-1" style={fade(running)}>
          {hydrated && <ScrambleChips scramble={currentScramble} puzzle={puzzle} size={settings.scramble_size} />}
          {hydrated && currentScramble && (
            <span className="num text-[11px] text-faint">
              {PUZZLE_LABEL[puzzle]} · {moveCount(currentScramble, puzzle)} {puzzle === 'sq1' ? 'slashes' : 'moves'}
            </span>
          )}
        </section>

        <div
          ref={stageRef}
          className="relative flex-1 min-h-[300px] grid place-items-center touch-none select-none rounded-3xl cursor-pointer"
          aria-label="Timer. Hold Space or touch and hold, release to start."
        >
          <Confetti fire={confetti} />
          {hydrated && <TimerFace records={records} onDelete={deleteLast} />}

          {hydrated && dock !== 'hidden' && (
            <div className="hidden lg:flex absolute right-0 bottom-0 flex-col items-end gap-2" style={fade(focus)} data-no-timer>
              <Segmented
                label="Cube preview" value={dock}
                options={[{ value: 'net', label: 'Net' }, { value: '3d', label: '3D' }, { value: 'hidden', label: 'Hide' }]}
                onChange={v => updateSettings({ cube_dock: v })}
              />
              <div className="card p-3 grid place-items-center">
                <ScramblePreview scramble={currentScramble} puzzle={puzzle} mode={dock} size={dock === 'net' ? 200 : 170} />
              </div>
            </div>
          )}
          {hydrated && dock === 'hidden' && (
            <button
              className="hidden lg:inline-flex absolute right-0 bottom-0 btn btn-ghost btn-sm" data-no-timer style={fade(focus)}
              onClick={() => updateSettings({ cube_dock: 'net' })}
            >
              <Eye size={14} /> Show cube
            </button>
          )}
        </div>

        <div style={fade(focus)}>{hydrated && <StatsStrip solves={solves} />}</div>
      </div>

      {undo && (
        <div role="status" className="fixed z-50 left-1/2 -translate-x-1/2 bottom-[calc(80px+env(safe-area-inset-bottom))] md:bottom-6 flex items-center gap-3 pl-4 pr-2 py-2 rounded-xl bg-ink text-bg shadow-lg text-sm animate-fade-in">
          Solve deleted
          <button
            className="btn btn-sm bg-bg/15 text-bg hover:bg-bg/25"
            onClick={() => { restoreSolve(undo.sessionId, undo.solve, undo.index); setUndo(null) }}
          >
            Undo
          </button>
        </div>
      )}

      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Scrambled cube">
        <div className="flex flex-col items-center gap-4">
          <Segmented
            label="Preview" value={dock === 'hidden' ? 'net' : dock}
            options={[{ value: 'net', label: 'Net' }, { value: '3d', label: '3D' }]}
            onChange={v => updateSettings({ cube_dock: v })}
          />
          <ScramblePreview scramble={currentScramble} puzzle={puzzle} mode={dock === '3d' ? '3d' : 'net'} size={260} />
          <ScrambleChips scramble={currentScramble} puzzle={puzzle} size="sm" />
        </div>
      </Modal>
    </AppShell>
  )
}
