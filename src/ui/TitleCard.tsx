import { useLayoutEffect, useRef } from 'react'
import { store, useStore } from '../lib/store'
import { mulberry32 } from '../lib/rng'
import { clamp, lerp, smoothstep } from '../lib/anim'
import { GLYPHS } from './title-glyphs'
import { HALF, PEN, WORD_ENDS } from './title-pen'

// The title card, between the loader's check and the room: "Meet ZEN Design Team",
// written by hand. Artur's type (docs/brand/app-title.svg, split into letters) is
// written with the strokes a pen would take (title-pen.ts); ink appears only where
// the pen has been, and the last frame is exactly the type. The pen's canvas holds
// the title until TitleDust takes over, in the same frame and the same pixels (both
// are canvases mapped from the SVG's place on screen; the SVG itself is only seen
// with reduced motion).
//
// One hand, one pen: a single point of ink moves at any moment — a stroke, a lift
// through the air, the next stroke — and that rhythm is what reads as writing. The
// hand is modelled on how people write: every stroke between two corners is one
// impulse of the wrist (a quick attack and a longer settle; bigger strokes are
// written faster, not proportionally longer), the pen slows into curves (the
// two-thirds power law) and all but stops at a sharp corner, it touches down gently
// and leaves the paper still moving. "Meet" is written at a pace the eye can follow;
// then the hand, sure of itself, speeds up — with a small beat before "ZEN".
//
// The ink: the nib is round, a hair narrower than the letter; where the pen moves
// fast it lays a little less ink, and just behind the nib the ink spreads out to the
// letter's full weight, so a quick stroke has a slim, tapering front and a slow one a
// full round head. Each stroke starts with the nib pressing in. When the pen is fast
// its head is smeared a little, as a camera would see it. The i gets its dot once
// "Design" is written: a tap that lands with a squash and settles.

const START = 140 // ms: the loader mark is still leaving
/** ms the pen takes over a 40-unit stroke, word by word: "Meet" legible, then quicker */
const TEMPO = [32, 24, 21, 19]
const ISO = 0.4 // a stroke's time grows only as its length^ISO (isochrony)
const CORNER = 55 // degrees of turn (over ±1.5 units) that make a corner
const STOP = { corner: 0.1, touch: 0.3, lift: 0.45 } // share of the stroke's peak speed at a corner, at touch-down, at lift-off
const BEND = 20 // units: curves tighter than this radius slow the pen (speed ∝ radius^⅓)
const AIR = { base: 10, k: 2 } // ms through the air between strokes: base + k·√distance, at the first word's tempo
const BREATH = [0, 50, 35, 10] // ms before each word: a beat before "ZEN"; the trip to the i's dot is the pause before "Team"
const HOLD = 440 // ms the finished title holds before the room comes (the plain fade; its petals start sooner: TitleDust)
const STEP = 1000 / 15 // ms: the most the pen's clock advances in one frame
// the ink
const NIB = 0.94 // the round nib is a hair narrower than the letter…
export const BODY = 0.3 // …and its ink spreads to a hair past it (units) — never into the stem next door
const PRESS = { len: 4.5, from: 0.62 } // at touch-down the nib presses in over this many units, from this share of its width
const THIN = { by: 0.3, from: 0.35, to: 1.6 } // a fast pen lays up to 30 % less ink, from 0.35 to 1.6 units per ms
const SPREAD = 9 // units behind the nib where the ink has spread to the letter's full weight…
const WET = 40 // …or ms after it was laid, whichever comes first
const SMEAR = { ms: 7, max: 6, min: 1.8, tip: 0.55, off: 40 } // a fast head is smeared over 7 ms of its travel (1.8–6 units), fading to 55 % at the front; it clears 40 ms after the pen lifts
const SEEP = 40 // ms: once a letter is written, what the pen's path did not reach seeps in, and it is the type
// the dot on the i: dropped in, landing with a squash, settling
const DOT = { fall: 70, drop: 5, squash: 0.28, decay: 80, period: 40, settle: 300, dwell: 20 }
const DS = 0.4 // units between samples along a stroke


// ---- geometry -------------------------------------------------------------------
type Pt = { x: number; y: number }

