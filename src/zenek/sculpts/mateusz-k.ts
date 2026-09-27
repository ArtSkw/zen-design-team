import { Field, hash, polygon2, smax, smin, type Prim, type V3 } from '../sculpt'
import { mulberry32 } from '../../lib/rng'
import { smooth } from '../../lib/anim'
import { hairline, onScalp, pitchOf, scalpShell, yawOf } from './scalp'
import { leavesAlong, sweptQuiff } from './swept'
import type { SculptSpec } from './types'

// Mateusz K (docs/cast/mateusz-k.png — the 2026-09-24 design; body circle (700, 640) px,
// R 410, fitted): a high pompadour, as in the design and his photo (Artur, 2026-09-27: the
// first build — the same 0.4–0.5 R of hair all round — read as a mop). The volume is where a
// pompadour has it: a steep wall of hair rising off a hairline just above the plate, a full, flat
// top ~1.42 R high (the design's), cresting a touch right of centre and sweeping back, falling
// away over the crown; the sides and the back short and tight, close to the head (like Mirek's
// and Krystian's, Artur's word) — faded, not stood out as drawn at the temples.

const D = Math.PI / 180

const edge = hairline([
  [0, 56],
  [30, 52],
  [60, 40],
  [85, 26],
  [120, 18],
  [180, 12],
])

/** The pompadour's height over the short cap, for a unit direction: on top only, front-heavy, flat across, a touch right of centre. */
function pompadour(x: number, y: number, z: number) {
  const up = smooth(0.62, 0.92, y) // on top
  const fb = z > 0.25 ? 1 : z > -0.6 ? 0.25 + 0.75 * smooth(-0.6, 0.25, z) : 0.25 * smooth(-0.95, -0.6, z) // front-heavy, fading back over the crown
  const ax = (x - 0.08) / 0.6
  const across = Math.exp(-ax * ax) // rounded across (a flat top with steep sides read as a bucket)
  return 0.42 * up * fb * across
}
// the hair's outer radius: a short, faded cap everywhere (sides, back), the pompadour on top
// rising steeply off the hairline (a wall, not a slope), carved into broad locks swept diagonally
// up and to the viewer's right (as the locks on top run) — a smooth wall read as a hat
const outerAt = (yaw: number, p: number) => {
  const x = Math.cos(p * D) * Math.sin(yaw * D)
  const y = Math.sin(p * D)
  const z = Math.cos(p * D) * Math.cos(yaw * D)
  const e = p - edge(yaw)
  const pomp = pompadour(x, y, z) * smooth(0, 9, e)
  const across = (yaw * Math.cos(p * D) - 0.85 * p) / 1.31 // degrees across the locks
  const ph = (across / 7) * Math.PI * 2 + 0.9 * Math.sin(p / 11)
  const crest = Math.pow(0.5 + 0.5 * Math.cos(ph), 0.55)
  const relief = 0.042 * (crest - 0.55) * smooth(0.04, 0.25, pomp)
  return 1.02 + 0.045 * smooth(0, 10, e) + pomp + relief
}

function hair(): Prim[] {
  const rng = mulberry32(83)
  let g = 0
  const group = () => g++
  // the pompadour's locks: thick glossy clumps rooted along the hairline, swept up the wall and
  // back over the top, bending a little to the viewer's right, their tips lifting
  const leaf = { outerAt, width: 0.28, lanes: 4, lift: 0.05, radii: [0.04, 0.052, 0.046, 0.03, 0.01] }
  // (swept diagonally from the start — front-loaded — so the front wall shows the sweep, not vertical stripes)
  // (rooted on top of the front wall, not on it: their rounded root ends along the wall hung over the
  // forehead like drips; the wall is the shell, its strands running with the locks' diagonal sweep)
  const out = sweptQuiff({ edge, onScalp, rows: 3, rowStep: 10, yaw: [-50, 50], spacing: 16, sweep: 60, reach: 56, leaves: [[0, 0.52], [0.4, 1.0]], leaf, rng, group, inset: 11, sweepEase: 3 })
  // the short sides and back: small locks combed back and down, lying close
  const small = { ...leaf, width: 0.17, lanes: 3, lift: 0.015, radii: [0.022, 0.028, 0.025, 0.018, 0.007] }
  for (const s of [-1, 1])
    for (let i = 0; i < 4; i++) {
      const y0 = s * (58 + i * 11)
      out.push(...leavesAlong(onScalp(y0, edge(y0) + 4, 1), onScalp(s * (104 + i * 16), edge(104 + i * 16) + 3, 1), [[0.05, 0.55], [0.45, 1.0]], group, small))
    }
  for (let yaw = 125; yaw <= 235; yaw += 16) {
    const y0 = yaw + (rng() - 0.5) * 6
    out.push(...leavesAlong(onScalp(y0 * 0.25, 100, 1), onScalp(y0, edge(y0) + 3, 1), [[0.35, 0.72], [0.62, 1.0]], group, small))
  }
  return out
}

