# Cubiq — Portfolio Context

*Raw material for a client-facing case study. Factual, specific to this codebase.*

---

## 1. One-Line Summary

A dark-themed Rubik's Cube training app with a built-in timer, analytics, and a live research dashboard where a custom AI model trains itself to solve the cube.

---

## 2. The Problem

Speedcubers track their solves in apps like csTimer — a tool that works but looks like it was designed in 2008. There's no good modern alternative that combines a beautiful training interface with real analytics and any kind of AI/solver integration. Cubiq was built to replace csTimer for serious cubers who want a premium feel, rich stats, and a path toward AI-powered solving.

Target user: intermediate-to-advanced speedcubers who time themselves regularly, care about their ao5/ao12 averages, and would benefit from cross-solving suggestions.

---

## 3. My Role

Built entirely from scratch — no inherited codebase. This includes:
- Full frontend architecture (Next.js App Router, Zustand store, all components)
- Custom IDA* cross solver written in TypeScript
- The `cubiq-ml` FastAPI service (separate sub-directory)
- A PyTorch neural network trained via Autodidactic Iteration (ADI/DeepCubeA-style RL)
- The MDP research dashboard wiring the frontend live to the training loop

The only significant third-party integrations are `cubing.js` (scramble generation + 3D cube rendering) and the `kociemba` Python library (optimal full-cube solving benchmark).

---

## 4. Technical Approach

**Frontend → Clean separation of concerns.** All business logic lives in `src/lib/` (stats calculations, export/import, cube wrappers, solver). Components are purely presentational. Zustand with `persist` middleware handles global state and localStorage in one place — no direct `localStorage` calls anywhere else.

**cubing.js as a web component.** The library's `TwistyPlayer` 3D cube renderer must be instantiated as a DOM element, not a React component. This required a `useEffect`-based mounting pattern and `dynamic(() => import(...), { ssr: false })` to avoid Next.js SSR crashes. Webpack had to replace Turbopack because cubing.js's Web Worker bootstrapping was incompatible with Turbopack's module resolution — this was an actual blocker discovered during build, not theoretical.

**Timer accuracy.** The visible timer interval calls `performance.now() - startTime` on every tick. `setInterval` is only used to trigger re-renders, not to measure time — so drift doesn't accumulate even over long solves.

**ML architecture (cubiq-ml).** Implemented Autodidactic Iteration: the model is self-supervised, generating its own training data by scrambling a solved cube to random depths and learning to estimate the move distance back to solved. The network is a dual-head ResNet: one head regresses a value (estimated moves remaining), one head outputs a policy distribution over 18 moves. At inference time the frontend can trigger either greedy rollout or MCTS, then compare the result directly against Kociemba's optimal solution.

**MDP dashboard as a live research tool.** The frontend polls `/mdp/status` every 2 seconds during training, charts loss/solve-rate history with Recharts, and displays the policy probability bars for the current scramble in real time.

---

## 5. Actual Tech Stack

**Frontend**
- Next.js 16.2.4 (App Router, Webpack — not Turbopack)
- React 19, TypeScript 5
- Tailwind CSS 4
- Zustand 5 (with `persist` middleware)
- cubing.js 0.63.3 (WCA scrambles + `TwistyPlayer` 3D web component)
- Recharts 3.8.1 (all chart types)
- Framer Motion 12.38.0 (animations)
- Lucide React (icons)

**Backend (cubiq-ml)**
- FastAPI + Uvicorn
- PyTorch (dual-head CubeNet, ResBlock, ADI training loop)
- NumPy
- kociemba 1.2.1 (optimal solver used as ground-truth benchmark)
- PyCuber 0.2.2 (cube state manipulation)
- Pydantic 2 (request/response models)

---

## 6. Notable Features

- **Precision timer** — spacebar or tap, 300ms hold-to-arm, optional WCA-standard 15s inspection countdown with audio alerts; stores every solve with penalty support (+2, DNF)
- **WCA-compliant stats** — ao5, ao12, ao50, ao100 with correct trim-best/worst logic; updates live after every solve; color-coded PB detection
- **Interactive 3D scramble preview** — animated TwistyPlayer web component showing the scramble applied to a virtual cube; user can click-drag to rotate in 3D
- **IDA* cross solver** — finds the shortest sequence to solve the cross on any of the 6 faces, with cube rotation prefix (e.g., `z2`) to bring the chosen face down, displayed in csTimer's format
- **Analytics suite** — time trend line chart (with ao5/ao12 overlays), time distribution histogram, daily solve heatmap, cross-session comparison bar chart
- **MDP research dashboard** — trigger RL training from the browser, watch loss/solve-rate charts update live, inspect the policy probability distribution over 18 moves for the current scramble, then run greedy or MCTS solve and compare move efficiency against Kociemba optimal

