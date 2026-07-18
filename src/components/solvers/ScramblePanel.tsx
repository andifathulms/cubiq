'use client'
import { useEffect, useRef, useState } from 'react'
import { Copy, Check, Shuffle } from 'lucide-react'
import { generateScramble } from '@/lib/cubing'

// A static 3D view of the scrambled state (applied instantly, draggable, no
// playback) — the "here's your scramble" preview shown before solving.
function ScrambledPreview({ scramble, twistyId, height }: { scramble: string; twistyId: string; height: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current || !scramble) return
    let disposed = false
    async function mount() {
      await import('cubing/twisty')
      if (disposed || !ref.current) return
      ref.current.querySelector('twisty-player')?.remove()
      const p = document.createElement('twisty-player') as unknown as HTMLElement
      p.setAttribute('experimental-setup-alg', scramble)
      p.setAttribute('alg', '')
      p.setAttribute('puzzle', twistyId)
      p.setAttribute('visualization', '3D')
      p.setAttribute('background', 'none')
      p.setAttribute('control-panel', 'none')
      p.style.width = '100%'
      p.style.height = `${height}px`
      ref.current.appendChild(p)
    }
    mount()
    return () => { disposed = true }
  }, [scramble, twistyId, height])
  return <div ref={ref} className="w-full" style={{ height }} />
}

interface Props {
  puzzle: string          // PuzzleType for generateScramble, e.g. '333'
  twistyId: string        // TwistyPlayer id, e.g. '3x3x3'
  scramble: string
  onScramble: (s: string) => void
  previewHeight?: number
}

export function ScramblePanel({ puzzle, twistyId, scramble, onScramble, previewHeight = 200 }: Props) {
  const [copied, setCopied] = useState(false)

  // Auto-generate the first scramble so a cube is always on screen
  useEffect(() => {
    if (!scramble) onScramble(generateScramble(puzzle))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle])

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="eyebrow">Scramble</span>
        <button
          onClick={() => { navigator.clipboard.writeText(scramble); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
          className="flex items-center gap-1 text-[11px] font-medium transition-colors"
          style={{ color: copied ? 'var(--accent-success)' : 'var(--text-muted)' }}
          title="Copy scramble"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Cube preview — the reference you're solving against */}
      <div
        className="flex justify-center rounded-xl py-2"
        style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}
      >
        <div className="w-full max-w-xs">
          <ScrambledPreview scramble={scramble} twistyId={twistyId} height={previewHeight} />
        </div>
      </div>

      <input
        value={scramble}
        onChange={e => onScramble(e.target.value)}
        spellCheck={false}
        className="w-full font-mono text-xs px-3 py-2.5 rounded-xl outline-none transition-colors focus:border-[var(--border-accent)]"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
      />

      <button
        onClick={() => onScramble(generateScramble(puzzle))}
        className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-transform active:scale-[0.98]"
        style={{ background: 'var(--gradient-accent)', color: '#08080c', boxShadow: '0 4px 16px -6px rgba(110,231,247,0.5)' }}
      >
        <Shuffle size={15} />
        New scramble
      </button>
    </div>
  )
}
