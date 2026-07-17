'use client'
/* eslint-disable react-hooks/refs -- requestAnimationFrame-driven sim: the
   mutable state lives in a ref and renders are forced explicitly per frame */
import { useEffect, useReducer, useRef } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import {
  SOLVED, type Sq1Token, applySq1Token, norm, parseSq1Tokens,
  sq1SideColor, sq1TokenLabel, sq1Wedges, type Sq1Wedge,
} from '@/lib/sq1'

// Custom 3D Square-1 (cubing.js has no 3D renderer for square1). Wedges
// are kite/triangle prisms extruded from the cube cross-section, plus the
// two equator halves. Orthographic projection onto SVG with painter's
// sorting and backface culling; drag to orbit. Twists rotate a layer
// about the vertical axis; the slash carries the exchanged halves between
// layers with a 180° spin (and spins the equator), landing every wedge on
// exactly the slot the engine assigns it.

type V3 = [number, number, number]
interface Face {
  pts: V3[]
  color: string
  stroke?: string
}

const PLASTIC = '#15151d'
// The cross-section square is rotated -15° from axis-aligned: the slash
// cut runs north-south through two FACE points, so square corners sit at
// 30°/120°/210°/300° and face centers at 75°/165°/255°/345° (which is
// exactly the sq1SideColor zone layout). Polar helpers, angles clockwise
// from north:
const polar = (deg: number, r: number): [number, number] => {
  const a = (deg * Math.PI) / 180
  return [r * Math.sin(a), r * Math.cos(a)]
}
const R_FACE = 1 / Math.cos(Math.PI / 12)   // square boundary 15° off a face center
const R_CORN = Math.SQRT2                    // square corner
// cross-sections at their symmetric home arcs, clockwise from above
const CORNER_POLY: [number, number][] = [[0, 0], polar(0, R_FACE), polar(30, R_CORN), polar(60, R_FACE)]
const CORNER_HOME = 0
const EDGE_POLY: [number, number][] = [[0, 0], polar(60, R_FACE), polar(90, R_FACE)]
const EDGE_HOME = 2
const EQ_WEST: [number, number][] = [polar(180, R_FACE), polar(210, R_CORN), polar(300, R_CORN), polar(0, R_FACE)]
const EQ_EAST: [number, number][] = [polar(0, R_FACE), polar(30, R_CORN), polar(120, R_CORN), polar(180, R_FACE)]
const EQ_WEST_COLORS = ['var(--face-F)', 'var(--face-L)', 'var(--face-B)', '']
const EQ_EAST_COLORS = ['var(--face-B)', 'var(--face-R)', 'var(--face-F)', '']
const Z_CUT = 1 / 3

function rotCW(p: [number, number], deg: number): [number, number] {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return [p[0] * c + p[1] * s, -p[0] * s + p[1] * c]
}

// prism from a cross-section: top/bottom caps + side quads.
// sideColors[i] colors the quad from poly[i] to poly[i+1] ('' = plastic).
function prism(
  poly: [number, number][], z0: number, z1: number,
  capTop: string, capBot: string, sideColors: string[],
  rotDeg: number, dz: number, faces: Face[],
) {
  const pts = poly.map(p => rotCW(p, rotDeg))
  const lo = pts.map(([x, y]) => [x, y, z0 + dz] as V3)
  const hi = pts.map(([x, y]) => [x, y, z1 + dz] as V3)
  faces.push({ pts: [...hi].reverse(), color: capTop })
  faces.push({ pts: lo, color: capBot })
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    faces.push({ pts: [lo[i], lo[j], hi[j], hi[i]], color: sideColors[i] || PLASTIC })
  }
}

function wedgeFaces(
  wg: Sq1Wedge, rotDeg: number, dz: number, capOnTop: boolean, faces: Face[],
) {
  const isCorner = wg.cells.length === 2
  const poly = isCorner ? CORNER_POLY : EDGE_POLY
  const home = isCorner ? CORNER_HOME : EDGE_HOME
  const cap = wg.cells[0] < 12 ? 'var(--face-U)' : 'var(--face-D)'
  const sides = isCorner
    ? ['', sq1SideColor(wg.cells[0]), sq1SideColor(wg.cells[1]), '']
    : ['', sq1SideColor(wg.cells[0]), '']
  const [z0, z1] = wg.layer === 0 ? [Z_CUT, 1] : [-1, -Z_CUT]
  prism(poly, z0, z1,
    capOnTop ? cap : PLASTIC, capOnTop ? PLASTIC : cap,
    sides, 30 * (wg.slot - home) + rotDeg, dz, faces)
}

interface Props {
  setup: string
  alg: string
  height?: number
}

