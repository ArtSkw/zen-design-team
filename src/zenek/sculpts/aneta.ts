import { Field, polygon2, smax, smin, type V3 } from '../sculpt'
import { pitchOf, yawOf } from './scalp'
import type { SculptSpec } from './types'

// Aneta (docs/cast/aneta.png). The drawn body is a touch taller than wide, so the design
// is read on an ellipse — centre (637, 720) px, 408 px across, 435 px up — and every
// measure is a fraction of those (the hands then come out at the canon 0.27 R, as drawn).
// Straight balayage hair parted a little to the viewer's right, framing the face (cut just
// above the shoulders — see the hair below). A teal flannel shirt worn open over a plaid
// layer: a spread collar, the front edges with their plackets, a curved shirt-tail hem.
// (Short sleeves on the hands, as drawn, were taken off with Artur, 2026-09-25: the hands
// stay bare, as everyone's are.)

const D = Math.PI / 180
const clamp1 = (v: number) => Math.max(-1, Math.min(1, v))

/** Smooth interpolation through [x, y] keys (cubic Hermite, finite-difference tangents). */
function keyed(keys: [number, number][]) {
  const k = [...keys].sort((a, b) => a[0] - b[0])
  const slope = (i: number) => {
    const a = k[Math.max(0, i - 1)]
    const b = k[Math.min(k.length - 1, i + 1)]
    return (b[1] - a[1]) / (b[0] - a[0])
  }
  return (x: number) => {
    if (x <= k[0][0]) return k[0][1]
    for (let i = 1; i < k.length; i++)
      if (x <= k[i][0]) {
        const h = k[i][0] - k[i - 1][0]
        const t = (x - k[i - 1][0]) / h
        const t2 = t * t
        const t3 = t2 * t
        return (2 * t3 - 3 * t2 + 1) * k[i - 1][1] + (t3 - 2 * t2 + t) * h * slope(i - 1) + (-2 * t3 + 3 * t2) * k[i][1] + (t3 - t2) * h * slope(i)
      }
    return k[k.length - 1][1]
  }
}

// ---- the shirt ----------------------------------------------------------------------------
// The collar's roll line and outer edge, by |yaw| (degrees; pitch in degrees): the points
// come from the design, set lower at Artur's word (2026-09-25) so the hair can be longer
// (neck points ±17.5°/−7°, points ±27°/−19.5°), the back from a shirt's collar round a
// neck, 7° deep behind it.
const ROLL = keyed([[17.5, -7], [33, -4], [60, -3], [100, -2], [140, -1], [180, -1]])
const COLLAR: [number, number][] = [[17.5, -7], [33, -4], [60, -3], [100, -2], [140, -1], [181, -1], [181, -8], [140, -8.5], [100, -9.5], [60, -11], [38, -15], [27, -19.5]]
// A shirt-tail hem: longest at the front (−65° under the plackets) and the back, shortest at the sides.
const hem = (yaw: number) => -54.75 - 2.5 * Math.cos(yaw * D) - 7.75 * Math.cos(2 * yaw * D)
// The open front, in frontal design coordinates (x right, y up, R): the left front edge down
// from its collar, the right one, and everything above between the neck points.
const OPEN: [number, number][] = [
  [-0.298, -0.122], [-0.2, -0.235], [-0.091, -0.3], [-0.066, -0.4], [-0.064, -0.779], [-0.064, -1.4],
  [0.137, -1.4], [0.137, -0.874], [0.14, -0.275], [0.2, -0.205], [0.297, -0.14], [0.297, 0.8], [-0.298, 0.8],
]
// (the buttons on the left front's placket are a part of their own: team.ts)

// soft folds: ridges in (yaw, pitch), [from, to, height]
const FOLDS: [[number, number], [number, number], number][] = [
  [[-38, -30], [-42, -58], 0.008],
  [[-56, -24], [-63, -55], 0.009],
  [[40, -32], [44, -58], 0.008],
  [[58, -24], [64, -52], 0.009],
  [[-92, -22], [-114, -48], 0.012],
  [[-96, -22], [-80, -50], 0.009],
  [[92, -22], [114, -48], 0.012],
  [[96, -22], [80, -50], 0.009],
  [[150, -12], [158, -50], 0.008],
  [[-150, -12], [-158, -50], 0.008],
]
function folds(yaw: number, pitch: number) {
  let h = 0
  const c = Math.cos(pitch * D)
  for (const [[y0, p0], [y1, p1], a] of FOLDS) {
    // distance in degrees of arc to the segment (yaw scaled by the latitude)
    const ax = y0 * c
    const bx = y1 * c
    const px = yaw * c
    const ex = bx - ax
    const ey = p1 - p0
    const t = Math.max(0, Math.min(1, ((px - ax) * ex + (pitch - p0) * ey) / (ex * ex + ey * ey)))
    const d = Math.hypot(px - ax - ex * t, pitch - p0 - ey * t)
    const env = Math.sin(Math.PI * Math.min(1, Math.max(0, 0.1 + 0.8 * t))) // fading out at both ends
    h += a * env * Math.exp(-((d / 3.6) ** 2))
  }
  return h
}

