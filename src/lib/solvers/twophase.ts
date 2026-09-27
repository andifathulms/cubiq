// 3x3 two-phase solving (replaces cubiq-ml's kociemba dependency): min2phase
// on a kociemba facelet string. Used directly by the /solve endpoint and as
// the 3x3 stage of the 4x4/5x5 reduction pipelines.

import { FACES, fromScramble, makeCube, standardLayers } from './cubeN'
import { initialize, solvePattern } from './vendor/min2phase'

let ready = false

/** Solution moves for a 54-char kociemba facelet string, or null when the
 *  facelets are not a legal 3x3 state (flip/twist/parity) — the same states
 *  kociemba.solve() rejected. */
export function solve3x3Facelet(facelet: string): string[] | null {
  if (!ready) {
    initialize()
    ready = true
  }
  const out = solvePattern(facelet)
  if (out.startsWith('Error')) return null
  return out.split(/\s+/).filter(Boolean)     // '' for an already-solved cube
}

let cube3: ReturnType<typeof makeCube> | null = null

export function scrambleToFacelet(scramble: string): string {
  cube3 ??= makeCube(3, standardLayers(3, 1, false), false)
  const state = fromScramble(cube3, scramble)
  let s = ''
  for (const v of state) s += FACES[v]
  return s
}

export function solve3x3(scramble: string) {
  const t0 = performance.now()
  const moves = solve3x3Facelet(scrambleToFacelet(scramble))
  if (moves === null) throw new Error('invalid 3x3 scramble')
  return { moves, move_count: moves.length, time_ms: performance.now() - t0 }
}
