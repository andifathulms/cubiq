export type Penalty = null | '+2' | 'DNF'

export type PuzzleType = '222' | '333' | '444' | '555' | 'pyram' | 'skewb' | 'minx' | 'sq1' | 'clock'

export interface Solve {
  id: string
  time_ms: number
  penalty: Penalty
  scramble: string
  scramble_state?: string
  comment: string
  created_at: string
}

export interface Session {
  id: string
  name: string
  puzzle: PuzzleType
  created_at: string
  solves: Solve[]
}

export interface Settings {
  inspection_enabled: boolean
  inspection_duration: 8 | 12 | 15
  timer_precision: 'centiseconds' | 'milliseconds'
  voice_alerts: boolean
  cube_preview_visible: boolean
  ml_service_url: string
}

export type TimerState = 'idle' | 'ready' | 'inspection' | 'running' | 'stopped'

export interface CrossSolution {
  face: 'D' | 'U' | 'F' | 'B' | 'L' | 'R'
  rotation: string
  moves: string[]
  move_count: number
}

export interface SessionStats {
  best: number | null
  worst: number | null
  mean: number | null
  ao5: number | null
  ao12: number | null
  ao50: number | null
  ao100: number | null
  count: number
}
