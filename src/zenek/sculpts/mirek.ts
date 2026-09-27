import { Field, polygon2, smax, smin, type Prim } from '../sculpt'
import { mulberry32 } from '../../lib/rng'
import { smooth } from '../../lib/anim'
import { hairline, onScalp, pitchOf, scalpShell, yawOf } from './scalp'
import { leavesAlong } from './swept'
import { COLLAR_OUTER, COLLAR_ROLL, FLAP, FLAP_T, HEM, LEATHER, V_TIP, ZIP_TOP } from '../jacket-layout'
import type { SculptSpec } from './types'

// Mirek (docs/cast/mirek.png; body circle (627, 630) px, R 384 — fitted on the head's sides
// and top; the drawn jacket hangs below the sphere, see jacket-layout.ts).
//
// The hair: dark brown, full and tousled, from a side part above the right temple — big flat
// leaf-shaped locks combed from it right to left across the forehead and over the crown, their
// points lifting at the left; to the right of the part a few locks fall down past the right
// temple. The hairline, as drawn: 58° up over the middle of the forehead (a band of black above
// the plate), 44° at ±73° round, 29° over the ears. Kept close to the head (Artur, 2026-09-26):
// the crest ~1.25 R, the sides no more than ~0.2 R off it, inside the body's outline from the front. Krystian's method (leaves along paths from the part), mirrored and fuller.

const D = Math.PI / 180

const edge = hairline([
  [0, 58],
  [35, 57],
  [57, 54],
  [73, 44],
  [90, 29],
  [120, 18],
  [180, 13], // tucked behind the collar at the nape
])

// the cap under the leaves: thin at the hairline, rounding up to full within ~14°; close to the
// head down the sides and the back, full only on top (Artur, 2026-09-26: the fuller cut stood out
// past his body's outline at the sides)
const outerAt = (yaw: number, p: number) => {
  const u = Math.min(1, Math.max(0, (p - edge(yaw)) / 14))
  const full = 0.055 + 0.105 * smooth(45, 85, p)
  const crest = 0.04 * Math.exp(-(((yaw + 18) / 45) ** 2) - ((p - 80) / 16) ** 2) // the crest, a little left of centre
  return 1.02 + full * Math.sin((u * Math.PI) / 2) + crest
}

// the side part, above the right temple: from the front hairline back over the crown
const PART = (u: number) => onScalp(38 + 118 * u, 66 + 10 * Math.sin(Math.PI * u), 1)

function locks(): Prim[] {
  const rng = mulberry32(73)
  const out: Prim[] = []
  let g = 0
  const group = () => g++
  const o = { outerAt, width: 0.32, lift: 0.08, radii: [0.04, 0.05, 0.046, 0.03, 0.011] }
  // from the part, rows of big overlapping leaves combed over to the viewer's left, their
  // points lifting; later rows run further back
  const rows = 8
  for (let i = 0; i < rows; i++) {
    const u = i / (rows - 1)
    const from = PART(u)
    const to = onScalp(-84 - 92 * u + (rng() - 0.5) * 6, 36 - 14 * u)
    const st = (i % 2) * 0.16
    const stretches: [number, number][] = [
      [0.02 + st, 0.5 + st],
      [0.42 + st * 0.6, 1.04],
    ]
    out.push(...leavesAlong(from, to, stretches, group, { ...o, width: 0.3 + rng() * 0.07 }))
  }
  // to the right of the part: a few locks falling past the right temple, points down and out
  for (let i = 0; i < 5; i++) {
    const u = i * 0.13
    out.push(...leavesAlong(PART(u), onScalp(86 + 42 * u, 27 - 6 * u), [[0.04, 0.58], [0.46, 1.04]], group, { ...o, width: 0.28, lift: 0.04 }))
  }
  // behind the part: locks combed down the back to the nape (the base shell showed bare there)
  for (let i = 0; i < 6; i++) {
    const u = 0.35 + i * 0.13
    const y1 = 112 + i * 14 + (rng() - 0.5) * 6
    out.push(...leavesAlong(PART(Math.min(1, u)), onScalp(y1, edge(y1) + 3), [[0.05, 0.56], [0.46, 1.03]], group, { ...o, width: 0.28, lift: 0.035 }))
  }
  return out
}

export const mirekHair: SculptSpec = {
  build: () => {
    const base = scalpShell((yaw) => edge(yaw) + 1, 0.97, (p) => p, 0.02, (x, y, z) => outerAt(yawOf(x, y, z), pitchOf(x, y, z)))
    const f = new Field(locks(), { k: 0.024, kGroups: 0.009, base, kBase: 0.022 })
    return { sdf: f.sdf, dirAt: (x, y, z) => f.dirAt(x, y, z) }
  },
  center: [0, 0.55, -0.05],
  half: 1.32,
  res: 168,
  ao: { ao: 0.035, aoDark: 0.5 },
  triangles: 30000,
}

// ---- the jacket --------------------------------------------------------------------------------
/** Linear interpolation through [x, y] keys. */
const lerpKeys = (keys: [number, number][]) => (x: number) => {
  if (x <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++)
    if (x <= keys[i][0]) {
      const t = (x - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])
      const s = t * t * (3 - 2 * t)
      return keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * s
    }
  return keys[keys.length - 1][1]
}
const ROLL = lerpKeys(COLLAR_ROLL)
const angles = (x: number, y: number, z: number) => {
  const r = Math.hypot(x, y, z) || 1e-6
  return { r, yaw: Math.atan2(x, z) / D, pitch: Math.asin(Math.max(-1, Math.min(1, y / r))) / D }
}