/** Points along an absolute M/L/C path, cubic segments finely flattened. */
function flatten(d: string): Pt[] {
  const t = d.match(/[MLC]|-?\d+(?:\.\d+)?/g) ?? []
  const out: Pt[] = []
  let i = 0
  let x = 0
  let y = 0
  let cmd = ''
  while (i < t.length) {
    if (/[MLC]/.test(t[i])) cmd = t[i++]
    if (cmd === 'M') {
      x = +t[i++]
      y = +t[i++]
      out.push({ x, y })
      cmd = 'L'
    } else if (cmd === 'L') {
      x = +t[i++]
      y = +t[i++]
      out.push({ x, y })
    } else {
      const p = [x, y, +t[i++], +t[i++], +t[i++], +t[i++], +t[i++], +t[i++]]
      for (let k = 1; k <= 24; k++) {
        const u = k / 24
        const a = (1 - u) ** 3
        const b = 3 * (1 - u) ** 2 * u
        const c = 3 * (1 - u) * u * u
        const e = u ** 3
        out.push({ x: a * p[0] + b * p[2] + c * p[4] + e * p[6], y: a * p[1] + b * p[3] + c * p[5] + e * p[7] })
      }
      x = p[6]
      y = p[7]
    }
  }
  return out
}

/** The polyline resampled every DS units (the last step absorbs the remainder). */
function resample(pts: Pt[]) {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  const L = cum[cum.length - 1]
  const n = Math.max(2, Math.ceil(L / DS) + 1)
  const x = new Float32Array(n)
  const y = new Float32Array(n)
  let j = 0
  for (let k = 0; k < n; k++) {
    const s = (L * k) / (n - 1)
    while (j < cum.length - 2 && cum[j + 1] < s) j++
    const u = cum[j + 1] > cum[j] ? (s - cum[j]) / (cum[j + 1] - cum[j]) : 0
    x[k] = pts[j].x + (pts[j + 1].x - pts[j].x) * u
    y[k] = pts[j].y + (pts[j + 1].y - pts[j].y) * u
  }
  return { L, ds: L / (n - 1), n, x, y }
}

// ---- the hand -------------------------------------------------------------------
type Stroke = {
  letter: number
  n: number
  ds: number
  x: Float32Array
  y: Float32Array
  time: Float32Array // when the pen passes each sample (ms from the card appearing)
  speed: Float32Array // units per ms there
  lay: Float32Array // radius of the ink the nib lays there, before it spreads
  full: number // radius the ink spreads to
  start: number
  end: number
}
type Dot = { letter: number; at: number; path: string; cx: number; foot: number }

/**
 * A stroke as the hand writes it, timed from 0. Corners split it into impulses; each
 * rises quickly and settles slowly (a skewed bump), slowing into tight curves.
 */
function write(d: string, weight: 'regular' | 'bold', t0: number, letter: number): Stroke {
  const r = resample(flatten(d))
  const { n, ds, x, y } = r
  const w = Math.max(1, Math.round(1.5 / ds))
  // turning over ±1.5 units at each sample: corners, and curvature for the power law
  const turn = new Float32Array(n)
  for (let i = w; i < n - w; i++) {
    const a = Math.atan2(y[i] - y[i - w], x[i] - x[i - w])
    const b = Math.atan2(y[i + w] - y[i], x[i + w] - x[i])
    turn[i] = Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)))
  }
  const cuts = [0]
  const sharp = (CORNER * Math.PI) / 180
  for (let i = w; i < n - w; i++) {
    let peak = turn[i] > sharp
    for (let j = i - w; peak && j <= i + w; j++) if (turn[j] > turn[i] || (turn[j] === turn[i] && j < i)) peak = false
    if (peak && (i - cuts[cuts.length - 1]) * ds > 3) cuts.push(i)
  }
  if ((n - 1 - cuts[cuts.length - 1]) * ds < 1.5 && cuts.length > 1) cuts.pop()
  cuts.push(n - 1)

  const time = new Float32Array(n)
  const speed = new Float32Array(n)
  const shape = new Float32Array(n)
  const v = new Float32Array(n)
  for (let c = 0; c < cuts.length - 1; c++) {
    const a = cuts[c]
    const b = cuts[c + 1]
    const from = a === 0 ? STOP.touch : STOP.corner
    const to = b === n - 1 ? STOP.lift : STOP.corner
    for (let j = a; j <= b; j++) {
      const u = (j - a) / (b - a)
      const floor = lerp(from, to, u)
      shape[j] = floor + (1 - floor) * Math.sin(Math.PI * u ** 0.8) ** 0.7
      const bend = turn[j] / (2 * w * ds) // radians per unit
      v[j] = shape[j] * clamp(Math.cbrt(1 / Math.max(1e-4, bend) / BEND), 0.5, 1)
    }
    let curved = 0
    let straight = 0
    for (let j = a + 1; j <= b; j++) {
      curved += ds / ((v[j - 1] + v[j]) / 2)
      straight += ds / ((shape[j - 1] + shape[j]) / 2)
    }
    const dur = t0 * ((ds * (b - a)) / 40) ** ISO * (curved / straight)
    const k = dur / curved
    for (let j = a + 1; j <= b; j++) time[j] = time[j - 1] + (ds / ((v[j - 1] + v[j]) / 2)) * k
    for (let j = a; j <= b; j++) speed[j] = v[j] / k
  }
  const lay = new Float32Array(n)
  for (let j = 0; j < n; j++) {
    const press = lerp(PRESS.from, 1, smoothstep((j * ds) / PRESS.len))
    const thin = 1 - THIN.by * smoothstep((speed[j] - THIN.from) / (THIN.to - THIN.from))
    lay[j] = HALF[weight] * NIB * press * thin
  }
  return { letter, n, ds, x, y, time, speed, lay, full: HALF[weight] + BODY, start: 0, end: time[n - 1] }
}

