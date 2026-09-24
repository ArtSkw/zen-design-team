import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute, Quaternion, Shape, Vector2, Vector3, type Curve, type ExtrudeGeometryOptions } from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

// Point on a superellipse |x/a|^n + |y/b|^n = 1 at parameter t.
export function sePoint(a: number, b: number, n: number, t: number, out = new Vector2()) {
  const c = Math.cos(t)
  const s = Math.sin(t)
  return out.set(a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), b * Math.sign(s) * Math.pow(Math.abs(s), 2 / n))
}

// Arc coordinates → world point. x, y are arc lengths on a sphere of radius R
// measured from the front (+z); h is the height above the surface.
export function onSphere(x: number, y: number, h: number, R: number, out = new Vector3()) {
  const yaw = x / R
  const pitch = y / R
  const r = R + h
  const cp = Math.cos(pitch)
  return out.set(cp * Math.sin(yaw) * r, Math.sin(pitch) * r, cp * Math.cos(yaw) * r)
}

const Z = new Vector3(0, 0, 1)
const Y = new Vector3(0, 1, 0)

// Quaternion turning +z into the surface normal at arc coords (x, y).
export function normalQuat(x: number, y: number, R: number, out = new Quaternion()) {
  return out.setFromUnitVectors(Z, onSphere(x, y, 0, R).normalize())
}

// Placement for a Y-aligned cylinder spanning two points.
export function between(a: Vector3, b: Vector3) {
  const dir = b.clone().sub(a)
  const length = dir.length()
  return {
    position: a.clone().add(b).multiplyScalar(0.5),
    quaternion: new Quaternion().setFromUnitVectors(Y, dir.normalize()),
    length,
  }
}

// ExtrudeGeometry with welded vertices so the bevel shades smoothly.
export function smoothExtrude(shape: Shape, opts: ExtrudeGeometryOptions): BufferGeometry {
  const g = new ExtrudeGeometry(shape, opts)
  g.deleteAttribute('uv')
  g.deleteAttribute('normal')
  const merged = mergeVertices(g, 1e-5)
  g.dispose()
  return merged
}

function strip(pos: number[], idx: number[], rows: number, segs: number, flip = false) {
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < segs; j++) {
      const a0 = i * (segs + 1) + j
      const a1 = a0 + 1
      const b0 = a0 + segs + 1
      const b1 = b0 + 1
      if (flip) idx.push(a0, a1, b0, a1, b1, b0)
      else idx.push(a0, b0, a1, a1, b0, b1)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

// Face plate: a superellipse disc bent onto the sphere at height h, with a
// rolled lip of radius `lip` that dips back into the body. Every ring is on the
// sphere, so the plate is truly curved (the earlier extrude-and-wrap left the
// cap flat and sunk it inside the body).
export function capGeometry(a: number, b: number, n: number, R: number, h: number, lip: number, rings = 14, segs = 96): BufferGeometry {
  const lipRings = 6
  const total = rings + lipRings
  const pos: number[] = []
  const p = new Vector2()
  const v = new Vector3()
  for (let i = 0; i <= total; i++) {
    let ext = 1
    let out = 0
    let hh = h
    if (i <= rings) ext = i / rings
    else {
      const ang = ((i - rings) / lipRings) * (Math.PI / 2)
      out = lip * Math.sin(ang)
      hh = h - lip * (1 - Math.cos(ang))
    }
    for (let j = 0; j <= segs; j++) {
      sePoint(a, b, n, (j / segs) * Math.PI * 2, p)
      const len = Math.hypot(p.x, p.y) || 1
      onSphere(p.x * ext + (p.x / len) * out, p.y * ext + (p.y / len) * out, hh, R, v)
      pos.push(v.x, v.y, v.z)
    }
  }
  return strip(pos, [], total, segs)
}

// Tube along a curve with a radius profile (default: linear taper r0 → r1),
// closed with fans at both ends. `flat` scales the cross-section [thickness,
// width]. With `radial` the frame is anchored to the direction from the origin
// (the head centre), so a flat lock stays flat against the head instead of
// twisting with the Frenet frame.
export function taperedTube(
  curve: Curve<Vector3>,
  r0: number,
  r1: number,
  tubular = 48,
  radial = 12,
  radiusAt?: (t: number) => number,
  flat: [number, number] = [1, 1],
  radialFrame = false,
): BufferGeometry {
  const frames = curve.computeFrenetFrames(tubular, false)
  const pos: number[] = []
  const idx: number[] = []
  const P = new Vector3()
  const v = new Vector3()
  const T = new Vector3()
  const N = new Vector3()
  const B = new Vector3()
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular
    curve.getPointAt(t, P)
    if (radialFrame) {
      curve.getTangentAt(t, T).normalize()
      N.copy(P).normalize()
      N.addScaledVector(T, -N.dot(T)).normalize()
      B.crossVectors(T, N).normalize()
    } else {
      N.copy(frames.normals[i])
      B.copy(frames.binormals[i])
    }
    const r = radiusAt ? radiusAt(t) : r0 + (r1 - r0) * t
    for (let j = 0; j <= radial; j++) {
      const th = (j / radial) * Math.PI * 2
      const c = Math.cos(th) * flat[0]
      const s = Math.sin(th) * flat[1]
      v.set(N.x * c + B.x * s, N.y * c + B.y * s, N.z * c + B.z * s).multiplyScalar(r).add(P)
      pos.push(v.x, v.y, v.z)
    }
  }
  for (let i = 0; i < tubular; i++)
    for (let j = 0; j < radial; j++) {
      const a0 = i * (radial + 1) + j
      const a1 = a0 + 1
      const b0 = a0 + radial + 1
      const b1 = b0 + 1
      idx.push(a0, a1, b0, a1, b1, b0)
    }
  // end fans
  const ring = radial + 1
  const startC = pos.length / 3
  curve.getPointAt(0, P)
  pos.push(P.x, P.y, P.z)
  for (let j = 0; j < radial; j++) idx.push(startC, j, j + 1)
  const endC = pos.length / 3
  curve.getPointAt(1, P)
  pos.push(P.x, P.y, P.z)
  const base = tubular * ring
  for (let j = 0; j < radial; j++) idx.push(endC, base + j + 1, base + j)
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}
