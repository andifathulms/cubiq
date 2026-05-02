import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { computeStats } from '@/lib/stats'
import { exportToJSON, importFromJSON } from '@/lib/export'
import type { Session, Solve, Settings, TimerState, SessionStats } from '@/types'

const DEFAULT_SETTINGS: Settings = {
  inspection_enabled: false,
  inspection_duration: 15,
  timer_precision: 'centiseconds',
  voice_alerts: false,
  cube_preview_visible: true,
  ml_service_url: process.env.NEXT_PUBLIC_ML_SERVICE_URL ?? 'http://localhost:8000',
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

  getActiveSession: () => Session | undefined
  getStats: () => SessionStats

  setTimerState: (state: TimerState) => void
  setCurrentTime: (ms: number) => void
  setInspectionTime: (s: number) => void
  setCurrentScramble: (scramble: string) => void

  addSolve: (solve: Omit<Solve, 'id' | 'created_at'>) => void
  updateSolve: (sessionId: string, solveId: string, update: Partial<Solve>) => void
  deleteSolve: (sessionId: string, solveId: string) => void

  createSession: (name: string, puzzle?: string) => void
  renameSession: (id: string, name: string) => void
  deleteSession: (id: string) => void
  setActiveSession: (id: string) => void

  updateSettings: (update: Partial<Settings>) => void

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
        }))
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

      setActiveSession: id => set({ activeSessionId: id }),

      updateSettings: update =>
        set(state => ({ settings: { ...state.settings, ...update } })),

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
      }),
    }
  )
)
