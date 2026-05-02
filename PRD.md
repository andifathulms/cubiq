# Cubiq — Product Requirements Document

## Overview

**Cubiq** is a modern, intelligence-first Rubik's Cube training platform. It starts as a beautiful speedcubing timer and analytics app, and is architecturally designed to evolve into an ML-powered cube solver using Markov Decision Process (MDP/RL). The name reflects "cubic" + "IQ" — a cube app that gets smarter over time.

**Tagline:** *Train faster. Solve smarter.*

---

## Goals

- Replace csTimer with a visually superior, modern alternative
- Provide all core speedcubing features (timer, scramble, stats, solver)
- Export/import solve data from day one (for future ML training use)
- Architect cleanly so a separate FastAPI ML service (`cubiq-ml`) can plug in later
- Deploy publicly at a later stage

---

## Tech Stack

### Frontend (this repo)
- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + CSS variables for theming
- **3D Cube:** `cubing.js` — WCA-compliant scrambles, 3D interactive cube via Three.js under the hood
- **Charts:** Recharts
- **State:** Zustand (global) + localStorage persistence
- **Animations:** Framer Motion
- **Icons:** Lucide React

### ML Service (separate repo: `cubiq-ml`)
- FastAPI + Python
- Called via `POST /api/solve` with a cube state string
- Returns optimal move sequence
- Not built in this phase — frontend should gracefully handle when service is unavailable

---

## Design System

### Theme
- **Mode:** Dark-first (speedcubers solve in dim environments)
- **Aesthetic:** Refined dark glassmorphism — dark backgrounds, frosted glass cards, sharp neon accents
- **Feel:** Like a high-end productivity tool crossed with a gaming interface

### Colors (CSS Variables)
```css
--bg-base: #0a0a0f          /* deep near-black */
--bg-surface: #12121a       /* card backgrounds */
--bg-glass: rgba(255,255,255,0.04)  /* glassmorphism */
--border: rgba(255,255,255,0.08)
--accent-primary: #6ee7f7   /* cyan — main accent */
--accent-secondary: #a78bfa /* violet — secondary */
--accent-success: #34d399   /* green — PB/best times */
--accent-danger: #f87171    /* red — DNF/worst */
--text-primary: #f1f5f9
--text-secondary: #94a3b8
--text-muted: #475569
```

### Typography
- **Timer display:** `JetBrains Mono` or `Space Mono` — monospace, sharp
- **UI labels:** `Syne` — geometric, modern, distinctive
- **Body/stats:** `Inter` — readable at small sizes

### WCA Cube Face Colors
```
U (Up)    → white   #FFFFFF
D (Down)  → yellow  #FFD500
F (Front) → green   #009B48
B (Back)  → blue    #0046AD
R (Right) → red     #B90000
L (Left)  → orange  #FF5800
```

---

## Application Layout

### Overall Structure
```
┌─────────────────────────────────────────────────────┐
│  Navbar: Cubiq logo | Session selector | Export btn  │
├──────────────┬──────────────────────────────────────┤
│              │                                        │
│  Left Panel  │         Main Content Area              │
│  (Sidebar)   │                                        │
│              │                                        │
└──────────────┴──────────────────────────────────────┘
```

The layout is **responsive**:
- Desktop: sidebar + main content side by side
- Mobile: bottom tab navigation, full-width content

### Pages / Views (via tabs or routing)
1. `/` — Timer (default view)
2. `/stats` — Statistics & Charts
3. `/solvers` — Cross Solver
4. `/history` — Full solve history table

---

## Feature Specifications

---

### Feature 1: Timer

**The centerpiece of the app.**

#### Behavior
- **Spacebar** (desktop) or **tap** (mobile) to start/stop
- Hold spacebar/tap for 300ms → timer turns green → release to start
- If "Inspection" is enabled: 15-second countdown before solve starts (WCA standard), plays a subtle tick sound at 8s and 12s remaining
- Timer displays in `MM:SS.ms` format, e.g. `1:03.47` or `9.82`
- On stop: time is saved immediately to session

