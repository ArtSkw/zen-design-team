import { useMemo } from 'react'
import { CatmullRomCurve3, CylinderGeometry, Quaternion, Shape, SphereGeometry, TorusGeometry, Vector3, type Material } from 'three'
import type { faceOf } from './proportions'
import { between, normalQuat, onSphere, smoothExtrude, taperedTube } from './geometry'
import { ghostOf, matte, metal } from './materials'
import { mulberry32, range } from '../lib/rng'
import { clay, type ClayOpts } from './clay'
import { useSculpt } from './sculptAsset'
import { Headphones, SkinPatch, Stubble, SunglassesRect, type StubbleRegion } from './kit'

// One bespoke reconstruction per approved design (docs/cast/*.png).
export type PartConfig =
  | { type: 'face-janek' }
  | { type: 'glasses-round'; color?: string }
  // a baked sculpt (src/zenek/sculpts/, public/sculpts/<name>.bin), worn in the head frame
  | { type: 'sculpt'; name: string; color: string; clay?: ClayOpts; traits?: Partial<HeadTraits> }
  // the kit (src/zenek/kit.tsx), head frame
  | { type: 'stubble'; color: string; regions: StubbleRegion[] }
  | { type: 'skin'; at: [number, number]; size: [number, number]; color: string; opacity: number }
  | { type: 'sunglasses-rect'; top: number; bottom: number; inner: number; outer: number; rim: number; bend?: number }
  | { type: 'headphones'; pitch?: number; cupH?: number; cupW?: number }

// Face parts live in the plate frame (arc coords around the plate centre);
// head parts live in the head frame (yaw/pitch on the body sphere, or the frontal plane).
export const isFacePart = (p: PartConfig) => p.type === 'face-janek' || p.type === 'glasses-round'

export type PartCtx = { R: number; face: ReturnType<typeof faceOf>; ghost: boolean }

/**
 * Where a character's parts sit around the head, so the hands keep out of them:
 * `crown` — hair or a hat on top (no head scratching, a lower wave); `longSides` —
 * hair hanging beside the body (hands rest and gesture in front of it); `front` —
 * something in front of the body (a full beard); `bulky` — sculpted arms (they wave out to the side,
 * never across the face).
 */
export type HeadTraits = { crown: boolean; longSides: boolean; front: boolean; waveSide?: 1 | -1; bulky?: boolean }
export function headTraits(parts: PartConfig[]): HeadTraits {
  const t: HeadTraits = { crown: false, longSides: false, front: false }
  for (const p of parts) {
    if (p.type === 'sculpt') Object.assign(t, p.traits)
    if (p.type === 'headphones') t.crown = true
  }
  return t
}

const unit = new SphereGeometry(1, 24, 16)
const noRaycast = () => null
const Z = new Vector3(0, 0, 1)
const m = (mat: Material, ghost: boolean) => (ghost ? ghostOf(mat) : mat)

// ---- Janek's face: drooping moustache, soul patch, stubble dashes --------------
function faceCurve(pts: [number, number][], h: number, R: number) {
  return new CatmullRomCurve3(pts.map(([x, y]) => onSphere(x * R, y * R, h * R, R)), false, 'catmullrom', 0.5)
}

function onFace(x: number, y: number, h: number, R: number) {
  return { position: onSphere(x * R, y * R, h * R, R), quaternion: normalQuat(x * R, y * R, R) }
}

function FaceJanek({ ctx }: { ctx: PartCtx }) {
  const { R, ghost, face } = ctx
  const dark = matte('#221e1c', 0.6)
  const onPlate = matte('#1f1c1a', 0.6)
  const onBody = matte('#3d3835', 0.65)
  const moustache = useMemo(() => {
    const c = faceCurve([[-0.4, -0.38], [-0.27, -0.27], [0, -0.24], [0.27, -0.27], [0.4, -0.38]], 0.08, R)
    return taperedTube(c, 0.055 * R, 0.055 * R, 40, 10, (t) => 0.056 * R * (0.5 + 0.5 * (1 - Math.pow(Math.abs(2 * t - 1), 3))))
  }, [R])
  // the soul patch, as drawn: a small inverted triangle with rounded corners, matte
  const soul = useMemo(() => {
    const sh = new Shape()
    const w = 0.07
    const top = 0.035
    const bot = -0.055
    sh.moveTo(-w + 0.02, top)
    sh.lineTo(w - 0.02, top)
    sh.quadraticCurveTo(w, top, w - 0.012, top - 0.02)
    sh.lineTo(0.012, bot + 0.012)
    sh.quadraticCurveTo(0, bot - 0.004, -0.012, bot + 0.012)
    sh.lineTo(-w + 0.012, top - 0.02)
    sh.quadraticCurveTo(-w, top, -w + 0.02, top)
    const g = smoothExtrude(sh, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 3, curveSegments: 10 })
    g.scale(R, R, R)
    g.computeVertexNormals()
    return { geo: g, ...onFace(0, -0.44, 0.03, R) }
  }, [R])
  const soulMat = matte('#1c1a19', 0.92)
  const dashes = useMemo(() => {
    const rng = mulberry32(23)
    const out: { position: Vector3; quaternion: Quaternion; plate: boolean }[] = []
    const { a, b, n } = face.plate
    const rows: [number, number][] = [
      [-0.06, 17],
      [0.07, 15],
      [0.19, 7],
    ]
    for (const [off, count] of rows)
      for (let i = 0; i < count; i++) {
        const s = -1 + (2 * (i + 0.5)) / count
        const x0 = 0.76 * s
        const y0 = -0.72 + 0.55 * s * s
        const tx = 0.76
        const ty = 1.1 * s
        const len = Math.hypot(tx, ty)
        const nx = ty / len
        const ny = -tx / len
        const x = x0 + nx * off + range(rng, -0.02, 0.02)
        const y = y0 + ny * off + range(rng, -0.02, 0.02)
        const inPlate = Math.pow(Math.abs(x / a), n) + Math.pow(Math.abs(y / b), n) <= 1
        const h = inPlate ? face.plate.h + 0.016 : 0.016
        const rotZ = Math.atan2(ny, nx) - Math.PI / 2 + range(rng, -0.3, 0.3)
        const q = normalQuat(x * R, y * R, R).multiply(new Quaternion().setFromAxisAngle(Z, rotZ))
        out.push({ position: onSphere(x * R, y * R, h * R, R), quaternion: q, plate: inPlate })
      }
    return out
  }, [R, face])
  return (
    <group>
      <mesh geometry={moustache} material={m(dark, ghost)} raycast={ghost ? noRaycast : undefined} castShadow />
      <mesh geometry={soul.geo} material={m(soulMat, ghost)} position={soul.position} quaternion={soul.quaternion} raycast={ghost ? noRaycast : undefined} />
      {dashes.map((d, i) => (
        <mesh key={i} geometry={unit} material={m(d.plate ? onPlate : onBody, ghost)} position={d.position} quaternion={d.quaternion} scale={[0.02 * R, 0.05 * R, 0.014 * R]} raycast={ghost ? noRaycast : undefined} />
      ))}
    </group>
  )
}

