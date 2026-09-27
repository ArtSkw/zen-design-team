import { useMemo } from 'react'
import { BufferGeometry, CatmullRomCurve3, Color, Float32BufferAttribute, Matrix4, MeshPhysicalMaterial, MeshStandardMaterial, Vector3, type Material } from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { taperedTube } from './geometry'
import { ARM_R, BAND_R, CUSH_T, MIN_CUSH, SHELL_T, airpodsShape, type AirpodsShapeOpts } from './airpods-shape'
import { ghostOf, metal } from './materials'

// Magda J's AirPods Max (docs/cast/magda-j.png): two tall rounded-rectangle cups — a satin
// pink metal shell outside, a plump orange cushion against the head — on steel arms that
// rise from each cup's top into an orange canopy band arching over the hair. Head frame,
// R units (scaled by the caller's R). The right cup is built and the left one mirrors it.
// The cups sit on the bare sides of the head, in front of the hair (the design shows the
// curls tucked behind them), turned a little toward the side so they read nearly edge-on
// from the front, as drawn; the cushion's inner face is bent to the head so it meets it
// all round.

const noRaycast = () => null
/** The right-hand piece and its mirror image (the left), as one geometry: one draw call. */
function withMirror(g: BufferGeometry) {
  const m = g.clone().applyMatrix4(new Matrix4().makeScale(-1, 1, 1))
  const idx = m.index!
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i + 1)
    idx.setX(i + 1, idx.getX(i + 2))
    idx.setX(i + 2, a)
  }
  return mergeGeometries([g, m])
}

/**
 * A pillow: a superellipse outline (half-sizes `a` × `b`, exponent 4: a rounded rectangle)
 * as a closed, finely gridded surface from its inner face (z = 0) round a rounded edge of
 * radius `e` to its outer face (z = t), which may dome out by `dome`. Local x across, y up,
 * z out. Gridded all over, so it can be pressed onto a curved head without creasing.
 */
