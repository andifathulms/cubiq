// Shared 3x3 piece model (port of cubiq-ml solver.py + the corner tables of
// f2l.py). Pieces are tracked as sub-states: edges slot*2+ori (24 values),
// corners slot*3+ori (24 values). Transition tables map a sub-state to its
// value after one of the 18 face moves.

export const ALL_MOVES = [
  'U', "U'", 'U2', 'D', "D'", 'D2', 'F', "F'", 'F2',
  'B', "B'", 'B2', 'R', "R'", 'R2', 'L', "L'", 'L2',
] as const

export const MOVE_INDEX: Record<string, number> = Object.fromEntries(ALL_MOVES.map((m, i) => [m, i]))
/** 0..5 = U D F B R L — consecutive moves on the same face are redundant */
export const MOVE_FACE: number[] = ALL_MOVES.map(m => 'UDFBRL'.indexOf(m[0]))

// Edge slots follow cubing.js order: UF UR UB UL DF DR DB DL FR FL BR BL.
// perm[new_slot] = old_slot, ori[new_slot] = orientation delta at new_slot.
const EDGE_MOVES: Record<string, [number[], number[]]> = {
  'U':  [[1, 2, 3, 0, 4, 5, 6, 7, 8, 9, 10, 11], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  "U'": [[3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  'U2': [[2, 3, 0, 1, 4, 5, 6, 7, 8, 9, 10, 11], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  'D':  [[0, 1, 2, 3, 7, 4, 5, 6, 8, 9, 10, 11], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  "D'": [[0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  'D2': [[0, 1, 2, 3, 6, 7, 4, 5, 8, 9, 10, 11], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  'F':  [[9, 1, 2, 3, 8, 5, 6, 7, 0, 4, 10, 11], [1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0]],
  "F'": [[8, 1, 2, 3, 9, 5, 6, 7, 4, 0, 10, 11], [1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0]],
  'F2': [[4, 1, 2, 3, 0, 5, 6, 7, 9, 8, 10, 11], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  'B':  [[0, 1, 10, 3, 4, 5, 11, 7, 8, 9, 6, 2], [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1]],
  "B'": [[0, 1, 11, 3, 4, 5, 10, 7, 8, 9, 2, 6], [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1]],
  'B2': [[0, 1, 6, 3, 4, 5, 2, 7, 8, 9, 11, 10], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  'R':  [[0, 8, 2, 3, 4, 10, 6, 7, 5, 9, 1, 11], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  "R'": [[0, 10, 2, 3, 4, 8, 6, 7, 1, 9, 5, 11], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  'R2': [[0, 5, 2, 3, 4, 1, 6, 7, 10, 9, 8, 11], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  'L':  [[0, 1, 2, 11, 4, 5, 6, 9, 8, 3, 10, 7], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  "L'": [[0, 1, 2, 9, 4, 5, 6, 11, 8, 7, 10, 3], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
  'L2': [[0, 1, 2, 7, 4, 5, 6, 3, 8, 11, 10, 9], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
}

/** EDGE_TRANS[move][slot*2+ori] = sub-state after the move */
export const EDGE_TRANS: Int32Array[] = ALL_MOVES.map(m => {
  const [perm, ori] = EDGE_MOVES[m]
  const inv = new Array<number>(12)
  for (let i = 0; i < 12; i++) inv[perm[i]] = i
  const t = new Int32Array(24)
  for (let slot = 0; slot < 12; slot++) {
    for (let o = 0; o < 2; o++) {
      const ns = inv[slot]
      t[slot * 2 + o] = ns * 2 + ((o + ori[ns]) % 2)
    }
  }
  return t
})

// Corner slots (Kociemba order) UFR UFL UBL UBR DFR DFL DBL DBR; orientation
// = index of the U/D sticker in the slot's face order. Measured with pycuber
// in cubiq-ml (f2l._build_corner_trans) and dumped verbatim.
export const CORNER_SLOTS = ['UFR', 'UFL', 'UBL', 'UBR', 'DFR', 'DFL', 'DBL', 'DBR'] as const

const CORNER_ROWS: number[][] = [
  [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],   // U
  [9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],   // U'
  [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],   // U2
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 21, 22, 23, 12, 13, 14, 15, 16, 17, 18, 19, 20],   // D
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15, 16, 17, 18, 19, 20, 21, 22, 23, 12, 13, 14],   // D'
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 18, 19, 20, 21, 22, 23, 12, 13, 14, 15, 16, 17],   // D2
  [14, 12, 13, 1, 2, 0, 6, 7, 8, 9, 10, 11, 16, 17, 15, 5, 3, 4, 18, 19, 20, 21, 22, 23],   // F
  [5, 3, 4, 16, 17, 15, 6, 7, 8, 9, 10, 11, 1, 2, 0, 14, 12, 13, 18, 19, 20, 21, 22, 23],   // F'
  [15, 16, 17, 12, 13, 14, 6, 7, 8, 9, 10, 11, 3, 4, 5, 0, 1, 2, 18, 19, 20, 21, 22, 23],   // F2
  [0, 1, 2, 3, 4, 5, 20, 18, 19, 7, 8, 6, 12, 13, 14, 15, 16, 17, 22, 23, 21, 11, 9, 10],   // B
  [0, 1, 2, 3, 4, 5, 11, 9, 10, 22, 23, 21, 12, 13, 14, 15, 16, 17, 7, 8, 6, 20, 18, 19],   // B'
  [0, 1, 2, 3, 4, 5, 21, 22, 23, 18, 19, 20, 12, 13, 14, 15, 16, 17, 9, 10, 11, 6, 7, 8],   // B2
  [10, 11, 9, 3, 4, 5, 6, 7, 8, 23, 21, 22, 2, 0, 1, 15, 16, 17, 18, 19, 20, 13, 14, 12],   // R
  [13, 14, 12, 3, 4, 5, 6, 7, 8, 2, 0, 1, 23, 21, 22, 15, 16, 17, 18, 19, 20, 10, 11, 9],   // R'
  [21, 22, 23, 3, 4, 5, 6, 7, 8, 12, 13, 14, 9, 10, 11, 15, 16, 17, 18, 19, 20, 0, 1, 2],   // R2
  [0, 1, 2, 17, 15, 16, 4, 5, 3, 9, 10, 11, 12, 13, 14, 19, 20, 18, 8, 6, 7, 21, 22, 23],   // L
  [0, 1, 2, 8, 6, 7, 19, 20, 18, 9, 10, 11, 12, 13, 14, 4, 5, 3, 17, 15, 16, 21, 22, 23],   // L'
  [0, 1, 2, 18, 19, 20, 15, 16, 17, 9, 10, 11, 12, 13, 14, 6, 7, 8, 3, 4, 5, 21, 22, 23],   // L2
]

/** CORNER_TRANS[move][slot*3+ori] = sub-state after the move */
export const CORNER_TRANS: Int32Array[] = CORNER_ROWS.map(r => Int32Array.from(r))

/** (edge_subs[12], corner_subs[8]) of each piece (indexed by home slot)
 *  after applying a scramble to a solved cube. Unknown tokens are skipped,
 *  like cubiq-ml's scramble_to_substates. */
export function scrambleToSubstates(scramble: string): [number[], number[]] {
  let edges = Array.from({ length: 12 }, (_, s) => s * 2)
  let corners = Array.from({ length: 8 }, (_, s) => s * 3)
  for (const move of scramble.split(/\s+/)) {
    const mi = MOVE_INDEX[move]
    if (mi === undefined) continue
    const et = EDGE_TRANS[mi], ct = CORNER_TRANS[mi]
    edges = edges.map(s => et[s])
    corners = corners.map(s => ct[s])
  }
  return [edges, corners]
}

// ── Rotations (cross-face canonicalisation) ──────────────────────────────────

/** Rotation prefix per cross face (csTimer convention: hold the cross face down) */
export const FACE_ROTATION: Record<string, string> = {
  D: '', U: 'z2', F: "x'", B: 'x', R: 'z', L: "z'",
}

/** How each rotation prefix maps an original face to its spatial position
 *  afterwards; moves are remapped through it so "rotation + moves" solves. */
export const ROT_MAP: Record<string, Record<string, string>> = {
  '':   {},
  'z2': { U: 'D', D: 'U', R: 'L', L: 'R' },
  "x'": { F: 'D', D: 'B', B: 'U', U: 'F' },
  'x':  { F: 'U', U: 'B', B: 'D', D: 'F' },
  'z':  { U: 'R', R: 'D', D: 'L', L: 'U' },
  "z'": { U: 'L', L: 'D', D: 'R', R: 'U' },
}

export function remapMoves(moves: readonly string[], rotation: string): string[] {
  const mapping = ROT_MAP[rotation]
  return moves.map(m => (mapping[m[0]] ?? m[0]) + m.slice(1))
}

/** Remap a scramble so the given cross face becomes D. */
export function remapScramble(scramble: string, face: string): string {
  const mapping = ROT_MAP[FACE_ROTATION[face]]
  return scramble.split(/\s+/).filter(Boolean)
    .map(m => ('UDFBRL'.includes(m[0]) ? (mapping[m[0]] ?? m[0]) + m.slice(1) : m))
    .join(' ')
}
