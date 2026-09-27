import { useMemo } from 'react'
import { BufferGeometry, CanvasTexture, Color, ExtrudeGeometry, Float32BufferAttribute, LatheGeometry, Matrix4, MeshStandardMaterial, Quaternion, SRGBColorSpace, Shape, SphereGeometry, Vector2, Vector3, type Material } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js'
import { ghostOf, metal } from './materials'
import { FLAP_T, HEM, LEATHER, PATCH_L, PATCH_R, SNAP, V_TIP, ZIP_TOP } from './jacket-layout'

// The trim on Mirek's flight jacket (the leather, the collar and the pocket flaps are baked
// sculpts: sculpts/mirek.ts), built to the same layout (jacket-layout.ts): a brass zip — its
// teeth up both open front edges to the lapel tips and interlocked down the middle to the hem,
// on a dark tape, the slider and its pull at the top of the closed part — the brass snaps on
// the pocket flaps, and two chest patches, simplified from the design: the carrier roundel and
// the jet shield, embroidered badges with a raised gold edge. Head frame, R units. Three draw
// calls: brass, tape, patches (one canvas for both).

const D = Math.PI / 180
const noRaycast = () => null
const dir = (yaw: number, pitch: number) => new Vector3(Math.cos(pitch * D) * Math.sin(yaw * D), Math.sin(pitch * D), Math.cos(pitch * D) * Math.cos(yaw * D))
const Y = new Vector3(0, 1, 0)

/** A frame on the head at (yaw, pitch): east (+yaw), north (+pitch), out. */
function frameAt(yaw: number, pitch: number) {
  const n = dir(yaw, pitch)
  const e = new Vector3(Math.cos(yaw * D), 0, -Math.sin(yaw * D))
  const nn = new Vector3().crossVectors(n, e).normalize()
  return { n, e, north: nn }
}
/** A point on the head at (yaw, pitch) offset by (du, dv) R along east/north, lifted to radius r. */
function onHead(yaw: number, pitch: number, du: number, dv: number, r: number) {
  const { n, e, north } = frameAt(yaw, pitch)
  return n.clone().addScaledVector(e, du).addScaledVector(north, dv).normalize().multiplyScalar(r)
}

// ---- the zip -------------------------------------------------------------------------------------
/** The zip's lines in (yaw, pitch): each open front edge from its lapel tip to the zip's top, then the closed part down the middle. */
function edgeLine(s: 1 | -1, t: number): [number, number] {
  // a gentle curve, bowing out a little
  const bow = 2.2 * Math.sin(Math.PI * t)
  return [s * (V_TIP[0] * (1 - t) + bow * 0.6), V_TIP[1] + (ZIP_TOP - V_TIP[1]) * t - bow * 0.3]
}

