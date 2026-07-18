'use client'

interface ScrambleDisplayProps {
  scramble: string
}

export function ScrambleDisplay({ scramble }: ScrambleDisplayProps) {
  if (!scramble) {
    return (
      <div className="text-center px-4">
        <span className="text-lg font-mono animate-pulse-glow" style={{ color: 'var(--text-muted)' }}>
          Generating scramble…
        </span>
      </div>
    )
  }

  const moves = scramble.trim().split(/\s+/)

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 px-4 max-w-2xl">
      {moves.map((move, i) => (
        <span
          key={i}
          className="font-mono text-base md:text-lg font-bold tabular-nums transition-colors"
          style={{ color: 'var(--text-primary)' }}
        >
          {move}
        </span>
      ))}
    </div>
  )
}
