# Cubiq — Portfolio Context

*Raw material for a client-facing case study. Factual, specific to this codebase.*

---

## 1. One-Line Summary

A dark-themed speedcubing platform — timer, WCA-standard stats, and an interactive 3D cube — that has grown into a full solver suite covering all 8 major twisty puzzles, each with its own optimal or near-optimal algorithm implemented from scratch, plus a live research dashboard where a custom AI model trains itself to solve the cube.

---

## 2. The Problem

Speedcubers track their solves in apps like csTimer — a tool that works but looks like it was designed in 2008. There's no good modern alternative that combines a beautiful training interface with real analytics, per-puzzle solvers, and any kind of AI/solver integration. Cubiq was built to replace csTimer for serious cubers who want a premium feel, rich stats, and solving tools that go well past the cross.

Target user: intermediate-to-advanced speedcubers who time themselves across multiple puzzle types, care about their ao5/ao12 averages, and want algorithmic (or eventually AI-driven) help understanding and solving a scramble.

---

## 3. My Role

Built entirely from scratch — no inherited codebase. This includes:
- Full frontend architecture (Next.js App Router, Zustand store, all components)
- Nine independent puzzle solvers written from scratch in the `cubiq-ml` FastAPI service — some via complete precomputed God's-algorithm tables, others via IDA*/BFS search or staged reduction
- A cube geometry + move-table engine per puzzle family (3x3, 4x4, 5x5, Pyraminx, Skewb, Megaminx, Square-1), not borrowed from a solving library
- A PyTorch neural network trained via Autodidactic Iteration (ADI/DeepCubeA-style RL), plus the MDP research dashboard wiring the frontend live to the training loop
- The full design system: dark glass UI, custom 3D renderers (including a from-scratch Square-1 solid-shell WebGL view), collapsible sidebar, per-puzzle tabbed solver workspace

The only significant third-party integrations are `cubing.js` (scramble generation + 3D cube rendering via `TwistyPlayer`) and the `kociemba` Python library (used only as an optimal full-cube benchmark to compare the custom solvers/model against).

---

## 4. Technical Approach

**Frontend → Clean separation of concerns.** All business logic lives in `src/lib/` (stats calculations, export/import, cube wrappers). Components are purely presentational. Zustand with `persist` middleware handles global state and localStorage in one place — no direct `localStorage` calls anywhere else, aside from small UI preferences like sidebar-collapsed state.

**cubing.js as a web component.** The library's `TwistyPlayer` 3D cube renderer must be instantiated as a DOM element, not a React component. This required a `useEffect`-based mounting pattern and `dynamic(() => import(...), { ssr: false })` to avoid Next.js SSR crashes. Webpack had to replace Turbopack because cubing.js's Web Worker bootstrapping was incompatible with Turbopack's module resolution (commit `a03b742`) — a real build blocker, not a theoretical one.

**Per-puzzle solving engines, not one generic solver.** Each puzzle family got its own from-scratch cube representation and move-table generator (`cube.py`, `cube444.py`, `cube555.py`, `megaengine.py`, plus Pyraminx/Skewb/Square-1 state models), then a solving strategy chosen to fit the puzzle's state-space size:
- **2x2, Pyraminx, Skewb** — state spaces small enough (up to ~3.1M positions) to fully precompute a God's-algorithm distance table; the API just looks up the optimal move count and path (≤ 11 moves, provably optimal).
- **3x3** — staged CFOP: exact IDA* cross/x-cross/double-x-cross solving, F2L pair search, and a full OLL/PLL recognition + algorithm database, with move cancellation across stage boundaries so the stitched solution isn't padded with redundant turns (commit `c4ba02b`).
- **4x4, 5x5** — geometry-generated move tables feeding a reduction pipeline (centers → edge/wing pairing → parity handling → 3x3 CFOP finish) — the standard big-cube method, but the reduction and parity-fix logic is hand-implemented, not borrowed.
- **Megaminx** — layer-by-layer greedy placement with a curated commutator library for the last layer.
- **Square-1** — the hardest engineering case: a two-phase solver (shape BFS to restore the cube/square silhouette, then exact piece descent) plus a custom animated 3D view that renders the puzzle as a real double-sided shell and animates "slashes" (180° equator flips) as rigid geometry rather than a sprite swap — this took a long run of iterative commits to get the shading, cut-face visibility, and flip geometry all correct, from the first 3D view (`6799235`) through to a cubing.js flat-net companion view.

**Timer accuracy.** The visible timer interval calls `performance.now() - startTime` on every tick. `setInterval` is only used to trigger re-renders, not to measure time, so drift doesn't accumulate even over long solves.

**ML architecture (cubiq-ml/mdp).** Implemented Autodidactic Iteration: the model is self-supervised, generating its own training data by scrambling a solved cube to random depths and learning to estimate the move distance back to solved. The network is a dual-head ResNet: one head regresses a value (estimated moves remaining), one head outputs a policy distribution over 18 moves. At inference time the frontend can trigger either greedy rollout or MCTS, then compare the result directly against Kociemba's optimal solution.

