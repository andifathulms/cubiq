# CLAUDE.md — Cubiq Frontend

This file tells Claude Code everything it needs to build and maintain Cubiq autonomously. Read this entire file before touching any code.

---

## What is Cubiq?

A modern Rubik's Cube training platform. Phase 1 = speedcubing timer + stats + 3D cube. Future phases add ML/MDP solver via a separate `cubiq-ml` FastAPI repo. See `PRD.md` for full feature specs.

---

## Project Bootstrap

```bash
npx create-next-app@latest cubiq \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd cubiq

# Core dependencies
npm install cubing zustand framer-motion recharts lucide-react

# Dev
npm install -D @types/node
```

---

## Directory Structure

```
cubiq/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout, fonts, theme provider
│   │   ├── page.tsx            # Timer page (default "/")
│   │   ├── stats/
│   │   │   └── page.tsx        # Charts & analytics
│   │   ├── history/
│   │   │   └── page.tsx        # Full solve history table
│   │   └── solvers/
│   │       └── page.tsx        # Cross solver + ML placeholder
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Navbar.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── MobileNav.tsx
│   │   ├── timer/
│   │   │   ├── TimerDisplay.tsx
│   │   │   ├── TimerControls.tsx   # spacebar/tap logic
│   │   │   └── InspectionTimer.tsx
│   │   ├── scramble/
│   │   │   ├── ScrambleDisplay.tsx
│   │   │   ├── ScrambleGenerator.tsx
│   │   │   └── CubePreview3D.tsx   # cubing.js TwistyPlayer
│   │   ├── stats/
│   │   │   ├── StatsPanel.tsx      # sidebar stats
│   │   │   ├── TimeChart.tsx       # recharts line chart
│   │   │   ├── DistributionChart.tsx
│   │   │   ├── DailyHeatmap.tsx
│   │   │   └── SessionComparison.tsx
│   │   ├── history/
│   │   │   ├── SolveTable.tsx
│   │   │   └── SolveRow.tsx
│   │   ├── solvers/
│   │   │   ├── CrossSolver.tsx
│   │   │   └── MLSolverCard.tsx
│   │   ├── session/
│   │   │   ├── SessionSelector.tsx
│   │   │   └── SessionManager.tsx
│   │   └── ui/
│   │       ├── GlassCard.tsx       # reusable glass card
│   │       ├── Badge.tsx
│   │       └── Modal.tsx
│   ├── store/
│   │   ├── index.ts            # Zustand store root
│   │   ├── timerSlice.ts
│   │   ├── sessionSlice.ts
│   │   └── settingsSlice.ts
│   ├── lib/
│   │   ├── cubing.ts           # cubing.js wrapper functions
│   │   ├── solver.ts           # Cross solver IDA* implementation
│   │   ├── stats.ts            # ao5/ao12/mean calculations
│   │   ├── export.ts           # JSON export/import logic
│   │   └── storage.ts          # localStorage helpers
│   ├── types/
│   │   └── index.ts            # All TypeScript interfaces
│   └── styles/
│       └── globals.css         # CSS variables + base styles
├── public/
│   └── sounds/
│       ├── inspection-8.mp3    # Optional sound alerts
│       └── inspection-12.mp3
├── PRD.md
├── CLAUDE.md                   # This file
└── package.json
```

---

## TypeScript Types

Define all types in `src/types/index.ts`. Use these everywhere:

```typescript
export type Penalty = null | '+2' | 'DNF'

export type PuzzleType = '222' | '333' | '444' | '555' | 'pyram' | 'skewb' | 'minx' | 'sq1' | 'clock'

export interface Solve {
  id: string                  // uuid v4
  time_ms: number             // raw time in milliseconds
  penalty: Penalty
  scramble: string            // move sequence string
  scramble_state?: string     // cube state string (for ML, optional)
  comment: string
  created_at: string          // ISO 8601
}

export interface Session {
  id: string
  name: string
  puzzle: PuzzleType
  created_at: string
  solves: Solve[]
}

export interface Settings {
  inspection_enabled: boolean
  inspection_duration: 8 | 12 | 15
  timer_precision: 'centiseconds' | 'milliseconds'
  voice_alerts: boolean
  cube_preview_visible: boolean
  ml_service_url: string      // default: 'http://localhost:8000'
}

export type TimerState = 'idle' | 'ready' | 'inspection' | 'running' | 'stopped'

export interface CrossSolution {
  face: 'D' | 'U' | 'F' | 'B' | 'L' | 'R'
  rotation: string            // e.g. 'z2', "x'", ''
  moves: string[]             // move sequence
  move_count: number
}

// Computed stats — never stored, always derived
export interface SessionStats {
  best: number | null
  worst: number | null
  mean: number | null
  ao5: number | null
  ao12: number | null
  ao50: number | null
  ao100: number | null
  count: number
}
```

