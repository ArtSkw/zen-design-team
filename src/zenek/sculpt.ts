import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, MeshBasicMaterial, Vector3 } from 'three'
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js'

// Sculpting in code: an accessory is a signed distance field — many soft primitives
// (tufts, locks, clumps) fused with a smooth union, the way a clay sculptor presses
// lumps into one mass — then meshed with marching cubes. The smooth union is what
// gives the designs' look: every lock is its own lobe, and the lobes run together
// through soft creases instead of meeting at hard seams (intersecting shells are what
// made the first hair read torn). Ambient occlusion is baked from the field, so the
// creases darken like clay; every vertex also remembers the direction of the lock it
// belongs to, so strand grooves can follow the hair.
//
// Units: the body radius R = 1, head frame (x to the viewer's right when the Zenek
// faces the camera, y up, z out of the face). Specs live in src/zenek/sculpts/; the
// meshes are baked offline (scripts/sculpt-bake.mjs → public/sculpts/*.bin).

export type V3 = [number, number, number]
export type Sdf = (x: number, y: number, z: number) => number

/** Polynomial smooth minimum: a union whose seam is rounded over width k. */
export function smin(a: number, b: number, k: number) {
  if (k <= 0) return Math.min(a, b)
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}
/** Smooth maximum (smooth intersection / subtraction). */
export const smax = (a: number, b: number, k: number) => -smin(-a, -b, k)

/**
 * A cone with rounded ends between a (radius ra) and b (radius rb) — a tuft, or one
 * segment of a lock (Iñigo Quilez's exact round-cone distance).
 */
export function roundCone(px: number, py: number, pz: number, a: V3, b: V3, ra: number, rb: number) {
  const bax = b[0] - a[0]
  const bay = b[1] - a[1]
  const baz = b[2] - a[2]
  const l2 = bax * bax + bay * bay + baz * baz
  if (l2 < 1e-12) return Math.hypot(px - a[0], py - a[1], pz - a[2]) - Math.max(ra, rb)
  const rr = ra - rb
  const a2 = l2 - rr * rr
  const il2 = 1 / l2
  const pax = px - a[0]
  const pay = py - a[1]
  const paz = pz - a[2]
  const y = pax * bax + pay * bay + paz * baz
  const z = y - l2
  const xx = pax * l2 - bax * y
  const xy = pay * l2 - bay * y
  const xz = paz * l2 - baz * y
  const x2 = xx * xx + xy * xy + xz * xz
  const y2 = y * y * l2
  const z2 = z * z * l2
  const k = Math.sign(rr) * rr * rr * x2
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - rb
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - ra
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - ra
}

/** An ellipsoid centred at c with radii r (Quilez's bound; exact enough for blending). */
export function ellipsoid(px: number, py: number, pz: number, c: V3, r: V3) {
  const x = (px - c[0]) / r[0]
  const y = (py - c[1]) / r[1]
  const z = (pz - c[2]) / r[2]
  const k0 = Math.hypot(x, y, z)
  const k1 = Math.hypot(x / r[0], y / r[1], z / r[2])
  return k1 < 1e-9 ? -Math.min(r[0], r[1], r[2]) : (k0 * (k0 - 1)) / k1
}

/** Signed distance to a closed 2D polygon (negative inside). */
export function polygon2(px: number, py: number, pts: [number, number][]) {
  let d = Infinity
  let s = 1
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[j]
    const ex = bx - ax
    const ey = by - ay
    const wx = px - ax
    const wy = py - ay
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)))
    const dx = wx - ex * t
    const dy = wy - ey * t
    d = Math.min(d, dx * dx + dy * dy)
    const c1 = py >= ay
    const c2 = py < by
    const c3 = ex * wy > ey * wx
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s
  }
  return s * Math.sqrt(d)
}

// ---- primitives with a direction, for building fields ------------------------------
/** A field primitive: its distance, a bounding sphere for culling, and the hair direction it carries. */
export type Prim = { d: (x: number, y: number, z: number) => number; c: V3; r: number; dir: V3; group: number }

const norm = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

export function coneP(a: V3, b: V3, ra: number, rb: number, group = 0, flat = 1): Prim {
  const c: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]
  const half = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 2
  const zc = c[2]
  const k = Math.sqrt(flat)
  return {
    d: flat === 1 ? (x, y, z) => roundCone(x, y, z, a, b, ra, rb) : (x, y, z) => roundCone(x, y, zc + (z - zc) * flat, a, b, ra, rb) / k,
    c,
    r: half + Math.max(ra, rb),
    dir: norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]),
    group,
  }
}

export function ellipsoidP(c: V3, r: V3, dir: V3 = [0, 1, 0], group = 0): Prim {
  return { d: (x, y, z) => ellipsoid(x, y, z, c, r), c, r: Math.max(r[0], r[1], r[2]), dir: norm(dir), group }
}

