// Which scrambles each cross lesson uses. Every case is picked for the idea
// the lesson teaches, and its optimal solutions are reordered so the one
// shown first actually uses that idea.

import { LESSON_BY_ID } from './catalog'
import {
  fullCase, partialCase, preferSolution, soloTable, WHITE_EDGES,
  type CrossCase, type Step,
} from './crossEngine'

type Pred = (steps: Step[]) => boolean

const endsWithBottomTurn: Pred = s => s.at(-1)?.kind === 'align'
const placesTwo: Pred = s => s.some(x => x.kind === 'place-two')
const setsUpMidway: Pred = s => s.some((x, i) => (x.kind === 'setup-bottom' && i < s.length - 1) || x.kind === 'lift')

function featured(make: (want: (c: CrossCase) => boolean) => CrossCase, pred: Pred): CrossCase {
  const c = make(x => preferSolution(x, pred) !== null)
  return preferSolution(c, pred) ?? c
}

export function crossCaseFor(lessonId: string, level = 0): CrossCase {
  switch (lessonId) {
    case 'cross-find':
      return fullCase(4, 8)
    case 'cross-cost':
      // at least one edge that is not home, so there is something to price
      return fullCase(4, 8, c => c.subs.some((s, i) => s !== WHITE_EDGES[i] * 2))
    case 'cross-relative':
      return featured(w => partialCase(2, 3, 5, w), endsWithBottomTurn)
    case 'cross-pair':
      return featured(w => partialCase(3, 3, 6, w), placesTwo)
    case 'cross-setup':
      return featured(w => partialCase(Math.random() < 0.5 ? 3 : 4, 4, 6, w), setsUpMidway)
    default: {
      const lv = LESSON_BY_ID[lessonId]?.levels?.[level]
      return fullCase(lv?.min ?? 4, lv?.max ?? 8)
    }
  }
}

/** An edge that is not home, for the cost quiz (and its cost). */
export function edgeToPrice(c: CrossCase): { edge: number; cost: number } {
  const out = c.subs.map((s, i) => ({ edge: i, cost: soloTable(i)[s] })).filter(e => e.cost > 0)
  return out[Math.floor(Math.random() * out.length)]
}
