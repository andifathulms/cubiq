// Square-1 wedge model shared by the 2D and 3D animated views: 24 tracked
// wedges, slots 0-11 top / 12-23 bottom, twists rotate layers, the slash
// swaps slots 6-11 with 12-17 and toggles the equator (the same slot
// semantics as cubing.js's square1 kpuzzle).
//
// Solved is the WCA solved state: a cube you can slash straight away. The
// top reads corner-first from the cut, the bottom edge-first, because the
// cut runs 15° off the face centres and a slash mirrors the moving half
// across it. (The solver engine's tables use a solved state with the bottom
// one notch off; src/lib/solvers/sq1.ts converts at its boundary.)

export type Sq1Token = { kind: 'twist'; u: number; d: number } | { kind: 'slash' }

export const CORNER_FIRST = new Set([0, 3, 6, 9, 13, 16, 19, 22])
export const EDGES = new Set([2, 5, 8, 11, 12, 15, 18, 21])
export const SOLVED = Array.from({ length: 24 }, (_, i) => i)

export function norm(x: number): number {
  x = ((x % 12) + 12) % 12
  return x > 6 ? x - 12 : x
}

export function parseSq1Tokens(s: string): Sq1Token[] {
  const out: Sq1Token[] = []
  for (const tok of s.replace(/\//g, ' / ').split(/\s+/)) {
    if (tok === '/') out.push({ kind: 'slash' })
    else if (tok.startsWith('(')) {
      const [u, d] = tok.replace(/[()]/g, '').split(',').map(Number)
      out.push({ kind: 'twist', u, d })
    }
  }
  return out
}

export function applySq1Token(w: number[], t: Sq1Token): number[] {
  if (t.kind === 'twist') {
    const u = ((t.u % 12) + 12) % 12
    const d = ((t.d % 12) + 12) % 12
    const top = Array.from({ length: 12 }, (_, i) => w[(i - u + 12) % 12])
    const bot = Array.from({ length: 12 }, (_, i) => w[12 + ((i - d + 12) % 12)])
    return [...top, ...bot]
  }
  const nw = [...w]
  for (let i = 0; i < 6; i++) {
    const tmp = nw[6 + i]
    nw[6 + i] = nw[12 + i]
    nw[12 + i] = tmp
  }
  return nw
}

// Side-sticker colour by the cell's home direction, as an angle seen from
// above (0° = back, clockwise). Top slot i is centred at 30i + 30°; bottom
// slot i is the slash image of top slot i + 6, centred at -30i°.
export function sq1HomeAngle(cell: number): number {
  return cell < 12 ? 30 * cell + 30 : ((-30 * (cell - 12)) % 360 + 360) % 360
}

export function sq1SideColor(cell: number): string {
  const a = sq1HomeAngle(cell) % 360
  if (a >= 45 && a < 135) return 'var(--face-R)'
  if (a >= 135 && a < 225) return 'var(--face-F)'
  if (a >= 225 && a < 315) return 'var(--face-L)'
  return 'var(--face-B)'
}

export interface Sq1Wedge {
  slot: number          // layer-local 0-11
  layer: 0 | 1
  cells: number[]       // 1 (edge) or 2 (corner) cell ids
}

export function sq1Wedges(w: number[]): Sq1Wedge[] {
  const out: Sq1Wedge[] = []
  for (const layer of [0, 1] as const) {
    const base = layer * 12
    for (let s = 0; s < 12; s++) {
      const c = w[base + s]
      if (!CORNER_FIRST.has(c) && !EDGES.has(c)) continue  // corner-second cell
      out.push({
        slot: s,
        layer,
        cells: CORNER_FIRST.has(c) ? [c, c + 1] : [c],
      })
    }
  }
  return out
}

export function sq1TokenLabel(t: Sq1Token): string {
  return t.kind === 'slash' ? '/' : `(${norm(t.u)},${norm(t.d)})`
}
