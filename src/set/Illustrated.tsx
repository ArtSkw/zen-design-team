import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { ReflectorMaterial, notInWater } from './Reflector'
import { BackSide, BufferGeometry, CanvasTexture, DoubleSide, ClampToEdgeWrapping, Float32BufferAttribute, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshBasicMaterial, Plane, PlaneGeometry, Raycaster, ShaderMaterial, SRGBColorSpace, Vector2, Vector3, type Camera, type Group, type Material, type Object3D, type Ray } from 'three'
import { ARC, CENTER, HATCH, INK, Ink, PAPER, PAPER_LIGHT, STROKE_PX, WATER, composition, drawRing, inkFor, makePlate, tone, unitsPerPx, xOf, type Floater, type Plate, type Ring } from './ink'
import { DS, type DsMotif } from './ds-paths'
import { DIR, wind } from '../lib/wind'
import { DEBUG, LITE, P } from '../lib/params'
import { store } from '../lib/store'
import { mulberry32, range } from '../lib/rng'
import { smoothstep } from '../lib/anim'
import { skyAttention } from '../lib/sky'
import { hush } from '../lib/talk'
import { sfx } from '../sound/cues'
import { water as waterSong } from '../sound/engine'

// The drawn world around the deck: a paper sky, a pale water disc ending at a
// single horizon stroke, and design-system line art on three continuous strips
// wrapped around the room at three depths (near / mid / far), so orbiting gives
// parallax and nothing pops. Clouds drift; a plane or a pair of gulls crosses now
// and then; ripples breathe at the pilings and bloom, rarely, out on the water. Everything here is unlit, unfogged and
// untoned: it is ink on a page.

export const WATER_Y = -1.35
const D2R = Math.PI / 180
// Strips are split so each texture stays ≤ 4096 px wide; the seams sit outside the home view.
const SEAMS = [ARC.from, 165, 260, ARC.to]

export function polar(phi: number, r: number, y: number): [number, number, number] {
  const a = phi * D2R
  return [CENTER.x + r * Math.sin(a), y, CENTER.z + r * Math.cos(a)]
}
/** Rotation about y so a plane's face points at the room (its +x is the viewer's right). */
export const facing = (phi: number) => (phi + 180) * D2R

