import { useMemo } from 'react'
import { BufferGeometry, CatmullRomCurve3, CircleGeometry, Color, Float32BufferAttribute, Matrix4, Quaternion, SphereGeometry, TorusGeometry, TubeGeometry, Vector3, type Material } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { FAR, fabric } from './fabric'
import { ghostOf, matte, metal } from './materials'

// Łukasz D's cap (docs/cast/lukasz-d.png, body circle (625, 702) px, R 413; the photo
// Artur sent of the cap from behind, docs/cast/lukasz-d-cap-ref.png): an ordinary
// six-panel cotton cap worn backwards. The viewer sees the cap's back: the arch cut into
// the two back panels, the adjustable strap across it with a metal slider, an eyelet on
// each panel, the button on top. The brim sticks out behind the head. Built in the head
// frame (R = 1) over the head's own yaw and pitch, so yaw 0 (the face) is the cap's back;
// `u` runs up the crown from the lower edge (0) to the button (1).

const D = Math.PI / 180
const dir = (yaw: number, pitch: number, r: number, out = new Vector3()) =>
  out.set(r * Math.cos(pitch * D) * Math.sin(yaw * D), r * Math.sin(pitch * D), r * Math.cos(pitch * D) * Math.cos(yaw * D))
const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180
const smooth = (t: number) => t * t * (3 - 2 * t)
const noRaycast = () => null

// The lower edge's pitch by yaw, fitted to the design: high on the forehead where the
// cap's back sits (34.5° at the arch), 19° at the sides, lowest at the nape under the
// brim. The cap sits pushed back, as a backwards cap does. A smooth curve (a band on a
// tilted plane, near enough): keyed interpolation left the edge wavy.
const rim = (yaw: number) => 19.4 + 14.5 * Math.cos(yaw * D) + 0.6 * Math.cos(2 * yaw * D)
// Seams: the back panels are the widest (the arch is cut into them), then the sides,
// then the two front panels under the brim. 180 is the front seam.
const SEAMS = [0, 82, 131, 180, 229, 278]
const EYELETS = [43, 106.5, 155.5, -155.5, -106.5, -43]
// The arch: straight sides at ±28° up to uS, a round top at uA (the design: 0.37 R
// either side at the edge, rising to 0.95 R on the face).
const ARCH = { half: 28, uS: 0.215, uA: 0.345 }
const archTop = (yaw: number) => {
  const k = Math.abs(yaw) / ARCH.half
  return k > 1 ? 0 : ARCH.uS + (ARCH.uA - ARCH.uS) * Math.sqrt(1 - k * k)
}
// The strap across the arch and the slider on it (the design: 0.59–0.78 R up the face).
const STRAP = { yaw: 30.5, p0: 35.8, p1: 49.2, r: 1.024 }
const SLIDER = { pitch: 42.3, w: 0.152, h: 0.207, corner: 0.03, wire: 0.0115, r: 1.047 }
const BRIM = { span: 60, len: 0.55, droop: 0, sides: 12, back: 0.35, camber: 0.07, th: 0.032 }

/**
 * The crown's radius up from the edge: a band at 1.04 R rising to a flat top at 1.24 R —
 * the design's silhouette (1.30 R) taken a touch smaller at Artur's word (2026-09-25).
 */
function rho(u: number) {
  const t = Math.min(1, u / 0.76)
  return 1.04 + 0.2 * 0.5 * (smooth(t) + Math.sin((Math.PI / 2) * t))
}
/** Degrees to the nearest seam, signed. */
function seamOff(yaw: number) {
  let best = 999
  for (const s of SEAMS) {
    const d = wrap(yaw - s)
    if (Math.abs(d) < Math.abs(best)) best = d
  }
  return best
}
/** Each panel puffs a little between its seams (the cloth is stitched down at the seams, the band and the button). */
function puff(yaw: number, u: number) {
  const y = (yaw + 360) % 360
  let a = SEAMS[SEAMS.length - 1] - 360
  let b = SEAMS[0]
  for (let i = 0; i < SEAMS.length; i++) {
    const s0 = SEAMS[i]
    const s1 = i + 1 < SEAMS.length ? SEAMS[i + 1] : SEAMS[0] + 360
    if (y >= s0 && y < s1) {
      a = s0
      b = s1
    }
  }
  const w = (y - a) / (b - a)
  const env = smooth(Math.max(0, Math.min(1, (u - 0.06) / 0.3))) * (1 - smooth(Math.max(0, (u - 0.5) / 0.5)))
  return 0.017 * Math.sin(Math.PI * w) * env
}
function crownAt(yaw: number, u: number, out = new Vector3()) {
  const r0 = rim(yaw)
  return dir(yaw, r0 + (90 - r0) * u, rho(u) + puff(yaw, u), out)
}
const _a = new Vector3()
const _b = new Vector3()
function crownNormal(yaw: number, u: number, out = new Vector3()) {
  const p = crownAt(yaw, u, out.clone())
  const dy = crownAt(yaw + 0.4, u, _a).sub(crownAt(yaw - 0.4, u, _b))
  const du = crownAt(yaw, Math.min(1, u + 0.003), _b).sub(crownAt(yaw, Math.max(0, u - 0.003), new Vector3()))
  out.crossVectors(dy, du)
  if (out.lengthSq() < 1e-12) return out.copy(p).normalize()
  out.normalize()
  if (out.dot(p) < 0) out.negate()
  return out
}

