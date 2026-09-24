import { useLayoutEffect, useMemo, useRef } from 'react'
import { BufferGeometry, CatmullRomCurve3, Color, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, InstancedMesh, LatheGeometry, Matrix4, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, Quaternion, Shape, ShapeGeometry, SphereGeometry, TorusGeometry, Vector2, Vector3, type Material } from 'three'
import { mulberry32 } from '../lib/rng'
import { taperedTube } from './geometry'
import { ghostOf } from './materials'

// The accessory kit, built to measure from the designs: stubble (a jittered lattice of
// beads over regions of the head), rectangular sunglasses bent around the face, and
// over-ear headphones. Head frame, R units (scaled by the caller's R); regions are in
// yaw/pitch degrees on the head (yaw 0 = the face, + toward the viewer's right).

const D = Math.PI / 180
const noRaycast = () => null
const m = (mat: Material, ghost: boolean) => (ghost ? ghostOf(mat) : mat)
const onHead = (yaw: number, pitch: number, r: number) => new Vector3(r * Math.cos(pitch * D) * Math.sin(yaw * D), r * Math.sin(pitch * D), r * Math.cos(pitch * D) * Math.cos(yaw * D))

/** Frontal design coordinates (x right, y up, fractions of R) → yaw/pitch on the head. */
export const fromFront = (x: number, y: number): [number, number] => {
  const z = Math.sqrt(Math.max(0.02, 1 - x * x - y * y))
  return [Math.atan2(x, z) / D, Math.asin(Math.max(-1, Math.min(1, y))) / D]
}

function inside(p: [number, number], poly: [number, number][]) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

// ---- stubble --------------------------------------------------------------------------
export type StubbleRegion = {
  /** outline in frontal design coordinates (x, y as fractions of R) — or yaw/pitch with `angles` */
  poly: [number, number][]
  holes?: [number, number][][] // cut-outs, in the same coordinates (a mouth area, the plate)
  angles?: boolean
  spacing: number // degrees between beads
  size: [number, number, number] // bead width, length, height (R)
  flow?: number // degrees the beads turn from pointing straight down (+ = clockwise as seen)
  fan?: number // extra turn per degree of yaw (beads fan out toward the sides)
  jitter?: number
  color?: string
  seed?: number
}

const bead = new SphereGeometry(1, 10, 7)

export function Stubble({ regions, color, R, ghost }: { regions: StubbleRegion[]; color: string; R: number; ghost: boolean }) {
  const groups = useMemo(() => {
    const byColor = new Map<string, Matrix4[]>()
    const o = new Object3D()
    const up = new Vector3()
    const tangent = new Vector3()
    for (const reg of regions) {
      const rng = mulberry32(reg.seed ?? 7)
      const poly = reg.angles ? reg.poly : reg.poly.map(([x, y]) => fromFront(x, y))
      const holes = (reg.holes ?? []).map((h) => (reg.angles ? h : h.map(([x, y]) => fromFront(x, y))))
      const ys = poly.map((p) => p[0])
      const ps = poly.map((p) => p[1])
      const [p0, p1] = [Math.min(...ps), Math.max(...ps)]
      let row = 0
      for (let pitch = p0; pitch <= p1; pitch += reg.spacing * 0.86, row++) {
        const step = reg.spacing / Math.max(0.3, Math.cos(pitch * D))
        for (let yaw = Math.min(...ys) + (row % 2 ? step / 2 : 0); yaw <= Math.max(...ys); yaw += step) {
          const j = reg.jitter ?? 0.25
          const yw = yaw + (rng() - 0.5) * step * j
          const pt = pitch + (rng() - 0.5) * reg.spacing * j
          if (!inside([yw, pt], poly) || holes.some((h) => inside([yw, pt], h))) continue
          const pos = onHead(yw, pt, 1.006 + reg.size[2] * 0.3) // clear of a flush face plate too
          const n = pos.clone().normalize()
          // "down" along the surface, then turned by the flow / fan
          up.set(0, 1, 0)
          tangent.copy(up).addScaledVector(n, -up.dot(n)).normalize().negate()
          const turn = ((reg.flow ?? 0) + (reg.fan ?? 0) * yw + (rng() - 0.5) * 14) * D
          tangent.applyAxisAngle(n, -turn)
          const bin = new Vector3().crossVectors(n, tangent)
          const basis = new Matrix4().makeBasis(bin, tangent, n) // x = width, y = length, z = height
          o.position.copy(pos)
          o.quaternion.setFromRotationMatrix(basis)
          o.scale.set(reg.size[0] * (0.85 + rng() * 0.3), reg.size[1] * (0.85 + rng() * 0.3), reg.size[2])
          o.updateMatrix()
          const c = reg.color ?? color
          if (!byColor.has(c)) byColor.set(c, [])
          byColor.get(c)!.push(o.matrix.clone())
        }
      }
    }
    return [...byColor.entries()].map(([c, ms]) => ({ mat: new MeshStandardMaterial({ color: new Color(c), roughness: 0.62 }), ms }))
  }, [regions, color])
  return (
    <group scale={R}>
      {groups.map((g, i) => (
        <Beads key={i} mats={g.ms} material={m(g.mat, ghost)} />
      ))}
    </group>
  )
}

