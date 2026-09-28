import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { computeStats } from '@/lib/stats'
import { exportToJSON, importFromJSON } from '@/lib/export'
import { generateScramble } from '@/lib/cubing'
import { pushScrambleHistory } from '@/lib/storage'
import type { Session, Solve, Settings, TimerState, SessionStats } from '@/types'
import { schedule, type CardState, type Grade } from '@/lib/learn'
import { applyResult, type LessonProgress } from '@/lib/lessons/progress'

const DEFAULT_SETTINGS: Settings = {
  inspection_enabled: false,
  inspection_duration: 15,
  timer_precision: 'centiseconds',
  voice_alerts: false,
  cube_preview_visible: true,
  ml_service_url: process.env.NEXT_PUBLIC_ML_SERVICE_URL ?? 'http://127.0.0.1:8001',
  theme: 'system',
  scramble_size: 'md',
  cube_dock: 'net',
}

function makeDefaultSession(): Session {
  return {
    id: crypto.randomUUID(),
    name: 'Session 1',
    puzzle: '333',
    created_at: new Date().toISOString(),
    solves: [],
  }
}

interface CubiqStore {
  sessions: Session[]
  activeSessionId: string
  settings: Settings
  timerState: TimerState
  currentTime: number
  inspectionTime: number
  currentScramble: string
  /** Learn: spaced-repetition state per case key ('pll:T', 'oll:27') */
  training: Record<string, CardState>
  /** Learn: cross-planning self-grades */
  crossStats: { optimal: number; close: number; missed: number }
  /** Learn › Lessons: drill results and level per lesson id */
  lessons: Record<string, LessonProgress>

  getActiveSession: () => Session | undefined
  getStats: () => SessionStats

  setTimerState: (state: TimerState) => void
  setCurrentTime: (ms: number) => void
  setInspectionTime: (s: number) => void
  setCurrentScramble: (scramble: string) => void
  /** Fresh scramble for the active session's puzzle. */
  nextScramble: () => void

  addSolve: (solve: Omit<Solve, 'id' | 'created_at'>) => void
  updateSolve: (sessionId: string, solveId: string, update: Partial<Solve>) => void
  deleteSolve: (sessionId: string, solveId: string) => void
  /** Put a deleted solve back at its old position (undo). */
  restoreSolve: (sessionId: string, solve: Solve, index: number) => void

  createSession: (name: string, puzzle?: string) => void
  renameSession: (id: string, name: string) => void
  deleteSession: (id: string) => void
  setActiveSession: (id: string) => void

  updateSettings: (update: Partial<Settings>) => void

  gradeCase: (key: string, grade: Grade, timing: { recogMs?: number; execMs?: number }) => void
  resetTraining: (keyPrefix: string) => void
  recordCross: (result: 'optimal' | 'close' | 'missed') => void
  /** A drill try; `levels` = how many levels the lesson has */
  recordLesson: (id: string, hit: boolean, levels?: number) => void
  /** Pass a watch-only lesson */
  completeLesson: (id: string) => void
  resetLesson: (id: string) => void

  exportData: () => void
  importData: (json: string, mode: 'merge' | 'replace') => void
}

const initialSession = makeDefaultSession()

