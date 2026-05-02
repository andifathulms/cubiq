'use client'

interface ScrambleDisplayProps {
  scramble: string
}

export function ScrambleDisplay({ scramble }: ScrambleDisplayProps) {
  return (
    <div className="text-center px-4">
      <p
        className="text-lg md:text-xl font-mono leading-relaxed tracking-wide"
        style={{ color: 'var(--text-primary)' }}
      >
        {scramble || <span style={{ color: 'var(--text-muted)' }}>Generating scramble…</span>}
      </p>
    </div>
  )
}
