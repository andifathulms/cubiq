// CFOP pipeline (Phase C) — port of cubiq-ml cfop.py:
// cross/x-cross -> F2L -> OLL -> PLL.
//
// Each stage is solved exactly (cross and pairs by optimal IDA*, OLL/PLL by
// recognition); the choice layer — which cross solution, whether to
// x-cross, which pair next, which optimal variant — is explored with beam
// search over total move count. All work is canonicalised to the D face;
// other faces remap the scramble through their rotation prefix, so moves
// are performable as read after the prefix.

import { FACE_ROTATION, remapScramble } from './cube3'
import { solveCross } from './cross'
import {
  applyF2LMoves, f2lFromScramble, f2lKey, heuristic, PAIR_NAMES, solvePairs, warmTables,
  type F2LState,
} from './f2l'
import { applyFull, fullFromScramble, solveOll, solvePll } from './lastlayer'
import { reportProgress } from './progress'

export const FACES = ['D', 'U', 'F', 'B', 'R', 'L'] as const
export type CfopFace = (typeof FACES)[number]

const OPP: Record<string, string> = { U: 'D', D: 'U', F: 'B', B: 'F', L: 'R', R: 'L' }
const AMT: Record<string, number> = { '': 1, '2': 2, "'": 3 }

export interface Stage {
  name: string
  kind: string
  moves: string[]
  move_count?: number
  eff_move_count?: number
}

/** (face, quarter-turns) for a plain face move, else null (a barrier). */
function parseFace(tok: string): [string, number] | null {
  if (tok.length >= 1 && tok[0] in OPP && tok.slice(1) in AMT) return [tok[0], AMT[tok.slice(1)]]
  return null
}

function build(face: string, amt: number): string | null {
  amt = ((amt % 4) + 4) % 4
  if (amt === 0) return null
  return face + (amt === 1 ? '' : amt === 2 ? '2' : "'")
}

/** Concatenate all stage moves and cancel redundancies — adjacent same-face
 *  moves (F F' -> nothing, F F -> F2 ...) and same-face moves separated only
 *  by the commuting opposite face (F B F' -> B). Returns the reduced move
 *  list and the per-stage surviving move counts. Non-face tokens act as
 *  barriers and never cancel. */
export function cancelStaged(stages: readonly Stage[]): [string[], number[]] {
  type Item = [number, string | null, number, string]
  const out: Item[] = []
  stages.forEach((st, si) => {
    for (const tok of st.moves) {
      const p = parseFace(tok)
      const item: Item = [si, p ? p[0] : null, p ? p[1] : 0, tok]
      const f = item[1]
      if (f === null) {
        out.push(item)
        continue
      }
      let j = out.length - 1
      while (j >= 0 && out[j][1] === OPP[f]) j--   // skip past commuting opposite face
      if (j >= 0 && out[j][1] === f) {
        const na = (out[j][2] + item[2]) % 4
        if (na === 0) out.splice(j, 1)              // both fully cancel
        else out[j][2] = na                         // merge into the earlier move
      } else {
        out.push(item)
      }
    }
  })
  const moves: string[] = []
  const counts = stages.map(() => 0)
  for (const [si, f, a, raw] of out) {
    const tok = f === null ? raw : build(f, a)
    if (tok) {
      moves.push(tok)
      counts[si]++
    }
  }
  return [moves, counts]
}

/** Optimal x-cross (cross + one F2L pair, jointly) for each of the 4 pairs. */
export function solveXcross(scramble: string, face: CfopFace = 'D', maxSolutions = 2) {
  warmTables()
  const t0 = performance.now()
  const start = f2lFromScramble(remapScramble(scramble, face))
  const solutions = PAIR_NAMES.map((name, pi) => {
    const sols = solvePairs(start, [pi], 14, maxSolutions)
    return {
      pair: name,
      moves: sols[0] ?? [],
      move_count: sols[0]?.length ?? 0,
      alternatives: sols.slice(1),
    }
  })
  solutions.sort((a, b) => a.move_count - b.move_count)
  return { face, rotation: FACE_ROTATION[face], solutions, time_ms: performance.now() - t0 }
}