function zipGeometry() {
  const brass: BufferGeometry[] = []
  const tape: BufferGeometry[] = []
  const tooth = new SphereGeometry(1, 8, 6)
  const m = new Matrix4()
  const q = new Quaternion()
  const put = (g: BufferGeometry, into: BufferGeometry[], pos: Vector3, along: Vector3, out: Vector3, size: [number, number, number]) => {
    const side = new Vector3().crossVectors(out, along).normalize()
    const a = new Vector3().crossVectors(side, out).normalize()
    m.makeBasis(side, a, out)
    q.setFromRotationMatrix(m)
    into.push(g.clone().applyMatrix4(new Matrix4().compose(pos, q, new Vector3(...size))))
  }
  const R0 = LEATHER + 0.004
  // sample a line in (yaw, pitch) by arc length
  const walk = (at: (t: number) => [number, number], step: number, each: (p: Vector3, along: Vector3, i: number) => void) => {
    const pts: Vector3[] = []
    for (let k = 0; k <= 200; k++) {
      const [yw, p] = at(k / 200)
      pts.push(dir(yw, p))
    }
    let acc = 0
    let next = 0
    let i = 0
    for (let k = 1; k < pts.length; k++) {
      const seg = pts[k].distanceTo(pts[k - 1])
      while (next <= acc + seg) {
        const t = (next - acc) / seg
        const p = pts[k - 1].clone().lerp(pts[k], t)
        each(p.normalize(), pts[k].clone().sub(pts[k - 1]).normalize(), i++)
        next += step
      }
      acc += seg
    }
  }
  const STEP = 0.018
  // the open front edges: teeth along each, on a strip of tape
  for (const s of [-1, 1] as const) {
    walk((t) => edgeLine(s, t), STEP, (p, along) => {
      put(tooth, brass, p.clone().multiplyScalar(R0 + 0.004), along, p, [0.012, 0.0072, 0.006])
      put(tooth, tape, p.clone().multiplyScalar(R0 - 0.002), along, p, [0.022, 0.011, 0.003])
    })
  }
  // the closed part, down the middle: teeth from either side, interlocked
  walk((t) => [0, ZIP_TOP - 3 - (ZIP_TOP - 3 - (HEM + 3)) * t], STEP * 0.5, (p, along, i) => {
    const side = new Vector3().crossVectors(p, along).normalize()
    const off = (i % 2 ? 1 : -1) * 0.0055
    put(tooth, brass, p.clone().multiplyScalar(R0 + 0.004).addScaledVector(side, off), along, p, [0.012, 0.0058, 0.006])
    put(tooth, tape, p.clone().multiplyScalar(R0 - 0.002), along, p, [0.034, 0.011, 0.003])
  })
  // the slider at the top of the closed part, and its pull hanging from it
  const { n, north } = frameAt(0, ZIP_TOP - 2.5)
  const sp = n.clone().multiplyScalar(R0 + 0.012)
  put(new SphereGeometry(1, 16, 12), brass, sp, north.clone().negate(), n, [0.03, 0.042, 0.014])
  const pull = new Shape()
  const w = 0.026
  const h = 0.1
  pull.moveTo(-w * 0.55, 0)
  pull.lineTo(w * 0.55, 0)
  pull.quadraticCurveTo(w, -h * 0.2, w, -h * 0.55)
  pull.quadraticCurveTo(w, -h, 0, -h)
  pull.quadraticCurveTo(-w, -h, -w, -h * 0.55)
  pull.quadraticCurveTo(-w, -h * 0.2, -w * 0.55, 0)
  const hole = new Shape()
  hole.absarc(0, -h * 0.66, w * 0.42, 0, Math.PI * 2, true)
  pull.holes.push(hole)
  const pg = new ExtrudeGeometry(pull, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 3, curveSegments: 16 })
  // hang it from the slider, lying against the leather
  const east = new Vector3().crossVectors(north, n).normalize()
  pg.applyMatrix4(new Matrix4().makeBasis(east, north, n).setPosition(sp.clone().addScaledVector(n, -0.006).addScaledVector(north, -0.018)))
  brass.push(pg)
  // the snaps on the pocket flaps
  const snap = new LatheGeometry(
    [new Vector2(0.0001, 0.016), new Vector2(0.012, 0.015), new Vector2(0.022, 0.011), new Vector2(0.028, 0.006), new Vector2(0.03, 0.002), new Vector2(0.029, 0), new Vector2(0.0001, 0)].reverse(),
    28,
  )
  for (const s of [-1, 1]) {
    const nn = dir(s * SNAP[0], SNAP[1])
    brass.push(snap.clone().applyMatrix4(new Matrix4().compose(nn.clone().multiplyScalar(LEATHER + FLAP_T - 0.002), new Quaternion().setFromUnitVectors(Y, nn), new Vector3(1, 1, 1))))
  }
  // one geometry per material: positions and normals only (the pieces' uvs differ in kind)
  const strip = (gs: BufferGeometry[]) =>
    mergeGeometries(
      gs.map((g) => {
        const f = g.index ? g.toNonIndexed() : g
        f.deleteAttribute('uv')
        return f
      }),
    )
  return { brass: strip(brass), tape: strip(tape) }
}

