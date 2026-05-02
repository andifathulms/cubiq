export async function generateScramble(puzzle = '333'): Promise<string> {
  const { randomScrambleForEvent } = await import('cubing/scramble')
  const alg = await randomScrambleForEvent(puzzle)
  return alg.toString()
}
