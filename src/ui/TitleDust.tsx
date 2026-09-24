import { useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { DEBUG } from '../lib/params'
import { mulberry32 } from '../lib/rng'
import { smoothstep } from '../lib/anim'
import { GLYPHS } from './title-glyphs'

// Once the title has been written, it doesn't fade: it lets go, still on the paper,
// and turns into petals. A canvas above the curtain takes over from the written title
// in the same frame, pixel for pixel, and the ink leaves the way it was written — left
// to right, the bottom of each letter first — through a soft, organic edge: just
// ahead of it the ink greys a little, then it thins away. Where it goes, petals are
// born: dark at first, from the ink, they open into small drawn petals (the ZenDS
// hand: a fine ink line on paper white, hatched on the underside) and fall slowly,
// rocking like leaves, turning over now and then; a fine powder of ink sifts down
// with them. The curtain lifts only once the petals are falling (App: DUST_LEAD), so
// they drift down over the room as it is revealed, and are gone soon after.

const VIEW = { x: 0, y: -2, w: 627, h: 58 } // the title card's viewBox (TitleCard.tsx)
/** ms from the title letting go to the curtain lifting (App). */
export const DUST_LEAD = 1300

// the ink leaving, ms
const SWEEP = 1150 // for the front to cross the title
const TILT = 160 // within a letter the bottom lets go first
const RAGGED = 380 // noise in the front: soft clumps with a fine grain
const PRE = 260 // the ink greys this long before it goes…
const DIM = 0.22 // …by this much
const FADE = 170 // then thins away over this
// what it becomes
const PETAL_AREA = 150 // css px² of ink per petal
const SPECK_AREA = 34 // css px² of ink per grain of ink powder
const PETAL = [10, 15] // petal length, css px (at the desktop title's size)
const OPEN = 480 // ms for a petal to open from ink into its drawn self

type Petal = {
  x: number // birth, css px
  y: number
  birth: number // ms
  life: number // s
  vy: number // px/s at birth (a small lift)
  fall: number // terminal fall, px/s
  vx: number
  wind: number
  swayA: number // px
  swayW: number // rad/s
  swayP: number
  rot0: number
  spin: number // rad/s
  tilt: number // rad of rocking with the sway
  flipW: number // rad/s: turning over about its long axis
  flipP: number
  len: number // css px
  shape: number // sprite variant
}
type Speck = { x: number; y: number; birth: number; life: number; fall: number; wind: number; swayA: number; swayW: number; swayP: number; size: number; alpha: number }

/** Smooth value noise, 0..1, on an integer lattice. */
function noise2(x: number, y: number) {
  const h = (i: number, j: number) => {
    let n = Math.imul(i, 374761393) + Math.imul(j, 668265263)
    n = Math.imul(n ^ (n >>> 13), 1274126177)
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296
  }
  const i = Math.floor(x)
  const j = Math.floor(y)
  const u = smoothstep(x - i)
  const v = smoothstep(y - j)
  const a = h(i, j) + (h(i + 1, j) - h(i, j)) * u
  const b = h(i, j + 1) + (h(i + 1, j + 1) - h(i, j + 1)) * u
  return a + (b - a) * v
}

/** Distance covered from speed v0, easing toward terminal speed vT with time constant tau. */
const drift = (t: number, v0: number, vT: number, tau: number) => vT * t + (v0 - vT) * tau * (1 - Math.exp(-t / tau))

// ---- the petals, drawn ----------------------------------------------------------
const SHAPES = 3

/** A cherry petal pointing +x: a narrow base, round shoulders, a small notch at the tip — each variant a little different, as if drawn by hand. */
function petalPath(L: number, W: number, seed: number) {
  const rng = mulberry32(seed)
  const j = (v: number) => v * (1 + (rng() - 0.5) * 0.14)
  const p = new Path2D()
  const x = (u: number) => -L / 2 + u * L
  const y = (v: number) => v * W
  const notch = 0.84 + rng() * 0.06
  p.moveTo(x(0), y(0))
  p.bezierCurveTo(x(j(0.16)), y(-j(0.3)), x(j(0.52)), y(-j(0.53)), x(0.84), y(-j(0.42)))
  p.bezierCurveTo(x(0.97), y(-0.36), x(1.0), y(-0.17), x(0.97), y(-0.07))
  p.lineTo(x(notch), y(0))
  p.lineTo(x(0.97), y(0.07))
  p.bezierCurveTo(x(1.0), y(0.17), x(0.97), y(0.36), x(0.84), y(j(0.42)))
  p.bezierCurveTo(x(j(0.52)), y(j(0.53)), x(j(0.16)), y(j(0.3)), x(0), y(0))
  p.closePath()
  return p
}

/** Sprites for one variant: `ink` (the petal as it is born), `front` (paper, a fine line, a vein) and `back` (its underside, hatched). */
function petalSprites(ink: string, dpr: number, shape: number) {
  const k = 2 * dpr // sprites at 2× the largest petal
  const L = PETAL[1] * k
  const W = L * 0.78
  const line = 0.95 * k
  const pad = Math.ceil(line * 2)
  const size = { w: Math.ceil(L + 2 * pad), h: Math.ceil(W + 2 * pad) }
  const path = petalPath(L, W, 71 + shape * 13)
  const make = (draw: (g: CanvasRenderingContext2D) => void) => {
    const c = document.createElement('canvas')
    c.width = size.w
    c.height = size.h
    const g = c.getContext('2d')!
    g.translate(size.w / 2, size.h / 2)
    g.lineJoin = 'round'
    g.lineCap = 'round'
    draw(g)
    return c
  }
  const outline = (g: CanvasRenderingContext2D) => {
    g.strokeStyle = ink
    g.globalAlpha = 0.85 // a fine line, not a hard edge
    g.lineWidth = line
    g.stroke(path)
    g.globalAlpha = 1
  }
  return {
    size,
    ink: make((g) => {
      g.fillStyle = ink
      g.fill(path)
    }),
    front: make((g) => {
      g.fillStyle = '#fff'
      g.fill(path)
      // the vein: a light stroke from the base toward the notch
      g.strokeStyle = ink
      g.globalAlpha = 0.4
      g.lineWidth = line * 0.7
      g.beginPath()
      g.moveTo(-L * 0.4, 0)
      g.quadraticCurveTo(-L * 0.05, W * (shape === 1 ? -0.07 : 0.06), L * 0.16, 0)
      g.stroke()
      g.globalAlpha = 1
      outline(g)
    }),
    back: make((g) => {
      g.fillStyle = '#fff'
      g.fill(path)
      // hatched, as the drawn page shades its undersides
      g.save()
      g.clip(path)
      g.strokeStyle = ink
      g.globalAlpha = 0.45
      g.lineWidth = line * 0.6
      const step = L * 0.2
      for (let s = -L; s < L; s += step) {
        g.beginPath()
        g.moveTo(s, -W)
        g.lineTo(s + W * 1.2, W)
        g.stroke()
      }
      g.restore()
      outline(g)
    }),
  }
}

function speckSprite(ink: string) {
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16)
  grad.addColorStop(0, ink)
  grad.addColorStop(0.55, ink)
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 32, 32)
  return c
}