export const mateuszKHair: SculptSpec = {
  build: () => {
    const base = scalpShell((yaw) => edge(yaw) + 1, 0.97, (p) => p, 0.012, (x, y, z) => outerAt(yawOf(x, y, z), pitchOf(x, y, z)))
    const f = new Field(hair(), { k: 0.05, kGroups: 0.012, base, kBase: 0.03 })
    return { sdf: f.sdf, dirAt: (x, y, z) => f.dirAt(x, y, z) }
  },
  center: [0, 0.5, -0.02],
  half: 1.4,
  res: 176,
  ao: { ao: 0.04, aoDark: 0.5 },
  triangles: 34000,
}

// ---- the beard ----------------------------------------------------------------------------------
// The design's short, dense beard in the cast's clay (Artur, 2026-09-27: the bead stubble read as a
// sketched texture): one soft, slightly puffy layer over the plate's lower part and down round the
// jaw, rounded at every edge, a bare white mouth area cut out of it with the T-shaped soul patch
// standing in it; short tufts in low relief fanning down and out from under the nose, their tips
// fraying the edge a little; fuller where the moustache runs over the mouth and in the soul patch.
// Frontal design coordinates (fractions of R), the outline the stubble had.
// Its upper sides follow the white face's own edge (Artur, 2026-09-27: a traced outline left a black
// wedge between the sideburns and the plate), overlapping it by a hair; the jaw line outside is a
// smooth rounded curve like the mascot's, the sideburns ending in round caps, not points.
const PLATE = { a: 0.78, b: 0.6, y: 0.2 } // team.ts: his face (the plate reaches down round the mouth)
/** The plate's outline in frontal coordinates (x, y as fractions of R), as the plate is built (Zenek.tsx). */
const PLATE_OUTLINE: [number, number][] = (() => {
  const n = 2.3
  const t = Math.asin(PLATE.y)
  const out: [number, number][] = []
  for (let k = 0; k < 160; k++) {
    const th = (k / 160) * Math.PI * 2
    const c = Math.cos(th)
    const sn = Math.sin(th)
    const xa = PLATE.a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n)
    const ya = PLATE.b * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n)
    const P = [Math.cos(ya) * Math.sin(xa), Math.sin(ya), Math.cos(ya) * Math.cos(xa)]
    out.push([P[0], P[1] * Math.cos(t) + P[2] * Math.sin(t)])
  }
  return out
})()
/** The jaw line: a rounded superellipse round the lower face (frontal R units, negative inside). */
function jaw(fx: number, fy: number) {
  const ax = 0.735 // no wider: a paw at rest brushed it when the head turned (scripts/check-hands.mjs --turn)
  const ay = 0.54
  const cy = -0.05
  const q = Math.pow(Math.pow(Math.abs(fx) / ax, 2.4) + Math.pow(Math.abs(fy - cy) / ay, 2.4), 1 / 2.4)
  return (q - 1) * Math.min(ax, ay)
}
/** The moustache's top line, over the plate (frontal y by |x|): dipping a little at the corners of the mouth. */
function moustacheTop(ax: number) {
  const k: [number, number][] = [[0, -0.085], [0.24, -0.078], [0.44, -0.12], [0.6, -0.1], [0.75, -0.05]]
  for (let i = 1; i < k.length; i++)
    if (ax <= k[i][0]) {
      const t = (ax - k[i - 1][0]) / (k[i][0] - k[i - 1][0])
      const sm = t * t * (3 - 2 * t)
      return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * sm
    }
  return k[k.length - 1][1]
}
const SIDEBURN_TOP = 0.13

