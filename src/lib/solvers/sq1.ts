// Square-1 solver: optimal shape stage + exact two-phase pieces stage
// (port of cubiq-ml solversq1.py).
//
// Model (matches cubing.js's square1 kpuzzle): 24 individually tracked
// wedges, slots 0-11 top / 12-23 bottom; twist (u, d) rotates the layers,
// slash swaps slots 6-11 with 12-17 and toggles the equator. Corners occupy
// two adjacent wedges, so a slash is legal only when no corner straddles a
// cut boundary: (5|6), (11|0), (17|18), (23|12).
//
// Stage 1 (shape): BFS over wedge-type patterns to cube shape — optimal.
// Stage 2 (pieces): corners home by descending an exact distance table over
// the 8! corner projection, then edges + equator with corner-preserving
// generators over (edge projection, equator). The generator libraries and
// their distance tables were built offline by cubiq-ml (macro search +
// parity primitives) and ship as data/sq1_tables.json.

import tables from './data/sq1_tables.json'
import { rankPerm } from './perm'
import { PyRandom } from './pyrandom'
import { reportProgress } from './progress'

type Token = ['twist', number, number] | ['slash', 0, 0]
type W = number[]

const CORNER_FIRST = new Set([0, 3, 6, 9, 12, 15, 18, 21])
const EDGES = new Set([2, 5, 8, 11, 14, 17, 20, 23])
const SOLVED: W = [...Array(24).keys()]

const mod12 = (x: number) => ((x % 12) + 12) % 12

export function twist(w: W, u: number, d: number): W {
  u = mod12(u)
  d = mod12(d)
  const out = new Array<number>(24)
  for (let i = 0; i < 12; i++) {
    out[i] = w[mod12(i - u)]
    out[12 + i] = w[12 + mod12(i - d)]
  }
  return out
}

const CUTS: [number, number][] = [[5, 6], [11, 0], [17, 18], [23, 12]]
const straddles = (w: W, a: number, b: number) => CORNER_FIRST.has(w[a]) && w[b] === w[a] + 1

function slashLegal(w: W): boolean {
  return !CUTS.some(([a, b]) => straddles(w, a, b))
}

function slash(w: W): W {
  const out = [...w]
  for (let i = 0; i < 6; i++) [out[6 + i], out[12 + i]] = [out[12 + i], out[6 + i]]
  return out
}

function parseScramble(scramble: string): Token[] {
  const out: Token[] = []
  for (const tok of scramble.replaceAll('/', ' / ').split(/\s+/).filter(Boolean)) {
    if (tok === '/') out.push(['slash', 0, 0])
    else if (tok.startsWith('(')) {
      const parts = tok.replace(/^\(+|\)+$/g, '').split(',')
      if (parts.length !== 2 || !parts.every(p => /^[+-]?\d+$/.test(p))) throw new Error(`bad square-1 token '${tok}'`)
      out.push(['twist', Number(parts[0]), Number(parts[1])])
    } else throw new Error(`bad square-1 token '${tok}'`)
  }
  return out
}

function applyTokens(w: W, eq: number, tokens: readonly Token[], check = true): [W, number] {
  for (const [kind, u, d] of tokens) {
    if (kind === 'twist') w = twist(w, u, d)
    else {
      if (check && !slashLegal(w)) throw new Error('illegal slash (corner straddles the cut)')
      w = slash(w)
      eq ^= 1
    }
  }
  return [w, eq]
}

const norm = (x: number) => { x = mod12(x); return x > 6 ? x - 12 : x }
const tokenStr = ([kind, u, d]: Token) => (kind === 'twist' ? `(${norm(u)},${norm(d)})` : '/')

// ── Shape space (type per slot: 0 corner-first, 1 corner-second, 2 edge) ─────

const shapeOf = (w: W) => w.map(p => (CORNER_FIRST.has(p) ? 0 : EDGES.has(p) ? 2 : 1))
const CUBE_SHAPE = shapeOf(SOLVED)
const CUBE_SHAPE_KEY = CUBE_SHAPE.join('')

/** (u, d) twists after which a slash is legal. */
function legalTwists(w: W): [number, number][] {
  const tops: number[] = [], bots: number[] = []
  for (let u = 0; u < 12; u++) {
    const t = twist(w, u, 0)
    if (!straddles(t, 5, 6) && !straddles(t, 11, 0)) tops.push(u)
  }
  for (let d = 0; d < 12; d++) {
    const t = twist(w, 0, d)
    if (!straddles(t, 17, 18) && !straddles(t, 23, 12)) bots.push(d)
  }
  return tops.flatMap(u => bots.map(d => [u, d] as [number, number]))
}

