// Endpoint -> solver dispatch table (runs inside the worker). Each handler
// validates/clamps its request body exactly like the old FastAPI route did.

import type { SolverEndpoint } from './protocol'
import { solve3x3 } from './twophase'
import { solve222 } from './s222'
import { solvePyram } from './pyram'
import { solveSkewb } from './skewb'
import { solveMega } from './mega'
import { solveSq1 } from './sq1'
import { FACES, solveCfop, solveDoubleXcross, solveXcross, type CfopFace } from './cfop'

type Handler = (body: Record<string, unknown>) => unknown

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const int = (v: unknown, def: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : def))

function face(v: unknown, def: string, allowBest = false): CfopFace | 'best' {
  const raw = typeof v === 'string' ? v : def
  if (allowBest && raw === 'best') return 'best'
  const f = raw.toUpperCase()
  if (!(FACES as readonly string[]).includes(f)) throw new Error(`Invalid face '${raw}'`)
  return f as CfopFace
}

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
  '/solve/cfop': body => solveCfop(str(body.state), face(body.face, 'best', true), {
    beamWidth: int(body.beam_width, 4, 1, 8),
    crossAlternatives: int(body.cross_alternatives, 2, 1, 5),
    pairVariants: int(body.pair_variants, 2, 1, 3),
    tryXcross: body.try_xcross !== false,
    tryDoubleXcross: body.try_double_xcross === true,
  }),
  '/solve/minx': body => solveMega(str(body.state)),
  '/solve/sq1': body => solveSq1(str(body.state)),
  '/solve/xcross': body =>
    solveXcross(str(body.state), face(body.face, 'D') as CfopFace, int(body.max_solutions, 2, 1, 3)),
  '/solve/xxcross': body =>
    solveDoubleXcross(str(body.state), face(body.face, 'D') as CfopFace, int(body.max_solutions, 2, 1, 2)),
}
