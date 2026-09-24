import { Field, type Prim } from '../sculpt'
import { leavesAlong } from './swept'
import { mulberry32 } from '../../lib/rng'
import { hairline, onScalp, pitchOf, scalpShell, yawOf } from './scalp'
import type { SculptSpec } from './types'

// Krystian (docs/cast/krystian.png; body circle (626, 654) px, R 394): short near-black hair
// with a pompadour — tufts rise from a hairline just above the plate and sweep up and
// back toward the viewer's right, building into a quiff at the top-left (0.25 R above the
// head there); the sides are cropped short (the fade is stubble, in the kit).

const edge = hairline([
  [0, 60],
  [40, 56],
  [75, 46],
  [100, 40],
  [140, 30],
  [180, 22],
])

// the cap under the leaves: thin at the hairline, rising toward the crown
// (the design's pompadour stands ≈ 0.28 R above the head, flat-topped; the leaves add the last few hundredths)
const outerAt = (yaw: number, p: number) => {
  const u = Math.min(1, Math.max(0, (p - edge(yaw)) / 34))
  return 1.02 + 0.17 * Math.sin((u * Math.PI) / 2) // rolls up from the hairline, round-shouldered
}

// the side part, on the left of the crown: from the front hairline over to the back
const PART = (u: number) => onScalp(-30 - 120 * u, 66 + 12 * Math.sin(Math.PI * u), 1)

function tufts(): Prim[] {
  const rng = mulberry32(59)
  const out: Prim[] = []
  let g = 0
  const group = () => g++
  const o = { outerAt, width: 0.24, lift: 0.1, radii: [0.042, 0.052, 0.046, 0.03, 0.01] }
  // from the part, rows of overlapping leaves combed over the top to the viewer's right,
  // their points lifting at the right side, as drawn; later rows run further back
  const rows = 10
  for (let i = 0; i < rows; i++) {
    const u = i / (rows - 1)
    const from = PART(u)
    const to = onScalp(80 + 95 * u + (rng() - 0.5) * 6, 34 - 12 * u)
    const st = (i % 2) * 0.14
    const stretches: [number, number][] = [
      [0.02 + st, 0.44 + st],
      [0.34 + st, 0.76 + st],
      [0.66 + st * 0.5, 1.04],
    ]
    out.push(...leavesAlong(from, to, stretches, group, { ...o, width: 0.22 + rng() * 0.05 }))
  }
  // and a few falling from the part down to the left temple, pointing down-left
  for (let i = 0; i < 5; i++) {
    const u = i * 0.1
    out.push(...leavesAlong(PART(u), onScalp(-80 - 40 * u, 38 - 6 * u), [[0.04, 0.55], [0.45, 1.02]], group, { ...o, width: 0.2, lift: 0.07 }))
  }
  return out
}

export const krystianHair: SculptSpec = {
  build: () => {
    const base = scalpShell((yaw) => edge(yaw) + 1, 0.97, (p) => p, 0.02, (x, y, z) => outerAt(yawOf(x, y, z), pitchOf(x, y, z)))
    const f = new Field(tufts(), { k: 0.022, kGroups: 0.008, base, kBase: 0.02 })
    return { sdf: f.sdf, dirAt: (x, y, z) => f.dirAt(x, y, z) }
  },
  center: [0, 0.55, -0.05],
  half: 1.25,
  res: 150,
  ao: { ao: 0.035, aoDark: 0.5 },
  triangles: 26000,
}