/** Cube shape at ANY layer rotation. */
function isCubeShape(shape: number[]): boolean {
  const baseTop = CUBE_SHAPE.slice(0, 12).join('')
  const rotMatch = (pat: number[]) => {
    for (let r = 0; r < 12; r++) {
      let s = ''
      for (let i = 0; i < 12; i++) s += pat[mod12(i - r)]
      if (s === baseTop) return true
    }
    return false
  }
  return rotMatch(shape.slice(0, 12)) && rotMatch(shape.slice(12))
}

/** Fewest-slash token sequence to cube shape (any layer rotation). */
function solveShape(w: W): Token[] | null {
  const start = shapeOf(w)
  if (isCubeShape(start)) return []
  const startKey = start.join('')
  const prev = new Map<string, [string, [number, number]] | null>([[startKey, null]])
  const reps = new Map<string, W>([[startKey, w]])
  let frontier = [startKey]
  while (frontier.length) {
    const nxt: string[] = []
    for (const sh of frontier) {
      const rep = reps.get(sh)!
      for (const [u, d] of legalTwists(rep)) {
        const w2 = slash(twist(rep, u, d))
        const shape2 = shapeOf(w2)
        const sh2 = shape2.join('')
        if (prev.has(sh2)) continue
        prev.set(sh2, [sh, [u, d]])
        reps.set(sh2, w2)
        if (isCubeShape(shape2)) {
          const path: [number, number][] = []
          for (let cur = sh2; prev.get(cur);) {
            const [p, ud] = prev.get(cur)!
            path.push(ud)
            cur = p
          }
          path.reverse()
          return path.flatMap(([uu, dd]) => [['twist', uu, dd], ['slash', 0, 0]] as Token[])
        }
        nxt.push(sh2)
      }
    }
    frontier = nxt
  }
  return null
}

// ── Exact two-phase piece solving ─────────────────────────────────────────────

const CORNER_SLOTS = [...CORNER_FIRST].sort((a, b) => a - b)
const EDGE_SLOTS = [...EDGES].sort((a, b) => a - b)
const CIDX = new Map(CORNER_SLOTS.map((s, i) => [s, i]))
const EIDX = new Map(EDGE_SLOTS.map((s, i) => [s, i]))

interface Gen { tokens: Token[]; map: number[]; eq: number }
interface PieceTables { cgens: Gen[]; cdist: Int8Array; egens: Gen[]; edist: Int8Array }

function parseTokens(s: string): Token[] {
  return s.split(' ').filter(Boolean).map(t => {
    if (t === '/') return ['slash', 0, 0]
    const [u, d] = t.split(',').map(Number)
    return ['twist', u, d]
  })
}

/** Distance-from-identity over the projected space (generators are
 *  inverse-closed, so distances are symmetric). The shipped tables were
 *  built this way; rebuilding costs seconds (80,640 states x 862
 *  generators), so it only runs in the verification script. */
export function bfsDist(gens: Gen[], useEq: boolean): Int8Array {
  const size = 40320 * (useEq ? 2 : 1)
  const dist = new Int8Array(size).fill(-1)
  const queue: [number[], number][] = [[[0, 1, 2, 3, 4, 5, 6, 7], 0]]
  dist[0] = 0
  for (let head = 0; head < queue.length; head++) {
    const [st, e] = queue[head]
    const idx = useEq ? rankPerm(st, 8) * 2 + e : rankPerm(st, 8)
    for (const g of gens) {
      const ns = g.map.map(m => st[m])
      const ne = useEq ? e ^ g.eq : 0
      const ni = useEq ? rankPerm(ns, 8) * 2 + ne : rankPerm(ns, 8)
      if (dist[ni] < 0) {
        dist[ni] = dist[idx] + 1
        queue.push([ns, ne])
      }
    }
  }
  return dist
}

let TABLES: PieceTables | null = null

export function getTables(): PieceTables {
  if (TABLES) return TABLES
  const t = tables as { cgens: [string, string][]; egens: [string, string, number][]; cdist: string; edist: string }
  const cgens = t.cgens.map(([tok, map]) => ({ tokens: parseTokens(tok), map: [...map].map(Number), eq: 0 }))
  const egens = t.egens.map(([tok, map, eq]) => ({ tokens: parseTokens(tok), map: [...map].map(Number), eq }))
  const digits = (s: string) => Int8Array.from(s, Number)
  TABLES = { cgens, cdist: digits(t.cdist), egens, edist: digits(t.edist) }
  return TABLES
}

