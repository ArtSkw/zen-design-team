import { Color, MeshPhysicalMaterial, type Material, type WebGLProgramParametersWithUniforms } from 'three'

// Sculpted clay for hair and beards, as the designs render it: matte, a soft sheen at
// grazing angles, crevices darkened by the baked occlusion (vertex colours), and fine
// strand grooves cut in the shader across each lock — using the lock direction baked
// into every vertex (`dir`), so the strands follow the hair — detail far finer than
// the mesh carries. Optionally a balayage: the colour shifts to `tip` down the hair (by
// height in the sculpt, from tipY[0] to tipY[1]) and lighter strands streak along the locks;
// and, gently, to `top` up it (from topY[0] up to topY[1]): a beard lighter near the moustache.

const cache = new Map<string, Material>()

/**
 * Hair that hangs (2026-09-29): a ponytail, a kiss curl, long waves lag the body's turn and swing
 * back — the vertices from `from` down to `to` (object y, R units) turn about the body's axis by
 * the Zenek's own lag angle (motion.ts writes `swingOf(material)`: [angle, lift in R]); `back`
 * keeps it to what hangs behind the head.
 */
export type Swing = { from: number; to: number; back?: boolean }

export type ClayOpts = { freq?: number; amp?: number; sheen?: number; roughness?: number; sheenColor?: string; tip?: string; tipY?: [number, number]; top?: string; topY?: [number, number]; streak?: number; swing?: Swing }

/** A swinging clay's live lag, [angle, lift] (null: it does not swing). */
export const swingOf = (m: Material) => (m.userData.swing as { value: [number, number] } | undefined) ?? null

export function clay(color: string, o: ClayOpts = {}): Material {
  const { freq = 160, amp = 0.16, sheen = 0.55, roughness = 0.74, sheenColor = '#ffe2c4', tip, tipY = [0, -1], top, topY = [0, 1], streak = 0, swing } = o
  const key = `${color}|${freq}|${amp}|${sheen}|${roughness}|${sheenColor}|${tip}|${tipY}|${top}|${topY}|${streak}|${swing ? `${swing.from},${swing.to},${swing.back}` : ''}`
  // the tip and top colours as multipliers of the base (white: no shift)
  const base = new Color(color)
  const over = (c?: string) => {
    const t = new Color(c ?? color)
    return new Color(t.r / Math.max(1e-4, base.r), t.g / Math.max(1e-4, base.g), t.b / Math.max(1e-4, base.b))
  }
  const tint = over(tip)
  const lift = over(top)
  const hit = cache.get(key)
  if (hit) return hit
  const m = new MeshPhysicalMaterial({ color: new Color(color), roughness, sheen, sheenColor: new Color(sheenColor), sheenRoughness: 0.55, vertexColors: true })
  const sway = { value: [0, 0] as [number, number] }
  if (swing) m.userData.swing = sway
  // the groove's frequency and depth are uniforms, so every sculpt shares one program
  // (they were baked into the source: a heavy physical shader per sculpt, compiled twice)
  m.onBeforeCompile = (sh: WebGLProgramParametersWithUniforms) => {
    sh.uniforms.uClayFreq = { value: freq }
    sh.uniforms.uClayAmp = { value: amp }
    sh.uniforms.uClayTip = { value: tint }
    sh.uniforms.uClayTipY = { value: tipY }
    sh.uniforms.uClayTop = { value: lift }
    sh.uniforms.uClayTopY = { value: topY }
    sh.uniforms.uClayStreak = { value: streak }
    sh.uniforms.uSwing = sway
    sh.uniforms.uSwingY = { value: swing ? [swing.from, swing.to] : [0, 0] }
    sh.uniforms.uSwingBack = { value: swing?.back ? 1 : 0 }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 dir;\nuniform float uClayFreq;\nuniform vec2 uSwing;\nuniform vec2 uSwingY;\nuniform float uSwingBack;\nvarying float vPhase;\nvarying vec3 vAcrossView;\nvarying float vClayY;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // across the lock: perpendicular to its direction, in the surface
        vec3 acrossObj = normalize(cross(normalize(dir + vec3(1e-4)), normal) + vec3(1e-5));
        vPhase = dot(position, acrossObj) * uClayFreq;
        vAcrossView = normalize(normalMatrix * acrossObj);
        vClayY = position.y;
        // hair that hangs lags the turn: turned about the body's axis, more the lower it hangs
        {
          float span = uSwingY.x - uSwingY.y;
          float w = abs(span) > 1e-4 ? clamp((uSwingY.x - position.y) / span, 0.0, 1.0) : 0.0;
          w = w * w * (3.0 - 2.0 * w);
          w *= mix(1.0, 1.0 - smoothstep(-0.75, -0.2, position.z), uSwingBack); // behind the head only
          float a = uSwing.x * w;
          float ca = cos(a);
          float sa = sin(a);
          transformed.xz = vec2(ca * transformed.x + sa * transformed.z, -sa * transformed.x + ca * transformed.z);
          transformed.y += uSwing.y * w;
        }`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uClayAmp;\nuniform vec3 uClayTip;\nuniform vec2 uClayTipY;\nuniform vec3 uClayTop;\nuniform vec2 uClayTopY;\nuniform float uClayStreak;\nvarying float vPhase;\nvarying vec3 vAcrossView;\nvarying float vClayY;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= mix(vec3(1.0), uClayTip, 1.0 - smoothstep(uClayTipY.y, uClayTipY.x, vClayY));
        diffuseColor.rgb *= mix(vec3(1.0), uClayTop, smoothstep(uClayTopY.x, uClayTopY.y, vClayY));
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
