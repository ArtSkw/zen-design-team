import { CanvasTexture, RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from 'three'
import { mulberry32 } from '../lib/rng'

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return { c, ctx: c.getContext('2d')! }
}

let planks: CanvasTexture | null = null
export function plankTexture() {
  if (planks) return planks
  const { c, ctx } = canvas(1024, 1024)
  const rng = mulberry32(5)
  ctx.fillStyle = '#d7b787'
  ctx.fillRect(0, 0, 1024, 1024)
  const rowH = 1024 / 9
  for (let i = 0; i < 9; i++) {
    const tone = 0.94 + rng() * 0.12
    ctx.fillStyle = `rgb(${Math.round(215 * tone)}, ${Math.round(183 * tone)}, ${Math.round(135 * tone)})`
    ctx.fillRect(0, i * rowH, 1024, rowH)
    // faint grain
    ctx.strokeStyle = 'rgba(120, 80, 40, 0.10)'
    ctx.lineWidth = 1.2
    for (let k = 0; k < 7; k++) {
      const y = i * rowH + 8 + rng() * (rowH - 16)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.bezierCurveTo(300, y + (rng() - 0.5) * 6, 700, y + (rng() - 0.5) * 6, 1024, y + (rng() - 0.5) * 4)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(90, 60, 30, 0.35)'
    ctx.fillRect(0, i * rowH, 1024, 2)
    // plank end joints, staggered
    const jx = (i * 373 + 200) % 1024
    ctx.fillRect(jx, i * rowH, 2, rowH)
  }
  planks = new CanvasTexture(c)
  planks.colorSpace = SRGBColorSpace
  planks.wrapS = planks.wrapT = RepeatWrapping
  planks.anisotropy = 8
  return planks
}

let gravel: CanvasTexture | null = null
// Raked gravel with rings around the stones (positions in 0..1 of the bed).
export function gravelTexture(stones: [number, number][]) {
  if (gravel) return gravel
  const S = 1024
  const { c, ctx } = canvas(S, S)
  ctx.fillStyle = '#d9d6d0'
  ctx.fillRect(0, 0, S, S)
  ctx.strokeStyle = 'rgba(120, 116, 110, 0.35)'
  ctx.lineWidth = 3
  // straight rake lines
  for (let y = 0; y < S; y += 22) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(S, y)
    ctx.stroke()
  }
  // rings around stones, painted over the lines
  for (const [sx, sy] of stones) {
    const cx = sx * S
    const cy = sy * S
    const fill = ctx.createRadialGradient(cx, cy, 0, cx, cy, 240)
    fill.addColorStop(0, '#d9d6d0')
    fill.addColorStop(1, 'rgba(217,214,208,0)')
    ctx.fillStyle = fill
    ctx.beginPath()
    ctx.arc(cx, cy, 240, 0, Math.PI * 2)
    ctx.fill()
    for (let r = 40; r < 240; r += 22) {
      ctx.globalAlpha = 1 - (r - 40) / 220
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
  // fine grain
  const rng = mulberry32(9)
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.25)' : 'rgba(80,78,74,0.18)'
    ctx.fillRect(rng() * S, rng() * S, 2, 2)
  }
  gravel = new CanvasTexture(c)
  gravel.colorSpace = SRGBColorSpace
  gravel.anisotropy = 8
  return gravel
}

// The ZEN.COM wall mark from the brand SVG (public/set/zen-logo.svg, 440 × 101),
// rasterised at 4× and rotated a quarter turn clockwise so it reads top to
// bottom on the wall, as in the reference. Resolves once the SVG image decodes.
export const LOGO_ASPECT = 440 / 101
let logoPromise: Promise<CanvasTexture> | null = null
export function logoTexture(): Promise<CanvasTexture> {
  if (logoPromise) return logoPromise
  logoPromise = new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const k = 4
      const w = 101 * k
      const h = 440 * k
      const { c, ctx } = canvas(w, h)
      ctx.clearRect(0, 0, w, h)
      ctx.translate(w, 0)
      ctx.rotate(Math.PI / 2)
      ctx.drawImage(img, 0, 0, 440 * k, 101 * k)
      const t = new CanvasTexture(c)
      t.colorSpace = SRGBColorSpace
      t.anisotropy = 8
      resolve(t)
    }
    img.onerror = reject
    img.src = `${import.meta.env.BASE_URL}set/zen-logo.svg`
  })
  return logoPromise
}

let poster: Texture | null = null
export function posterTexture(onLoad?: () => void) {
  if (poster) {
    onLoad?.()
    return poster
  }
  poster = new TextureLoader().load(`${import.meta.env.BASE_URL}set/poster.jpg`, () => onLoad?.())
  poster.colorSpace = SRGBColorSpace
  poster.anisotropy = 8
  return poster
}
