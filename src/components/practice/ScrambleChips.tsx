'use client'
import { groupScramble } from '@/lib/practice'

const SIZES = {
  sm: 'text-[13px] min-w-[26px] px-1.5 pt-1 pb-[5px]',
  md: 'text-[15px] md:text-[18px] min-w-[30px] md:min-w-[36px] px-1.5 md:px-2 pt-1.5 pb-[7px]',
  lg: 'text-[18px] md:text-[23px] min-w-[36px] md:min-w-[44px] px-2 md:px-2.5 pt-2 pb-[9px]',
}

/** Scramble as move chips underlined in the colour of the face each move
 *  turns, grouped for reading (fives; one line per WCA Megaminx row). */
export function ScrambleChips({ scramble, puzzle, size = 'md', align = 'center' }: {
  scramble: string
  puzzle: string
  size?: 'sm' | 'md' | 'lg'
  align?: 'center' | 'start'
}) {
  const groups = groupScramble(scramble, puzzle)
  if (!groups.length) {
    return <p className="num text-sm text-faint animate-pulse-glow">Generating scramble…</p>
  }
  const dense = puzzle === 'minx' || puzzle === 'sq1'
  const chip = dense ? SIZES.sm : SIZES[size]
  return (
    <div
      className={`flex flex-wrap gap-x-4 md:gap-x-5 gap-y-2.5 ${align === 'center' ? 'justify-center' : 'justify-start'}`}
      aria-label={`Scramble: ${scramble}`}
    >
      {groups.map((g, gi) => (
        <span key={gi} className="flex gap-1">
          {g.map((t, i) => (
            <span
              key={i}
              aria-hidden
              className={`num font-semibold leading-none text-center rounded-[7px] bg-surface text-ink border border-line ${chip}`}
              style={{ borderBottom: `3px solid ${t.face ? `var(--st-${t.face})` : 'var(--line-strong)'}` }}
            >
              {t.text}
            </span>
          ))}
        </span>
      ))}
    </div>
  )
}
