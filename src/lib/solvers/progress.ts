// Progress messages from inside long solver steps (table builds, stages).
// The worker points the sink at postMessage for the running request;
// elsewhere (tests, main thread) reports are dropped.

let sink: ((message: string) => void) | null = null

export function setProgressSink(fn: ((message: string) => void) | null): void {
  sink = fn
}

export function reportProgress(message: string): void {
  sink?.(message)
}
