import { Field, ellipsoidP, hash, lockP, polygon2, smax, type Prim, type V3 } from '../sculpt'
import { keyed, smooth } from '../../lib/anim'
import { onScalp } from './scalp'
import { EDYTA_FACE, KERCHIEF_C, KERCHIEF_N, KERCHIEF_T, KNOT, hairOuter } from '../edyta-layout'
import type { SculptSpec } from './types'

// Edyta the storyteller (docs/cast/edyta.png; body circle (655, 650) px, R 390): loose blond
// waves under a red kerchief with a gold celestial print, tied at the back of her right side.
//
// The hair: one continuous shell (Magda J's method — separate locks leave gaps and lumps),
// carved into loose waves falling from the crown, dark at the roots and blond below (the clay's
// balayage, team.ts). Thin, close to the head (2026-09-27: thinner again, a touch darker). Its
// hairline follows the plate's own outline just above it (1.5° over its top: any band of black
// there read as a tall forehead), lying ~2° over its widest sides as drawn. Every lock ends in its
// own loose point — narrowing over its last degrees, at its own length, flicking out a little —
// like the drawn ends, not a rounded hem. Long beside the face (yaw 33–46°, down to the body's
// lower third) and, right behind the paws, long down the sides and the back; over the paws
// (yaw 60–94°) the points reach down to 11°, clear of them in every gesture — her paws turn and
// tilt with her body (trait `rigidPaws`), so hair beside them never swings into them
// (scripts/check-hands.mjs edyta --turn).

const D = Math.PI / 180

// The hem by |yaw|: long curtains in front of the shoulders, up above the hands, long behind.
const HEM = keyed([[0, -32], [39, -32], [43.5, -27], [46.5, -12], [50, 1], [55, 8], [60, 11], [94, 11], [98, -8], [103, -26], [180, -32]])
// The hairline over the face, drawn from the plate's outline in arc coordinates (yaw·cos pitch,
// pitch): pushed out 1.5° over its top, in to lie 2° over its widest sides, then straight down.
const U: [number, number][] = (() => {
  const { a, b, y } = EDYTA_FACE.plate
  const n = 2.3
  const t = Math.asin(y)
  const toArc = (xa: number, ya: number): [number, number] => {
    const P = [Math.cos(ya) * Math.sin(xa), Math.sin(ya), Math.cos(ya) * Math.cos(xa)]
    const X = P[0]
    const Y = P[1] * Math.cos(t) + P[2] * Math.sin(t)
    const Z = -P[1] * Math.sin(t) + P[2] * Math.cos(t)
    const p = Math.asin(Y) / D
    return [(Math.atan2(X, Z) / D) * Math.cos(p * D), p]
  }
  const c: [number, number] = [0, t / D]
  const side: [number, number][] = [] // the right side, from the widest point up to the top
  for (let k = 0; k <= 30; k++) {
    const th = (k / 30) * (Math.PI / 2)
    const [x, p] = toArc(a * Math.pow(Math.cos(th), 2 / n), b * Math.pow(Math.sin(th), 2 / n))
    const dx = x - c[0]
    const dy = p - c[1]
    const l = Math.hypot(dx, dy) || 1
    const off = -2 + 3.5 * smooth(25, 70, (th * 180) / Math.PI)
    side.push([x + (dx / l) * off, p + (dy / l) * off])
  }
  const right: [number, number][] = [[side[0][0], -70], ...side]
  const left = right.map(([x, p]) => [-x, p] as [number, number])
  return [...left.slice(0, -1), ...[...right].reverse()]
})()

// The locks: they fall from a point on the crown (P), each waving in its own time.
const P: V3 = onScalp(0, 80, 1)
const E1: V3 = (() => {
  const d = P[2]
  const v: V3 = [-d * P[0], -d * P[1], 1 - d * P[2]]
  const l = Math.hypot(...v)
  return [v[0] / l, v[1] / l, v[2] / l]
})()
const E2: V3 = [P[1] * E1[2] - P[2] * E1[1], P[2] * E1[0] - P[0] * E1[2], P[0] * E1[1] - P[1] * E1[0]]
const LOCKS = 24
const WIDTH = (Math.PI * 2) / LOCKS
const WAVE = 0.5 // loose waves: a long wavelength down each lock (radians of δ)
const SWAY = 0.26
// neighbouring locks wave nearly together (soft bands across the hair, as Magda J's), each a little off
const lockPhase = (a: number) => 0.6 * Math.sin(5 * a + 0.8) + 0.35 * Math.sin(11 * a + 2.1)
const lockPhaseD = (a: number) => 3 * Math.cos(5 * a + 0.8) + 3.85 * Math.cos(11 * a + 2.1)

