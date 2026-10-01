// Message protocol between client.ts (main thread) and worker.ts.

export type SolverEndpoint =
  | '/solve'          // 3x3 two-phase (min2phase)
  | '/solve/xcross'
  | '/solve/xxcross'
  | '/solve/cfop'
  | '/solve/222'
  | '/solve/pyram'
  | '/solve/skewb'
  | '/solve/minx'
  | '/solve/sq1'
  | '/solve/444'
  | '/solve/555'
  | '/solve/666'
  | '/learn/xcross'   // Learn › Lessons: a scramble for an x-cross lesson

export type WorkerRequest = { id: number; endpoint: SolverEndpoint; body: Record<string, unknown> }

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; message: string }
  | { id: number; progress: string }