// ---- round gold glasses (Magda) ------------------------------------------------
function GlassesRound({ ctx, color }: { ctx: PartCtx; color: string }) {
  const { R, ghost, face } = ctx
  const mat = metal(color, 0.3)
  const g = useMemo(() => {
    const tilt = Math.asin(face.plate.y)
    const ey = Math.asin(face.eye.y) - tilt // arc offset of the eyes from the plate centre (/R)
    const ex = face.eye.dx
    const rr = Math.min(0.26, ex - 0.015)
    const tube = 0.024
    const h = 0.15
    const ring = new TorusGeometry(rr * R, tube * R, 12, 56)
    const rings = [-1, 1].map((s) => onFace(s * ex, ey, h, R))
    const bridge = taperedTube(faceCurve([[-(ex - rr) - 0.01, ey + 0.02], [0, ey + 0.05], [ex - rr + 0.01, ey + 0.02]], h, R), tube * R, tube * R, 16, 8)
    const temples = [-1, 1].flatMap((s) => {
      const pts = [onSphere(s * (ex + rr) * R, (ey + 0.01) * R, h * R, R), onSphere(s * 0.8 * R, (ey + 0.03) * R, 0.09 * R, R), onSphere(s * 1.12 * R, (ey + 0.05) * R, 0.04 * R, R)]
      return [between(pts[0], pts[1]), between(pts[1], pts[2])]
    })
    const cyl = (len: number) => new CylinderGeometry(tube * R, tube * R, len, 10)
    return { ring, rings, bridge, temples, cyl }
  }, [R, face])
  return (
    <group>
      {g.rings.map((r, i) => (
        <mesh key={i} geometry={g.ring} material={m(mat, ghost)} position={r.position} quaternion={r.quaternion} raycast={ghost ? noRaycast : undefined} castShadow />
      ))}
      <mesh geometry={g.bridge} material={m(mat, ghost)} raycast={ghost ? noRaycast : undefined} />
      {g.temples.map((t, i) => (
        <mesh key={i} geometry={g.cyl(t.length * 1.05)} material={m(mat, ghost)} position={t.position} quaternion={t.quaternion} raycast={ghost ? noRaycast : undefined} />
      ))}
    </group>
  )
}

// ---- baked sculpts ---------------------------------------------------------------
function SculptPart({ cfg, ctx }: { cfg: Extract<PartConfig, { type: 'sculpt' }>; ctx: PartCtx }) {
  const g = useSculpt(cfg.name)
  const mat = clay(cfg.color, cfg.clay)
  if (!g) return null
  return <mesh geometry={g} material={m(mat, ctx.ghost)} scale={ctx.R} raycast={ctx.ghost ? noRaycast : undefined} castShadow />
}

export function Part({ cfg, ctx }: { cfg: PartConfig; ctx: PartCtx }) {
  switch (cfg.type) {
    case 'sculpt':
      return <SculptPart cfg={cfg} ctx={ctx} />
    case 'stubble':
      return <Stubble regions={cfg.regions} color={cfg.color} R={ctx.R} ghost={ctx.ghost} />
    case 'skin':
      return ctx.ghost ? null : <SkinPatch at={cfg.at} size={cfg.size} color={cfg.color} opacity={cfg.opacity} R={ctx.R} />
    case 'sunglasses-rect':
      return <SunglassesRect R={ctx.R} ghost={ctx.ghost} top={cfg.top} bottom={cfg.bottom} inner={cfg.inner} outer={cfg.outer} rim={cfg.rim} bend={cfg.bend} />
    case 'headphones':
      return <Headphones R={ctx.R} ghost={ctx.ghost} pitch={cfg.pitch} cupH={cfg.cupH} cupW={cfg.cupW} />
    case 'face-janek':
      return <FaceJanek ctx={ctx} />
    case 'glasses-round':
      return <GlassesRound ctx={ctx} color={cfg.color ?? '#c99a5c'} />
  }
}
