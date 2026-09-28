'use client'
import { useEffect, useRef } from 'react'
import { TWISTY_PUZZLE_IDS } from '@/lib/cubing'
import { Sq1View3D } from '@/components/solvers/Sq1View3D'

type PreviewProps = {
  scramble: string
  puzzle: string
  mode: 'net' | '3d'
  size?: number
}

/** The scrambled state as a still net (2D) or draggable cube (3D) —
 *  cubing.js TwistyPlayer with its control bar hidden. cubing.js has no 3D
 *  Square-1, so that one uses our own solid model. */
export function ScramblePreview(props: PreviewProps) {
  if (props.puzzle === 'sq1' && props.mode === '3d') {
    const size = props.size ?? 190
    return <div style={{ width: size }} aria-label="Scrambled cube preview" role="img"><Sq1View3D setup={props.scramble} alg="" height={size} controls={false} /></div>
  }
  return <TwistyPreview {...props} />
}

function TwistyPreview({ scramble, puzzle, mode, size = 190 }: PreviewProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current || !scramble) return
    let disposed = false
    import('cubing/twisty').then(() => {
      if (disposed || !ref.current) return
      ref.current.querySelector('twisty-player')?.remove()
      const p = document.createElement('twisty-player') as unknown as HTMLElement
      p.setAttribute('puzzle', TWISTY_PUZZLE_IDS[puzzle] ?? '3x3x3')
      p.setAttribute('experimental-setup-alg', scramble)
      p.setAttribute('alg', '')
      p.setAttribute('visualization', mode === 'net' ? '2D' : '3D')
      p.setAttribute('control-panel', 'none')
      p.setAttribute('background', 'none')
      p.setAttribute('hint-facelets', 'none')
      p.style.width = '100%'
      p.style.height = '100%'
      ref.current.appendChild(p)
    })
    return () => { disposed = true }
  }, [scramble, puzzle, mode])
  return <div ref={ref} style={{ width: size, height: mode === 'net' ? size * 0.78 : size }} aria-label="Scrambled cube preview" role="img" />
}
