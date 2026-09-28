'use client'
import { useEffect, useRef } from 'react'

const COLORS = ['#F2F4F7', '#FFD23F', '#22B45A', '#3D7BFF', '#FF4B55', '#FF8A2A']

/** A ~700ms burst of sticker-coloured squares from the centre of the
 *  timer when a record falls. Skipped under reduced motion. */
export function Confetti({ fire }: { fire: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!fire || !ref.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const canvas = ref.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const { width, height } = canvas.getBoundingClientRect()
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)
    const parts = Array.from({ length: 90 }, () => {
      const a = Math.random() * Math.PI * 2, v = 4 + Math.random() * 8
      return { x: width / 2, y: height / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, s: 5 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: COLORS[Math.floor(Math.random() * 6)] }
    })
    const t0 = performance.now()
    let raf = 0
    const frame = (now: number) => {
      const t = (now - t0) / 900
      ctx.clearRect(0, 0, width, height)
      if (t >= 1) return
      for (const p of parts) {
        p.vy += 0.35; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr
        ctx.save()
        ctx.globalAlpha = 1 - t * t
        ctx.translate(p.x, p.y)
        ctx.rotate(p.r)
        ctx.fillStyle = p.c
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s)
        ctx.restore()
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [fire])
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 w-full h-full z-20" />
}
