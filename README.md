# Cubiq

A modern speedcubing platform — a precision timer, WCA-standard stats, and a full solver suite covering 8 twisty-puzzle types, backed by a Python service that implements every solver from scratch.

Timer and stats live entirely in the Next.js frontend (local-first, `localStorage`-backed). The solvers page talks to `cubiq-ml`, a separate FastAPI service, for algorithmic solving and an experimental reinforcement-learning research dashboard.

See [PORTFOLIO_CONTEXT.md](PORTFOLIO_CONTEXT.md) for a detailed technical writeup, and [PRD.md](PRD.md) / [CLAUDE.md](CLAUDE.md) for the original product spec and build notes (the app has since grown well beyond that original scope — the solver suite in particular).

---

## Features

- **Timer** — spacebar/tap-to-start with a 300ms hold-to-arm, optional WCA 15s inspection with audio alerts, `+2`/DNF penalty support, per-session puzzle type
- **Stats** — ao5/ao12/ao50/ao100 with correct trim logic, PB detection, time trend chart, distribution histogram, daily heatmap, cross-session comparison
- **History** — full searchable/filterable solve log with export/import (JSON)
- **3D scramble & solution preview** — `cubing.js` `TwistyPlayer` per puzzle, orbit control, step-through playback with speed control
- **Solvers** — one workspace, one tab per puzzle:
  | Puzzle | Method |
  |---|---|
  | 3x3 | Staged CFOP (cross / x-cross / F2L / OLL / PLL) with move-cancelling stitching, plus a Kociemba-optimal comparison |
  | 2x2, Pyraminx, Skewb | Fully precomputed God's-algorithm tables — provably optimal, ≤ 11 moves |
  | 4x4, 5x5 | Reduction pipeline: centers → edge/wing pairing → parity → 3x3 CFOP finish |
  | Megaminx | Layer-by-layer placement with a commutator last-layer macro library |
  | Square-1 | Two-phase shape BFS + exact piece descent, with a custom solid-shell 3D animation |
- **Research (MDP)** — trigger self-play RL training (Autodidactic Iteration) from the browser, watch live loss/solve-rate charts, inspect the policy distribution for a scramble, and compare a greedy/MCTS solve against Kociemba optimal

---

## Stack

**Frontend** — Next.js 16 (App Router, Webpack), React 19, TypeScript, Tailwind CSS 4, Zustand (persisted), `cubing.js`, Recharts, Framer Motion

**Backend (`cubiq-ml`)** — FastAPI, hand-written cube engines per puzzle family, precomputed distance tables (2x2/Pyraminx/Skewb), PyTorch (ADI research model), `kociemba` as a benchmark-only dependency

---

## Running locally

### Frontend

```bash
npm install
npm run dev
```

Runs on [http://localhost:3000](http://localhost:3000). Uses Webpack (`next dev --webpack`) — Turbopack breaks `cubing.js`'s Web Worker bootstrapping.

### Solver / ML backend (`cubiq-ml`)

```bash
cd cubiq-ml
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Runs on [http://localhost:8000](http://localhost:8000). The frontend's solvers page and Research tab expect this URL by default (`NEXT_PUBLIC_ML_SERVICE_URL`, configurable in `.env.local`); the timer and stats pages work fully without it.

The first request warms several precomputed distance tables (2x2, Pyraminx, Skewb, F2L, Square-1) — this can take a few seconds on a cold start.

---

## Project structure

```
src/
├── app/            # Next.js routes: / (timer), /stats, /history, /solvers
├── components/      # UI, grouped by feature (timer, scramble, stats, history, solvers, session)
├── store/            # Zustand store (persisted to localStorage)
├── lib/              # Business logic: stats calculations, cubing.js wrapper, export/import
└── types/            # Shared TypeScript interfaces

cubiq-ml/
├── main.py           # FastAPI app, all routes
├── cube*.py          # Per-puzzle cube engines (3x3, 4x4, 5x5)
├── solver*.py        # Per-puzzle solvers (222, pyram, skewb, mega, 555, sq1)
├── cfop*.py, f2l.py  # 3x3 CFOP staged solver
├── mdp/              # Autodidactic Iteration training + inference
└── tables/           # Checked-in precomputed distance tables
```

---

## Status

Local prototype, not deployed. Private repository. See [PORTFOLIO_CONTEXT.md](PORTFOLIO_CONTEXT.md) for current metrics and a full technical breakdown.
