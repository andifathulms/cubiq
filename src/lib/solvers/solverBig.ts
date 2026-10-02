// Big-cube reduction (6x6 and 7x7): centres -> edges -> parity -> 3x3 CFOP.
//
// Centres, face by face (U, D, L, F, R; B follows): greedy macro search.
// Outer turns never break a solved centre (they only spin a face's own
// block), so they are free setups. Each step tries (setup + macro) and
// keeps the one that puts the most target-colour stickers on the face
// while every finished face stays finished. Macros are slice sandwiches
// (slice, outer body, slice back) for bulk moves, and pure 3-cycle
// commutators (a b c b' a' b c' b') that can always place one more
// sticker. Solving the opposite pair first leaves two ADJACENT faces for
// last, where a slice can trade pieces between just them.
//
// Edges: with centres solved, outer turns preserve centres and pairing.
// Centre-safe slice sandwiches (checked on the solved cube) and pure wing
// 3-cycles move wings between edges; each step keeps the candidate that
// most raises how many wings agree with their edge (with its midge on odd
// cubes, with the edge's most common colours on even ones). The last two
// edges are solved exactly by a BFS over their wing slots, and a
// single-slice OLL parity makes the odd single-orbit wing swap that no
// 3-cycle can.
//
// Parity and 3x3: the reduced cube reads off as a 3x3. On even cubes edge
// flip (OLL) and swap (PLL) parity are probed with widened 4x4 algorithms;
// then the two-phase solution is staged into CFOP like the 4x4.

import { FACES, applyPerm, compose, fromScramble, invertMoves, isSolved } from './cubeN'
import { makeBigCube, type BigCube } from './bigcube'
import { solveCfop, type CfopFace } from './cfop'
import { solve3x3Facelet } from './twophase'
import { reportProgress } from './progress'

export interface Stage { name: string; kind: string; moves: string[]; move_count?: number }

