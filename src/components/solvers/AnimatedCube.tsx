'use client'
import { useEffect, useRef } from 'react'

interface Props {
  setup: string   // applied instantly (scramble + any pre-solved stages)
  alg: string     // the moves that animate
  height?: number
  puzzle?: string // TwistyPlayer puzzle id, e.g. '3x3x3' | '4x4x4'
}

export function AnimatedCube({ setup, alg, height = 260, puzzle = '3x3x3' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    async function mount() {
      await import('cubing/twisty')
      if (!containerRef.current) return
      const existing = containerRef.current.querySelector('twisty-player')
      if (existing) existing.remove()
      const player = document.createElement('twisty-player') as unknown as HTMLElement
      player.setAttribute('experimental-setup-alg', setup)
      player.setAttribute('alg', alg)
      player.setAttribute('puzzle', puzzle)
      player.setAttribute('visualization', '3D')
      player.setAttribute('background', 'none')
      player.setAttribute('tempo-scale', '2')
      player.style.width = '100%'
      player.style.height = `${height}px`
      containerRef.current!.appendChild(player)
    }
    mount()
  }, [setup, alg, height, puzzle])

  return <div ref={containerRef} className="w-full" style={{ height }} />
}
