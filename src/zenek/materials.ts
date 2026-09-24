import { DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial, type Material, type WebGLProgramParametersWithUniforms } from 'three'
import { ZR } from './proportions'

// Satin black with a soft glaze — a vinyl toy, not a mirror ball.
export const BODY = new MeshPhysicalMaterial({
  color: '#2a2b2e',
  roughness: 0.62,
  clearcoat: 0.2,
  clearcoatRoughness: 0.5,
  envMapIntensity: 1.0,
})

// The same satin black for sculpted body parts (a muscular arm): the bake's crease
// occlusion comes in as vertex colours.
export const BODY_AO = BODY.clone()
BODY_AO.vertexColors = true

// Glossy black beads.
export const EYE_MAT = new MeshPhysicalMaterial({ color: '#0e0f10', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 })

// Paper-white face plate, matte.
export const PLATE_MAT = new MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.52, metalness: 0 })

const cache = new Map<string, Material>()

export function matte(color: string, roughness = 0.85): Material {
  const key = `matte:${color}:${roughness}`
  let m = cache.get(key)
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness, metalness: 0 })
    cache.set(key, m)
  }
  return m
}

export function metal(color: string, roughness = 0.35): Material {
  const key = `metal:${color}:${roughness}`
  let m = cache.get(key)
  if (!m) {
    m = new MeshStandardMaterial({ color, roughness, metalness: 0.85 })
    cache.set(key, m)
  }
  return m
}

// Floor reflection variant: translucent, mirrored (so double-sided), fading
// out with depth below the floor via a small shader patch.
export const GHOST_OPACITY = 0.2
const GHOST_FADE = 1.8 * ZR
const ghosts = new Map<string, Material>()

export function ghostOf(m: Material): Material {
  let g = ghosts.get(m.uuid)
  if (g) return g
  g = m.clone()
  g.transparent = true
  g.opacity = GHOST_OPACITY
  g.depthWrite = false
  g.side = DoubleSide
  g.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uGhostFade = { value: GHOST_FADE }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vGhostY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGhostY = (modelMatrix * vec4(transformed, 1.0)).y;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGhostY;\nuniform float uGhostFade;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.a *= smoothstep(-uGhostFade, 0.0, vGhostY);')
  }
  g.customProgramCacheKey = () => 'ghost'
  ghosts.set(m.uuid, g)
  return g
}