// ---- the patches -----------------------------------------------------------------------------------
/** Both badges drawn on one canvas: the carrier roundel on the left half, the jet shield on the right. */
function patchCanvas() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d')!
  const GOLD = '#e7b43c'
  const NAVY = '#243560'
  // the roundel
  g.save()
  g.translate(128, 128)
  g.fillStyle = GOLD
  g.beginPath()
  g.arc(0, 0, 124, 0, Math.PI * 2)
  g.fill()
  g.save()
  g.beginPath()
  g.arc(0, 0, 104, 0, Math.PI * 2)
  g.clip()
  g.fillStyle = '#a8d6ee'
  g.fillRect(-128, -128, 256, 256)
  // the ship: a hull with a flight deck, the island and its mast
  g.fillStyle = '#cfd6dc'
  g.beginPath()
  g.moveTo(-86, 6)
  g.lineTo(78, 6)
  g.lineTo(64, 30)
  g.lineTo(-70, 30)
  g.closePath()
  g.fill()
  g.fillStyle = NAVY
  g.fillRect(-86, 2, 164, 8)
  g.fillRect(10, -30, 26, 32)
  g.fillRect(20, -58, 5, 30)
  g.fillRect(12, -44, 22, 4)
  // the sea: blue with white crests
  g.fillStyle = '#2f76c2'
  g.beginPath()
  g.moveTo(-128, 40)
  for (let x = -128; x <= 128; x += 4) g.lineTo(x, 34 + 8 * Math.sin(x / 14))
  g.lineTo(128, 128)
  g.lineTo(-128, 128)
  g.closePath()
  g.fill()
  g.strokeStyle = '#ffffff'
  g.lineWidth = 9
  g.lineCap = 'round'
  for (const [y0, ph] of [[46, 0], [74, 2], [100, 4]]) {
    g.beginPath()
    for (let x = -120; x <= 120; x += 4) {
      const y = y0 + 7 * Math.sin((x + ph * 9) / 16)
      if (x === -120) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.stroke()
  }
  g.restore()
  g.restore()
  // the shield
  g.save()
  g.translate(384, 128)
  const shield = (k: number) => {
    g.beginPath()
    g.moveTo(-118 * k, -118 * k)
    g.lineTo(118 * k, -118 * k)
    g.lineTo(118 * k, 30 * k)
    g.quadraticCurveTo(110 * k, 80 * k, 0, 122 * k)
    g.quadraticCurveTo(-110 * k, 80 * k, -118 * k, 30 * k)
    g.closePath()
  }
  g.fillStyle = GOLD
  shield(1)
  g.fill()
  g.save()
  shield(0.84)
  g.clip()
  g.fillStyle = '#d7322c'
  g.fillRect(-128, -128, 256, 256)
  // a navy chevron rising to the middle, white stars on it
  g.fillStyle = NAVY
  g.beginPath()
  g.moveTo(-128, 60)
  g.lineTo(0, -34)
  g.lineTo(128, 60)
  g.lineTo(128, 128)
  g.lineTo(-128, 128)
  g.closePath()
  g.fill()
  const star = (x: number, y: number, r: number) => {
    g.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const rr = i % 2 ? r * 0.45 : r
      g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a))
    }
    g.closePath()
    g.fill()
  }
  g.fillStyle = '#ffffff'
  star(-58, 50, 17)
  star(58, 50, 17)
  // the jet, nose up
  g.fillStyle = '#f0dcb4'
  g.beginPath()
  g.moveTo(0, -92)
  g.quadraticCurveTo(10, -70, 10, -30)
  g.lineTo(48, 14)
  g.lineTo(48, 28)
  g.lineTo(10, 14)
  g.lineTo(10, 52)
  g.lineTo(26, 70)
  g.lineTo(26, 80)
  g.lineTo(0, 72)
  g.lineTo(-26, 80)
  g.lineTo(-26, 70)
  g.lineTo(-10, 52)
  g.lineTo(-10, 14)
  g.lineTo(-48, 28)
  g.lineTo(-48, 14)
  g.lineTo(-10, -30)
  g.quadraticCurveTo(-10, -70, 0, -92)
  g.fill()
  g.restore()
  g.restore()
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** A badge: the outline extruded thin with a rounded edge, laid on the jacket at (yaw, pitch), its uv on its half of the canvas. */
function badge(shape: Shape, size: number, yaw: number, pitch: number, u0: number) {
  // tessellated: a flat face spanning the badge would sink under the leather in the middle (the body curves away under it)
  const flat = new ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.005, bevelSegments: 3, curveSegments: 40 })
  const g = new TessellateModifier(0.015, 8).modify(flat.index ? flat.toNonIndexed() : flat)
  const p = g.attributes.position
  const uv: number[] = []
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    uv.push(u0 + 0.5 * (x / size + 0.5), 0.5 + y / size) // the canvas is flipped on upload (flipY), so v runs up with the shape's y
    // bend onto the head: the shape's plane → the surface round (yaw, pitch)
    const q = onHead(yaw, pitch, x, y, LEATHER + 0.004 + p.getZ(i))
    p.setXYZ(i, q.x, q.y, q.z)
  }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

function patchGeometry() {
  const r = PATCH_L.size / 2
  const circle = new Shape()
  circle.absarc(0, 0, r, 0, Math.PI * 2, false)
  const k = PATCH_R.size / 2 / 118 // the canvas shield's units → R
  const shield = new Shape()
  shield.moveTo(-118 * k, 118 * k)
  shield.lineTo(-118 * k, -30 * k)
  shield.quadraticCurveTo(-110 * k, -80 * k, 0, -122 * k)
  shield.quadraticCurveTo(110 * k, -80 * k, 118 * k, -30 * k)
  shield.lineTo(118 * k, 118 * k)
  shield.closePath()
  return mergeGeometries([badge(circle, PATCH_L.size, PATCH_L.yaw, PATCH_L.pitch, 0), badge(shield, PATCH_R.size, PATCH_R.yaw, PATCH_R.pitch, 0.5)])
}

export function JacketTrim({ R, ghost, brass = '#c29a5a', tape = '#241713' }: { R: number; ghost: boolean; brass?: string; tape?: string }) {
  const g = useMemo(() => ({ ...zipGeometry(), patches: patchGeometry() }), [])
  const mats = useMemo(
    () => ({
      brass: metal(brass, 0.32),
      tape: new MeshStandardMaterial({ color: new Color(tape), roughness: 0.85 }),
      patches: new MeshStandardMaterial({ map: patchCanvas(), roughness: 0.78 }),
    }),
    [brass, tape],
  )
  const mm = (m: Material) => (ghost ? ghostOf(m) : m)
  return (
    <group scale={R}>
      <mesh geometry={g.brass} material={mm(mats.brass)} raycast={noRaycast} castShadow />
      <mesh geometry={g.tape} material={mm(mats.tape)} raycast={noRaycast} />
      <mesh geometry={g.patches} material={mm(mats.patches)} raycast={noRaycast} castShadow />
    </group>
  )
}