function lockAt(ux: number, uy: number, uz: number) {
  const c = Math.max(-1, Math.min(1, ux * P[0] + uy * P[1] + uz * P[2]))
  const delta = Math.acos(c)
  const alpha = Math.atan2(ux * E2[0] + uy * E2[1] + uz * E2[2], ux * E1[0] + uy * E1[1] + uz * E1[2])
  const ph = (Math.PI * 2 * delta) / WAVE + lockPhase(alpha)
  const grow = smooth(0.2, 0.6, delta) // the waves build away from the crown
  const m = SWAY * WIDTH * grow * Math.sin(ph)
  const mD = SWAY * WIDTH * grow * Math.cos(ph) * ((Math.PI * 2) / WAVE)
  const mA = SWAY * WIDTH * grow * Math.cos(ph) * lockPhaseD(alpha)
  return { delta, alpha, a2: alpha + m, ph, mD, mA }
}
function across(a2: number) {
  const f = a2 / WIDTH
  const i = Math.floor(f)
  const s = f - i
  return { crest: Math.pow(Math.max(0, 1 - (2 * s - 1) ** 2), 0.55), index: ((i % LOCKS) + LOCKS) % LOCKS }
}

function hairSdf(x: number, y: number, z: number) {
  const r = Math.hypot(x, y, z) || 1e-6
  const ux = x / r
  const uy = y / r
  const uz = z / r
  const yaw = Math.atan2(ux, uz) / D
  const p = Math.asin(Math.max(-1, Math.min(1, uy))) / D
  const ay = Math.abs(yaw)
  const L = lockAt(ux, uy, uz)
  const { crest, index } = across(L.a2)
  // where there is hair: above the hem, outside the face's U. Each lock ends at its own length
  // (where it hangs long) and narrows over its last TIP degrees to a point: only its crest reaches
  // the end, so the ends are loose points with gaps between them, not a hem
  const H = HEM(ay)
  const hem = H - (hash(index) * 2 - 1) * 6 * smooth(-2, -14, H)
  const dH = p - hem // degrees above the lock's end
  const TIP = 9
  const tk = Math.min(1, Math.max(0, dH / TIP))
  const tipIn = (crest - Math.pow(1 - tk, 1.4)) * 7 + 0.8 * tk // > 0 inside the narrowing lock
  const dU = ay < 60 ? polygon2(yaw * Math.cos(p * D), p, U) : 99 // degrees outside the face's opening (into the hair)
  const inside = Math.min(dH, dU, tipIn)
  // a thin layer: thin at the hairline and fuller behind it, thinning into the points, the ends
  // flicking out a little; the locks in soft relief
  const fT = 0.45 + 0.55 * tk
  const fU = 0.35 + 0.65 * Math.sqrt(Math.min(1, Math.max(0, dU / 10)))
  const e = Math.min(1, Math.max(0, inside / 5))
  // under the kerchief the hair lies flat and pressed a little (its waves poked through the cloth)
  const under = smooth(-0.03, 0.02, ux * KERCHIEF_N[0] + uy * KERCHIEF_N[1] + uz * KERCHIEF_N[2] - KERCHIEF_C)
  const relief = (0.014 * crest + 0.01 * Math.cos(L.ph)) * smooth(0.25, 0.6, L.delta) * e * (1 - under)
  const flick = 0.016 * (1 - tk) * (1 - tk) * smooth(8, -4, H)
  const out = 1.01 + (hairOuter(yaw, p) - 1.01) * Math.min(fT, fU) + relief + flick - 0.008 * under
  const layer = Math.max(r - out, 0.975 - r)
  return smax(layer, -inside * D * r, 0.018) // a small blend: the points stay points
}

function hairDir(x: number, y: number, z: number): V3 {
  const r = Math.hypot(x, y, z) || 1e-6
  const u: V3 = [x / r, y / r, z / r]
  const L = lockAt(u[0], u[1], u[2])
  const sd = Math.sin(L.delta) || 1e-4
  const cd = Math.cos(L.delta)
  const eD: V3 = [(u[0] * cd - P[0]) / sd, (u[1] * cd - P[1]) / sd, (u[2] * cd - P[2]) / sd]
  const eA: V3 = [(P[1] * u[2] - P[2] * u[1]) / sd, (P[2] * u[0] - P[0] * u[2]) / sd, (P[0] * u[1] - P[1] * u[0]) / sd]
  const k = (-L.mD / (1 + L.mA)) * sd
  const d: V3 = [eD[0] + eA[0] * k, eD[1] + eA[1] * k, eD[2] + eA[2] * k]
  const l = Math.hypot(...d) || 1
  return [d[0] / l, d[1] / l, d[2] / l]
}