/** Sorted samples from a to b, no coarser than `step`, with every `must` value exact (and nothing crowding it). */
function samples(a: number, b: number, must: number[], step: number) {
  const keep = [a, b, ...must.filter((m) => m > a && m < b)]
  const out = [...keep]
  const n = Math.ceil((b - a) / step)
  for (let i = 1; i < n; i++) {
    const v = a + ((b - a) * i) / n
    if (keep.every((k) => Math.abs(k - v) > step * 0.3)) out.push(v)
  }
  return out.sort((x, y) => x - y)
}

/** A polyline with its running length, for distances to (and along) a stitched edge. */
function polyline(pts: Vector3[]) {
  const len = [0]
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + pts[i].distanceTo(pts[i - 1]))
  const ab = new Vector3()
  const ap = new Vector3()
  return {
    pts,
    /** [distance, length along] from p to the nearest point of the line */
    near(p: Vector3): [number, number] {
      let best = Infinity
      let at = 0
      for (let i = 1; i < pts.length; i++) {
        ab.subVectors(pts[i], pts[i - 1])
        ap.subVectors(p, pts[i - 1])
        const t = Math.max(0, Math.min(1, ap.dot(ab) / ab.lengthSq()))
        const d = ap.addScaledVector(ab, -t).length()
        if (d < best) {
          best = d
          at = len[i - 1] + t * (len[i] - len[i - 1])
        }
      }
      return [best, at]
    },
  }
}

/** The arch's edge, from the rim on the left up over the top and down to the rim on the right. */
function archLine() {
  const pts: Vector3[] = []
  for (let i = 0; i <= 8; i++) pts.push(crownAt(-ARCH.half, (ARCH.uS * i) / 8))
  for (let i = 1; i < 36; i++) {
    const yaw = -ARCH.half * Math.cos((Math.PI * i) / 36)
    pts.push(crownAt(yaw, archTop(yaw)))
  }
  for (let i = 8; i >= 0; i--) pts.push(crownAt(ARCH.half, (ARCH.uS * i) / 8))
  return pts
}

type Buffers = { pos: number[]; nrm: number[]; fab: number[]; weave: number[]; col: number[]; idx: number[] }
const buffers = (): Buffers => ({ pos: [], nrm: [], fab: [], weave: [], col: [], idx: [] })
function geometryOf(b: Buffers, normals = true) {
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(b.pos, 3))
  g.setAttribute('fab', new Float32BufferAttribute(b.fab, 4))
  g.setAttribute('weave', new Float32BufferAttribute(b.weave, 2))
  g.setAttribute('color', new Float32BufferAttribute(b.col, 3))
  g.setIndex(b.idx)
  if (normals && b.nrm.length) g.setAttribute('normal', new Float32BufferAttribute(b.nrm, 3))
  else g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}
/** Quads over a grid of `rows` × `cols` vertices laid out row-major from `base`; `flip` turns the winding (front faces face out). */
function grid(idx: number[], base: number, rows: number, cols: number, flip = false) {
  for (let i = 0; i < rows - 1; i++)
    for (let j = 0; j < cols - 1; j++) {
      const a = base + i * cols + j
      const b = a + 1
      const c = a + cols
      const d = c + 1
      if (flip) idx.push(a, c, b, b, c, d)
      else idx.push(a, b, c, b, d, c)
    }
}