---

## 7. Challenges & Tradeoffs

**cubing.js + Next.js incompatibility.** The library spawns Web Workers using a relative URL pattern that Turbopack's bundler breaks. Switching to `--webpack` (committed in `a03b742`) was the fix. The SSR issue was a separate problem — cubing.js references `self` (browser global) at module load time, which crashes during server-side rendering; solved with `dynamic()` + `{ ssr: false }`.

**ADI tie-breaking bug.** Commit `85f1745` ("Fix ADI policy collapse from deterministic argmin tie-breaking") documents a real training failure: the policy network collapsed to always recommending the same move. Root cause was using `argmin` deterministically when multiple actions had equal estimated value at the start of training — the model never explored. Fixed by adding noise/randomness to the action selection during self-play.

**MDP service URL persistence.** Commit `2fe1ab9` shows that the configured ML service URL wasn't surviving page reloads — it was stored in component state, not in the persisted Zustand slice. Moved it into `settings` (which is persisted to localStorage) to fix.

**Cross solver scope.** The original plan noted the cross solver as potentially "too complex for Phase 1" and allowed a "coming soon" fallback. It was fully implemented in Phase 3 (commit `f8f34cc`) using IDA* directly in TypeScript rather than relying on a cubing.js experimental API that wasn't stable enough.

**Hydration mismatch.** Zustand `persist` writes to localStorage on mount, which differs from the server-rendered HTML. Solved with `skipHydration` and a client-side `isHydrated` gate (commit `dfa62dd`).

---

## 8. Status

**Local prototype — not deployed.** No public URL, no cloud hosting configured. Runs via `npm run dev` (Next.js on port 3000) + `uvicorn main:app` (FastAPI on port 8000). Private repository. The ML model weights are local only and excluded from git (`.gitignore` covers large ML artifacts per commit `2fe1ab9`).

---

## 9. Metrics

| Metric | Value |
|---|---|
| Total commits | 12 |
| Date range | 2026-05-03 → 2026-06-16 (~6 weeks) |
| Lines of code (TS/TSX/Python, excl. deps) | ~4,900 |
| Frontend source files | 37 (`.ts` / `.tsx`) |
| Backend source files | 8 (`.py`) |
| App pages | 4 (`/`, `/stats`, `/history`, `/solvers`) |
| API endpoints | 8 (`/health`, `/solve`, `/solve/cross`, `/mdp/status`, `/mdp/train`, `/mdp/train/stop`, `/mdp/solve`, `/mdp/policy`, `/mdp/metrics`) |

---

## 10. Suggested Screenshots

| What to capture | Why it's portfolio-worthy | Relevant files |
|---|---|---|
| **Timer page in action** — large time display mid-solve, scramble above, 3D cube in corner, stats panel on left | Shows the core product; demonstrates the design system at its fullest | [src/app/page.tsx](src/app/page.tsx), [src/components/timer/TimerDisplay.tsx](src/components/timer/TimerDisplay.tsx), [src/components/scramble/CubePreview3D.tsx](src/components/scramble/CubePreview3D.tsx) |
| **Stats page** — time trend chart with ao5/ao12 overlays + distribution histogram visible | Demonstrates the analytics depth and Recharts integration | [src/app/stats/page.tsx](src/app/stats/page.tsx), [src/components/stats/TimeChart.tsx](src/components/stats/TimeChart.tsx), [src/components/stats/DistributionChart.tsx](src/components/stats/DistributionChart.tsx) |
| **Solvers page — Cross Solver section** — 6 face solutions displayed in csTimer format with face-color labels | Shows the algorithmic solver output in a clean UI | [src/app/solvers/page.tsx](src/app/solvers/page.tsx), [src/components/solvers/CrossSolver.tsx](src/components/solvers/CrossSolver.tsx) |
| **MDP Research Dashboard** — training running, loss/solve-rate chart updating, policy probability bars visible for current scramble | Most technically differentiated feature; visually shows ML training happening live | [src/components/solvers/MDPPanel.tsx](src/components/solvers/MDPPanel.tsx) |