function shirtSdf(x: number, y: number, z: number) {
  const r = Math.hypot(x, y, z) || 1e-6
  const ux = x / r
  const uy = y / r
  const uz = z / r
  const yaw = Math.atan2(ux, uz) / D
  const pitch = Math.asin(clamp1(uy)) / D
  const ay = Math.abs(yaw)
  // the fronts and back: a layer over the body below the collar, above the hem, the front open
  const dTop = (ROLL(ay) - 0.6 - pitch) * D
  const dHem = (pitch - hem(yaw)) * D
  const dOpen = uz > 0 ? polygon2(ux, uy, OPEN) : 1
  const placket = dOpen > 0 && dOpen < 0.08 && pitch < -3 ? 0.007 * (1 - smoothstep(0.052, 0.07, dOpen)) : 0
  const outer = 1.036 + folds(yaw, pitch) + placket
  const layer = Math.max(r - outer, 0.992 - r)
  const d = smax(layer, -Math.min(dTop, dHem, dOpen), 0.012)
  return d
}

// The plaid layer underneath, seen between the fronts (a piece of its own, in the shade of
// the fronts, as drawn): set back from them, a round neck at y −0.28.
function innerSdf(x: number, y: number, z: number) {
  const r = Math.hypot(x, y, z) || 1e-6
  const ux = x / r
  const uy = y / r
  const yaw = Math.atan2(ux, z / r) / D
  const pitch = Math.asin(clamp1(uy)) / D
  const cx = (ux - 0.035) / 0.2
  const dIn = Math.min(0.2 - Math.abs(ux - 0.035), -0.28 + 0.05 * cx * cx - uy, (pitch - hem(yaw) - 1.2) * D, z / r - 0.3)
  return smax(Math.max(r - 1.01, 0.985 - r), -dIn, 0.01)
}

// The collar, a piece of its own (its stripes run another way): a leaf lying over the
// shoulders, clear of the fronts by a crease, lifted where it rolls over at the neck, on a
// stand round the neck; points hanging at the front.
function collarSdf(x: number, y: number, z: number) {
  const r = Math.hypot(x, y, z) || 1e-6
  const yaw = Math.atan2(x, z) / D
  const pitch = Math.asin(clamp1(y / r)) / D
  const ay = Math.abs(yaw)
  const dC = polygon2(ay, pitch, COLLAR) * D
  const toRoll = ROLL(Math.max(17.5, ay)) - pitch
  const roll = Math.exp(-((toRoll / 4) ** 2))
  const rc = 1.062 + 0.03 * roll
  let d = smax(Math.abs(r - rc) - 0.016, dC, 0.008)
  // the stand: a band from the shirt's neck up under the fold
  if (ay > 17.5) d = smin(d, smax(Math.max(r - 1.08, 1.0 - r), (Math.abs(toRoll - 1.2) - 2.2) * D, 0.006), 0.01)
  return d
}
const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export const anetaInner: SculptSpec = {
  build: () => ({ sdf: innerSdf }),
  center: [0.035, -0.62, 0.7],
  half: 0.42,
  res: 110,
  ao: { ao: 0.02, aoDark: 0.6 },
  triangles: 4000,
  error: 0.002,
}

export const anetaCollar: SculptSpec = {
  build: () => ({ sdf: collarSdf }),
  center: [0, -0.04, 0],
  half: 1.14,
  res: 200,
  ao: { ao: 0.02, aoDark: 0.55 },
  triangles: 7000,
  error: 0.002,
}

export const anetaShirt: SculptSpec = {
  build: () => ({ sdf: shirtSdf }),
  center: [0, -0.42, 0],
  half: 1.12,
  res: 210,
  ao: { ao: 0.03, aoDark: 0.45 },
  triangles: 18000,
  error: 0.002,
}