// ---- the crown: six panels, the arch cut into the back two ------------------------------
function crownGeometry() {
  const b = buffers()
  const arch = polyline(archLine())
  const N = 44
  const p = new Vector3()
  const n = new Vector3()
  // two regions, so the arch's straight sides stay straight: round the back from one side
  // of the arch to the other (rows from the rim), and over the arch (rows from its edge)
  const regions = [samples(ARCH.half, 360 - ARCH.half, SEAMS, 2.5), samples(-ARCH.half, ARCH.half, [0], 2)]
  for (const [ri, yaws] of regions.entries()) {
    const base = b.pos.length / 3
    for (let i = 0; i <= N; i++)
      for (const yaw of yaws) {
        const u0 = ri === 1 ? archTop(yaw) : 0
        const u = u0 + (1 - u0) * Math.pow(i / N, 1.1)
        crownAt(yaw, u, p)
        crownNormal(yaw, u, n)
        b.pos.push(p.x, p.y, p.z)
        b.nrm.push(n.x, n.y, n.z)
        b.col.push(1, 1, 1)
        const r0 = rim(yaw)
        const pitch = r0 + (90 - r0) * u
        const horiz = rho(u) * Math.cos(pitch * D)
        const [ed, along] = Math.abs(wrap(yaw)) < 55 && u < 0.6 ? arch.near(p) : [FAR, 0]
        b.fab.push(seamOff(yaw) * D * horiz, (90 - pitch) * D * rho(u), ed, along)
        b.weave.push(wrap(yaw) * D * horiz, (90 - pitch) * D * rho(u))
      }
    grid(b.idx, base, N + 1, yaws.length)
  }
  return geometryOf(b)
}

// ---- the binding round the edge: along the rim, up and over the arch --------------------
function bindingGeometry() {
  const pts = archLine()
  for (let yaw = ARCH.half + 3; yaw <= 360 - ARCH.half - 3; yaw += 3) pts.push(crownAt(yaw, 0))
  const curve = new CatmullRomCurve3(pts, true, 'centripetal')
  const g = new TubeGeometry(curve, 520, 0.012, 8, true)
  const len = curve.getLength()
  const uv = g.attributes.uv
  const fab: number[] = []
  const weave: number[] = []
  const col: number[] = []
  for (let i = 0; i < uv.count; i++) {
    fab.push(FAR, 0, FAR, 0)
    weave.push(uv.getX(i) * len, uv.getY(i) * 0.11)
    col.push(0.94, 0.94, 0.94)
  }
  g.setAttribute('fab', new Float32BufferAttribute(fab, 4))
  g.setAttribute('weave', new Float32BufferAttribute(weave, 2))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  return g
}

