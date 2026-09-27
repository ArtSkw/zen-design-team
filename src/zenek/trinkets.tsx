import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { BufferGeometry, Color, ExtrudeGeometry, LatheGeometry, Matrix4, MeshPhysicalMaterial, Quaternion, Shape, SphereGeometry, TorusGeometry, Vector2, Vector3, type Material, type WebGLProgramParametersWithUniforms } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ghostOf, metal } from './materials'
import { BALL, BANGLE_AXIS, crystalGlow } from './edyta-layout'

// Edyta's trinkets (docs/cast/edyta.png), in the cast's toy language (spheres and tori in warm
// gold): bangles round her right paw — two plain, one of beads — with a little sun charm; and the crystal ball on its
// gold cup, resting on her left paw: clear glass with a slow, swirling nebula and stars inside,
// drawn in its own shader (no extra render pass). The paws' pieces live in the paw's frame
// (Zenek.tsx renders them inside the hand groups), so they follow every gesture.

const D = Math.PI / 180
const noRaycast = () => null
const GOLD = '#d9a94c'
const Y = new Vector3(0, 1, 0)
const Z = new Vector3(0, 0, 1)

/** Merge pieces as positions + normals (their uvs differ in kind). */
function merge(gs: BufferGeometry[]) {
  return mergeGeometries(
    gs.map((g) => {
      const f = g.index ? g.toNonIndexed() : g
      f.deleteAttribute('uv')
      return f
    }),
  )
}
const place = (g: BufferGeometry, pos: Vector3, from: Vector3, to: Vector3) => g.applyMatrix4(new Matrix4().compose(pos, new Quaternion().setFromUnitVectors(from, to.clone().normalize()), new Vector3(1, 1, 1)))

// ---- bangles (her right paw: the left hand group, the viewer's left) ------------------------------------
export function banglesGeometry() {
  const gs: BufferGeometry[] = []
  const HR = 0.27 // the paw's radius
  // round the paw's upper outer side
  const axis = new Vector3(...BANGLE_AXIS).normalize()
  const ring = (theta: number, tube: number) => {
    const c = axis.clone().multiplyScalar(HR * Math.cos(theta * D))
    return { c, rho: HR * Math.sin(theta * D) + tube * 0.55 }
  }
  for (const [th, tube] of [[32, 0.022], [56, 0.018]] as [number, number][]) {
    const { c, rho } = ring(th, tube)
    gs.push(place(new TorusGeometry(rho, tube, 12, 48), c, Z, axis))
  }
  // the beaded one between them
  {
    const { c, rho } = ring(44, 0.016)
    const u = new Vector3().crossVectors(axis, Y).normalize()
    const v = new Vector3().crossVectors(axis, u)
    const bead = new SphereGeometry(0.017, 10, 8)
    const count = 26
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      gs.push(bead.clone().translate(c.x + (u.x * Math.cos(a) + v.x * Math.sin(a)) * rho, c.y + (u.y * Math.cos(a) + v.y * Math.sin(a)) * rho, c.z + (u.z * Math.cos(a) + v.z * Math.sin(a)) * rho))
    }
  }
  // the sun charm, hanging from the outer bangle's lowest point
  {
    const { c, rho } = ring(56, 0.018)
    const u = new Vector3().crossVectors(axis, Y).normalize()
    const v = new Vector3().crossVectors(axis, u)
    let low = c.clone()
    let best = Infinity
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2
      const q = c.clone().addScaledVector(u, Math.cos(a) * rho).addScaledVector(v, Math.sin(a) * rho)
      if (q.y < best) {
        best = q.y
        low = q
      }
    }
    const out = low.clone().normalize() // off the paw
    const link = low.clone().addScaledVector(out, 0.012).add(new Vector3(0, -0.022, 0))
    gs.push(new SphereGeometry(0.009, 8, 6).translate(link.x, link.y, link.z))
    const sun = new Shape()
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.PI / 2
      const rr = i % 2 ? 0.02 : 0.036
      if (i === 0) sun.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
      else sun.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
    }
    sun.closePath()
    const sg = new ExtrudeGeometry(sun, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2 })
    sg.translate(0, 0, -0.003)
    const face = new Vector3(out.x, 0, Math.max(0.3, out.z)).normalize() // the charm turns out and toward the front
    gs.push(place(sg, link.clone().add(new Vector3(0, -0.045, 0)), Z, face))
    gs.push(new SphereGeometry(0.012, 10, 8).translate(link.x, link.y - 0.045, link.z).applyMatrix4(new Matrix4().makeTranslation(face.x * 0.006, 0, face.z * 0.006)))
  }
  return merge(gs)
}

// ---- the crystal ball (her left paw: the right hand group, the viewer's right) ------------------------------
export function cupGeometry() {
  const c = new Vector3(...BALL.at)
  const d = c.clone().negate().normalize() // from the ball toward the paw
  const gs: BufferGeometry[] = []
  // a gold cup: a shallow lathed bowl under the ball, a rolled rim round it
  const bowl = new LatheGeometry([new Vector2(0.0001, -0.02), new Vector2(0.05, -0.018), new Vector2(0.085, -0.004), new Vector2(0.105, 0.016), new Vector2(0.112, 0.024)], 36)
  const rimAt = c.clone().addScaledVector(d, BALL.r * 0.86)
  gs.push(place(bowl, rimAt.clone().addScaledVector(d, 0.02), Y, d.clone().negate()))
  gs.push(place(new TorusGeometry(0.112, 0.016, 10, 40), rimAt, Z, d))
  return merge(gs)
}