// ---- the hair ------------------------------------------------------------------------------
// Simplified with Artur (2026-09-24/25): the design's hair runs on down to the chest; here
// it is a classic straight cut ending just above the collar, and a thin layer (a full one
// made her look heavy). One continuous layer carries the shape: it follows the head's
// sphere (thickest on the crown, so the top stays round, never flat) and ends over the
// face in a round arch clear of the plate — the hairline itself draws that arch. No
// separate locks: they left gaps, thick and thin patches and, where they met at the
// parting, a V over the forehead (Artur, 2026-09-25). The clay's strands follow the fall
// from the parting (`fallAt`). The colour (dark roots, dark blond ends) is the clay's balayage (team.ts).
const PART = 10 // yaw of the parting, a little to the viewer's right
// Where the hair is: above the cut a few degrees over the collar (over the hands, 67–97°
// round, it stops higher — they would brush it talking), and outside the face's opening —
// an arch that reads as a round inverted U from the front: its sides stand at ±38–44° (a
// few degrees clear of the plate), and it closes over the top at 67°, some 9° above the
// plate all round (Artur, 2026-09-25: at 76° it read as a tall forehead). Seen from the
// front a hairline rising toward the crown narrows to a point, so the sides stay out. The U is drawn in arc
// coordinates (yaw · cos pitch, pitch), so distances to it are true on its steep sides —
// measured as pitch above a hairline they came out ten times too steep and the edge stepped.
const CUT = keyed([[0, -1], [46, -1], [62, -1], [67, 12], [97, 12], [104, 2], [180, 2]])
const U_SIDE: [number, number][] = [[45, -40], [44, -3], [43.5, 8], [42.5, 21], [41.5, 33], [40.5, 43], [39.5, 49], [38, 54], [36, 58], [33, 61.5], [28, 64], [22, 65.5], [12, 66.7]]
const arc = ([y, p]: [number, number]): [number, number] => [y * Math.cos(p * D), p]
const U: [number, number][] = [...U_SIDE.map(([y, p]) => arc([-y, p])), [0, 67], ...[...U_SIDE].reverse().map((k) => arc(k))]
/** Degrees into the hair from its nearest edge (negative outside it). */
function inHair(yaw: number, p: number) {
  const cut = p - CUT(Math.abs(yaw))
  return Math.abs(yaw) < 70 ? Math.min(cut, polygon2(yaw * Math.cos(p * D), p, U)) : cut
}
/** The layer's radius where it is full: 0.085 R over the sides rising to 0.13 R on the crown. */
const full = (p: number) => 1.085 + 0.045 * smoothstep(15, 90, p)
/**
 * The layer's outer radius: rounding over from its edge to full within 7° (a quarter-round,
 * as hair curls in at its edge — a ramp read as a bevelled hood), with a soft ripple of locks
 * down the sides and back — part of the one layer, fading out toward the crown.
 */
const outerAt = (yaw: number, p: number) => {
  const e = Math.min(1, Math.max(0, inHair(yaw, p) / 7))
  const round = Math.sqrt(1 - (1 - e) * (1 - e))
  const locks = 0.006 * Math.sin(yaw * D * 16 + 0.6 * Math.sin(yaw * D * 5)) * smoothstep(75, 45, p) * e
  return 1.015 + (full(p) - 1.015) * round + locks
}
/** The layer: from just inside the head out to outerAt, where there is hair, its edge rounded. */
function hairSdf(x: number, y: number, z: number) {
  const r = Math.hypot(x, y, z) || 1e-6
  const yaw = yawOf(x, y, z)
  const p = pitchOf(x, y, z)
  const shell = Math.max(r - outerAt(yaw, p), 0.97 - r)
  return smax(shell, -inHair(yaw, p) * D * r, 0.03)
}

/** The parting: a soft, shallow groove on the crown only (clear of the arch's top, which it would notch; not down the back, where it would read as a slit), in the layer's surface. */
function partCarve(x: number, y: number, z: number) {
  const nx = Math.cos(PART * D)
  const nz = -Math.sin(PART * D)
  const q = Math.atan2(y, x * Math.sin(PART * D) + z * Math.cos(PART * D)) / D // 0 at the face, 90 on top, 180 at the back
  const r = Math.hypot(x, y, z) || 1
  const off = q < 76 ? (76 - q) * D * r : q > 94 ? (q - 94) * D * r : 0
  const slot = Math.hypot(Math.abs(x * nx + z * nz), off) - 0.012
  return Math.max(slot, outerAt(yawOf(x, y, z), Math.min(90, pitchOf(x, y, z))) - 0.008 - r)
}

/**
 * The hair's fall at a point, for the strands: away from the nearest point of the parting,
 * along the head (the great circle from it) — from the parting over the crown and down the
 * sides and back. Smooth everywhere, where the locks' own directions swirled at the crown.
 */
function fallAt(x: number, y: number, z: number): V3 {
  const r = Math.hypot(x, y, z) || 1
  const p: V3 = [x / r, y / r, z / r]
  // the parting's plane holds the vertical axis at yaw PART; q runs 0 (face) → 90 (top) → 180 (back)
  const tx = Math.sin(PART * D)
  const tz = Math.cos(PART * D)
  const q = Math.min(94, Math.max(76, Math.atan2(p[1], p[0] * tx + p[2] * tz) / D)) * D
  const c: V3 = [Math.cos(q) * tx, Math.sin(q), Math.cos(q) * tz]
  const pc = p[0] * c[0] + p[1] * c[1] + p[2] * c[2]
  const t: V3 = [p[0] * pc - c[0], p[1] * pc - c[1], p[2] * pc - c[2]]
  const l = Math.hypot(t[0], t[1], t[2])
  return l < 1e-6 ? [0, -1, 0] : [t[0] / l, t[1] / l, t[2] / l]
}

export const anetaHair: SculptSpec = {
  build: () => {
    const f = new Field([], { base: hairSdf, carve: partCarve, kCarve: 0.014 })
    return { sdf: f.sdf, dirAt: fallAt }
  },
  center: [0, 0.4, 0],
  half: 1.2,
  res: 190,
  ao: { ao: 0.035, aoDark: 0.62 },
  triangles: 16000,
  dirSmooth: 4,
}
