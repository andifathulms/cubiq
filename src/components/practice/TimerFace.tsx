'use client'
import { Trash2 } from 'lucide-react'
import { useCubiqStore } from '@/store'
import { formatTime, getEffectiveTime } from '@/lib/stats'
import { HOLD_MS } from './useTimerEngine'
import type { Records } from '@/lib/practice'

function Ring({ progress, color, animateFill }: { progress: number; color: string; animateFill?: boolean }) {
  const r = 11, c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 28 28" width="22" height="22" aria-hidden className="shrink-0 -rotate-90">
      <circle cx="14" cy="14" r={r} fill="none" stroke="var(--line)" strokeWidth="3.5" />
      <circle
        cx="14" cy="14" r={r} fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={animateFill ? undefined : c * (1 - Math.max(0, Math.min(1, progress)))}
        style={animateFill ? { animation: `ring-fill ${HOLD_MS}ms linear forwards` } : { transition: 'stroke-dashoffset 0.1s linear' }}
      />
      {animateFill && <style>{`@keyframes ring-fill { from { stroke-dashoffset: ${c}; } to { stroke-dashoffset: 0; } }`}</style>}
    </svg>
  )
}

/** The big number plus the one line of guidance or actions under it. */
export function TimerFace({ records, onDelete }: { records: Records; onDelete: () => void }) {
  const { timerState, currentTime, inspectionTime, settings, updateSolve } = useCubiqStore()
  const session = useCubiqStore(s => s.sessions.find(x => x.id === s.activeSessionId))
  const last = session?.solves[session.solves.length - 1]

  const limit = settings.inspection_duration * 1000
  const inspecting = timerState === 'inspection' || ((timerState === 'holding' || timerState === 'ready') && inspectionTime > 0)
  const anyRecord = records.single || records.ao5 || records.ao12

  let text: string
  let color = 'var(--ink)'
  if (inspecting) {
    const left = Math.ceil((limit - inspectionTime) / 1000)
    text = inspectionTime > limit ? '+2' : String(Math.max(0, left))
    color = inspectionTime >= 12000 || inspectionTime > limit ? 'var(--stop)' : inspectionTime >= 8000 ? 'var(--plus2)' : 'var(--ink)'
  } else if (timerState === 'stopped' && last) {
    const eff = getEffectiveTime(last)
    text = eff === null ? 'DNF' : settings.timer_precision === 'milliseconds' ? (eff / 1000).toFixed(3) : formatTime(eff)
    if (last.penalty === '+2') text += '+'
    if (anyRecord) color = 'var(--pb)'
  } else if (timerState === 'running') {
    text = settings.timer_precision === 'milliseconds' ? (currentTime / 1000).toFixed(3) : formatTime(currentTime)
  } else {
    text = settings.timer_precision === 'milliseconds' ? '0.000' : '0.00'
  }
  if (timerState === 'holding') color = 'var(--stop)'
  if (timerState === 'ready') color = 'var(--go)'

  return (
    <div className="flex flex-col items-center gap-5 select-none">
      <div
        className="num font-semibold leading-none tracking-[-0.045em] transition-colors duration-100"
        style={{ fontSize: 'clamp(4.25rem, 15vw, 10.5rem)', color }}
        aria-live={timerState === 'stopped' ? 'polite' : 'off'}
        aria-label={timerState === 'stopped' ? `Time ${text}` : undefined}
      >
        {text}
      </div>

      <div className="min-h-9 flex items-center justify-center gap-3 flex-wrap text-[13px] text-muted">
        {timerState === 'idle' && (
          <span className="flex items-center gap-2 flex-wrap justify-center">
            Hold <kbd>Space</kbd> or touch and hold · release on <span className="text-go font-medium">green</span>
          </span>
        )}
        {timerState === 'holding' && <span className="flex items-center gap-2 text-stop"><Ring progress={0} color="var(--stop)" animateFill /> Keep holding…</span>}
        {timerState === 'ready' && <span className="flex items-center gap-2 text-go font-medium"><Ring progress={1} color="var(--go)" /> Release to start</span>}
        {timerState === 'inspection' && (
          <span className="flex items-center gap-2">
            <Ring progress={1 - inspectionTime / limit} color={color === 'var(--ink)' ? 'var(--go)' : color} />
            Inspecting · hold <kbd>Space</kbd> to start
          </span>
        )}
        {timerState === 'running' && <span className="text-faint">Any key or tap stops</span>}
        {timerState === 'stopped' && last && session && (
          <>
            {records.single && <span className="pill pill-pb">★ PB SINGLE</span>}
            {records.ao5 && <span className="pill pill-pb">★ PB AO5</span>}
            {records.ao12 && <span className="pill pill-pb">★ PB AO12</span>}
            <div className="seg" role="group" aria-label="Penalty" data-no-timer>
              {([['OK', null], ['+2', '+2'], ['DNF', 'DNF']] as const).map(([label, pen]) => (
                <button
                  key={label} type="button" aria-pressed={last.penalty === pen}
                  onClick={() => updateSolve(session.id, last.id, { penalty: pen })}
                  className="num !text-[11px] !font-semibold"
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button" onClick={onDelete} data-no-timer
              className="btn btn-ghost btn-sm" aria-label="Delete this solve"
            >
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
