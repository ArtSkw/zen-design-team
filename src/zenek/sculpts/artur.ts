import { Field, lockP, polygon2, smax, type Prim, type V3 } from '../sculpt'
import { mulberry32, range } from '../../lib/rng'
import type { SculptSpec } from './types'

// Artur (docs/cast/artur.png; body circle (683, 558) px, R 445): a full copper beard of
// shingled teardrop tufts, no bigger than drawn — its top follows the plate's lower rim
// and climbs into sideburns that curl up at the ends — under a bushy handlebar
// moustache: locks sweeping out and down from the parting, curling up at the tips.
// Frontal design coordinates (fractions of R) mapped onto the body; the lower beard
// hangs in front of the body rather than wrapping under it.

const zBody = (x: number, y: number) => Math.sqrt(Math.max(0.14, 1 - x * x - y * y))
const onFront = (x: number, y: number, lift: number): V3 => [x, y, zBody(x, y) + lift]

// the beard's outline (traced from the design): a U under the plate, sideburns to Y 0
const OUTLINE: [number, number][] = (() => {
  const half: [number, number][] = [
    [0, -0.1], [-0.3, -0.1], [-0.5, -0.05], [-0.6, 0.0], [-0.69, 0.01], [-0.76, -0.16], [-0.77, -0.36],
    [-0.74, -0.56], [-0.62, -0.72], [-0.47, -0.82], [-0.3, -0.89], [-0.14, -0.93], [0, -0.945],
  ]
  return [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y] as [number, number])]
})()
const thick = (y: number) => 0.08 + 0.09 * Math.min(1, Math.max(0, (-0.15 - y) / 0.7))

function beardTufts(): Prim[] {
  const rng = mulberry32(3701)
  const out: Prim[] = []
  let g = 0
  const at = (x: number, y: number, k: number): V3 => onFront(x, y, thick(y) * k)
  // shingled rows of teardrops, tips down: each rooted back on the bed, swelling forward,
  // its tip over the root of the row below; the outer ones curl outward
  const rows: [number, number[], number][] = [
    [-0.2, [0.65, 0.53], 0.26],
    [-0.36, [0.3, 0.16, 0.02], 0.26],
    [-0.4, [0.63, 0.51, 0.4], 0.27],
    [-0.54, [0.24, 0.1], 0.26],
    [-0.57, [0.5, 0.39, 0.28], 0.25],
    [-0.7, [0.3, 0.17, 0.04], 0.22],
    [-0.8, [0.1], 0.14],
  ]
  for (const [y0, xs, len] of rows)
    for (const ax of xs)
      for (const s of ax === 0 ? [1] : [-1, 1]) {
        const x0 = s * ax + range(rng, -0.012, 0.012)
        const ya = y0 + range(rng, -0.012, 0.012)
        const l = len * range(rng, 0.93, 1.07)
        const curl = (Math.abs(x0) > 0.5 ? 0.03 : 0.015) * Math.sign(x0 || 1) * range(rng, 0.6, 1.2)
        const xm = x0 - x0 * 0.05 + curl * 0.35
        const xt = x0 - x0 * 0.1 + curl
        const ra = range(rng, 0.092, 0.104)
        out.push(...lockP([at(x0, ya, 0.3), at(xm, ya - l * 0.5, 0.95), at(xt, ya - l, 0.82)], [ra * 0.75, ra, 0.036], g++, { segs: 10 }))
      }
  // sideburn tops: small tufts curling up and out at the ends of the beard's top edge
  for (const s of [-1, 1]) {
    out.push(...lockP([onFront(s * 0.6, -0.14, 0.07), onFront(s * 0.66, -0.05, 0.09), onFront(s * 0.7, 0.0, 0.075)], [0.072, 0.058, 0.03], g++, { segs: 8 }))
  }
  return out
}

export const arturBeard: SculptSpec = {
  build: () => {
    const T = beardTufts()
    const bed = (x: number, y: number, z: number) => {
      const zb = zBody(x, y)
      return smax(Math.max(z - (zb + thick(y) * 0.55), zb - 0.06 - z), polygon2(x, y, OUTLINE), 0.05)
    }
    // the design's U: tufts are softly held inside the traced outline (a little proud of it)
    const clip = (x: number, y: number, z: number) => (y > 0.14 || z < 0.1 ? 0.2 : polygon2(x, y, OUTLINE) - 0.035)
    const f = new Field(T, { k: 0.034, kGroups: 0.034, base: bed, kBase: 0.034, clip, kClip: 0.04 })
    return { sdf: f.sdf, dirAt: (x, y, z) => f.dirAt(x, y, z) }
  },
  center: [0, -0.46, 0.72],
  half: 0.9,
  res: 150,
  ao: { ao: 0.045, aoDark: 0.7 },
  triangles: 26000,
}

// ---- the handlebar ----------------------------------------------------------------------
function moustacheLocks(): Prim[] {
  const out: Prim[] = []
  let g = 0
  const lift = 0.27
  const at = (x: number, y: number, dz = 0): V3 => onFront(x, y, lift + dz)
  for (const s of [-1, 1]) {
    // stacked locks from the parting, fanning out and down, converging into the tip
    for (let i = 0; i < 8; i++) {
      const u = i / 7 // 0 = top lock, 1 = bottom lock
      const y0 = -0.1 - u * 0.2
      const bulge = 0.03 * (1 - u) // the upper locks swell at the parting
      const pts: V3[] = [
        at(s * 0.025, y0 + bulge * 0.3, -0.02),
        at(s * 0.15, y0 - 0.005 + bulge, 0.025 - u * 0.02),
        at(s * 0.3, -0.19 - u * 0.1, 0.01),
        at(s * 0.43, -0.27 - u * 0.05, -0.025),
        at(s * 0.505, -0.29, -0.05),
      ]
      out.push(...lockP(pts, [0.056, 0.074 - u * 0.014, 0.056, 0.036, 0.024], g++, { segs: 14 }))
    }
    // the curl: up and a little back in at the tip
    out.push(...lockP([at(s * 0.47, -0.285, -0.04), at(s * 0.535, -0.27, -0.05), at(s * 0.55, -0.215, -0.06), at(s * 0.515, -0.18, -0.065)], [0.036, 0.032, 0.026, 0.018], g++, { segs: 12 }))
  }
  return out
}

export const arturMoustache: SculptSpec = {
  build: () => {
    const f = new Field(moustacheLocks(), { k: 0.03, kGroups: 0.012 })
    return { sdf: f.sdf, dirAt: (x, y, z) => f.dirAt(x, y, z) }
  },
  center: [0, -0.2, 1.08],
  half: 0.64,
  res: 130,
  ao: { ao: 0.03, aoDark: 0.72 },
  triangles: 16000,
}

