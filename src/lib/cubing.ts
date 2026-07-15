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
  '555': {
    moves: [
      'U', "U'", 'U2', 'D', "D'", 'D2', 'F', "F'", 'F2', 'B', "B'", 'B2', 'R', "R'", 'R2', 'L', "L'", 'L2',
      'Uw', "Uw'", 'Uw2', 'Dw', "Dw'", 'Dw2',
      'Fw', "Fw'", 'Fw2', 'Bw', "Bw'", 'Bw2',
      'Rw', "Rw'", 'Rw2', 'Lw', "Lw'", 'Lw2',
      '3Uw', "3Uw'", '3Uw2', '3Dw', "3Dw'", '3Dw2',
      '3Fw', "3Fw'", '3Fw2', '3Bw', "3Bw'", '3Bw2',
      '3Rw', "3Rw'", '3Rw2', '3Lw', "3Lw'", '3Lw2',
    ],
    length: 60,
    axis: {
      U: 0, D: 0, Uw: 0, Dw: 0, '3Uw': 0, '3Dw': 0,
      F: 1, B: 1, Fw: 1, Bw: 1, '3Fw': 1, '3Bw': 1,
      R: 2, L: 2, Rw: 2, Lw: 2, '3Rw': 2, '3Lw': 2,
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
  'minx': {
    moves: [
      'U++', 'U--', 'R++', 'R--', 'D++', 'D--',
      'F++', 'F--', 'L++', 'L--', 'BR++', 'BR--', 'BL++', 'BL--',
    ],
    length: 70,
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

function generateSq1(): string {
  const parts: string[] = []
  for (let i = 0; i < 11; i++) {
    const top = Math.floor(Math.random() * 12) - 5
    const bot = Math.floor(Math.random() * 12) - 5
    parts.push(`(${top},${bot})`)
  }
  return parts.join('/ ') + '/'
}
