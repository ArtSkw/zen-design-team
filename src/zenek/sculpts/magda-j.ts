import { Field, hash, lockP, smax, type Prim, type V3 } from '../sculpt'
import { keyed, smooth } from '../../lib/anim'
import { onScalp } from './scalp'
import { airpodsDistance, airpodsShape } from '../airpods-shape'
import type { SculptSpec } from './types'

// Magda J (docs/cast/magda-j.png; body circle (672, 653) px, R 421): loose reddish-brown
// waves, worn under AirPods Max. The hair covers the crown (Artur, 2026-09-26: the first
// build began behind the head's outline and left her bald under the headphones), its
// hairline an arch over the forehead ~5° above the plate, down to the tops of the cups at the
// sides — and comes round the sides only as far as the cups (the
// curls tuck in behind them). The headphones sit in the hair: it is pressed away round the
// band, the arms and the cups (airpods-shape.ts, the same shape the model is built from). One continuous layer (Aneta's lesson: no gaps or dents between separate
// locks), carved into broad wavy locks by a smooth pattern: the locks spread from a parting
// point on the crown, on her right — over the top to the other side, down her right side and
// the back — each waving side to side in an S; toward the ends the layer flips out and every
// lock ends in its own round tip, so the hem is scalloped. The strands in the shader follow
// the same locks. A little slimmer than drawn (the drawn mass reaches ±1.45 R; Aneta's fuller
// hair made her look heavy): ~0.15 R thick down the sides and the back (fuller read as a
// cloak), ~0.28 R on the crown. One loose curl slips out of the hairline onto her forehead,
// its loop just touching the top of the plate (a piece of its own, finer: magda-j-curl). Over
// the hands the hair ends high enough that talking hands never reach it.

const D = Math.PI / 180

// The front edge: hair only behind the plane z = EDGE(height) (unit direction). Over the
// crown it comes forward into a hairline ~5° above the plate all round (Artur, 2026-09-26:
// higher ones read as a tall black forehead) — 48° up in the middle, 42° at ±30°, 32° at ±40°,
// which is nearly the plane z = 0.66 — and on down to the tops of the cups; beside the cups it stays behind them (yaw ≈ 84°), and below them it steps
// back behind the hands.
const EDGE = keyed([[-1, -0.2], [0.02, -0.2], [0.15, -0.1], [0.28, 0.08], [0.57, 0.08], [0.6, 0.3], [0.63, 0.6], [0.66, 0.66], [0.72, 0.665], [1, 0.67]])
// The headphones, as the model builds them (the default opts: team.ts wears { type: 'airpods' })
const PHONES = airpodsDistance(airpodsShape())
const CLEAR = 0.03 // the hair keeps this far off them, in a wide soft dip (the band rests on it; no trench, no notch)
// The lower edge (pitch by |yaw|): above the hands at the sides, shoulder length behind.
const HEM = keyed([[0, 13], [92, 11], [100, 1], [108, -9], [122, -16], [150, -20], [180, -22]])
/** The layer's outer radius: fuller on the crown (the band rests on it), close to the body down the sides and the back. */
function outer(yaw: number, p: number) {
  const ay = Math.abs(yaw)
  // (Artur, 2026-09-26: the fuller fall at the lower sides and back — out to ~1.45 R — read as a
  // cloak: now close to the body there, a gentle fullness at the sides only)
  const flare = smooth(88, 106, ay) * (1 - 0.6 * smooth(130, 180, ay)) * Math.exp(-(((p + 1) / 22) ** 2))
  return 1.15 + 0.13 * smooth(35, 88, p) + 0.06 * flare
}