function pillow(a: number, b: number, t: number, e: number, dome = 0) {
  const N = 4
  const cols = 72
  // the profile, from the inner face's middle to the outer's: [scale, inset, z] — across the
  // flat faces the outline (inset by e) shrinks to a point; round the edge it is inset by d
  const prof: [number, number, number][] = []
  const F = 8
  for (let i = 0; i < F; i++) prof.push([Math.sin((Math.PI / 2) * (i / F)), e, 0])
  const RND = 12
  const side = Math.max(0, t - 2 * e)
  for (let i = 0; i <= RND; i++) {
    const al = (Math.PI / 2) * (i / RND)
    prof.push([1, e - e * Math.sin(al), e - e * Math.cos(al)])
  }
  if (side > 0) prof.push([1, 0, e + side * 0.5])
  for (let i = 0; i <= RND; i++) {
    const al = Math.PI / 2 + (Math.PI / 2) * (i / RND)
    prof.push([1, e - e * Math.sin(al), e + side - e * Math.cos(al)])
  }
  for (let i = F - 1; i >= 0; i--) prof.push([Math.sin((Math.PI / 2) * (i / F)), e, t])
  const pos: number[] = []
  const idx: number[] = []
  for (const [k, d, z] of prof) {
    const ak = Math.max(1e-5, (a - d) * k)
    const bk = Math.max(1e-5, (b - d) * k)
    const zz = z >= t - 1e-9 ? z + dome * (1 - k * k) : z
    for (let j = 0; j <= cols; j++) {
      const th = (j / cols) * Math.PI * 2
      const c = Math.cos(th)
      const s = Math.sin(th)
      pos.push(ak * Math.sign(c) * Math.pow(Math.abs(c), 2 / N), bk * Math.sign(s) * Math.pow(Math.abs(s), 2 / N), zz)
    }
  }
  for (let i = 0; i < prof.length - 1; i++)
    for (let j = 0; j < cols; j++) {
      const p0 = i * (cols + 1) + j
      const p1 = p0 + cols + 1
      idx.push(p0, p0 + 1, p1, p0 + 1, p1 + 1, p1) // faces outward (the other winding turned the cups inside out: see-through)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  return mergeVertices(g, 1e-6) // one surface: no shading seam where the rings close
}

export type AirpodsOpts = AirpodsShapeOpts & {
  shell?: string
  cushion?: string
  band?: string
  steel?: string
}

/** The AirPods' geometry (head frame, R = 1): both cushions, both shells, the steel, the band. */
export function airpodsGeometry(opts: AirpodsShapeOpts = {}) {
  const { yaw, pitch, turn, tilt, cupH, cupW, top, back } = opts
  // where everything sits (airpods-shape.ts, shared with the hair worn under them)
  const S = airpodsShape({ yaw, pitch, turn, tilt, cupH, cupW, top, back })
  const { n, up, fwd, O, cupTop } = S
  const cushT = CUSH_T
  const shellT = SHELL_T
  const MIN = MIN_CUSH
  const frame = new Matrix4().makeBasis(fwd, up, n).setPosition(O) // local x = along, y = up, z = out
  // the cushion, pressed onto the head: along each line through it (parallel to n) its
  // depth is remapped from [0, cushT] to [head, cushT] — squeezed where the head comes
  // closer, let down where it falls away (a little) — so it meets the head all round
  // without folding
  const HEAD = 1.006
  const cush = pillow(S.cupW / 2 - 0.01, S.cupH / 2 - 0.01, cushT, 0.055)
  const p = cush.attributes.position
  const q = new Vector3()
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    q.copy(O).addScaledVector(fwd, x).addScaledVector(up, y)
    const bq = n.dot(q)
    const disc = bq * bq - (q.lengthSq() - HEAD * HEAD)
    const zh = disc > 0 ? Math.max(-0.08, Math.min(cushT - MIN, -bq + Math.sqrt(disc))) : -0.08
    p.setZ(i, zh + (z * (cushT - zh)) / cushT)
  }
  cush.applyMatrix4(frame)
  cush.computeVertexNormals()
  const shellG = pillow(S.cupW / 2, S.cupH / 2, shellT, 0.05, 0.02).translate(0, 0, cushT + 0.006).applyMatrix4(frame)
  shellG.computeVertexNormals()
  // the steel arm and its hinge on the cup's top
  const arm = taperedTube(new CatmullRomCurve3(S.arm), ARM_R, ARM_R, 24, 10)
  const hinge = taperedTube(new CatmullRomCurve3([cupTop.clone().addScaledVector(fwd, -0.05).addScaledVector(up, -0.005), cupTop.clone().addScaledVector(up, 0.005), cupTop.clone().addScaledVector(fwd, 0.05).addScaledVector(up, -0.005)]), 0.022, 0.022, 12, 10)
  // the band: an arch through both ends and over the crown
  const pts = S.band
  const bandG = taperedTube(new CatmullRomCurve3(pts, false, 'centripetal'), BAND_R, BAND_R, 120, 18, (t) => BAND_R * Math.sqrt(Math.max(0.15, 1 - Math.pow(Math.abs(2 * t - 1), 40))), [0.6, 1], true)
  const steel = mergeGeometries([arm, hinge])
  return { cush: withMirror(cush), shellG: withMirror(shellG), steel: withMirror(steel), bandG }
}

export function AirpodsMax({ R, ghost, yaw, pitch, turn, tilt, cupH, cupW, top, back, shell = '#f2bfae', cushion = '#ee6545', band = '#ef6044', steel = '#d9d7d5' }: { R: number; ghost: boolean } & AirpodsOpts) {
  const g = useMemo(() => airpodsGeometry({ yaw, pitch, turn, tilt, cupH, cupW, top, back }), [yaw, pitch, turn, tilt, cupH, cupW, top, back])
  const mats = useMemo(
    () => ({
      shell: new MeshPhysicalMaterial({ color: new Color(shell), metalness: 0, roughness: 0.5, clearcoat: 0.45, clearcoatRoughness: 0.18, sheen: 0.3, sheenColor: new Color('#fff0ea') }),
      cushion: new MeshStandardMaterial({ color: new Color(cushion), roughness: 0.88 }),
      band: new MeshPhysicalMaterial({ color: new Color(band), roughness: 0.62, sheen: 0.4, sheenColor: new Color('#ffb59c') }),
      steel: metal(steel, 0.2),
    }),
    [shell, cushion, band, steel],
  )
  const mm = (mat: Material) => (ghost ? ghostOf(mat) : mat)
  const rc = ghost ? noRaycast : undefined
  // four draw calls: both cushions, both shells, the steel, the band
  return (
    <group scale={R}>
      <mesh geometry={g.cush} material={mm(mats.cushion)} raycast={rc} castShadow />
      <mesh geometry={g.shellG} material={mm(mats.shell)} raycast={rc} castShadow />
      <mesh geometry={g.steel} material={mm(mats.steel)} raycast={noRaycast} castShadow />
      <mesh geometry={g.bandG} material={mm(mats.band)} raycast={rc} castShadow />
    </group>
  )
}
