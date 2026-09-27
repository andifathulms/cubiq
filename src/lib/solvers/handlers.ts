// Endpoint -> solver dispatch table (runs inside the worker). Each handler
// validates/clamps its request body exactly like the old FastAPI route did.

import type { SolverEndpoint } from './protocol'
import { solve3x3 } from './twophase'

type Handler = (body: Record<string, unknown>) => unknown

const str = (v: unknown) => (typeof v === 'string' ? v : '')

export const HANDLERS: Partial<Record<SolverEndpoint, Handler>> = {
  '/solve': body => solve3x3(str(body.state)),
}
