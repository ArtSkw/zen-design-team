// The design system's hand, as a drawing vocabulary. Everything beyond the deck is
// drawn the way ZenDS draws its illustrations: a 2 px #222 stroke, paper fills, a
// 6 px diagonal hatch at 15 %, rounded hills, no shading (a hatched paper-cut shadow
// is available per ring, `Ring.shade`, and off). Motifs from the DS files
// (docs/ds/*.svg → ds-paths.ts) are reused verbatim; hills, clouds and the skyline
// are drawn procedurally in the same hand so the world can wrap around the room.
import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three'
import { DS, type DsMotif } from './ds-paths'

export const PAPER = '#f8f7f4' // almost white, a breath warm; the DS draws on #f5f5f5
export const INK = '#222222'
export const WATER = '#d3dbd8' // pale mineral; lights are neutral so it stays cool
/** DS 'white' fills sit a hair lighter than the page, as #fff does on #f5f5f5. */
export const PAPER_LIGHT = '#ffffff'
const INK_RGB = [34, 34, 34] as const
const PAPER_RGB = [248, 247, 244] as const

/** Ink strength: 1 = the DS #222; lower values sink toward the paper (depth fade). */
export function tone(t: number, alpha = 1) {
  const k = Math.max(0, Math.min(1, t))
  const c = INK_RGB.map((v, i) => Math.round(v * k + PAPER_RGB[i] * (1 - k)))
  return alpha >= 1 ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`
}

// The DS hand in screen pixels, and the home camera it is judged at.
export const STROKE_PX = 2
export const HATCH = { gapPx: 6, linePx: 1.2, alpha: 0.22 }
export const HOME_FOV = 34
export const HOME_DIST = 27.5
/** World units per screen pixel at a given camera distance (900 px tall viewport). */
export const unitsPerPx = (dist: number, viewportH = 900) => (2 * dist * Math.tan((HOME_FOV * Math.PI) / 360)) / viewportH

// ---- the pen ---------------------------------------------------------------------
// Draws in world units on a context whose transform is already world → canvas
// (y up). `lw` is the stroke width in world units; hatch pitch/line are canvas px.
export class Ink {
  private patterns = new Map<string, CanvasPattern>()
  constructor(
    public ctx: CanvasRenderingContext2D,
    public lw: number,
    public hatchGap: number,
    public hatchLine: number,
  ) {}

  private hatch(t: number) {
    const key = t.toFixed(2)
    const hit = this.patterns.get(key)
    if (hit) return hit
    const g = Math.max(3, Math.round(this.hatchGap))
    const c = document.createElement('canvas')
    c.width = c.height = g
    const x = c.getContext('2d')!
    x.strokeStyle = tone(t, HATCH.alpha)
    x.lineWidth = Math.max(0.9, this.hatchLine)
    x.lineCap = 'butt'
    x.beginPath()
    x.moveTo(-1, g + 1)
    x.lineTo(g + 1, -1) // "/" — the DS tile
    x.stroke()
    const p = this.ctx.createPattern(c, 'repeat')!
    this.patterns.set(key, p)
    return p
  }

  /** Fill a path with the DS hatch, tile locked to canvas pixels whatever the transform. */
  hatchFill(path: Path2D, t: number, rule: CanvasFillRule = 'nonzero') {
    const { ctx } = this
    const p = this.hatch(t)
    p.setTransform(ctx.getTransform().inverse())
    ctx.fillStyle = p
    ctx.fill(path, rule)
  }

  /** A DS motif, scaled to `w` world units wide, its baseline (crop bottom) at (x, y). */
  motif(m: DsMotif, x: number, y: number, w: number, t: number, opts: { mirror?: boolean; lw?: number } = {}) {
    const { ctx } = this
    const [x0, y0, x1, y1] = m.crop
    void y0
    const k = w / (x1 - x0) // world units per illustration px
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(opts.mirror ? -k : k, -k) // illustration px are y-down
    ctx.translate(-(x0 + x1) / 2, -y1)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = (opts.lw ?? this.lw) / k
    for (const it of m.items) {
      const p = new Path2D(it.d)
      const rule: CanvasFillRule = it.evenodd ? 'evenodd' : 'nonzero'
      if (it.op === 'stroke') {
        if (it.under) {
          // a closed body behind the stroke, so the motif hides what is drawn behind it
          ctx.fillStyle = PAPER_LIGHT
          ctx.fill(p, rule)
        }
        ctx.strokeStyle = tone(t)
        ctx.stroke(p)
      } else if (it.op === 'ink') {
        ctx.fillStyle = tone(t)
        ctx.fill(p, rule)
      } else if (it.op === 'paper') {
        ctx.fillStyle = PAPER_LIGHT
        ctx.fill(p, rule)
      } else {
        if (it.under) {
          ctx.fillStyle = PAPER
          ctx.fill(p, rule)
        }
        this.hatchFill(p, t, rule)
      }
    }
    ctx.restore()
  }

  /** The closed body of a rounded hill: circular arc, chord `w` on the baseline, apex `h` above it. */
  hillPath(x: number, w: number, h: number, below = 0, base = 0) {
    const R = (w * w) / 4 / (2 * h) + h / 2
    const cy = base + h - R
    const p = new Path2D()
    p.moveTo(x - w / 2, base - below)
    p.lineTo(x - w / 2, base)
    p.arc(x, cy, R, Math.atan2(base - cy, -w / 2), Math.atan2(base - cy, w / 2), true)
    p.lineTo(x + w / 2, base - below)
    p.closePath()
    return p
  }

  /** A rounded hill: paper body, ink arc. */
  hill(x: number, w: number, h: number, t: number, below = 0, base = 0) {
    const { ctx } = this
    const R = (w * w) / 4 / (2 * h) + h / 2
    const cy = base + h - R
    ctx.fillStyle = PAPER
    ctx.fill(this.hillPath(x, w, h, below, base))
    ctx.beginPath()
    ctx.arc(x, cy, R, Math.atan2(base - cy, -w / 2), Math.atan2(base - cy, w / 2), true)
    ctx.lineWidth = this.lw
    ctx.lineCap = 'round'
    ctx.strokeStyle = tone(t)
    ctx.stroke()
  }

  /**
   * A far city in hatch, the Palace of Culture and Science at its centre. Every
   * block starts below the baseline: the city is drawn *behind* its ring's hills
   * (a `back` feature), so hill arcs cut across it and only roofs, towers and the
   * Palace rise above them — the way the DS draws a city behind its hills.
   */
  skyline(x: number, w: number, h: number, t: number) {
    const p = new Path2D()
    const foot = -0.5 * h
    const block = (fx: number, fw: number, fh: number) => p.rect(x + (fx - fw / 2) * w, foot, fw * w, fh * h - foot)
    // city blocks, irregular; a few with a stepped top
    const blocks: [number, number, number][] = [
      [-0.47, 0.06, 0.34], [-0.41, 0.07, 0.46], [-0.4, 0.035, 0.53], [-0.34, 0.08, 0.38],
      [-0.27, 0.05, 0.56], [-0.27, 0.025, 0.62], [-0.21, 0.07, 0.42], [-0.15, 0.05, 0.5],
      [0.15, 0.05, 0.47], [0.21, 0.06, 0.58], [0.21, 0.03, 0.64], [0.27, 0.08, 0.4],
      [0.34, 0.05, 0.52], [0.4, 0.07, 0.36], [0.45, 0.04, 0.48], [0.49, 0.05, 0.3],
    ]
    for (const b of blocks) block(...b)
    // Palace of Culture and Science: wide wings, a podium, four side towers, the
    // main tower in tiers with corner pinnacles, the crown, the spire
    const P = 0.32 // the Palace's share of the city's width
    const pal = (fx: number, fw: number, fh: number) => block(fx * P, fw * P, fh)
    pal(0, 1, 0.3) // wings
    pal(0, 0.62, 0.42) // podium
    for (const sx of [-1, 1]) {
      pal(sx * 0.27, 0.07, 0.52) // side towers
      pal(sx * 0.27, 0.025, 0.57)
    }
    pal(0, 0.34, 0.6) // tower, tier 1
    pal(0, 0.27, 0.69) // tier 2
    for (const sx of [-1, 1]) pal(sx * 0.12, 0.022, 0.73) // corner pinnacles
    pal(0, 0.2, 0.78) // tier 3
    pal(0, 0.14, 0.85) // the clock tier
    pal(0, 0.08, 0.9) // crown
    pal(0, 0.022, 1) // spire
    this.ctx.fillStyle = PAPER
    this.ctx.fill(p)
    this.hatchFill(p, t)
  }

  sun(x: number, y: number, w: number, t: number) {
    this.motif(DS.sun, x, y, w, t)
  }
  /** The DS plane: as drawn it climbs to the left; mirror it to fly right. */
  plane(x: number, y: number, w: number, t: number, mirror = false) {
    this.motif(DS.plane, x, y, w, t, { mirror })
  }
  /** A loose pair of gulls, as drawn. `w` is the flock's width. */
  gulls(x: number, y: number, w: number, t: number) {
    this.motif(DS.gullBig, x + w * 0.22, y, w * 0.5, t)
    this.motif(DS.gull, x - w * 0.28, y + w * 0.22, w * 0.36, t)
  }
  /** A round tree with its trunk, baseline at (x, y). */
  tree(x: number, y: number, h: number, t: number, small = false) {
    const m = small ? DS.treeSmall : DS.treeBig
    const [x0, y0, x1, y1] = m.crop
    this.motif(m, x, y, (h * (x1 - x0)) / (y1 - y0), t)
  }
}

// ---- plates: a drawing baked to a texture ----------------------------------------
export type Plate = { tex: CanvasTexture; w: number; h: number; below: number }

/**
 * Bake a drawing into a texture. World origin = baseline centre, y up; the canvas
 * extends `below` units under the baseline so a plate can dip under the water.
 */
export function makePlate(w: number, h: number, below: number, ppu: number, lw: number, hatchGap: number, hatchLine: number, draw: (ink: Ink) => void): Plate {
  const W = Math.min(4096, Math.max(8, Math.ceil(w * ppu)))
  const H = Math.min(2048, Math.max(8, Math.ceil((h + below) * ppu)))
  const s = Math.min(W / w, H / (h + below))
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  ctx.setTransform(s, 0, 0, -s, W / 2, H - below * s)
  draw(new Ink(ctx, lw, hatchGap, hatchLine))
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  tex.minFilter = LinearMipmapLinearFilter
  tex.magFilter = LinearFilter
  tex.generateMipmaps = true
  return { tex, w, h, below }
}

/** Ink parameters for a plate that stands `r` from the room, judged from the home camera. */
export function inkFor(r: number, dpr = 2) {
  const d = r + HOME_DIST * 0.8
  const upp = unitsPerPx(d)
  const cap = r < 60 ? 32 : r < 100 ? 24 : 18
  const ppu = Math.min(cap, Math.min(2, dpr) / upp)
  return { lw: STROKE_PX * upp, hatchGap: HATCH.gapPx * upp * ppu, hatchLine: HATCH.linePx * upp * ppu, ppu }
}

// ---- small textures for the 3D side ---------------------------------------------
/** Stroke ripples around a piling: three thin rings, fading outward. 2.2 × 2.2 units. */
export function rippleTexture() {
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  const rings: [number, number][] = [
    [0.17, 0.3],
    [0.3, 0.18],
  ]
  ctx.lineWidth = 2.4
  for (const [f, a] of rings) {
    ctx.strokeStyle = tone(1, a)
    ctx.beginPath()
    ctx.arc(S / 2, S / 2, f * S, 0, Math.PI * 2)
    ctx.stroke()
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** A baked warm pool of lantern light for the gravel. */
export function poolTexture() {
  const S = 128
  const c = document.createElement('canvas')
  c.width = c.height = S
  const ctx = c.getContext('2d')!
  // the light on the ground carries the warmth the halo cannot: wide, soft, no edge
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(255, 200, 136, 0.46)')
  g.addColorStop(0.3, 'rgba(255, 198, 132, 0.26)')
  g.addColorStop(0.62, 'rgba(255, 196, 128, 0.08)')
  g.addColorStop(1, 'rgba(255, 196, 128, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

// ---- the composition -----------------------------------------------------------
// Polar placement around the room. φ is in degrees in the orbit's azimuth
// convention (x = sin φ, z = cos φ from CENTER); the home camera looks toward
// φ = 214° and sees larger φ to its left, so a strip is drawn with φ decreasing
// to the right. Over the whole orbit (az −50°…115°, up to 52 units out) the camera
// can see φ ≈ 55°…365° of the strips.
export const CENTER = { x: 9, z: -5.75 }
export const ARC = { from: 50, to: 370 } // wide enough for the off-centre camera at the orbit's ends
const D2R = Math.PI / 180
/** Position along a ring's strip, in world units of arc; right = decreasing φ. */
export const xOf = (phi: number, r: number) => r * (ARC.to - phi) * D2R

type Hill = { x: number; w: number; h: number }
/** Height of a hill's arc at `dx` from its centre (0 outside the chord). */
export function hillY(h: Hill, dx: number) {
  const R = (h.w * h.w) / 4 / (2 * h.h) + h.h / 2
  const cy = h.h - R
  return Math.abs(dx) >= h.w / 2 ? 0 : cy + Math.sqrt(R * R - dx * dx)
}

/**
 * A motif on a ring at arc position φ: hills (paper bodies, drawn first, in order),
 * `back` features drawn before the hills (a mountain that rises behind a ridge) and
 * `front` features drawn after every hill of the ring (a torii, trees, a temple), so
 * no hill line ever crosses them.
 */
export type Motif = { phi: number; hills?: Hill[]; back?: (ink: Ink, x: number) => void; front?: (ink: Ink, x: number) => void }
/** A ring is one continuous drawn strip wrapped around the room at radius r. */
/**
 * A ring is one continuous drawn strip wrapped around the room at radius r.
 * `shade`: the width, in world units, of the hatched paper-cut shadow a hill
 * throws on the hills behind it (0 = none).
 */
export type Ring = { id: string; r: number; h: number; below: number; tone: number; motifs: Motif[]; horizon?: boolean; shade?: number }
/**
 * Small things that float in the sky on their own plane: the sun, clouds. A drifting
 * floater moves toward larger φ inside its `lane` [from, to] (degrees), fading out at
 * the lane's end and back in at its start — clouds keep to their own stretch of sky.
 */
export type Floater = { id: string; kind: 'sun' | 'cloud'; phi: number; r: number; y: number; w: number; h: number; drift?: number; lane?: [number, number]; draw: (ink: Ink) => void }

const NEAR = 1.0
const MID = 0.7
const FAR = 0.42

export function drawRing(ring: Ring, ink: Ink) {
  const { ctx } = ink
  const xs = ring.motifs.map((m) => xOf(m.phi, ring.r))
  ring.motifs.forEach((m, i) => m.back?.(ink, xs[i]))
  // every hill drawn so far, for clipping the shadow of the next one onto them
  const behind = new Path2D()
  let any = false
  const shade = ring.shade ?? 0
  ring.motifs.forEach((m, i) => {
    // low to high: the taller hill is drawn last so it overlaps like cut paper
    for (const h of [...(m.hills ?? [])].sort((a, b) => a.h - b.h)) {
      const x = xs[i] + h.x
      const body = ink.hillPath(x, h.w, h.h, ring.below)
      if (shade && any) {
        // the hill's own silhouette, lifted a little (and nudged away from the sun),
        // hatched onto the hills behind it: a band of shadow along its arc, the way
        // one sheet of cut paper sits on another
        const sh = new Path2D()
        sh.addPath(body, new DOMMatrix().translate(shade * 0.35, shade))
        ctx.save()
        ctx.clip(behind)
        ctx.beginPath()
        ctx.rect(-1e5, 0, 2e5, 1e5) // above the baseline only
        ctx.clip()
        ink.hatchFill(sh, ring.tone)
        ctx.restore()
      }
      ink.hill(x, h.w, h.h, ring.tone, ring.below)
      behind.addPath(body)
      any = true
    }
  })
  ring.motifs.forEach((m, i) => m.front?.(ink, xs[i]))
  if (ring.horizon) {
    // the water's edge: one continuous stroke, just clear of the surface
    ctx.beginPath()
    ctx.moveTo(xOf(ARC.to + 10, ring.r), ink.lw * 0.7)
    ctx.lineTo(xOf(ARC.from - 10, ring.r), ink.lw * 0.7)
    ctx.lineWidth = ink.lw
    ctx.strokeStyle = tone(0.85)
    ctx.stroke()
  }
}

/** Trees standing on a hill's arc: [dx from the hill centre, height, small?]. */
const treesOn = (hill: Hill, trees: [number, number, boolean?][], t: number) => (ink: Ink, x: number) => {
  for (const [dx, h, small] of trees) ink.tree(x + hill.x + dx, hillY(hill, dx) - 0.04, h, t, small)
}

const CITY_PHI = 165 // the far city and the Palace; seen when the orbit turns right of home

export function composition(opts: { bridge?: boolean } = {}): { rings: Ring[]; floaters: Floater[] } {
  const n1: Hill[] = [{ x: -9, w: 28, h: 3.6 }, { x: 12, w: 22, h: 4.6 }]
  const n3: Hill[] = [{ x: -12, w: 24, h: 3.4 }, { x: 6, w: 30, h: 5.2 }]
  const n4: Hill[] = [{ x: -14, w: 26, h: 4 }, { x: 8, w: 30, h: 5.5 }]
  const n5: Hill[] = [{ x: -8, w: 30, h: 4.6 }, { x: 12, w: 20, h: 2.8 }]
  const n6: Hill[] = [{ x: -10, w: 28, h: 3.6 }, { x: 10, w: 24, h: 4.4 }]
  const island: Hill = { x: 0, w: 24, h: 1.7 }
  const near: Ring = {
    id: 'near', r: 47, h: 9.6, below: 3, tone: NEAR, horizon: true, // tall enough for a tree on the tallest hill
    motifs: [
      { phi: 72, hills: n1, front: treesOn(n1[1], [[3.5, 2.6]], NEAR) },
      // the ZenPlanSmart gate on the crest, answering the torii across the water
      { phi: 120, hills: [{ x: -10, w: 26, h: 4.2 }, { x: 9, w: 22, h: 3 }], front: (ink, x) => ink.motif(DS.gate, x - 10, 4.2 - 0.05, 5.4, NEAR) },
      { phi: 160, hills: n3, front: treesOn(n3[1], [[-4, 1.6, true], [-1.5, 2.8]], NEAR) },
      // the torii on its own low island, its two round trees as drawn
      { phi: 196, hills: [island], front: (ink, x) => ink.motif(DS.torii, x, 1.62, 7.4, NEAR) },
      { phi: 228, hills: n4, front: treesOn(n4[1], [[-7, 2.9], [-4, 1.7, true]], NEAR) },
      { phi: 268, hills: n5, front: treesOn(n5[0], [[6, 2.4]], NEAR) },
      { phi: 305, hills: n6 },
      { phi: 347, hills: [{ x: -12, w: 24, h: 3.2 }, { x: 8, w: 30, h: 4.8 }] },
    ],
  }
  const m2: Hill[] = [{ x: -18, w: 38, h: 6 }, { x: 16, w: 34, h: 4.8 }]
  const m4: Hill[] = [{ x: -14, w: 36, h: 6.2 }, { x: 16, w: 32, h: 5 }]
  const mid: Ring = {
    id: 'mid', r: 78, h: 12, below: 0.6, tone: MID,
    motifs: [
      { phi: 92, hills: [{ x: -14, w: 36, h: 6.4 }, { x: 16, w: 30, h: 4.6 }] },
      { phi: 140, hills: [{ x: -16, w: 34, h: 5.5 }, { x: 14, w: 36, h: 7 }] },
      {
        phi: 185,
        hills: m2,
        // a small temple and its tree on the ridge
        front: (ink, x) => {
          ink.motif(DS.pagoda, x - 18, hillY(m2[0], 0) - 0.06, 4.2, MID)
          ink.motif(DS.tree, x - 14.7, hillY(m2[0], 3.3) - 0.05, 1.0, MID)
        },
      },
      // Fuji, as drawn, rising behind a low ridge
      { phi: 228, hills: [{ x: -16, w: 30, h: 3.6 }, { x: 14, w: 26, h: 2.6 }], back: (ink, x) => ink.motif(DS.fuji, x + 2, 0.4, 24, MID) },
      { phi: 280, hills: m4, front: treesOn(m4[0], [[-8, 3.2], [-4.5, 2, true]], MID) },
      { phi: 328, hills: [{ x: -18, w: 34, h: 5 }, { x: 14, w: 38, h: 6.8 }] },
    ],
  }
  if (opts.bridge)
    mid.motifs.push({
      phi: 252, // its right end peeks into the home view
      hills: [{ x: -20, w: 22, h: 2.8 }, { x: 20, w: 22, h: 3 }],
      front: (ink, x) => ink.motif(DS.bridge, x, 0.2, 28, MID),
    })
  const far: Ring = {
    id: 'far', r: 118, h: 12, below: 0.6, tone: FAR,
    motifs: [
      { phi: 78, hills: [{ x: -26, w: 54, h: 7 }, { x: 24, w: 48, h: 5.5 }] },
      { phi: 125, hills: [{ x: -24, w: 50, h: 6 }, { x: 22, w: 56, h: 8 }] },
      // the far city in hatch, the Palace of Culture at its centre — a nod to home.
      // It stands behind its own low ridge and two shoulders, so its feet are always
      // hidden by ground drawn in the same strip: no orbit can make it float.
      {
        phi: CITY_PHI,
        back: (ink, x) => ink.skyline(x, 80, 10.8, 1),
        hills: [{ x: -38, w: 42, h: 4.4 }, { x: 40, w: 42, h: 4.0 }, { x: 0, w: 76, h: 3.0 }],
      },
      { phi: 210, hills: [{ x: -30, w: 56, h: 6.5 }, { x: 24, w: 60, h: 8.5 }] },
      { phi: 262, hills: [{ x: -26, w: 60, h: 7.5 }, { x: 26, w: 52, h: 5.5 }] },
      { phi: 305, hills: [{ x: -16, w: 52, h: 6 }, { x: 24, w: 40, h: 4.5 }] },
      { phi: 348, hills: [{ x: -22, w: 56, h: 7.5 }, { x: 26, w: 50, h: 5.8 }] },
    ],
  }
  // DS clouds, verbatim (docs/ds: the street, flags and Fuji scenes), some mirrored.
  // Plates are sized to the motif's own proportions so nothing is stretched. Each
  // drifts in its own lane of sky, and no lane crosses the far city: hatch over hatch
  // fuses into one grey blob (φ 125°–205° is the city's, with room for parallax).
  const cloud = (id: string, m: DsMotif, lane: [number, number], phi: number, r: number, y: number, w: number, drift: number, mirror = false): Floater => {
    const [x0, y0, x1, y1] = m.crop
    const h = (w * (y1 - y0)) / (x1 - x0)
    return { id, kind: 'cloud', phi, r, y, w, h, drift, lane, draw: (ink) => ink.motif(m, 0, 0, w, 1, { mirror }) }
  }
  const floaters: Floater[] = [
    { id: 'sun', kind: 'sun', phi: 222, r: 108, y: 7.3, w: 3.2, h: 3.2, draw: (ink) => ink.sun(0, 0.2, 2.8, 0.55) },
    cloud('c4', DS.cloudLong, [56, 118], 86, 96, 6.8, 20, 0.1, true),
    cloud('c1', DS.cloud, [206, 250], 209, 96, 6.2, 17, 0.12),
    cloud('c2', DS.cloudLong, [252, 302], 262, 97, 7.2, 22, 0.09),
    cloud('c3', DS.cloudSmall, [302, 332], 312, 95, 6.0, 11, 0.14, true),
    cloud('c5', DS.cloud, [334, 372], 346, 98, 6.4, 16, 0.11, true),
  ]
  return { rings: [far, mid, near], floaters }
}