// The locks: the parting point P, the angle round it (α) and away from it (δ). P sits on her
// right side above the cup (the arm and the cup hide where the locks start), so they sweep
// sideways over the crown (from the front: from the upper left over to the right, as drawn),
// across the back and down her right side.
const P: V3 = (() => {
  const y = -96 * D // on her right side above the cup, where the arm and the cup hide the whorl: the locks sweep over the top, as drawn
  const p = 50 * D
  return [Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)]
})()
const E1: V3 = (() => {
  // a direction ⟂ P, toward the face
  const d = P[2]
  const v: V3 = [-d * P[0], -d * P[1], 1 - d * P[2]]
  const l = Math.hypot(...v)
  return [v[0] / l, v[1] / l, v[2] / l]
})()
const E2: V3 = [P[1] * E1[2] - P[2] * E1[1], P[2] * E1[0] - P[0] * E1[2], P[0] * E1[1] - P[1] * E1[0]]
const LOCKS = 26 // round the parting
const WIDTH = (Math.PI * 2) / LOCKS
const WAVE = 0.42 // wavelength along a lock (radians of δ; ≈ 0.5 R)
const SWAY = 0.28 // how far a lock sways side to side, in lock widths
// neighbouring locks wave roughly together, each well off the next (loose curls, not rows of zigzags)
const lockPhase = (a: number) => 0.95 * Math.sin(5 * a + 0.4) + 0.55 * Math.sin(11 * a + 1.7)
const lockPhaseD = (a: number) => 4.75 * Math.cos(5 * a + 0.4) + 6.05 * Math.cos(11 * a + 1.7)

/** Lock coordinates of a unit direction: δ from the parting, α round it, α' (swayed), and the sway's slopes. */
function lockAt(ux: number, uy: number, uz: number) {
  const c = Math.max(-1, Math.min(1, ux * P[0] + uy * P[1] + uz * P[2]))
  const delta = Math.acos(c)
  const alpha = Math.atan2(ux * E2[0] + uy * E2[1] + uz * E2[2], ux * E1[0] + uy * E1[1] + uz * E1[2])
  const ph = (Math.PI * 2 * delta) / WAVE + lockPhase(alpha)
  const grow = smooth(0.12, 0.45, delta) // the sway builds away from the parting
  const m = SWAY * WIDTH * grow * Math.sin(ph)
  // slopes of the sway (for the strand direction)
  const mD = SWAY * WIDTH * grow * Math.cos(ph) * ((Math.PI * 2) / WAVE)
  const mA = SWAY * WIDTH * grow * Math.cos(ph) * lockPhaseD(alpha)
  return { delta, alpha, a2: alpha + m, ph, mD, mA }
}

/** Across a lock: 0 in the crease, 1 on its crest; which lock it is. */
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
  const L = lockAt(ux, uy, uz)
  const { crest, index } = across(L.a2)
  // the front edge, scalloped lock by lock like the ends (the curls at the hairline)
  const behind = EDGE(uy) - uz - 0.03 * hash(index + 31) - 0.025 * (1 - crest) * smooth(0.6, 0.8, uy) // > 0 behind the front edge
  const front = -behind * r
  // every lock ends at its own length, round-tipped: the hem is scalloped
  const hem = HEM(Math.abs(yaw)) - 7 * hash(index) + 5 * (1 - crest)
  const below = (hem - p) * D * r
  // thickness: over the crown, thinner at the front edge and full a little behind it (a
  // rounded front, not a cut); down the sides full to the edge; flipping out at the ends
  // over the crown the hair lies thin at the hairline and swells behind it in a round profile
  // (a full-height edge read as a wall); down the sides, full to the edge
  const taper = 1 + (0.12 + 0.88 * Math.sqrt(Math.max(0, Math.min(1, behind / 0.26))) - 1) * smooth(0.5, 0.65, uy)
  const flip = 0.02 * smooth(hem + 14, hem, p)
  const relief = (0.032 * crest + 0.032 * Math.cos(L.ph)) * smooth(0.15, 0.55, L.delta) * (0.4 + 0.6 * smooth(0, 0.2, behind)) // calm where the locks start
  const out = 1 + (outer(yaw, p) - 1) * taper + relief + flip
  const layer = Math.max(r - out, 0.975 - r)
  const hair = smax(layer, Math.max(front, below), 0.045)
  // pressed away from the headphones
  return smax(hair, CLEAR - PHONES(x, y, z), 0.1)
}

