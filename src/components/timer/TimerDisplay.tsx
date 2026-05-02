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

  return (
    <div
      className="select-none font-mono text-center transition-colors duration-100"
      style={{
        fontSize: 'clamp(3rem, 12vw, 7rem)',
        lineHeight: 1,
        color,
        textShadow: timerState === 'running' ? `0 0 40px ${color}44` : 'none',
      }}
    >
      {display}
    </div>
  )
}