const PAIR_COMBOS: [number, number][] = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]

/** Optimal double x-cross (cross + TWO pairs, jointly) for each of the 6
 *  pairs-of-pairs; the point is which pairs give a short, worth-doing one. */
export function solveDoubleXcross(scramble: string, face: CfopFace = 'D', maxSolutions = 1, maxDepth = 16) {
  warmTables()
  const t0 = performance.now()
  const start = f2lFromScramble(remapScramble(scramble, face))
  const solutions = PAIR_COMBOS.map(([pi, pj]) => {
    const sols = solvePairs(start, [pi, pj], maxDepth, maxSolutions)
    return {
      pairs: `${PAIR_NAMES[pi]}+${PAIR_NAMES[pj]}`,
      moves: sols[0] ?? [],
      move_count: sols[0]?.length ?? 0,
      found: sols.length > 0,
      alternatives: sols.slice(1),
    }
  })
  // shortest first; any not found (beyond maxDepth) sort last
  solutions.sort((a, b) => (Number(!a.found) - Number(!b.found)) || (a.move_count - b.move_count))
  return { face, rotation: FACE_ROTATION[face], solutions, time_ms: performance.now() - t0 }
}

interface Beam {
  moves: string[]
  stages: Stage[]
  state: F2LState
  solved: number[]
}

function beamScore(b: Beam): number {
  const unsolved = [0, 1, 2, 3].filter(p => !b.solved.includes(p))
  return b.moves.length + (unsolved.length ? heuristic(b.state, unsolved) : 0)
}

export interface CfopResult {
  face: CfopFace
  rotation: string
  stages: Stage[]
  staged_moves: number
  total_moves: number
  solution: string
  time_ms: number
}

export interface CfopOptions {
  beamWidth?: number
  crossAlternatives?: number
  pairVariants?: number
  tryXcross?: boolean
  tryDoubleXcross?: boolean
  doubleXcrossDepth?: number
}

