// Browser-side entry point for every solver. Replaces the old cubiq-ml HTTP
// calls: the searches run in a Web Worker (see worker.ts) so the UI never
// freezes. Endpoint names and response shapes mirror the former FastAPI
// routes so the solver cards barely changed.

import { LOCAL_ENDPOINTS } from './protocol'
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

/** Solve locally when the endpoint has been ported, else ask cubiq-ml. */
export async function requestSolve<T>(
  endpoint: SolverEndpoint,
  body: Record<string, unknown>,
  opts: { serviceUrl: string; timeoutMs: number },
): Promise<T> {
  if (LOCAL_ENDPOINTS.has(endpoint)) return localSolve<T>(endpoint, body)
  const res = await fetch(`${opts.serviceUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(opts.timeoutMs),
  })
  if (!res.ok) {
    const text = await res.text()
    let detail = 'Solve failed'
    try { detail = JSON.parse(text).detail ?? detail } catch { /* non-JSON error body */ }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}