// ---- paper sky ------------------------------------------------------------------
// The sky is the page itself, as in every ZenDS illustration: flat paper, nothing
// painted on it — what lives in it (clouds, the sun, a plane, gulls) is drawn. It is
// the exact colour of the CSS page under the title card, so the room rises out of
// the same sheet the title was written on. (It used to carry a grain hashed in view
// directions; on the sphere that smeared into diagonal streaks and moiré.)
const srgb = (hex: string) => new Vector3(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255)
const paperMat = new ShaderMaterial({
  side: BackSide,
  depthWrite: false,
  uniforms: { paper: { value: srgb(PAPER) } },
  vertexShader: `
    void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  // written in sRGB directly (no tone mapping, no colour-space conversion)
  fragmentShader: `
    uniform vec3 paper;
    void main() { gl_FragColor = vec4(paper, 1.0); }`,
})

export function PaperSky() {
  return (
    <mesh material={paperMat} position={[CENTER.x, 0, CENTER.z]} renderOrder={-10}>
      <sphereGeometry args={[420, 48, 24]} />
    </mesh>
  )
}

// ---- water: pale, flat, a ghost of the room, ending just inside the near strip ----
/** Where the visitor touched the water, for WaterBlooms to ring. */
const touches: { x: number; z: number }[] = []
/** Where the music touched it (`?music=lake`), and how soon: its rings bloom as its notes sound. */
const songs: { x: number; z: number; delay: number }[] = []
const _cast = new Raycaster()
const _look = new Raycaster()
const _ndc = new Vector2()
const _hit = new Vector3()
const _surface = new Plane(new Vector3(0, 1, 0), -WATER_Y)

/**
 * Is the water hidden at this hit — the room, the deck, a Zenek in front of it? The
 * pointer's own raycast sees only things that answer it, so a tap on the room's wall
 * reaches the lake behind; this asks the whole scene, once, on a tap (or once for each
 * ring the music asks of the lake).
 */
function hidden(ray: Ray, camera: Camera, distance: number, water: Mesh | null, scene: Object3D) {
  _cast.ray.copy(ray)
  _cast.camera = camera
  for (const h of _cast.intersectObject(scene, true)) {
    if (h.distance >= distance - 0.3) return false
    const m = h.object as Mesh
    if (m === water || !m.visible) continue
    // a mesh of several materials answers with the one of the face the ray met (the deck, whose top
    // is its own material since it opened for the rising room — skipping it let a tap on the
    // terrace ring the water behind it, 2026-09-30)
    const mats = m.material as Material | Material[] | undefined
    const mat = Array.isArray(mats) ? mats[h.face?.materialIndex ?? 0] : mats
    if (!mat || (mat.transparent && !mat.depthWrite)) continue // drawn overlays: ripples, rings, glows
    return true
  }
  return false
}

export function Water({ radius }: { radius: number }) {
  const water = useRef<Mesh>(null)
  const scene = useThree((s) => s.scene)
  const down = useRef<{ x: number; y: number } | null>(null)
  // a tap on the water (not a drag of the view): a ring where it landed, and a small splash
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    down.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    const d = down.current
    down.current = null
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 8 || !water.current) return
    hush() // a tap off a Zenek closes its bubble, as it always has
    if (hidden(e.ray, e.camera, e.distance, water.current, scene)) return
    touches.push({ x: e.point.x, z: e.point.z })
    sfx.splash(e.point.x, e.point.y, e.point.z)
  }
  return (
    <mesh ref={water} rotation-x={-Math.PI / 2} position={[CENTER.x, WATER_Y, CENTER.z]} receiveShadow onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <circleGeometry args={[radius, 128]} />
      <ReflectorMaterial host={water} exclude={notInWater} blur={[420, 160]} resolution={LITE ? 384 : 768} every={LITE ? 4 : 1} mixBlur={1} mixStrength={0.9} roughness={0.7} depthScale={0} color={WATER} metalness={0} mirror={0.34} />
    </mesh>
  )
}

// ---- rings: one drawn strip per depth, wrapped on a cylinder ------------------------
function ringTexture(ring: Ring, from: number, to: number, dpr: number) {
  const k = inkFor(ring.r, dpr)
  const arcLen = ring.r * (to - from) * D2R
  const W = Math.min(4096, Math.ceil(arcLen * k.ppu))
  const ppu = W / arcLen
  const H = Math.ceil((ring.h + ring.below) * ppu)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  // strip x runs with φ decreasing; this segment starts (left edge) at φ = to
  ctx.setTransform(ppu, 0, 0, -ppu, -xOf(to, ring.r) * ppu, H - ring.below * ppu)
  drawRing(ring, new Ink(ctx, k.lw, k.hatchGap * (ppu / k.ppu), k.hatchLine * (ppu / k.ppu)))
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  tex.minFilter = LinearMipmapLinearFilter
  tex.magFilter = LinearFilter
  tex.generateMipmaps = true
  // seen from inside the cylinder the image would be mirrored; flip u
  tex.wrapS = tex.wrapT = ClampToEdgeWrapping
  tex.repeat.x = -1
  tex.offset.x = 1
  return tex
}

type Seg = { from: number; to: number; tex: CanvasTexture }

function RingStrip({ ring, segs }: { ring: Ring; segs: Seg[] }) {
  const hTotal = ring.h + ring.below
  return (
    <group position={[CENTER.x, WATER_Y + (ring.h - ring.below) / 2, CENTER.z]}>
      {segs.map((s, i) => (
        <mesh key={i}>
          <cylinderGeometry args={[ring.r, ring.r, hTotal, 96, 1, true, s.from * D2R, (s.to - s.from) * D2R]} />
          <meshBasicMaterial map={s.tex} transparent alphaTest={0.02} depthWrite side={BackSide} fog={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

// ---- floaters: sun and clouds on small planes facing the room -----------------------
function usePlate(f: Floater): Plate {
  const dpr = useThree((s) => s.viewport.dpr)
  const plate = useMemo(() => {
    const k = inkFor(f.r, dpr)
    return makePlate(f.w, f.h, 0, k.ppu, k.lw, k.hatchGap, k.hatchLine, f.draw)
  }, [f, dpr])
  useEffect(() => () => plate.tex.dispose(), [plate])
  return plate
}

/** How present a floater is at φ in its lane: 1 inside, fading over 7° at either end. */
const laneFade = (f: Floater, phi: number) => {
  if (!f.lane) return 1
  const e = 7
  const a = Math.min(1, Math.max(0, (phi - f.lane[0]) / e))
  const b = Math.min(1, Math.max(0, (f.lane[1] - phi) / e))
  return a * a * (3 - 2 * a) * b * b * (3 - 2 * b)
}

function FloaterMesh({ f }: { f: Floater }) {
  const plate = usePlate(f)
  const ref = useRef<Mesh>(null)
  const phi = useRef(f.phi)
  useFrame((_, dt) => {
    const m = ref.current
    if (!m || !f.drift || !DEBUG.motion || store.get().reducedMotion) return
    phi.current += f.drift * Math.min(dt, 0.05) * (1 + 2.5 * wind.at(m.position.x, m.position.z)) // a gust hurries it along
    const [from, to] = f.lane ?? [ARC.from - 8, ARC.to + 8]
    if (phi.current > to) phi.current = from
    const [x, , z] = polar(phi.current, f.r, 0)
    m.position.x = x
    m.position.z = z
    m.rotation.y = facing(phi.current)
    ;(m.material as import('three').MeshBasicMaterial).opacity = laneFade(f, phi.current)
  })
  return (
    <mesh ref={ref} position={polar(f.phi, f.r, WATER_Y + f.y + plate.h / 2)} rotation-y={facing(f.phi)}>
      <planeGeometry args={[plate.w, plate.h]} />
      <meshBasicMaterial map={plate.tex} transparent opacity={laneFade(f, f.phi)} alphaTest={0.02} depthWrite fog={false} toneMapped={false} />
    </mesh>
  )
}

// ---- the drawn world in the water (2026-09-29; soft, 2026-09-30) ---------------------------
// The water's blurred mirror smeared the drawn hills into grey smudges near the horizon. `?refl=`:
// `drawn` (default) — the page reflected as the water reflects the terrace: the ring strips found
// along the mirrored view ray and softened as water softens a reflection — blurred (a mip bias on
// their own textures), smeared a little up and down, rippled by a slow, continuous sway — strongest
// along the far shore and gone well before the deck (Fresnel); `cut` — the page leaves the water
// alone (the DS's own water is a single line), only the deck's soft ghost stays; `blur` — as it
// was. (Round 41's rippled bands and Round 40's dashes read as tattered, pixelated strokes.)
export const REFL = (['drawn', 'cut', 'blur'] as const).find((m) => m === P.str('refl', 'drawn')) ?? 'drawn'
/** A layer only the viewer's camera sees: drawn marks on the water never go into a reflection pass, nor answer a pointer. */
export const DRAWN_LAYER = 2

const reflMat = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  defines: { TAPS: LITE ? 3 : 5 },
  uniforms: {
    uN0: { value: null }, uN1: { value: null }, uN2: { value: null },
    uM0: { value: null }, uM1: { value: null }, uM2: { value: null },
    uF0: { value: null }, uF1: { value: null }, uF2: { value: null },
    uR: { value: new Vector3() }, uHt: { value: new Vector3() }, uBl: { value: new Vector3() },
    uC: { value: new Vector2(CENTER.x, CENTER.z) },
    uTime: { value: 0 }, uDpr: { value: 1 }, uInk: { value: srgb(INK) },
    uStrength: { value: P.num('reflk', 0.42) }, // at most, where the water mirrors most
    uGain: { value: P.num('reflg', 1.5) }, // a blurred line is fainter than a line: brought back up, a little
    uSoft: { value: P.num('refls', 5.5) }, // the blur: the textures sampled as if 5.5× further off (~2.5 mips)
    uSmear: { value: P.num('reflm', 2.6) }, // px between the taps up and down
  },
  vertexShader: `
    varying vec3 vW;
    void main() {
      vW = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D uN0; uniform sampler2D uN1; uniform sampler2D uN2;
    uniform sampler2D uM0; uniform sampler2D uM1; uniform sampler2D uM2;
    uniform sampler2D uF0; uniform sampler2D uF1; uniform sampler2D uF2;
    uniform vec3 uR; uniform vec3 uHt; uniform vec3 uBl; uniform vec2 uC;
    uniform float uTime; uniform float uDpr; uniform vec3 uInk;
    uniform float uStrength; uniform float uGain; uniform float uSoft; uniform float uSmear;
    varying vec3 vW;
    const float S0 = ${SEAMS[0].toFixed(1)}; const float S1 = ${SEAMS[1].toFixed(1)};
    const float S2 = ${SEAMS[2].toFixed(1)}; const float S3 = ${SEAMS[3].toFixed(1)};
    // where the mirrored ray from o (the water, about the room's centre) meets the strip of
    // radius r: its angle round the room (degrees, as the composition counts it) and the v of its
    // strip texture
    vec2 hit(vec2 o, vec3 d, float r, float ht, float bl) {
      float a = max(dot(d.xz, d.xz), 1e-6);
      float b = 2.0 * dot(o, d.xz);
      float c = dot(o, o) - r * r;
      float s = (-b + sqrt(max(b * b - 4.0 * a * c, 0.0))) / (2.0 * a);
      vec2 p = o + s * d.xz;
      float phi = degrees(atan(p.x, p.y));
      if (phi < S0) phi += 360.0;
      return vec2(phi, (bl + s * d.y) / (ht + bl));
    }
    // one strip's (ink, cover) at q: only the texture of its segment is read, with the gradients
    // given (so the choice may branch), u running from each segment's far end
    vec2 strip(sampler2D a, sampler2D b, sampler2D c, vec2 q, vec2 gx, vec2 gy) {
      vec4 t;
      if (q.x < S1) { float w = S1 - S0; t = textureGrad(a, vec2((S1 - q.x) / w, q.y), vec2(-gx.x / w, gx.y), vec2(-gy.x / w, gy.y)); }
      else if (q.x < S2) { float w = S2 - S1; t = textureGrad(b, vec2((S2 - q.x) / w, q.y), vec2(-gx.x / w, gx.y), vec2(-gy.x / w, gy.y)); }
      else { float w = S3 - S2; t = textureGrad(c, vec2((S3 - q.x) / w, q.y), vec2(-gx.x / w, gx.y), vec2(-gy.x / w, gy.y)); }
      t *= step(q.y, 1.0); // above the strip: sky
      return vec2(t.a * (1.0 - t.g), t.a);
    }
    vec3 mirrored(vec3 p) {
      vec3 d = normalize(p - cameraPosition);
      d.y = -d.y;
      return d;
    }
    void main() {
      // a slow sway, continuous down the water (never in bands), a little more of it further off
      float y = gl_FragCoord.y / uDpr;
      float sway = (sin(y * 0.19 + uTime * 0.9) * 1.1 + sin(y * 0.071 - uTime * 0.55) * 0.9) * uDpr;
      vec3 dx = dFdx(vW);
      vec3 dy = dFdy(vW);
      vec3 p0 = vW + dx * sway;
      // each strip's texture gradients here, scaled up: the blur (taken before anything branches)
      vec3 d0 = mirrored(p0);
      vec2 o0 = p0.xz - uC;
      vec2 qn = hit(o0, d0, uR.x, uHt.x, uBl.x);
      vec2 qm = hit(o0, d0, uR.y, uHt.y, uBl.y);
      vec2 qf = hit(o0, d0, uR.z, uHt.z, uBl.z);
      vec2 gnx = dFdx(qn) * uSoft; vec2 gny = dFdy(qn) * uSoft;
      vec2 gmx = dFdx(qm) * uSoft; vec2 gmy = dFdy(qm) * uSoft;
      vec2 gfx = dFdx(qf) * uSoft; vec2 gfy = dFdy(qf) * uSoft;
      // most of the water mirrors nothing drawn: its mirrored ray rises over every strip into the
      // bare sky (all but a band along the far shore) — gone before the taps, the cost of this shader
      // (derivatives above are taken first, while every pixel of the quad still runs)
      if (qn.y > 1.02 && qm.y > 1.02 && qf.y > 1.02) discard;
      // water mirrors most at a glance and little looking down into it (Schlick): the image lies
      // along the far shore and is gone well before the deck
      float c = 1.0 - clamp(normalize(cameraPosition - vW).y, 0.0, 1.0);
      float fres = 0.02 + 0.98 * c * c * c * c * c;
      if (uStrength * fres < 0.012) discard;
      // smeared up and down a little, as a rippled surface does, weighted to the middle
      float k = 0.0;
      float wsum = 0.0;
      for (int i = 0; i < TAPS; i++) {
        float off = float(i) - float(TAPS - 1) * 0.5;
        float wt = exp(-off * off * 0.35);
        vec3 p = p0 + dy * (off * uSmear * uDpr);
        vec3 d = mirrored(p);
        vec2 o = p.xz - uC;
        vec2 n = strip(uN0, uN1, uN2, hit(o, d, uR.x, uHt.x, uBl.x), gnx, gny);
        vec2 m = strip(uM0, uM1, uM2, hit(o, d, uR.y, uHt.y, uBl.y), gmx, gmy);
        vec2 f = strip(uF0, uF1, uF2, hit(o, d, uR.z, uHt.z, uBl.z), gfx, gfy);
        k += wt * (n.x + (1.0 - n.y) * (m.x + (1.0 - m.y) * f.x)); // the near strip in front of the far ones
        wsum += wt;
      }
      k /= wsum;
      float a = uStrength * fres * clamp(k * uGain, 0.0, 1.0);
      if (a < 0.004) discard;
      gl_FragColor = vec4(uInk, a);
    }`,
})

function DrawnReflection({ strips, radius }: { strips: { ring: Ring; segs: Seg[] }[]; radius: number }) {
  const dpr = useThree((s) => s.viewport.dpr)
  const mesh = useRef<Mesh>(null)
  useEffect(() => void mesh.current?.layers.set(DRAWN_LAYER), [])
  useEffect(() => {
    // the strips far → near here: [far, mid, near] in the composition
    const [far, mid, near] = strips
    const u = reflMat.uniforms
    ;(['N', 'M', 'F'] as const).forEach((k, i) => [near, mid, far][i].segs.forEach((s, j) => (u[`u${k}${j}`].value = s.tex)))
    u.uR.value.set(near.ring.r, mid.ring.r, far.ring.r)
    u.uHt.value.set(near.ring.h, mid.ring.h, far.ring.h)
    u.uBl.value.set(near.ring.below, mid.ring.below, far.ring.below)
  }, [strips])
  const frozen = !DEBUG.motion || store.get().reducedMotion
  useFrame(({ clock }) => {
    reflMat.uniforms.uTime.value = frozen ? 0 : clock.elapsedTime
    reflMat.uniforms.uDpr.value = dpr
  })
  return (
    <mesh ref={mesh} material={reflMat} rotation-x={-Math.PI / 2} position={[CENTER.x, WATER_Y + 0.006, CENTER.z]} renderOrder={-1}>
      <circleGeometry args={[radius, 96]} />
    </mesh>
  )
}

/**
 * A tree on a near hill, on its own plate so it can lean when a gust passes (src/lib/wind.ts):
 * its crown sways over, the trunk's foot stays where it stands (a shear growing with height),
 * with a flutter while the gust lasts. Between gusts it is as still as the page.
 */
function TreeMesh({ f, i }: { f: Floater; i: number }) {
  const plate = usePlate(f)
  const bend = useMemo(() => ({ value: 0 }), [])
  const mat = useMemo(() => {
    const m = new MeshBasicMaterial({ map: plate.tex, transparent: true, alphaTest: 0.02, depthWrite: true, fog: false, toneMapped: false })
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uBend = bend
      sh.uniforms.uTreeH = { value: plate.h }
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uBend;\nuniform float uTreeH;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float hn = clamp(position.y / uTreeH + 0.5, 0.0, 1.0); // 0 at its foot, 1 at the crown
          transformed.x += uBend * hn * hn * uTreeH;`)
    }
    m.customProgramCacheKey = () => 'tree-bend'
    return m
  }, [plate, bend])
  useEffect(() => () => mat.dispose(), [mat])
  const [x, , z] = useMemo(() => polar(f.phi, f.r, 0), [f])
  useFrame(({ clock }) => {
    const g = wind.at(x, z)
    bend.value = g > 0.001 ? g * (0.13 + 0.04 * Math.sin(clock.elapsedTime * 4.1 + i * 1.7)) : 0
  })
  return (
    <mesh material={mat} position={polar(f.phi, f.r, WATER_Y + f.y + plate.h / 2)} rotation-y={facing(f.phi)}>
      <planeGeometry args={[plate.w, plate.h, 1, 8]} />
    </mesh>
  )
}

