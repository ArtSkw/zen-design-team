import { Color, MeshPhysicalMaterial, type Material, type WebGLProgramParametersWithUniforms } from 'three'

// Sculpted clay for hair and beards, as the designs render it: matte, a soft sheen at
// grazing angles, crevices darkened by the baked occlusion (vertex colours), and fine
// strand grooves cut in the shader across each lock — using the lock direction baked
// into every vertex (`dir`), so the strands follow the hair — detail far finer than
// the mesh carries.

const cache = new Map<string, Material>()

export type ClayOpts = { freq?: number; amp?: number; sheen?: number; roughness?: number; sheenColor?: string }

export function clay(color: string, o: ClayOpts = {}): Material {
  const { freq = 160, amp = 0.16, sheen = 0.55, roughness = 0.74, sheenColor = '#ffe2c4' } = o
  const key = `${color}|${freq}|${amp}|${sheen}|${roughness}|${sheenColor}`
  const hit = cache.get(key)
  if (hit) return hit
  const m = new MeshPhysicalMaterial({ color: new Color(color), roughness, sheen, sheenColor: new Color(sheenColor), sheenRoughness: 0.55, vertexColors: true })
  // the groove's frequency and depth are uniforms, so every sculpt shares one program
  // (they were baked into the source: a heavy physical shader per sculpt, compiled twice)
  m.onBeforeCompile = (sh: WebGLProgramParametersWithUniforms) => {
    sh.uniforms.uClayFreq = { value: freq }
    sh.uniforms.uClayAmp = { value: amp }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 dir;\nuniform float uClayFreq;\nvarying float vPhase;\nvarying vec3 vAcrossView;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // across the lock: perpendicular to its direction, in the surface
        vec3 acrossObj = normalize(cross(normalize(dir + vec3(1e-4)), normal) + vec3(1e-5));
        vPhase = dot(position, acrossObj) * uClayFreq;
        vAcrossView = normalize(normalMatrix * acrossObj);`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uClayAmp;\nvarying float vPhase;\nvarying vec3 vAcrossView;')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec3 ax = normalize(vAcrossView - dot(vAcrossView, normal) * normal + vec3(1e-5));
          float g = cos(vPhase + 0.9 * sin(vPhase * 0.23));
          normal = normalize(normal + ax * g * uClayAmp);
        }`,
      )
  }
  m.customProgramCacheKey = () => 'clay'
  cache.set(key, m)
  return m
}
