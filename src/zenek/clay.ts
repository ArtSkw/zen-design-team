import { Color, MeshPhysicalMaterial, type Material, type WebGLProgramParametersWithUniforms } from 'three'

// Sculpted clay for hair and beards, as the designs render it: matte, a soft sheen at
// grazing angles, crevices darkened by the baked occlusion (vertex colours), and fine
// strand grooves cut in the shader across each lock — using the lock direction baked
// into every vertex (`dir`), so the strands follow the hair — detail far finer than
// the mesh carries. Optionally a balayage: the colour shifts to `tip` down the hair (by
// height in the sculpt, from tipY[0] to tipY[1]) and lighter strands streak along the locks.

const cache = new Map<string, Material>()

export type ClayOpts = { freq?: number; amp?: number; sheen?: number; roughness?: number; sheenColor?: string; tip?: string; tipY?: [number, number]; streak?: number }

export function clay(color: string, o: ClayOpts = {}): Material {
  const { freq = 160, amp = 0.16, sheen = 0.55, roughness = 0.74, sheenColor = '#ffe2c4', tip, tipY = [0, -1], streak = 0 } = o
  const key = `${color}|${freq}|${amp}|${sheen}|${roughness}|${sheenColor}|${tip}|${tipY}|${streak}`
  // the tip colour as a multiplier of the base (white: no balayage)
  const base = new Color(color)
  const tc = new Color(tip ?? color)
  const tint = new Color(tc.r / Math.max(1e-4, base.r), tc.g / Math.max(1e-4, base.g), tc.b / Math.max(1e-4, base.b))
  const hit = cache.get(key)
  if (hit) return hit
  const m = new MeshPhysicalMaterial({ color: new Color(color), roughness, sheen, sheenColor: new Color(sheenColor), sheenRoughness: 0.55, vertexColors: true })
  // the groove's frequency and depth are uniforms, so every sculpt shares one program
  // (they were baked into the source: a heavy physical shader per sculpt, compiled twice)
  m.onBeforeCompile = (sh: WebGLProgramParametersWithUniforms) => {
    sh.uniforms.uClayFreq = { value: freq }
    sh.uniforms.uClayAmp = { value: amp }
    sh.uniforms.uClayTip = { value: tint }
    sh.uniforms.uClayTipY = { value: tipY }
    sh.uniforms.uClayStreak = { value: streak }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 dir;\nuniform float uClayFreq;\nvarying float vPhase;\nvarying vec3 vAcrossView;\nvarying float vClayY;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // across the lock: perpendicular to its direction, in the surface
        vec3 acrossObj = normalize(cross(normalize(dir + vec3(1e-4)), normal) + vec3(1e-5));
        vPhase = dot(position, acrossObj) * uClayFreq;
        vAcrossView = normalize(normalMatrix * acrossObj);
        vClayY = position.y;`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uClayAmp;\nuniform vec3 uClayTip;\nuniform vec2 uClayTipY;\nuniform float uClayStreak;\nvarying float vPhase;\nvarying vec3 vAcrossView;\nvarying float vClayY;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= mix(vec3(1.0), uClayTip, 1.0 - smoothstep(uClayTipY.y, uClayTipY.x, vClayY));
        diffuseColor.rgb *= 1.0 + uClayStreak * (0.6 * sin(vPhase * 0.31 + 1.3) + 0.4 * sin(vPhase * 0.117 + 4.0));`,
      )
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
