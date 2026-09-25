import { Color, DoubleSide, FrontSide, MeshStandardMaterial, type Material, type WebGLProgramParametersWithUniforms } from 'three'
import { ZR } from './proportions'

// Cotton twill, the cap's cloth as the design renders it: matte, a fine diagonal weave,
// the seams pressed in as grooves with a row of light stitches either side, rows of
// stitching along edges (round the strap's arch, across the brim). The cloth's own
// coordinates come per vertex in `fab`, in R units: x = signed distance to the nearest
// seam, y = distance along the seam, z = distance to the nearest stitched edge, w =
// distance along that edge. Stitches and grooves are bumped in the shader from those
// coordinates, and they fade out wherever a pixel is wider than a stitch, so a cap across
// the room never shimmers. The weave runs on `weave` (two distances across the cloth).

export type FabricOpts = {
  seam?: number // stitches this far either side of a seam (0: none)
  rows?: [number, number, number] // edge rows: first row's distance from the edge, spacing, count
  stitch?: string
  roughness?: number
  double?: boolean // both faces (a single layer of cloth seen from inside too)
}

const cache = new Map<string, Material>()

/** Where a vertex has no seam or stitched edge nearby, `fab` carries this. */
export const FAR = 9

export function fabric(color: string, o: FabricOpts = {}): Material {
  const { seam = 0, rows = [0, 0, 0], stitch = '#d8d3b4', roughness = 0.9, double = false } = o
  const key = `${color}|${seam}|${rows.join(',')}|${stitch}|${roughness}|${double}`
  const hit = cache.get(key)
  if (hit) return hit
  const m = new MeshStandardMaterial({ color: new Color(color), roughness, metalness: 0, vertexColors: true, side: double ? DoubleSide : FrontSide })
  m.onBeforeCompile = (sh: WebGLProgramParametersWithUniforms) => {
    sh.uniforms.uSeam = { value: seam }
    sh.uniforms.uRows = { value: rows }
    sh.uniforms.uStitch = { value: new Color(stitch) }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 fab;\nattribute vec2 weave;\nvarying vec4 vFab;\nvarying vec2 vWeave;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFab = fab;\nvWeave = weave;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSeam;\nuniform vec3 uRows;\nuniform vec3 uStitch;\nvarying vec4 vFab;\nvarying vec2 vWeave;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float fabH = 0.0; // relief, R units
        {
          float px = max(fwidth(vWeave.x), fwidth(vWeave.y)); // R per pixel
          float vis = 1.0 - smoothstep(0.004, 0.01, px);  // stitches only where a pixel is finer than a stitch
          // the seam: a pressed groove, a faint dark line even from afar
          // (its bump only where a pixel resolves it: seen edge-on it would speckle)
          float g = exp(-pow(vFab.x / 0.007, 2.0));
          float gv = 1.0 - smoothstep(0.003, 0.008, px);
          fabH -= 0.003 * g * gv;
          diffuseColor.rgb *= 1.0 - 0.26 * g * (0.4 + 0.6 * gv);
          float st = 0.0;
          if (uSeam > 0.0) {
            float d = abs(abs(vFab.x) - uSeam);
            st = max(st, (1.0 - smoothstep(0.0024, 0.0024 + px, d)) * step(fract(vFab.y / 0.021), 0.62));
          }
          for (int k = 0; k < 8; k++) {
            if (float(k) >= uRows.z) break;
            float d = abs(vFab.z - (uRows.x + float(k) * uRows.y));
            st = max(st, (1.0 - smoothstep(0.0024, 0.0024 + px, d)) * step(fract(vFab.w / 0.021), 0.62));
          }
          st *= vis;
          fabH += 0.0018 * st;
          diffuseColor.rgb = mix(diffuseColor.rgb, uStitch, 0.8 * st);
          // the twill: diagonal ribs, gone before they alias
          float ph = (vWeave.x + vWeave.y) * 1100.0;
          float tw = 1.0 - smoothstep(0.8, 2.2, fwidth(ph));
          fabH += 0.00035 * sin(ph) * tw;
          diffuseColor.rgb *= 1.0 + 0.035 * sin(ph) * tw;
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          // bump from the relief (Mikkelsen's surface gradient, in view space)
          float h = fabH * ${ZR.toFixed(3)}; // R units → world
          vec3 sx = dFdx(-vViewPosition);
          vec3 sy = dFdy(-vViewPosition);
          vec3 r1 = cross(sy, normal);
          vec3 r2 = cross(normal, sx);
          float det = dot(sx, r1);
          vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
          normal = normalize(abs(det) * normal - grad);
        }`,
      )
  }
  m.customProgramCacheKey = () => 'fabric'
  cache.set(key, m)
  return m
}