function Beads({ mats, material }: { mats: Matrix4[]; material: Material }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const im = ref.current
    if (!im) return
    mats.forEach((mm, i) => im.setMatrixAt(i, mm))
    im.instanceMatrix.needsUpdate = true
    im.computeBoundingSphere()
  }, [mats])
  return <instancedMesh ref={ref} args={[bead, material, mats.length]} raycast={noRaycast} />
}

// ---- a soft decal patch (the skin glow around a mouth in a stubble beard) ----------------
export function SkinPatch({ at, size, color, opacity, R }: { at: [number, number]; size: [number, number]; color: string; opacity: number; R: number }) {
  const { geo, mat } = useMemo(() => {
    const [yc, pc] = fromFront(at[0], at[1])
    const g = new BufferGeometry()
    const pos: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    const N = 14
    for (let i = 0; i <= N; i++)
      for (let j = 0; j <= N; j++) {
        const u = i / N - 0.5
        const v = j / N - 0.5
        const p = onHead(yc + u * size[0], pc + v * size[1], 1.003)
        pos.push(p.x, p.y, p.z)
        uv.push(u * 2, v * 2)
      }
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const a = i * (N + 1) + j
        idx.push(a, a + N + 1, a + 1, a + 1, a + N + 1, a + N + 2)
      }
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
    g.setIndex(idx)
    const mm = new MeshStandardMaterial({ color: new Color(color), roughness: 0.7, transparent: true, depthWrite: false, opacity })
    mm.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= smoothstep(1.0, 0.25, length(vUv));')
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vUv;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvUv = uv;')
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vUv;')
    }
    return { geo: g, mat: mm }
  }, [at, size, color, opacity])
  return <mesh geometry={geo} material={mat} scale={R} raycast={noRaycast} renderOrder={1} />
}

// ---- rectangular sunglasses, bent around the face ---------------------------------------
/**
 * Wayfarer-style sunglasses: the front drawn flat (frontal design coordinates) and bent
 * onto a vertical cylinder of radius `bend` around the head's axis, so a point measured
 * at frontal x lands at frontal x. Frame glossy black, lenses dark and translucent.
 */