export const useCubiqStore = create<CubiqStore>()(
  persist(
    (set, get) => ({
      sessions: [initialSession],
      activeSessionId: initialSession.id,
      settings: DEFAULT_SETTINGS,
      timerState: 'idle',
      currentTime: 0,
      inspectionTime: 15,
      currentScramble: '',
      training: {},
      crossStats: { optimal: 0, close: 0, missed: 0 },
      lessons: {},

      getActiveSession: () => {
        const { sessions, activeSessionId } = get()
        return sessions.find(s => s.id === activeSessionId)
      },

      getStats: () => {
        const session = get().getActiveSession()
        return computeStats(session?.solves ?? [])
      },

      setTimerState: state => set({ timerState: state }),
      setCurrentTime: ms => set({ currentTime: ms }),
      setInspectionTime: s => set({ inspectionTime: s }),
      setCurrentScramble: scramble => set({ currentScramble: scramble }),
      nextScramble: () => {
        const puzzle = get().getActiveSession()?.puzzle ?? '333'
        const scramble = generateScramble(puzzle)
        pushScrambleHistory(scramble)
        set({ currentScramble: scramble })
      },

      addSolve: solve => {
        const { sessions, activeSessionId } = get()
        const newSolve: Solve = {
          ...solve,
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
        }
        set({
          sessions: sessions.map(s =>
            s.id === activeSessionId
              ? { ...s, solves: [...s.solves, newSolve] }
              : s
          ),
        })
      },

      updateSolve: (sessionId, solveId, update) => {
        set(state => ({
          sessions: state.sessions.map(s =>
            s.id === sessionId
              ? {
                  ...s,
                  solves: s.solves.map(sv =>
                    sv.id === solveId ? { ...sv, ...update } : sv
                  ),
                }
              : s
          ),
        }))
      },

      deleteSolve: (sessionId, solveId) => {
        set(state => ({
          sessions: state.sessions.map(s =>
            s.id === sessionId
              ? { ...s, solves: s.solves.filter(sv => sv.id !== solveId) }
              : s
          ),
        }))
      },

      restoreSolve: (sessionId, solve, index) => {
        set(state => ({
          sessions: state.sessions.map(s => {
            if (s.id !== sessionId || s.solves.some(x => x.id === solve.id)) return s
            const solves = [...s.solves]
            solves.splice(Math.min(index, solves.length), 0, solve)
            return { ...s, solves }
          }),
        }))
      },

      createSession: (name, puzzle = '333') => {
        const newSession: Session = {
          id: crypto.randomUUID(),
          name,
          puzzle: puzzle as Session['puzzle'],
          created_at: new Date().toISOString(),
          solves: [],
        }
        set(state => ({
          sessions: [...state.sessions, newSession],
          activeSessionId: newSession.id,
          timerState: 'idle',
          currentTime: 0,
        }))
        get().nextScramble()
      },

      renameSession: (id, name) => {
        set(state => ({
          sessions: state.sessions.map(s => s.id === id ? { ...s, name } : s),
        }))
      },

      deleteSession: id => {
        set(state => {
          const remaining = state.sessions.filter(s => s.id !== id)
          if (remaining.length === 0) {
            const fresh = makeDefaultSession()
            return { sessions: [fresh], activeSessionId: fresh.id }
          }
          return {
            sessions: remaining,
            activeSessionId:
              state.activeSessionId === id ? remaining[0].id : state.activeSessionId,
          }
        })
      },

      setActiveSession: id => {
        set({ activeSessionId: id, timerState: 'idle', currentTime: 0 })
        get().nextScramble()
      },

      updateSettings: update =>
        set(state => ({ settings: { ...state.settings, ...update } })),

      gradeCase: (key, grade, timing) =>
        set(state => {
          const next = schedule(state.training[key], grade)
          const keep = (xs: number[] | undefined, v: number | undefined) => (v === undefined ? xs : [...(xs ?? []), v].slice(-10))
          next.recogMs = keep(next.recogMs, timing.recogMs)
          next.execMs = keep(next.execMs, timing.execMs)
          return { training: { ...state.training, [key]: next } }
        }),

      resetTraining: keyPrefix =>
        set(state => ({ training: Object.fromEntries(Object.entries(state.training).filter(([k]) => !k.startsWith(keyPrefix))) })),

      recordCross: result =>
        set(state => ({ crossStats: { ...state.crossStats, [result]: state.crossStats[result] + 1 } })),

      recordLesson: (id, hit, levels = 1) =>
        set(state => ({ lessons: { ...state.lessons, [id]: applyResult(state.lessons[id], hit, levels) } })),

      completeLesson: id =>
        set(state => ({ lessons: { ...state.lessons, [id]: { ...(state.lessons[id] ?? { results: [], level: 0 }), passed: true } } })),

      resetLesson: id =>
        set(state => ({ lessons: Object.fromEntries(Object.entries(state.lessons).filter(([k]) => k !== id)) })),

      exportData: () => {
        exportToJSON(get().sessions)
      },

      importData: (json, mode) => {
        const imported = importFromJSON(json)
        set(state => {
          if (mode === 'replace') {
            const first = imported[0] ?? makeDefaultSession()
            return { sessions: imported, activeSessionId: first.id }
          }
          return { sessions: [...state.sessions, ...imported] }
        })
      },
    }),
    {
      name: 'cubiq:store',
      partialize: state => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
        settings: state.settings,
        training: state.training,
        crossStats: state.crossStats,
        lessons: state.lessons,
      }),
      // Settings gain fields over time: fill in defaults for anything an
      // older saved state doesn't have (the default merge is shallow).
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<CubiqStore>
        return { ...current, ...p, settings: { ...current.settings, ...(p.settings ?? {}) } }
      },
    }
  )
)
