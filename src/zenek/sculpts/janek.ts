import { Field, ribbonP, type Prim, type V3 } from '../sculpt'
import { mulberry32 } from '../../lib/rng'
import { hairline, onScalp, pitchOf, scalpShell, yawOf } from './scalp'
import type { SculptSpec } from './types'

// Janek (docs/cast/janek.png; body circle (627, 678) px, R 392): dark, wavy, shoulder-of-
// the-cheek hair with a centre part. From the part each side flows over the top and out
// in broad S-waves — standing ≈ 0.25 R off the head at temple height (the silhouette at
// y 0.66 reaches x ±1.0) — ending in curls at cheek level (y ≈ 0.25); two front locks
// fall from the part and curl onto the plate's upper corners. Top of the domes 0.27 R above
// the head, the part dipping to 0.18 R.

const edge = hairline([
  [0, 46],
  [20, 44],
  [50, 36],
  [80, 20],
  [110, 6],
  [150, -2],
  [180, -4],
])
const outerAt = (yaw: number, p: number) => {
  const u = Math.min(1, Math.max(0, (p - edge(yaw)) / 30))
  return 1.02 + 0.05 * Math.sin((u * Math.PI) / 2) // a thin cover: the locks make the silhouette
}

/**
 * A lock through (yaw, pitch, r) keys, smoothly interpolated, with an S-wave that
 * swells in and out (radius) and sways (yaw) as it falls — the design's waves.
 */
function waved(keys: [number, number, number][], sway: number, swell: number, waves: number, phase: number): V3[] {
  const out: V3[] = []
  const n = 16
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const f = t * (keys.length - 1)
    const k = Math.min(keys.length - 2, Math.floor(f))
    const u = f - k
    const s = u * u * (3 - 2 * u)
    const [y0, p0, r0] = keys[k]
    const [y1, p1, r1] = keys[k + 1]
    const env = Math.min(1, t * 2.5) * (1 - 0.4 * t)
    const w = Math.sin(t * Math.PI * 2 * waves + phase)
    out.push(onScalp(y0 + (y1 - y0) * s + w * sway * env, p0 + (p1 - p0) * s, r0 + (r1 - r0) * s + Math.cos(t * Math.PI * 2 * waves + phase) * swell * env))
  }
  return out
}

function prims(): Prim[] {
  const rng = mulberry32(23)
  const out: Prim[] = []
  let g = 0
  for (const s of [-1, 1]) {
    // five broad locks rooted along the centre part, front (i = 0) to crown (i = 4):
    // each rises into the dome beside the part, runs out and down the side in an S-wave
    // and ends in a curl turned outward and up at cheek level; the later locks wrap
    // further back
    for (let i = 0; i < 6; i++) {
      // measured: at temple height the hair stands ≈ 0.2 R off the head (y 0.66 → x ±1.0,
      // i.e. r 1.2 at pitch 33 on the side); lower down it hugs the body (y 0.3, x ±0.95 →
      // r ≈ 1.0) and ends in a curl — the front locks higher, by the face, the back ones lower
      const root = 60 + i * 6.5
      const side = 58 + i * 9 // how far round the lock falls
      const end = 18 - i * 2
      const keys: [number, number, number][] = [
        [s * 3, root, 1.12],
        [s * (18 + 2 * i), root + 2, 1.26], // the dome beside the part
        [s * (side - 22), 50, 1.24],
        [s * side, 33, 1.2], // full at the temple
        [s * (side + 2), end + 5, 1.05], // hugging the cheek
        [s * (side + 5), end, 1.1], // the curl turns out…
        [s * (side + 1), end + 5, 1.14], // …and up
      ]
      const pts = waved(keys, 7, 0.055, 1.75, i * 0.9 + (s > 0 ? 0.6 : 0) + rng() * 0.3)
      out.push(...ribbonP(pts, 0.27, 4, [0.075, 0.09, 0.09, 0.085, 0.07, 0.055, 0.04, 0.026], g++, { taper: 0.45, segs: 28 }))
    }
    // the front lock: from the part, a C-curl falling onto the plate's upper corner
    const front: [number, number, number][] = [
      [s * 2, 56, 1.13],
      [s * 14, 62, 1.24],
      [s * 28, 52, 1.2],
      [s * 34, 42, 1.14],
      [s * 28, 38, 1.16],
      [s * 23, 42, 1.19],
    ]
    out.push(...ribbonP(waved(front, 2, 0.01, 1, 0), 0.28, 5, [0.075, 0.09, 0.08, 0.06, 0.045, 0.03], g++, { taper: 0.3, segs: 24 }))
  }
  // the back: long locks from the crown to the nape, round the back only
  for (let i = 0; i < 7; i++) {
    const y = 180 + (i - 3) * 22 + (rng() - 0.5) * 6
    const keys: [number, number, number][] = [
      [y, 84, 1.14],
      [y, 60, 1.22],
      [y, 30, 1.22],
      [y, 4, 1.18],
    ]
    out.push(...ribbonP(waved(keys, 5, 0.025, 1.2, i * 1.1), 0.3, 4, [0.07, 0.085, 0.07, 0.04], g++, { taper: 0.4, segs: 18 }))
  }
  return out
}

export const janekHair: SculptSpec = {
  build: () => {
    const base = scalpShell(edge, 0.97, (p) => p, 0.03, (x, y, z) => outerAt(yawOf(x, y, z), pitchOf(x, y, z)))
    const f = new Field(prims(), { k: 0.04, kGroups: 0.012, base, kBase: 0.03 })
    return { sdf: f.sdf, dirAt: (x, y, z) => f.dirAt(x, y, z) }
  },
  center: [0, 0.35, -0.05],
  half: 1.5,
  res: 170,
  ao: { ao: 0.04, aoDark: 0.52 },
  triangles: 38000,
}