// the bare mouth area (its corners rounded, as drawn), the soul patch standing in it: a rounded
// bar under the lip (−0.224…−0.3) tapering into a stem
const MOUTH: [number, number][] = [
  [-0.31, -0.18], [0.33, -0.18], [0.36, -0.19], [0.372, -0.215], [0.37, -0.29], [0.34, -0.335], [0.29, -0.365], [0.07, -0.378],
  [0.078, -0.34], [0.085, -0.318], [0.115, -0.302], [0.15, -0.296], [0.168, -0.28], [0.172, -0.25], [0.16, -0.23], [0.135, -0.224],
  [-0.135, -0.224], [-0.16, -0.23], [-0.172, -0.25], [-0.168, -0.28], [-0.15, -0.296], [-0.115, -0.302], [-0.085, -0.318], [-0.078, -0.34],
  [-0.085, -0.378], [-0.27, -0.37], [-0.315, -0.34], [-0.34, -0.29], [-0.342, -0.215], [-0.33, -0.19],
]
const FAN: [number, number] = [0.02, 0.12] // the tufts fan out from here (under the nose)

/** Rounded tufts: the nearest of a jittered 3D grid of tuft centres (cells ~0.038 R, a little taller than wide), as a dome 0…1. */
function tufts(x: number, y: number, z: number) {
  const S = 0.038
  const qx = x / S, qy = y / (S * 1.35), qz = z / S
  const ix = Math.floor(qx), iy = Math.floor(qy), iz = Math.floor(qz)
  let best = 9
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      for (let k = -1; k <= 1; k++) {
        const c = (ix + i) * 157 + (iy + j) * 113 + (iz + k) * 271
        const dx = ix + i + 0.15 + 0.7 * hash(c) - qx
        const dy = iy + j + 0.15 + 0.7 * hash(c + 1) - qy
        const dz = iz + k + 0.15 + 0.7 * hash(c + 2) - qz
        best = Math.min(best, dx * dx + dy * dy + dz * dz)
      }
  return Math.sqrt(Math.max(0, 1 - best / 0.55))
}

function beardSdf(x: number, y: number, z: number) {
  const r = Math.hypot(x, y, z) || 1e-6
  const fx = x / r
  const fy = y / r
  if (z / r < 0.15) return 0.3
  // short rounded tufts of irregular size, packed together (a regular pattern read as knitting, a
  // smooth pad as felt)
  const t = tufts(x, y, z)
  // where the beard is (frontal R units; negative inside): inside the rounded jaw line (its edge on
  // the black body lumpy with the tufts' tips), and either below the moustache line or off the white
  // face — whose edge it meets exactly, overlapping it by a hair (a clean line, no lumps); the
  // sideburns capped round at their tops; the corners where the edges meet rounded
  const dJaw = jaw(fx, fy) + 0.011 * (0.45 - t)
  const plate = polygon2(fx, fy, PLATE_OUTLINE) // negative on the white face
  const offFace = -plate - 0.012
  const below = fy - moustacheTop(Math.abs(fx))
  const dHole = -polygon2(fx, fy, MOUTH) + 0.006 * (0.45 - t)
  const region = smax(smax(smax(dJaw, smin(below, offFace, 0.03), 0.02), fy - SIDEBURN_TOP, 0.06), dHole, 0.012)
  const inside = Math.max(0, -region)
  // a little fuller over the mouth (the moustache) and in the soul patch
  const full = 0.026 + 0.008 * Math.exp(-(((fy + 0.13) / 0.05) ** 2)) * (Math.abs(fx) < 0.42 ? 1 : 0) + 0.008 * Math.exp(-((fx / 0.16) ** 2) - ((fy + 0.29) / 0.07) ** 2)
  const round = Math.sqrt(1 - (1 - Math.min(1, inside / 0.03)) ** 2)
  const relief = 0.012 * (t - 0.45) * Math.min(1, inside / 0.015)
  const outer = 1.004 + full * round + relief
  const layer = Math.max(r - outer, 0.99 - r)
  return smax(layer, region * r, 0.008)
}

/** The tufts' direction for the strands: down and out from under the nose. */
function beardDir(x: number, y: number, z: number): V3 {
  const r = Math.hypot(x, y, z) || 1e-6
  const u: V3 = [x / r, y / r, z / r]
  const d: V3 = [u[0] - FAN[0], u[1] - FAN[1], 0]
  const k = d[0] * u[0] + d[1] * u[1] + d[2] * u[2]
  const t: V3 = [d[0] - k * u[0], d[1] - k * u[1], d[2] - k * u[2]]
  const l = Math.hypot(...t) || 1
  return [t[0] / l, t[1] / l, t[2] / l]
}

export const mateuszKBeard: SculptSpec = {
  build: () => ({ sdf: beardSdf, dirAt: beardDir }),
  center: [0, -0.28, 0.82],
  half: 0.66,
  res: 220,
  ao: { ao: 0.02, aoDark: 0.55 },
  triangles: 22000,
  dirSmooth: 3,
}
