'use client'
import { useCallback, useEffect, useRef } from 'react'
import { useCubiqStore } from '@/store'
import type { Penalty, TimerState } from '@/types'

export const HOLD_MS = 300

function speak(text: string) {
  try {
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.1
    window.speechSynthesis.speak(u)
  } catch { /* speech unavailable */ }
}

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

/** Stackmat-style timing: press to arm (holding, red), wait HOLD_MS until
 *  ready (green), release to start; any key or a tap stops. With WCA
 *  inspection on, the first release starts the countdown, and the solve
 *  gets +2 past the limit and a DNF two seconds after that.
 *
 *  Keyboard (Space) is bound globally; touch/mouse on `stageRef`. */
export function useTimerEngine(stageRef: React.RefObject<HTMLElement | null>) {
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const tick = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const inspectTick = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const startAt = useRef(0)
  const inspectStart = useRef(0)
  const resumeState = useRef<TimerState>('idle')
  const penalty = useRef<Penalty>(null)
  const stopGuard = useRef(false)   // swallow the release that follows a stop

  const get = useCubiqStore.getState

  const clearAll = useCallback(() => {
    clearTimeout(holdTimer.current)
    clearInterval(tick.current)
    clearInterval(inspectTick.current)
  }, [])

  const record = useCallback((timeMs: number, pen: Penalty) => {
    const s = get()
    s.addSolve({ time_ms: Math.round(timeMs), penalty: pen, scramble: s.currentScramble, comment: '' })
    s.setTimerState('stopped')
    s.nextScramble()
  }, [get])

  const startInspection = useCallback(() => {
    const s = get()
    const limit = s.settings.inspection_duration * 1000
    inspectStart.current = performance.now()
    s.setInspectionTime(0)
    s.setTimerState('inspection')
    const called = new Set<number>()
    inspectTick.current = setInterval(() => {
      const st = get()
      const elapsed = performance.now() - inspectStart.current
      st.setInspectionTime(elapsed)
      if (st.settings.voice_alerts) {
        for (const mark of [8, 12]) {
          if (elapsed >= mark * 1000 && !called.has(mark) && mark * 1000 < limit) {
            called.add(mark)
            speak(`${mark} seconds`)
          }
        }
      }
      // over the limit + 2 s without starting: DNF (WCA A3d1)
      if (elapsed > limit + 2000 && st.timerState !== 'running') {
        clearAll()
        record(0, 'DNF')
      }
    }, 50)
  }, [get, clearAll, record])

  const startSolve = useCallback(() => {
    const s = get()
    penalty.current = null
    if (inspectStart.current) {
      const elapsed = performance.now() - inspectStart.current
      if (elapsed > s.settings.inspection_duration * 1000) penalty.current = '+2'
      clearInterval(inspectTick.current)
      inspectStart.current = 0
      s.setInspectionTime(0)
    }
    startAt.current = performance.now()
    s.setCurrentTime(0)
    s.setTimerState('running')
    tick.current = setInterval(() => get().setCurrentTime(performance.now() - startAt.current), 10)
  }, [get])

  const stop = useCallback(() => {
    const elapsed = performance.now() - startAt.current
    clearInterval(tick.current)
    get().setCurrentTime(elapsed)
    stopGuard.current = true
    record(elapsed, penalty.current)
  }, [get, record])

  const press = useCallback(() => {
    const state = get().timerState
    if (state === 'running') { stop(); return }
    if (state === 'idle' || state === 'stopped' || state === 'inspection') {
      resumeState.current = state
      get().setTimerState('holding')
      holdTimer.current = setTimeout(() => {
        if (get().timerState === 'holding') get().setTimerState('ready')
      }, HOLD_MS)
    }
  }, [get, stop])

  const release = useCallback(() => {
    if (stopGuard.current) { stopGuard.current = false; return }
    const state = get().timerState
    if (state === 'holding') {
      clearTimeout(holdTimer.current)
      get().setTimerState(resumeState.current)
    } else if (state === 'ready') {
      if (get().settings.inspection_enabled && resumeState.current !== 'inspection') startInspection()
      else startSolve()
    }
  }, [get, startInspection, startSolve])

  /** Abandon inspection / an armed hold (Escape). */
  const cancel = useCallback(() => {
    const state = get().timerState
    if (state === 'inspection' || state === 'holding' || state === 'ready') {
      clearAll()
      inspectStart.current = 0
      get().setInspectionTime(0)
      get().setTimerState('idle')
      get().setCurrentTime(0)
    }
  }, [get, clearAll])

  // Keyboard: Space arms/starts; while running any key stops.
  useEffect(() => {
    const modalOpen = () => !!document.querySelector('[role="dialog"]')
    const onDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || modalOpen()) return
      const running = get().timerState === 'running'
      if (running && !e.metaKey && !e.ctrlKey && !['Shift', 'Alt', 'Meta', 'Control', 'Tab'].includes(e.key)) {
        e.preventDefault()
        if (!e.repeat) press()
        return
      }
      if (e.code === 'Space') {
        e.preventDefault()
        if (!e.repeat) press()
      } else if (e.key === 'Escape') {
        cancel()
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (isTyping(e.target) || modalOpen()) return
      if (e.code === 'Space') {
        e.preventDefault()
        release()
      } else if (stopGuard.current) {
        stopGuard.current = false
      }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [get, press, release, cancel])

  // Touch / mouse on the timing surface (buttons inside keep working).
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, [data-no-timer]')) return
      e.preventDefault()
      press()
    }
    const onUp = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button, a, input, [data-no-timer]') && get().timerState !== 'holding' && get().timerState !== 'ready') return
      release()
    }
    el.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [stageRef, get, press, release])

  useEffect(() => () => clearAll(), [clearAll])

  return { cancel }
}
