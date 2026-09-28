// Megaminx layer-by-layer solver: greedy piece placement + macro last layer
// (port of cubiq-ml solvermega.py).
//
// Pieces below the last layer are placed one at a time (easiest first
// within each class) by IDA* over the 48 face moves. The heuristic is the
// max over every already-solved piece plus the target of exact single-piece
// and pairwise (target, solved piece) distance tables — admissible, so each
// placement is optimal given the order. Solve order mirrors the human
// method: star edges (D) -> D corners -> lower-band edges -> low-mid
// corners -> middle edges -> high-mid corners -> upper-band edges -> LL.

import {
  CORNER_CLASSES, CORNER_DIST, CORNER_FACES, CTRANS, EDGE_CLASSES, EDGE_DIST, EDGE_FACES, ETRANS,
  FACE_MOVES, SOLVED_C, SOLVED_E, U_ADJ, applyMega, canonicalize, parseScramble, solvedMega,
  type MegaState,
} from './megaengine'
import { LLSolver } from './megall'
import { reportProgress } from './progress'

type Kind = 'edge' | 'corner'
const FACE_OF: Record<string, string> = Object.fromEntries(FACE_MOVES.map(m => [m, m.replace(/['2]+$/, '')]))

// ── Pairwise joint distance tables (exact, lazy) ─────────────────────────────
// dist[subA*60 + subB] over the 48 face moves: captures "placing A forces
// breaking and restoring B".
const PAIR_CACHE = new Map<string, Uint8Array>()
const FM_E = FACE_MOVES.map(m => ETRANS[m])
const FM_C = FACE_MOVES.map(m => CTRANS[m])

function pairTable(kindA: Kind, pa: number, kindB: Kind, pb: number): Uint8Array {
  const key = `${kindA}${pa}:${kindB}${pb}`
  const cached = PAIR_CACHE.get(key)
  if (cached) return cached
  const ta = kindA === 'edge' ? FM_E : FM_C
  const tb = kindB === 'edge' ? FM_E : FM_C
  const home = pa * (kindA === 'edge' ? 2 : 3) * 60 + pb * (kindB === 'edge' ? 2 : 3)
  const dist = new Uint8Array(3600).fill(255)
  dist[home] = 0
  const queue = new Int32Array(3600)
  queue[0] = home
  let tail = 1
  for (let head = 0; head < tail; head++) {
    const s = queue[head]
    const sa = Math.floor(s / 60), sb = s % 60
    const d = dist[s] + 1
    for (let m = 0; m < ta.length; m++) {
      const ns = ta[m][sa] * 60 + tb[m][sb]
      if (dist[ns] === 255) {
        dist[ns] = d
        queue[tail++] = ns
      }
    }
  }
  PAIR_CACHE.set(key, dist)
  return dist
}

// (class name, kind, pieces) in solve order — the LL is handled separately
const PLACEMENT_PLAN: [string, Kind, number[]][] = [
  ['star', 'edge', EDGE_CLASSES.star],
  ['bottom corners', 'corner', CORNER_CLASSES.bottom],
  ['lower band', 'edge', EDGE_CLASSES.lower],
  ['low-mid corners', 'corner', CORNER_CLASSES.lowmid],
  ['middle band', 'edge', EDGE_CLASSES.middle],
  ['high-mid corners', 'corner', CORNER_CLASSES.highmid],
  ['upper band', 'edge', EDGE_CLASSES.upper],
]

class OutOfBudget extends Error {}

function place(
  state: MegaState, solvedE: number[], solvedC: number[], target: number, kind: Kind,
  moves: readonly string[], maxDepth = 9, nodeBudget = 250_000,
): string[] | null {
  const nE = solvedE.length, nC = solvedC.length
  const eSubs0 = solvedE.map(p => state.edges[p])
  const cSubs0 = solvedC.map(p => state.corners[p])
  const tSub0 = kind === 'edge' ? state.edges[target] : state.corners[target]
  const tRow = (kind === 'edge' ? EDGE_DIST : CORNER_DIST)[target]
  const eRows = solvedE.map(p => EDGE_DIST[p])
  const cRows = solvedC.map(p => CORNER_DIST[p])
  const PE = solvedE.map(p => pairTable(kind, target, 'edge', p))
  const PC = solvedC.map(p => pairTable(kind, target, 'corner', p))
  const etr = moves.map(m => ETRANS[m])
  const ctr = moves.map(m => CTRANS[m])
  const ttr = kind === 'edge' ? etr : ctr
  const faces = moves.map(m => FACE_OF[m])
  const path: string[] = []

  const hOf = (eSubs: number[], cSubs: number[], tSub: number): number => {
    let h = tRow[tSub]
    const tBase = tSub * 60
    for (let i = 0; i < nE; i++) {
      const s = eSubs[i]
      if (eRows[i][s] > h) h = eRows[i][s]
      if (PE[i][tBase + s] > h) h = PE[i][tBase + s]
    }
    for (let i = 0; i < nC; i++) {
      const s = cSubs[i]
      if (cRows[i][s] > h) h = cRows[i][s]
      if (PC[i][tBase + s] > h) h = PC[i][tBase + s]
    }
    return h
  }

  let budget = nodeBudget
  const dfs = (eSubs: number[], cSubs: number[], tSub: number, depth: number, bound: number, lastFace: string): boolean => {
    if (--budget <= 0) throw new OutOfBudget()
    const children: [number, number, number[], number[], number][] = []
    for (let mi = 0; mi < moves.length; mi++) {
      if (faces[mi] === lastFace) continue
      const et = etr[mi], ct = ctr[mi]
      const ne = eSubs.map(x => et[x])
      const nc = cSubs.map(x => ct[x])
      const nt = ttr[mi][tSub]
      if (nt === tSub && ne.every((x, i) => x === eSubs[i]) && nc.every((x, i) => x === cSubs[i])) continue
      const h = hOf(ne, nc, nt)
      if (depth + 1 + h > bound) continue
      children.push([h, mi, ne, nc, nt])
    }
    children.sort((a, b) => a[0] - b[0])
    for (const [h, mi, ne, nc, nt] of children) {
      path.push(moves[mi])
      if (h === 0) return true
      if (dfs(ne, nc, nt, depth + 1, bound, faces[mi])) return true
      path.pop()
    }
    return false
  }

  const h0 = hOf(eSubs0, cSubs0, tSub0)
  if (h0 === 0) return []
  try {
    for (let bound = h0; bound <= maxDepth; bound++) {
      path.length = 0
      if (dfs(eSubs0, cSubs0, tSub0, 0, bound, '')) return [...path]
    }
  } catch (e) {
    if (e instanceof OutOfBudget) return null
    throw e
  }
  return null
}

/** Tiered alphabets: local faces first (human-style insertions), widening
 *  on failure. Restricted alphabets stay admissible because the distance
 *  tables are computed over the full move set. */
function tieredPlace(cur: MegaState, solvedE: number[], solvedC: number[], target: number, kind: Kind, moves: readonly string[]): string[] | null {
  let local: Set<string>
  if (kind === 'edge') {
    const curSlot = Math.floor(cur.edges[target] / 2)
    local = new Set([...EDGE_FACES[target], ...EDGE_FACES[curSlot], 'U'])
  } else {
    const curSlot = Math.floor(cur.corners[target] / 3)
    local = new Set([...CORNER_FACES[target], ...CORNER_FACES[curSlot], 'U'])
  }
  const tier1 = moves.filter(m => local.has(FACE_OF[m]))
  const tier2 = moves.filter(m => local.has(FACE_OF[m]) || U_ADJ.has(FACE_OF[m]))
  for (const [alphabet, depth, budget] of [[tier1, 8, 80_000], [tier2, 8, 150_000], [moves, 10, 500_000]] as const) {
    const sol = place(cur, solvedE, solvedC, target, kind, alphabet, depth, budget)
    if (sol !== null) return sol
  }
  return null
}

function placeWithFallbacks(cur: MegaState, solvedE: number[], solvedC: number[], target: number, kind: Kind, moves: readonly string[]): string[] | null {
  const sol = tieredPlace(cur, solvedE, solvedC, target, kind, moves)
  if (sol !== null) return sol
  // last resort: temporarily un-preserve one solved piece (the blocker),
  // place the target, then re-place the dropped piece
  const droppables: [Kind, number][] = [
    ...solvedE.map(p => ['edge', p] as [Kind, number]),
    ...solvedC.map(p => ['corner', p] as [Kind, number]),
  ]
  for (const [dk, dp] of droppables.reverse().slice(0, 8)) {   // most recently solved first
    const se = solvedE.filter(p => !(dk === 'edge' && p === dp))
    const sc = solvedC.filter(p => !(dk === 'corner' && p === dp))
    const sol1 = tieredPlace(cur, se, sc, target, kind, moves)
    if (sol1 === null) continue
    const mid = applyMega(cur, sol1)
    const se2 = kind === 'edge' ? [...se, target] : se
    const sc2 = kind === 'corner' ? [...sc, target] : sc
    const sol2 = tieredPlace(mid, se2, sc2, dp, dk, moves)
    if (sol2 !== null) return [...sol1, ...sol2]
  }
  return null
}

type Stage = { name: string; kind: string; moves: string[]; move_count?: number }

/** Place everything below the last layer. */
function solvePlacement(state: MegaState): [Stage[], MegaState] | null {
  let cur = state
  const solvedE: number[] = []
  const solvedC: number[] = []
  const stages: Stage[] = []
  for (const [name, kind, pieces] of PLACEMENT_PLAN) {
    reportProgress(`Placing the ${name}`)
    // D moves are useless once the D layer is done
    const moves = name === 'star' || name === 'bottom corners'
      ? FACE_MOVES : FACE_MOVES.filter(m => FACE_OF[m] !== 'D')
    const remaining = [...pieces]
    const stageMoves: string[] = []
    while (remaining.length) {
      // easiest first: smallest current exact distance
      const curDist = (p: number) => kind === 'edge' ? EDGE_DIST[p][cur.edges[p]] : CORNER_DIST[p][cur.corners[p]]
      remaining.sort((a, b) => curDist(a) - curDist(b))
      const target = remaining.shift()!
      const sol = placeWithFallbacks(cur, solvedE, solvedC, target, kind, moves)
      if (sol === null) return null
      cur = applyMega(cur, sol)
      stageMoves.push(...sol)
      if (kind === 'edge') solvedE.push(target)
      else solvedC.push(target)
    }
    stages.push({ name, kind: 'placement', moves: stageMoves })
  }
  return [stages, cur]
}

let LL: LLSolver | null = null

export function solveMega(scramble: string) {
  const t0 = performance.now()
  const state = applyMega(solvedMega(), parseScramble(scramble))
  const [canon, ftrans] = canonicalize(state)

  const placed = solvePlacement(canon)
  if (!placed) throw new Error('megaminx placement failed')
  let [stages, cur] = placed

  if (!LL) reportProgress('Building last-layer macros')
  LL ??= new LLSolver()
  reportProgress('Solving the last layer')
  const llStages = LL.solve(cur)
  if (!llStages) throw new Error('megaminx last layer not covered (unexpected)')
  for (const st of llStages) cur = applyMega(cur, st.moves)
  stages = [...stages, ...llStages]

  if (!cur.edges.every((x, i) => x === SOLVED_E[i]) || !cur.corners.every((x, i) => x === SOLVED_C[i])) {
    throw new Error('megaminx pipeline finished unsolved')
  }

  // translate canonical-frame moves into the original frame
  for (const st of stages) {
    st.moves = st.moves.map(m => ftrans[m])
    st.move_count = st.moves.length
  }
  return {
    puzzle: 'minx',
    stages,
    total_moves: stages.reduce((n, st) => n + st.moves.length, 0),
    solution: stages.flatMap(st => st.moves).join(' '),
    time_ms: performance.now() - t0,
  }
}