/** The subpath of a letter's outline that holds a point (the dot of the i). */
function subpathAt(d: string, p: Pt) {
  for (const sub of d.split(/(?=M)/)) {
    const v = (sub.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
    const xs = v.filter((_, i) => i % 2 === 0)
    const ys = v.filter((_, i) => i % 2 === 1)
    const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    if (p.x >= box[0] && p.x <= box[2] && p.y >= box[1] && p.y <= box[3]) return { path: sub, cx: (box[0] + box[2]) / 2, foot: box[3] }
  }
  return null
}

function perform() {
  const rng = mulberry32(2026)
  const strokes: Stroke[] = []
  const dots: Dot[] = []
  let t = START
  let pen: Pt | null = null // where the pen was lifted
  let word = 0
  let wordStart = 0
  const air = (to: Pt, tempo: number) => (pen ? (AIR.base + AIR.k * Math.sqrt(Math.hypot(to.x - pen.x, to.y - pen.y))) * (tempo / TEMPO[0]) : 0)
  PEN.forEach((p, k) => {
    const tempo = TEMPO[word] * (0.95 + rng() * 0.1) // a few percent of the hand's own variation
    for (const d of p.strokes) {
      const s = write(d, p.weight, tempo, k)
      t += air({ x: s.x[0], y: s.y[0] }, tempo)
      s.start = t
      for (let j = 0; j < s.n; j++) s.time[j] += t
      s.end = s.time[s.n - 1]
      strokes.push(s)
      t = s.end
      pen = { x: s.x[s.n - 1], y: s.y[s.n - 1] }
    }
    if (!WORD_ENDS.includes(k)) return
    // strokes that wait for the end of the word — the dot on the i: a tap
    for (let m = wordStart; m <= k; m++)
      for (const d of PEN[m].later ?? []) {
        const [a, b] = flatten(d)
        const at = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const sub = subpathAt(GLYPHS[m].d, at)
        if (!sub) continue
        t += air(at, tempo)
        dots.push({ letter: m, at: t, ...sub })
        t += DOT.fall + DOT.dwell
        pen = at
      }
    word++
    wordStart = k + 1
    if (k < PEN.length - 1) t += BREATH[word] ?? 0
  })
  // when each letter is finished, ink settled: from then on it is simply the type
  const inked = GLYPHS.map((_, k) => {
    let e = 0
    for (const s of strokes) if (s.letter === k) e = Math.max(e, s.end + WET)
    for (const d of dots) if (d.letter === k) e = Math.max(e, d.at + DOT.fall + DOT.settle)
    return e
  })
  const done = inked.map((t) => t + SEEP)
  return { strokes, dots, inked, done, end: Math.max(...done) }
}

const PERFORMANCE = perform()
/** How long the title phase lasts, from the card appearing to the room starting to rise. */
export const TITLE_MS = Math.round(PERFORMANCE.end + HOLD)
/** When the pen has lifted and the last ink has settled, from the card appearing. */
export const WRITTEN_MS = Math.round(PERFORMANCE.end)

// ---- the ink on the canvas -----------------------------------------------------------
const VIEW = { x: 0, y: -2, w: 627, h: 58 } // the SVG's viewBox: Artur's export, the g's tail included (TitleDust VIEW)
const PAD = 8 // units of canvas around the line (the dot drops in from above), plus the room the line grows into as it settles

/** Where the pen is along a stroke at t, as a fractional sample index. */
function headAt(s: Stroke, t: number) {
  if (t >= s.end) return s.n - 1
  const T = s.time
  let lo = 0
  let hi = s.n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (T[mid] <= t) lo = mid
    else hi = mid
  }
  return lo + (t - T[lo]) / Math.max(1e-6, T[hi] - T[lo])
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, t: number, tip: string) {
  const h = headAt(s, t)
  const hi = Math.min(s.n - 2, Math.floor(h))
  const f = h - hi
  const hx = lerp(s.x[hi], s.x[hi + 1], f)
  const hy = lerp(s.y[hi], s.y[hi + 1], f)
  const down = t < s.end
  const lifted = down ? 1 : 1 - smoothstep((t - s.end) / SMEAR.off)
  const fast = lifted > 0 ? Math.min(SMEAR.max, SMEAR.ms * s.speed[hi]) * lifted : 0
  const smeared = fast >= SMEAR.min
  const smear = smeared ? fast : 0
  const sh = h * s.ds
  const ink = (j: number) => {
    // the ink spreads to full weight behind the (smeared) head, or once it has had time to
    const d = Math.max(0, sh - smear - j * s.ds)
    return lerp(s.lay[j], s.full, smoothstep(Math.max(d / SPREAD, (t - s.time[j]) / WET)))
  }
  ctx.beginPath()
  const last = smeared ? Math.floor((sh - smear) / s.ds) : hi
  for (let j = 0; j <= last; j++) {
    const r = ink(j)
    ctx.moveTo(s.x[j] + r, s.y[j])
    ctx.arc(s.x[j], s.y[j], r, 0, Math.PI * 2)
  }
  if (!smeared) {
    const r = lerp(s.lay[hi], s.lay[hi + 1], f)
    ctx.moveTo(hx + r, hy)
    ctx.arc(hx, hy, r, 0, Math.PI * 2)
  }
  ctx.fill()
  if (smeared) {
    // the smeared head: one stroke, fading toward the front, so nothing doubles up
    const j0 = Math.max(0, last)
    const g = ctx.createLinearGradient(s.x[j0], s.y[j0], hx, hy)
    g.addColorStop(0, ctx.fillStyle as string)
    g.addColorStop(1, tip)
    ctx.strokeStyle = g
    ctx.lineWidth = 2 * s.lay[hi]
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(s.x[j0], s.y[j0])
    for (let j = j0 + 1; j <= hi; j++) ctx.lineTo(s.x[j], s.y[j])
    ctx.lineTo(hx, hy)
    ctx.stroke()
  }
}

