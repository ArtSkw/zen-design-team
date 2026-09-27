import { useMemo } from 'react'
import { CatmullRomCurve3, CylinderGeometry, Quaternion, Shape, SphereGeometry, TorusGeometry, Vector3, type BufferGeometry, type Material } from 'three'
import type { faceOf } from './proportions'
import { between, normalQuat, onSphere, smoothExtrude, taperedTube } from './geometry'
import { ghostOf, matte, metal } from './materials'
import { mulberry32, range } from '../lib/rng'
import { clay, type ClayOpts } from './clay'
import { useSculpt } from './sculptAsset'
import { Buttons, Headphones, SkinPatch, Stubble, SunglassesRect, type StubbleRegion } from './kit'
import { plaid } from './plaid'
import { Cap } from './cap'
import { Beanie } from './beanie'
import { AirpodsMax, type AirpodsOpts } from './airpods'
import { JacketTrim } from './jacket'
import { fleece, leather } from './leather'
import { kerchief } from './kerchief'
import { Bangles, CrystalBall } from './trinkets'

// One bespoke reconstruction per approved design (docs/cast/*.png).
export type PartConfig =
  | { type: 'face-janek' }
  | { type: 'glasses-round'; color?: string }
  // a baked sculpt (src/zenek/sculpts/, public/sculpts/<name>.bin), worn in the head frame;
  // `shrink` draws it in over the body toward a point (shrinkOnBody), `slim` makes it less
  // thick where it rests (slimmer)
  | { type: 'sculpt'; name: string; color: string; clay?: ClayOpts; traits?: Partial<HeadTraits>; shrink?: { by: number; toward: [number, number, number] }; slim?: { y: number; out: number } }
  // the kit (src/zenek/kit.tsx), head frame
  | { type: 'stubble'; color: string; regions: StubbleRegion[]; roughness?: number }
  | { type: 'skin'; at: [number, number]; size: [number, number]; color: string; opacity: number }
  | { type: 'sunglasses-rect'; top: number; bottom: number; inner: number; outer: number; rim: number; bend?: number }
  | { type: 'headphones'; pitch?: number; cupH?: number; cupW?: number }
  // a six-panel cap worn backwards (src/zenek/cap.tsx), head frame
  | { type: 'cap'; color: string; under?: string }
  // a ribbed fisherman beanie with a folded cuff (src/zenek/beanie.tsx), head frame
  | { type: 'beanie'; color: string }
  // AirPods Max: rounded cups on steel arms, a canopy band over the hair (src/zenek/airpods.tsx), head frame
  | ({ type: 'airpods' } & AirpodsOpts)
  // a garment: a baked sculpt in the tartan (src/zenek/plaid.ts), head frame
  | { type: 'shirt'; name: string; axis?: 'body' | 'collar'; shade?: number }
  | { type: 'buttons'; at: [number, number][]; lift: number; color?: string }
  // a garment sculpt in leather or shearling (src/zenek/leather.ts), head frame
  | { type: 'garment'; name: string; look: 'leather' | 'fleece'; color: string }
  // Mirek's jacket trim: zip, snaps, patches (src/zenek/jacket.tsx), head frame
  | { type: 'jacket-trim' }
  // Edyta's kerchief: a sculpt in printed cotton (src/zenek/kerchief.ts), head frame
  | { type: 'kerchief'; name: string; color: string; gold: string }
  // Edyta's trinkets (src/zenek/trinkets.tsx), in a paw's frame ('l' = the left hand group, the viewer's left)
  | { type: 'bangles'; hand: 'l' | 'r' }
  | { type: 'crystal-ball'; hand: 'l' | 'r' }

// Face parts live in the plate frame (arc coords around the plate centre);
// head parts live in the head frame (yaw/pitch on the body sphere, or the frontal plane).
export const isFacePart = (p: PartConfig) => p.type === 'face-janek' || p.type === 'glasses-round'
/** Parts worn or held in a paw: rendered in that hand's group, so they follow its gestures. */
export const handOf = (p: PartConfig): 'l' | 'r' | null => (p.type === 'bangles' || p.type === 'crystal-ball' ? p.hand : null)

export type PartCtx = { R: number; face: ReturnType<typeof faceOf>; ghost: boolean }

