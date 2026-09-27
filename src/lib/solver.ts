import type { CrossSolution } from '@/types'
import { solveAllCrosses as solveAllCrossesCore } from '@/lib/solvers/cross'

// Optimal cross for every face. The exact 331,776-state tables are small
// enough (a few ms each) to build on the main thread; the core lives in
// src/lib/solvers/cross.ts, shared with the worker's CFOP pipeline.
export async function solveAllCrosses(scramble: string, maxAlternatives = 3): Promise<CrossSolution[]> {
  return solveAllCrossesCore(scramble, maxAlternatives)
}