// ---- a gust on the water: catspaws ------------------------------------------------------------
// Where a gust touches the water it ruffles it in patches (catspaws), drawn as the DS draws
// shade: its 6 px diagonal hatch, locked to the screen. They run with the gust's front and are
// gone when it has passed (src/lib/wind.ts); between gusts the mesh is not drawn at all.
const catMat = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uFront: { value: -1e4 }, uStrength: { value: 0 }, uD: { value: new Vector2(DIR[0], DIR[1]) }, uTime: { value: 0 }, uDpr: { value: 1 }, uInk: { value: srgb(INK) }, uAlpha: { value: HATCH.alpha } },
  vertexShader: `
    varying vec3 vW;
    void main() {
      vW = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
    }`,
  fragmentShader: `
    uniform float uFront; uniform float uStrength; uniform vec2 uD; uniform float uTime; uniform float uDpr; uniform vec3 uInk; uniform float uAlpha;
    varying vec3 vW;
    float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n2(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    void main() {
      float s = dot(vW.xz, uD);
      float behind = uFront - s; // how far the front has gone past this spot
      float band = smoothstep(0.0, 5.0, behind) * (1.0 - smoothstep(12.0, 30.0, behind));
      // patches, drawn out along the wind, drifting with it
      vec2 q = vec2(s * 0.09 - uTime * 0.55, dot(vW.xz, vec2(-uD.y, uD.x)) * 0.22);
      float paw = smoothstep(0.5, 0.75, 0.65 * n2(q) + 0.35 * n2(q * 2.3 + 7.1)); // ('patch' is reserved in GLSL ES 3)
      float m = band * paw * uStrength;
      if (m < 0.01) discard;
      // the DS hatch, "/" lines 6 px apart and 1.2 px wide, on the screen's own pixels
      float period = 6.0 * uDpr;
      float d = abs(fract((gl_FragCoord.x - gl_FragCoord.y) / period) - 0.5) * period;
      float a = uAlpha * m * (1.0 - smoothstep(0.85 * uDpr, 1.4 * uDpr, d));
      if (a < 0.004) discard;
      gl_FragColor = vec4(uInk, a);
    }`,
})

function Catspaws({ radius }: { radius: number }) {
  const mesh = useRef<Mesh>(null)
  const dpr = useThree((s) => s.viewport.dpr)
  useEffect(() => void mesh.current?.layers.set(DRAWN_LAYER), [])
  useFrame(({ clock }) => {
    const m = mesh.current
    if (!m) return
    const f = wind.front()
    m.visible = f !== null
    if (f === null || !wind.gust) return
    catMat.uniforms.uFront.value = f
    catMat.uniforms.uStrength.value = wind.gust.strength
    catMat.uniforms.uTime.value = clock.elapsedTime
    catMat.uniforms.uDpr.value = dpr
  })
  return (
    <mesh ref={mesh} material={catMat} rotation-x={-Math.PI / 2} position={[CENTER.x, WATER_Y + 0.008, CENTER.z]} renderOrder={-1} visible={false}>
      <circleGeometry args={[radius, 96]} />
    </mesh>
  )
}