function descend(
  w: W, eq: number, gens: Gen[], dist: Int8Array, slots: number[], idxmap: Map<number, number>,
  useEq: boolean, rng: PyRandom | null,
): [Token[], W, number] | null {
  const order = [...gens.keys()]
  if (rng) rng.shuffle(order)
  const tokens: Token[] = []
  for (let step = 0; step < 64; step++) {
    const proj = slots.map(s => idxmap.get(w[s])!)
    const idx = useEq ? rankPerm(proj, 8) * 2 + eq : rankPerm(proj, 8)
    const d0 = dist[idx]
    if (d0 < 0) return null
    if (d0 === 0) return [tokens, w, eq]
    let moved = false
    for (const gi of order) {
      const g = gens[gi]
      const p2 = g.map.map(m => proj[m])
      const e2 = useEq ? eq ^ g.eq : eq
      const i2 = useEq ? rankPerm(p2, 8) * 2 + e2 : rankPerm(p2, 8)
      if (dist[i2] >= 0 && dist[i2] < d0) {
        ;[w, eq] = applyTokens(w, eq, g.tokens)
        tokens.push(...g.tokens)
        moved = true
        break
      }
    }
    if (!moved) return null
  }
  return null
}

/** Corners home via the corner table, then edges + equator via
 *  corner-preserving generators. Phase-1 generator order is reshuffled
 *  between attempts so a phase-2-uncovered endpoint can be routed around. */
function solvePieces(w: W, eq: number, maxAttempts = 25): Token[] | null {
  const T = getTables()
  const rng = new PyRandom(0xc0b1)
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const r1 = descend(w, eq, T.cgens, T.cdist, CORNER_SLOTS, CIDX, false, attempt ? rng : null)
    if (!r1) return null
    const [toks1, w1, eq1] = r1
    const r2 = descend(w1, eq1, T.egens, T.edist, EDGE_SLOTS, EIDX, true, null)
    if (r2) return [...toks1, ...r2[0]]
  }
  return null
}

// Peephole: the generator macros are joined end to end, so adjacent twists
// merge, (0,0) drops and "/ /" cancels (it returns the same state, so no
// slash legality changes).
function simplify(tokens: readonly Token[]): Token[] {
  const out: Token[] = []
  for (const t of tokens) {
    const prev = out.at(-1)
    if (t[0] === 'slash' && prev?.[0] === 'slash') out.pop()
    else if (t[0] === 'twist' && prev?.[0] === 'twist') out[out.length - 1] = ['twist', prev[1] + t[1], prev[2] + t[2]]
    else out.push(t)
    const top = out.at(-1)
    if (top?.[0] === 'twist' && mod12(top[1]) === 0 && mod12(top[2]) === 0) out.pop()
  }
  return out
}

// ── Full solve ────────────────────────────────────────────────────────────────

// The engine's solved state (and cubiq-ml's, which its tables come from) has
// the bottom layer one notch off the WCA solved state: WCA solved is
// twist(SOLVED, 0, 1). Scrambles are read from WCA solved, and the solution
// ends with the (0, 1) that brings the engine's solved state back to it.
const WCA_SOLVED = twist(SOLVED, 0, 1)

export function solveSq1(scramble: string) {
  const t0 = performance.now()
  let [w, eq] = applyTokens(WCA_SOLVED, 0, parseScramble(scramble))

  reportProgress('Finding the shortest route to cube shape')
  let shapeToks = solveShape(w)
  if (!shapeToks) throw new Error('square-1 shape stage failed')
  ;[w, eq] = applyTokens(w, eq, shapeToks)
  // canonicalise the layer alignment (the generators only apply there)
  outer: for (let cu = 0; cu < 12; cu++) {
    for (let cd = 0; cd < 12; cd++) {
      if (shapeOf(twist(w, cu, cd)).join('') === CUBE_SHAPE_KEY) {
        if (cu !== 0 || cd !== 0) {
          shapeToks = [...shapeToks, ['twist', cu, cd]]
          w = twist(w, cu, cd)
        }
        break outer
      }
    }
  }
  const stages: { name: string; kind: string; moves: string[]; move_count?: number }[] = [
    { name: 'cube shape', kind: 'shape', moves: simplify(shapeToks).map(tokenStr) },
  ]

  reportProgress('Solving the pieces')
  const pieceToks = solvePieces(w, eq)
  if (!pieceToks) throw new Error('square-1 pieces stage failed')
  const last = pieceToks.at(-1)
  if (last?.[0] !== 'twist') pieceToks.push(['twist', 0, 1])
  else if (mod12(last[1]) === 0 && mod12(last[2] + 1) === 0) pieceToks.pop()
  else pieceToks[pieceToks.length - 1] = ['twist', last[1], last[2] + 1]
  const pieceMoves = simplify(pieceToks)
  ;[w, eq] = applyTokens(w, eq, pieceMoves)
  stages.push({ name: 'pieces', kind: 'pieces', moves: pieceMoves.map(tokenStr) })

  if (w.some((x, i) => x !== WCA_SOLVED[i]) || eq !== 0) throw new Error('square-1 pipeline finished unsolved')

  for (const st of stages) st.move_count = st.moves.filter(m => m === '/').length
  return {
    puzzle: 'sq1',
    stages,
    total_moves: stages.reduce((n, st) => n + (st.move_count ?? 0), 0),   // slash count
    solution: stages.flatMap(st => st.moves).join(' '),
    time_ms: performance.now() - t0,
  }
}