**MDP dashboard as a live research tool.** The frontend polls `/mdp/status` during training, charts loss/solve-rate history with Recharts, and displays the policy probability bars for the current scramble in real time.

**Solvers workspace UX.** `/solvers` is a single sticky-scramble workspace (`SolverWorkspace.tsx`): one tab per puzzle (3x3, 2x2, 4x4, 5x5, Pyraminx, Skewb, Megaminx, Square-1, plus a "Research" tab for the MDP dashboard), each backed by its own scramble slot and a shared 3D preview panel so switching puzzles doesn't lose your place. Deep-linking via `/solvers?puzzle=<id>&scramble=<alg>` lets the timer's "Solve this" action hand a just-timed scramble straight to the matching solver.

---

## 5. Actual Tech Stack

**Frontend**
- Next.js 16.2.4 (App Router, Webpack — not Turbopack)
- React 19, TypeScript 5
- Tailwind CSS 4 (custom dark glass design tokens — signature gradient, depth, ambient background)
- Zustand 5 (with `persist` middleware)
- cubing.js 0.63.3 (WCA scrambles for every puzzle type + `TwistyPlayer` 3D web component, incl. flat-net view for Square-1)
- Recharts 3.8.1 (all chart types)
- Framer Motion 12.38.0 (animations)
- Lucide React (icons)

**Backend (cubiq-ml)**
- FastAPI + Uvicorn, 19 endpoints
- Hand-written cube engines per puzzle family (3x3, 4x4, 5x5, Pyraminx, Skewb, Megaminx, Square-1) — geometry-generated move tables, no external cube-solving library
- Precomputed God's-algorithm tables (`.npy`/`.pkl` under `cubiq-ml/tables/`) for 2x2, Pyraminx, and Skewb
- PyTorch (dual-head CubeNet, ResBlock, ADI training loop) for the MDP research model
- NumPy
- kociemba 1.2.1 (optimal 3x3 solver used only as a ground-truth benchmark)
- PyCuber 0.2.2 (cube state manipulation utility)
- Pydantic 2 (request/response models)

---

## 6. Notable Features

