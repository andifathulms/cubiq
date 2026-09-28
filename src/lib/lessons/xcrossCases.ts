// X-cross lesson scrambles (runs in the solver worker: the x-cross search
// needs the F2L piece tables). Everything is in the lessons' hold, white on
// the bottom, so the white cross is the D cross and no rotation is needed.
//
// For each candidate scramble: the optimal cross, the optimal x-cross for
// each of the four slots, and "cross then pair" (the optimal pair solved
// after that cross) — then the lesson's filter decides whether it teaches
// the idea. A cheap lower bound screens candidates before the exact search.

import { F2L_PAIRS, PAIR_NAMES, applyF2LMoves, f2lFromScramble, heuristic, solvePairs, warmTables } from '@/lib/solvers/f2l'
import { reportProgress } from '@/lib/solvers/progress'
import { crossDistance, crossSubs, optimalCrosses, randomMoves } from './crossEngine'

export interface XSlot {
  slot: string            // FR FL BR BL
  xcross: string[]        // optimal cross + this pair, jointly
  pairAfter: string[]     // this pair, solved optimally after the cross
  inPlace: boolean        // both pieces already sit in this slot (any way round)
}

export interface XCase {
  scramble: string
  cross: string[]
  slots: XSlot[]          // in FR FL BR BL order
  tries: number
}

const LOWER = (st: ReturnType<typeof f2lFromScramble>, pi: number) => heuristic(st, [pi])

export function xcrossCase(lesson: string): XCase {
  warmTables()
  reportProgress('Looking for a scramble that shows the idea')
  let best: XCase | null = null
  for (let tries = 1; tries <= 60; tries++) {
    const scramble = randomMoves(22).join(' ')
    const subs = crossSubs(scramble)
    const crossLen = crossDistance(subs)
    if (crossLen < 4 || crossLen > 7) continue
    const start = f2lFromScramble(scramble)
    const lows = PAIR_NAMES.map((_, pi) => LOWER(start, pi))
    const minLow = Math.min(...lows)
    // screens: the x-cross is at least its lower bound, so skip hopeless ones
    if ((lesson === 'xc-free' || lesson === 'xc-ride') && minLow - crossLen > 2) continue
    if (lesson === 'xc-choose' && minLow - crossLen > 3) continue

    const cross = optimalCrosses(subs, 1)[0]
    const afterCross = applyF2LMoves(start, cross)
    const slots: XSlot[] = PAIR_NAMES.map((slot, pi) => {
      const [c, e] = F2L_PAIRS[pi][1]
      return {
        slot,
        xcross: solvePairs(start, [pi], 14, 1)[0] ?? [],
        pairAfter: solvePairs(afterCross, [pi], 14, 1)[0] ?? [],
        inPlace: Math.floor(start.pc[pi] / 3) === c && start.pe[pi] >> 1 === e,
      }
    })
    const x = { scramble, cross, slots, tries }
    best ??= x
    const extra = slots.map(s => s.xcross.length - cross.length)
    const minExtra = Math.min(...extra)
    const bestSlots = slots.filter((_, i) => extra[i] === minExtra)
    const saving = Math.max(...slots.map(s => cross.length + s.pairAfter.length - s.xcross.length))
    const ok =
      lesson === 'xc-why' ? saving >= 3
        : lesson === 'xc-free' ? minExtra <= 1 && bestSlots.length === 1
          : lesson === 'xc-ride' ? minExtra <= 2 && bestSlots.length === 1 && !bestSlots[0].inPlace
            : lesson === 'xc-keyhole' ? saving >= 4
              : minExtra <= 3
    if (ok) return x
  }
  return best!
}
