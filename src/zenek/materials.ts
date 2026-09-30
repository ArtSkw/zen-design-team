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

/**
 * A rim of light from behind and above (2026-09-29): in the crowd, black bodies merged into one
 * another (Mirek into Krystian, Artur into Mateusz N.). A faint cool edge where the body turns
 * away from the viewer and toward the light behind it — the third light of any character set —
 * lifts each silhouette off whoever sits behind it. Only the bodies and paws wear it.
 */
function withRim(m: MeshPhysicalMaterial) {
  m.onBeforeCompile = (sh: WebGLProgramParametersWithUniforms) => {
    sh.uniforms.uRim = { value: [0.13, 0.14, 0.16] } // linear: a cool grey, faint
    sh.uniforms.uRimDir = { value: [-0.42, 0.72, -0.55] } // toward the light, in view space: above, behind, a little left
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;\nuniform vec3 uRimDir;')
      .replace(
        '#include <opaque_fragment>',
        `{
          float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          float edge = 1.0 - facing;
          outgoingLight += uRim * edge * edge * smoothstep(-0.15, 0.65, dot(normal, normalize(uRimDir)));
        }
        #include <opaque_fragment>`,
      )
  }
  m.customProgramCacheKey = () => `body-rim-${m.vertexColors ? 'ao' : 'plain'}`
}
withRim(BODY)
withRim(BODY_AO)

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