/** The leather's top edge: under the collar round the neck and back; the fronts' V between the lapel tips. */
function topAt(ay: number) {
  if (ay >= V_TIP[0]) return ROLL(ay) - 2
  return ZIP_TOP + (V_TIP[1] - ZIP_TOP) * (ay / V_TIP[0])
}

// soft leather folds: ridges in (yaw, pitch), [from, to, height] — puckers at the waist beside the
// zip and round the sides, a crease under each lapel
const FOLDS: [[number, number], [number, number], number][] = [
  [[12, -48], [20, -60], 0.006],
  [[70, -40], [95, -52], 0.009],
  [[100, -25], [118, -45], 0.008],
  [[150, -20], [158, -50], 0.007],
  [[40, -20], [66, -24], 0.006],
]
function folds(ay: number, pitch: number) {
  let h = 0
  const c = Math.cos(pitch * D)
  for (const [[y0, p0], [y1, p1], a] of FOLDS) {
    const ax = y0 * c
    const bx = y1 * c
    const px = ay * c
    const ex = bx - ax
    const ey = p1 - p0
    const t = Math.max(0, Math.min(1, ((px - ax) * ex + (pitch - p0) * ey) / (ex * ex + ey * ey)))
    const d = Math.hypot(px - ax - ex * t, pitch - p0 - ey * t)
    const env = Math.sin(Math.PI * Math.min(1, Math.max(0, 0.1 + 0.8 * t)))
    h += a * env * Math.exp(-((d / 3.2) ** 2))
  }
  return h
}

/** Distance (R, along the surface) to a pocket flap: a rounded rectangle, its lower edge a gentle curve down in the middle. */
function flapDist(ay: number, pitch: number) {
  const [y0, y1] = FLAP.yaw
  const [p0, p1] = FLAP.pitch
  const c = Math.cos(pitch * D)
  const mid = (y0 + y1) / 2
  const u = (ay - mid) / ((y1 - y0) / 2) // −1…1 across
  const bottom = p0 - 1.5 * (1 - u * u) // the lower edge dips a little in the middle
  const dx = (Math.abs(ay - mid) - (y1 - y0) / 2) * c
  const dy = Math.max(bottom - pitch, pitch - p1)
  const r = 2.2 // corner radius, degrees
  const qx = dx + r
  const qy = dy + r
  return (Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r) * D
}

function jacketSdf(x: number, y: number, z: number) {
  const { r, yaw, pitch } = angles(x, y, z)
  const ay = Math.abs(yaw)
  const inside = Math.min((topAt(ay) - pitch) * D, (pitch - HEM) * D) // > 0 in the jacket's region
  // the fronts' edges round over (a thick leather edge), and the zip line is a soft seam
  const seam = -0.004 * Math.exp(-((ay / 1.2) ** 2)) * (pitch < ZIP_TOP ? 1 : 0)
  const outer = LEATHER + folds(ay, pitch) + seam
  const layer = smax(Math.max(r - outer, 0.99 - r), -inside, 0.014)
  // the pocket flaps: a pad over the leather, its edge rounded
  const flap = smax(Math.max(r - (outer + FLAP_T), 1.0 - r), flapDist(ay, pitch), 0.01)
  return smin(layer, flap, 0.004)
}

export const mirekJacket: SculptSpec = {
  build: () => ({ sdf: jacketSdf }),
  center: [0, -0.4, 0],
  half: 1.1,
  res: 200,
  ao: { ao: 0.03, aoDark: 0.5 },
  triangles: 20000,
  error: 0.002,
}

// ---- the shearling collar ------------------------------------------------------------------------
// A thick rolled band over the shoulders and round the back of the neck, its fronts pointed
// lapels ending just above the zip's V (as drawn: the neck edge from (±20°, −7°) up past the
// plate's lower corners to 10° over the shoulders, the outer edge dipping to −19° half-way out).
const OUTLINE: [number, number][] = [...COLLAR_ROLL, ...[...COLLAR_OUTER].reverse().slice(0, -1)] // both run on past 180°, so the back is no edge

function collarSdf(x: number, y: number, z: number) {
  const { r, yaw, pitch } = angles(x, y, z)
  const ay = Math.abs(yaw)
  const dC = polygon2(ay * Math.cos(pitch * D), pitch, OUTLINE.map(([a, p]) => [a * Math.cos(p * D), p])) // degrees, < 0 inside
  // a pillow lying on the leather: full thickness a few degrees in from its edge, rounding over
  // to nothing at the edge (a shearling collar is soft all round, never cut); a little fuller
  // where it rolls over at the neck — but lying flat, not standing off the body (Artur,
  // 2026-09-26: the fuller roll stood out like a funnel round the neck)
  const toRoll = ROLL(Math.max(V_TIP[0], ay)) - pitch // degrees below the neck edge
  const roll = Math.exp(-(((toRoll - 4) / 7) ** 2))
  const full = 0.03 + 0.008 * roll // half-thickness
  const e = Math.min(1, Math.max(0, -dC / 6))
  const half = full * Math.sqrt(1 - (1 - e) * (1 - e))
  const mid = LEATHER + 0.004 + full * 0.85
  return Math.max(Math.abs(r - mid) - half, dC * D * 0.5)
}

export const mirekCollar: SculptSpec = {
  build: () => ({ sdf: collarSdf }),
  center: [0, 0.05, 0],
  half: 1.2,
  res: 220,
  ao: { ao: 0.03, aoDark: 0.55 },
  triangles: 14000,
  error: 0.002,
}
