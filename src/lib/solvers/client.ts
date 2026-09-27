// Browser-side entry point for every solver (formerly HTTP calls to the
// Python cubiq-ml service): the searches run in a Web Worker (worker.ts) so
// the UI never freezes, with tables built on first use and kept for the
// session. Endpoint names and response shapes mirror the old FastAPI routes.

import type { SolverEndpoint, WorkerRequest, WorkerResponse } from './protocol'

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void }

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, Pending>()

function getWorker(): Worker {
  if (worker) return worker
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  w.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.ok) p.resolve(msg.result)
    else p.reject(new Error(msg.message))
  }
  w.onerror = e => {
    for (const p of pending.values()) p.reject(new Error(e.message || 'Solver worker crashed'))
    pending.clear()
    w.terminate()
    worker = null
  }
  worker = w
  return w
}

/** Run a solver in the worker. Tables persist across calls. */
export function localSolve<T>(endpoint: SolverEndpoint, body: Record<string, unknown>): Promise<T> {
  const w = getWorker()
  const id = nextId++
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    w.postMessage({ id, endpoint, body } satisfies WorkerRequest)
  })
}
