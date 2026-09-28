'use client'
import { useEffect, useRef, useState } from 'react'
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'

type Info = { timestamp: number; timeRange: { start: number; end: number } }
type TwistyEl = HTMLElement & {
  play?: () => void
  pause?: () => void
  jumpToStart?: () => void
  jumpToEnd?: () => void
  experimentalModel?: {
    detailedTimelineInfo: { addFreshListener: (cb: (i: Info) => void) => void; removeFreshListener: (cb: unknown) => void }
    playingInfo: { addFreshListener: (cb: (i: { playing: boolean }) => void) => void; removeFreshListener: (cb: unknown) => void }
    currentMoveInfo: { addFreshListener: (cb: (i: { patternIndex: number }) => void) => void; removeFreshListener: (cb: unknown) => void }
    timestampRequest: { set: (v: number | string) => void }
  }
}

const SPEEDS = [0.5, 1, 2, 4]

/** cubing.js TwistyPlayer with our own controls (its control bar is hidden):
 *  restart, play/pause, end, scrub, speed. Reports the index of the move
 *  being played so the caller can highlight the current stage. */
export function CubePlayer({ puzzle, setup, alg, height = 280, autoplay = true, onMove }: {
  puzzle: string
  setup: string
  alg: string
  height?: number
  autoplay?: boolean
  onMove?: (patternIndex: number) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const player = useRef<TwistyEl | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState<Info>({ timestamp: 0, timeRange: { start: 0, end: 0 } })
  const [speed, setSpeed] = useState(1)
  const onMoveRef = useRef(onMove)
  useEffect(() => { onMoveRef.current = onMove }, [onMove])

  useEffect(() => {
    if (!box.current) return
    let disposed = false
    let cleanup = () => {}
    import('cubing/twisty').then(() => {
      if (disposed || !box.current) return
      box.current.querySelector('twisty-player')?.remove()
      const p = document.createElement('twisty-player') as unknown as TwistyEl
      p.setAttribute('puzzle', puzzle)
      p.setAttribute('experimental-setup-alg', setup)
      p.setAttribute('alg', alg)
      p.setAttribute('visualization', '3D')
      p.setAttribute('background', 'none')
      p.setAttribute('control-panel', 'none')
      p.setAttribute('tempo-scale', String(speed))
      p.style.width = '100%'
      p.style.height = `${height}px`
      box.current.appendChild(p)
      player.current = p
      const m = p.experimentalModel
      if (m) {
        const onTime = (i: Info) => setTime(i)
        const onPlay = (i: { playing: boolean }) => setPlaying(i.playing)
        const onMv = (i: { patternIndex: number }) => onMoveRef.current?.(i.patternIndex)
        m.detailedTimelineInfo.addFreshListener(onTime)
        m.playingInfo.addFreshListener(onPlay)
        m.currentMoveInfo.addFreshListener(onMv)
        cleanup = () => {
          m.detailedTimelineInfo.removeFreshListener(onTime)
          m.playingInfo.removeFreshListener(onPlay)
          m.currentMoveInfo.removeFreshListener(onMv)
        }
      }
      if (autoplay && alg) setTimeout(() => { if (!disposed) p.play?.() }, 350)
    })
    return () => { disposed = true; cleanup() }
    // speed is applied live below; remounting on it would restart playback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle, setup, alg, height, autoplay])

  const setTempo = (v: number) => {
    setSpeed(v)
    player.current?.setAttribute('tempo-scale', String(v))
  }
  const { start, end } = time.timeRange
  const atEnd = end > start && time.timestamp >= end

  return (
    <div className="flex flex-col gap-3">
      <div ref={box} className="w-full rounded-xl bg-sunk/60" style={{ height }} aria-label="Solution animation" role="img" />
      <div className="flex items-center gap-2">
        <button className="btn btn-ghost btn-sm !px-2" aria-label="Back to start" onClick={() => player.current?.jumpToStart?.()}>
          <SkipBack size={14} />
        </button>
        <button
          className="btn btn-primary btn-sm !px-2.5" aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => {
            const p = player.current
            if (!p) return
            if (playing) p.pause?.()
            else { if (atEnd) p.jumpToStart?.(); p.play?.() }
          }}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button className="btn btn-ghost btn-sm !px-2" aria-label="Jump to end" onClick={() => player.current?.jumpToEnd?.()}>
          <SkipForward size={14} />
        </button>
        <input
          type="range" aria-label="Scrub through the solution"
          min={start} max={Math.max(end, start + 1)} step={1} value={time.timestamp}
          onChange={e => { player.current?.pause?.(); player.current?.experimentalModel?.timestampRequest.set(Number(e.target.value)) }}
          className="flex-1 min-w-0 accent-[var(--go)]"
        />
        <div className="seg" role="group" aria-label="Speed">
          {SPEEDS.map(v => (
            <button key={v} type="button" aria-pressed={speed === v} onClick={() => setTempo(v)} className="num !text-[10.5px] !px-1.5">{v}×</button>
          ))}
        </div>
      </div>
    </div>
  )
}