---

## Design System Implementation

### globals.css

```css
@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600&display=swap');

:root {
  --bg-base: #0a0a0f;
  --bg-surface: #12121a;
  --bg-elevated: #1a1a26;
  --bg-glass: rgba(255, 255, 255, 0.04);
  --border: rgba(255, 255, 255, 0.08);
  --border-hover: rgba(255, 255, 255, 0.16);

  --accent-primary: #6ee7f7;       /* cyan */
  --accent-secondary: #a78bfa;     /* violet */
  --accent-success: #34d399;       /* green - PB */
  --accent-danger: #f87171;        /* red - DNF */
  --accent-warning: #fbbf24;       /* amber - +2 */

  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted: #475569;

  /* WCA face colors */
  --face-U: #FFFFFF;
  --face-D: #FFD500;
  --face-F: #009B48;
  --face-B: #0046AD;
  --face-R: #B90000;
  --face-L: #FF5800;
}

* { box-sizing: border-box; }
body {
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  margin: 0;
}
```

### tailwind.config.ts

Extend Tailwind with custom colors that map to CSS variables:

```typescript
theme: {
  extend: {
    colors: {
      base: 'var(--bg-base)',
      surface: 'var(--bg-surface)',
      elevated: 'var(--bg-elevated)',
      accent: 'var(--accent-primary)',
      violet: 'var(--accent-secondary)',
      success: 'var(--accent-success)',
      danger: 'var(--accent-danger)',
    },
    fontFamily: {
      mono: ['Space Mono', 'monospace'],
      display: ['Syne', 'sans-serif'],
      body: ['Inter', 'sans-serif'],
    },
  }
}
```

---

## Zustand Store

### src/store/index.ts

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'
import { computeStats } from '@/lib/stats'
import type { Session, Solve, Settings, TimerState, SessionStats } from '@/types'

interface CubiqStore {
  // State
  sessions: Session[]
  activeSessionId: string
  settings: Settings
  timerState: TimerState
  currentTime: number
  inspectionTime: number
  currentScramble: string

  // Derived (computed on access)
  getActiveSession: () => Session | undefined
  getStats: () => SessionStats

  // Timer actions
  setTimerState: (state: TimerState) => void
  setCurrentTime: (ms: number) => void
  setCurrentScramble: (scramble: string) => void

  // Solve actions
  addSolve: (solve: Omit<Solve, 'id' | 'created_at'>) => void
  updateSolve: (sessionId: string, solveId: string, update: Partial<Solve>) => void
  deleteSolve: (sessionId: string, solveId: string) => void

  // Session actions
  createSession: (name: string, puzzle?: string) => void
  renameSession: (id: string, name: string) => void
  deleteSession: (id: string) => void
  setActiveSession: (id: string) => void

  // Settings
  updateSettings: (update: Partial<Settings>) => void

  // Export/Import
  exportData: () => void
  importData: (json: string, mode: 'merge' | 'replace') => void
}
```

Use `persist` middleware to sync to localStorage under key `cubiq:store`.

---

## cubing.js Integration

### src/lib/cubing.ts

```typescript
// cubing.js uses ES modules — import carefully in Next.js
import { randomScrambleForEvent } from 'cubing/scramble'
import { TwistyPlayer } from 'cubing/twisty'

export async function generateScramble(puzzle = '333'): Promise<string> {
  const alg = await randomScrambleForEvent(puzzle)
  return alg.toString()
}