/** The dot on the i: it drops in, lands with a squash and springs back to round. */
function drawDot(ctx: CanvasRenderingContext2D, dot: Dot, path: Path2D, t: number) {
  const a = t - dot.at
  if (a <= 0) return
  let sx: number
  let sy: number
  let dy = 0
  if (a < DOT.fall) {
    const u = a / DOT.fall
    const grow = 0.55 + 0.45 * smoothstep(u * 1.6)
    dy = -DOT.drop * (1 - u * u) // falling, faster as it comes
    sx = 0.9 * grow
    sy = 1.12 * grow
  } else {
    const b = a - DOT.fall
    const w = DOT.squash * Math.exp(-b / DOT.decay) * Math.cos(b / DOT.period)
    sx = 1 + w
    sy = 1 - w
  }
  ctx.save()
  ctx.translate(dot.cx, dot.foot + dy) // squashed against the paper at its foot
  ctx.scale(sx, sy)
  ctx.translate(-dot.cx, -dot.foot)
  ctx.fill(path)
  ctx.restore()
}


/** The letters (whole, and without their dots), the dots, and a layer to lay a letter's wet ink on. */
type Kit = { glyphs: Path2D[]; bodies: Path2D[]; dots: Path2D[]; layer: CanvasRenderingContext2D }

