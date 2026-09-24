import { Field, lockP, type Prim } from '../sculpt'
import { mulberry32 } from '../../lib/rng'
import { hairline, onScalp, pitchOf, scalpShell, yawOf } from './scalp'
import type { SculptSpec } from './types'

// Kamil (docs/cast/kamil.png; body circle (627, 638) px, R 402): short, textured,
// light-brown hair — a close cap of flame-shaped tufts combed forward and a little to
// the viewer's right, their pointed tips making a spiky fringe above the plate. Thin, as
// drawn: 0.1 R proud at the crown, a bare 0.03 R at the sides where the strands lie flat;
// hairline at pitch 66° in front, 31° by the temples, 17° at the sides, lower behind.

const edge = hairline([
  [0, 66],
  [35, 57],
  [72, 31],
  [95, 17],
  [140, 6],
  [180, 2],
])

// the cap's outer surface: a film along the hairline all the way round (the tips lie
// flat), building slowly to 0.1 R proud at the crown
const outerAt = (yaw: number, p: number) => {
  const u = Math.min(1, Math.max(0, (p - edge(yaw)) / 50))
  return 1.012 + 0.085 * u * u * (3 - 2 * u)
}

function tufts(): Prim[] {
  const rng = mulberry32(71)
  const out: Prim[] = []
  let g = 0
  // long, shallow ridges combed forward and a little to the viewer's right, laid in
  // offset rows from the crown down; each rides on the cap and ends in a point just
  // at the hairline — the spiky fringe
  for (let pitch = 86; pitch > 6; pitch -= 7) {
    const ring = Math.cos((pitch * Math.PI) / 180)
    const step = Math.max(7, 8 / Math.max(0.22, ring))
    const offset = Math.round(pitch / 7) % 2 ? step / 2 : 0
    for (let yaw = -180 + offset; yaw < 180; yaw += step) {
      const ey = edge(yaw)
      if (pitch < ey + 3) continue
      const j = () => (rng() - 0.5) * 3
      const len = 17 + rng() * 9 // degrees of arc: short strands
      const tipPitch = Math.max(ey - 4, pitch - len)
      const sweep = 7 + rng() * 5
      const y0 = yaw + j()
      const p0 = pitch + j()
      const mid1 = (p0 * 2 + tipPitch) / 3
      const mid2 = (p0 + tipPitch * 2) / 3
      const pts = [
        onScalp(y0, p0, outerAt(y0, p0) - 0.016),
        onScalp(y0 + sweep * 0.35, mid1, outerAt(y0 + sweep * 0.35, mid1) - 0.008),
        onScalp(y0 + sweep * 0.75, mid2, outerAt(y0 + sweep * 0.75, mid2) - 0.008),
        onScalp(y0 + sweep, tipPitch, outerAt(y0 + sweep, tipPitch) - 0.006),
      ]
      const r0 = 0.026 + rng() * 0.008
      out.push(...lockP(pts, [r0, r0, r0 * 0.55, 0.006], g++, { segs: 10 }))
    }
  }
  return out
}

export const kamilHair: SculptSpec = {
  build: () => {
    const base = scalpShell((yaw) => edge(yaw) + 2, 0.97, (p) => p, 0.02, (x, y, z) => outerAt(yawOf(x, y, z), pitchOf(x, y, z)))
    const f = new Field(tufts(), { k: 0.01, kGroups: 0.012, base, kBase: 0.016 })
    return { sdf: f.sdf, dirAt: (x, y, z) => f.dirAt(x, y, z) }
  },
  center: [0, 0.55, -0.05],
  half: 1.2,
  res: 176,
  ao: { ao: 0.035, aoDark: 0.55 },
  triangles: 26000,
}
