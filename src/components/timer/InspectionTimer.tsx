'use client'
import { useEffect, useRef } from 'react'
import { useCubiqStore } from '@/store'

export function InspectionTimer() {
  const { timerState, setTimerState, setInspectionTime, settings } = useCubiqStore()
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  const startTimeRef = useRef<number>(0)

  useEffect(() => {
    if (timerState !== 'inspection') {
      clearInterval(intervalRef.current)
      return
    }

    const duration = settings.inspection_duration
    setInspectionTime(duration)
    startTimeRef.current = performance.now()

    intervalRef.current = setInterval(() => {
      const elapsed = (performance.now() - startTimeRef.current) / 1000
      const remaining = Math.ceil(duration - elapsed)
      setInspectionTime(Math.max(0, remaining))

      if (remaining <= 0) {
        clearInterval(intervalRef.current)
        // Auto-DNF at 0
        setTimerState('idle')
      }
    }, 100)

    return () => clearInterval(intervalRef.current)
  }, [timerState, settings.inspection_duration, setTimerState, setInspectionTime])

  return null
}
