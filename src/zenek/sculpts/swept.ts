import { leafProfile, ribbonP, type Prim, type V3 } from '../sculpt'
import { pitchOf, yawOf } from './scalp'

// Leaves laid along a path over the head — the way a stylised haircut is sculpted:
// short, pointed locks overlapping like scales, all combed one way. A path runs on the
// sphere from `from` to `to` (unit vectors, the great circle between them); leaves are
// placed along it at staggered stretches, each riding on the hair's outer surface and
// lifting its tip.

const slerp = (a: V3, b: V3, t: number): V3 => {
  const d = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
  const w = Math.acos(d)
  if (w < 1e-4) return a
  const s = Math.sin(w)
  const ka = Math.sin((1 - t) * w) / s
  const kb = Math.sin(t * w) / s
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb]
}
/** A blade: full width at the root, narrowing to a point — a lock brushed up off a clean hairline. */
export const bladeProfile = (u: number) => Math.pow(1 - Math.min(1, u), 0.85)

const unit = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

export type LeafOpts = {
  outerAt: (yaw: number, pitch: number) => number
  width: number
  lanes?: number
  radii?: number[]
  lift?: number // how far the tip rises off the surface
  bulge?: (t: number) => number // extra height along the whole path (a crest), t in 0..1
  profile?: (u: number) => number // width along each leaf (default: a leaf — narrow root, pointed tip)
}

/** Leaves along the great circle from→to, covering the stretches [t0, t1] given. */
export function leavesAlong(from: V3, to: V3, stretches: [number, number][], group: () => number, o: LeafOpts): Prim[] {
  const a = unit(from)
  const b = unit(to)
  return leavesOnPath((t) => slerp(a, b, t), stretches, group, o)
}

/** Leaves along any path over the head (`path(t)` a unit direction, t in 0..1). */
export function leavesOnPath(path: (t: number) => V3, stretches: [number, number][], group: () => number, o: LeafOpts): Prim[] {
  const out: Prim[] = []
  for (const [t0, t1] of stretches) {
    const pts: V3[] = []
    const n = 6
    for (let k = 0; k <= n; k++) {
      const s = k / n
      const t = t0 + (t1 - t0) * s
      const d = unit(path(t))
      const r = o.outerAt(yawOf(d[0], d[1], d[2]), pitchOf(d[0], d[1], d[2])) + (o.bulge?.(t) ?? 0) + 0.004 + (o.lift ?? 0.05) * s * s
      pts.push([d[0] * r, d[1] * r, d[2] * r])
    }
    out.push(...ribbonP(pts, o.width, o.lanes ?? 3, o.radii ?? [0.036, 0.042, 0.036, 0.024, 0.01], group(), { profile: o.profile ?? leafProfile, segs: 16 }))
  }
  return out
}

/**
 * A swept quiff: leaves rooted in rows along the hairline, each path running up from
 * its root over the crown and bending toward the viewer's right by `sweep` degrees of
 * yaw; `reach` degrees of pitch travelled (past 90 runs down the back). Front rows stand
 * tallest (the quiff comes from `outerAt`). `onScalp` builds the points.
 */
export function sweptQuiff(o: {
  edge: (yaw: number) => number
  onScalp: (yaw: number, pitch: number, r?: number) => V3
  rows: number
  rowStep: number // degrees of pitch between rows
  yaw: [number, number] // the span of roots across the front and sides
  spacing: number // degrees of yaw between roots on the front row
  sweep: number
  reach: number
  leaves: [number, number][] // stretches along each path
  leaf: LeafOpts
  rng: () => number
  group: () => number
  inset?: number // degrees above the hairline the locks start (the base shell makes the clean edge)
  sweepEase?: number // > 1 front-loads the sweep, so the strands leave the hairline already on the diagonal
}): Prim[] {
  const out: Prim[] = []
  for (let row = 0; row < o.rows; row++) {
    const off = (row % 2) * o.spacing * 0.5
    for (let yaw = o.yaw[0] + off; yaw <= o.yaw[1]; yaw += o.spacing * (1 + row * 0.08)) {
      const y0 = yaw + (o.rng() - 0.5) * o.spacing * 0.3
      const p0 = o.edge(y0) + (o.inset ?? 1) + row * o.rowStep + (o.rng() - 0.5) * 3
      // interpolated in yaw and pitch, not along a great circle: toward the crown a great
      // circle runs straight up whatever its yaw, and the sweep would be lost
      const sweep = o.sweep * (0.8 + o.rng() * 0.4)
      const p1 = Math.min(p0 + o.reach, 150)
      const k = o.sweepEase ?? 1
      const path = (t: number) => o.onScalp(y0 + sweep * (1 - Math.pow(1 - t, k)), p0 + (p1 - p0) * t, 1)
      const w = o.leaf.width * (0.85 + o.rng() * 0.3)
      // the first lock off the hairline is a blade (a clean edge below, a point above); the rest are leaves
      const [first, ...rest] = o.leaves
      out.push(...leavesOnPath(path, [first], o.group, { ...o.leaf, width: w * 1.15, profile: bladeProfile }))
      if (rest.length) out.push(...leavesOnPath(path, rest, o.group, { ...o.leaf, width: w }))
    }
  }
  return out
}