// ---- the title, taken over ------------------------------------------------------
function build(svg: SVGSVGElement) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const r = svg.getBoundingClientRect()
  if (!r.width || !r.height) return null
  const s = Math.min(r.width / VIEW.w, r.height / VIEW.h)
  const ox = r.left + (r.width - VIEW.w * s) / 2 - VIEW.x * s
  const oy = r.top + (r.height - VIEW.h * s) / 2 - VIEW.y * s
  // the title as the card showed it, on a canvas the size of the card (+ a margin)
  const pad = 4
  const x0 = Math.floor((r.left - pad) * dpr)
  const y0 = Math.floor((r.top - pad) * dpr)
  const W = Math.ceil((r.width + 2 * pad) * dpr)
  const H = Math.ceil((r.height + 2 * pad) * dpr)
  const inkCanvas = document.createElement('canvas')
  inkCanvas.width = W
  inkCanvas.height = H
  const g = inkCanvas.getContext('2d', { willReadFrequently: true })!
  const ink = getComputedStyle(svg.querySelector('.tc-ink') ?? svg).fill || '#111214'
  g.setTransform(s * dpr, 0, 0, s * dpr, ox * dpr - x0, oy * dpr - y0)
  g.fillStyle = ink
  for (const gl of GLYPHS) g.fill(new Path2D(gl.d))
  g.setTransform(1, 0, 0, 1, 0, 0)
  const src = g.getImageData(0, 0, W, H)

  // every inked pixel, and when it lets go
  let n = 0
  for (let i = 3; i < src.data.length; i += 4) if (src.data[i]) n++
  if (!n) return null
  const idx = new Int32Array(n)
  const alpha = new Uint8Array(n)
  const T = new Float32Array(n)
  const Tdim = new Float32Array(n) // the greying follows the front without its grain: a smooth wash
  const rng = mulberry32(2027)
  let area = 0
  for (let p = 0, k = 0; p < W * H; p++) {
    const a = src.data[p * 4 + 3]
    if (!a) continue
    const cx = (x0 + (p % W) + 0.5) / dpr // css px
    const cy = (y0 + Math.floor(p / W) + 0.5) / dpr
    const u = (cx - r.left) / r.width
    const v = (cy - r.top) / r.height
    const rag = 0.62 * noise2(cx / 10, cy / 10) + 0.38 * noise2(cx / 2.6, cy / 2.6)
    idx[k] = p
    alpha[k] = a
    T[k] = PRE + u * SWEEP + (1 - v) * TILT + rag * RAGGED
    Tdim[k] = PRE + u * SWEEP + (1 - v) * TILT + 0.35 * RAGGED
    area += a / 255
    k++
  }
  area /= dpr * dpr
  const out = new ImageData(W, H)
  out.data.set(src.data) // the ink's colour; the alpha is rewritten every frame
  const still = document.createElement('canvas')
  still.width = W
  still.height = H

  // petals and powder, born where the ink goes (picked by ink, so solid strokes give more)
  const pick = () => {
    for (;;) {
      const k = Math.floor(rng() * n)
      if (rng() * 255 < alpha[k]) return k
    }
  }
  const at = (k: number) => ({ x: (x0 + (idx[k] % W) + 0.5) / dpr, y: (y0 + Math.floor(idx[k] / W) + 0.5) / dpr })
  const size = Math.min(1, Math.max(0.7, r.width / 700)) // petals shrink a little with a phone-sized title
  const petals: Petal[] = []
  for (let i = Math.round(area / (PETAL_AREA * size * size)); i > 0; i--) { // smaller petals, as many per letter
    const k = pick()
    const swayW = Math.PI * 2 * (0.3 + rng() * 0.3)
    petals.push({
      ...at(k),
      birth: T[k] - 40,
      life: 1.7 + rng() * 0.7,
      vy: -(4 + rng() * 12),
      fall: 56 + rng() * 30,
      vx: 4 + rng() * 12,
      wind: 6 + rng() * 16,
      swayA: 6 + rng() * 10,
      swayW,
      swayP: rng() * Math.PI * 2,
      rot0: rng() * Math.PI * 2,
      spin: (rng() - 0.5) * 1.2,
      tilt: 0.35 + rng() * 0.35,
      flipW: Math.PI * 2 * (0.25 + rng() * 0.35) * (rng() < 0.5 ? -1 : 1),
      flipP: rng() < 0.7 ? 0 : Math.PI * (0.3 + rng() * 0.4), // most are born face up
      len: (PETAL[0] + rng() * (PETAL[1] - PETAL[0])) * size,
      shape: Math.floor(rng() * SHAPES),
    })
  }
  const specks: Speck[] = []
  for (let i = Math.round(area / (SPECK_AREA * size * size)); i > 0; i--) {
    const k = pick()
    specks.push({
      ...at(k),
      birth: T[k] + rng() * 60,
      life: 0.7 + rng() * 0.6,
      fall: 24 + rng() * 26,
      wind: 4 + rng() * 12,
      swayA: 1 + rng() * 2.5,
      swayW: Math.PI * 2 * (0.5 + rng() * 0.6),
      swayP: rng() * Math.PI * 2,
      size: (1.1 + rng() * 1.1) * size,
      alpha: 0.35 + rng() * 0.3,
    })
  }
  let inkGone = 0
  for (const t of T) inkGone = Math.max(inkGone, t + FADE)
  let end = inkGone
  for (const p of [...petals, ...specks]) end = Math.max(end, p.birth + p.life * 1000)
  return {
    dpr, rect: { x: r.left, y: r.top, w: r.width, h: r.height },
    x0, y0, out, still, idx, alpha, T, Tdim, inkGone, petals, specks, end,
    sprites: Array.from({ length: SHAPES }, (_, i) => petalSprites(ink, dpr, i)),
    speck: speckSprite(ink),
  }
}