/**
 * A lock: a tube swept along a Catmull-Rom curve through `pts`, its radius following
 * `radii` (one per point, interpolated), flattened across its width by `flat` (a lock
 * is a ribbon with body, not a cylinder). Split into short round-cone segments.
 */
export function lockP(pts: V3[], radii: number[], group = 0, opts: { flat?: number; segs?: number } = {}): Prim[] {
  const curve = new CatmullRomCurve3(pts.map((p) => new Vector3(...p)), false, 'centripetal')
  const n = opts.segs ?? Math.max(4, Math.round(curve.getLength() / 0.05))
  const out: Prim[] = []
  const at = (u: number): V3 => {
    const p = curve.getPointAt(u)
    return [p.x, p.y, p.z]
  }
  const rad = (u: number) => {
    const f = u * (radii.length - 1)
    const i = Math.min(radii.length - 2, Math.floor(f))
    const t = f - i
    return radii[i] + (radii[i + 1] - radii[i]) * (t * t * (3 - 2 * t))
  }
  for (let i = 0; i < n; i++) {
    const u0 = i / n
    const u1 = (i + 1) / n
    out.push(coneP(at(u0), at(u1), rad(u0), rad(u1), group, opts.flat ?? 1))
  }
  return out
}

/**
 * A ribbon lock — the broad, flat locks of sculpted hair: `count` tubes laid side by side
 * across `width`, following one spine, all in one group so they fuse into a single lock
 * with shallow strand grooves between them. The sideways direction at each point is
 * perpendicular to the spine and to `normalAt` (by default: out from the head's centre).
 * `taper` narrows the ribbon toward its tip (1 = no taper); `profile(u)` replaces it with
 * any width curve along the lock (a leaf: 0 at the root, widest a third along, a point).
 */
export function ribbonP(spine: V3[], width: number, count: number, radii: number[], group: number, opts: { taper?: number; segs?: number; normalAt?: (p: V3) => V3; profile?: (u: number) => number } = {}): Prim[] {
  const curve = new CatmullRomCurve3(spine.map((p) => new Vector3(...p)), false, 'centripetal')
  const N = 16
  const pts: V3[] = []
  const sides: V3[] = []
  for (let i = 0; i <= N; i++) {
    const u = i / N
    const p = curve.getPointAt(u)
    const t = curve.getTangentAt(u)
    const nn = opts.normalAt ? new Vector3(...opts.normalAt([p.x, p.y, p.z])) : p.clone().normalize()
    const side = new Vector3().crossVectors(t, nn).normalize()
    pts.push([p.x, p.y, p.z])
    sides.push([side.x, side.y, side.z])
  }
  const out: Prim[] = []
  const taper = opts.taper ?? 0.35
  for (let k = 0; k < count; k++) {
    const f = count === 1 ? 0 : k / (count - 1) - 0.5
    const lane = pts.map((p, i) => {
      const u = i / N
      const w = width * (opts.profile ? opts.profile(u) : 1 - (1 - taper) * u) * f
      return [p[0] + sides[i][0] * w, p[1] + sides[i][1] * w, p[2] + sides[i][2] * w] as V3
    })
    out.push(...lockP(lane, radii, group, { segs: opts.segs ?? 18 }))
  }
  return out
}

/**
 * A field: primitives smooth-unioned within their group (small k: lobes keep their
 * creases), groups smooth-unioned together (kGroups), an optional base body (e.g. a
 * shell over the scalp) and optional carve (subtracted). Culls by bounding sphere.
 */
export class Field {
  constructor(
    public prims: Prim[],
    public opts: { k?: number; kGroups?: number; base?: Sdf; kBase?: number; carve?: Sdf; kCarve?: number; clip?: Sdf; kClip?: number } = {},
  ) {}

  sdf: Sdf = (x, y, z) => {
    const { k = 0.03, kGroups = 0.04, base, kBase = 0.05, carve, kCarve = 0.02, clip, kClip = 0 } = this.opts
    const groups = new Map<number, number>()
    const b = base ? base(x, y, z) : 1e9
    let best = b
    for (const p of this.prims) {
      const bound = Math.hypot(x - p.c[0], y - p.c[1], z - p.c[2]) - p.r
      if (bound > best + 0.12) continue // far beyond anything a smooth union could reach
      const d = p.d(x, y, z)
      if (d < best) best = d
      const g = groups.get(p.group)
      groups.set(p.group, g === undefined ? d : smin(g, d, k))
    }
    let d = 1e9
    for (const g of groups.values()) d = d === 1e9 ? g : smin(d, g, kGroups)
    if (base) d = d === 1e9 ? b : smin(b, d, kBase)
    if (carve) d = smax(d, -carve(x, y, z), kCarve)
    if (clip) d = kClip > 0 ? smax(d, clip(x, y, z), kClip) : Math.max(d, clip(x, y, z))
    return d
  }

