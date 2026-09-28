// Square-1 shape lessons: the shape graph and the words for it.
//
// A layer's shape is its 12 slots read as C (first half of a corner), c
// (second half) and e (edge). Twists are free for shape purposes, so a
// shape is a layer read up to rotation, and a node of the graph is a pair
// (top shape, bottom shape). Slashes are the edges. One BFS from the WCA
// solved state finds every reachable pair, its fewest slashes to cube
// shape, a real scramble that reaches it (so the 3D view can show it) and
// its neighbours; a second BFS gives the fewest slashes to a 4/4 split.

import { CORNER_FIRST, EDGES, SOLVED, applySq1Token, norm, type Sq1Token } from '@/lib/sq1'

export type W = number[]

export const typesOf = (w: W): string =>
  w.map(c => (CORNER_FIRST.has(c) ? 'C' : EDGES.has(c) ? 'e' : 'c')).join('')

const rotate = (layer: string, u: number) => {
  const k = ((u % 12) + 12) % 12
  return layer.slice(12 - k) + layer.slice(0, 12 - k)   // new[i] = old[i-u]
}

export function canon(layer: string): string {
  let best = layer
  for (let u = 1; u < 12; u++) { const r = rotate(layer, u); if (r < best) best = r }
  return best
}

export const keyOf = (w: W) => { const t = typesOf(w); return `${canon(t.slice(0, 12))}|${canon(t.slice(12))}` }
export const cornersIn = (layer: string) => [...layer].filter(x => x === 'C').length

const CUTS: [number, number][] = [[5, 6], [11, 0], [17, 18], [23, 12]]
export const straddles = (w: W): number[] =>
  CUTS.filter(([a, b]) => CORNER_FIRST.has(w[a]) && w[b] === w[a] + 1).map(([a]) => a)
export const slashLegal = (w: W) => straddles(w).length === 0

const twist = (w: W, u: number, d: number) => applySq1Token(w, { kind: 'twist', u, d })
const SLASH: Sq1Token = { kind: 'slash' }

export interface ShapeNode {
  key: string
  depth: number          // fewest slashes to cube shape
  scramble: Sq1Token[]   // from WCA solved to a state with this shape
  next: Set<string>
}

let GRAPH: Map<string, ShapeNode> | null = null
let TO_44: Map<string, number> | null = null

export function shapeGraph(): Map<string, ShapeNode> {
  if (GRAPH) return GRAPH
  const g = new Map<string, ShapeNode>()
  const rep = new Map<string, W>()
  const start = keyOf(SOLVED)
  g.set(start, { key: start, depth: 0, scramble: [], next: new Set() })
  rep.set(start, SOLVED)
  const queue = [start]
  for (let h = 0; h < queue.length; h++) {
    const k = queue[h], node = g.get(k)!, w = rep.get(k)!
    for (let u = 0; u < 12; u++) {
      for (let d = 0; d < 12; d++) {
        const tw = twist(w, u, d)
        if (!slashLegal(tw)) continue
        const w2 = applySq1Token(tw, SLASH)
        const k2 = keyOf(w2)
        node.next.add(k2)
        if (!g.has(k2)) {
          g.set(k2, { key: k2, depth: node.depth + 1, scramble: [...node.scramble, { kind: 'twist', u: norm(u), d: norm(d) }, SLASH], next: new Set() })
          rep.set(k2, w2)
          queue.push(k2)
        }
      }
    }
  }
  GRAPH = g
  return g
}

/** Fewest slashes from each shape to a 4/4 split (4 corners per layer). */
export function depthTo44(): Map<string, number> {
  if (TO_44) return TO_44
  const g = shapeGraph()
  const dist = new Map<string, number>()
  const queue: string[] = []
  for (const k of g.keys()) {
    const [a, b] = k.split('|')
    if (cornersIn(a) === 4 && cornersIn(b) === 4) { dist.set(k, 0); queue.push(k) }
  }
  for (let h = 0; h < queue.length; h++) {
    for (const n of g.get(queue[h])!.next) {
      if (!dist.has(n)) { dist.set(n, dist.get(queue[h])! + 1); queue.push(n) }
    }
  }
  TO_44 = dist
  return dist
}