export function Sq1View3D({ setup, alg, height = 260 }: Props) {
  const [, force] = useReducer((x: number) => x + 1, 0)
  const sim = useRef({
    w: SOLVED,
    eq: 0,
    tokens: [] as Sq1Token[],
    idx: 0,
    t: 0,
    playing: true,
    last: 0,
    raf: 0,
    az: 32,
    el: 26,
    drag: null as null | { x: number; y: number },
  })

  useEffect(() => {
    const s = sim.current
    const init = parseSq1Tokens(setup)
    s.w = init.reduce(applySq1Token, SOLVED)
    s.eq = init.filter(t => t.kind === 'slash').length & 1
    s.tokens = parseSq1Tokens(alg)
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
            ? 600
            : 280 + 60 * Math.max(Math.abs(norm(tok.u)), Math.abs(norm(tok.d)))
          st.t += (ts - st.last) / dur
          if (st.t >= 1) {
            st.w = applySq1Token(st.w, tok)
            if (tok.kind === 'slash') st.eq ^= 1
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

  let rotTop = 0
  let rotBot = 0
  let slashT = 0
  if (tok?.kind === 'twist') {
    rotTop = 30 * norm(tok.u) * ease
    rotBot = 30 * norm(tok.d) * ease
  } else if (tok?.kind === 'slash') {
    slashT = ease
  }

  // build faces from the committed state + animation offsets
  const faces: Face[] = []
  for (const wg of sq1Wedges(s.w)) {
    const carried = slashT > 0
      && ((wg.layer === 0 && wg.slot >= 6) || (wg.layer === 1 && wg.slot < 6))
    let rot = wg.layer === 0 ? rotTop : rotBot
    let dz = 0
    let capOnTop = wg.layer === 0
    if (carried) {
      rot = 180 * slashT
      dz = (wg.layer === 0 ? -1 : 1) * (4 / 3) * slashT
      if (slashT > 0.5) capOnTop = wg.layer !== 0
    }
    wedgeFaces(wg, rot, dz, capOnTop, faces)
  }
  const eqRot = 180 * s.eq + 180 * slashT
  prism(EQ_WEST, -Z_CUT, Z_CUT, PLASTIC, PLASTIC, EQ_WEST_COLORS, eqRot, 0, faces)
  prism(EQ_EAST, -Z_CUT, Z_CUT, PLASTIC, PLASTIC, EQ_EAST_COLORS, eqRot, 0, faces)

  // orthographic projection with painter's sorting
  const azr = (s.az * Math.PI) / 180
  const elr = (s.el * Math.PI) / 180
  const ca = Math.cos(azr)
  const sa = Math.sin(azr)
  const ce = Math.cos(elr)
  const se = Math.sin(elr)
  const SC = 58
  const CX = 160
  const CYc = 122

  const project = (p: V3): { x: number; y: number; d: number } => {
    const x1 = p[0] * ca - p[1] * sa
    const y1 = p[0] * sa + p[1] * ca
    return {
      x: CX + SC * x1,
      y: CYc - SC * (p[2] * ce + y1 * se),
      d: y1 * ce - p[2] * se,
    }
  }

  const drawn = faces
    .map(f => {
      const pr = f.pts.map(project)
      // screen-space winding for backface culling (positive area = facing away)
      let area = 0
      for (let i = 0; i < pr.length; i++) {
        const j = (i + 1) % pr.length
        area += pr[i].x * pr[j].y - pr[j].x * pr[i].y
      }
      return {
        d: pr.reduce((a, p) => a + p.d, 0) / pr.length,
        area,
        path: `M ${pr.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')} Z`,
        color: f.color,
      }
    })
    .filter(f => f.area < 0)
    .sort((a, b) => b.d - a.d)

  return (
    <div className="w-full flex flex-col items-center gap-1">
      <svg
        viewBox="0 0 320 244"
        style={{ width: '100%', maxWidth: 360, height: height - 40, touchAction: 'none', cursor: 'grab' }}
        onPointerDown={e => {
          sim.current.drag = { x: e.clientX, y: e.clientY }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={e => {
          const st = sim.current
          if (!st.drag) return
          st.az += (e.clientX - st.drag.x) * 0.5
          st.el = Math.max(-80, Math.min(80, st.el + (e.clientY - st.drag.y) * 0.5))
          st.drag = { x: e.clientX, y: e.clientY }
          force()
        }}
        onPointerUp={() => { sim.current.drag = null }}
      >
        {drawn.map((f, i) => (
          <path key={i} d={f.path} fill={f.color} stroke="rgba(0,0,0,0.6)" strokeWidth="1" strokeLinejoin="round" />
        ))}
      </svg>

      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            const st = sim.current
            if (st.idx >= st.tokens.length) {
              const init = parseSq1Tokens(setup)
              st.w = init.reduce(applySq1Token, SOLVED)
              st.eq = init.filter(t => t.kind === 'slash').length & 1
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
            const init = parseSq1Tokens(setup)
            st.w = init.reduce(applySq1Token, SOLVED)
            st.eq = init.filter(t => t.kind === 'slash').length & 1
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
          {tok ? ` · ${sq1TokenLabel(tok)}` : s.tokens.length ? ' · done' : ''}
        </span>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>drag to orbit</span>
      </div>
    </div>
  )
}