export function SunglassesRect({ R, ghost, top, bottom, inner, outer, rim, bend = 1.1, frameColor = '#111214', lensColor = '#0d0e10' }: {
  R: number; ghost: boolean; top: number; bottom: number; inner: number; outer: number; rim: number; bend?: number; frameColor?: string; lensColor?: string
}) {
  const g = useMemo(() => {
    // one lens outline (right side, x > 0), in frontal units: flat top, rounded lower corners
    const lens = (x0: number, x1: number, y0: number, y1: number, rb: number, rt: number) => {
      const s = new Shape()
      s.moveTo(x0 + rt, y1)
      s.lineTo(x1 - rt, y1)
      s.quadraticCurveTo(x1, y1, x1, y1 - rt)
      s.lineTo(x1 - 0.02, y0 + rb)
      s.quadraticCurveTo(x1 - 0.02, y0, x1 - 0.02 - rb, y0)
      s.lineTo(x0 + rb, y0)
      s.quadraticCurveTo(x0, y0, x0, y0 + rb)
      s.lineTo(x0, y1 - rt)
      s.quadraticCurveTo(x0, y1, x0 + rt, y1)
      return s
    }
    const outerR = lens(inner, outer, bottom, top, 0.12, 0.03)
    const holeR = lens(inner + rim, outer - rim, bottom + rim, top - rim * 1.35, 0.1, 0.02)
    const mirror = (s: Shape) => {
      const pts = s.getPoints(24).map((p) => new Vector2(-p.x, p.y)).reverse()
      return new Shape(pts)
    }
    const frame = [outerR, mirror(outerR)]
    frame[0].holes.push(holeR)
    frame[1].holes.push(mirror(holeR))
    // the bridge: a bar across the top between the lenses
    const bridge = new Shape()
    bridge.moveTo(-inner - 0.01, top)
    bridge.lineTo(inner + 0.01, top)
    bridge.lineTo(inner + 0.01, top - rim * 1.5)
    bridge.quadraticCurveTo(0, top - rim * 2.1, -inner - 0.01, top - rim * 1.5)
    bridge.closePath()
    const bendGeo = (geo: BufferGeometry, lift: number) => {
      const p = geo.attributes.position
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i)
        const y = p.getY(i)
        const z = p.getZ(i)
        const r = bend + lift + z
        const a = Math.asin(Math.max(-0.99, Math.min(0.99, x / bend)))
        p.setXYZ(i, r * Math.sin(a), y, r * Math.cos(a))
      }
      geo.computeVertexNormals()
      return geo
    }
    const depth = 0.045
    const opts = { depth, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 2, curveSegments: 24 }
    const frameGeo = bendGeo(new ExtrudeGeometry([...frame, bridge], opts), -depth / 2)
    const lensGeo = bendGeo(new ShapeGeometry([lens(inner + rim * 0.6, outer - rim * 0.6, bottom + rim * 0.6, top - rim * 0.8, 0.1, 0.02), mirror(lens(inner + rim * 0.6, outer - rim * 0.6, bottom + rim * 0.6, top - rim * 0.8, 0.1, 0.02))], 24), 0)
    // temples: from the outer top corners back along the head
    const a0 = Math.asin(outer / bend) / D
    const temple = (s: number) =>
      taperedTube(
        new CatmullRomCurve3([onHead(s * a0, Math.asin(top - 0.03) / D, bend - 0.005), onHead(s * (a0 + 22), Math.asin(top - 0.04) / D, 1.018), onHead(s * 100, Math.asin(top - 0.06) / D, 1.006)]),
        0.014,
        0.012,
        24,
        8,
        undefined,
        [0.6, 1.4],
      )
    return { frameGeo, lensGeo, temples: [temple(1), temple(-1)] }
  }, [top, bottom, inner, outer, rim, bend])
  const frameMat = useMemo(() => new MeshPhysicalMaterial({ color: new Color(frameColor), roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.2 }), [frameColor])
  const lensMat = useMemo(
    () => new MeshPhysicalMaterial({ color: new Color(lensColor), roughness: 0.05, metalness: 0, transparent: true, opacity: 0.8, clearcoat: 1, clearcoatRoughness: 0.03, side: DoubleSide, depthWrite: false }),
    [lensColor],
  )
  return (
    <group scale={R}>
      <mesh geometry={g.frameGeo} material={m(frameMat, ghost)} raycast={ghost ? noRaycast : undefined} castShadow />
      <mesh geometry={g.lensGeo} material={m(lensMat, ghost)} raycast={noRaycast} renderOrder={2} />
      {g.temples.map((t, i) => (
        <mesh key={i} geometry={t} material={m(frameMat, ghost)} raycast={noRaycast} />
      ))}
    </group>
  )
}