/** Along the lock at a point: away from the parting, turned with the lock's sway. */
function hairDir(x: number, y: number, z: number): V3 {
  const r = Math.hypot(x, y, z) || 1e-6
  const u: V3 = [x / r, y / r, z / r]
  const L = lockAt(u[0], u[1], u[2])
  const sd = Math.sin(L.delta) || 1e-4
  const cd = Math.cos(L.delta)
  const eD: V3 = [(u[0] * cd - P[0]) / sd, (u[1] * cd - P[1]) / sd, (u[2] * cd - P[2]) / sd]
  const eA: V3 = [(P[1] * u[2] - P[2] * u[1]) / sd, (P[2] * u[0] - P[0] * u[2]) / sd, (P[0] * u[1] - P[1] * u[0]) / sd]
  // α' constant: dα = −m_δ/(1 + m_α) dδ; in arc length along eA that is sinδ·dα
  const k = (-L.mD / (1 + L.mA)) * sd
  const d: V3 = [eD[0] + eA[0] * k, eD[1] + eA[1] * k, eD[2] + eA[2] * k]
  const l = Math.hypot(...d) || 1
  return [d[0] / l, d[1] / l, d[2] / l]
}

export const magdaJHair: SculptSpec = {
  build: () => ({ sdf: hairSdf, dirAt: hairDir }),
  center: [0, 0.36, -0.46],
  half: 1.48,
  res: 230,
  ao: { ao: 0.035, aoDark: 0.5 },
  triangles: 36000,
  dirSmooth: 4,
}

// ---- the curl on her forehead --------------------------------------------------------------
// Artur, 2026-09-26: "a little singular curl … sitting loosely in the upper part of her face".
// Out of the hairline on her right of centre: a chunky cartoon kiss curl, one round loop
// lying face-on over the plate's top edge (a flat lock lying on the head read as a
// wire hook). Rooted inside the hair so the two read as one.
function curlPrims(): Prim[] {
  // a cartoon kiss curl (Artur, 2026-09-26: bigger, "a nice, kinda cartoonish sweet accent"): a
  // chunky lock out of the hairline that rolls into one round loop lying face-on on the
  // forehead, over the plate's top edge — a flat spiral, so from the front it reads as a curl
  // (a coil down the head projected into a zigzag and read as a squiggle). Drawn in a plane
  // tangent to the head at the loop's centre (x across, y up, R units), then laid onto it.
  const D = Math.PI / 180
  const C: [number, number] = [-21.5, 39.5] // the loop's centre: yaw, pitch (the plate's top edge is ~41° here)
  const cosP = Math.cos(C[1] * D)
  const R0 = 0.15 // the loop's outer radius
  const R1 = 0.056 // …its inner end
  const T0 = 0.06 // the lock's thickness, out of the hair
  const T1 = 0.03 // …at its tip (the loop stays open: the gap after a turn ≥ the two thicknesses)
  const plane: [number, number, number][] = [] // x, y, tube
  // out of the hair: from above and to the right of the loop, down onto its right side
  for (const [x, y] of [[0.26, 0.36], [0.225, 0.25], [0.185, 0.14], [0.162, 0.055]] as [number, number][]) plane.push([x, y, T0])
  // the loop: down the right side, along the bottom, up the left, over the top and in —
  // clockwise as seen, once round, the radius and the thickness easing in
  const N = 60
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const th = -Math.PI * 2 * 1.02 * t
    const e = t * t * (3 - 2 * t)
    const r = R0 + (R1 - R0) * (0.35 * t + 0.65 * e)
    plane.push([r * Math.cos(th), r * Math.sin(th), T0 + (T1 - T0) * Math.pow(t, 1.3)])
  }
  const pts: V3[] = []
  const radii: number[] = []
  // the first point is inside the hair, so the two read as one
  pts.push(onScalp(C[0] + 0.28 / cosP / D, C[1] + 0.41 / D, 1.03))
  radii.push(T0)
  for (const [x, y, tube] of plane) {
    pts.push(onScalp(C[0] + x / cosP / D, C[1] + y / D, 1.006 + tube))
    radii.push(tube)
  }
  return lockP(pts, radii, 0, { segs: 150 })
}

export const magdaJCurl: SculptSpec = {
  build: () => {
    const f = new Field(curlPrims(), { k: 0.008 })
    return { sdf: f.sdf, dirAt: (x, y, z) => f.dirAt(x, y, z) }
  },
  center: onScalp(-18, 45, 1.06),
  half: 0.36,
  res: 170,
  ao: { ao: 0.02, aoDark: 0.55 },
  triangles: 6000,
  dirSmooth: 2,
}
