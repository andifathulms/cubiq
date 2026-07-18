'use client'
import { useCubiqStore } from '@/store'
import { formatTime } from '@/lib/stats'

export function TimerDisplay() {
  const { timerState, currentTime, inspectionTime, settings } = useCubiqStore()

  const color =
    timerState === 'ready'
      ? 'var(--accent-success)'
      : timerState === 'running'
      ? 'var(--accent-primary)'
      : timerState === 'inspection'
      ? 'var(--accent-warning)'
      : 'var(--text-primary)'

  let display: string
  if (timerState === 'inspection') {
    display = String(Math.max(0, inspectionTime))
  } else if (settings.timer_precision === 'milliseconds') {
    display = timerState === 'stopped' || timerState === 'running'
      ? (currentTime / 1000).toFixed(3)
      : formatTime(currentTime)
  } else {
    display = formatTime(currentTime)
  }

  const isActive = timerState === 'running' || timerState === 'ready' || timerState === 'inspection'

  return (
    <div
      className="select-none font-mono text-center tabular-nums transition-all duration-150"
      style={{
        fontSize: 'clamp(3.5rem, 14vw, 8.5rem)',
        lineHeight: 1,
        fontWeight: 700,
        letterSpacing: '-0.02em',
        color,
        textShadow: isActive ? `0 0 60px ${color}55, 0 0 24px ${color}33` : 'none',
        transform: timerState === 'running' ? 'scale(1.02)' : 'scale(1)',
      }}
    >
      {display}
    </div>
  )
}
