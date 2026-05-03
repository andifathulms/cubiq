const MOVES = [
  'U', "U'", 'U2',
  'D', "D'", 'D2',
  'F', "F'", 'F2',
  'B', "B'", 'B2',
  'R', "R'", 'R2',
  'L', "L'", 'L2',
]

// Same axis: UD=0, FB=1, RL=2 — WCA rule: no two consecutive moves on the same axis
const AXIS: Record<string, number> = { U: 0, D: 0, F: 1, B: 1, R: 2, L: 2 }

export function generateScramble(_puzzle = '333', length = 20): string {
  const moves: string[] = []
  let lastAxis = -1

  for (let i = 0; i < length; i++) {
    const pool = MOVES.filter(m => AXIS[m[0]] !== lastAxis)
    const pick = pool[Math.floor(Math.random() * pool.length)]
    moves.push(pick)
    lastAxis = AXIS[pick[0]]
  }

  return moves.join(' ')
}
