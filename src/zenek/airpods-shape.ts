import { Vector3 } from 'three'

// Where the AirPods Max sit (head frame, R = 1): the right cup's frame and position, its
// steel arm, and the band over the crown. Shared by the model (airpods.tsx) and by the hair
// they are worn over (sculpts/magda-j.ts carves room for them), so the two always agree.

const D = Math.PI / 180
export const CUSH_T = 0.13 // cushion thickness
export const SHELL_T = 0.145 // shell thickness
export const MIN_CUSH = 0.045 // the cushion may compress to this against the head (the shell never touches it)
export const BAND_R = 0.075 // the band's half-width (its section is 0.6 of that deep, radially)
export const ARM_R = 0.016

export type AirpodsShapeOpts = {
  yaw?: number // the cups' centres round the head (degrees; the right cup, the left mirrors it)
  pitch?: number
  turn?: number // the cups face this much further round toward the side than the head does there
  tilt?: number // …and up this much (the head's own pitch there is steeper)
  cupH?: number
  cupW?: number
  top?: number // the band's height over the crown, R
  back?: number // how far back the band leans at the top (z of its crest, R)
}
export const AIRPODS = { yaw: 62, pitch: 24, turn: 20, tilt: 12, cupH: 0.66, cupW: 0.5, top: 1.34, back: -0.08 } // the band rests on the hair's crown

const dir = (yaw: number, pitch: number) => new Vector3(Math.cos(pitch * D) * Math.sin(yaw * D), Math.sin(pitch * D), Math.cos(pitch * D) * Math.cos(yaw * D))

export function airpodsShape(opts: AirpodsShapeOpts = {}) {
  // (options left undefined keep their defaults)
  const set = Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined))
  const { yaw, pitch, turn, tilt, cupH, cupW, top, back } = { ...AIRPODS, ...set }
  // the right cup's frame: n out of the head, up, fwd along the cup ((fwd, up, n) right-handed: fwd points back; the cup is symmetric)
  const n = dir(yaw + turn, tilt)
  const up = new Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize()
  const fwd = new Vector3().crossVectors(up, n).normalize()
  const C = dir(yaw, pitch)
  // push the cup out until the cushion, compressed to MIN_CUSH, clears the head everywhere
  let push = 0
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2
    for (const f of [0, 0.5, 1]) {
      const q = C.clone().addScaledVector(fwd, Math.cos(a) * cupW * 0.5 * f).addScaledVector(up, Math.sin(a) * cupH * 0.5 * f).addScaledVector(n, MIN_CUSH)
      const b = n.dot(q)
      const c = q.lengthSq() - 1.004 * 1.004
      push = Math.max(push, -b + Math.sqrt(Math.max(0, b * b - c)))
    }
  }
  const O = C.clone().addScaledVector(n, push) // the cushion's inner face, middle
  // the steel arm: out of the cup's top, up and in to the band's end
  const cupTop = O.clone().addScaledVector(up, cupH / 2).addScaledVector(n, CUSH_T + 0.01)
  const E = cupTop.clone().addScaledVector(up, 0.15).addScaledVector(n, -0.08)
  const arm = [cupTop.clone().addScaledVector(up, -0.03), cupTop.clone().addScaledVector(up, 0.07).addScaledVector(n, -0.02), E]
  // the band: an arch through both ends and over the crown, leaning back a little at the top,
  // its ends tucked down into the arms
  const phiE = 72 * D
  const Rb = E.x / Math.sin(phiE)
  const ky = (top - E.y) / (Rb * (1 - Math.cos(phiE)))
  const yc = top - Rb * ky
  const band: Vector3[] = [E.clone().setX(-E.x).add(new Vector3(0, -0.03, 0))]
  for (let k = 0; k <= 40; k++) {
    const ph = -phiE + (2 * phiE * k) / 40
    const s = Math.sin(ph) / Math.sin(phiE)
    band.push(new Vector3(Rb * Math.sin(ph), yc + Rb * Math.cos(ph) * ky, back + (E.z - back) * s * s))
  }
  band.push(E.clone().add(new Vector3(0, -0.03, 0)))
  return { n, up, fwd, O, cupTop, E, arm, band, cupW, cupH }
}

/**
 * Distance from a point to the headphones' volume (both cups, both arms, the band) — for
 * hair to leave room for them. The cups as rounded boxes in their own frames, the arm and
 * the band as tubes along their paths (a little generous: the band's full half-width round).
 */
export function airpodsDistance(shape: ReturnType<typeof airpodsShape>) {
  const { n, up, fwd, O, cupTop, arm, band, cupW, cupH } = shape
  const hinge = [cupTop.clone().addScaledVector(fwd, -0.05), cupTop.clone().addScaledVector(fwd, 0.05)]
  const seg = (px: number, py: number, pz: number, a: Vector3, b: Vector3) => {
    const bx = b.x - a.x
    const by = b.y - a.y
    const bz = b.z - a.z
    const ax = px - a.x
    const ay = py - a.y
    const az = pz - a.z
    const t = Math.max(0, Math.min(1, (ax * bx + ay * by + az * bz) / (bx * bx + by * by + bz * bz)))
    return Math.hypot(ax - bx * t, ay - by * t, az - bz * t)
  }
  const line = (px: number, py: number, pz: number, pts: Vector3[]) => {
    let d = Infinity
    for (let i = 1; i < pts.length; i++) d = Math.min(d, seg(px, py, pz, pts[i - 1], pts[i]))
    return d
  }
  const hw = cupW / 2
  const hh = cupH / 2
  // from where the cushion is let down onto the head (−0.08) to the shell's outer face
  const z0 = -0.08
  const z1 = CUSH_T + 0.006 + SHELL_T + 0.02 // the shell's domed face
  const cup = (px: number, py: number, pz: number) => {
    const dx = px - O.x
    const dy = py - O.y
    const dz = pz - O.z
    const r = 0.06 // rounding
    const qx = Math.abs(dx * fwd.x + dy * fwd.y + dz * fwd.z) - (hw - r)
    const qy = Math.abs(dx * up.x + dy * up.y + dz * up.z) - (hh - r)
    const qz = Math.abs(dx * n.x + dy * n.y + dz * n.z - (z0 + z1) / 2) - ((z1 - z0) / 2 - r)
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r
  }
  return (x: number, y: number, z: number) => {
    const ax = Math.abs(x) // the left side mirrors the right
    return Math.min(cup(ax, y, z), line(ax, y, z, arm) - ARM_R, line(ax, y, z, hinge) - 0.022, line(x, y, z, band) - BAND_R)
  }
}