/**
 * Where a character's parts sit around the head, so the hands keep out of them:
 * `crown` — hair or a hat on top (no head scratching, a lower wave); `longSides` —
 * hair hanging beside the body (hands rest and gesture in front of it); `front` —
 * something in front of the body (a full beard); `bulky` — sculpted arms (they wave out to the side,
 * never across the face); `cups` — headphone cups forward on the sides of the head, reaching
 * down near the hands (the wave comes lower and further forward, the stretch lifts less);
 * `collar` — a thick collar with lapels over the shoulders (the wave rises beside the body);
 * `sideWave` — the same wave beside the body, for hair and trinkets framing the face;
 * `holds` — a paw holding something (a crystal ball): it moves gently in gestures, never waves it about;
 * `rigidPaws` — the paws turn and tilt with the body exactly (not a beat behind), so long hair
 * just behind them never swings into them.
 */
export type HeadTraits = { crown: boolean; longSides: boolean; front: boolean; waveSide?: 1 | -1; bulky?: boolean; cups?: boolean; collar?: boolean; sideWave?: boolean; holds?: 'l' | 'r'; rigidPaws?: boolean }
export function headTraits(parts: PartConfig[]): HeadTraits {
  const t: HeadTraits = { crown: false, longSides: false, front: false }
  for (const p of parts) {
    if (p.type === 'sculpt') Object.assign(t, p.traits)
    if (p.type === 'headphones' || p.type === 'cap' || p.type === 'beanie' || p.type === 'airpods') t.crown = true
    if (p.type === 'airpods') t.cups = true
    if (p.type === 'garment' && p.look === 'fleece') t.collar = true // a shearling collar
    if (p.type === 'kerchief') t.crown = true
    if (p.type === 'crystal-ball') t.holds = p.hand
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
const shrunk = new Map<string, BufferGeometry>()

/**
 * A sculpt made smaller as it is worn: each point turned toward `toward` over the body
 * (its angle from it × `by`), its distance from the body's centre kept — so it covers less
 * of the sphere and still sits on it, its thickness and lumps as sculpted, where a plain
 * scale would sink its sides into the body or lift them off. Lock directions turn with it.
 */
function shrinkOnBody(src: BufferGeometry, by: number, toward: [number, number, number]) {
  const g = src.clone()
  const c = new Vector3(...toward).normalize()
  const pos = g.getAttribute('position')
  const dir = g.getAttribute('dir')
  const p = new Vector3()
  const axis = new Vector3()
  const d = new Vector3()
  const q = new Quaternion()
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i)
    const r = p.length()
    const angle = Math.acos(Math.min(1, Math.max(-1, p.dot(c) / r)))
    if (angle < 1e-6) continue
    axis.crossVectors(c, p).normalize()
    q.setFromAxisAngle(axis, (by - 1) * angle) // back toward c by (1 − by) of the way
    p.applyQuaternion(q)
    pos.setXYZ(i, p.x, p.y, p.z)
    if (dir) {
      d.fromBufferAttribute(dir, i).applyQuaternion(q)
      dir.setXYZ(i, d.x, d.y, d.z)
    }
  }
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

/**
 * A sculpt made less thick where it rests (a moustache on the face): its height squeezed by
 * `y` about its middle, and how far it stands off the body by `out` — measured from its own
 * base (its innermost points), which stays where it rests, so it neither floats nor sinks.
 */
function slimmer(src: BufferGeometry, y: number, out: number) {
  const g = src.clone()
  const pos = g.getAttribute('position')
  const p = new Vector3()
  let mid = 0
  const radii: number[] = []
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i)
    mid += p.y
    radii.push(p.length())
  }
  mid /= pos.count
  const base = radii.sort((a, b) => a - b)[Math.floor(radii.length * 0.02)]
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i)
    p.y = mid + (p.y - mid) * y
    const r = p.length()
    if (r > base) p.multiplyScalar((base + (r - base) * out) / r)
    pos.setXYZ(i, p.x, p.y, p.z)
  }
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

function SculptPart({ cfg, ctx }: { cfg: Extract<PartConfig, { type: 'sculpt' }>; ctx: PartCtx }) {
  const baked = useSculpt(cfg.name)
  const { shrink: s, slim } = cfg
  const g = useMemo(() => {
    if (!baked || (!s && !slim)) return baked
    const key = `${cfg.name}|${s?.by}|${s?.toward}|${slim?.y}|${slim?.out}`
    let out = shrunk.get(key)
    if (!out) {
      out = s ? shrinkOnBody(baked, s.by, s.toward) : baked
      if (slim) out = slimmer(out, slim.y, slim.out)
      shrunk.set(key, out)
    }
    return out
  }, [baked, s, slim, cfg.name])
  const mat = clay(cfg.color, cfg.clay)
  if (!g) return null
  return <mesh geometry={g} material={m(mat, ctx.ghost)} scale={ctx.R} raycast={ctx.ghost ? noRaycast : undefined} castShadow />
}

