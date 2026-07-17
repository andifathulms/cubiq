// Square-1 wedge model shared by the 2D and 3D animated views.
// Mirrors cubiq-ml/solversq1.py exactly (verified cell-for-cell): 24
// tracked wedges, slots 0-11 top / 12-23 bottom, twists rotate layers,
// the slash swaps slots 6-11 with 12-17 and toggles the equator.
//
// Geometry convention: 0° = north (up), angles grow clockwise. Top slot i
// and bottom slot 12+i both span [30i, 30i+30), so the solved state reads
// as an aligned cube and a slash carries each wedge onto exactly the slot
// the engine assigns it.

export type Sq1Token = { kind: 'twist'; u: number; d: number } | { kind: 'slash' }

export const CORNER_FIRST = new Set([0, 3, 6, 9, 12, 15, 18, 21])
export const EDGES = new Set([2, 5, 8, 11, 14, 17, 20, 23])
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

// side-sticker color by the cell's home direction (both layers share zones)
export function sq1SideColor(cell: number): string {
  const a = (30 * (cell % 12) + 15) % 360
  if (a >= 30 && a < 120) return 'var(--face-R)'
  if (a >= 120 && a < 210) return 'var(--face-F)'
  if (a >= 210 && a < 300) return 'var(--face-L)'
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