/** Draw the title at t; `m` maps the title's units to the canvas (see Written). */
function drawAt(ctx: CanvasRenderingContext2D, m: DOMMatrix, kit: Kit, ink: string, tip: string, t: number) {
  const { width, height } = ctx.canvas
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.setTransform(m)
  ctx.fillStyle = ink
  const { strokes, dots, done } = PERFORMANCE
  GLYPHS.forEach((_, i) => {
    if (t >= done[i]) return ctx.fill(kit.glyphs[i]) // finished: the type itself
    if (strokes.some((s) => s.letter === i && t > s.start)) wet(ctx, m, kit, ink, tip, i, t)
    dots.forEach((d, j) => d.letter === i && drawDot(ctx, d, kit.dots[j], t))
  })
}

/**
 * A letter being written. Its ink — the strokes, and the type seeping in once they are
 * done — is laid on a layer and cut to the letter's outline once, so every edge pixel is
 * anti-aliased once, as in the finished type. (Clipping each stroke to the outline, over
 * the seeping type, counted the soft edge twice: the letter looked a touch bolder while
 * it settled and thinned in one frame when it was done.) The dot is not in the cut.
 */
function wet(ctx: CanvasRenderingContext2D, m: DOMMatrix, kit: Kit, ink: string, tip: string, i: number, t: number) {
  const L = kit.layer
  const { width, height } = ctx.canvas
  if (L.canvas.width !== width || L.canvas.height !== height) {
    L.canvas.width = width
    L.canvas.height = height
  }
  // the letter's box, in device px
  const [x0, y0, x1, y1] = GLYPHS[i].box
  const a = m.transformPoint({ x: x0 - 2, y: y0 - 2 })
  const b = m.transformPoint({ x: x1 + 2, y: y1 + 2 })
  const bx = Math.max(0, Math.floor(a.x))
  const by = Math.max(0, Math.floor(a.y))
  const bw = Math.min(width, Math.ceil(b.x)) - bx
  const bh = Math.min(height, Math.ceil(b.y)) - by
  if (bw <= 0 || bh <= 0) return
  L.save()
  L.setTransform(1, 0, 0, 1, 0, 0)
  L.beginPath()
  L.rect(bx, by, bw, bh)
  L.clip()
  L.clearRect(bx, by, bw, bh)
  L.setTransform(m)
  L.fillStyle = ink
  const { strokes, inked } = PERFORMANCE
  if (t > inked[i]) {
    L.globalAlpha = smoothstep((t - inked[i]) / SEEP)
    L.fillRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4)
    L.globalAlpha = 1
  }
  for (const s of strokes) if (s.letter === i && t > s.start) drawStroke(L, s, t, tip)
  L.globalCompositeOperation = 'destination-in'
  L.fill(kit.bodies[i])
  L.restore()
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.drawImage(L.canvas, bx, by, bw, bh, bx, by, bw, bh)
  ctx.restore()
}

