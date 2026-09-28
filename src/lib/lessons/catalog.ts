// The Lessons tab: tracks, their lessons and the words that teach them.
// Each lesson has an explanation (what to look at), a worked example and a
// drill; `kind` picks the drill, `levels` the difficulty ladder.

export type TrackId = 'cross' | 'xcross' | 'sq1'

export interface LessonLevel {
  label: string        // 'Optimum 4–5 moves'
  min: number
  max: number
  planMs?: number      // planning time limit, if any
}

export interface Lesson {
  id: string
  track: TrackId
  title: string
  goal: string          // one line: what you can do after this lesson
  see: string[]         // what to look at, in order
  drill: string         // one line: what the drill asks
  kind: string          // which drill component runs it
  levels?: LessonLevel[]
  watchOnly?: number    // lessons you pass by viewing N examples
}

export interface Track {
  id: TrackId
  title: string
  colour: string        // sticker token
  blurb: string
  hold?: string         // how to hold the puzzle for this track's scrambles
  after?: string        // recommended prerequisite, shown, never enforced
  lessons: Lesson[]
}

const CROSS: Lesson[] = [
  {
    id: 'cross-find', track: 'cross', title: 'Find the four edges',
    goal: 'Locate every white edge in a few seconds, without turning the cube.',
    see: [
      'Look for white stickers on edges only (the pieces with two stickers). Ignore the centres and corners.',
      'Name each edge by its other colour: white-green, white-orange, white-blue, white-red.',
      'Its home is under the centre of that colour: white-green goes under the green centre.',
      'Say where each one is: top, middle or bottom layer, and next to which centre.',
    ],
    drill: 'The app names a white edge; tap where it is on the layer map.',
    kind: 'cross-find',
  },
  {
    id: 'cross-cost', track: 'cross', title: 'What each edge costs',
    goal: 'Estimate how many moves each edge needs on its own.',
    see: [
      'Middle layer: 1–2 moves. One turn of a side face drops it in; if it lands in the wrong slot, the bottom needs a turn too.',
      'Top layer, white facing up: 1–2 moves. Above its centre it is one half turn; otherwise turn the top first.',
      'Top layer, white facing out (flipped): 2–3 moves. It has to come down through the middle layer.',
      'Bottom layer, white down but in the wrong slot: 1 move of the bottom (which also moves the others).',
      'Bottom layer, flipped: 2–3 moves. It has to come out and go back in the other way round.',
    ],
    drill: 'Guess one edge\'s cost on its own, then see its shortest route.',
    kind: 'cross-cost',
  },
  {
    id: 'cross-relative', track: 'cross', title: 'Solve relative, fix the bottom last',
    goal: 'Stop matching every edge to its centre as you go.',
    see: [
      'Around the bottom the order is green, orange, blue, red, going right from the front. Opposite colours sit opposite each other.',
      'Two edges already in the bottom in the right order are as good as solved: a bottom turn at the end lines them up.',
      'So insert the next edge next to its neighbour, not next to its centre, and turn the bottom once at the very end.',
    ],
    drill: 'Two white edges are out. Plan the optimum; it usually ends with a bottom turn.',
    kind: 'cross-plan', levels: [{ label: 'Two edges, optimum 3–5 moves', min: 3, max: 5 }],
  },
  {
    id: 'cross-pair', track: 'cross', title: 'One move, two jobs',
    goal: 'Find turns that place one edge and set up another at the same time.',
    see: [
      'A side turn only reaches one bottom slot, so it places at most one edge. The trick is what it does to the others.',
      'Look for two white edges on the same side face. The turn that drops one in also carries the other.',
      'Before you turn, ask where that second edge ends up. If it lands right above or beside its slot, the next move drops it in.',
      'Choose the order so each turn does two jobs: that is how a 4-edge cross fits in 5–6 moves.',
    ],
    drill: 'Scrambles where one move of the optimum places an edge and sets up the next one.',
    kind: 'cross-plan', levels: [{ label: 'Optimum 3–6 moves', min: 3, max: 6 }],
  },
  {
    id: 'cross-setup', track: 'cross', title: 'Set up instead of breaking',
    goal: 'Move placed edges out of the way with the bottom, not with side turns.',
    see: [
      'Before a side turn, check whether it would knock out an edge you already placed.',
      'If it would, turn the bottom first so that edge is somewhere safe, insert, and turn back if needed.',
      'A bottom turn costs one move and never breaks the order of the bottom edges.',
    ],
    drill: 'Scrambles where the optimum turns the bottom in the middle of the solve.',
    kind: 'cross-plan', levels: [{ label: 'Optimum 4–6 moves', min: 4, max: 6 }],
  },
  {
    id: 'cross-full', track: 'cross', title: 'Plan the whole cross',
    goal: 'Plan a full cross within 15 seconds of inspection.',
    see: [
      'Start with the cheapest edge, the one in the middle layer or already on the bottom.',
      'Look for a pair next: two edges you can place together, or one that rides along with another\'s move.',
      'Plan the last two relative to the first, and finish with one bottom turn.',
      'Trace it with your eyes, not your hands. Say the moves in your head.',
    ],
    drill: 'Full crosses, sorted by their optimal length. Levels get longer and faster.',
    kind: 'cross-plan',
    levels: [
      { label: 'Optimum 4–5 moves', min: 4, max: 5, planMs: 30000 },
      { label: 'Optimum 6 moves', min: 6, max: 6, planMs: 15000 },
      { label: 'Optimum 7–8 moves', min: 7, max: 8, planMs: 15000 },
    ],
  },
]

export const TRACKS: Track[] = [
  {
    id: 'cross', title: 'Cross', colour: 'var(--st-U)',
    blurb: 'Read the four white edges before you turn, and plan a 5–7 move cross in inspection.',
    hold: 'Hold white on the bottom and green in front, then scramble.',
    lessons: CROSS,
  },
]

export const LESSON_BY_ID: Record<string, Lesson> = Object.fromEntries(TRACKS.flatMap(t => t.lessons).map(l => [l.id, l]))
export const TRACK_BY_ID: Record<string, Track> = Object.fromEntries(TRACKS.map(t => [t.id, t]))