export const edytaHair: SculptSpec = {
  build: () => ({ sdf: hairSdf, dirAt: hairDir }),
  center: [0, 0.1, -0.1],
  half: 1.2,
  res: 220,
  ao: { ao: 0.035, aoDark: 0.55 },
  triangles: 36000,
  dirSmooth: 4,
}

// ---- the kerchief -------------------------------------------------------------------------------
// Cotton lying on the hair over the crown and the back of the head, above a tilted plane (its
// edge just behind the hairline in front, over the ears at the sides, at the nape behind —
// edyta-layout.ts), the front edge folded into a soft rolled hem; gathered into a knot at the back
// of her right side, two short pointed tails hanging from it down the back, lying close.

const N = KERCHIEF_N
const knotDir = onScalp(KNOT[0], KNOT[1], 1)

function kerchiefBase(x: number, y: number, z: number) {
  const r = Math.hypot(x, y, z) || 1e-6
  const ux = x / r
  const uy = y / r
  const uz = z / r
  const yaw = Math.atan2(ux, uz) / D
  const p = Math.asin(Math.max(-1, Math.min(1, uy))) / D
  const s = ux * N[0] + uy * N[1] + uz * N[2] - KERCHIEF_C // > 0 under the kerchief
  // gathered toward the knot: soft folds running into it, fading away from it
  const kd = Math.acos(Math.max(-1, Math.min(1, ux * knotDir[0] + uy * knotDir[1] + uz * knotDir[2]))) // radians from the knot
  const around = Math.atan2(uy - knotDir[1], ux - knotDir[0] + (uz - knotDir[2]) * 0.3)
  const gather = 0.009 * Math.sin(around * 9) * Math.exp(-((kd / 0.45) ** 2)) * smooth(0.06, 0.16, kd)
  const hem = Math.exp(-(((s - 0.03) / 0.025) ** 2)) // the rolled front edge
  const base = hairOuter(yaw, p) + 0.004
  const mid = base + KERCHIEF_T / 2 + 0.008 * hem + gather
  const half = KERCHIEF_T / 2 + 0.008 * hem
  return smax(Math.abs(r - mid) - half, -s * r, 0.012)
}

function knotAndTails(): Prim[] {
  const out: Prim[] = []
  let g = 0
  const base = (yaw: number, p: number) => hairOuter(yaw, p) + 0.022
  // the knot: a plump round core where the corners are tied, a smaller lump either side of it
  const k = (dy: number, dp: number, lift: number, rr: [number, number, number]) => ellipsoidP(onScalp(KNOT[0] + dy, KNOT[1] + dp, base(KNOT[0] + dy, KNOT[1] + dp) + lift), rr, [0, -1, 0], g++)
  out.push(k(0, 0, 0.07, [0.125, 0.1, 0.115]), k(-8, 6, 0.045, [0.09, 0.07, 0.08]), k(7, -6, 0.045, [0.085, 0.07, 0.075]))
  // the tails: flat, wide at the knot, tapering to a point, hanging down the back of the head and
  // flaring out a little at their tips — away from the paws
  const tail = (y1: number, p1: number, w: number, flare: number) => {
    const n = 10
    const pts: V3[] = []
    const radii: number[] = []
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const yw = KNOT[0] + (y1 - KNOT[0]) * t + 3 * Math.sin(Math.PI * t) * Math.sign(y1 - KNOT[0])
      const p = KNOT[1] - 3 + (p1 - KNOT[1] + 3) * t
      pts.push(onScalp(yw, p, base(yw, p) + 0.03 + flare * t * t))
      radii.push(w * (1 - 0.8 * t) + 0.012)
    }
    return lockP(pts, radii, g++, { segs: 24, flat: 3 })
  }
  out.push(...tail(-130, -12, 0.085, 0.06), ...tail(-114, -18, 0.075, 0.045))
  return out
}

let kerchiefField: Field | null = null
export const edytaKerchief: SculptSpec = {
  build: () => {
    kerchiefField ??= new Field(knotAndTails(), { k: 0.025, kGroups: 0.02, base: kerchiefBase, kBase: 0.03 })
    const f = kerchiefField
    return { sdf: f.sdf }
  },
  center: [0, 0.35, -0.2],
  half: 1.25,
  res: 220,
  ao: { ao: 0.03, aoDark: 0.55 },
  triangles: 20000,
  error: 0.002,
}