// ---- the brim, behind the head ------------------------------------------------------------
/** The brim's mid-surface: `t` across (−1…1, round the back of the head), `l` out from the root. */
function brimMid(t: number, l: number, out = new Vector3()) {
  const yaw = 180 + BRIM.span * t
  const root = dir(yaw, rim(yaw) - 1.2, 1.04)
  const L = BRIM.len * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 2.4)), 0.5)
  const beta = (BRIM.droop + BRIM.sides * t * t) * D
  // out from the head, bent a little toward straight back (a D-shaped peak, not a fan)
  const h = new Vector3(Math.sin(yaw * D), 0, Math.cos(yaw * D)).lerp(new Vector3(0, 0, -1), BRIM.back).normalize()
  out.copy(root).addScaledVector(h, Math.cos(beta) * L * l)
  out.y -= Math.sin(beta) * L * l + BRIM.camber * L * l * l
  return out
}
function brimGeometry(under: Color) {
  const b = buffers()
  const NT = 64
  const NL = 14
  const NR = 7
  // the peak's edge, for stitch dashes along it
  const edgeLen: number[] = [0]
  for (let k = 1; k <= NT; k++) edgeLen.push(edgeLen[k - 1] + brimMid(-1 + (2 * k) / NT, 1).distanceTo(brimMid(-1 + (2 * (k - 1)) / NT, 1)))
  const m = new Vector3()
  const dl = new Vector3()
  const dt = new Vector3()
  const N = new Vector3()
  const O = new Vector3()
  const q = new Vector3()
  let cols = 0
  for (let k = 0; k <= NT; k++) {
    const t = -1 + (2 * k) / NT
    const L = BRIM.len * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 2.4)), 0.5)
    const th = BRIM.th * Math.sqrt(Math.max(0.05, 1 - Math.pow(Math.abs(t), 8)))
    const frame = (l: number) => {
      brimMid(t, l, m)
      dl.subVectors(brimMid(t, Math.min(1, l + 0.01), new Vector3()), brimMid(t, Math.max(0, l - 0.01), new Vector3()))
      const te = Math.max(-1, Math.min(1, t))
      dt.subVectors(brimMid(Math.min(1, te + 0.01), l, new Vector3()), brimMid(Math.max(-1, te - 0.01), l, new Vector3()))
      N.crossVectors(dl, dt)
      if (N.lengthSq() < 1e-14) N.set(0, 1, 0)
      N.normalize()
      if (N.y < 0) N.negate()
      O.copy(dl).normalize()
    }
    const put = (tint: Color, edge: number, along: number) => {
      b.pos.push(q.x, q.y, q.z)
      b.col.push(tint.r, tint.g, tint.b)
      b.fab.push(FAR, along, edge, edgeLen[k])
      b.weave.push(edgeLen[k], along)
    }
    const white = new Color(1, 1, 1)
    let c = 0
    // underneath, root → peak
    for (let i = 0; i <= NL; i++) {
      const l = i / NL
      frame(l)
      q.copy(m).addScaledVector(N, -th / 2)
      put(under, (1 - l) * L, l * L)
      c++
    }
    // round the peak's edge
    frame(1)
    for (let i = 1; i < NR; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / NR
      q.copy(m).addScaledVector(N, (th / 2) * Math.sin(a)).addScaledVector(O, (th / 2) * Math.cos(a))
      put(a < 0 ? under : white, 0, L)
      c++
    }
    // on top, peak → root
    for (let i = NL; i >= 0; i--) {
      const l = i / NL
      frame(l)
      q.copy(m).addScaledVector(N, th / 2)
      put(white, (1 - l) * L, l * L)
      c++
    }
    cols = c
  }
  // rows are t (across the brim), columns go round its section
  grid(b.idx, 0, NT + 1, cols, true)
  return geometryOf(b, false)
}

// ---- the strap across the arch, and its tail through the slider ---------------------------
/** A band on the head: `across` samples a strip's short side, `along` its long side; `at` maps (a, s) → point; thin edges drop `depth`. */
function band(at: (a: number, s: number, lift: number) => Vector3, na: number, ns: number, width: number, length: number, depth: number) {
  const b = buffers()
  const sec: [number, number][] = [[0, -depth]] // (across fraction, lift)
  for (let i = 0; i <= na; i++) sec.push([i / na, 0])
  sec.push([1, -depth])
  for (let j = 0; j <= ns; j++) {
    const s = j / ns
    for (const [a, lift] of sec) {
      const p = at(a, s, lift)
      b.pos.push(p.x, p.y, p.z)
      b.col.push(1, 1, 1)
      b.fab.push(FAR, a * width, Math.min(a, 1 - a) * width, s * length)
      b.weave.push(s * length, a * width)
    }
  }
  grid(b.idx, 0, ns + 1, sec.length, true)
  return geometryOf(b, false)
}
function strapGeometry() {
  const { yaw, p0, p1, r } = STRAP
  const width = (p1 - p0) * D * r
  const length = 2 * yaw * D * r * Math.cos(((p0 + p1) / 2) * D)
  return band((a, s, lift) => dir(-yaw + 2 * yaw * s, p0 + (p1 - p0) * a, r + lift), 10, 60, width, length, 0.012)
}
function tailGeometry() {
  const w = 0.11
  const pa = SLIDER.pitch - 8.6
  const pb = SLIDER.pitch + 8.6
  const r = STRAP.r + 0.012
  const cp = Math.cos(SLIDER.pitch * D)
  return band((a, s, lift) => dir(((a - 0.5) * w) / (r * cp) / D, pa + (pb - pa) * s, r + lift), 6, 16, w, (pb - pa) * D * r, 0.01)
}

// ---- the slider: a rounded rectangle of wire, bent onto the strap --------------------------
function sliderGeometry() {
  const { w, h, corner: c, r, pitch } = SLIDER
  const pts: Vector3[] = []
  const cp = Math.cos(pitch * D)
  const onStrap = (x: number, y: number) => dir(x / (r * cp) / D, pitch + y / r / D, r)
  const corners: [number, number, number][] = [
    [w / 2 - c, h / 2 - c, 0],
    [-w / 2 + c, h / 2 - c, 90],
    [-w / 2 + c, -h / 2 + c, 180],
    [w / 2 - c, -h / 2 + c, 270],
  ]
  for (const [cx, cy, a0] of corners)
    for (let i = 0; i <= 8; i++) {
      const a = (a0 + (90 * i) / 8) * D
      pts.push(onStrap(cx + c * Math.cos(a), cy + c * Math.sin(a)))
    }
  return new TubeGeometry(new CatmullRomCurve3(pts, true, 'centripetal'), 160, SLIDER.wire, 10, true)
}