#### Timer States
```
IDLE → (hold 300ms) → READY → (release) → INSPECTION → RUNNING → STOPPED
                                (if disabled)→ RUNNING → STOPPED
```

#### Per-Solve Actions (shown after each solve)
- `+2` penalty (adds 2 seconds, marks as +2)
- `DNF` toggle
- `Delete` solve
- `Comment` — add a text note to any solve

#### Settings (accessible from navbar gear icon)
- Toggle inspection on/off
- Inspection duration (8s / 12s / 15s)
- Timer display precision (hundredths / milliseconds)
- Voice alerts during inspection

---

### Feature 2: Scramble Generator

- Uses `cubing.js` WCA scramble generator
- Default: 3x3x3, 20 moves
- Displayed prominently above the timer
- **Puzzle selector:** 2x2, 3x3, 4x4, 5x5, Pyraminx, Skewb, Megaminx, Square-1, Clock
- "Next scramble" button + auto-generates after each solve
- Scramble history: can go back to previous scramble

---

### Feature 3: 3D Interactive Cube Preview

- Rendered using `cubing.js` TwistyPlayer (`<twisty-player>` web component)
- Shows current scramble applied to a solved cube
- **Interactive:** user can click and drag to rotate the 3D view
- **Animation:** plays the scramble moves when scramble is first generated (fast animation, ~0.5s total)
- Positioned in the bottom-right corner on desktop, collapsible on mobile
- Toggle visibility button

---

### Feature 4: Statistics Panel

Displayed in the left sidebar on desktop, `/stats` page on mobile.

#### Real-time stats (updates after every solve)
| Stat | Description |
|------|-------------|
| `current` | Last solve time |
| `best` | All-time best single in session |
| `ao5` | Average of last 5 (drops best+worst) |
| `ao12` | Average of last 12 |
| `ao50` | Average of last 50 |
| `ao100` | Average of last 100 |
| `session mean` | Mean of all solves in session |
| `session count` | Total solves |

#### Average Calculation (WCA standard)
- ao5: remove best and worst, average the remaining 3
- ao12+: remove best and worst, average the remaining
- If any solve in the window is DNF: result is DNF (unless only 1 DNF in ao12+)

#### Color coding
- Personal best (PB) → `--accent-success` glow
- DNF → `--accent-danger`
- Improving trend → subtle green tint

---

### Feature 5: Charts & Analytics (`/stats` page)

#### 5a. Time Trend Line Chart
- X axis: solve number
- Y axis: time in seconds
- Plots individual times + ao5 + ao12 overlay lines
- Hover tooltip: solve time, scramble, date
- Click a point → shows that solve's detail

#### 5b. Time Distribution Histogram
- X axis: time buckets (e.g. 8-9s, 9-10s, 10-11s)
- Y axis: count of solves
- Color gradient from slow (red) to fast (green)

#### 5c. Daily Statistics
- Calendar heatmap style (like GitHub contributions)
- Shows solve count per day
- Tooltip: solves, best time, mean for that day

#### 5d. Cross-Session Comparison
- Select 2+ sessions
- Compare ao5, ao12, best, mean side by side
- Bar chart

---

### Feature 6: Session Management

- Create, rename, delete sessions
- Sessions stored in localStorage
- Each session has: name, puzzle type, list of solves, created date
- **Active session** shown in navbar dropdown
- Max sessions: unlimited (localStorage permitting)
- Sessions are independent (stats computed per-session)

---

### Feature 7: Solve History (`/history` page)

Full table of all solves in the current session:

| # | Time | ao5 | ao12 | Scramble | Date | Actions |
|---|------|-----|------|----------|------|---------|

- Sortable columns
- Search/filter by scramble
- Click row → expand to show full scramble + comment
- Bulk actions: delete selected, export selected
- Pagination or virtual scroll for large sessions

---

### Feature 8: Cross Solver (`/solvers` page)

#### What it does
Given the current scramble, computes the shortest solution to solve the cross on each of the 6 faces (D, U, F, B, L, R). Matches csTimer's solver output.

#### Algorithm
Uses `cubing.js` solver internals OR implements IDA\* with pruning tables for the 4-edge cross subset. This is the most technically complex feature.

