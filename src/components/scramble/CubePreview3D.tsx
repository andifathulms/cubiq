'use client'
import { useEffect, useRef } from 'react'

interface Props {
  scramble: string
  interactive?: boolean
  puzzle?: string   // TwistyPlayer puzzle id, e.g. '3x3x3' | '4x4x4'
}

export function CubePreview3D({ scramble, interactive = true, puzzle = '3x3x3' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || !scramble) return

    async function mount() {
      await import('cubing/twisty')
      if (!containerRef.current) return

      const existing = containerRef.current.querySelector('twisty-player')
      if (existing) existing.remove()

      const player = document.createElement('twisty-player') as unknown as HTMLElement & Record<string, unknown>
      player.setAttribute('alg', scramble)
      player.setAttribute('puzzle', puzzle)
      player.setAttribute('visualization', '3D')
      player.setAttribute('control-panel', interactive ? 'bottom-row' : 'none')
      player.setAttribute('background', 'none')
      player.setAttribute('tempo-scale', '5')
      player.style.width = '100%'
      player.style.height = '100%'

      containerRef.current.appendChild(player)
    }

    mount()
  }, [scramble, interactive, puzzle])

  return (
    <div
      ref={containerRef}
      style={{ width: '220px', height: '220px' }}
      className="rounded-xl overflow-hidden"
    />
  )
}
