'use client'
import { useEffect, useRef, useState } from 'react'

export interface PlayerStage {
  name: string
  kind?: string
  moveCount: number   // number of animated moves in this stage
}

interface Props {
  setup: string        // applied instantly (scramble + any pre-solved stages)
  alg: string          // the moves that animate
  height?: number
  puzzle?: string      // TwistyPlayer puzzle id, e.g. '3x3x3' | '4x4x4'
  stages?: PlayerStage[]  // optional: show which step the current move is in
}

const SPEEDS = [0.5, 1, 2, 4] as const

export function AnimatedCube({ setup, alg, height = 260, puzzle = '3x3x3', stages }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<HTMLElement | null>(null)
  const [speed, setSpeed] = useState(2)
  const [stageIdx, setStageIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    let disposed = false
    let unlisten: (() => void) | undefined

    async function mount() {
      await import('cubing/twisty')
      if (disposed || !containerRef.current) return
      const existing = containerRef.current.querySelector('twisty-player')
      if (existing) existing.remove()
      const player = document.createElement('twisty-player') as unknown as HTMLElement & {
        togglePlay?: (play?: boolean) => void
        experimentalModel?: {
          currentMoveInfo: {
            addFreshListener: (cb: (i: { patternIndex: number }) => void) => void
            removeFreshListener: (cb: unknown) => void
          }
        }
      }
      player.setAttribute('experimental-setup-alg', setup)
      player.setAttribute('alg', alg)
      player.setAttribute('puzzle', puzzle)
      player.setAttribute('visualization', '3D')
      player.setAttribute('background', 'none')
      player.setAttribute('control-panel', 'bottom-row')  // play/pause, step ◀▶, scrubber
      player.setAttribute('tempo-scale', String(speed))
      player.style.width = '100%'
      player.style.height = `${height}px`
      containerRef.current!.appendChild(player)
      playerRef.current = player

      // Track which stage the current move belongs to (patternIndex is the
      // cumulative position in the alg — how many moves have been applied)
      if (stages && stages.length && player.experimentalModel) {
        const bounds: number[] = []
        let acc = 0
        for (const s of stages) { acc += s.moveCount; bounds.push(acc) }
        const listener = (info: { patternIndex: number }) => {
          const done = info.patternIndex
          let idx = bounds.findIndex(b => done < b)
          if (idx === -1) idx = stages.length - 1
          setStageIdx(idx)
        }
        player.experimentalModel.currentMoveInfo.addFreshListener(listener)
        unlisten = () => player.experimentalModel?.currentMoveInfo.removeFreshListener(listener)
      }

      // Spacebar toggles play/pause (unless typing in a field)
      const onKey = (e: KeyboardEvent) => {
        if (e.code !== 'Space') return
        const t = e.target as HTMLElement | null
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
        e.preventDefault()
        player.togglePlay?.()
      }
      window.addEventListener('keydown', onKey)
      const prevUnlisten = unlisten
      unlisten = () => { prevUnlisten?.(); window.removeEventListener('keydown', onKey) }
    }
    mount()
    return () => { disposed = true; unlisten?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup, alg, height, puzzle])

  function setTempo(v: number) {
    setSpeed(v)
    playerRef.current?.setAttribute('tempo-scale', String(v))
  }

  const currentStage = stages && stageIdx !== null ? stages[stageIdx] : null

  return (
    <div className="w-full relative">
      {currentStage && (
        <div
          className="absolute top-1 right-1 z-10 px-2 py-0.5 rounded-lg text-[11px] font-display font-semibold pointer-events-none"
          style={{ background: 'var(--bg-surface)', color: 'var(--accent-primary)', border: '1px solid var(--border)' }}
        >
          {currentStage.name}
        </div>
      )}
      <div ref={containerRef} className="w-full" style={{ height }} />
      <div className="flex items-center justify-center gap-1.5 mt-1">
        <span className="text-[10px] mr-1" style={{ color: 'var(--text-muted)' }}>speed</span>
        {SPEEDS.map(v => (
          <button
            key={v}
            onClick={() => setTempo(v)}
            className="px-1.5 py-0.5 rounded text-[11px] font-mono tabular-nums transition-colors"
            style={{
              background: speed === v ? 'var(--accent-primary)20' : 'var(--bg-elevated)',
              color: speed === v ? 'var(--accent-primary)' : 'var(--text-muted)',
            }}
          >
            {v}×
          </button>
        ))}
      </div>
    </div>
  )
}
