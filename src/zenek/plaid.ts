import { Color, MeshStandardMaterial, type Material, type WebGLProgramParametersWithUniforms } from 'three'

// Flannel tartan for Aneta's shirt (docs/cast/aneta.png): a deep teal-green ground with
// navy bands and a double white stripe, woven as a 2/2 twill — where a warp stripe
// crosses a weft stripe the colours mix thread by thread, which is what makes a tartan
// read as cloth, not as a printed grid. Computed in the shader from the mesh's own
// position (no UVs on a baked sculpt): the fronts and the back are unrolled round the
// vertical axis, each from its own centre (arc length, so the stripes hang straight down;
// the two meet at the side seams), a collar the same but turned, the way it is cut. The sett is box-filtered over each pixel and the twill fades to its average where
// a thread is smaller than a pixel, so the pattern never shimmers. The baked crease
// shading (vertex colours) darkens it in the folds.

// One repeat of the sett, as band edges (fractions of the repeat) and colours between them.
const EDGES = [0, 0.13, 0.22, 0.35, 0.53, 0.82, 1]
const BANDS = ['#d9d6cc', '#12232c', '#d9d6cc', '#1d4c4b', '#12232c', '#1a4545']

export type PlaidOpts = { axis: 'body' | 'collar'; repeat?: number; threads?: number; offset?: [number, number]; shade?: number }

const cache = new Map<string, Material>()

export function plaid(o: PlaidOpts): Material {
  const { axis, repeat = 0.31, threads = 60, offset = [0, 0], shade = 1 } = o
  const key = `${axis}|${repeat}|${threads}|${offset.join(',')}|${shade}`
  const hit = cache.get(key)
  if (hit) return hit
  const m = new MeshStandardMaterial({ color: new Color(shade, shade, shade), roughness: 0.9, metalness: 0, vertexColors: true })
  const cols = BANDS.map((c) => new Color(c)) // linear, as the shader works
  const total = new Color(0, 0, 0)
  cols.forEach((c, i) => total.add(c.clone().multiplyScalar(EDGES[i + 1] - EDGES[i])))
  m.onBeforeCompile = (sh: WebGLProgramParametersWithUniforms) => {
    sh.uniforms.uPlaidAxis = { value: axis === 'collar' ? 1 : 0 }
    sh.uniforms.uPlaidRepeat = { value: repeat }
    sh.uniforms.uPlaidThreads = { value: threads }
    sh.uniforms.uPlaidOffset = { value: offset }
    sh.uniforms.uPlaidCols = { value: cols }
    sh.uniforms.uPlaidTotal = { value: total }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPlaidP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPlaidP = position;')
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vPlaidP;
        uniform float uPlaidAxis;
        uniform float uPlaidRepeat;
        uniform float uPlaidThreads;
        uniform vec2 uPlaidOffset;
        uniform vec3 uPlaidCols[${BANDS.length}];
        uniform vec3 uPlaidTotal;
        const float PLAID_EDGES[${EDGES.length}] = float[${EDGES.length}](${EDGES.map((e) => e.toFixed(4)).join(', ')});
        // the colour integrated from 0 to x (x in repeats)
        vec3 plaidI(float x) {
          float f = fract(x);
          vec3 acc = floor(x) * uPlaidTotal;
          for (int i = 0; i < ${BANDS.length}; i++) acc += uPlaidCols[i] * clamp(f - PLAID_EDGES[i], 0.0, PLAID_EDGES[i + 1] - PLAID_EDGES[i]);
          return acc;
        }
        // the sett's colour averaged over a pixel's footprint
        vec3 plaidSett(float s, float fw) {
          float w = max(0.5 * fw, 1e-4);
          return (plaidI(s + w) - plaidI(s - w)) / (2.0 * w);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 pu;
          // the fronts unrolled from the front's centre and the back from the back's: the
          // stripes hang straight on both and meet at the side seams
          float hr = max(length(vPlaidP.xz), 0.3);
          vec2 q = vec2(atan(vPlaidP.x, abs(vPlaidP.z)) * hr, vPlaidP.y);
          if (uPlaidAxis < 0.5) pu = q;
          else {
            // a collar, cut on its own: the stripes turned at the points, the two sides
            // mirrored, running straight round the back of the neck
            float a = 0.6 * sign(vPlaidP.x) * clamp(vPlaidP.z / hr, 0.0, 1.0);
            pu = vec2(cos(a) * q.x - sin(a) * q.y, sin(a) * q.x + cos(a) * q.y);
          }
          pu = pu / uPlaidRepeat + uPlaidOffset;
          vec2 fw = min(fwidth(pu), vec2(0.5));
          vec3 warp = plaidSett(pu.x, fw.x);
          vec3 weft = plaidSett(pu.y, fw.y);
          vec2 th = pu * uPlaidThreads;
          float over = mod(floor(th.x) + floor(th.y), 4.0) < 2.0 ? 1.0 : 0.0;
          over = mix(over, 0.5, smoothstep(0.3, 0.8, max(fw.x, fw.y) * uPlaidThreads));
          diffuseColor.rgb *= mix(weft, warp, over);
        }`,
      )
  }
  m.customProgramCacheKey = () => 'plaid'
  cache.set(key, m)
  return m
}