type Dust = NonNullable<ReturnType<typeof build>>

function drawAt(d: Dust, ctx: CanvasRenderingContext2D, ms: number) {
  const { dpr } = d
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

  // the ink: greying just ahead of its moment, then thinning away
  if (ms < d.inkGone) {
    const o = d.out.data
    const { idx, alpha, T, Tdim } = d
    for (let k = 0; k < idx.length; k++) {
      const e = ms - T[k]
      const dim = 1 - DIM * smoothstep((ms - Tdim[k] + PRE) / PRE)
      o[idx[k] * 4 + 3] = e <= 0 ? alpha[k] * dim : alpha[k] * dim * (1 - smoothstep(e / FADE))
    }
    d.still.getContext('2d')!.putImageData(d.out, 0, 0)
    ctx.drawImage(d.still, d.x0, d.y0)
  }

  // ink powder, sifting down
  for (const p of d.specks) {
    const t = (ms - p.birth) / 1000
    if (t <= 0 || t >= p.life) continue
    const a = t / p.life
    const x = p.x + drift(t, 0, p.wind, 0.6) + p.swayA * (1 - Math.exp(-t / 0.3)) ** 2 * Math.sin(p.swayW * t + p.swayP)
    const y = p.y + drift(t, 0, p.fall, 0.5)
    const D = p.size * dpr * (1 - 0.4 * a)
    ctx.globalAlpha = p.alpha * smoothstep(t / 0.08) * (1 - smoothstep((a - 0.3) / 0.7))
    ctx.drawImage(d.speck, x * dpr - D / 2, y * dpr - D / 2, D, D)
  }

  // the petals
  for (const p of d.petals) {
    const lt = ms - p.birth
    const t = lt / 1000
    if (t <= 0 || t >= p.life) continue
    const a = t / p.life
    const ramp = (1 - Math.exp(-t / 0.5)) ** 2 // sway and rocking grow as it gets going
    const phase = p.swayW * t + p.swayP
    const x = p.x + drift(t, p.vx, p.wind, 0.8) + p.swayA * ramp * Math.sin(phase)
    const y = p.y + drift(t, p.vy, p.fall, 0.7)
    const rot = p.rot0 + p.spin * t + p.tilt * ramp * Math.cos(phase) // a leaf rocks as it swings
    const flip = Math.cos(p.flipW * t + p.flipP)
    const open = smoothstep(lt / OPEN)
    const fade = smoothstep(lt / 140) * (1 - smoothstep((a - 0.6) / 0.4))
    const sp = d.sprites[p.shape]
    const sc = ((p.len / PETAL[1]) * (0.4 + 0.6 * open)) / 2 // sprites are drawn at 2× the largest petal, in device px
    const fy = Math.max(0.3, Math.abs(flip)) // edge-on it stays a sliver of petal, never a line
    const cos = Math.cos(rot)
    const sin = Math.sin(rot)
    ctx.setTransform(cos * sc, sin * sc, -sin * sc * fy, cos * sc * fy, x * dpr, y * dpr)
    const w = sp.size.w
    const h = sp.size.h
    if (open < 1) {
      ctx.globalAlpha = fade * (1 - open)
      ctx.drawImage(sp.ink, -w / 2, -h / 2)
    }
    ctx.globalAlpha = fade * open
    ctx.drawImage(flip >= 0 ? sp.front : sp.back, -w / 2, -h / 2)
  }
  ctx.globalAlpha = 1
}