/** Anything plain in the cloth (the button): no seams or edges, the weave from its position. */
function cloth<G extends BufferGeometry>(g: G): G {
  const p = g.attributes.position
  const fab: number[] = []
  const weave: number[] = []
  const col: number[] = []
  for (let i = 0; i < p.count; i++) {
    fab.push(FAR, 0, FAR, 0)
    weave.push(p.getX(i) + p.getZ(i), p.getY(i))
    col.push(1, 1, 1)
  }
  g.setAttribute('fab', new Float32BufferAttribute(fab, 4))
  g.setAttribute('weave', new Float32BufferAttribute(weave, 2))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  return g
}

export function Cap({ R, ghost, color, under, metalColor = '#b9b3ab' }: { R: number; ghost: boolean; color: string; under?: string; metalColor?: string }) {
  const g = useMemo(() => {
    const base = new Color(color)
    const lo = new Color(under ?? color)
    const underTint = new Color(lo.r / Math.max(1e-4, base.r), lo.g / Math.max(1e-4, base.g), lo.b / Math.max(1e-4, base.b))
    // pieces sharing a material are merged, one draw call each: the binding with the
    // button, the strap with its tail, the six eyelets, their six holes
    const mtx = new Matrix4()
    const ring = new TorusGeometry(0.027, 0.01, 10, 28)
    const hole = new CircleGeometry(0.019, 20).translate(0, 0, -0.002)
    const eyelets: BufferGeometry[] = []
    const holes: BufferGeometry[] = []
    for (const yaw of EYELETS) {
      const u = 0.46
      const n = crownNormal(yaw, u)
      mtx.compose(crownAt(yaw, u).addScaledVector(n, 0.004), new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), n), new Vector3(1, 1, 1))
      eyelets.push(ring.clone().applyMatrix4(mtx))
      holes.push(hole.clone().applyMatrix4(mtx))
    }
    const button = cloth(new SphereGeometry(1, 28, 14)).applyMatrix4(mtx.compose(new Vector3(0, rho(1) + 0.004, 0), new Quaternion(), new Vector3(0.088, 0.044, 0.088)))
    return {
      crown: crownGeometry(),
      trim: mergeGeometries([bindingGeometry(), button]),
      brim: brimGeometry(underTint),
      strap: mergeGeometries([strapGeometry(), tailGeometry()]),
      slider: sliderGeometry(),
      eyelets: mergeGeometries(eyelets),
      holes: mergeGeometries(holes),
    }
  }, [color, under])
  const mats = useMemo(() => {
    const thread = new Color(color).multiplyScalar(0.86).getStyle()
    return {
      crown: fabric(color, { seam: 0.03, rows: [0.028, 0, 1], double: true }),
      brim: fabric(color, { rows: [0.03, 0.033, 8] }),
      strap: fabric(color, { rows: [0.013, 0, 1], double: true }),
      plain: fabric(color),
      eyelet: matte(thread, 0.95),
      hole: matte('#23231d', 0.9),
      slider: metal(metalColor, 0.32),
    }
  }, [color, metalColor])
  const mm = (mat: Material) => (ghost ? ghostOf(mat) : mat)
  const rc = ghost ? noRaycast : undefined
  return (
    <group scale={R}>
      <mesh geometry={g.crown} material={mm(mats.crown)} raycast={rc} castShadow receiveShadow />
      <mesh geometry={g.trim} material={mm(mats.plain)} raycast={noRaycast} castShadow />
      <mesh geometry={g.brim} material={mm(mats.brim)} raycast={rc} castShadow receiveShadow />
      <mesh geometry={g.strap} material={mm(mats.strap)} raycast={noRaycast} castShadow receiveShadow />
      <mesh geometry={g.slider} material={mm(mats.slider)} raycast={noRaycast} castShadow />
      <mesh geometry={g.eyelets} material={mm(mats.eyelet)} raycast={noRaycast} />
      <mesh geometry={g.holes} material={mm(mats.hole)} raycast={noRaycast} />
    </group>
  )
}