/** The wind's clock (src/lib/wind.ts), advanced once a frame before anything reads it. */
function WindClock() {
  useFrame(({ clock }) => {
    const S = store.get()
    wind.tick(clock.elapsedTime, S.phase === 'ready' && DEBUG.motion && !S.reducedMotion)
  })
  return null
}

export function DrawnWorld({ bridge = false }: { bridge?: boolean }) {
  const { rings, floaters, trees } = useMemo(() => composition({ bridge }), [bridge])
  const near = rings[rings.length - 1]
  const dpr = useThree((s) => s.viewport.dpr)
  const strips = useMemo(() => rings.map((ring) => ({ ring, segs: SEAMS.slice(0, -1).map((from, i) => ({ from, to: SEAMS[i + 1], tex: ringTexture(ring, from, SEAMS[i + 1], dpr) })) })), [rings, dpr])
  const camera = useThree((s) => s.camera)
  useEffect(() => void camera.layers.enable(DRAWN_LAYER), [camera]) // the viewer sees the marks drawn on the water; mirrors do not
  useEffect(() => () => strips.forEach((s) => s.segs.forEach((g) => g.tex.dispose())), [strips])
  // the page out of the water's blurred mirror (it draws its own reflection, or none)
  const page = useRef<Group>(null)
  useEffect(() => {
    const g = page.current
    if (!g || REFL === 'blur') return
    notInWater.add(g)
    return () => void notInWater.delete(g)
  }, [])
  return (
    <group>
      <WindClock />
      <Water radius={near.r - 0.1} />
      {REFL === 'drawn' && <DrawnReflection strips={strips} radius={near.r - 0.1} />}
      <Catspaws radius={near.r - 0.1} />
      <group ref={page}>
        {strips.map((s) => (
          <RingStrip key={s.ring.id} ring={s.ring} segs={s.segs} />
        ))}
        {floaters.map((f) => (
          <FloaterMesh key={f.id} f={f} />
        ))}
        {trees.map((f, i) => (
          <TreeMesh key={f.id} f={f} i={i} />
        ))}
      </group>
    </group>
  )
}

// ---- the plane: rare, slow, climbing — as the DS draws it -------------------------
type Flyer = { id: number; phi: number; y0: number; dir: 1 | -1; speed: number; active: boolean; nextAt: number; r: number; bob: number; climb: number }
let flyerSeq = 0
/**
 * What is crossing the sky now, by its arc (2026-09-30): nothing sets off while something else is
 * up within APART degrees of its own stretch of sky — two flocks never turn up side by side, nor a
 * flock beside the plane. It waits for the other to land, and a little more.
 */
const upNow = new Map<number, { from: number; to: number }>()
const APART = 60 // the Fuji pair and the far-left gull (32° apart) take turns; the far-right pair (66° off) flies on its own
const arcGap = (a: { from: number; to: number }, b: { from: number; to: number }) => Math.max(0, a.from - b.to, b.from - a.to)
const _p = new Vector3()
const PLANE_ARC = { from: 168, to: 262 } // the arc a plane crosses, around the home view
/** Its first and last stretch of a crossing (share of its way): it fades in and out there, never pops. */
const EDGE = 0.05

/** The flyer's frames as plates, each for both headings. `pen` thins or thickens the line (a flock drawn smaller keeps its ~2 px). */
function usePlates(draws: ((ink: Ink, mirror: boolean) => void)[], w: number, h: number, r: number, pen = 1) {
  const dpr = useThree((s) => s.viewport.dpr)
  const plates = useMemo(() => {
    const k = inkFor(r, dpr)
    const mk = (draw: (ink: Ink, mirror: boolean) => void, mirror: boolean) => makePlate(w, h, 0, 48, k.lw * 0.9 * pen, k.hatchGap, k.hatchLine, (ink) => draw(ink, mirror))
    return draws.map((d) => ({ left: mk(d, false), right: mk(d, true) })) // the DS glyph flies left as drawn
  }, [draws, w, h, r, dpr, pen])
  useEffect(() => () => plates.forEach((p) => (p.left.tex.dispose(), p.right.tex.dispose())), [plates])
  return plates
}

const drawPlane = [(ink: Ink, mirror: boolean) => ink.plane(0, 0.1, 2.0, 1, mirror)]

// The gulls beat their wings (2026-09-29): they slid across as one rigid glyph. A DS gull is one
// stroke, two wings meeting at the body; a wingbeat is that stroke drawn flatter, then turned down,
// about the body (the path is transformed, not the pen, so the line keeps its weight) — up, level,
// down, level — two or three beats, then a glide on raised wings. The two keep a beat apart.
const WINGS = [1, 0.3, -0.55] // the wings' frames: up (as drawn), level, down
const GULL_BODY = new Map<DsMotif, [number, number]>([[DS.gull, [48.0036, 29.3321]], [DS.gullBig, [78.1397, 43.501]]])
function gull(ink: Ink, m: DsMotif, x: number, y: number, w: number, wings: number) {
  const { ctx } = ink
  const [x0, , x1, y1] = m.crop
  const k = w / (x1 - x0)
  const [bx, by] = GULL_BODY.get(m)!
  const p = new Path2D()
  p.addPath(new Path2D(m.items[0].d), new DOMMatrix().translate(bx, by).scale(1, wings).translate(-bx, -by))
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(k, -k)
  ctx.translate(-(x0 + x1) / 2, -y1)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = ink.lw / k
  ctx.strokeStyle = tone(1)
  ctx.stroke(p)
  ctx.restore()
}
/** The pair as Ink.gulls lays it out (the big one right, the small one left and higher), each with its wings at a frame. */
const gullPair = (big: number, small: number) => (ink: Ink, mirror: boolean) => {
  const w = 3.4
  ink.ctx.save()
  if (mirror) ink.ctx.scale(-1, 1)
  gull(ink, DS.gullBig, w * 0.22, 0.15, w * 0.5, WINGS[big])
  gull(ink, DS.gull, -w * 0.28, 0.15 + w * 0.22, w * 0.36, WINGS[small])
  ink.ctx.restore()
}
/** One gull alone. */
const gullSolo = (wings: number) => (ink: Ink, mirror: boolean) => {
  ink.ctx.save()
  if (mirror) ink.ctx.scale(-1, 1)
  gull(ink, DS.gullBig, 0, 0.18, 1.9, WINGS[wings])
  ink.ctx.restore()
}
// the frames: gliding, then a beat's four steps (in a pair the small gull a step behind the big one)
const drawGulls = [gullPair(0, 0), gullPair(0, 1), gullPair(1, 2), gullPair(2, 1), gullPair(1, 0)]
const drawGull = [gullSolo(0), gullSolo(0), gullSolo(1), gullSolo(2), gullSolo(1)]
/** Which frame, `t` s into a crossing: flap-flap(-flap) for ~1 s at 2.6 beats a second, then a glide. */
const gullFrame = (t: number, seed: number) => {
  const x = (t + seed * 2.1) % 3.4
  return x > 1.05 ? 0 : 1 + (Math.floor(x * 2.6 * 4) % 4)
}

// The plane writes a contrail behind it (2026-09-29): a thin line, as if drawn by the same pen,
// fading over TRAIL.secs — it was a 10 px dash crossing an empty sky. Plane and contrail are drawn
// ON THE SKY (2026-09-30): pushed to the back of the depth range, so every drawn shape — a hill of
// any ring, a tree, a cloud — hides them; the contrail used to cross the far hills in front while
// its plane was already behind a near one. `SKY_DEPTH` is that push.
const SKY_DEPTH = 'gl_Position.z = gl_Position.w * 0.99999; // on the sky: every drawn shape in front of it'
const TRAIL = { n: 72, secs: 6, every: 0.085, half: 0.035, alpha: 0.42, back: 0.9 }
const trailMat = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: DoubleSide, // it faces whichever way the plane flew
  uniforms: { uInk: { value: srgb(INK) }, uAlpha: { value: TRAIL.alpha }, uNow: { value: 0 }, uFade: { value: 1 } }, // (srgb reads #rrggbb, not tone()'s rgb())
  vertexShader: `
    attribute float born; // when its point was laid (scene s); the shader ages it, so the buffers change only as points are laid
    uniform float uNow;
    varying float vAge;
    void main() {
      vAge = (uNow - born) / ${TRAIL.secs.toFixed(1)};
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      ${SKY_DEPTH}
    }`,
  fragmentShader: `
    uniform vec3 uInk; uniform float uAlpha; uniform float uFade;
    varying float vAge;
    void main() {
      float a = uAlpha * uFade * (1.0 - smoothstep(0.0, 1.0, vAge)) * smoothstep(0.0, 0.04, vAge);
      if (a < 0.004) discard;
      gl_FragColor = vec4(uInk, a);
    }`,
})