// ---- over-ear headphones --------------------------------------------------------------
/**
 * A band close over the crown and two big cups on the sides of the head, a little
 * forward (at ±`yaw`) so their shells show from the front, as drawn; cup centres at
 * `pitch` (degrees). Cushion against the head, shell and rim outside.
 */
export function Headphones({ R, ghost, pitch = 9, yaw = 80, cupH = 0.62, cupW = 0.36, color = '#262628', cushion = '#1c1c1e' }: { R: number; ghost: boolean; pitch?: number; yaw?: number; cupH?: number; cupW?: number; color?: string; cushion?: string }) {
  const g = useMemo(() => {
    const yc = Math.sin(pitch * D)
    // band: an arc just clear of the scalp and the short hair, in a plane through the cups
    const pts: Vector3[] = []
    for (let k = 0; k <= 32; k++) {
      const a = (-70 + (140 * k) / 32) * D
      pts.push(new Vector3(1.075 * Math.sin(a), yc + (1.075 - yc * 0.2) * Math.cos(a) - 0.02, -0.02))
    }
    const band = taperedTube(new CatmullRomCurve3(pts), 0.05, 0.05, 80, 12, undefined, [0.62, 1.5])
    // shell: a lathed puck with a rounded outer face (axis along +y before turning)
    const T = 0.2
    const shell = new LatheGeometry(
      [new Vector2(0.001, 0), new Vector2(0.5, 0), new Vector2(0.5, T * 0.45), new Vector2(0.485, T * 0.75), new Vector2(0.42, T * 0.95), new Vector2(0.3, T), new Vector2(0.001, T)],
      56,
    )
    const rim = new TorusGeometry(0.46, 0.05, 12, 56)
    const cush = new TorusGeometry(0.36, 0.14, 18, 56)
    return { band, shell, rim, cush, yc }
  }, [pitch])
  const plastic = useMemo(() => new MeshPhysicalMaterial({ color: new Color(color), roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.4 }), [color])
  const pad = useMemo(() => new MeshStandardMaterial({ color: new Color(cushion), roughness: 0.85 }), [cushion])
  const up = useMemo(() => new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(1, 0, 0)), [])
  const face = useMemo(() => new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(1, 0, 0)), [])
  return (
    <group scale={R}>
      <mesh geometry={g.band} material={m(plastic, ghost)} raycast={ghost ? noRaycast : undefined} castShadow />
      {[-1, 1].map((s) => {
        const c = onHead(s * yaw, pitch, 0.955)
        return (
          <group key={s} position={c} rotation-y={s * -(90 - yaw) * D} scale={[s, 1, 1]}>
            {/* slider down from the band to the cup */}
            <mesh material={m(plastic, ghost)} position={[0.12, cupH * 0.5 + 0.02, 0]} raycast={noRaycast}>
              <boxGeometry args={[0.05, 0.16, 0.08]} />
            </mesh>
            <mesh geometry={g.cush} material={m(pad, ghost)} quaternion={face} position={[0.02, 0, 0]} scale={[cupW / 0.5, cupH / 0.5, 0.55]} raycast={ghost ? noRaycast : undefined} castShadow />
            <mesh geometry={g.shell} material={m(plastic, ghost)} quaternion={up} position={[0.07, 0, 0]} scale={[cupH, 0.75, cupW]} raycast={ghost ? noRaycast : undefined} castShadow />
            <mesh geometry={g.rim} material={m(plastic, ghost)} quaternion={face} position={[0.08, 0, 0]} scale={[cupW / 0.5 * 0.5 * 2, cupH / 0.5 * 0.5 * 2, 0.8]} raycast={noRaycast} />
          </group>
        )
      })}
    </group>
  )
}