// ---- the card ---------------------------------------------------------------------
function Written({ out }: { out: boolean }) {
  const svg = useRef<SVGSVGElement>(null)
  const pen = useRef<HTMLCanvasElement>(null)
  const reduced = store.get().reducedMotion
  const dissolve = useStore((s) => s.dissolve)

  // the petals take over from the pen's canvas in this same commit (TitleDust)
  useLayoutEffect(() => {
    if (dissolve && pen.current) pen.current.style.display = 'none'
  }, [dissolve])

  // before the first paint: the canvas writes; the SVG only lends it its place on screen
  useLayoutEffect(() => {
    const sv = svg.current
    const cv = pen.current
    // rasterised like TitleDust's ink (a CPU canvas), so the two edges match exactly
    const ctx = cv?.getContext('2d', { willReadFrequently: true })
    const layer = ctx && document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    if (reduced || !sv || !cv || !ctx || !layer) {
      // the type, as it is (and the card fades in)
      if (cv) cv.style.display = 'none'
      store.set({ written: true })
      return
    }
    sv.style.visibility = 'hidden'
    const ink = getComputedStyle(sv.querySelector('.tc-ink') ?? sv).fill || 'rgb(17, 18, 20)'
    const [r, g, b] = (ink.match(/\d+/g) ?? ['17', '18', '20']).map(Number)
    const tip = `rgba(${r}, ${g}, ${b}, ${SMEAR.tip})`
    const kit: Kit = {
      glyphs: GLYPHS.map((gl) => new Path2D(gl.d)),
      // each letter without its dot: the dot is drawn on its own (it squashes)
      bodies: GLYPHS.map((gl, i) => new Path2D(gl.d.split(/(?=M)/).filter((sub) => !PERFORMANCE.dots.some((d) => d.letter === i && d.path === sub)).join(''))),
      dots: PERFORMANCE.dots.map((d) => new Path2D(d.path)),
      layer,
    }
    // The pen draws on a fixed canvas around the line, mapped from the SVG's place on screen
    // exactly as TitleDust maps it, at its resolution, on its pixel grid (the canvas sits on
    // whole CSS pixels: browsers snap a canvas's box to them) — so the pen's last frame and
    // the petals' first are the same title in the same pixels. The line breathes in
    // (tc-settle), so the mapping is read every frame; the canvas moves only when the line
    // leaves it (the window resized).
    const dpr = Math.min(2, window.devicePixelRatio || 1) // as TitleDust
    let at = { x: 0, y: 0, w: 0, h: 0 } // the canvas's box, css px
    const place = () => {
      const r = sv.getBoundingClientRect()
      const s = Math.min(r.width / VIEW.w, r.height / VIEW.h)
      const ox = r.left + (r.width - VIEW.w * s) / 2 - VIEW.x * s
      const oy = r.top + (r.height - VIEW.h * s) / 2 - VIEW.y * s
      if (!(r.left > at.x && r.top > at.y && r.right < at.x + at.w && r.bottom < at.y + at.h)) {
        const pad = PAD * s + r.width * 0.02
        const x = Math.floor(r.left - pad)
        const y = Math.floor(r.top - pad)
        at = { x, y, w: Math.ceil(r.right + pad) - x, h: Math.ceil(r.bottom + pad) - y }
        cv.width = at.w * dpr
        cv.height = at.h * dpr
        Object.assign(cv.style, { left: `${at.x}px`, top: `${at.y}px`, width: `${at.w}px`, height: `${at.h}px` })
      }
      return new DOMMatrix([s * dpr, 0, 0, s * dpr, (ox - at.x) * dpr, (oy - at.y) * dpr])
    }
    let shown = 0
    const show = (ms: number) => {
      shown = ms
      drawAt(ctx, place(), kit, ink, tip, ms)
    }
    show(0)
    const onResize = () => show(shown) // the line moves with the window (and resizes with its width)
    window.addEventListener('resize', onResize)

    // design check (dev only): window.__title.seek(ms) freezes the card at a moment
    let frozen = false
    if (import.meta.env.DEV)
      (window as unknown as { __title?: object }).__title = {
        seek: (ms: number) => {
          frozen = true
          show(ms)
        },
        duration: TITLE_MS,
        written: WRITTEN_MS,
      }
    // The pen keeps its own clock, from the first frame it is seen in, and a frame moves it
    // by STEP at most: when the device stalls (a phone busy with the 3D) the pen waits,
    // rather than jumping ahead to a title already written.
    let t = 0
    let last = -1
    let raf = 0
    const tick = (now: number) => {
      t += last < 0 ? 0 : Math.min(now - last, STEP)
      last = now
      if (!frozen) show(t)
      if (t >= PERFORMANCE.end && !store.get().written) store.set({ written: true })
      // the finished title is redrawn a few frames more (the line is still breathing in)
      if (t < PERFORMANCE.end + 100 && !store.get().dissolve) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [reduced])

  return (
    <div className={`title-card${out ? ' title-card--out' : ''}${reduced ? ' title-card--calm' : ''}`}>
      <div className="tc-line">
        <svg ref={svg} className="tc-svg" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} aria-hidden="true">
          {GLYPHS.map((g, k) => (
            <path key={k} d={g.d} className="tc-ink" />
          ))}
        </svg>
      </div>
      <canvas ref={pen} className="tc-pen" aria-hidden="true" />
    </div>
  )
}

export function TitleCard() {
  const phase = useStore((s) => s.phase)
  if (phase === 'loading') return null
  return <Written out={phase !== 'title'} />
}
