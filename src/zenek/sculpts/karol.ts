import { Field, lockP, polygon2, ribbonP, smax, type Prim, type V3 } from '../sculpt'
import { mulberry32, range } from '../../lib/rng'
import { smooth } from '../../lib/anim'
import type { SculptSpec } from './types'

// Karol (docs/cast/karol.png; body circle (626, 692) px, R 380): a dark goatee under the
// plate — a short, trimmed moustache parted in the middle, out to ±0.47 R (drawn bushier,
// with flicked tips; trimmed at Artur's word), and below it a beard of wavy locks flowing down and in to a point
// at −0.98 R, as wide as the moustache at the top (a shield, traced from the design). The
// design's grey strands became a greyish tone instead (Artur, 2026-09-26): the clay turns
// toward a neutral grey down the beard, and its sheen is silvery (team.ts). Frontal design
// coordinates (fractions of R) mapped onto the body; below the chin the beard hangs in front
// of the body rather than wrapping under it (as Artur's does).

const zBody = (x: number, y: number) => Math.sqrt(Math.max(0.12, 1 - x * x - y * y))
const onFront = (x: number, y: number, lift: number): V3 => [x, y, zBody(x, y) + lift]

// the outline, traced: the moustache's top under the plate, the beard's sides, the point
const HALF: [number, number][] = [
  [0, -0.165], [-0.1, -0.148], [-0.22, -0.142], [-0.36, -0.178], [-0.47, -0.215], [-0.5, -0.3], [-0.5, -0.4],
  [-0.485, -0.52], [-0.43, -0.646], [-0.34, -0.77], [-0.23, -0.867], [-0.11, -0.94], [0, -0.983],
]
const OUTLINE: [number, number][] = [...HALF, ...HALF.slice(1, -1).reverse().map(([x, y]) => [-x, y] as [number, number])]
/** The beard's half-width at a height (the outline's side, below the moustache). */
const halfW = (y: number) => {
  const side = HALF.slice(4)
  if (y >= side[0][1]) return -side[0][0]
  for (let i = 1; i < side.length; i++)
    if (y >= side[i][1]) {
      const t = (y - side[i - 1][1]) / (side[i][1] - side[i - 1][1])
      return -(side[i - 1][0] + (side[i][0] - side[i - 1][0]) * t)
    }
  return 0
}
/** How far the beard stands off the body: fuller down the middle, thinning to the point. */
const thick = (y: number) => (0.07 + 0.045 * smooth(-0.22, -0.6, y)) * (1 - 0.55 * smooth(-0.7, -0.98, y))

function beardLocks(): Prim[] {
  const rng = mulberry32(5301)
  const out: Prim[] = []
  let g = 0
  // shingled rows of flame-shaped locks (a ribbon of three strands each, widest a third
  // along, drawn to a point), flowing down the shield's lanes — a lane λ (−1…1) runs at
  // x = λ·W(y), so the rows converge on the point. Each lock is rooted back on the bed,
  // swells forward and lays its tip over the root of the row below; S-waves across.
  const rows: [number, number, number, number][] = [
    // [root y, locks, length, width]
    [-0.235, 8, 0.44, 0.11],
    [-0.4, 7, 0.42, 0.1],
    [-0.57, 5, 0.36, 0.09],
    [-0.72, 3, 0.28, 0.08],
    [-0.8, 1, 0.19, 0.07],
  ]
  const normalAt = (p: V3): V3 => {
    const l = Math.hypot(p[0], p[1] * 0.6, p[2] * 1.5)
    return [p[0] / l, (p[1] * 0.6) / l, (p[2] * 1.5) / l]
  }
  rows.forEach(([y0, n, len, width], ri) => {
    const reach = 0.93 - ri * 0.04
    for (let k = 0; k < n; k++) {
      const lam = n === 1 ? 0 : (-1 + (2 * (k + 0.5)) / n) * reach + range(rng, -0.04, 0.04)
      const yEnd = Math.max(-0.985, y0 - len * range(rng, 0.9, 1.08) * (1 - 0.25 * Math.abs(lam)))
      const phase = range(rng, 0, Math.PI * 2)
      const wave = range(rng, 0.018, 0.03) * (1 - 0.4 * ri / 3)
      const spine: V3[] = []
      const S = 7
      for (let i = 0; i <= S; i++) {
        const t = i / S
        const y = y0 + (yEnd - y0) * t
        const W = halfW(y)
        const x = lam * W * 0.9 + wave * Math.sin(Math.PI * 2 * 0.85 * t + phase) * Math.min(1, t * 4)
        const lift = thick(y) * (0.55 + 0.55 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.8)))
        spine.push(onFront(x, y, lift))
      }
      out.push(
        ...ribbonP(spine, width * (1 - 0.3 * ri / 3), 3, [0.026, 0.03, 0.028, 0.02, 0.009], g++, {
          profile: (u) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.22 + u * 0.78)), 0.8),
          normalAt,
          segs: 14,
        }),
      )
    }
  })
  return out
}

function moustacheLocks(): Prim[] {
  const out: Prim[] = []
  let g = 100
  for (const s of [-1, 1]) {
    // trimmed short (Artur, 2026-09-26: Karol wears it shorter): a lobe each side, a few flat
    // locks from the parting (a dip in the middle) out and a little down, ending in a clean
    // edge above the mouth, no flicked tips
    for (let i = 0; i < 4; i++) {
      const u = i / 3 // 0 = top lock, 1 = bottom lock
      const lift = 0.058 + 0.008 * Math.sin(Math.PI * (0.3 + 0.7 * u))
      const at = (x: number, y: number, dz = 0): V3 => onFront(s * x, y, lift + dz)
      const pts: V3[] = [
        at(0.03, -0.176 - 0.016 * u, -0.018),
        at(0.13, -0.166 - 0.026 * u, 0.004),
        at(0.27, -0.178 - 0.03 * u, 0.006),
        at(0.39, -0.2 - 0.026 * u, -0.004),
        at(0.46, -0.222 - 0.016 * u, -0.016),
      ]
      out.push(...lockP(pts, [0.026, 0.032 - 0.003 * u, 0.03, 0.023, 0.015], g++, { segs: 14, flat: 2 }))
    }
  }
  return out
}

let cached: Field | null = null
function beardField() {
  if (cached) return cached
  const bed = (x: number, y: number, z: number) => {
    const zb = zBody(x, y)
    return smax(Math.max(z - (zb + thick(y) * 0.3), zb - 0.05 - z), polygon2(x, y, OUTLINE) + 0.05, 0.04)
  }
  // held softly inside the traced outline (a little proud of it, for the lobes)
  const clip = (x: number, y: number, z: number) => (y > -0.05 || z < 0.1 ? 0.2 : polygon2(x, y, OUTLINE) - 0.03 * smooth(-0.95, -0.6, y) - 0.008)
  cached = new Field([...beardLocks(), ...moustacheLocks()], { k: 0.02, kGroups: 0.016, base: bed, kBase: 0.03, clip, kClip: 0.035 })
  return cached
}

export const karolBeard: SculptSpec = {
  build: () => {
    const f = beardField()
    return { sdf: f.sdf, dirAt: (x, y, z) => f.dirAt(x, y, z) }
  },
  center: [0, -0.58, 0.68],
  half: 0.58,
  res: 170,
  ao: { ao: 0.04, aoDark: 0.3 },
  triangles: 26000,
  dirSmooth: 6,
}
