type MoveConfig = {
  moves: string[]
  length: number
  axis?: Record<string, number>
}

// Strip trailing modifiers (', 2, +, -) to get the base face name for axis pruning
function getBase(move: string): string {
  return move.replace(/['2+\-]+$/, '')
}

const CONFIGS: Record<string, MoveConfig> = {
  '222': {
    moves: ['U', "U'", 'U2', 'R', "R'", 'R2', 'F', "F'", 'F2'],
    length: 9,
    axis: { U: 0, R: 1, F: 2 },
  },
  '333': {
    moves: ['U', "U'", 'U2', 'D', "D'", 'D2', 'F', "F'", 'F2', 'B', "B'", 'B2', 'R', "R'", 'R2', 'L', "L'", 'L2'],
    length: 20,
    axis: { U: 0, D: 0, F: 1, B: 1, R: 2, L: 2 },
  },
  '444': {
    moves: [
      'U', "U'", 'U2', 'D', "D'", 'D2', 'F', "F'", 'F2', 'B', "B'", 'B2', 'R', "R'", 'R2', 'L', "L'", 'L2',
      'Uw', "Uw'", 'Uw2', 'Dw', "Dw'", 'Dw2',
      'Fw', "Fw'", 'Fw2', 'Bw', "Bw'", 'Bw2',
      'Rw', "Rw'", 'Rw2', 'Lw', "Lw'", 'Lw2',
    ],
    length: 40,
    axis: { U: 0, D: 0, Uw: 0, Dw: 0, F: 1, B: 1, Fw: 1, Bw: 1, R: 2, L: 2, Rw: 2, Lw: 2 },
  },
  // WCA 5x5 notation: outer + two-layer wide moves only (3Uw-style
  // three-layer moves belong to 6x6+)
  '555': {
    moves: [
      'U', "U'", 'U2', 'D', "D'", 'D2', 'F', "F'", 'F2', 'B', "B'", 'B2', 'R', "R'", 'R2', 'L', "L'", 'L2',
      'Uw', "Uw'", 'Uw2', 'Dw', "Dw'", 'Dw2',
      'Fw', "Fw'", 'Fw2', 'Bw', "Bw'", 'Bw2',
      'Rw', "Rw'", 'Rw2', 'Lw', "Lw'", 'Lw2',
    ],
    length: 60,
    axis: {
      U: 0, D: 0, Uw: 0, Dw: 0,
      F: 1, B: 1, Fw: 1, Bw: 1,
      R: 2, L: 2, Rw: 2, Lw: 2,
    },
  },
  'pyram': {
    moves: ['U', "U'", 'R', "R'", 'L', "L'", 'B', "B'"],
    length: 11,
    axis: { U: 0, R: 1, L: 2, B: 3 },
  },
  'skewb': {
    moves: ['U', "U'", 'R', "R'", 'L', "L'", 'B', "B'"],
    length: 11,
    axis: { U: 0, R: 1, L: 2, B: 3 },
  },
}

// PuzzleType -> cubing.js TwistyPlayer puzzle id
export const TWISTY_PUZZLE_IDS: Record<string, string> = {
  '222': '2x2x2',
  '333': '3x3x3',
  '444': '4x4x4',
  '555': '5x5x5',
  'pyram': 'pyraminx',
  'skewb': 'skewb',
  'minx': 'megaminx',
  'sq1': 'square1',
  'clock': 'clock',
}

export function generateScramble(puzzle: string = '333'): string {
  if (puzzle === 'sq1') return generateSq1()
  if (puzzle === 'minx') return generateMinx()

  const config = CONFIGS[puzzle] ?? CONFIGS['333']
  const { moves, length, axis } = config
  const result: string[] = []
  let lastAxis = -1

  for (let i = 0; i < length; i++) {
    const pool = axis
      ? moves.filter(m => (axis[getBase(m)] ?? -99) !== lastAxis)
      : moves
    const pick = pool[Math.floor(Math.random() * pool.length)]
    result.push(pick)
    lastAxis = axis ? (axis[getBase(pick)] ?? -1) : -1
  }

  if (puzzle === 'pyram') {
    for (const tip of ['u', 'r', 'l', 'b']) {
      const r = Math.floor(Math.random() * 3)
      if (r === 0) result.push(tip)
      else if (r === 1) result.push(`${tip}'`)
    }
  }

  return result.join(' ')
}

// WCA megaminx (Pochmann): 7 lines of 10 alternating R±±/D±± then U/U'
function generateMinx(): string {
  const lines: string[] = []
  for (let line = 0; line < 7; line++) {
    const parts: string[] = []
    for (let i = 0; i < 10; i++) {
      const face = i % 2 === 0 ? 'R' : 'D'
      parts.push(face + (Math.random() < 0.5 ? '++' : '--'))
    }
    parts.push(Math.random() < 0.5 ? 'U' : "U'")
    lines.push(parts.join(' '))
  }
  return lines.join(' ')
}

// Square-1 legal scrambles need a shape simulator: corners span two wedge
// slots, and a slash is only legal when no corner straddles a cut boundary.
// Types per slot: 0 = corner-first (partner sits in the next slot),
// 1 = corner-second, 2 = edge. Mirrors cubiq-ml/solversq1.py exactly.
function generateSq1(): string {
  let t: number[] = []
  for (let i = 0; i < 8; i++) t.push(0, 1, 2)

  const rot = (arr: number[], off: number, u: number) =>
    Array.from({ length: 12 }, (_, i) => arr[off + ((i - u + 24) % 12)])

  const twistTypes = (arr: number[], u: number, d: number) =>
    [...rot(arr, 0, u), ...rot(arr, 12, d)]

  // a layer offset is slashable when neither cut boundary splits a corner
  const topOk = (arr: number[]) => arr[5] !== 0 && arr[11] !== 0
  const botOk = (arr: number[]) => arr[17] !== 0 && arr[23] !== 0

  const norm = (x: number) => {
    x = ((x % 12) + 12) % 12
    return x > 6 ? x - 12 : x
  }

  const parts: string[] = []
  for (let i = 0; i < 12; i++) {
    const options: Array<[number, number]> = []
    for (let u = 0; u < 12; u++) {
      if (!topOk(twistTypes(t, u, 0))) continue
      for (let d = 0; d < 12; d++) {
        if ((u === 0 && d === 0) || !botOk(twistTypes(t, 0, d))) continue
        options.push([u, d])
      }
    }
    const [u, d] = options[Math.floor(Math.random() * options.length)]
    t = twistTypes(t, u, d)
    for (let k = 0; k < 6; k++) {
      const tmp = t[6 + k]
      t[6 + k] = t[12 + k]
      t[12 + k] = tmp
    }
    parts.push(`(${norm(u)},${norm(d)}) /`)
  }
  return parts.join(' ')
}
