// Lesson progress: every drill try is a hit (found the optimum / answered
// right) or a miss. 8 hits in the last 10 passes the level; 5 misses in the
// last 10 drops back one level. Passing the last level passes the lesson.

export interface LessonProgress {
  results: boolean[]   // most recent last, at most WINDOW long
  level: number        // 0-based
  passed: boolean
}

export const WINDOW = 10
export const PASS_HITS = 8
export const DROP_MISSES = 5

export const EMPTY_PROGRESS: LessonProgress = { results: [], level: 0, passed: false }

export function applyResult(prev: LessonProgress | undefined, hit: boolean, levels = 1): LessonProgress {
  const p = prev ?? EMPTY_PROGRESS
  const results = [...p.results, hit].slice(-WINDOW)
  const hits = results.filter(Boolean).length
  const misses = results.length - hits
  if (hits >= PASS_HITS) {
    if (p.level < levels - 1) return { results: [], level: p.level + 1, passed: p.passed }
    return { results: [], level: p.level, passed: true }
  }
  if (misses >= DROP_MISSES && p.level > 0) return { results: [], level: p.level - 1, passed: p.passed }
  return { ...p, results }
}

/** What the progress strip says: "5 of 8 so far" etc. */
export function standing(p: LessonProgress | undefined): { hits: number; tries: number; toGo: number } {
  const results = p?.results ?? []
  const hits = results.filter(Boolean).length
  return { hits, tries: results.length, toGo: Math.max(0, PASS_HITS - hits) }
}