function GarmentPart({ cfg, ctx }: { cfg: Extract<PartConfig, { type: 'garment' }>; ctx: PartCtx }) {
  const g = useSculpt(cfg.name)
  if (!g) return null
  const mat = cfg.look === 'leather' ? leather(cfg.color) : fleece(cfg.color)
  return <mesh geometry={g} material={m(mat, ctx.ghost)} scale={ctx.R} raycast={ctx.ghost ? noRaycast : undefined} castShadow receiveShadow />
}

function KerchiefPart({ cfg, ctx }: { cfg: Extract<PartConfig, { type: 'kerchief' }>; ctx: PartCtx }) {
  const g = useSculpt(cfg.name)
  if (!g) return null
  return <mesh geometry={g} material={m(kerchief(cfg.color, cfg.gold), ctx.ghost)} scale={ctx.R} raycast={ctx.ghost ? noRaycast : undefined} castShadow receiveShadow />
}

function ShirtPart({ name, axis = 'body', shade, ctx }: { name: string; axis?: 'body' | 'collar'; shade?: number; ctx: PartCtx }) {
  const g = useSculpt(name)
  if (!g) return null
  return <mesh geometry={g} material={m(plaid({ axis, shade }), ctx.ghost)} scale={ctx.R} raycast={ctx.ghost ? noRaycast : undefined} castShadow receiveShadow />
}

export function Part({ cfg, ctx }: { cfg: PartConfig; ctx: PartCtx }) {
  switch (cfg.type) {
    case 'garment':
      return <GarmentPart cfg={cfg} ctx={ctx} />
    case 'jacket-trim':
      return <JacketTrim R={ctx.R} ghost={ctx.ghost} />
    case 'kerchief':
      return <KerchiefPart cfg={cfg} ctx={ctx} />
    case 'bangles':
      return <Bangles R={ctx.R} ghost={ctx.ghost} mirror={cfg.hand === 'r'} />
    case 'crystal-ball':
      return <CrystalBall R={ctx.R} ghost={ctx.ghost} mirror={cfg.hand === 'l'} />
    case 'shirt':
      return <ShirtPart name={cfg.name} axis={cfg.axis} shade={cfg.shade} ctx={ctx} />
    case 'buttons':
      return <Buttons R={ctx.R} ghost={ctx.ghost} at={cfg.at} lift={cfg.lift} color={cfg.color} />
    case 'sculpt':
      return <SculptPart cfg={cfg} ctx={ctx} />
    case 'stubble':
      return <Stubble regions={cfg.regions} color={cfg.color} R={ctx.R} ghost={ctx.ghost} roughness={cfg.roughness} />
    case 'skin':
      return ctx.ghost ? null : <SkinPatch at={cfg.at} size={cfg.size} color={cfg.color} opacity={cfg.opacity} R={ctx.R} />
    case 'sunglasses-rect':
      return <SunglassesRect R={ctx.R} ghost={ctx.ghost} top={cfg.top} bottom={cfg.bottom} inner={cfg.inner} outer={cfg.outer} rim={cfg.rim} bend={cfg.bend} />
    case 'headphones':
      return <Headphones R={ctx.R} ghost={ctx.ghost} pitch={cfg.pitch} cupH={cfg.cupH} cupW={cfg.cupW} />
    case 'cap':
      return <Cap R={ctx.R} ghost={ctx.ghost} color={cfg.color} under={cfg.under} />
    case 'beanie':
      return <Beanie R={ctx.R} ghost={ctx.ghost} color={cfg.color} />
    case 'airpods': {
      const { type: _t, ...opts } = cfg
      return <AirpodsMax R={ctx.R} ghost={ctx.ghost} {...opts} />
    }
    case 'face-janek':
      return <FaceJanek ctx={ctx} />
    case 'glasses-round':
      return <GlassesRound ctx={ctx} color={cfg.color ?? '#c99a5c'} />
  }
}