// CubePreview3D component uses TwistyPlayer as a web component
// Register it once at app level
export function registerTwistyPlayer() {
  if (typeof window !== 'undefined') {
    import('cubing/twisty').then(({ TwistyPlayer }) => {
      if (!customElements.get('twisty-player')) {
        customElements.define('twisty-player', TwistyPlayer)
      }
    })
  }
}
```

### CubePreview3D.tsx

```typescript
'use client'
import { useEffect, useRef } from 'react'

interface Props {
  scramble: string
  interactive?: boolean
}

export function CubePreview3D({ scramble, interactive = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // TwistyPlayer is a web component — create via DOM
    const existing = containerRef.current.querySelector('twisty-player')
    if (existing) existing.remove()

    const player = document.createElement('twisty-player') as any
    player.setAttribute('alg', scramble)
    player.setAttribute('puzzle', '3x3x3')
    player.setAttribute('visualization', '3D')
    player.setAttribute('control-panel', interactive ? 'bottom-row' : 'none')
    player.setAttribute('background', 'none')
    player.setAttribute('tempo-scale', '5')
    player.style.width = '100%'
    player.style.height = '100%'

    containerRef.current.appendChild(player)
  }, [scramble, interactive])

  return (
    <div
      ref={containerRef}
      style={{ width: '220px', height: '220px' }}
      className="rounded-xl overflow-hidden"
    />
  )
}
```

**Important:** cubing.js TwistyPlayer must be used as a web component via `document.createElement`. Do not try to import it as a React component directly.

**Next.js config:** Add to `next.config.ts`:
```typescript
const nextConfig = {
  transpilePackages: ['cubing'],
}
```

---

## Timer Implementation

### src/components/timer/TimerControls.tsx

The timer is the most critical component. Implement precisely:

```typescript
'use client'
import { useEffect, useRef, useCallback } from 'react'
import { useCubiqStore } from '@/store'

const HOLD_DURATION = 300  // ms before timer arms
const DISPLAY_UPDATE_INTERVAL = 10  // ms

export function TimerControls() {
  const { timerState, setTimerState, setCurrentTime, settings, addSolve, currentScramble } = useCubiqStore()

  const holdTimerRef = useRef<NodeJS.Timeout>()
  const startTimeRef = useRef<number>(0)
  const intervalRef = useRef<NodeJS.Timeout>()
  const inspectionIntervalRef = useRef<NodeJS.Timeout>()
  const inspectionTimeRef = useRef<number>(settings.inspection_duration)

  const startDisplayTimer = () => {
    startTimeRef.current = performance.now()
    intervalRef.current = setInterval(() => {
      setCurrentTime(performance.now() - startTimeRef.current)
    }, DISPLAY_UPDATE_INTERVAL)
  }

  const stopDisplayTimer = (): number => {
    clearInterval(intervalRef.current)
    return performance.now() - startTimeRef.current
  }

  const handlePressStart = useCallback(() => {
    if (timerState === 'running') {
      // Stop the timer
      const elapsed = stopDisplayTimer()
      setTimerState('stopped')
      addSolve({
        time_ms: Math.round(elapsed),
        penalty: null,
        scramble: currentScramble,
        comment: '',
      })
      return
    }

    if (timerState === 'idle' || timerState === 'stopped') {
      setTimerState('ready')
      holdTimerRef.current = setTimeout(() => {
        if (settings.inspection_enabled) {
          setTimerState('inspection')
          // inspection countdown handled separately
        } else {
          setTimerState('running')
          startDisplayTimer()
        }
      }, HOLD_DURATION)
    }
  }, [timerState, settings])

  const handlePressEnd = useCallback(() => {
    if (timerState === 'ready') {
      clearTimeout(holdTimerRef.current)
      setTimerState('idle')
    }
  }, [timerState])

  // Keyboard events
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        handlePressStart()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        handlePressEnd()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [handlePressStart, handlePressEnd])

  // Touch events for mobile
  // Attach onPointerDown/onPointerUp to the main timer area div
  return null  // This component manages events only — TimerDisplay renders the UI
}
```

---

## Stats Calculations

### src/lib/stats.ts

```typescript
import type { Solve, SessionStats } from '@/types'

