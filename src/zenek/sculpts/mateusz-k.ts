import { Field, type Prim } from '../sculpt'
import { mulberry32 } from '../../lib/rng'
import { hairline, onScalp, pitchOf, scalpShell, yawOf } from './scalp'
import { leavesAlong, sweptQuiff } from './swept'
import type { SculptSpec } from './types'

// Mateusz K (docs/cast/mateusz-k.png — the 2026-09-24 design; body circle (700, 640) px,
// R 410, fitted): a full, glossy dark pompadour — thick locks swept up off the front
// hairline and over to the viewer's right, cresting ≈ 0.44 R above the head, the right
// side flowing down; the sides covered, shorter, down to temple height (the silhouette
// reaches (−0.87, 0.42) on the left, (0.96, 0.32) on the right).

const edge = hairline([
  [0, 57],
  [30, 52],
  [60, 38],
  [85, 24],
  [120, 16],
  [180, 10],
])
// measured silhouette: r ≈ 1.33 at the upper sides, 1.44 on top; thin near the edge
const outerAt = (yaw: number, p: number) => {
  const u = Math.min(1, Math.max(0, (p - edge(yaw)) / 34)) // thin by the edge (the sides hug), full on top
  const back = Math.min(1, Math.max(0, (Math.abs(yaw) - 90) / 90))
  const crest = 0.13 * Math.exp(-(((yaw + 22) / 50) ** 2) - ((p - 72) / 16) ** 2) // the wave's crest, left of centre
  return 1.02 + 0.33 * u * u * (3 - 2 * u) * (1 - 0.35 * back) + crest
}

function hair(): Prim[] {
  const rng = mulberry32(83)
  let g = 0
  const group = () => g++
  // thick glossy clumps: wide, lanes fused, tips lifting a little
  const leaf = { outerAt, width: 0.3, lanes: 4, lift: 0.055, radii: [0.045, 0.058, 0.052, 0.034, 0.01] }
  const out = sweptQuiff({ edge, onScalp, rows: 3, rowStep: 12, yaw: [-88, 58], spacing: 19, sweep: 48, reach: 58, leaves: [[0, 0.6], [0.45, 1.0]], leaf, rng, group, inset: 3, sweepEase: 2.4 })
  // the right side: locks off the crest flowing down to the right temple
  for (let i = 0; i < 6; i++) {
    const p = 76 - i * 4
    out.push(...leavesAlong(onScalp(-4 + i * 9, p, 1), onScalp(86 + i * 6, 24 - i, 1), [[0.3, 0.75], [0.62, 1.04]], group, { ...leaf, width: 0.22, lift: 0.06 }))
  }
  // behind: combed back and down
  for (let yaw = 100; yaw <= 260; yaw += 15) {
    const y0 = yaw + (rng() - 0.5) * 6
    out.push(...leavesAlong(onScalp(y0 * 0.2, 86, 1), onScalp(y0, edge(y0) + 2, 1), [[0.3, 0.75], [0.6, 1.0]], group, { ...leaf, lift: 0.04, width: 0.22 }))
  }
  return out
}

export const mateuszKHair: SculptSpec = {
  build: () => {
    const base = scalpShell((yaw) => edge(yaw) + 1, 0.97, (p) => p, 0.012, (x, y, z) => outerAt(yawOf(x, y, z), pitchOf(x, y, z)))
    const f = new Field(hair(), { k: 0.065, kGroups: 0.012, base, kBase: 0.035 })
    return { sdf: f.sdf, dirAt: (x, y, z) => f.dirAt(x, y, z) }
  },
  center: [0, 0.5, -0.02],
  half: 1.4,
  res: 176,
  ao: { ao: 0.04, aoDark: 0.5 },
  triangles: 34000,
}