const SUF = ['', "'", '2']
const OUTER = FACES.flatMap(f => SUF.map(s => f + s))                                    // 18
const layerOf = (m: string) => m.replace(/('|2)$/, '')
/** "2R" -> "2R'", "2R2" stays, "3Uw'" -> "3Uw" (a leading digit is a layer, not a half turn) */
const inv = (m: string) => (m.endsWith("'") ? m.slice(0, -1) : /^\d?[UDFBRL]w?2$/.test(m) ? m : m + "'")
const invSeq = (seq: readonly string[]) => [...seq].reverse().map(inv)

const OLL_SWAP = "2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2".split(' ')

function makeSolver(B: BigCube) {
  const SLICES = FACES.flatMap(f => B.depths.flatMap(d => SUF.map(s => d + f + s)))
  const SLICE_QUARTERS = SLICES.filter(m => !m.endsWith('2'))
  const MID_SLICES = B.midSlices.flatMap(m => SUF.map(s => m + s))
  const MID_QUARTERS = MID_SLICES.filter(m => !m.endsWith('2'))
  const ALL_CENTER_IDS = B.allCenterIds
  const WING_SLOTS = B.wingSlots
  const EDGE_POS = B.edgePos
  const ORBIT = B.wingOrbit
  const N_W = WING_SLOTS.length
  const WPE = EDGE_POS[0].length
  const MIDGE_STICKERS = B.midges ? B.midges.flat() : []
  const N_ST = B.cube.nStickers
  const IDENT = Int32Array.from({ length: N_ST }, (_, i) => i)
  function permOf(seq: readonly string[]): Int32Array {
    let p: Int32Array = IDENT
    for (const m of seq) {
      const mp = B.cube.moves.get(m)
      if (!mp) throw new Error(`unknown ${B.label} move ${m}`)
      p = compose(p, mp)
    }
    return p
  }

  interface PM { seq: string[]; perm: Int32Array }

  /** Outer-move bodies: single turns and two-turn pairs on different layers. */
  function outerBodies(maxLen: 1 | 2): string[][] {
    const out: string[][] = OUTER.map(m => [m])
    if (maxLen === 2) for (const a of OUTER) for (const b of OUTER) if (layerOf(a) !== layerOf(b)) out.push([a, b])
    return out
  }

  const SETUPS: PM[] = [{ seq: [], perm: IDENT }, ...OUTER.map(m => ({ seq: [m], perm: B.cube.moves.get(m)! }))]
  let SETUPS2: PM[] | null = null
  /** Outer setups up to two turns (for the endgame, where pieces must line
   *  up exactly with a macro's slots). */
  function setups2(): PM[] {
    if (SETUPS2) return SETUPS2
    SETUPS2 = [...SETUPS]
    for (const a of OUTER) for (const b of OUTER) {
      if (layerOf(a) !== layerOf(b)) SETUPS2.push({ seq: [a, b], perm: compose(B.cube.moves.get(a)!, B.cube.moves.get(b)!) })
    }
    return SETUPS2
  }

  // ── Centres ───────────────────────────────────────────────────────────────────

  let CENTRE_MAIN: PM[] | null = null
  let CENTRE_COMM: PM[] | null = null

  function centreLibs(): [PM[], PM[]] {
    if (CENTRE_MAIN && CENTRE_COMM) return [CENTRE_MAIN, CENTRE_COMM]
    const seen = new Set<string>()
    const keyOf = (p: Int32Array) => ALL_CENTER_IDS.map(i => p[i]).join(',')
    const main: PM[] = []
    const add = (lib: PM[], seq: string[]) => {
      const perm = permOf(seq)
      if (!B.fixedCentres.every(i => perm[i] === i)) return
      const k = keyOf(perm)
      if (seen.has(k)) return
      seen.add(k)
      lib.push({ seq, perm })
    }
    // single slices and two-slice blocks (2R 3R together), sandwiching a body
    const openers: string[][] = [
      ...SLICES.map(s => [s]),
      ...MID_SLICES.map(s => [s]),
      ...(B.depths.length > 1 ? FACES.flatMap(f => SUF.map(s => B.depths.map(d => `${d}${f}${s}`))) : []),
    ]
    for (const op of openers) for (const body of outerBodies(2)) add(main, [...op, ...body, ...invSeq(op)])

    // pure 3-cycles: a b c b' a' b c' b' (a, c any slices). On odd cubes the
    // middle slice joins them: the pieces on a face's middle row and column
    // only meet a depth slice there, and a commutator undoes the middle
    // slice — kept only when the fixed centres really come back.
    const comm: PM[] = []
    const COMM_SLICES = [...SLICE_QUARTERS, ...MID_QUARTERS]
    for (const a of COMM_SLICES) {
      for (const c of COMM_SLICES) {
        if (c === a) continue
        for (const b of OUTER) {
          const seq = [a, b, c, inv(b), inv(a), b, inv(c), inv(b)]
          const perm = permOf(seq)
          if (!B.fixedCentres.every(i => perm[i] === i)) continue
          let moved = 0
          for (const i of ALL_CENTER_IDS) if (perm[i] !== i) moved++
          if (moved !== 3) continue
          const k = keyOf(perm)
          if (seen.has(k)) continue
          seen.add(k)
          comm.push({ seq, perm })
        }
      }
    }
    main.sort((x, y) => x.seq.length - y.seq.length)
    CENTRE_MAIN = main
    CENTRE_COMM = comm
    return [main, comm]
  }

  const stateKey = (s: Int8Array) => s.join('')

  /** Greedy: put colour `target` on every centre slot of face `target`,
   *  keeping every face in `keep` solved. */
  function solveCentreFace(state: Int8Array, target: number, keep: number[], maxSteps = 60): string[] | null {
    const [main, comm] = centreLibs()
    const tSlots = B.centerIdx[FACES[target]]
    const kSlots = keep.flatMap(f => B.centerIdx[FACES[f]])
    const kColor = Int8Array.from(keep.flatMap(f => B.centerIdx[FACES[f]].map(() => f)))
    const nT = tSlots.length, nK = kSlots.length
    const srcOf = (lib: PM[]) => {
      const t = new Int16Array(lib.length * nT), k = new Int16Array(lib.length * nK)
      lib.forEach(({ perm }, mi) => {
        for (let j = 0; j < nT; j++) t[mi * nT + j] = perm[tSlots[j]]
        for (let j = 0; j < nK; j++) k[mi * nK + j] = perm[kSlots[j]]
      })
      return { t, k }
    }
    const mainSrc = srcOf(main)
    let commSrc: ReturnType<typeof srcOf> | null = null
    const placed = (st: Int8Array) => { let n = 0; for (const i of tSlots) if (st[i] === target) n++; return n }

    type Cand = { gain: number; cost: number; s: PM; m: PM }
    const A = new Int8Array(N_ST)
    const search = (cur: Int8Array, base: number, lib: PM[], src: { t: Int16Array; k: Int16Array }, minGain: number, zeros?: Cand[]): Cand | null => {
      let best: Cand | null = null
      // when collecting zero-gain reshapes, let gain-0 candidates through
      const maxMiss = nT - base - (zeros ? 0 : minGain)
      for (const s of SETUPS) {
        for (let i = 0; i < N_ST; i++) A[i] = cur[s.perm[i]]
        for (let mi = 0, to = 0, ko = 0; mi < lib.length; mi++, to += nT, ko += nK) {
          let miss = 0
          for (let j = 0; j < nT && miss <= maxMiss; j++) if (A[src.t[to + j]] !== target) miss++
          if (miss > maxMiss) continue
          let ok = true
          for (let j = 0; j < nK; j++) if (A[src.k[ko + j]] !== kColor[j]) { ok = false; break }
          if (!ok) continue
          const gain = nT - miss - base
          const cost = s.seq.length + lib[mi].seq.length
          if (gain > 0) {
            if (!best || gain * 12 - cost > best.gain * 12 - best.cost) best = { gain, cost, s, m: lib[mi] }
          } else if (zeros && zeros.length < 300) zeros.push({ gain, cost, s, m: lib[mi] })
        }
      }
      return best
    }
    const applyCand = (cur: Int8Array, c: Cand) => applyPerm(applyPerm(cur, c.s.perm), c.m.perm)

    let cur = state
    const moves: string[] = []
    const visited = new Set([stateKey(cur)])
    let reshapes = 0
    for (let step = 0; step < maxSteps; step++) {
      const base = placed(cur)
      if (base === nT) return moves
      const zeros: Cand[] = []
      let best = search(cur, base, main, mainSrc, 1, zeros)
      if (!best) best = search(cur, base, comm, (commSrc ??= srcOf(comm)), 1)
      if (!best) {
        // zero-gain reshape that leads to a gain (one-step lookahead)
        if (reshapes++ >= 10) return null
        zeros.sort((a, b) => a.cost - b.cost)
        let chosen: Cand | null = null
        for (const z of zeros.slice(0, 60)) {
          const st2 = applyCand(cur, z)
          if (visited.has(stateKey(st2))) continue
          if (search(st2, placed(st2), main, mainSrc, 1) || search(st2, placed(st2), comm, commSrc!, 1)) { chosen = z; break }
        }
        if (!chosen) return null
        best = chosen
      }
      moves.push(...best.s.seq, ...best.m.seq)
      cur = applyCand(cur, best)
      visited.add(stateKey(cur))
    }
    return null
  }

  function solveCenters(state: Int8Array): Stage[] | null {
    let cur = state
    const stages: Stage[] = []
    const keep: number[] = []
    // opposite pair first, then around the sides: the last two faces (R and
    // B) are then adjacent, so a slice can trade pieces between just them
    // (with R and L last, every slice through both crosses a finished face)
    for (const f of ['U', 'D', 'L', 'F', 'R'] as const) {
      const fi = FACES.indexOf(f)
      reportProgress(`Solving the ${f} centre`)
      const mv = solveCentreFace(cur, fi, keep)
      if (!mv) return null
      cur = B.apply(cur, mv)
      keep.push(fi)
      stages.push({ name: `${f} centre`, kind: 'centers', moves: mv })
    }
    return B.centersSolved(cur) ? stages : null
  }

  // ── Edge pairing ──────────────────────────────────────────────────────────────

  let PAIR_MAIN: PM[] | null = null
  let PAIR_COMM: PM[] | null = null

  const WING_A = WING_SLOTS.map(([a]) => a)
  const WING_B = WING_SLOTS.map(([, b]) => b)

  function wingKey(p: Int32Array): string {
    let s = ''
    for (let w = 0; w < N_W; w++) s += p[WING_A[w]] + ',' + p[WING_B[w]] + ';'
    for (const x of MIDGE_STICKERS) s += p[x] + ';'
    return s
  }

  function centreSafe(perm: Int32Array): boolean {
    for (const i of ALL_CENTER_IDS) if (B.solved[perm[i]] !== B.solved[i]) return false
    return true
  }

  function pairLibs(): [PM[], PM[]] {
    if (PAIR_MAIN && PAIR_COMM) return [PAIR_MAIN, PAIR_COMM]
    const seen = new Set<string>([wingKey(IDENT)])
    const main: PM[] = []
    const add = (lib: PM[], seq: string[]) => {
      const perm = permOf(seq)
      if (!centreSafe(perm)) return
      const k = wingKey(perm)
      if (seen.has(k)) return
      seen.add(k)
      lib.push({ seq, perm })
    }
    const bodies: string[][] = [
      ...outerBodies(2),
      ...OUTER.flatMap(x => OUTER.filter(y => layerOf(y) !== layerOf(x)).map(y => [x, y, inv(x)])),
      ['R', 'U', "R'", 'F', "R'", "F'", 'R'], ["L'", "U'", 'L', "F'", 'L', 'F', "L'"],
    ]
    const openers: string[][] = [
      ...SLICES.map(s => [s]),
      ...(B.depths.length > 1 ? FACES.flatMap(f => SUF.map(s => B.depths.map(d => `${d}${f}${s}`))) : []),
    ]
    for (const op of openers) for (const body of bodies) add(main, [...op, ...body, ...invSeq(op)])

    // pure wing 3-cycles: [slice, outer conjugate] = a (x y x') a' (x y' x'),
    // plus single-orbit parity swaps: the 4x4 OLL parity with one slice depth
    // swaps two wings of that orbit only and keeps the centres (checked), which
    // 3-cycles can never do
    const comm: PM[] = []
    for (const d of B.depths) add(comm, OLL_SWAP.map(m => m.replace(/^2/, d)))
    for (const a of SLICE_QUARTERS) {
      for (const x of OUTER) {
        for (const y of OUTER) {
          if (layerOf(x) === layerOf(y) || y.endsWith('2')) continue
          const B = [x, y, inv(x)]
          add(comm, [a, ...B, inv(a), ...invSeq(B)])
        }
      }
    }
    main.sort((x, y) => x.seq.length - y.seq.length)
    PAIR_MAIN = main
    PAIR_COMM = comm
    return [main, comm]
  }

  // ── Single-orbit wing swaps, placed exactly ────────────────────────────────
  // A pairing can end needing ONE wing swap inside an orbit (an odd
  // permutation), which no 3-cycle gives. The single-slice OLL parity swaps
  // two fixed slots; outer setups carry any two wings of that orbit onto
  // them, and undoing the setup leaves a pure swap of exactly those wings.

  const WING_OF_STICKER = new Map<number, number>()
  WING_SLOTS.forEach(([a], w) => WING_OF_STICKER.set(a, w))
  // Setup turns for the swap: outer turns only. The swap keeps the centres
  // only up to colour (it trades same-colour centre pieces), so a slice setup
  // would carry different colours into those spots.
  const CARRY_MOVES = OUTER
  /** where the wing in slot w goes under move m */
  const WGO: Map<string, Int16Array> = new Map(CARRY_MOVES.map(m => {
    const p = B.cube.moves.get(m)!
    const go = new Int16Array(N_W)
    for (let d = 0; d < N_ST; d++) {
      const w = WING_OF_STICKER.get(p[d])
      if (w !== undefined && WING_OF_STICKER.has(d)) go[w] = WING_OF_STICKER.get(d)!
    }
    return [m, go]
  }))

  interface Swap { seq: string[]; slots: [number, number] }
  let SWAPS: Swap[] | null = null
  function wingSwaps(): Swap[] {
    if (SWAPS) return SWAPS
    // keep each depth's swap only if it really swaps two wings of one orbit
    // and keeps the centres (true for the cubes here; checked, not assumed)
    SWAPS = B.depths.flatMap(d => {
      const seq = OLL_SWAP.map(m => m.replace(/^2/, d))
      const after = B.apply(B.solved, seq)
      const moved = WING_SLOTS.map(([a, b], w) => (after[a] !== B.solved[a] || after[b] !== B.solved[b] ? w : -1)).filter(w => w >= 0)
      const midgesKept = MIDGE_STICKERS.every(x => after[x] === B.solved[x])
      if (moved.length !== 2 || !B.centersSolved(after) || !midgesKept) return []
      return [{ seq, slots: [moved[0], moved[1]] as [number, number] }]
    })
    return SWAPS
  }

  /** Turns taking the wings in slots (x, y) onto (s1, s2) in either order. */
  function carryPair(x: number, y: number, s1: number, s2: number): string[] | null {
    const start = x * N_W + y
    const prev = new Int32Array(N_W * N_W).fill(-1), via = new Int16Array(N_W * N_W)
    prev[start] = start
    const q = [start]
    for (let h = 0; h < q.length; h++) {
      const k = q[h], a = Math.floor(k / N_W), b = k % N_W
      if ((a === s1 && b === s2) || (a === s2 && b === s1)) {
        const path: string[] = []
        for (let c = k; c !== start; c = prev[c]) path.push(CARRY_MOVES[via[c]])
        return path.reverse()
      }
      CARRY_MOVES.forEach((m, mi) => {
        const go = WGO.get(m)!
        const nk = go[a] * N_W + go[b]
        if (prev[nk] === -1) { prev[nk] = k; via[nk] = mi; q.push(nk) }
      })
    }
    return null
  }

  /** An odd wing permutation (one wing must trade with one other) is out of
   *  reach of 3-cycles. Swap the two same-orbit wings of one unpaired edge —
   *  outer setups always reach that — and the rest is even again, which the
   *  3-cycles finish. Picks the swap whose result scores best. */
  function bestSwap(cur: Int8Array, avoid: Set<string>): { moves: string[]; state: Int8Array } | null {
    let best: { score: number; moves: string[]; state: Int8Array } | null = null
    for (const sw of wingSwaps()) {
      const orbit = ORBIT[sw.slots[0]]
      EDGE_POS.forEach((ws, p) => {
        if (B.edgePaired(cur, p)) return
        const [x, y] = ws.filter(w => ORBIT[w] === orbit)
        const setup = carryPair(x, y, sw.slots[0], sw.slots[1])
        if (!setup) return
        const moves = [...setup, ...sw.seq, ...invSeq(setup)]
        const state = B.apply(cur, moves)
        if (!B.centersSolved(state) || avoid.has(stateKey(state))) return
        const score = pairScore(k => state[k])
        if (!best || score > best.score || (score === best.score && moves.length < best.moves.length)) best = { score, moves, state }
      })
    }
    return best
  }

  // ── Last two edges, exactly ────────────────────────────────────────────────
  // With two edges left, search exactly over the wing slots in play. The
  // 3-cycles each touch three different edges, so the search may borrow one
  // already-paired edge and must hand it back paired. Generators: every
  // 3-cycle conjugated by an outer setup (setup, cycle, setup undone) and
  // every in-edge swap, kept when they touch no wing outside the chosen
  // edges. A BFS over those stickers' colours finds the shortest finish.

  const WING_STICKERS = WING_SLOTS.flat()

  // Every 3-cycle conjugated by an outer setup (setup, cycle, setup undone),
  // reduced once to the few wing stickers it moves (midges must stay put).
  // finishEdges then only filters this list.
  interface Gen { moves: string[]; moved: Int16Array }   // [dest, src, dest, src, ...]
  let CONJ: Gen[] | null = null
  function conjGens(): Gen[] {
    if (CONJ) return CONJ
    const [, comm] = pairLibs()
    const out: Gen[] = []
    const seen = new Set<string>()
    for (const su of setups2()) {
      const inv = invSeq(su.seq)
      const sInv = permOf(inv)
      for (const c of comm) {
        const pairs: number[] = []
        let ok = true
        for (const x of MIDGE_STICKERS) if (su.perm[c.perm[sInv[x]]] !== x) { ok = false; break }
        if (!ok) continue
        for (const x of WING_STICKERS) {
          const src = su.perm[c.perm[sInv[x]]]
          if (src !== x) { pairs.push(x, src); if (pairs.length > 16) { ok = false; break } }
        }
        if (!ok || !pairs.length) continue
        const key = pairs.join(',')
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ moves: [...su.seq, ...c.seq, ...inv], moved: Int16Array.from(pairs) })
      }
    }
    CONJ = out
    return out
  }

  function finishEdges(cur: Int8Array, edges: number[], maxDepth: number, maxNodes: number): string[] | null {
    const slots = edges.flatMap(p => EDGE_POS[p])
    const stk = slots.flatMap(w => WING_SLOTS[w])
    const n = stk.length
    const at = new Map(stk.map((x, k) => [x, k]))
    const gens: { moves: string[]; map: Int8Array }[] = []
    const seen = new Set<string>()
    const addMap = (moves: string[], map: Int8Array) => {
      const key = map.join(',')
      if (seen.has(key) || map.every((v, k) => v === k)) return
      seen.add(key)
      gens.push({ moves, map })
    }
    for (const g of conjGens()) {
      const map = Int8Array.from({ length: n }, (_, k) => k)
      let ok = true
      for (let i = 0; i < g.moved.length; i += 2) {
        const d = at.get(g.moved[i]), sIdx = at.get(g.moved[i + 1])
        if (d === undefined || sIdx === undefined) { ok = false; break }
        map[d] = sIdx
      }
      if (ok) addMap(g.moves, map)
    }
    for (const sw of wingSwaps()) {
      for (const p of edges) {
        const [x, y] = EDGE_POS[p].filter(w => ORBIT[w] === ORBIT[sw.slots[0]])
        const setup = carryPair(x, y, sw.slots[0], sw.slots[1])
        if (!setup) continue
        const moves = [...setup, ...sw.seq, ...invSeq(setup)]
        const perm = permOf(moves)
        if (!B.centersSolved(applyPerm(cur, perm))) continue
        const others = [...WING_STICKERS.filter(x => !at.has(x)), ...MIDGE_STICKERS]
        if (others.some(x => perm[x] !== x)) continue
        const map = new Int8Array(n)
        let ok = true
        for (let k = 0; k < n; k++) { const src = at.get(perm[stk[k]]); if (src === undefined) { ok = false; break } map[k] = src }
        if (ok) addMap(moves, map)
      }
    }
    const start = Int8Array.from(stk, x => cur[x])
    // an edge is done when every wing shows its reference colours: the midge
    // (fixed during this search) on odd cubes, the first wing on even ones
    const per = 2 * WPE
    const refs = edges.map(p => (B.midges ? [cur[B.midges[p][0]], cur[B.midges[p][1]]] : null))
    const done = (c: Int8Array) => {
      for (let e = 0; e < edges.length; e++) {
        const o = e * per
        const ra = refs[e] ? refs[e]![0] : c[o], rb = refs[e] ? refs[e]![1] : c[o + 1]
        for (let w = 0; w < WPE; w++) if (c[o + 2 * w] !== ra || c[o + 2 * w + 1] !== rb) return false
      }
      return true
    }
    const key = (c: Int8Array) => c.join(',')
    const prev = new Map<string, [string, number] | null>([[key(start), null]])
    let frontier: Int8Array[] = [start]
    for (let depth = 0; depth <= maxDepth && frontier.length; depth++) {
      const next: Int8Array[] = []
      for (const c of frontier) {
        if (done(c)) {
          const path: string[][] = []
          for (let k = key(c), e = prev.get(k); e; k = e[0], e = prev.get(k)) path.push(gens[e[1]].moves)
          return path.reverse().flat()
        }
        if (depth === maxDepth) continue
        for (let g = 0; g < gens.length; g++) {
          const m = gens[g].map
          const nx = new Int8Array(n)
          for (let k = 0; k < n; k++) nx[k] = c[m[k]]
          const nk = key(nx)
          if (prev.has(nk)) continue
          prev.set(nk, [key(c), g])
          next.push(nx)
          if (prev.size > maxNodes) return null
        }
      }
      frontier = next
    }
    return null
  }

  function finishTwoEdges(cur: Int8Array, P: number, Q: number): string[] | null {
    const direct = finishEdges(cur, [P, Q], 6, 80000)
    if (direct) return direct
    // borrow a paired edge as the third leg of the 3-cycles
    for (let R = 0; R < 12; R++) {
      if (R === P || R === Q || !B.edgePaired(cur, R)) continue
      const fin = finishEdges(cur, [P, Q, R], 4, 25000)
      if (fin) return fin
    }
    return null
  }

  /** Colours an edge should show: its midge (odd) or its most common wing. */
  function edgeTarget(cur: Int8Array, p: number): [number, number] {
    if (B.midges) return [cur[B.midges[p][0]], cur[B.midges[p][1]]]
    const counts = new Map<string, number>()
    for (const w of EDGE_POS[p]) { const k = `${cur[WING_A[w]]},${cur[WING_B[w]]}`; counts.set(k, (counts.get(k) ?? 0) + 1) }
    const [k] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    return k.split(',').map(Number) as [number, number]
  }

  const FAILED_PAIRS = new Set<string>()

  /** Finish the last few edges exactly: all three together when three are
   *  left, else unpaired edges P, Q where P holds a wing Q needs and Q one P
   *  needs (by colour set, either way round), which are solvable on their own. */
  function finishTradingPair(cur: Int8Array): string[] | null {
    const left = EDGE_POS.map((_, p) => p).filter(p => !B.edgePaired(cur, p))
    // three edges trading wings in a cycle: no pair finishes alone, so
    // search all three together
    if (left.length === 3) {
      const memo3 = `${stateKey(cur)}|${left}`
      if (!FAILED_PAIRS.has(memo3)) {
        const fin3 = finishEdges(cur, left, 5, 200000)
        if (fin3) return fin3
        FAILED_PAIRS.add(memo3)
      }
    }
    const shows = (p: number, [a, b]: [number, number]) => EDGE_POS[p].some(w => {
      const x = cur[WING_A[w]], y = cur[WING_B[w]]
      return (x === a && y === b) || (x === b && y === a)
    })
    for (let i = 0; i < left.length; i++) {
      for (let j = i + 1; j < left.length; j++) {
        const P = left[i], Q = left[j]
        if (!shows(P, edgeTarget(cur, Q)) || !shows(Q, edgeTarget(cur, P))) continue
        // a pair that could not be finished from this exact state stays unfinishable
        const memo = `${stateKey(cur)}|${P},${Q}`
        if (FAILED_PAIRS.has(memo)) continue
        const fin = finishTwoEdges(cur, P, Q)
        if (fin) return fin
        FAILED_PAIRS.add(memo)
      }
    }
    return null
  }

  /** Sum over edge positions of how many wings agree with the edge: with its
   *  midge (odd cubes) or its most common colour pair (even cubes). Every
   *  wing agreeing = every edge paired. */
  function pairScore(get: (i: number) => number): number {
    let total = 0
    for (let p = 0; p < 12; p++) {
      const ws = EDGE_POS[p]
      if (B.midges) {
        const ra = get(B.midges[p][0]), rb = get(B.midges[p][1])
        for (const w of ws) if (get(WING_A[w]) === ra && get(WING_B[w]) === rb) total++
        continue
      }
      let best = 1
      for (let i = 0; i < ws.length; i++) {
        const a = get(WING_A[ws[i]]), b = get(WING_B[ws[i]])
        let n = 1
        for (let j = i + 1; j < ws.length; j++) if (get(WING_A[ws[j]]) === a && get(WING_B[ws[j]]) === b) n++
        if (n > best) best = n
      }
      total += best
    }
    return total
  }

  function solvePairingOnce(state: Int8Array, maxSteps: number, rng: () => number): Stage[] | null {
    const [main, comm] = pairLibs()
    const stages: Stage[] = []
    let cur = state
    const visited = new Set([stateKey(cur)])
    let reshapes = 0
    let swaps = 0
    const A = new Int8Array(N_ST)
    type Cand = { gain: number; cost: number; s: PM; m: PM }
    const search = (st: Int8Array, base: number, lib: PM[], zeros?: Cand[], setups: PM[] = SETUPS): Cand | null => {
      let best: Cand | null = null
      for (const s of setups) {
        for (let i = 0; i < N_ST; i++) A[i] = st[s.perm[i]]
        for (const m of lib) {
          const p = m.perm
          const score = pairScore(i => A[p[i]])
          const gain = score - base
          const cost = s.seq.length + m.seq.length
          if (gain > 0) {
            // tiny random tie-break so restarts explore different paths
            const val = gain * 10 - cost + rng() * 0.5
            if (!best || val > best.gain * 10 - best.cost) best = { gain, cost, s, m }
          } else if (gain === 0 && zeros && zeros.length < 400) zeros.push({ gain, cost, s, m })
        }
      }
      return best
    }
    const applyCand = (st: Int8Array, c: Cand) => applyPerm(applyPerm(st, c.s.perm), c.m.perm)
    for (let step = 0; step < maxSteps; step++) {
      const before = B.pairedCount(cur)
      if (before === 12) return stages
      const base = pairScore(i => cur[i])
      const zeros: Cand[] = []
      let best = search(cur, base, main, zeros)
      if (!best) best = search(cur, base, comm)
      if (!best) best = search(cur, base, comm, undefined, setups2())
      if (!best && before >= 8) {
        // finish two edges that trade wings with each other, exactly
        const fin = finishTradingPair(cur)
        if (fin) {
          cur = B.apply(cur, fin)
          stages.push({ name: `pair edges (${before} → ${B.pairedCount(cur)})`, kind: 'pairing', moves: fin })
          continue
        }
      }
      if (!best) {
        // one wing has to trade places with one other: an odd swap
        const sw = swaps++ < 4 ? bestSwap(cur, visited) : null
        if (sw) {
          cur = sw.state
          visited.add(stateKey(cur))
          const after = B.pairedCount(cur)
          stages.push({ name: after > before ? `pair edges (${before} → ${after})` : 'reshape edges', kind: 'pairing', moves: sw.moves })
          continue
        }
      }
      if (!best) {
        if (reshapes++ >= 12) return null
        zeros.sort((a, b) => a.cost - b.cost + (rng() - 0.5))
        let chosen: Cand | null = null
        for (const z of zeros.slice(0, 40)) {
          const st2 = applyCand(cur, z)
          if (visited.has(stateKey(st2))) continue
          const b2 = pairScore(i => st2[i])
          if (search(st2, b2, main) || search(st2, b2, comm)) { chosen = z; break }
        }
        if (!chosen) return null
        best = chosen
      }
      cur = applyCand(cur, best)
      visited.add(stateKey(cur))
      const after = B.pairedCount(cur)
      stages.push({
        name: after > before ? `pair edges (${before} → ${after})` : 'reshape edges',
        kind: 'pairing', moves: [...best.s.seq, ...best.m.seq],
      })
    }
    return null
  }

  function solvePairing(state: Int8Array): Stage[] | null {
    // a few restarts with different tie-breaks if the greedy gets stuck
    for (let r = 0; r < 8; r++) {
      let seed = 12345 + r * 7919
      const rng = r === 0 ? () => 0 : () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
      const out = solvePairingOnce(state, 120, rng)
      if (out) return mergePairingStages(out)
    }
    return null
  }

  /** One stage per newly paired edge group, so the list stays readable. */
  function mergePairingStages(stages: Stage[]): Stage[] {
    const out: Stage[] = []
    let pending: string[] = []
    for (const st of stages) {
      pending.push(...st.moves)
      if (st.name !== 'reshape edges') {
        out.push({ name: st.name, kind: 'pairing', moves: pending })
        pending = []
      }
    }
    if (pending.length) out.push({ name: 'reshape edges', kind: 'pairing', moves: pending })
    return out
  }


  // ── Parity and the 3x3 stage ────────────────────────────────────────────
  // Even cubes: 4x4 parity algorithms with the inner slice widened to every
  // inner slice and Uw to the deepest wide turn, so a whole edge moves like
  // a 4x4 dedge. Odd cubes have no such parity once wings match midges.
  const deepest = B.depths.at(-1)!
  const widen = (s: string) => {
    const m = s.match(/^2([UDFBRL])(.*)$/)
    return m ? B.depths.map(d => `${d}${m[1]}${m[2]}`) : [s.replace(/^Uw/, `${deepest}Uw`)]
  }
  const OLL_PARITY = OLL_SWAP.flatMap(widen)
  const PLL_PARITY = '2R2 U2 2R2 Uw2 2R2 Uw2'.split(' ').flatMap(widen)
  const PARITY_COMBOS: [string, string[]][][] = B.N % 2 === 1 ? [[]] : [
    [],
    [['OLL parity', OLL_PARITY]],
    [['PLL parity', PLL_PARITY]],
    [['OLL parity', OLL_PARITY], ['PLL parity', PLL_PARITY]],
  ]

  return function solve(scramble: string, cfopFace: CfopFace | 'best' = 'D', beamWidth = 4) {
    const t0 = performance.now()
    let state = fromScramble(B.cube, scramble)
    const stages: Stage[] = []

    const centres = solveCenters(state)
    if (!centres) throw new Error(`${B.label} centre solver failed`)
    for (const st of centres) state = B.apply(state, st.moves)
    stages.push(...centres)

    reportProgress('Pairing edges')
    const pairing = solvePairing(state)
    if (!pairing) throw new Error(`${B.label} edge pairing failed`)
    for (const st of pairing) state = B.apply(state, st.moves)
    stages.push(...pairing)
    if (!B.centersSolved(state) || B.pairedCount(state) !== 12) throw new Error(`${B.label} reduction incomplete (unexpected)`)

    reportProgress('Checking parity and solving the 3×3 stage')
    let moves3: string[] | null = null
    for (const fixes of PARITY_COMBOS) {
      let trial = state
      for (const [, alg] of fixes) trial = B.apply(trial, alg)
      if (!(B.centersSolved(trial) && B.pairedCount(trial) === 12)) continue
      moves3 = solve3x3Facelet(B.toFacelet3(trial))
      if (moves3) {
        for (const [name, alg] of fixes) stages.push({ name, kind: 'parity', moves: [...alg] })
        state = trial
        break
      }
    }
    if (!moves3) throw new Error(`${B.label} reduced state unsolvable even after parity fixes`)

    const cfop = solveCfop(invertMoves(moves3).join(' '), cfopFace, { beamWidth, tryXcross: true })
    const rotation = cfop.rotation
    if (rotation) state = B.apply(state, rotation.split(' '))
    for (const st of cfop.stages) {
      state = B.apply(state, st.moves)
      stages.push({ name: st.name, kind: st.kind, moves: st.moves })
    }
    if (!isSolved(B.cube, state)) throw new Error(`${B.label} pipeline finished but the cube is not solved`)

    for (const st of stages) st.move_count = st.moves.length
    const reductionKinds = new Set(['centers', 'pairing', 'parity'])
    const parts: string[] = []
    let usedRotation = false
    for (const st of stages) {
      if (!reductionKinds.has(st.kind) && rotation && !usedRotation) { parts.push(rotation); usedRotation = true }
      parts.push(...st.moves)
    }
    if (rotation && !usedRotation) parts.push(rotation)
    return {
      puzzle: `${B.N}${B.N}${B.N}`,
      rotation,
      cfop_face: cfop.face,
      stages,
      reduction_moves: stages.filter(s => reductionKinds.has(s.kind)).reduce((n, s) => n + s.moves.length, 0),
      total_moves: stages.reduce((n, s) => n + s.moves.length, 0),
      solution: parts.join(' '),
      time_ms: performance.now() - t0,
    }
  }
}

// Each cube's tables and macro libraries are built on its first solve.
let SOLVE6: ReturnType<typeof makeSolver> | null = null
let SOLVE7: ReturnType<typeof makeSolver> | null = null
export const solve666 = (scramble: string, face: CfopFace | 'best' = 'D') => (SOLVE6 ??= makeSolver(makeBigCube(6)))(scramble, face)
export const solve777 = (scramble: string, face: CfopFace | 'best' = 'D') => (SOLVE7 ??= makeSolver(makeBigCube(7)))(scramble, face)
