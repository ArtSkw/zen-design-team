import { Field, coneP, lockP, type Prim, type V3 } from '../sculpt'
import { mulberry32 } from '../../lib/rng'
import { onScalp } from './scalp'
import type { SculptSpec } from './types'

// Mateusz N (docs/cast/mateusz-n.png; body circle (626, 624) px, R 419): short dark-brown
// hair — a close cap with a twisted rope of lobes along the crown and a few tufts at the
// sides, under the headphone band (kit); a fuzzy moustache and goatee on the body below
// the plate, over the stubble (kit).

function hairPrims(): Prim[] {
  const rng = mulberry32(79)
  const out: Prim[] = []
  let g = 0
  // the rope: fat lobes along the crown, each tilted the other way — a twist — front to back
  const n = 10
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const pitch = 70 + t * 62 // past 90° runs down the back
    const yawBase = pitch > 90 ? 180 : 0
    const pp = pitch > 90 ? 180 - pitch : pitch
    const tilt = (i % 2 ? 1 : -1) * 22
    const a = onScalp(yawBase - tilt, pp - 5, 1.035)
    const b = onScalp(yawBase + tilt, pp + 6, 1.075)
    out.push(coneP(a, b, 0.068, 0.04, g++))
  }
  // tufts at the sides, above the temples, flicking up and back
  const clusters: [number, number][] = [
    [-56, 44], [-48, 52], [-62, 56], [-44, 60],
    [52, 46], [46, 55], [60, 58], [42, 63],
  ]
  for (const [y, p] of clusters) {
    const y0 = y + (rng() - 0.5) * 4
    const p0 = p + (rng() - 0.5) * 4
    const pts: V3[] = [onScalp(y0, p0, 1.0), onScalp(y0 - Math.sign(y0) * 4, p0 + 7, 1.045), onScalp(y0 - Math.sign(y0) * 8, p0 + 14, 1.05)]
    out.push(...lockP(pts, [0.05, 0.042, 0.012], g++, { segs: 8 }))
  }
  return out
}

export const mateuszHair: SculptSpec = {
  build: () => {
    const f = new Field(hairPrims(), { k: 0.018, kGroups: 0.024 })
    return { sdf: f.sdf, dirAt: (x, y, z) => f.dirAt(x, y, z) }
  },
  center: [0, 0.5, -0.05],
  half: 1.2,
  res: 140,
  ao: { ao: 0.03, aoDark: 0.5 },
  triangles: 20000,
}

// ---- moustache and goatee, on the body below the plate (frontal coordinates) -------------
const onFront = (x: number, y: number, lift: number): V3 => {
  const z = Math.sqrt(Math.max(0.05, 1 - x * x - y * y))
  const k = 1 + lift
  return [x * k, y * k, z * k]
}

/** A feather-shaped tuft lying on the body: round at the root, a point at the tip, flattened against the surface. */
function feather(x0: number, y0: number, x1: number, y1: number, ra: number, lift: number, group: number): Prim {
  return coneP(onFront(x0, y0, lift), onFront(x1, y1, lift * 0.8), ra, ra * 0.45, group, 1.9)
}

function beardPrims(): Prim[] {
  const rng = mulberry32(83)
  const out: Prim[] = []
  let g = 0
  const j = (a: number) => (rng() - 0.5) * a
  // measured (design px → frontal R): the moustache is a horseshoe — a band under the
  // plate at y −0.245 whose ends droop to (±0.3, −0.42); two rows of feathers along it,
  // pointing down and out
  const path = (s: number): [number, number] => [0.3 * s * (0.9 + 0.1 * Math.abs(s)), -0.245 - 0.175 * Math.abs(s) ** 3]
  // each feather lies along the band, combed outward from the middle (down at the ends)
  for (let row = 0; row < 2; row++) {
    const n = 13
    for (let i = 0; i < n; i++) {
      const s = -1 + (2 * (i + 0.5 * row)) / n + j(0.02)
      const side = s < 0 ? -1 : 1
      const [x, y] = path(s)
      const [xa, ya] = path(s + 0.03 * side)
      let tx = xa - x
      let ty = ya - y
      const tl = Math.hypot(tx, ty) || 1
      tx /= tl
      ty /= tl
      const dx = tx * 0.55 // diagonal: out along the band, and down across it
      const dy = ty * 0.55 - 0.85
      const dl = Math.hypot(dx, dy)
      const len = 0.08 + j(0.012)
      const ox = x - row * 0.01 * side
      const oy = y + 0.025 - row * 0.035
      out.push(feather(ox, oy, ox + (dx / dl) * len, oy + (dy / dl) * len, 0.03 + j(0.004), 0.04 + (1 - row) * 0.008, g++))
    }
  }
  // the goatee: short feathers stacked densely in rows under the mouth, pointing down,
  // a rounded block from y −0.36 to −0.69, x −0.13…+0.15
  const rows: [number, number, number][] = [
    [-0.36, 5, 0.1],
    [-0.42, 5, 0.11],
    [-0.48, 5, 0.11],
    [-0.54, 4, 0.1],
    [-0.6, 3, 0.07],
  ]
  for (const [y0, n, half] of rows)
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0 : -1 + (2 * i) / (n - 1)
      const x0 = 0.01 + u * half + j(0.012)
      const len = 0.075 + j(0.012)
      out.push(feather(x0, y0 + j(0.01), x0 * 0.94, y0 - len, 0.034 + j(0.004), 0.045 - (y0 + 0.36) * 0.02, g++))
    }
  return out
}

export const mateuszBeard: SculptSpec = {
  build: () => {
    const f = new Field(beardPrims(), { k: 0.01, kGroups: 0.007 })
    return { sdf: f.sdf, dirAt: (x, y, z) => f.dirAt(x, y, z) }
  },
  center: [0, -0.48, 0.8],
  half: 0.46,
  res: 150,
  ao: { ao: 0.02, aoDark: 0.55 },
  triangles: 16000,
}