/** Fewest-slash route from state w down a distance map (twist, slash, …). */
export function routeDown(w: W, dist: (key: string) => number | undefined): Sq1Token[] {
  const out: Sq1Token[] = []
  let cur = w
  let d = dist(keyOf(cur)) ?? 0
  while (d > 0) {
    let stepped = false
    for (let u = 0; u < 12 && !stepped; u++) {
      for (let dd = 0; dd < 12 && !stepped; dd++) {
        const tw = twist(cur, norm(u), norm(dd))
        if (!slashLegal(tw)) continue
        const w2 = applySq1Token(tw, SLASH)
        if (dist(keyOf(w2)) === d - 1) {
          out.push({ kind: 'twist', u: norm(u), d: norm(dd) }, SLASH)
          cur = w2
          d -= 1
          stepped = true
        }
      }
    }
    if (!stepped) break
  }
  return out.filter(t => t.kind === 'slash' || norm(t.u) !== 0 || norm(t.d) !== 0)
}

export const tokensText = (ts: readonly Sq1Token[]) =>
  ts.map(t => (t.kind === 'slash' ? '/' : `(${norm(t.u)},${norm(t.d)})`)).join(' ')

// ── Words for shapes ──────────────────────────────────────────────────────────

const SQUARE = canon('CceCceCceCce')
const STAR = canon('CcCcCcCcCcCc')

/** Edges in each gap between corners, going round — how a 4-corner layer
 *  is recognised (the square is 1·1·1·1). Rotation-free: smallest reading. */
export function gapsOf(layer: string): number[] {
  const c = canon(layer)
  const gaps: number[] = []
  let run = 0
  for (const x of c) {
    if (x === 'C') { gaps.push(run); run = 0 } else if (x === 'e') run++
  }
  gaps[0] += run   // wrap-around: the edges after the last corner
  // smallest rotation of the gap sequence, for a stable name
  let best = gaps
  for (let i = 1; i < gaps.length; i++) {
    const r = [...gaps.slice(i), ...gaps.slice(0, i)]
    if (r.join('') < best.join('')) best = r
  }
  return best
}

export function layerName(layer: string): string {
  const c = canon(layer)
  if (c === SQUARE) return 'square'
  if (c === STAR) return 'star'
  const n = cornersIn(layer)
  return `${n} corners, ${12 - 2 * n} edges`
}

export function layerDetail(layer: string): string {
  const n = cornersIn(layer)
  if (n !== 4) return layerName(layer)
  const c = canon(layer)
  return c === SQUARE ? 'square (gaps 1·1·1·1)' : `gaps ${gapsOf(layer).join('·')}`
}

export const isCubeShape = (w: W) => keyOf(w) === keyOf(SOLVED)

// ── The 4/4 case list for the trainer ────────────────────────────────────────

export interface ShapeCase {
  key: string            // unordered pair key, e.g. 'sq1:CceC…|Ccee…'
  top: string            // canonical layer shapes, top first
  bottom: string
  scramble: string       // reaches this shape from WCA solved
  route: string          // fewest slashes back to cube shape
  slashes: number
}

let CASES: ShapeCase[] | null = null

export function shapeCases(): ShapeCase[] {
  if (CASES) return CASES
  const g = shapeGraph()
  const byPair = new Map<string, ShapeNode>()
  for (const n of g.values()) {
    const [a, b] = n.key.split('|')
    if (cornersIn(a) !== 4 || cornersIn(b) !== 4 || n.depth === 0) continue
    const pair = [a, b].sort().join('|')
    const have = byPair.get(pair)
    // keep the reading with the "smaller" layer on top, so each case looks
    // the same every time
    if (!have || (a <= b && have.key.split('|')[0] > have.key.split('|')[1])) byPair.set(pair, n)
  }
  CASES = [...byPair.entries()].map(([pair, n]) => {
    const [top, bottom] = n.key.split('|')
    let w = SOLVED
    for (const t of n.scramble) w = applySq1Token(w, t)
    const route = routeDown(w, k => g.get(k)?.depth)
    return { key: `sq1:${pair}`, top, bottom, scramble: tokensText(n.scramble), route: tokensText(route), slashes: n.depth }
  }).sort((x, y) => x.slashes - y.slashes || x.key.localeCompare(y.key))
  return CASES
}