**Implementation approach:**
1. Parse the scramble into a cube state using `cubing.js`
2. For each face, run IDA\* search on the 4 cross edges only
3. Return the shortest move sequence per face
4. Display with move count

#### UI
- Shows 6 solution rows, one per face
- Each row: `D(ec): F2 U B2 R D2` format (same as csTimer)
- Face label colored with WCA face color
- Click a solution → cube preview animates that solution
- Copy button per row

#### Note
`(ec)` means "efficient cross" — it includes a cube rotation (e.g. `z2`) to bring the desired face to the bottom before solving.

---

### Feature 9: Export / Import

#### Export
- Format: **JSON** (human-readable, ML-friendly)
- Includes: all sessions, all solves, metadata
- Triggered from navbar export button
- Filename: `cubiq-export-YYYY-MM-DD.json`

#### JSON Schema
```json
{
  "version": "1.0",
  "exported_at": "2026-05-03T10:00:00Z",
  "sessions": [
    {
      "id": "uuid",
      "name": "Session 1",
      "puzzle": "333",
      "created_at": "...",
      "solves": [
        {
          "id": "uuid",
          "time_ms": 9820,
          "penalty": null,
          "scramble": "F' U2 F' U2 L2 U2 F2 U2 F2 R' U' R U2 B2 D U2 L D",
          "scramble_state": "...",  // cube state string for ML use
          "comment": "",
          "created_at": "..."
        }
      ]
    }
  ]
}
```

#### Import
- Drag-and-drop or file picker
- Validates JSON schema before importing
- Merge mode: add imported sessions alongside existing ones
- Replace mode: overwrite everything

---

### Feature 10: ML Solver Placeholder (`/solvers` page)

A section on the Solvers page that shows:
- "MDP Solver — Coming Soon" card
- Brief explanation of what it will do
- Input: paste a cube state string OR use current scramble
- Button: `Connect to cubiq-ml` → calls `GET /health` on configured ML service URL
- If connected: shows solver status
- If not: shows friendly "service offline" state

This ensures the ML integration point is designed from day 1.

---

## Data Architecture

### localStorage Keys
```
cubiq:sessions        → Session[]  (all sessions + solves)
cubiq:active_session  → string     (session id)
cubiq:settings        → Settings   (all user preferences)
cubiq:scramble_history → string[]  (last 10 scrambles)
```

### Zustand Store Structure
```typescript
interface CubiqStore {
  // Sessions
  sessions: Session[]
  activeSessionId: string
  activeSession: Session  // computed

  // Timer
  timerState: 'idle' | 'ready' | 'inspection' | 'running' | 'stopped'
  currentTime: number
  inspectionTime: number
  currentScramble: string

  // Settings
  settings: Settings

  // Actions
  addSolve: (solve: Solve) => void
  deleteSolve: (id: string) => void
  updateSolve: (id: string, update: Partial<Solve>) => void
  createSession: (name: string, puzzle: string) => void
  switchSession: (id: string) => void
  exportData: () => void
  importData: (json: string) => void
}
```

---

## Phases

### Phase 1 — Core (Build first)
- Timer (spacebar + mobile tap)
- Scramble generator (3x3 only)
- 3D cube preview
- ao5, ao12, session stats
- Session management
- Export/Import JSON
- Basic solve history

### Phase 2 — Analytics
- All chart types (trend, distribution, daily, cross-session)
- Full history table with search/filter/sort

### Phase 3 — Solvers
- Cross solver (all 6 faces)
- ML solver placeholder + health check

### Phase 4 — ML Integration (separate repo)
- FastAPI `cubiq-ml` service
- MDP/RL model
- Frontend calls live solver

---

## Non-Goals (explicitly out of scope)
- Metronome
- Bluetooth cube support
- Online competition / multiplayer
- User accounts / cloud sync (Phase 1)
- Puzzles other than 3x3 (Phase 1)

---

## Success Metrics
- Timer accuracy: ±1ms
- Scramble generation: <50ms
- 3D cube render: <100ms after scramble
- Cross solver: <500ms per solve
- First meaningful paint: <1.5s
- Works offline (PWA-ready architecture)