- **Precision timer** — spacebar or tap, 300ms hold-to-arm, optional WCA-standard 15s inspection countdown with audio alerts; stores every solve with penalty support (+2, DNF); per-session puzzle-type selection
- **WCA-compliant stats** — ao5, ao12, ao50, ao100 with correct trim-best/worst logic; updates live after every solve; color-coded PB detection; trend chart, distribution histogram, daily heatmap, cross-session comparison
- **Full solver suite for 8 puzzle types**, each with a dedicated card and its own from-scratch solving strategy:
  - 3x3 — staged CFOP (cross/x-cross/F2L/OLL/PLL) with move-cancelling stitching, plus Kociemba-optimal comparison
  - 2x2, Pyraminx, Skewb — fully precomputed optimal solutions (God's algorithm), ≤ 11 moves, provable
  - 4x4, 5x5 — full reduction pipelines (centers → pairing → parity → CFOP finish)
  - Megaminx — layer-by-layer with commutator last-layer macros
  - Square-1 — two-phase shape + piece descent solve, with a physically accurate custom 3D animation of slash moves
- **Interactive 3D scramble/solution preview** — animated `TwistyPlayer` per puzzle, click-drag orbit, step-through controls and speed control on solution playback, current-step indicator, spacebar play/pause
- **Solve → Solver hand-off** — "Solve this" button on a completed timer solve deep-links straight into the matching puzzle's solver tab with the scramble pre-filled
- **MDP research dashboard** — trigger RL training from the browser, watch loss/solve-rate charts update live, inspect the policy probability distribution for the current scramble, then run greedy or MCTS solve and compare move efficiency against Kociemba optimal
- **Collapsible, route-aware sidebar** with persisted collapse state, plus a mobile bottom nav
- **Export/import** — full session data as JSON, merge or replace

---

## 7. Challenges & Tradeoffs

**cubing.js + Next.js incompatibility.** The library spawns Web Workers using a relative URL pattern that Turbopack's bundler breaks. Switching to `--webpack` (commit `a03b742`) was the fix. The SSR issue was separate — cubing.js references `self` (a browser global) at module load time, which crashes during server-side rendering — solved with `dynamic()` + `{ ssr: false }`.

**ADI tie-breaking bug.** Commit `85f1745` ("Fix ADI policy collapse from deterministic argmin tie-breaking") documents a real training failure: the policy network collapsed to always recommending the same move. Root cause was deterministic `argmin` when multiple actions had equal estimated value early in training — the model never explored. Fixed by adding noise/randomness to action selection during self-play.

**MDP service URL persistence.** Commit `2fe1ab9` shows the configured ML service URL wasn't surviving page reloads — it was stored in component state, not in the persisted Zustand slice. Moved into `settings` to fix.

**Square-1's 3D geometry took real iteration.** Getting a physically correct Square-1 render — a solid double-sided shell, dark internal faces suppressed correctly at rest, the slash swap routed around the outside of the puzzle rather than clipping through it, unequal-half alignment on real slash boundaries — took a long sequence of visible, fixable rendering bugs rather than one clean implementation. This is a good illustration of iterative debugging against a hard geometric/visual problem.

**5x5 had a missing macro class.** Commit `45933be` ("Discover the missing 5x5 cross-swap macro class via conjugated parity") — the reduction solver initially got stuck on a specific parity case on the bigger cube; the fix required deriving a new commutator/macro via conjugation rather than adding a special-case hack.

**Cross solver scope grew past the original plan.** The original PRD allowed a "coming soon" fallback if a cross solver was too complex for an early phase. It shipped fully (commit `f8f34cc`) using IDA* directly in TypeScript, and later solvers (CFOP, per-puzzle optimal tables) went considerably further than the PRD ever specified — the whole 8-puzzle solver suite is scope the original plan did not anticipate.

**Hydration mismatch.** Zustand `persist` writes to localStorage on mount, which differs from server-rendered HTML. Solved with `skipHydration` and a client-side `isHydrated` gate (commit `dfa62dd`).

---

## 8. Status

**Local prototype — not deployed.** No public URL, no cloud hosting configured. Runs via `npm run dev` (Next.js on port 3000) + `uvicorn main:app` (FastAPI on port 8000). Private repository. Large ML artifacts (trained model checkpoints) are local-only and excluded from git per `.gitignore` (commit `2fe1ab9`); the smaller God's-algorithm tables for 2x2/Pyraminx/Skewb are checked in under `cubiq-ml/tables/`.

---

## 9. Metrics

| Metric | Value |
|---|---|
| Total commits | 70 |
| Date range | 2026-05-03 → 2026-07-18 (~11 weeks) |
| Frontend source files | 49 (`.ts` / `.tsx`), ~6,500 LOC |
| Backend source files | 32 (`.py`), ~7,200 LOC |
| App pages | 4 (`/`, `/stats`, `/history`, `/solvers`) |
| Puzzle types supported | 8 solved puzzles (3x3, 2x2, 4x4, 5x5, Pyraminx, Skewb, Megaminx, Square-1); timer also tracks Clock sessions |
| Solver components | 9 (`OptimalSolverCard` shared by the precomputed-table puzzles, plus dedicated CFOP, 4x4, 5x5, Megaminx, Square-1, cross, and ML/MDP cards) |
| API endpoints | 19 (`/health`, `/solve`, `/solve/cross`, `/solve/xcross`, `/solve/xxcross`, `/solve/cfop`, `/solve/222`, `/solve/444`, `/solve/555`, `/solve/pyram`, `/solve/minx`, `/solve/skewb`, `/solve/sq1`, `/mdp/status`, `/mdp/train`, `/mdp/train/stop`, `/mdp/solve`, `/mdp/policy`, `/mdp/metrics`) |

---

## 10. Suggested Screenshots

| What to capture | Why it's portfolio-worthy | Relevant files |
|---|---|---|
| **Timer page in action** — large time display mid-solve, scramble above, 3D cube in corner, stats panel on left | Shows the core product; demonstrates the design system at its fullest | [src/app/page.tsx](src/app/page.tsx), [src/components/timer/TimerDisplay.tsx](src/components/timer/TimerDisplay.tsx), [src/components/scramble/CubePreview3D.tsx](src/components/scramble/CubePreview3D.tsx) |
| **Stats page** — time trend chart with ao5/ao12 overlays + distribution histogram visible | Demonstrates the analytics depth and Recharts integration | [src/app/stats/page.tsx](src/app/stats/page.tsx), [src/components/stats/TimeChart.tsx](src/components/stats/TimeChart.tsx), [src/components/stats/DistributionChart.tsx](src/components/stats/DistributionChart.tsx) |
| **Solvers workspace — puzzle tab strip** — all 8 puzzle tabs visible with the sticky scramble/3D-preview panel and one solver card open | Shows the breadth of the solver suite in one shot | [src/app/solvers/page.tsx](src/app/solvers/page.tsx), [src/components/solvers/SolverWorkspace.tsx](src/components/solvers/SolverWorkspace.tsx) |
| **Square-1 3D solid-shell animation mid-slash** | Most visually distinctive custom-geometry work in the app | [src/components/solvers/Sq1AnimatedView.tsx](src/components/solvers/Sq1AnimatedView.tsx), [src/components/solvers/Sq1View3D.tsx](src/components/solvers/Sq1View3D.tsx) |
| **CFOP solver card** — staged cross/x-cross/F2L/OLL/PLL breakdown with per-stage animation | Shows the algorithmic depth of the flagship 3x3 solver | [src/components/solvers/CFOPSolverCard.tsx](src/components/solvers/CFOPSolverCard.tsx) |
| **MDP Research Dashboard** — training running, loss/solve-rate chart updating, policy probability bars visible for current scramble | Most technically differentiated feature; visually shows ML training happening live | [src/components/solvers/MDPPanel.tsx](src/components/solvers/MDPPanel.tsx) |
