import { Color, MeshPhysicalMaterial, type Material, type WebGLProgramParametersWithUniforms } from 'three'
import { ZR } from './proportions'

// Ribbed knit, the beanie's cloth as the design renders it: raised knit columns with
// narrow purl grooves between them, rows of V stitches up every column, matte wool with a
// soft sheen. The ribs are a height field bumped in the shader from the vertex's rib phase
// (`knit.x`, radians: one rib per 2π) and its distance up the cloth (`knit.y`, R units);
// `knit.z` scales the ribs (they flatten over the rolled edges and at the crown's top) and
// `knit.w` merges them in pairs where the crown gathers. Everything finer than a pixel
// fades to its average, so the beanie never shimmers across the room. The geometry carries
// the same ribs in its silhouette (beanie.tsx); its normals are the smooth cloth's.

const cache = new Map<string, Material>()

export function knit(color: string, o: { rib?: number; sheen?: number; sheenColor?: string; roughness?: number } = {}): Material {
  const { rib = 0.016, sheen = 0.5, sheenColor = '#b7bd9c', roughness = 0.92 } = o
  const key = `${color}|${rib}|${sheen}|${sheenColor}|${roughness}`
  const hit = cache.get(key)
  if (hit) return hit
  const m = new MeshPhysicalMaterial({ color: new Color(color), roughness, metalness: 0, sheen, sheenColor: new Color(sheenColor), sheenRoughness: 0.6 })
  m.onBeforeCompile = (sh: WebGLProgramParametersWithUniforms) => {
    sh.uniforms.uRib = { value: rib }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 knit;\nvarying vec4 vKnit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKnit = knit;')
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uRib;
        varying vec4 vKnit;
        // the rib (beanie.tsx ribProfile): round, a narrow creased groove
        float knitProf(float ph) {
          return pow(max(0.5 + 0.5 * cos(ph), 0.0), 0.45) - 0.6; // pow of a negative is NaN on some GPUs (Metal): cos can land a hair under −1
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float knitH = 0.0; // relief, R units
        {
          float ph = vKnit.x;
          float w = vKnit.w;
          float amp = vKnit.z;
          float fw = fwidth(ph);
          float vis = 1.0 - smoothstep(0.6, 1.5, fw * (1.0 - 0.5 * w)); // ribs drawn while a rib spans ~5 px or more; narrower: their average
          float rib = mix(knitProf(ph), knitProf(ph * 0.5), w); // −0.6 groove … 0.4 crest
          knitH += uRib * amp * rib * vis;
          float lit = clamp(rib + 0.6, 0.0, 1.0);
          diffuseColor.rgb *= mix(1.0, mix(0.84, mix(0.38, 1.06, lit), vis), amp); // the grooves in shade
          // V stitches up each rib (smooth chevrons), only where a row is several pixels tall
          float e = atan(sin(ph), cos(ph)) / 2.6; // −1…1 across the rib's round
          float v = vKnit.y / 0.026;
          float sv = (1.0 - smoothstep(0.12, 0.28, fwidth(v))) * vis * amp * (1.0 - w);
          float st = (0.5 + 0.5 * cos(6.2832 * (v - 0.7 * abs(e)))) * max(0.0, 1.0 - e * e);
          knitH += 0.0016 * (st - 0.3) * sv;
          diffuseColor.rgb *= 1.0 + 0.12 * (st - 0.3) * sv;
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // bump from the relief (Mikkelsen's surface gradient, in view space)
          float h = knitH * ${ZR.toFixed(3)}; // R units → world
          vec3 sx = dFdx(-vViewPosition);
          vec3 sy = dFdy(-vViewPosition);
          vec3 r1 = cross(sy, normal);
          vec3 r2 = cross(normal, sx);
          float det = dot(sx, r1);
          vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
          vec3 bumped = abs(det) * normal - grad;
          if (dot(bumped, bumped) > 1e-24) normal = normalize(bumped); // degenerate derivatives: keep the normal (normalize(0) is NaN)
        }`,
      )
  }
  m.customProgramCacheKey = () => 'knit'
  cache.set(key, m)
  return m
}
