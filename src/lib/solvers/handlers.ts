// Endpoint -> solver dispatch table (runs inside the worker). Each handler
// validates/clamps its request body exactly like the old FastAPI route did.

import type { SolverEndpoint } from './protocol'
import { solve3x3 } from './twophase'
import { solve222 } from './s222'
import { solvePyram } from './pyram'
import { solveSkewb } from './skewb'

type Handler = (body: Record<string, unknown>) => unknown

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const int = (v: unknown, def: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : def))

/** Adds time_ms like the old routes did. */
function timed<T extends object>(f: () => T): T & { time_ms: number } {
  const t0 = performance.now()
  const r = f()
  return { ...r, time_ms: performance.now() - t0 }
}

export const HANDLERS: Partial<Record<SolverEndpoint, Handler>> = {
  '/solve': body => solve3x3(str(body.state)),
  '/solve/222': body => timed(() => solve222(str(body.state), int(body.max_alternatives, 3, 1, 5))),
  '/solve/pyram': body => timed(() => solvePyram(str(body.state), int(body.max_alternatives, 3, 1, 5))),
  '/solve/skewb': body => timed(() => solveSkewb(str(body.state), int(body.max_alternatives, 3, 1, 5))),
}
