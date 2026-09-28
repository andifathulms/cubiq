// Small recognisable puzzle marks (replace the emoji). Colours come from
// the sticker tokens so they adapt to the theme.
const COLORS: Record<string, string> = {
  '333': 'var(--st-F)', '222': 'var(--st-L)', '444': 'var(--st-B)', '555': 'var(--st-R)',
  pyram: 'var(--st-D)', skewb: 'var(--st-U)', minx: 'var(--st-F)', sq1: 'var(--st-L)', clock: 'var(--st-B)',
}

export function PuzzleGlyph({ puzzle, size = 14 }: { puzzle: string; size?: number }) {
  const c = COLORS[puzzle] ?? 'var(--st-F)'
  const n = { '222': 2, '333': 3, '444': 4, '555': 5 }[puzzle]
  let body: React.ReactNode
  if (n) {
    const s = 12 / n
    const cells = []
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      cells.push(<rect key={`${i}${j}`} x={j * s + 0.45} y={i * s + 0.45} width={s - 0.9} height={s - 0.9} rx={Math.min(0.9, s * 0.2)} fill={c} />)
    }
    body = cells
  } else if (puzzle === 'pyram') body = <path d="M6 .8L11.4 11H.6z" fill={c} />
  else if (puzzle === 'skewb') body = <path d="M6 .5L11.5 6 6 11.5.5 6z" fill={c} />
  else if (puzzle === 'minx') body = <path d="M6 .6l5.3 3.9-2 6.3H2.7l-2-6.3z" fill={c} />
  else if (puzzle === 'sq1') body = <path d="M1 1h6l4 4v6H5L1 7z" fill={c} />
  else body = <circle cx="6" cy="6" r="5.2" fill={c} />
  return <svg aria-hidden viewBox="0 0 12 12" width={size} height={size} className="shrink-0">{body}</svg>
}
