import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { ReflectorMaterial, notInWater } from './Reflector'
import { BackSide, CanvasTexture, ClampToEdgeWrapping, Float32BufferAttribute, LinearFilter, LinearMipmapLinearFilter, Mesh, PlaneGeometry, ShaderMaterial, SRGBColorSpace, Vector3 } from 'three'
import { ARC, CENTER, INK, Ink, PAPER, WATER, composition, drawRing, inkFor, makePlate, xOf, type Floater, type Plate, type Ring } from './ink'
import { DEBUG, LITE } from '../lib/params'
import { store } from '../lib/store'
import { mulberry32, range } from '../lib/rng'
import { skyAttention } from '../lib/sky'

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
const srgb = (hex: string) => new Vector3(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255)
const paperMat = new ShaderMaterial({
  side: BackSide,
  depthWrite: false,
  uniforms: { paper: { value: srgb(PAPER) } },
  vertexShader: `
    varying vec3 vDir;
    void main() {
      vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  // flat paper with a whisper of grain; written in sRGB directly (no tone mapping)
  fragmentShader: `
    uniform vec3 paper;
    varying vec3 vDir;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main() {
      vec3 d = normalize(vDir);
      float g = hash(floor(d.xy * 1400.0 + d.z * 700.0)) - 0.5;
      float lift = smoothstep(-0.1, 0.8, d.y) * 0.012;
      gl_FragColor = vec4(paper * (1.0 + g * 0.03 + lift), 1.0);
    }`,
})

export function PaperSky() {
  return (
    <mesh material={paperMat} position={[CENTER.x, 0, CENTER.z]} renderOrder={-10}>
      <sphereGeometry args={[420, 48, 24]} />
    </mesh>
  )
}

// ---- water: pale, flat, a ghost of the room, ending just inside the near strip ----
export function Water({ radius }: { radius: number }) {
  const water = useRef<Mesh>(null)
  return (
    <mesh ref={water} rotation-x={-Math.PI / 2} position={[CENTER.x, WATER_Y, CENTER.z]} receiveShadow>
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

function RingStrip({ ring }: { ring: Ring }) {
  const dpr = useThree((s) => s.viewport.dpr)
  const segs = useMemo(() => SEAMS.slice(0, -1).map((from, i) => ({ from, to: SEAMS[i + 1], tex: ringTexture(ring, from, SEAMS[i + 1], dpr) })), [ring, dpr])
  useEffect(() => () => segs.forEach((s) => s.tex.dispose()), [segs])
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
    phi.current += f.drift * Math.min(dt, 0.05)
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

export function DrawnWorld({ bridge = false }: { bridge?: boolean }) {
  const { rings, floaters } = useMemo(() => composition({ bridge }), [bridge])
  const near = rings[rings.length - 1]
  return (
    <group>
      <Water radius={near.r - 0.1} />
      {rings.map((r) => (
        <RingStrip key={r.id} ring={r} />
      ))}
      {floaters.map((f) => (
        <FloaterMesh key={f.id} f={f} />
      ))}
    </group>
  )
}

// ---- the plane: rare, slow, climbing — as the DS draws it -------------------------
type Flyer = { id: number; phi: number; y0: number; dir: 1 | -1; speed: number; active: boolean; nextAt: number; r: number; bob: number; climb: number }
let flyerSeq = 0
const PLANE_ARC = { from: 168, to: 262 } // the arc a plane crosses, around the home view
const GULL_ARC = { from: 176, to: 254 }

function usePlates(draw: (ink: Ink, mirror: boolean) => void, w: number, h: number, r: number) {
  const dpr = useThree((s) => s.viewport.dpr)
  const plates = useMemo(() => {
    const k = inkFor(r, dpr)
    const mk = (mirror: boolean) => makePlate(w, h, 0, 48, k.lw * 0.9, k.hatchGap, k.hatchLine, (ink) => draw(ink, mirror))
    return { left: mk(false), right: mk(true) } // the DS glyph flies left as drawn
  }, [draw, w, h, r, dpr])
  useEffect(() => () => {
    plates.left.tex.dispose()
    plates.right.tex.dispose()
  }, [plates])
  return plates
}

const drawPlane = (ink: Ink, mirror: boolean) => ink.plane(0, 0.1, 2.0, 1, mirror)
const drawGulls = (ink: Ink, mirror: boolean) => {
  ink.ctx.save()
  if (mirror) ink.ctx.scale(-1, 1)
  ink.gulls(0, 0.15, 3.4, 1)
  ink.ctx.restore()
}

/**
 * Something that crosses the sky now and then. `dir > 0` means increasing φ, which
 * the camera sees as flying to the LEFT — the DS plane's own heading, unmirrored.
 */
function Crossing({ draw, w, h, r, arc, ys, speed, gap, first, climb, still }: {
  draw: (ink: Ink, mirror: boolean) => void
  w: number; h: number; r: number
  arc: { from: number; to: number }
  ys: [number, number]
  speed: [number, number]
  gap: [number, number]
  first: number
  climb: number
  still: { phi: number; y: number }
}) {
  const plates = usePlates(draw, w, h, r)
  const ref = useRef<Mesh>(null)
  const f = useMemo<Flyer>(() => ({ id: 0, phi: arc.from, y0: ys[0], dir: 1, speed: speed[0], active: false, nextAt: first, r, bob: 0, climb }), [arc.from, ys, speed, first, r, climb])
  const frozen = !DEBUG.motion || store.get().reducedMotion
  useFrame(({ clock }, rawDt) => {
    const m = ref.current
    if (!m) return
    const t = clock.elapsedTime
    const dt = Math.min(rawDt, 0.05)
    if (frozen) {
      // a drawn flyer holds its place in the sky
      m.visible = true
      m.position.set(...polar(still.phi, r, WATER_Y + still.y))
      m.rotation.y = facing(still.phi)
      return
    }
    if (!f.active) {
      m.visible = false
      if (store.get().phase === 'ready' && t > f.nextAt) {
        f.active = true
        f.id = ++flyerSeq
        f.dir = Math.random() > 0.5 ? 1 : -1
        f.phi = f.dir > 0 ? arc.from : arc.to
        f.speed = speed[0] + Math.random() * (speed[1] - speed[0])
        f.y0 = ys[0] + Math.random() * (ys[1] - ys[0])
        f.bob = Math.random() * 6
        ;(m.material as import('three').MeshBasicMaterial).map = (f.dir > 0 ? plates.left : plates.right).tex
        ;(m.material as import('three').MeshBasicMaterial).needsUpdate = true
      }
      return
    }
    f.phi += f.dir * f.speed * dt * (180 / Math.PI)
    const u = f.dir > 0 ? (f.phi - arc.from) / (arc.to - arc.from) : (arc.to - f.phi) / (arc.to - arc.from)
    if (u >= 1) {
      f.active = false
      f.nextAt = t + gap[0] + Math.random() * (gap[1] - gap[0])
      m.visible = false
      if (skyAttention.id === f.id) skyAttention.active = false
      return
    }
    m.visible = true
    const y = WATER_Y + f.y0 + u * f.climb + Math.sin(t * 0.9 + f.bob) * 0.16
    m.position.set(...polar(f.phi, r, y))
    m.rotation.y = facing(f.phi)
    // worth a glance while it is over the room's side of the sky
    if (u > 0.08 && u < 0.85) {
      skyAttention.active = true
      skyAttention.id = f.id
      skyAttention.x = m.position.x
      skyAttention.y = m.position.y
      skyAttention.z = m.position.z
    } else if (skyAttention.id === f.id) skyAttention.active = false
  })
  return (
    <mesh ref={ref} visible={false}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={plates.left.tex} transparent alphaTest={0.02} depthWrite={false} fog={false} toneMapped={false} />
    </mesh>
  )
}

export function Sky() {
  return (
    <group>
      {/* the plane: seldom, slow, and climbing a little as it goes */}
      <Crossing draw={drawPlane} w={2.3} h={1.1} r={66} arc={PLANE_ARC} ys={[4.6, 5.8]} speed={[0.024, 0.032]} gap={[38, 80]} first={14} climb={2.6} still={{ phi: 234, y: 6.4 }} />
      {/* a pair of gulls, lower and closer, drifting across without climbing */}
      <Crossing draw={drawGulls} w={4.2} h={1.6} r={58} arc={GULL_ARC} ys={[4.2, 5.6]} speed={[0.014, 0.02]} gap={[26, 60]} first={6} climb={0.3} still={{ phi: 214, y: 5.9 }} />
    </group>
  )
}

// ---- water life: ripples that breathe at each piling, marks that drift ----------------
const RIPPLE_SIZE = 2.8
const rippleMat = new ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uTime: { value: 0 }, uInk: { value: srgb(INK) } },
  vertexShader: `
    attribute float phase;
    varying vec2 vUv;
    varying float vPhase;
    void main() {
      vUv = uv;
      vPhase = phase;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  // two rings born at the piling, growing and fading over 6 s, half a period apart;
  // a still contact ring where the wood meets the water
  fragmentShader: `
    uniform float uTime; uniform vec3 uInk;
    varying vec2 vUv; varying float vPhase;
    void main() {
      vec2 p = (vUv - 0.5) * ${RIPPLE_SIZE.toFixed(1)};
      float d = length(p);
      float a = 0.0;
      for (int k = 0; k < 2; k++) {
        float t = fract(uTime / 6.0 + vPhase + float(k) * 0.5);
        float r = mix(0.24, 1.2, t);
        float w = 0.03 + t * 0.03;
        a += (1.0 - smoothstep(0.0, w, abs(d - r))) * (1.0 - t) * (1.0 - t) * 0.42;
      }
      a += (1.0 - smoothstep(0.0, 0.03, abs(d - 0.2))) * 0.32;
      if (a < 0.003) discard;
      gl_FragColor = vec4(uInk, a);
    }`,
})

/** Ripples around each piling, each on its own clock. */
export function Ripples({ piles }: { piles: [number, number][] }) {
  const geo = useMemo(() => {
    const g = new PlaneGeometry(RIPPLE_SIZE, RIPPLE_SIZE)
    return g
  }, [])
  const phases = useMemo(() => {
    const rng = mulberry32(404)
    return piles.map(() => rng())
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

/** Rare rings that bloom somewhere on the water and fade — the water is alive, not scratched. */
export function WaterBlooms({ avoid }: { avoid: { x0: number; x1: number; z0: number; z1: number } }) {
  const rng = useMemo(() => mulberry32(2718), [])
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
  const frozen = !DEBUG.motion || store.get().reducedMotion
  useFrame(({ clock }) => {
    const t = frozen ? 0 : clock.elapsedTime
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
        b.t0 = t + range(rng, 0, 3)
        b.life = range(rng, 6, 9)
        b.mat.uniforms.uT0.value = b.t0
        b.mat.uniforms.uLife.value = b.life
        m.position.x = x
        m.position.z = z
      }
      b.mat.uniforms.uTime.value = t
    })
  })
  return (
    <group>
      {blooms.map((b, i) => (
        <mesh key={i} ref={(el) => (refs.current[i] = el)} material={b.mat} position={[b.x, WATER_Y + 0.01, b.z]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[BLOOM_SIZE, BLOOM_SIZE]} />
        </mesh>
      ))}
    </group>
  )
}
