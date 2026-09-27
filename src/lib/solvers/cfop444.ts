// Full 4x4 solve pipeline (port of cubiq-ml cfop444.py), reduction method:
//   centres -> edge pairing -> [parity fixes] -> 3x3 stage (staged CFOP)
//
// After reduction the cube reads off as a 3x3 facelet string. Reduction
// can leave OLL parity (one flipped dedge) or PLL parity (two swapped
// dedges), which no 3x3 can reach; the 3x3 solver rejects those facelets,
// so we probe: try directly, then with the OLL parity alg, the PLL parity
// alg, then both (all preserve centres and pairing).
//
// The 3x3 stage reuses the staged CFOP solver: the two-phase solver gives
// some solution S of the reduced state; inverse(S) is a virtual 3x3
// scramble producing that state, which solveCfop decomposes into
// cross/F2L/OLL/PLL. Outer 3x3 moves map 1:1 to 4x4 outer moves.

import { invertMoves, isSolved } from './cubeN'
import { CUBE4, allPaired, apply4, centersSolved, toFacelet3 } from './cube444'
import { OLL_PARITY, PLL_PARITY, solveCenters, solvePairing, type Stage } from './solver444'
import { solveCfop, type CfopFace } from './cfop'
import { solve3x3Facelet } from './twophase'
import { fromScramble } from './cubeN'

const PARITY_COMBOS: [string, string[]][][] = [
  [],
  [['OLL parity', OLL_PARITY]],
  [['PLL parity', PLL_PARITY]],
  [['OLL parity', OLL_PARITY], ['PLL parity', PLL_PARITY]],
]

export function solve444(scramble: string, cfopFace: CfopFace | 'best' = 'D', beamWidth = 4, tryXcross = true) {
  const t0 = performance.now()
  let state = fromScramble(CUBE4, scramble)
  const stages: Stage[] = []

  // ── Stage 1: centres ──
  const centerStages = solveCenters(state)
  if (!centerStages) throw new Error('center solver failed')
  for (const st of centerStages) state = apply4(state, st.moves)
  stages.push(...centerStages)
  if (!centersSolved(state)) throw new Error('centers not solved (unexpected)')

  // ── Stage 2: edge pairing ──
  const pairingStages = solvePairing(state)
  if (!pairingStages) throw new Error('edge pairing failed')
  for (const st of pairingStages) state = apply4(state, st.moves)
  stages.push(...pairingStages)
  if (!centersSolved(state) || !allPaired(state)) throw new Error('reduction incomplete (unexpected)')

  // ── Stage 3: parity probe + 3x3 solution ──
  let moves3: string[] | null = null
  for (const fixes of PARITY_COMBOS) {
    let trial = state
    for (const [, alg] of fixes) trial = apply4(trial, alg)
    if (!(centersSolved(trial) && allPaired(trial))) continue
    moves3 = solve3x3Facelet(toFacelet3(trial))
    if (moves3) {
      for (const [name, alg] of fixes) stages.push({ name, kind: 'parity', moves: [...alg] })
      state = trial
      break
    }
  }
  if (!moves3) throw new Error('reduced state unsolvable even after parity fixes')

  // ── Stage 4: staged 3x3 CFOP on the reduced cube ──
  const cfop = solveCfop(invertMoves(moves3).join(' '), cfopFace, { beamWidth, tryXcross })
  const rotation = cfop.rotation
  if (rotation) state = apply4(state, rotation.split(' '))
  for (const st of cfop.stages) {
    state = apply4(state, st.moves)
    stages.push({ name: st.name, kind: st.kind, moves: st.moves })
  }
  if (!isSolved(CUBE4, state)) throw new Error('pipeline finished but cube is not solved')

  for (const st of stages) st.move_count = st.moves.length
  const reductionKinds = new Set(['centers', 'pairing', 'parity'])
  const solutionParts: string[] = []
  let consumedRotation = false
  for (const st of stages) {
    if (!reductionKinds.has(st.kind) && rotation && !consumedRotation) {
      solutionParts.push(rotation)
      consumedRotation = true
    }
    solutionParts.push(...st.moves)
  }
  if (rotation && !consumedRotation) solutionParts.push(rotation)

  return {
    puzzle: '444',
    rotation,
    cfop_face: cfop.face,
    stages,
    reduction_moves: stages.filter(s => reductionKinds.has(s.kind)).reduce((n, s) => n + s.moves.length, 0),
    total_moves: stages.reduce((n, s) => n + s.moves.length, 0),
    solution: solutionParts.join(' '),
    time_ms: performance.now() - t0,
  }
}