  /** The direction of the primitive nearest to a point (the lock a vertex belongs to). */
  dirAt(x: number, y: number, z: number): V3 {
    let bd = Infinity
    let dir: V3 = [0, 1, 0]
    for (const p of this.prims) {
      const bound = Math.hypot(x - p.c[0], y - p.c[1], z - p.c[2]) - p.r
      if (bound > bd) continue
      const d = p.d(x, y, z)
      if (d < bd) {
        bd = d
        dir = p.dir
      }
    }
    return dir
  }
}

// ---- meshing ---------------------------------------------------------------------------
export type MeshOut = { position: Float32Array; ao: Float32Array; dir: Float32Array; index: Uint32Array }

/**
 * Mesh a field inside a box (centre, half-size per axis) at `res` cells along its
 * longest side: marching cubes on a cubic grid, vertices welded, ambient occlusion
 * sampled from the field along each normal, the lock direction attached. A coarse
 * pass skips the fine field far from the surface.
 */
export function meshField(sdf: Sdf, dirAt: ((x: number, y: number, z: number) => V3) | null, center: V3, half: number, res: number, opts: { ao?: number; aoDark?: number } = {}): MeshOut {
  const mc = new MarchingCubes(res, new MeshBasicMaterial(), false, false, 1_500_000)
  mc.isolation = 0
  const h = res / 2
  const field = mc.field as Float32Array
  const coord = (i: number, c: number) => center[c] + ((i - h) / h) * half
  // coarse pass: every 4th node
  const C = 4
  const cn = Math.ceil(res / C) + 1
  const coarse = new Float32Array(cn * cn * cn)
  for (let z = 0; z < cn; z++)
    for (let y = 0; y < cn; y++)
      for (let x = 0; x < cn; x++) coarse[x + y * cn + z * cn * cn] = sdf(coord(x * C, 0), coord(y * C, 1), coord(z * C, 2))
  const cell = ((2 * half) / res) * C * 1.8 // beyond this the coarse value is good enough
  for (let z = 0; z < res; z++)
    for (let y = 0; y < res; y++)
      for (let x = 0; x < res; x++) {
        const cv = coarse[Math.round(x / C) + Math.round(y / C) * cn + Math.round(z / C) * cn * cn]
        field[x + y * res + z * res * res] = Math.abs(cv) > cell ? -cv : -sdf(coord(x, 0), coord(y, 1), coord(z, 2))
      }
  mc.update()
  const n = mc.count
  const P = mc.positionArray as Float32Array
  // weld: marching cubes emits a triangle soup; shared edge crossings are identical floats
  const key = new Map<string, number>()
  const pos: number[] = []
  const index = new Uint32Array(n)
  for (let i = 0; i < n; i++) {
    const x = center[0] + P[i * 3] * half
    const y = center[1] + P[i * 3 + 1] * half
    const z = center[2] + P[i * 3 + 2] * half
    const k = `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`
    let v = key.get(k)
    if (v === undefined) {
      v = pos.length / 3
      key.set(k, v)
      pos.push(x, y, z)
    }
    index[i] = v
  }
  mc.geometry.dispose()
  const V = pos.length / 3
  const position = new Float32Array(pos)
  const ao = new Float32Array(V)
  const dir = new Float32Array(V * 3)
  const step = opts.ao ?? 0.04
  const dark = opts.aoDark ?? 0.6
  const e = 0.002
  for (let v = 0; v < V; v++) {
    const x = position[v * 3]
    const y = position[v * 3 + 1]
    const z = position[v * 3 + 2]
    // normal from the field's gradient
    let nx = sdf(x + e, y, z) - sdf(x - e, y, z)
    let ny = sdf(x, y + e, z) - sdf(x, y - e, z)
    let nz = sdf(x, y, z + e) - sdf(x, y, z - e)
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l
    ny /= l
    nz /= l
    let occ = 0
    let w = 1
    for (let k = 1; k <= 4; k++) {
      const hk = step * k
      occ += w * Math.max(0, hk - sdf(x + nx * hk, y + ny * hk, z + nz * hk))
      w *= 0.6
    }
    ao[v] = dark + (1 - dark) * Math.max(0, Math.min(1, 1 - (occ / step) * 0.9))
    const d = dirAt ? dirAt(x, y, z) : ([0, 1, 0] as V3)
    dir.set(d, v * 3)
  }
  return { position, ao, dir, index }
}

/** Build a renderable geometry from mesh data (normals recomputed on the welded mesh). */
export function geometryOf(m: { position: Float32Array; ao: Float32Array; dir: Float32Array; index: Uint32Array | Uint16Array }) {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(m.position, 3))
  const col = new Float32Array(m.ao.length * 3)
  for (let i = 0; i < m.ao.length; i++) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = m.ao[i]
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.setAttribute('dir', new Float32BufferAttribute(m.dir, 3))
  g.setIndex(Array.from(m.index))
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

/** A leaf-shaped width profile: narrow root, widest near 40 %, a sharp point at the tip. */
export const leafProfile = (u: number) => Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + u * 0.88)), 0.7) * (1 - 0.15 * u)
