'use client'
import { ScramblePreview } from '@/components/practice/ScramblePreview'

// The cube as the 3x3 lessons hold it: white on the bottom. cubing.js
// starts with white on top, so every view gets a z2 first.
export const held = (scramble: string) => `z2 ${scramble}`

export function ScrambleLine({ scramble }: { scramble: string }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className="label">Scramble · white on the bottom, green in front</span>
      <p className="num text-[13px] leading-relaxed text-ink-2 break-words">{scramble}</p>
    </div>
  )
}

export function StillCube({ scramble }: { scramble: string }) {
  return (
    <div className="grid place-items-center rounded-xl bg-sunk/60 py-2">
      <ScramblePreview scramble={held(scramble)} puzzle="333" mode="3d" size={220} />
      <span className="text-[11px] text-muted pb-1">drag to look around</span>
    </div>
  )
}