/** Solve one cross face; moves are in the post-rotation frame. */
export function solveCfopFace(scramble: string, face: CfopFace = 'D', opts: CfopOptions = {}): CfopResult {
  const {
    beamWidth = 4, crossAlternatives = 2, pairVariants = 2,
    tryXcross = true, tryDoubleXcross = false, doubleXcrossDepth = 13,
  } = opts
  warmTables()
  const t0 = performance.now()
  const remapped = remapScramble(scramble, face)
  const start = f2lFromScramble(remapped)

  // ── Stage 1: cross starts (plus optional x-cross starts) ──
  const cross = solveCross(remapped, 'D', crossAlternatives)
  let beams: Beam[] = [cross.moves, ...cross.alternatives].map(moves => ({
    moves: [...moves],
    stages: [{ name: 'cross', kind: 'cross', moves: [...moves] }],
    state: applyF2LMoves(start, moves),
    solved: [],
  }))
  if (tryXcross) {
    for (let pi = 0; pi < 4; pi++) {
      for (const sol of solvePairs(start, [pi], 14, 1)) {
        beams.push({
          moves: [...sol],
          stages: [{ name: `x-cross (${PAIR_NAMES[pi]})`, kind: 'xcross', moves: [...sol] }],
          state: applyF2LMoves(start, sol),
          solved: [pi],
        })
      }
    }
  }
  if (tryDoubleXcross) {
    // Seed with short double x-crosses (cross + 2 pairs, jointly); beyond
    // the depth cap it isn't worth doing and the beam falls back.
    const xx: [number, number, string[]][] = []
    for (const [pi, pj] of PAIR_COMBOS) {
      const sols = solvePairs(start, [pi, pj], doubleXcrossDepth, 1)
      if (sols.length) xx.push([pi, pj, sols[0]])
    }
    xx.sort((a, b) => a[2].length - b[2].length)
    for (const [pi, pj, sol] of xx.slice(0, 3)) {
      beams.push({
        moves: [...sol],
        stages: [{ name: `double x-cross (${PAIR_NAMES[pi]}+${PAIR_NAMES[pj]})`, kind: 'xcross', moves: [...sol] }],
        state: applyF2LMoves(start, sol),
        solved: [pi, pj],
      })
    }
  }

  // ── Stage 2: beam search over pair order and solution variants ──
  for (let level = 0; level < 4; level++) {
    const expandable = beams.filter(b => b.solved.length === level)
    const rest = beams.filter(b => b.solved.length !== level)
    const nxt: Beam[] = []
    const seen = new Set<string>()
    for (const b of expandable) {
      for (let pi = 0; pi < 4; pi++) {
        if (b.solved.includes(pi)) continue
        const targets = [...b.solved, pi]
        for (const sol of solvePairs(b.state, targets, 14, pairVariants)) {
          const nb: Beam = {
            moves: [...b.moves, ...sol],
            stages: [...b.stages, { name: `pair ${PAIR_NAMES[pi]}`, kind: 'f2l', moves: [...sol] }],
            state: applyF2LMoves(b.state, sol),
            solved: [...targets].sort((x, y) => x - y),
          }
          const key = `${f2lKey(nb.state)}|${nb.solved.join(',')}|${nb.moves.length}`
          if (!seen.has(key)) {
            seen.add(key)
            nxt.push(nb)
          }
        }
      }
    }
    const scored = nxt.map(b => [beamScore(b), b] as const)
    scored.sort((a, b) => a[0] - b[0])
    beams = [...rest, ...scored.slice(0, beamWidth).map(([, b]) => b)]
  }

  const finished = beams.filter(b => b.solved.length === 4)
  finished.sort((a, b) => a.moves.length - b.moves.length)

  // ── Stage 3: OLL + PLL on the best F2L candidates ──
  let best: Omit<CfopResult, 'time_ms'> | null = null
  for (const b of finished.slice(0, beamWidth)) {
    const full = applyFull(fullFromScramble(remapped), b.moves)
    const oll = solveOll(full)
    if (!oll) continue
    const pll = solvePll(applyFull(full, oll.moves))
    if (!pll) continue
    const stages: Stage[] = [
      ...b.stages.map(s => ({ ...s })),
      { name: oll.case !== 'skip' ? oll.case : 'OLL skip', kind: 'oll', moves: oll.moves },
      { name: pll.case !== 'skip' ? `PLL ${pll.case}` : 'PLL skip', kind: 'pll', moves: pll.moves },
    ]
    const total = [...b.moves, ...oll.moves, ...pll.moves]
    for (const st of stages) st.move_count = st.moves.length
    // Cancel redundant moves across stage boundaries; selection is on the
    // reduced count — the metric a solver actually cares about.
    const [reduced, effCounts] = cancelStaged(stages)
    if (!best || reduced.length < best.total_moves) {
      stages.forEach((st, i) => { st.eff_move_count = effCounts[i] })
      const rotation = FACE_ROTATION[face]
      best = {
        face,
        rotation,
        stages,
        staged_moves: total.length,
        total_moves: reduced.length,
        solution: (rotation ? rotation + ' ' : '') + reduced.join(' '),
      }
    }
  }
  if (!best) throw new Error('CFOP pipeline produced no solution (unexpected)')
  return { ...best, time_ms: performance.now() - t0 }
}

/** face may be a specific face or 'best' (try all 6, return the shortest).
 *  Double x-cross is expensive, so for 'best' it's only tried on the two
 *  strongest faces from the fast pass. */
export function solveCfop(scramble: string, face: CfopFace | 'best' = 'D', opts: CfopOptions = {}): CfopResult {
  if (face !== 'best') return solveCfopFace(scramble, face, opts)
  const t0 = performance.now()
  const results = FACES.map((f, i) => {
    reportProgress(`Trying the cross on ${f} · ${i + 1} of 6`)
    return solveCfopFace(scramble, f, { ...opts, tryDoubleXcross: false })
  })
  results.sort((a, b) => a.total_moves - b.total_moves)
  let best = results[0]
  if (opts.tryDoubleXcross) {
    for (const r of results.slice(0, 2)) {
      const alt = solveCfopFace(scramble, r.face, { ...opts, tryDoubleXcross: true })
      if (alt.total_moves < best.total_moves) best = alt
    }
  }
  return { ...best, time_ms: performance.now() - t0 }
}
