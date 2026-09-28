// Cubiq mark: a 3×3 face in WCA sticker colours (the green centre is the
// "go" light). Fixed colours on a dark tile so it reads in both themes.
const CELLS = ['#F2F4F7', '#FFD23F', '#22B45A', '#3D7BFF', '#2BD17E', '#FF4B55', '#FF8A2A', '#F2F4F7', '#3D7BFF']

export function Logo({ size = 30 }: { size?: number }) {
  const cell = (size - 8) / 3
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0"
      style={{
        gridTemplateColumns: `repeat(3, ${cell}px)`, gap: 1.5, padding: 2.5,
        borderRadius: size * 0.24, background: '#0B0D11', width: size, height: size,
      }}
    >
      {CELLS.map((c, i) => <i key={i} style={{ background: c, borderRadius: cell * 0.22, display: 'block' }} />)}
    </span>
  )
}