export function TitleDust() {
  const dissolve = useStore((s) => s.dissolve)
  const ref = useRef<HTMLCanvasElement>(null)
  const raf = useRef(0)
  const [done, setDone] = useState(!DEBUG.intro || DEBUG.dust === '0')
  const live = !done && dissolve

  // starts once, when the title lets go, and runs to its end (the room has risen by then)
  useLayoutEffect(() => {
    if (!live || raf.current) return
    const canvas = ref.current
    const svg = document.querySelector<SVGSVGElement>('.tc-svg')
    const ctx = canvas?.getContext('2d')
    if (!canvas || !svg || !ctx) {
      setDone(true)
      return
    }
    const b0 = performance.now()
    const d = build(svg)
    const buildMs = performance.now() - b0
    if (!d) {
      setDone(true) // nothing to take over: the card keeps its plain fade
      return
    }
    canvas.width = Math.round(window.innerWidth * d.dpr)
    canvas.height = Math.round(window.innerHeight * d.dpr)
    drawAt(d, ctx, 0)
    svg.style.visibility = 'hidden' // same frame: the canvas now holds the title

    // design check (?dust=hold): window.__dust.seek(ms) freezes the dust at a moment
    let frozen = DEBUG.dust === 'hold'
    ;(window as unknown as { __dust?: object }).__dust = {
      seek: (ms: number) => {
        frozen = true
        drawAt(d, ctx, ms)
      },
      duration: d.end,
      rect: d.rect,
      count: { petals: d.petals.length, specks: d.specks.length, pixels: d.idx.length, buildMs: Math.round(buildMs) },
    }
    const t0 = performance.now()
    ;(window as unknown as { __dust: { start: number } }).__dust.start = performance.timeOrigin + t0 // wall clock, ms
    const tick = (now: number) => {
      if (!frozen) {
        if (now - t0 > d.end) {
          delete (window as unknown as { __dust?: object }).__dust // let the buffers go
          return setDone(true)
        }
        drawAt(d, ctx, now - t0)
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }, [live])
  useLayoutEffect(() => () => cancelAnimationFrame(raf.current), [])

  if (!live) return null
  return <canvas ref={ref} className="title-dust" aria-hidden="true" />
}
