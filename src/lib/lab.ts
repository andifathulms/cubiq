// Solve Lab: one description of every solver, and one normalised result
// shape so a single view (timeline, stage rows, player) serves them all.

import type { SolverEndpoint } from '@/lib/solvers/protocol'

export interface LabStage {
  name: string
  kind: string
  moves: string[]      // as displayed
  play: string[]       // as animated (a rotation prefix goes in front of the first 3x3 stage)
  count: number        // moves (or slashes) this stage adds
}

export interface LabResult {
  stages: LabStage[]
  total: number
  unit: 'moves' | 'slashes'
  rotation: string
  solution: string
  summary: string
  alternatives: string[][]
  optimal: boolean
  timeMs: number
}

export interface Method {
  id: string
  label: string
  endpoint: SolverEndpoint
  body?: Record<string, unknown>
  description: string
}

export interface PuzzleLab {
  id: string
  label: string
  twisty: string
  methods: Method[]
}

export const LAB: PuzzleLab[] = [
  {
    id: '333', label: '3×3', twisty: '3x3x3', methods: [
      { id: 'cfop', label: 'CFOP', endpoint: '/solve/cfop', description: 'Cross (or x-cross), four F2L pairs, OLL and PLL. Each stage is optimal; a beam search picks the cross, pair order and variants with the fewest total moves.' },
      { id: 'cross', label: 'Cross & x-cross', endpoint: '/solve/xcross', description: 'The optimal cross for every colour, with x-cross and double x-cross on demand — the planning part of inspection.' },
      { id: 'twophase', label: 'Two-phase', endpoint: '/solve', description: 'Kociemba-style two-phase search (min2phase): a complete solution in about 20 moves, found in milliseconds. Short, but not a human method.' },
    ],
  },
  { id: '222', label: '2×2', twisty: '2x2x2', methods: [{ id: 'optimal', label: 'Optimal', endpoint: '/solve/222', description: 'Every 2×2 position is precomputed (3.67M states), so the solution is provably optimal — never more than 11 moves.' }] },
  { id: '444', label: '4×4', twisty: '4x4x4', methods: [{ id: 'reduction', label: 'Reduction', endpoint: '/solve/444', body: { cfop_face: 'D' }, description: 'Centres, then edge pairing, parity fixes if needed, and a CFOP finish on the reduced cube.' }] },
  { id: '555', label: '5×5', twisty: '5x5x5', methods: [{ id: 'reduction', label: 'Reduction', endpoint: '/solve/555', description: 'Both centre orbits, wing attachment into edge groups, then a CFOP finish. The first solve builds several tables.' }] },
  { id: '666', label: '6×6', twisty: '6x6x6', methods: [{ id: 'reduction', label: 'Reduction', endpoint: '/solve/666', body: { cfop_face: 'D' }, description: 'All four centre orbits face by face, every edge built from its four wings, parity fixes if needed, then a CFOP finish. The first solve builds several tables.' }] },
  { id: 'pyram', label: 'Pyraminx', twisty: 'pyraminx', methods: [{ id: 'optimal', label: 'Optimal', endpoint: '/solve/pyram', description: 'The whole 933,120-state core is precomputed: an optimal core solution (≤ 11 moves) plus tip turns.' }] },
  { id: 'skewb', label: 'Skewb', twisty: 'skewb', methods: [{ id: 'optimal', label: 'Optimal', endpoint: '/solve/skewb', description: 'All 3,149,280 Skewb positions are precomputed — provably optimal, never more than 11 moves.' }] },
  { id: 'minx', label: 'Megaminx', twisty: 'megaminx', methods: [{ id: 'lbl', label: 'Layer by layer', endpoint: '/solve/minx', description: 'Star, then each band of edges and corners placed by search, then a last layer from discovered commutators.' }] },
  { id: 'sq1', label: 'Square-1', twisty: 'square1', methods: [{ id: 'shape', label: 'Shape, then pieces', endpoint: '/solve/sq1', description: 'The fewest slashes back to cube shape, then corners and edges by exact table descent.' }] },
]

export const LAB_BY_ID: Record<string, PuzzleLab> = Object.fromEntries(LAB.map(p => [p.id, p]))

const REDUCTION_KINDS = new Set(['centers', 'pairing', 'parity'])

interface RawStage { name: string; kind: string; moves: string[]; move_count?: number; eff_move_count?: number }
interface RawStaged { stages: RawStage[]; total_moves: number; solution: string; rotation?: string; time_ms: number; face?: string; staged_moves?: number }
interface RawOptimal { moves: string[]; move_count: number; alternatives?: string[][]; time_ms: number }

/** Normalise any solver response. */
export function normalise(puzzle: string, method: Method, raw: unknown): LabResult {
  if ((raw as RawStaged).stages) {
    const r = raw as RawStaged
    const rotation = r.rotation ?? ''
    let rotated = false
    const stages: LabStage[] = r.stages.map(s => {
      let play = s.moves
      if (rotation && !rotated && !REDUCTION_KINDS.has(s.kind)) { play = [rotation, ...s.moves]; rotated = true }
      const count = puzzle === 'sq1' ? s.moves.filter(m => m === '/').length : s.moves.length
      return { name: s.name, kind: s.kind, moves: s.moves, play, count }
    })
    const unit = puzzle === 'sq1' ? 'slashes' : 'moves'
    const cancelled = r.staged_moves && r.staged_moves > r.total_moves ? ` · ${r.staged_moves - r.total_moves} cancelled` : ''
    const summary = [
      r.face ? `cross on ${r.face}` : null,
      rotation ? `rotate ${rotation} first` : null,
      `${r.total_moves} ${unit}${cancelled}`,
    ].filter(Boolean).join(' · ')
    return { stages, total: r.total_moves, unit, rotation, solution: r.solution, summary, alternatives: [], optimal: false, timeMs: r.time_ms }
  }
  const r = raw as RawOptimal
  const optimal = method.id === 'optimal'
  return {
    stages: [{ name: optimal ? 'Optimal solution' : 'Solution', kind: optimal ? 'optimal' : 'solution', moves: r.moves, play: r.moves, count: r.moves.length }],
    total: r.move_count, unit: 'moves', rotation: '', solution: r.moves.join(' '),
    summary: `${r.move_count} moves${optimal ? ' · optimal' : ''}`,
    alternatives: r.alternatives ?? [], optimal, timeMs: r.time_ms,
  }
}

/** Colour per stage kind (sticker colours as data). */
export const KIND_COLOR: Record<string, string> = {
  cross: 'var(--st-U)', xcross: 'var(--st-U)', f2l: 'var(--st-F)', oll: 'var(--st-D)', pll: 'var(--st-B)',
  centers: 'var(--st-R)', pairing: 'var(--st-L)', parity: 'var(--stop)',
  placement: 'var(--st-F)', ll: 'var(--st-D)', shape: 'var(--st-B)', pieces: 'var(--st-F)',
  optimal: 'var(--go)', solution: 'var(--go)',
}
