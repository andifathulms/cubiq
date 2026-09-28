'use client'
import { useEffect, useRef, useState } from 'react'

/** Measured content width of an element (for crisp, unscaled SVG text). */
export function useWidth<T extends HTMLElement>(initial = 600) {
  const ref = useRef<T>(null)
  const [w, setW] = useState(initial)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}
