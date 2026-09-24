import { BufferGeometry, Float32BufferAttribute, SphereGeometry } from 'three'
import { createNoise3D } from 'simplex-noise'
import { mulberry32 } from '../lib/rng'

// Soft furnishings and plants for the room, as small geometry builders: the
// shapes the reference render draws (docs/set/diorama-hero-v2.png) that a box or
// a sphere cannot — a broad leaf that arches, a puffed cushion, a pine's needle pad.

/**
 * A broad leaf on its stem, like the reference's peace lily: a thin stem, then an
 * ovate blade with a pointed tip, folded a little along the midrib, arching out
 * and over. Local frame: grows along +z from the origin, rising at `rise` radians
 * and bending down by `bend` over its length; x is across the blade.
 */
export function leafGeometry(len: number, width: number, rise: number, bend: number, fold = 0.35, stem = 0.3) {
  const nu = 22
  const nv = 6
  const pos: number[] = []
  const idx: number[] = []
  // centreline by integrating the direction, which tips from `rise` down by `bend`
  const cl: [number, number][] = [[0, 0]]
  for (let i = 1; i <= nu; i++) {
    const u = (i - 0.5) / nu
    const a = rise - bend * u * u
    const [py, pz] = cl[i - 1]
    cl.push([py + (Math.sin(a) * len) / nu, pz + (Math.cos(a) * len) / nu])
  }
  for (let i = 0; i <= nu; i++) {
    const u = i / nu
    const s = (u - stem) / (1 - stem)
    // a narrow stem, then the blade: widest a little below the middle, a point at the tip
    const w = s <= 0 ? 0.018 : Math.max(0.018, width * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.8)), 0.85) * (1 - 0.25 * s))
    const a = rise - bend * u * u
    const [cy, cz] = cl[i]
    // the blade's normal in the y-z plane (perpendicular to the centreline)
    const ny = Math.cos(a)
    const nz = -Math.sin(a)
    for (let j = 0; j <= nv; j++) {
      const v = (j / nv) * 2 - 1
      const lift = s <= 0 ? 0 : fold * Math.abs(v) * w * 0.5
      pos.push(v * w * 0.5, cy + ny * lift, cz + nz * lift)
    }
  }
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a0 = i * (nv + 1) + j
      const b0 = a0 + nv + 1
      idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/**
 * A puffed cushion: a superellipsoid, near-square in plan (exponent `n`), round
 * in section, so it is thickest in the middle and thins to soft, slightly pointed
 * corners; the underside is pressed flat. `a` = half-width, `top` = crown height
 * above the seam, `under` = how much of that the pressed underside keeps.
 */
export function pillowGeometry(a: number, top: number, n = 4.2, under = 0.33) {
  const g = new SphereGeometry(1, 48, 32)
  const p = g.attributes.position
  const spow = (v: number, e: number) => Math.sign(v) * Math.pow(Math.abs(v), e)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const phi = Math.asin(Math.max(-1, Math.min(1, y)))
    const th = Math.atan2(z, x)
    const c = Math.cos(phi)
    const yy = top * Math.sin(phi) * (y < 0 ? under : 1)
    p.setXYZ(i, a * c * spow(Math.cos(th), 2 / n), yy, a * c * spow(Math.sin(th), 2 / n))
  }
  g.computeVertexNormals()
  return g
}

/**
 * A pine's needle pad: a flattened, lumpy cushion of foliage — several soft blobs
 * fused into one irregular cloud with a fine needle grain on the surface.
 * Radii in x (spread), y (thickness), z (depth).
 */
export function padGeometry(rx: number, ry: number, rz: number, seed: number) {
  const g = new SphereGeometry(1, 36, 18)
  const noise = createNoise3D(mulberry32(seed))
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    // big lumps (the blobs) + fine grain (the needles); flatter underneath
    const lump = 1 + 0.22 * noise(x * 1.6, y * 1.6, z * 1.6)
    const grain = 1 + 0.05 * noise(x * 9, y * 9, z * 9)
    const k = lump * grain
    p.setXYZ(i, x * rx * k, y * ry * k * (y < 0 ? 0.55 : 1), z * rz * k)
  }
  g.computeVertexNormals()
  return g
}
