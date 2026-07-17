'use client'
/* eslint-disable react-hooks/refs -- requestAnimationFrame-driven sim: the
   mutable state lives in a ref and renders are forced explicitly per frame */
import { useEffect, useReducer, useRef } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import {
  CORNER_FIRST, EDGES, SOLVED, type Sq1Token, applySq1Token, norm,
  parseSq1Tokens, sq1TokenLabel, sq1Wedges,
} from '@/lib/sq1'

// Custom 3D Square-1 (cubing.js has no 3D renderer for square1). The puzzle
// is built from kite/triangle prisms. Faces point along the cardinal
// directions (N/E/S/W) so the slash cut (north-south) is a symmetry axis —
// which makes the slash a genuine rigid 180° flip of the moving half about
// the horizontal north-south (Y) axis, and makes the bottom layer exactly
// the top rotated 180° about the X axis. Twists rotate a layer about the
// vertical (Z) axis. Orthographic SVG projection, painter-sorted and drawn
// double-sided (back faces are dark interior plastic); drag to orbit.

type V3 = [number, number, number]
interface Face { pts: V3[]; color: string }

const PLASTIC = '#3a3a48'
const SHIFT = 15  // face centres at 0/90/180/270, corners at 45/135/225/315
const R_FACE = 1 / Math.cos(Math.PI / 12)
const R_CORN = Math.SQRT2
const Z_CUT = 1 / 3
const polar = (deg: number, r: number): V3 => {
  const a = (deg * Math.PI) / 180
  return [r * Math.sin(a), r * Math.cos(a), 0]
}
const CORNER_POLY: V3[] = [[0, 0, 0], polar(SHIFT, R_FACE), polar(30 + SHIFT, R_CORN), polar(60 + SHIFT, R_FACE)]
const EDGE_POLY: V3[] = [[0, 0, 0], polar(60 + SHIFT, R_FACE), polar(90 + SHIFT, R_FACE)]
const CORNER_HOME = 0
const EDGE_HOME = 2
// equator halves either side of the north-south cut (east: x>0, west: x<0)
const EQ_EAST: V3[] = [polar(0, R_FACE), polar(45, R_CORN), polar(135, R_CORN), polar(180, R_FACE)]
const EQ_WEST: V3[] = [polar(180, R_FACE), polar(225, R_CORN), polar(315, R_CORN), polar(360, R_FACE)]

const rad = (d: number) => (d * Math.PI) / 180
function rotZ(p: V3, d: number): V3 {
  const c = Math.cos(rad(d)), s = Math.sin(rad(d))
  return [p[0] * c + p[1] * s, -p[0] * s + p[1] * c, p[2]]
}
function rotY(p: V3, d: number): V3 {   // about the horizontal north-south axis
  const c = Math.cos(rad(d)), s = Math.sin(rad(d))
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]
}
const rx180 = (p: V3): V3 => [p[0], -p[1], -p[2]]

function zoneColor(x: number, y: number): string {
  const a = (Math.atan2(x, y) * 180 / Math.PI + 360) % 360
  if (a >= 45 && a < 135) return 'var(--face-R)'
  if (a >= 135 && a < 225) return 'var(--face-F)'
  if (a >= 225 && a < 315) return 'var(--face-L)'
  return 'var(--face-B)'
}

// One prism per wedge. Built in "top style" (rotated to its slot, extruded
// z = Z_CUT..1); a bottom-layer wedge is that rotated 180° about X, so the
// slash — a 180° rotation about Y — maps a top wedge exactly onto its bottom
// counterpart. `role`: 'cap' is the outward sticker cap; a number i is the
// side quad from cross-section vertex i to i+1.
function wedgePrism(cell: number, slot: number, layer: 0 | 1, twistDeg: number,
                    slashDeg: number): { pts: V3[]; role: 'cap' | number }[] {
  const corner = CORNER_FIRST.has(cell)
  const poly = corner ? CORNER_POLY : EDGE_POLY
  const home = corner ? CORNER_HOME : EDGE_HOME
  const base = poly.map(p => rotZ(p, 30 * (slot - home) + twistDeg))
  let lo = base.map(p => [p[0], p[1], Z_CUT] as V3)
  let hi = base.map(p => [p[0], p[1], 1] as V3)
  if (layer === 1) { lo = lo.map(rx180); hi = hi.map(rx180) }
  if (slashDeg) { lo = lo.map(p => rotY(p, slashDeg)); hi = hi.map(p => rotY(p, slashDeg)) }
  const out: { pts: V3[]; role: 'cap' | number }[] = [{ pts: [...hi].reverse(), role: 'cap' }]
  for (let i = 0; i < base.length; i++) {
    const j = (i + 1) % base.length
    out.push({ pts: [lo[i], lo[j], hi[j], hi[i]], role: i })
  }
  return out
}

// Per-piece sticker colours, fixed to each piece from its SOLVED placement so
// they travel with the piece when it moves. Computed once from the geometry.
const CAP_COLOR = new Map<number, string>()
const SIDE_COLOR = new Map<number, (string | null)[]>()
for (let cell = 0; cell < 24; cell++) {
  if (!CORNER_FIRST.has(cell) && !EDGES.has(cell)) continue
  const layer: 0 | 1 = cell < 12 ? 0 : 1
  const corner = CORNER_FIRST.has(cell)
  CAP_COLOR.set(cell, layer === 0 ? 'var(--face-U)' : 'var(--face-D)')
  const sides: (string | null)[] = []
  for (const f of wedgePrism(cell, cell % 12, layer, 0, 0)) {
    if (f.role === 'cap') continue
    const i = f.role as number
    const sticker = corner ? (i === 1 || i === 2) : i === 1
    sides[i] = sticker ? zoneColor((f.pts[0][0] + f.pts[1][0]) / 2, (f.pts[0][1] + f.pts[1][1]) / 2) : null
  }
  SIDE_COLOR.set(cell, sides)
}