function ballMaterial() {
  // glass holding a small night: deep indigo space you half see through, a bright rim (fresnel)
  // and the room's highlights; a vivid nebula (violet, magenta, sky blue) and stars glowing
  // inside, slowly turning (all-pale read as a soap bubble, all-dark as a marble)
  const m = new MeshPhysicalMaterial({ color: new Color('#241c52'), roughness: 0.03, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, envMapIntensity: 1.6, depthWrite: false })
  m.onBeforeCompile = (sh: WebGLProgramParametersWithUniforms) => {
    sh.uniforms.uTime = { value: 0 }
    sh.uniforms.uGlow = { value: 0 }
    m.userData.shader = sh
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBallP;\nvarying vec3 vBallEye;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBallP = position;\nvBallEye = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uGlow; // the gaze gesture: brighter, the swirl quicker
        varying vec3 vBallP;
        varying vec3 vBallEye;
        float bHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float bNoise(vec3 x) {
          vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(bHash(i + vec3(0,0,0)), bHash(i + vec3(1,0,0)), f.x), mix(bHash(i + vec3(0,1,0)), bHash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(bHash(i + vec3(0,0,1)), bHash(i + vec3(1,0,1)), f.x), mix(bHash(i + vec3(0,1,1)), bHash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float bFbm(vec3 p) { return 0.55 * bNoise(p) + 0.3 * bNoise(p * 2.1 + 3.1) + 0.15 * bNoise(p * 4.3 + 7.7); }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // a nebula inside the glass: march the view ray through the unit sphere
        vec3 ballAcc = vec3(0.0);
        {
          vec3 ro = vBallP;
          vec3 rd = normalize(vBallP - vBallEye);
          float tEnd = max(0.0, -2.0 * dot(ro, rd));
          float c = cos(uTime * 0.12), s = sin(uTime * 0.12);
          for (int i = 0; i < 14; i++) {
            float t = (float(i) + 0.5) / 14.0 * tEnd;
            vec3 p = ro + rd * t;
            vec3 q = vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z); // slowly turning
            float tw = q.y * 2.4;
            vec3 w = vec3(cos(tw) * q.x - sin(tw) * q.z, q.y, sin(tw) * q.x + cos(tw) * q.z); // a swirl
            float n = bFbm(w * 2.2 + vec3(0.0, uTime * 0.05, 0.0));
            float bq = (q.y + 0.12 * sin(q.x * 3.0)) / 0.62;
            float band = exp(-bq * bq); // not pow(x, 2.0): pow of a negative is NaN on Metal
            float dens = smoothstep(0.34, 0.7, n) * band * (1.0 - dot(p, p) * 0.5);
            vec3 col = mix(vec3(0.5, 0.22, 1.0), vec3(1.0, 0.28, 0.78), smoothstep(0.4, 0.8, bNoise(w * 1.3 + 5.0)));
            col = mix(col, vec3(0.3, 0.72, 1.0), smoothstep(0.6, 0.88, n) * 0.7);
            ballAcc += col * dens * (tEnd / 14.0) * 3.4;
            vec3 sp = q * 9.0; // stars: tiny bright specks
            float st = bHash(floor(sp));
            float sd = length(fract(sp) - 0.5);
            ballAcc += vec3(1.0, 0.96, 1.0) * step(0.96, st) * (1.0 - smoothstep(0.0, 0.17, sd)) * (tEnd / 14.0) * 3.2; // smoothstep's edges in order: reversed is undefined
          }
        }
        float ballFres = pow(max(0.0, 1.0 - abs(dot(normal, normalize(vViewPosition)))), 2.6); // clamped: rounding can push it below 0, and pow of a negative is NaN on Metal
        ballAcc *= 1.0 + 1.1 * uGlow;
        totalEmissiveRadiance += ballAcc + vec3(0.7, 0.75, 1.0) * ballFres * (0.35 + 0.5 * uGlow);`,
      )
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a = clamp(0.5 + 0.45 * ballFres + 0.5 * length(ballAcc), 0.0, 1.0);')
  }
  m.customProgramCacheKey = () => 'crystal-ball'
  return m
}

const unitSphere = new SphereGeometry(1, 48, 32)

export function Bangles({ R, ghost, mirror }: { R: number; ghost: boolean; mirror: boolean }) {
  const g = useMemo(() => banglesGeometry(), [])
  const mat = metal(GOLD, 0.24)
  return <mesh geometry={g} material={ghost ? ghostOf(mat) : mat} scale={[mirror ? -R : R, R, R]} raycast={noRaycast} castShadow />
}

export function CrystalBall({ R, ghost, mirror }: { R: number; ghost: boolean; mirror: boolean }) {
  const cup = useMemo(() => cupGeometry(), [])
  const glass = useMemo(() => ballMaterial(), [])
  const clock = useMemo(() => ({ t: 0 }), [])
  useFrame((_, dt) => {
    const sh = glass.userData.shader
    if (!sh) return
    // the swirl runs on its own clock, quicker while she gazes into it
    clock.t += Math.min(dt, 0.1) * (1 + 2.5 * crystalGlow.value)
    sh.uniforms.uTime.value = clock.t
    sh.uniforms.uGlow.value = crystalGlow.value
  })
  const gold = metal(GOLD, 0.26)
  const mm = (m: Material) => (ghost ? ghostOf(m) : m)
  return (
    <group scale={[mirror ? -R : R, R, R]}>
      <mesh geometry={cup} material={mm(gold)} raycast={noRaycast} castShadow />
      {!ghost && <mesh geometry={unitSphere} material={glass} position={BALL.at} scale={BALL.r} raycast={noRaycast} renderOrder={3} />}
    </group>
  )
}
