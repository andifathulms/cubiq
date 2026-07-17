'use client'
import { useEffect, useReducer, useRef } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'

// Custom animated Square-1 view. cubing.js's TwistyPlayer renders square1
// with a static 2D fallback (no turn animation), so this draws the two
// layers as discs from the same wedge model as cubiq-ml/solversq1.py and
// tweens every twist and slash.
//
// Geometry: 0° = up, angles grow clockwise. Top slot i and bottom slot
// 12+i both span [30i, 30i+30). The slash swaps top slots 6-11 with
// bottom slots 12-17: on screen, a 180° in-plane rotation plus a carry
// to the other disc — piece from top slot 6+j lands exactly on bottom
// slot 12+j, matching the engine's swap.

type Token = { kind: 'twist'; u: number; d: number } | { kind: 'slash' }

const CORNER_FIRST = new Set([0, 3, 6, 9, 12, 15, 18, 21])
const EDGES = new Set([2, 5, 8, 11, 14, 17, 20, 23])
const SOLVED = Array.from({ length: 24 }, (_, i) => i)

function norm(x: number): number {
  x = ((x % 12) + 12) % 12
  return x > 6 ? x - 12 : x
}

function parseTokens(s: string): Token[] {
  const out: Token[] = []
  for (const tok of s.replace(/\//g, ' / ').split(/\s+/)) {
    if (tok === '/') out.push({ kind: 'slash' })
    else if (tok.startsWith('(')) {
      const [u, d] = tok.replace(/[()]/g, '').split(',').map(Number)
      out.push({ kind: 'twist', u, d })
    }
  }
  return out
}

function applyToken(w: number[], t: Token): number[] {
  if (t.kind === 'twist') {
    const u = ((t.u % 12) + 12) % 12
    const d = ((t.d % 12) + 12) % 12
    const top = Array.from({ length: 12 }, (_, i) => w[(i - u + 12) % 12])
    const bot = Array.from({ length: 12 }, (_, i) => w[12 + ((i - d + 12) % 12)])
    return [...top, ...bot]
  }
  const nw = [...w]
  for (let i = 0; i < 6; i++) {
    const tmp = nw[6 + i]
    nw[6 + i] = nw[12 + i]
    nw[12 + i] = tmp
  }
  return nw
}

// side-sticker color by the cell's home direction (both layers share zones)
function sideColor(cell: number): string {
  const a = (30 * (cell % 12) + 15) % 360
  if (a >= 30 && a < 120) return 'var(--face-R)'
  if (a >= 120 && a < 210) return 'var(--face-F)'
  if (a >= 210 && a < 300) return 'var(--face-L)'
  return 'var(--face-B)'
}

const R_CAP = 52
const R_BAND = 80
const CY = 104
const CXT = 102
const CXB = 306

function pt(cx: number, cy: number, r: number, deg: number): string {
  const rad = (deg * Math.PI) / 180
  return `${(cx + r * Math.sin(rad)).toFixed(2)},${(cy - r * Math.cos(rad)).toFixed(2)}`
}

function capPath(cx: number, cy: number, a0: number, a1: number): string {
  return `M ${cx},${cy} L ${pt(cx, cy, R_CAP, a0)} A ${R_CAP} ${R_CAP} 0 0 1 ${pt(cx, cy, R_CAP, a1)} Z`
}

function bandPath(cx: number, cy: number, a0: number, a1: number): string {
  return `M ${pt(cx, cy, R_BAND, a0)} A ${R_BAND} ${R_BAND} 0 0 1 ${pt(cx, cy, R_BAND, a1)}`
    + ` L ${pt(cx, cy, R_CAP, a1)} A ${R_CAP} ${R_CAP} 0 0 0 ${pt(cx, cy, R_CAP, a0)} Z`
}

interface Wedge {
  slot: number          // layer-local 0-11
  layer: 0 | 1
  cells: number[]       // 1 (edge) or 2 (corner) cell ids
}

function wedgesOf(w: number[]): Wedge[] {
  const out: Wedge[] = []
  for (const layer of [0, 1] as const) {
    const base = layer * 12
    for (let s = 0; s < 12; s++) {
      const c = w[base + s]
      if (!CORNER_FIRST.has(c) && !EDGES.has(c)) continue  // corner-second cell
      out.push({
        slot: s,
        layer,
        cells: CORNER_FIRST.has(c) ? [c, c + 1] : [c],
      })
    }
  }
  return out
}

function tokenLabel(t: Token): string {
  return t.kind === 'slash' ? '/' : `(${norm(t.u)},${norm(t.d)})`
}

interface Props {
  setup: string   // applied instantly
  alg: string     // animated
  height?: number
}

export function Sq1AnimatedView({ setup, alg, height = 230 }: Props) {
  const [, force] = useReducer((x: number) => x + 1, 0)
  const sim = useRef({
    w: SOLVED,
    tokens: [] as Token[],
    idx: 0,
    t: 0,
    playing: true,
    last: 0,
    raf: 0,
  })

  useEffect(() => {
    const s = sim.current
    s.w = parseTokens(setup).reduce(applyToken, SOLVED)
    s.tokens = parseTokens(alg)
    s.idx = 0
    s.t = 0
    s.playing = true
    s.last = 0

    const tick = (ts: number) => {
      const st = sim.current
      if (st.playing && st.idx < st.tokens.length) {
        if (st.last) {
          const tok = st.tokens[st.idx]
          const dur = tok.kind === 'slash'
            ? 560
            : 260 + 60 * Math.max(Math.abs(norm(tok.u)), Math.abs(norm(tok.d)))
          st.t += (ts - st.last) / dur
          if (st.t >= 1) {
            st.w = applyToken(st.w, tok)
            st.idx += 1
            st.t = 0
          }
          force()
        }
        st.last = ts
      } else {
        st.last = 0
      }
      st.raf = requestAnimationFrame(tick)
    }
    s.raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(sim.current.raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup, alg])

  const s = sim.current
  const tok = s.idx < s.tokens.length ? s.tokens[s.idx] : null
  const ease = tok ? (1 - Math.cos(Math.PI * Math.min(s.t, 1))) / 2 : 0

  // per-layer rotation (twist) and slash carry transforms
  let rotTop = 0
  let rotBot = 0
  let slashT = 0
  if (tok?.kind === 'twist') {
    rotTop = 30 * norm(tok.u) * ease
    rotBot = 30 * norm(tok.d) * ease
  } else if (tok?.kind === 'slash') {
    slashT = ease
  }

  const wedges = wedgesOf(s.w)
  const dx = CXB - CXT

  const transformOf = (wg: Wedge): string | undefined => {
    const cx = wg.layer === 0 ? CXT : CXB
    if (tok?.kind === 'twist') {
      const rot = wg.layer === 0 ? rotTop : rotBot
      return rot ? `rotate(${rot} ${cx} ${CY})` : undefined
    }
    if (tok?.kind === 'slash' && slashT > 0) {
      if (wg.layer === 0 && wg.slot >= 6) {
        return `translate(${dx * slashT} 0) rotate(${180 * slashT} ${CXT} ${CY})`
      }
      if (wg.layer === 1 && wg.slot < 6) {
        return `translate(${-dx * slashT} 0) rotate(${180 * slashT} ${CXB} ${CY})`
      }
    }
    return undefined
  }

  const moving = (wg: Wedge) =>
    tok?.kind === 'slash' && ((wg.layer === 0 && wg.slot >= 6) || (wg.layer === 1 && wg.slot < 6))

  const renderWedge = (wg: Wedge, key: number) => {
    const cx = wg.layer === 0 ? CXT : CXB
    const a0 = 30 * wg.slot
    const span = wg.cells.length * 30
    const cap = wg.cells[0] < 12 ? 'var(--face-U)' : 'var(--face-D)'
    return (
      <g key={key} transform={transformOf(wg)}>
        <path d={capPath(cx, CY, a0, a0 + span)} fill={cap} stroke="rgba(0,0,0,0.55)" strokeWidth="1" />
        {wg.cells.map((c, i) => (
          <path
            key={i}
            d={bandPath(cx, CY, a0 + 30 * i, a0 + 30 * i + 30)}
            fill={sideColor(c)}
            stroke="rgba(0,0,0,0.55)"
            strokeWidth="1"
          />
        ))}
      </g>
    )
  }

  const stationary = wedges.filter(wg => !moving(wg))
  const carried = wedges.filter(moving)

  return (
    <div className="w-full flex flex-col items-center gap-1">
      <svg viewBox="0 0 408 208" style={{ width: '100%', maxWidth: 440, height: height - 40 }}>
        {[CXT, CXB].map((cx, i) => (
          <g key={i}>
            <circle cx={cx} cy={CY} r={R_BAND + 6} fill="var(--bg-surface)" stroke="var(--border)" />
            <line
              x1={cx} y1={CY - R_BAND - 6} x2={cx} y2={CY + R_BAND + 6}
              stroke="var(--text-muted)" strokeDasharray="3 4" strokeWidth="1" opacity="0.5"
            />
          </g>
        ))}
        {stationary.map(renderWedge)}
        {carried.map((wg, i) => renderWedge(wg, 1000 + i))}
        <text x={CXT} y={202} textAnchor="middle" fontSize="10" fill="var(--text-muted)" fontFamily="monospace">U layer</text>
        <text x={CXB} y={202} textAnchor="middle" fontSize="10" fill="var(--text-muted)" fontFamily="monospace">D layer</text>
      </svg>

      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            const st = sim.current
            if (st.idx >= st.tokens.length) {
              st.w = parseTokens(setup).reduce(applyToken, SOLVED)
              st.idx = 0
              st.t = 0
            }
            st.playing = !st.playing
            st.last = 0
            force()
          }}
          className="p-1 rounded transition-colors"
          style={{ color: 'var(--accent-primary)' }}
          title={s.playing ? 'Pause' : 'Play'}
        >
          {s.playing && s.idx < s.tokens.length ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button
          onClick={() => {
            const st = sim.current
            st.w = parseTokens(setup).reduce(applyToken, SOLVED)
            st.idx = 0
            st.t = 0
            st.playing = true
            st.last = 0
            force()
          }}
          className="p-1 rounded transition-colors"
          style={{ color: 'var(--text-muted)' }}
          title="Restart"
        >
          <RotateCcw size={14} />
        </button>
        <span className="font-mono text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
          {Math.min(s.idx + (tok ? 1 : 0), s.tokens.length)}/{s.tokens.length}
          {tok ? ` · ${tokenLabel(tok)}` : s.tokens.length ? ' · done' : ''}
        </span>
      </div>
    </div>
  )
}