// Equator half as a prism; only its outer arc walls carry stickers.
function eqPrism(poly: V3[], eqDeg: number): { pts: V3[]; color: string }[] {
  const lo = poly.map(p => rotY([p[0], p[1], -Z_CUT], eqDeg))
  const hi = poly.map(p => rotY([p[0], p[1], Z_CUT], eqDeg))
  const out: { pts: V3[]; color: string }[] = []
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length
    // the diameter wall (last, along the cut) is internal → plastic
    const color = i === poly.length - 1 ? PLASTIC
      : zoneColor((poly[i][0] + poly[j][0]) / 2, (poly[i][1] + poly[j][1]) / 2)
    out.push({ pts: [lo[i], lo[j], hi[j], hi[i]], color })
  }
  return out
}

// Build every face of the current state (wedges + equator) with animation
// offsets. Only stickered faces are emitted (the outer shell); the renderer
// draws them double-sided so backs read as dark interior plastic — no
// see-through, no internal geometry poking out.
function buildFaces(w: number[], eq: number, rotTop: number, rotBot: number,
                    slashT: number): Face[] {
  const faces: Face[] = []
  const slashDeg = 180 * slashT
  for (const wg of sq1Wedges(w)) {
    const cell = wg.cells[0]
    const twistDeg = wg.layer === 0 ? rotTop : rotBot
    // the moving half of a slash: top slots 6–11 and bottom slots 0–5
    const moving = slashT > 0
      && ((wg.layer === 0 && wg.slot >= 6) || (wg.layer === 1 && wg.slot < 6))
    const sides = SIDE_COLOR.get(cell)!
    for (const f of wedgePrism(cell, wg.slot, wg.layer, twistDeg, moving ? slashDeg : 0)) {
      const color = f.role === 'cap' ? CAP_COLOR.get(cell)! : sides[f.role as number]
      if (color) faces.push({ pts: f.pts, color })
    }
  }
  // the whole equator flips with the slash (parity toggles per slash)
  const eqDeg = 180 * eq + slashDeg
  for (const f of eqPrism(EQ_EAST, eqDeg)) if (f.color !== PLASTIC) faces.push(f)
  for (const f of eqPrism(EQ_WEST, eqDeg)) if (f.color !== PLASTIC) faces.push(f)
  return faces
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
      // commit no-op (0,0) alignment tokens instantly
      while (st.idx < st.tokens.length) {
        const tk = st.tokens[st.idx]
        if (tk.kind === 'twist' && norm(tk.u) === 0 && norm(tk.d) === 0) {
          st.idx += 1
        } else break
      }
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
    // twists rotate a layer about the vertical axis (short way)
    rotTop = 30 * norm(tok.u) * ease
    rotBot = 30 * norm(tok.d) * ease
  } else if (tok?.kind === 'slash') {
    slashT = ease
  }

  const faces = buildFaces(s.w, s.eq, rotTop, rotBot, slashT)

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

  const projected = faces.map(f => {
    const pr = f.pts.map(project)
    // screen-space winding for backface culling (positive area = facing away)
    let area = 0
    for (let i = 0; i < pr.length; i++) {
      const j = (i + 1) % pr.length
      area += pr[i].x * pr[j].y - pr[j].x * pr[i].y
    }
    // Newell normal (consistent CCW-from-outside winding → points outward)
    let nx = 0, ny = 0, nz = 0
    for (let i = 0; i < f.pts.length; i++) {
      const a = f.pts[i]
      const b = f.pts[(i + 1) % f.pts.length]
      nx += (a[1] - b[1]) * (a[2] + b[2])
      ny += (a[2] - b[2]) * (a[0] + b[0])
      nz += (a[0] - b[0]) * (a[1] + b[1])
    }
    const nl = Math.hypot(nx, ny, nz) || 1
    // camera-attached light: brightest facing the camera, bonus for facing up
    const ny1 = (nx * sa + ny * ca) / nl
    const nDepth = ny1 * ce - (nz / nl) * se
    const nUp = (nz / nl) * ce + ny1 * se
    const lit = Math.max(0, Math.abs(nDepth)) * 0.55 + Math.max(0, nUp) * 0.45
    // Double-sided: a camera-facing face (area < 0) shows its sticker; a face
    // turned away shows dark interior plastic. So every silhouette is backed —
    // orbiting or a mid-solve shape never reveals the background — with no
    // internal geometry that could poke through as a star or dark band.
    const front = area < 0
    return {
      d: pr.reduce((a, p) => a + p.d, 0) / pr.length,
      path: `M ${pr.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')} Z`,
      color: front ? f.color : PLASTIC,
      shade: Math.min(0.34, 0.42 * (1 - Math.min(1, lit))) + (front ? 0 : 0.12),
    }
  })
  // painter's, far-to-near: larger d is nearer, so ascending draws the far
  // (interior/back) faces first and the near stickers last, on top.
  const drawn = projected.sort((a, b) => a.d - b.d)

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
          <g key={i}>
            <path d={f.path} fill={f.color} stroke="rgba(0,0,0,0.6)" strokeWidth="1" strokeLinejoin="round" />
            {f.shade > 0.02 && <path d={f.path} fill="black" fillOpacity={f.shade} />}
          </g>
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