/**
 * Something that crosses the sky now and then. `dir > 0` means increasing φ, which
 * the camera sees as flying to the LEFT — the DS plane's own heading, unmirrored. It fades in over
 * the first EDGE of its way and out over the last; `still` is where it holds when motion is off
 * (none: it is not shown then); `sky` draws it on the sky, behind every drawn shape; `scale` draws
 * a flock smaller or larger (the pen kept at its weight).
 */
function Crossing({ draw, frame, trail, sky, scale = 1, w, h, r, arc, ys, speed, gap, first, climb, still, sound }: {
  draw: ((ink: Ink, mirror: boolean) => void)[]
  frame?: (t: number, seed: number) => number // which of `draw` shows, `t` s into the crossing
  trail?: boolean
  sky?: boolean
  scale?: number
  w: number; h: number; r: number
  arc: { from: number; to: number }
  ys: [number, number]
  speed: [number, number]
  gap: [number, number]
  first: number
  climb: number
  still?: { phi: number; y: number }
  sound: 'plane' | 'gulls' // what it sounds like as it passes (src/sound/cues.ts)
}) {
  const plates = usePlates(draw, w, h, r, 1 / scale)
  const ref = useRef<Mesh>(null)
  const matRef = useRef<MeshBasicMaterial>(null)
  const me = useMemo(() => ++flyerSeq, [])
  useEffect(() => () => void upNow.delete(me), [me])
  useEffect(() => {
    const m = matRef.current
    if (!m || !sky) return
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n${SKY_DEPTH}`)
    }
    m.customProgramCacheKey = () => 'sky-depth'
    m.needsUpdate = true
  }, [sky])
  const f = useMemo<Flyer>(() => ({ id: 0, phi: arc.from, y0: ys[0], dir: 1, speed: speed[0], active: false, nextAt: first, r, bob: 0, climb }), [arc.from, ys, speed, first, r, climb])
  const since = useRef({ t0: 0, shown: -1 })
  // the contrail: a ring of the plane's last places, each drawn as a short band across the sky
  const tr = useMemo(() => {
    if (!trail) return null
    const g = new BufferGeometry()
    const pos = new Float32Array(TRAIL.n * 2 * 3)
    const born = new Float32Array(TRAIL.n * 2).fill(-1e6)
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.setAttribute('born', new Float32BufferAttribute(born, 1))
    const idx: number[] = []
    for (let i = 0; i < TRAIL.n - 1; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2)
    g.setIndex(idx)
    return { g, pts: [] as { x: number; y: number; z: number; t: number }[], last: -1, laid: 0 }
  }, [trail])
  useEffect(() => () => tr?.g.dispose(), [tr])
  const trailMesh = useRef<Mesh>(null)
  const frozen = !DEBUG.motion || store.get().reducedMotion
  useFrame(({ clock, camera }, rawDt) => {
    const m = ref.current
    if (!m) return
    const t = clock.elapsedTime
    const dt = Math.min(rawDt, 0.05)
    if (tr) updateTrail(tr, t, trailMesh.current)
    const mat = m.material as MeshBasicMaterial
    if (frozen) {
      // a drawn flyer holds its place in the sky (only the one given a place to hold)
      m.visible = !!still
      if (still) {
        m.position.set(...polar(still.phi, r, WATER_Y + still.y))
        m.rotation.y = facing(still.phi)
        mat.opacity = 1
      }
      return
    }
    if (!f.active) {
      m.visible = false
      if (tr) trailMat.uniforms.uFade.value = Math.max(0, trailMat.uniforms.uFade.value - dt / 0.9) // its contrail goes with it
      if (store.get().phase === 'ready' && t > f.nextAt) {
        // not beside something already up in the same part of the sky: after it, a beat later
        for (const [k, a] of upNow)
          if (k !== me && arcGap(a, arc) < APART) {
            f.nextAt = t + range(Math.random, 4, 10)
            return
          }
        upNow.set(me, arc)
        f.active = true
        f.id = ++flyerSeq
        f.dir = Math.random() > 0.5 ? 1 : -1
        f.phi = f.dir > 0 ? arc.from : arc.to
        f.speed = speed[0] + Math.random() * (speed[1] - speed[0])
        f.y0 = ys[0] + Math.random() * (ys[1] - ys[0])
        f.bob = Math.random() * 6
        since.current = { t0: t, shown: -1 }
        mat.map = (f.dir > 0 ? plates[0].left : plates[0].right).tex
        mat.needsUpdate = true
      }
      return
    }
    // its frame (a wingbeat): only the map changes, never the program
    const k = frame ? frame(t - since.current.t0, f.bob) : 0
    if (k !== since.current.shown) {
      since.current.shown = k
      mat.map = (f.dir > 0 ? plates[k].left : plates[k].right).tex
    }
    f.phi += f.dir * f.speed * dt * (180 / Math.PI)
    const u = f.dir > 0 ? (f.phi - arc.from) / (arc.to - arc.from) : (arc.to - f.phi) / (arc.to - arc.from)
    if (u >= 1) {
      f.active = false
      upNow.delete(me)
      f.nextAt = t + gap[0] + Math.random() * (gap[1] - gap[0])
      m.visible = false
      if (skyAttention.id === f.id) skyAttention.active = false
      sfx.flyer(sound, f.id, 1, 0)
      return
    }
    m.visible = true
    const fade = smoothstep(u / EDGE) * smoothstep((1 - u) / EDGE)
    mat.opacity = fade
    if (tr) trailMat.uniforms.uFade.value = fade
    const y = WATER_Y + f.y0 + u * f.climb + Math.sin(t * 0.9 + f.bob) * 0.16 * (r / 60)
    m.position.set(...polar(f.phi, r, y))
    m.rotation.y = facing(f.phi)
    if (tr && t - tr.last > TRAIL.every) {
      // from its tail: a little behind it along its way
      tr.last = t
      const [bx, by, bz] = polar(f.phi - f.dir * (TRAIL.back / r) * (180 / Math.PI), r + 0.05, y)
      tr.pts.push({ x: bx, y: by, z: bz, t })
      if (tr.pts.length > TRAIL.n) tr.pts.shift()
      tr.laid++
    }
    _p.copy(m.position).project(camera)
    const seen = _p.z < 1 && Math.abs(_p.x) < 1.02 && Math.abs(_p.y) < 1.02
    sfx.flyer(sound, f.id, u, Math.max(-1, Math.min(1, _p.x)) * 0.8, seen)
    // worth a glance while it is over the room's side of the sky — one thing at a time
    if (u > 0.08 && u < 0.85 && seen && (!skyAttention.active || skyAttention.id === f.id)) {
      skyAttention.active = true
      skyAttention.id = f.id
      skyAttention.x = m.position.x
      skyAttention.y = m.position.y
      skyAttention.z = m.position.z
    } else if (skyAttention.id === f.id) skyAttention.active = false
  })
  return (
    <>
      <mesh ref={ref} visible={false} scale={scale}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial ref={matRef} map={plates[0].left.tex} transparent alphaTest={0.02} depthWrite={false} fog={false} toneMapped={false} />
      </mesh>
      {tr && <mesh ref={trailMesh} geometry={tr.g} material={trailMat} frustumCulled={false} visible={false} />}
    </>
  )
}

/** Lay the contrail's band along its points (only when one has been laid or gone): each a short upright pair, the newest at the plane. */
function updateTrail(tr: { g: BufferGeometry; pts: { x: number; y: number; z: number; t: number }[]; laid: number; shown?: number }, t: number, mesh: Mesh | null) {
  trailMat.uniforms.uNow.value = t
  let changed = tr.laid !== tr.shown
  while (tr.pts.length && t - tr.pts[0].t > TRAIL.secs) {
    tr.pts.shift()
    changed = true
  }
  if (mesh) mesh.visible = tr.pts.length > 1 && trailMat.uniforms.uFade.value > 0
  if (!changed || tr.pts.length < 2) return
  tr.shown = tr.laid
  const pos = tr.g.attributes.position as Float32BufferAttribute
  const born = tr.g.attributes.born as Float32BufferAttribute
  for (let i = 0; i < TRAIL.n; i++) {
    const p = tr.pts[Math.min(i, tr.pts.length - 1)]
    const b = i < tr.pts.length ? p.t : -1e6 // unused slots: collapsed onto the newest, and long gone
    pos.setXYZ(2 * i, p.x, p.y - TRAIL.half, p.z)
    pos.setXYZ(2 * i + 1, p.x, p.y + TRAIL.half, p.z)
    born.setX(2 * i, b)
    born.setX(2 * i + 1, b)
  }
  pos.needsUpdate = true
  born.needsUpdate = true
}

/**
 * The gulls (2026-09-30, Artur's second note): three flocks in three parts of the page, well
 * apart — a pair above Fuji, in the home view; a smaller pair far to the right (over the
 * ZenPlanSmart gate, seen as the view turns that way); a lone gull far to the left — each with
 * its own pace, first appearance and gaps, and never two in one part of the sky at once (`APART`).
 * They fly in the open sky ABOVE the hills — never through them: every height here is above every
 * drawn silhouette in their stretch of sky at the home zoom (and above the near hills at any
 * view: they are higher than anything the near ring draws), yet inside the frame — worked out
 * from the composition and the camera (docs/plan.md, Round 42). The home view's sky is a narrow
 * band at the top of the frame; they keep to it.
 */
const FLOCKS: { key: string; draw: typeof drawGulls; w: number; h: number; scale?: number; r: number; arc: { from: number; to: number }; ys: [number, number]; climb: number; speed: [number, number]; gap: [number, number]; first: number; still?: { phi: number; y: number } }[] = [
  { key: 'fuji', draw: drawGulls, w: 4.2, h: 1.6, r: 70, arc: { from: 212, to: 248 }, ys: [10.2, 10.6], climb: 0.15, speed: [0.014, 0.02], gap: [30, 70], first: 8, still: { phi: 226, y: 10.4 } },
  { key: 'right', draw: drawGulls, w: 4.2, h: 1.6, scale: 0.88, r: 70, arc: { from: 96, to: 146 }, ys: [10.75, 11.0], climb: 0.1, speed: [0.017, 0.024], gap: [40, 90], first: 21 },
  { key: 'left', draw: drawGull, w: 2.4, h: 1.5, r: 70, arc: { from: 280, to: 330 }, ys: [10.0, 10.6], climb: 0.2, speed: [0.012, 0.017], gap: [45, 100], first: 34 },
]

export function Sky() {
  // what crosses the sky keeps out of the water's blurred mirror, as the page does (REFL)
  const ref = useRef<Group>(null)
  useEffect(() => {
    const g = ref.current
    if (!g || REFL === 'blur') return
    notInWater.add(g)
    return () => void notInWater.delete(g)
  }, [])
  return (
    <group ref={ref}>
      {/* the plane: seldom, slow, climbing a little as it goes — high in the open sky, and behind every
          drawn shape should a view put a hill in its way (at its old height, 4.6–8.4, the hills hid it all
          the way across once it went behind them) */}
      <Crossing sound="plane" draw={drawPlane} trail sky w={2.3} h={1.1} r={66} arc={PLANE_ARC} ys={[10.4, 10.8]} speed={[0.024, 0.032]} gap={[38, 80]} first={14} climb={0.3} still={{ phi: 234, y: 10.6 }} />
      {FLOCKS.map((g) => (
        <Crossing key={g.key} sound="gulls" draw={g.draw} frame={gullFrame} w={g.w} h={g.h} scale={g.scale} r={g.r} arc={g.arc} ys={g.ys} speed={g.speed} gap={g.gap} first={g.first} climb={g.climb} still={g.still} />
      ))}
    </group>
  )
}

// ---- water life: ripples at the pilings as a swell passes, rings that bloom ----------------
// The ripples are drawn as the DS would draw them (2026-09-29): not whole rings but broken arcs —
// the one nearest the viewer heavier, a lighter one behind, open at the sides — and they are not
// on a metronome at every piling (they were: 29 pilings pulsing on one 6 s clock, sonar more than
// ink): a slow swell rolls along the terrace, left to right, and each piling it reaches answers
// with a ring and a fainter echo, so the rings step from post to post.
const RIPPLE_SIZE = 2.8
const SWELL = { period: 7, speed: 8, dir: [0.97, -0.24] as const, life: 4.2, echo: 0.55 } // s, units/s, its heading (world x, z), a ring's life, the echo's lag
const rippleMat = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uTime: { value: 0 }, uInk: { value: srgb(INK) } },
  vertexShader: `
    attribute float phase;
    varying vec2 vUv;
    varying float vPhase;
    varying vec2 vWorld;
    varying vec2 vCenter;
    void main() {
      vUv = uv;
      vPhase = phase;
      vWorld = (modelMatrix * vec4(position, 1.0)).xz;
      vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform float uTime; uniform vec3 uInk;
    varying vec2 vUv; varying float vPhase; varying vec2 vWorld; varying vec2 vCenter;
    // a drawn line: a crisp core with a soft edge
    float line(float d, float r, float w) { return 1.0 - smoothstep(w * 0.45, w, abs(d - r)); }
    void main() {
      vec2 p = (vUv - 0.5) * ${RIPPLE_SIZE.toFixed(1)};
      float d = length(p);
      // which side of the ring faces the viewer (normalize of zero is NaN on Metal: guarded)
      vec2 w = vWorld - vCenter;
      float wl = length(w);
      vec2 toCam = cameraPosition.xz - vCenter;
      float cl = length(toCam);
      float c = (wl > 1e-4 && cl > 1e-4) ? dot(w / wl, toCam / cl) : 1.0;
      float a = 0.0;
      float age = fract(uTime / ${SWELL.period.toFixed(1)} - vPhase) * ${SWELL.period.toFixed(1)};
      for (int k = 0; k < 2; k++) {
        float t = (age - float(k) * ${SWELL.echo.toFixed(2)}) / ${SWELL.life.toFixed(1)};
        if (t < 0.0 || t >= 1.0) continue;
        float r = mix(0.24, 1.22, 1.0 - (1.0 - t) * (1.0 - t));
        // the arcs: the near one heavy, the far one light, open at the sides, each ring turned a little
        float cc = cos(acos(clamp(c, -1.0, 1.0)) + 0.35 * sin(vPhase * 40.0 + float(k) * 2.1));
        float arc = smoothstep(-0.05, 0.45, cc) + 0.5 * (1.0 - smoothstep(-0.8, -0.4, cc)); // (never a reversed smoothstep: undefined in GLSL)
        float ww = (0.03 + t * 0.035) * mix(0.55, 1.0, clamp(arc, 0.0, 1.0));
        float fade = (1.0 - t) * (1.0 - t) * smoothstep(0.0, 0.06, t);
        a += line(d, r, ww) * arc * fade * (k == 0 ? 0.55 : 0.3);
      }
      // where the wood meets the water: a short drawn line in front of the post
      a += line(d, 0.2, 0.03) * smoothstep(-0.1, 0.55, c) * 0.4;
      if (a < 0.003) discard;
      gl_FragColor = vec4(uInk, a);
    }`,
})

/** Ripples around each piling, born as the swell reaches it. */
export function Ripples({ piles }: { piles: [number, number][] }) {
  const geo = useMemo(() => {
    const g = new PlaneGeometry(RIPPLE_SIZE, RIPPLE_SIZE)
    return g
  }, [])
  const phases = useMemo(() => {
    // how far along the swell's way each piling stands, in periods — and a hair of chance
    const rng = mulberry32(404)
    const [dx, dz] = SWELL.dir
    return piles.map(([x, z]) => (((x * dx + z * dz) / (SWELL.speed * SWELL.period) + (rng() - 0.5) * 0.06) % 1 + 1) % 1)
  }, [piles])
  const frozen = !DEBUG.motion || store.get().reducedMotion
  useFrame(({ clock }) => {
    rippleMat.uniforms.uTime.value = frozen ? 2.1 : clock.elapsedTime
  })
  return (
    <group>
      {piles.map(([x, z], i) => {
        const g = geo.clone()
        g.setAttribute('phase', new Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(phases[i]), 1))
        return <mesh key={i} geometry={g} material={rippleMat} position={[x, WATER_Y + 0.012, z]} rotation-x={-Math.PI / 2} />
      })}
    </group>
  )
}

const BLOOM_SIZE = 6
const bloomMat = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uTime: { value: 0 }, uT0: { value: 0 }, uLife: { value: 8 }, uInk: { value: srgb(INK) } },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  // one ring born from nothing, widening and fading over its life; a second, fainter
  // one follows a beat behind — the way a still pond answers a touch
  fragmentShader: `
    uniform float uTime; uniform float uT0; uniform float uLife; uniform vec3 uInk;
    varying vec2 vUv;
    void main() {
      vec2 p = (vUv - 0.5) * ${BLOOM_SIZE.toFixed(1)};
      float d = length(p);
      float t = clamp((uTime - uT0) / uLife, 0.0, 1.0);
      float a = 0.0;
      for (int k = 0; k < 2; k++) {
        float tk = t - float(k) * 0.16;
        if (tk <= 0.0) continue;
        float r = mix(0.1, 2.6, tk);
        float w = 0.035 + tk * 0.05;
        float fade = (1.0 - tk) * (1.0 - tk) * smoothstep(0.0, 0.08, tk);
        a += (1.0 - smoothstep(0.0, w, abs(d - r))) * fade * (k == 0 ? 0.46 : 0.22);
      }
      if (a < 0.003) discard;
      gl_FragColor = vec4(uInk, a);
    }`,
})

type Bloom = { x: number; z: number; t0: number; life: number; mat: ShaderMaterial }

// ---- the fish ------------------------------------------------------------------------------
// A ring born from nothing had a sound (a fish's plop) and no cause you could see (2026-09-29).
// Now and then — never within FISH_GAP of the last, and only where the viewer can see the water
// (not off the frame, not behind the room or the deck) — a koi's tail breaks the surface, flicks,
// and slaps down just as its ring is born; the plop is its sound, heard only then. It is drawn in
// the DS hand, exactly: one line round a paper body, no inner strokes, and that line redrawn each
// time the tail comes up to be the DS's 2 px at the distance it is seen from (2026-09-30: drawn for
// one distance, a tail nearer the camera wore a heavy 3–4 px outline, out of the DS's hand).
const FISH_GAP = 11 // s
const FISH_CHANCE = 0.3 // of the blooms that could have one
const KOI = { w: 0.8, h: 0.8, below: 0.1, rise: 0.25, flick: 0.3, dive: 0.14 } // plate (world units); its moves (s)
const KOI_PPU = 150 // canvas px per world unit: ~2× its size on a retina screen at the nearest water
/**
 * A koi's tail as it breaks the surface, as the DS draws small things: the stem one line (a double
 * outline that thin filled in solid), the fin a paper body inside one line — two rounded lobes
 * and a soft notch between them.
 */
function koiPath() {
  const fin = new Path2D()
  fin.moveTo(0, 0.24)
  fin.bezierCurveTo(-0.1, 0.33, -0.24, 0.45, -0.3, 0.66) // the left lobe's leading edge, out to its tip
  fin.bezierCurveTo(-0.2, 0.62, -0.08, 0.57, 0, 0.5) // its trailing edge, in to the notch
  fin.bezierCurveTo(0.08, 0.58, 0.2, 0.65, 0.3, 0.69) // out to the right lobe's tip
  fin.bezierCurveTo(0.26, 0.48, 0.11, 0.34, 0, 0.24) // and back down to the stem
  fin.closePath()
  const stem = new Path2D()
  stem.moveTo(0.012, -0.1)
  stem.bezierCurveTo(0.012, 0.06, 0.004, 0.16, 0, 0.25)
  return { fin, stem }
}
/** The tail's plate: one canvas, redrawn with the line it needs each time the koi comes up. */
function koiArt() {
  const c = document.createElement('canvas')
  c.width = Math.ceil(KOI.w * KOI_PPU)
  c.height = Math.ceil((KOI.h + KOI.below) * KOI_PPU)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 8
  tex.minFilter = LinearMipmapLinearFilter
  tex.magFilter = LinearFilter
  const { fin, stem } = koiPath()
  return {
    tex,
    /** `lw`: the line, in world units (the DS's 2 px where it is seen). */
    draw(lw: number) {
      const ctx = c.getContext('2d')!
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, c.width, c.height)
      ctx.setTransform(KOI_PPU, 0, 0, -KOI_PPU, c.width / 2, c.height - KOI.below * KOI_PPU)
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.lineWidth = lw
      ctx.strokeStyle = INK
      ctx.stroke(stem)
      ctx.fillStyle = PAPER_LIGHT
      ctx.fill(fin)
      ctx.stroke(fin)
      tex.needsUpdate = true
    },
  }
}
const easeOut3 = (u: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3)

/** Rare rings that bloom somewhere on the water and fade — the water is alive, not scratched. */
export function WaterBlooms({ avoid }: { avoid: { x0: number; x1: number; z0: number; z1: number } }) {
  const rng = useMemo(() => mulberry32(2718), [])
  const koiPlate = useMemo(koiArt, [])
  useEffect(() => () => koiPlate.tex.dispose(), [koiPlate])
  /** Draw the tail for where it will come up: its line the DS's 2 px from the camera's distance. */
  const koiFor = (x: number, z: number) => koiPlate.draw(STROKE_PX * unitsPerPx(camera.position.distanceTo(_hit.set(x, WATER_Y + KOI.h / 2, z))))
  const koi = useRef<Mesh>(null)
  useEffect(() => void koi.current?.layers.set(DRAWN_LAYER), [])
  const fish = useRef({ t0: -100, x: 0, z: 0, side: 1, last: -100 })
  const spot = useMemo(
    () => () => {
      for (let i = 0; i < 40; i++) {
        // most blooms live on the water in front of the deck, where the home view looks
        const front = rng() < 0.65
        const x = CENTER.x + (front ? range(rng, -22, 24) : range(rng, -38, 38))
        const z = CENTER.z + (front ? range(rng, 9, 30) : range(rng, -34, 30))
        const inside = x > avoid.x0 - 3 && x < avoid.x1 + 3 && z > avoid.z0 - 3 && z < avoid.z1 + 3
        if (!inside && Math.hypot(x - CENTER.x, z - CENTER.z) < 42) return [x, z] as [number, number]
      }
      return [CENTER.x + 20, CENTER.z + 20] as [number, number]
    },
    [avoid, rng],
  )
  const blooms = useMemo<Bloom[]>(
    () =>
      Array.from({ length: 9 }, (_, i) => {
        const [x, z] = spot()
        const mat = bloomMat.clone()
        mat.uniforms.uT0.value = -16 + i * 1.9 // staggered so the water is already alive at first sight
        mat.uniforms.uLife.value = range(rng, 6, 9)
        return { x, z, t0: mat.uniforms.uT0.value, life: mat.uniforms.uLife.value, mat }
      }),
    [spot, rng],
  )
  useEffect(() => () => blooms.forEach((b) => b.mat.dispose()), [blooms])
  const refs = useRef<(Mesh | null)[]>([])
  // the visitor's touches ring as a fish's bloom does, a little quicker
  const rings = useMemo(
    () =>
      Array.from({ length: 4 }, () => {
        const mat = bloomMat.clone()
        mat.uniforms.uT0.value = -100
        mat.uniforms.uLife.value = 4.6
        return mat
      }),
    [],
  )
  useEffect(() => () => rings.forEach((m) => m.dispose()), [rings])
  const ringRefs = useRef<(Mesh | null)[]>([])
  const nextRing = useRef(0)
  // the music's rings, as slow as the fish's
  const sung = useMemo(
    () =>
      Array.from({ length: 3 }, () => {
        const mat = bloomMat.clone()
        mat.uniforms.uT0.value = -100
        mat.uniforms.uLife.value = 7
        return mat
      }),
    [],
  )
  useEffect(() => () => sung.forEach((m) => m.dispose()), [sung])
  const sungRefs = useRef<(Mesh | null)[]>([])
  const nextSung = useRef(0)
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    // a spot on the water the camera sees — not off the frame, not behind the room, the
    // deck or a Zenek: a few looks at random through the view, the first clear one taken
    waterSong.ring = (delay) => {
      for (let i = 0; i < 4; i++) {
        _ndc.set(range(Math.random, -0.9, 0.9), range(Math.random, -0.7, 0.6))
        _look.setFromCamera(_ndc, camera)
        if (!_look.ray.intersectPlane(_surface, _hit) || Math.hypot(_hit.x - CENTER.x, _hit.z - CENTER.z) > 40) continue
        if (hidden(_look.ray, camera, _look.ray.origin.distanceTo(_hit), null, scene)) continue
        songs.push({ x: _hit.x, z: _hit.z, delay })
        return [_hit.x, WATER_Y, _hit.z]
      }
      return null
    }
    return () => void (waterSong.ring = () => null)
  }, [camera, scene])
  const frozen = !DEBUG.motion || store.get().reducedMotion
  const last = useRef(-1)
  useFrame(({ clock }) => {
    const now = clock.elapsedTime
    while (touches.length) {
      const p = touches.shift()!
      const k = nextRing.current++ % rings.length
      const m = ringRefs.current[k]
      if (!m) continue
      m.position.x = p.x
      m.position.z = p.z
      rings[k].uniforms.uT0.value = now
    }
    while (songs.length) {
      const p = songs.shift()!
      const k = nextSung.current++ % sung.length
      const m = sungRefs.current[k]
      if (!m) continue
      m.position.x = p.x
      m.position.z = p.z
      sung[k].uniforms.uT0.value = now + p.delay
    }
    ;[rings, sung].forEach((pool, j) =>
      pool.forEach((m, k) => {
        m.uniforms.uTime.value = now
        const mesh = (j ? sungRefs : ringRefs).current[k]
        if (mesh) mesh.visible = now - m.uniforms.uT0.value < m.uniforms.uLife.value // drawn only while it rings
      }),
    )
    const t = frozen ? 0 : now
    // the scene clock restarts when the 3D rests behind the title and wakes (R3F's
    // setFrameloop zeroes it): every ring keeps its place in its life across the jump,
    // or the water would wait for times that never come again
    const jump = last.current < 0 ? 0 : t - last.current
    last.current = t
    if (Math.abs(jump) > 2)
      for (const b of blooms) {
        b.t0 += jump
        b.mat.uniforms.uT0.value = b.t0
      }
    blooms.forEach((b, i) => {
      const m = refs.current[i]
      if (!m) return
      if (frozen) {
        // a still frame: rings at different ages, as a photograph would catch them
        b.mat.uniforms.uTime.value = b.life * (0.15 + (i % 5) * 0.14)
        b.mat.uniforms.uT0.value = 0
        return
      }
      if (t > b.t0 + b.life + range(rng, 1.5, 6)) {
        // move on, elsewhere
        const [x, z] = spot()
        b.x = x
        b.z = z
        b.t0 = t + range(rng, 0.8, 3)
        b.life = range(rng, 6, 9)
        b.mat.uniforms.uT0.value = b.t0
        b.mat.uniforms.uLife.value = b.life
        m.position.x = x
        m.position.z = z
        // now and then a fish made it — where it can be seen: its tail, then its plop
        const f = fish.current
        if (t - f.last > FISH_GAP && rng() < FISH_CHANCE && inView(x, z)) {
          Object.assign(f, { t0: b.t0, x, z, side: rng() < 0.5 ? -1 : 1, last: t })
          koiFor(x, z)
          sfx.plop(x, WATER_Y, z, b.t0 - t)
        }
      }
      b.mat.uniforms.uTime.value = t
    })
    // the koi's tail: up through the surface, a flick, and down as its ring is born
    const k = koi.current
    const f = fish.current
    if (k) {
      const u = t - (f.t0 - KOI.rise - KOI.flick)
      const span = KOI.rise + KOI.flick + KOI.dive
      k.visible = !frozen && u > 0 && u < span
      if (k.visible) {
        const up = u < KOI.rise ? easeOut3(u / KOI.rise) : u < KOI.rise + KOI.flick ? 1 : 1 - easeOut3((u - KOI.rise - KOI.flick) / KOI.dive)
        const w = Math.min(1, Math.max(0, (u - KOI.rise * 0.6) / KOI.flick))
        k.position.set(f.x, WATER_Y - KOI.below + (KOI.h + KOI.below) / 2 - (1 - up) * (KOI.h + KOI.below * 2), f.z)
        k.rotation.set(0, Math.atan2(camera.position.x - f.x, camera.position.z - f.z), f.side * 0.42 * Math.sin(Math.PI * 1.5 * w) * (1 - 0.3 * w), 'YXZ')
      }
    }
  })
  // design check (dev only): `window.__fish()` sends a fish to a spot in view, its ring 0.8 s on
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as { __fish?: () => [number, number] | null }).__fish = () => {
      for (let i = 0; i < 80; i++) {
        const [x, z] = spot()
        if (!inView(x, z)) continue
        Object.assign(fish.current, { t0: last.current + 0.8, x, z, side: rng() < 0.5 ? -1 : 1, last: last.current })
        koiFor(x, z)
        songs.push({ x, z, delay: 0.8 })
        sfx.plop(x, WATER_Y, z, 0.8)
        _hit.set(x, WATER_Y, z).project(camera)
        return [((_hit.x + 1) / 2) * innerWidth, ((1 - _hit.y) / 2) * innerHeight] // where, on screen (css px)
      }
      return null
    }
  })
  /** Is this spot on the water in the viewer's sight: on the frame, and not behind the room, the deck or a Zenek? */
  const inView = (x: number, z: number) => {
    _hit.set(x, WATER_Y, z).project(camera)
    if (Math.abs(_hit.x) > 0.85 || _hit.y < -0.85 || _hit.y > 0.8 || _hit.z > 1) return false
    _hit.set(x, WATER_Y, z)
    _look.ray.origin.copy(camera.position)
    _look.ray.direction.copy(_hit).sub(camera.position).normalize()
    return !hidden(_look.ray, camera, camera.position.distanceTo(_hit), null, scene)
  }
  return (
    <group>
      {blooms.map((b, i) => (
        <mesh key={i} ref={(el) => (refs.current[i] = el)} material={b.mat} position={[b.x, WATER_Y + 0.01, b.z]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[BLOOM_SIZE, BLOOM_SIZE]} />
        </mesh>
      ))}
      {rings.map((mat, i) => (
        <mesh key={`t${i}`} ref={(el) => (ringRefs.current[i] = el)} material={mat} position={[0, WATER_Y + 0.012, 0]} rotation-x={-Math.PI / 2} visible={false}>
          <planeGeometry args={[BLOOM_SIZE, BLOOM_SIZE]} />
        </mesh>
      ))}
      {sung.map((mat, i) => (
        <mesh key={`s${i}`} ref={(el) => (sungRefs.current[i] = el)} material={mat} position={[0, WATER_Y + 0.011, 0]} rotation-x={-Math.PI / 2} visible={false}>
          <planeGeometry args={[BLOOM_SIZE, BLOOM_SIZE]} />
        </mesh>
      ))}
      <mesh ref={koi} visible={false}>
        <planeGeometry args={[KOI.w, KOI.h + KOI.below]} />
        <meshBasicMaterial map={koiPlate.tex} transparent alphaTest={0.05} fog={false} toneMapped={false} />
      </mesh>
    </group>
  )
}
