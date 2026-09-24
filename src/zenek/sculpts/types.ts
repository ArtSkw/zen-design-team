import type { Sdf, V3 } from '../sculpt'

/** One baked accessory: how to build its field, and the box to mesh it in (head frame, R = 1). */
export type SculptSpec = {
  build: () => { sdf: Sdf; dirAt?: (x: number, y: number, z: number) => V3 }
  center: V3
  half: number // half-size of the cubic meshing box
  res?: number // cells along the box
  ao?: { ao?: number; aoDark?: number }
  triangles?: number // after simplification
  error?: number
  dirSmooth?: number // passes of lock-direction smoothing over the mesh (default 12)
}
