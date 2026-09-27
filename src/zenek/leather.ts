import { Color, MeshPhysicalMaterial, MeshStandardMaterial, type Material, type WebGLProgramParametersWithUniforms } from 'three'
import { ZR } from './proportions'

// Mirek's jacket, in the cast's soft-clay look: brown leather — satin, a gentle sheen at
// grazing angles, a fine pebble grain — and the shearling collar — matte, a close curly nap
// of little nubs with dark crevices. Both are baked sculpts (vertex colours carry the crease
// shading); the grain and the nubs are bumped in the shader from the mesh's own position (R
// units) and fade to their average once they are smaller than a pixel, so across the room the
// leather is smooth and the collar a soft tan, never a shimmer.

const cache = new Map<string, Material>()

// shared GLSL: a 3D hash and cellular (Worley F1, F2) noise
const NOISE = `
vec3 lthHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
vec2 lthCells(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int z = -1; z <= 1; z++)
    for (int y = -1; y <= 1; y++)
      for (int x = -1; x <= 1; x++) {
        vec3 o = vec3(float(x), float(y), float(z));
        vec3 r = o + lthHash(i + o) - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
      }
  return sqrt(vec2(d1, d2));
}`

const BUMP = `
{
  // bump from the relief (Mikkelsen's surface gradient, in view space)
  float h = lthH * ${ZR.toFixed(3)}; // R units → world
  vec3 sx = dFdx(-vViewPosition);
  vec3 sy = dFdy(-vViewPosition);
  vec3 r1 = cross(sy, normal);
  vec3 r2 = cross(normal, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  vec3 bumped = abs(det) * normal - grad;
  if (dot(bumped, bumped) > 1e-24) normal = normalize(bumped); // degenerate derivatives: keep the normal
}`

function patch(m: Material, key: string, color: string) {
  m.onBeforeCompile = (sh: WebGLProgramParametersWithUniforms) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLthP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLthP = position;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLthP;\n${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${color}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${BUMP}`)
  }
  m.customProgramCacheKey = () => key
}

/** Soft leather: satin, a fine pebble grain. */
export function leather(color: string): Material {
  const key = `leather|${color}`
  const hit = cache.get(key)
  if (hit) return hit
  const m = new MeshPhysicalMaterial({ color: new Color(color), roughness: 0.42, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.32, sheen: 0.6, sheenColor: new Color('#9c7a6a'), sheenRoughness: 0.45, vertexColors: true })
  patch(
    m,
    'leather',
    `float lthH = 0.0;
    {
      vec3 q = vLthP / 0.016; // pebbles ~0.016 R
      float fw = length(fwidth(q));
      float vis = 1.0 - smoothstep(0.35, 0.9, fw);
      vec2 c = lthCells(q);
      float peb = smoothstep(0.0, 0.35, c.y - c.x); // raised pebbles, fine creases between them
      lthH += 0.0005 * (peb - 0.6) * vis;
      diffuseColor.rgb *= 1.0 + 0.04 * (peb - 0.6) * vis;
    }`,
  )
  cache.set(key, m)
  return m
}

/** Shearling: a close curly nap of little nubs, dark in the crevices. */
export function fleece(color: string): Material {
  const key = `fleece|${color}`
  const hit = cache.get(key)
  if (hit) return hit
  const m = new MeshStandardMaterial({ color: new Color(color), roughness: 0.95, metalness: 0, vertexColors: true })
  patch(
    m,
    'fleece',
    `float lthH = 0.0;
    {
      vec3 q = vLthP / 0.034; // nubs ~0.034 R
      float fw = length(fwidth(q));
      float vis = 1.0 - smoothstep(0.35, 0.9, fw);
      vec2 c = lthCells(q);
      float dome = sqrt(max(0.0, 1.0 - pow(c.x / 0.62, 2.0))); // a round nub on each cell
      float gap = smoothstep(0.0, 0.2, c.y - c.x); // the seam where two nubs meet
      float h = dome * gap;
      lthH += 0.011 * (h - 0.5) * vis;
      diffuseColor.rgb *= mix(0.85, 0.5 + 0.62 * h, vis); // dark in the crevices, lit on the tops
    }`,
  )
  cache.set(key, m)
  return m
}