export function getEffectiveTime(solve: Solve): number | null {
  if (solve.penalty === 'DNF') return null
  if (solve.penalty === '+2') return solve.time_ms + 2000
  return solve.time_ms
}

export function formatTime(ms: number | null): string {
  if (ms === null) return 'DNF'
  const total = ms / 1000
  if (total >= 60) {
    const mins = Math.floor(total / 60)
    const secs = (total % 60).toFixed(2).padStart(5, '0')
    return `${mins}:${secs}`
  }
  return total.toFixed(2)
}

export function calcAo(solves: Solve[], n: number): number | null {
  if (solves.length < n) return null
  const last = solves.slice(-n)
  const times = last.map(getEffectiveTime)
  const dnfCount = times.filter(t => t === null).length

  if (n <= 5 && dnfCount >= 1) return null   // ao5: any DNF = DNF
  if (n > 5 && dnfCount >= 2) return null     // ao12+: 2+ DNFs = DNF

  const sorted = [...times].sort((a, b) => {
    if (a === null) return 1
    if (b === null) return -1
    return a - b
  })

  // Remove best and worst
  const trimmed = sorted.slice(1, -1)
  const valid = trimmed.filter((t): t is number => t !== null)
  if (valid.length === 0) return null
  return valid.reduce((a, b) => a + b, 0) / valid.length
}

export function computeStats(solves: Solve[]): SessionStats {
  const times = solves.map(getEffectiveTime).filter((t): t is number => t !== null)
  return {
    count: solves.length,
    best: times.length ? Math.min(...times) : null,
    worst: times.length ? Math.max(...times) : null,
    mean: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null,
    ao5: calcAo(solves, 5),
    ao12: calcAo(solves, 12),
    ao50: calcAo(solves, 50),
    ao100: calcAo(solves, 100),
  }
}
```

---

## Cross Solver

### src/lib/solver.ts

The cross solver finds the shortest sequence to place 4 cross edges on a given face.

**Recommended approach:** Use `cubing.js` experimental solver API:

```typescript
import { experimental_solve3x3x3IgnoringCenters } from 'cubing/search'
// cubing.js has built-in cross-solving capability via its search module
// Check cubing.js docs for the exact API as it may be experimental
```

**If cubing.js solver API is insufficient**, implement IDA\* manually:

```typescript
// Cube state representation for cross only
// Track only the 4 edge pieces belonging to a given face
// State = positions + orientations of those 4 edges
// Goal = all 4 edges placed correctly (position + orientation)
// Moves = all 18 standard moves
// Pruning table = precomputed min moves to solve from each state

export async function solveCross(scramble: string, face: Face): Promise<CrossSolution> {
  // 1. Apply scramble to get cube state
  // 2. Extract cross edges for target face
  // 3. Run IDA* with pruning table
  // 4. Return move sequence + rotation prefix
}
```

**Fallback:** If implementing from scratch is too complex, the cross solver feature can display "Coming soon" in Phase 1 and be completed in Phase 3.

---

## Export / Import

### src/lib/export.ts

```typescript
import type { CubiqStore } from '@/store'

