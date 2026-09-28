# Cubiq

A modern speedcubing platform — a precision timer, WCA-standard stats, and a full solver suite covering 8 twisty-puzzle types, every solver implemented from scratch and running right in the browser.

**Live:** https://andifathulms.github.io/cubiq/

Everything is client-side: timer and stats are local-first (`localStorage`-backed), and the solvers run in a Web Worker as TypeScript ports of the original Python `cubiq-ml` service, verified to produce the same solutions. The site is a static export hosted on GitHub Pages. `cubiq-ml` is still in the repo for the experimental reinforcement-learning Research tab, the only feature that needs it.

See [PORTFOLIO_CONTEXT.md](PORTFOLIO_CONTEXT.md) for a detailed technical writeup, and [PRD.md](PRD.md) / [CLAUDE.md](CLAUDE.md) for the original product spec and build notes (the app has since grown well beyond that original scope — the solver suite in particular).

---

## Features

Four sections, each answering one question, in a "Stackmat" design: graphite (dark) and scorecard (light) themes that follow your system, state colours like a competition timer (red holding, green ready, gold for records), and WCA sticker colours used as data.

- **Practice** — *what's my next solve?* Stackmat-style timing (hold until green, release to start, any key or tap stops), WCA inspection with automatic +2/DNF and optional spoken 8 s/12 s calls, scrambles as face-coloured move chips grouped for reading, a Net/3D cube preview, OK/+2/DNF right under the result, PB celebration, a stats strip (PB, ao5 with its change, ao12, ao100, today, last five), sessions per puzzle, and keyboard shortcuts (`?`)
- **Progress** — *am I getting faster?* Records for 7 days / 30 days / all time with their change against the previous period, practice streak, a trend chart (singles, rolling ao12, PB staircase), distribution, 12-week consistency heatmap, all sessions compared, and the full solve log (filters, search, notes, penalties, open in Solve Lab, JSON import/export)
- **Solve Lab** — *how should this scramble be solved?* Every solver runs in your browser (Web Worker) and shows its solution stage by stage — a move bar per stage, stage rows that play just that stage, and a 3D player:
  | Puzzle | Method |
  |---|---|
  | 3x3 | Staged CFOP (cross / x-cross / F2L / OLL / PLL) with move cancellation; optimal cross and x-cross for every colour; Kociemba two-phase (min2phase) |
  | 2x2, Pyraminx, Skewb | Fully precomputed God's-algorithm tables — provably optimal, ≤ 11 moves |
  | 4x4, 5x5 | Reduction pipeline: centers → edge/wing pairing → parity → 3x3 CFOP finish |
  | Megaminx | Layer-by-layer placement with a commutator last-layer macro library |
  | Square-1 | Two-phase shape BFS + exact piece descent, with a custom solid-shell 3D animation |
- **Learn** — *what should I drill?* A spaced-repetition trainer for the 21 PLL and 57 OLL cases (diagrams generated from the solver's algorithms; recognition and execution timing; mastery grid) and a cross-planning drill against the optimal cross
- **Research (Settings › Labs; needs `cubiq-ml` running locally)** — trigger self-play RL training (Autodidactic Iteration) from the browser, watch live loss/solve-rate charts, inspect the policy distribution for a scramble, and compare a greedy/MCTS solve against Kociemba optimal

---|---|
  | 3x3 | Staged CFOP (cross / x-cross / F2L / OLL / PLL) with move-cancelling stitching, plus a Kociemba two-phase (min2phase) comparison |
  | 2x2, Pyraminx, Skewb | Fully precomputed God's-algorithm tables — provably optimal, ≤ 11 moves |
  | 4x4, 5x5 | Reduction pipeline: centers → edge/wing pairing → parity → 3x3 CFOP finish |
  | Megaminx | Layer-by-layer placement with a commutator last-layer macro library |
  | Square-1 | Two-phase shape BFS + exact piece descent, with a custom solid-shell 3D animation |
- **Research (MDP, needs `cubiq-ml` running locally)** — trigger self-play RL training (Autodidactic Iteration) from the browser, watch live loss/solve-rate charts, inspect the policy distribution for a scramble, and compare a greedy/MCTS solve against Kociemba optimal

---

## Stack

**Frontend** — Next.js 16 (App Router, static export), React 19, TypeScript, Tailwind CSS 4, Zustand (persisted), `cubing.js`; fonts Bricolage Grotesque, Geist and Martian Mono; charts as hand-built SVG

**Solvers** — `src/lib/solvers/`: TypeScript ports of every `cubiq-ml` solver, run in a Web Worker with distance tables built on first use (symmetry-reduced where possible, e.g. the F2L tables); the 3x3 two-phase search is min2phase, vendored from `cubing.js`

**Research backend (`cubiq-ml`, optional)** — FastAPI, hand-written cube engines per puzzle family, precomputed distance tables (2x2/Pyraminx/Skewb), PyTorch (ADI research model), `kociemba` as a benchmark-only dependency

---

## Running locally

### Frontend

```bash
npm install
npm run dev
```

Runs on [http://localhost:3000](http://localhost:3000). Uses Webpack (`next dev --webpack`) — Turbopack breaks `cubing.js`'s Web Worker bootstrapping.

### Research backend (`cubiq-ml`, optional)

```bash
cd cubiq-ml
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Only the Research (MDP) tab uses it; set its URL in the app's Settings (default `NEXT_PUBLIC_ML_SERVICE_URL`). The Python solvers remain the reference implementation the browser ports were checked against.

### Deploying

Pushing to `main` runs `.github/workflows/deploy-pages.yml`: a static export (`output: 'export'`, `basePath` from `PAGES_BASE_PATH`) published to GitHub Pages. `npm run build` locally produces the same site in `out/`.

---

## Project structure

```
src/
├── app/            # Next.js routes: / (practice), /progress, /lab, /learn, /research
├── components/      # UI, grouped by feature (practice, progress, lab, learn, session, layout, ui)
├── store/            # Zustand store (persisted to localStorage)
├── lib/              # Business logic: stats calculations, cubing.js wrapper, export/import
│   └── solvers/      # In-browser solver ports + Web Worker (tables built on first use)
└── types/            # Shared TypeScript interfaces

cubiq-ml/             # Python reference solvers + RL research service
├── main.py           # FastAPI app, all routes
├── cube*.py          # Per-puzzle cube engines (3x3, 4x4, 5x5)
├── solver*.py        # Per-puzzle solvers (222, pyram, skewb, mega, 555, sq1)
├── cfop*.py, f2l.py  # 3x3 CFOP staged solver
├── mdp/              # Autodidactic Iteration training + inference
└── tables/           # Checked-in precomputed distance tables
```

---

## Status

Deployed on GitHub Pages: https://andifathulms.github.io/cubiq/. See [PORTFOLIO_CONTEXT.md](PORTFOLIO_CONTEXT.md) for a full technical breakdown (written when the solvers still ran in `cubiq-ml`).
