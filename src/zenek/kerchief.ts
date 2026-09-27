import { CanvasTexture, Color, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type Material, type WebGLProgramParametersWithUniforms } from 'three'
import { KERCHIEF_C, KERCHIEF_N } from './edyta-layout'

// The print on Edyta's kerchief (docs/cast/edyta.png): gold on wine-red cotton — crescent
// moons, little suns, stars and dots scattered over it, and a border of gold dots and a line
// following its front edge. The kerchief is a baked sculpt with no uvs: the motifs are one tile
// drawn on a canvas, projected triplanar from the mesh's position;
// the border is drawn from the distance to the kerchief's edge plane (edyta-layout.ts). Fine
// detail fades to its average below a pixel, as everywhere in the cast.

function tile() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.strokeStyle = '#ffffff'
  const moon = (x: number, y: number, r: number, a: number) => {
    g.save()
    g.translate(x, y)
    g.rotate(a)
    // a disc with a smaller one cut out of it (each its own subpath: without the moveTo, arc()
    // joins them with a line and the cut-out never closes — full discs, not crescents)
    g.beginPath()
    g.arc(0, 0, r, 0, Math.PI * 2)
    g.moveTo(r * 0.42 + r * 0.82, -r * 0.18)
    g.arc(r * 0.42, -r * 0.18, r * 0.82, 0, Math.PI * 2, true)
    g.fill('evenodd')
    g.restore()
  }
  const sun = (x: number, y: number, r: number) => {
    g.beginPath()
    g.arc(x, y, r * 0.45, 0, Math.PI * 2)
    g.fill()
    g.lineWidth = r * 0.14
    g.lineCap = 'round'
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      g.beginPath()
      g.moveTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62)
      g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
      g.stroke()
    }
  }
  const star = (x: number, y: number, r: number, pts = 4) => {
    g.beginPath()
    for (let i = 0; i < pts * 2; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / pts
      const rr = i % 2 ? r * 0.32 : r
      g.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a))
    }
    g.closePath()
    g.fill()
  }
  const dot = (x: number, y: number, r: number) => {
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  // one repeat, motifs kept off the tile's edges so it wraps seamlessly
  moon(70, 72, 34, -0.5)
  sun(186, 150, 30)
  star(190, 50, 14)
  star(58, 190, 12, 5)
  star(128, 210, 7)
  star(120, 30, 6)
  for (const [x, y] of [[128, 110], [30, 128], [226, 226], [100, 160], [226, 96], [160, 230], [30, 30]]) dot(x, y, 3.5)
  const tex = new CanvasTexture(c)
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

const cache = new Map<string, Material>()

export function kerchief(color: string, gold: string): Material {
  const key = `${color}|${gold}`
  const hit = cache.get(key)
  if (hit) return hit
  const m = new MeshStandardMaterial({ color: new Color(color), roughness: 0.86, metalness: 0, vertexColors: true })
  const tex = tile()
  m.onBeforeCompile = (sh: WebGLProgramParametersWithUniforms) => {
    sh.uniforms.uPrint = { value: tex }
    sh.uniforms.uGold = { value: new Color(gold) }
    sh.uniforms.uEdgeN = { value: KERCHIEF_N }
    sh.uniforms.uEdgeC = { value: KERCHIEF_C }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vKP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKP = position;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uPrint;\nuniform vec3 uGold;\nuniform vec3 uEdgeN;\nuniform float uEdgeC;\nvarying vec3 vKP;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 d = normalize(vKP);
          // triplanar: the tile projected along each axis, blended by how squarely the cloth faces
          // it (a yaw/pitch mapping sheared the motifs into ovals toward the back and left a seam)
          vec3 tw = d * d;
          tw *= tw;
          tw /= (tw.x + tw.y + tw.z);
          vec3 tp = vKP / 0.46; // a repeat every 0.46 R
          float motif = texture2D(uPrint, tp.zy).a * tw.x + texture2D(uPrint, tp.xz).a * tw.y + texture2D(uPrint, tp.xy).a * tw.z;
          // the border along the front edge: a row of dots and a line inside it
          float s = dot(d, uEdgeN) - uEdgeC;
          vec3 b1 = normalize(cross(uEdgeN, vec3(0.0, 0.0, 1.0)));
          vec3 b2 = cross(uEdgeN, b1);
          float along = atan(dot(d, b1), dot(d, b2)) * 34.0; // dots round the edge
          float fa = fwidth(along);
          vec2 q = vec2((fract(along) - 0.5) / 34.0 * 1.0, s - 0.055);
          float dotm = 1.0 - smoothstep(0.0075, 0.0075 + fwidth(s) * 1.5, length(vec2(q.x * 0.9, q.y)));
          float line = 1.0 - smoothstep(0.003, 0.003 + fwidth(s) * 1.5, abs(s - 0.085));
          float vis = 1.0 - smoothstep(0.35, 0.8, fa);
          float border = max(dotm * vis, line) * step(0.0, s);
          float gold = max(motif * step(0.1, s), border);
          diffuseColor.rgb = mix(diffuseColor.rgb, uGold, gold * 0.92);
        }`,
      )
  }
  m.customProgramCacheKey = () => 'kerchief'
  cache.set(key, m)
  return m
}