export function exportToJSON(store: Pick<CubiqStore, 'sessions'>) {
  const data = {
    version: '1.0',
    exported_at: new Date().toISOString(),
    sessions: store.sessions,
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cubiq-export-${new Date().toISOString().split('T')[0]}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function importFromJSON(json: string, mode: 'merge' | 'replace'): Session[] {
  const data = JSON.parse(json)
  if (data.version !== '1.0') throw new Error('Unsupported export version')
  if (!Array.isArray(data.sessions)) throw new Error('Invalid format')
  // Validate each session and solve
  return data.sessions
}
```

---

## Key Implementation Rules

### DO
- Use `'use client'` directive on all components that use hooks, browser APIs, or event listeners
- Use `performance.now()` for timer accuracy — never `Date.now()`
- Generate UUIDs with `crypto.randomUUID()` (built into modern browsers, no library needed)
- Compute stats fresh from solve array — never store computed stats
- Handle `null` times (DNF) explicitly in all stat functions
- Use `dynamic(() => import(...), { ssr: false })` for cubing.js and any WebGL components
- Always format times through `formatTime()` — never format inline

### DON'T
- Don't use `setTimeout` for timer accuracy — use `performance.now()` diff in an interval
- Don't store `ao5`/`ao12` in the Solve object — compute them from the array
- Don't import cubing.js at the top level in Next.js — use dynamic imports
- Don't use `localStorage` directly — always go through the Zustand `persist` middleware
- Don't hardcode colors — always use CSS variables from `globals.css`
- Don't put business logic in components — keep it in `src/lib/`

---

## Build Phases — What to Build First

### Phase 1 (build in this order)
1. `globals.css` — CSS variables, fonts
2. `src/types/index.ts` — all TypeScript interfaces
3. `src/lib/stats.ts` — pure functions, no dependencies
4. `src/lib/storage.ts` — localStorage helpers
5. `src/lib/export.ts` — export/import
6. `src/store/index.ts` — Zustand store with persist
7. `src/lib/cubing.ts` — cubing.js wrapper
8. `src/components/ui/GlassCard.tsx` — base UI components
9. `src/components/layout/Navbar.tsx` + `Sidebar.tsx`
10. `src/components/scramble/ScrambleDisplay.tsx`
11. `src/components/scramble/CubePreview3D.tsx`
12. `src/components/timer/TimerDisplay.tsx`
13. `src/components/timer/TimerControls.tsx`
14. `src/components/stats/StatsPanel.tsx`
15. `src/components/session/SessionSelector.tsx`
16. `src/app/page.tsx` — wire everything together
17. `src/app/history/page.tsx`

### Phase 2
18. All chart components in `src/components/stats/`
19. `src/app/stats/page.tsx`

### Phase 3
20. `src/lib/solver.ts`
21. `src/components/solvers/CrossSolver.tsx`
22. `src/components/solvers/MLSolverCard.tsx`
23. `src/app/solvers/page.tsx`

---

## Environment Variables

```env
# .env.local
NEXT_PUBLIC_ML_SERVICE_URL=http://localhost:8000
```

Access in code: `process.env.NEXT_PUBLIC_ML_SERVICE_URL`

---

## Common Issues & Solutions

### cubing.js SSR Error
**Problem:** `ReferenceError: self is not defined` during Next.js build  
**Solution:** Always dynamic import cubing.js with `{ ssr: false }`

```typescript
const CubePreview3D = dynamic(
  () => import('@/components/scramble/CubePreview3D').then(m => m.CubePreview3D),
  { ssr: false, loading: () => <div className="cube-placeholder" /> }
)
```

### Spacebar Scrolling the Page
**Problem:** Space triggers page scroll while timer is active  
**Solution:** `e.preventDefault()` in the keydown handler — already included in TimerControls

### Timer Drift
**Problem:** `setInterval` drifts over time  
**Solution:** Always compute elapsed time as `performance.now() - startTime`, use interval only to trigger re-renders

### Hydration Mismatch
**Problem:** Zustand persist causes SSR/client mismatch  
**Solution:** Use Zustand's `skipHydration` option or wrap in `useEffect` for initial client render

```typescript
const [isHydrated, setIsHydrated] = useState(false)
useEffect(() => setIsHydrated(true), [])
if (!isHydrated) return null
```

---

## ML Service Contract (for future reference)

When `cubiq-ml` is built, it must expose:

```
GET  /health          → { status: 'ok', model: string, version: string }
POST /solve           → Body: { state: string, method: 'mdp' | 'kociemba' }
                      → Response: { moves: string[], move_count: number, time_ms: number }
POST /solve/cross     → Body: { state: string, face: 'D'|'U'|'F'|'B'|'L'|'R' }
                      → Response: { moves: string[], move_count: number }
```

Cube state string format: use cubing.js `KPattern` string representation.

The frontend checks `NEXT_PUBLIC_ML_SERVICE_URL/health` on the Solvers page and shows connection status. All ML calls are non-blocking with graceful fallback.

---

## Running the Project

```bash
# Development
npm run dev

# Build
npm run build

# Production
npm start
```

The app runs on `http://localhost:3000` by default.
