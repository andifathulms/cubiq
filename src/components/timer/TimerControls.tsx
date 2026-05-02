'use client'
import { useEffect, useRef, useCallback } from 'react'
import { useCubiqStore } from '@/store'

const HOLD_DURATION = 300
const DISPLAY_UPDATE_INTERVAL = 10

export function TimerControls() {
  const {
    timerState, setTimerState, setCurrentTime, settings, addSolve, currentScramble,
  } = useCubiqStore()

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const startTimeRef = useRef<number>(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const startDisplayTimer = useCallback(() => {
    startTimeRef.current = performance.now()
    intervalRef.current = setInterval(() => {
      setCurrentTime(performance.now() - startTimeRef.current)
    }, DISPLAY_UPDATE_INTERVAL)
  }, [setCurrentTime])

  const stopDisplayTimer = useCallback((): number => {
    clearInterval(intervalRef.current)
    return performance.now() - startTimeRef.current
  }, [])

  const handlePressStart = useCallback(() => {
    if (timerState === 'running') {
      const elapsed = stopDisplayTimer()
      setTimerState('stopped')
      addSolve({
        time_ms: Math.round(elapsed),
        penalty: null,
        scramble: currentScramble,
        comment: '',
      })
      return
    }

    if (timerState === 'inspection') {
      // Space during inspection starts the timer
      setTimerState('running')
      startDisplayTimer()
      return
    }

    if (timerState === 'idle' || timerState === 'stopped') {
      setTimerState('ready')
      holdTimerRef.current = setTimeout(() => {
        if (settings.inspection_enabled) {
          setTimerState('inspection')
        } else {
          setTimerState('running')
          startDisplayTimer()
        }
      }, HOLD_DURATION)
    }
  }, [timerState, settings.inspection_enabled, currentScramble, addSolve, setTimerState, startDisplayTimer, stopDisplayTimer])

  const handlePressEnd = useCallback(() => {
    if (timerState === 'ready') {
      clearTimeout(holdTimerRef.current)
      setTimerState('idle')
    }
  }, [timerState, setTimerState])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault()
        handlePressStart()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        handlePressEnd()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [handlePressStart, handlePressEnd])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout(holdTimerRef.current)
      clearInterval(intervalRef.current)
    }
  }, [])

  return null
}
