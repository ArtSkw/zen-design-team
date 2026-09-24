import { Field, coneP, ellipsoidP, type Prim } from '../sculpt'
import { mulberry32 } from '../../lib/rng'
import { hairline, onScalp, pitchOf, scalpShell, yawOf } from './scalp'
import { leavesAlong, sweptQuiff } from './swept'
import type { SculptSpec } from './types'

// Łukasz P (docs/cast/lukasz-p.png; body circle (624, 645) px, R 369, fitted): a weight
// lifter. Short blond hair brushed up and to the viewer's right into a spiky quiff —
// 0.34 R above the head at its peak (left of centre), falling to the right temple — and
// muscular arms: each a cluster of five fused lumps (deltoid, biceps, forearm, the fist),
// measured from the design and built at 85 % so he stays in scale with the others.

const edge = hairline([
  [0, 46],
  [40, 44],
  [70, 32],
  [95, 24],
  [130, 14],
  [180, 8],
])
const outerAt = (yaw: number, p: number) => {
  const u = Math.min(1, Math.max(0, (p - edge(yaw)) / 26))
  const quiff = 0.22 * Math.exp(-(((yaw + 14) / 55) ** 2) - ((p - 68) / 20) ** 2)
  return 1.02 + 0.1 * Math.sin((u * Math.PI) / 2) + quiff
}

function hair(): Prim[] {
  const rng = mulberry32(67)
  let g = 0
  const group = () => g++
  // narrow, sharply pointed leaves — spiky, like the design's fur-like flicks
  const leaf = { outerAt, width: 0.12, lanes: 2, lift: 0.2, radii: [0.03, 0.037, 0.03, 0.017, 0.005] }
  // brushed up and hard to the viewer's right: the diagonal is the look
  const out = sweptQuiff({ edge, onScalp, rows: 5, rowStep: 7, yaw: [-84, 60], spacing: 10, sweep: 64, reach: 44, leaves: [[0, 0.6], [0.45, 1.0]], leaf, rng, group, inset: 3, sweepEase: 2.2 })
  // behind the quiff: short leaves combed back and down to the nape
  for (let yaw = 100; yaw <= 260; yaw += 16) {
    const y0 = yaw + (rng() - 0.5) * 6
    out.push(...leavesAlong(onScalp(y0 * 0.2, 84, 1), onScalp(y0, edge(y0) + 2, 1), [[0.3, 0.75], [0.6, 1.0]], group, { ...leaf, lift: 0.05, width: 0.15 }))
  }
  return out
}

export const lukaszHair: SculptSpec = {
  build: () => {
    const base = scalpShell((yaw) => edge(yaw) + 1, 0.97, (p) => p, 0.02, (x, y, z) => outerAt(yawOf(x, y, z), pitchOf(x, y, z)))
    const f = new Field(hair(), { k: 0.012, kGroups: 0.008, base, kBase: 0.02 })
    return { sdf: f.sdf, dirAt: (x, y, z) => f.dirAt(x, y, z) }
  },
  center: [0, 0.5, -0.02],
  half: 1.3,
  res: 176,
  ao: { ao: 0.035, aoDark: 0.5 },
  triangles: 34000,
}

// ---- the arms: jointed (the left one, R = 1; the right is its mirror) ----------------------
// Artur (2026-09-24): three shapes that read as a man's arm — shoulder, biceps, forearm —
// set up and close to the body, and a wave that bends at the elbow. The upper arm hangs
// from the shoulder pivot (its origin); the forearm from the elbow pivot at (−0.08, −0.44,
// 0.07) in the upper arm's frame (team.ts), its fist at the end.
export const lukaszUpperArm: SculptSpec = {
  build: () => {
    const deltoid = ellipsoidP([-0.05, 0.02, 0], [0.25, 0.23, 0.24], [0, 1, 0], 0)
    const biceps = ellipsoidP([-0.08, -0.23, 0.07], [0.25, 0.27, 0.24], [0, 1, 0], 0)
    const f = new Field([deltoid, biceps], { k: 0.07 })
    return { sdf: f.sdf }
  },
  center: [-0.07, -0.12, 0.03],
  half: 0.5,
  res: 90,
  ao: { ao: 0.04, aoDark: 0.66 },
  triangles: 6000,
}

export const lukaszForearm: SculptSpec = {
  build: () => {
    // short and round (Artur, 2026-09-24): a compact forearm, the fist close under the
    // elbow and a little forward — it reads as a ball, not a stick
    const forearm = coneP([0, 0, 0], [0.01, -0.09, 0.07], 0.18, 0.17, 0)
    const fist = ellipsoidP([0.015, -0.15, 0.1], [0.19, 0.18, 0.185], [0, 1, 0], 0)
    const f = new Field([forearm, fist], { k: 0.06 })
    return { sdf: f.sdf }
  },
  center: [0.015, -0.1, 0.07],
  half: 0.38,
  res: 80,
  ao: { ao: 0.04, aoDark: 0.66 },
  triangles: 5000,
}
