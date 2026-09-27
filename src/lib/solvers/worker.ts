// Solver Web Worker: runs the ported cubiq-ml solvers off the main thread.
// Tables are built lazily on first use and cached for the worker's lifetime.

import type { WorkerRequest, WorkerResponse } from './protocol'
import { HANDLERS } from './handlers'

const ctx = self as unknown as {
  postMessage: (msg: WorkerResponse) => void
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null
}

ctx.onmessage = e => {
  const { id, endpoint, body } = e.data
  try {
    const handler = HANDLERS[endpoint]
    if (!handler) throw new Error(`No local solver for ${endpoint}`)
    ctx.postMessage({ id, ok: true, result: handler(body) })
  } catch (err) {
    ctx.postMessage({ id, ok: false, message: err instanceof Error ? err.message : String(err) })
  }
}
