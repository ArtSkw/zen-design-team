// Check the title card's pen: (1) coverage — every letter rendered in full vs through
// its fully drawn pen mask; any ink the pen never reaches is counted and painted red;
// (2) a sheet of the pen paths over the letters (start = green dot, order numbered).
//   node scripts/title-pen-check.mjs  →  shots/title-pen-coverage.png, shots/title-pen-paths.png
import { createServer } from 'vite'
import sharp from 'sharp'

const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { middlewareMode: true } })
const { GLYPHS } = await server.ssrLoadModule('/src/ui/title-glyphs.ts')
const { PEN, NIB } = await server.ssrLoadModule('/src/ui/title-pen.ts')
await server.close()

const S = 6 // render scale
const VB = { x: 0, y: -2, w: 627, h: 58 }
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${VB.w * S}" height="${VB.h * S}" viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}"><rect x="${VB.x}" y="${VB.y}" width="${VB.w}" height="${VB.h}" fill="#fff"/>${body}</svg>`
const full = svg(GLYPHS.map((g) => `<path d="${g.d}" fill="#000"/>`).join(''))
const masked = svg(
  `<defs>${PEN.map((p, k) => `<mask id="m${k}" maskUnits="userSpaceOnUse" x="-20" y="-20" width="700" height="100">${[...p.strokes, ...(p.later ?? [])].map((d) => `<path d="${d}" fill="none" stroke="#fff" stroke-width="${NIB[p.weight]}" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</mask>`).join('')}</defs>` +
    GLYPHS.map((g, k) => `<path d="${g.d}" fill="#000" mask="url(#m${k})"/>`).join(''),
)
const A = await sharp(Buffer.from(full)).greyscale().raw().toBuffer({ resolveWithObject: true })
const B = await sharp(Buffer.from(masked)).greyscale().raw().toBuffer()
const { width, height } = A.info
const out = Buffer.alloc(width * height * 3)
const miss = new Array(GLYPHS.length).fill(0)
for (let p = 0; p < width * height; p++) {
  const a = 255 - A.data[p] // ink in the full render
  const b = 255 - B[p] // ink revealed by the pen
  const gap = a - b
  const x = (p % width) / S + VB.x
  if (gap > 60) {
    const k = GLYPHS.findIndex((g) => x >= g.box[0] - 1 && x <= g.box[2] + 1)
    if (k >= 0) miss[k]++
    out[p * 3] = 230
    out[p * 3 + 1] = 40
    out[p * 3 + 2] = 40
  } else {
    const v = 255 - Math.round(a * 0.35)
    out[p * 3] = out[p * 3 + 1] = out[p * 3 + 2] = v
  }
}
await sharp(out, { raw: { width, height, channels: 3 } }).png().toFile('shots/title-pen-coverage.png')
console.log('uncovered px (at ' + S + '×):', GLYPHS.map((g, k) => `${g.ch}:${miss[k]}`).join(' '))

// pen paths over the letters
const dots = []
const lines = []
PEN.forEach((p) => {
  ;[...p.strokes, ...(p.later ?? [])].forEach((d, j) => {
    const m = d.match(/M\s*(-?[\d.]+)\s+(-?[\d.]+)/)
    lines.push(`<path d="${d}" fill="none" stroke="#e5484d" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round"/>`)
    dots.push(`<circle cx="${m[1]}" cy="${m[2]}" r="1.3" fill="#1f9d55"/><text x="${+m[1] + 1.6}" y="${+m[2] - 1.2}" font-size="4" font-family="Helvetica" fill="#1f9d55">${j + 1}</text>`)
  })
})
const sheet = svg(GLYPHS.map((g) => `<path d="${g.d}" fill="#ddd"/>`).join('') + lines.join('') + dots.join(''))
await sharp(Buffer.from(sheet)).png().toFile('shots/title-pen-paths.png')
console.log('wrote shots/title-pen-coverage.png, shots/title-pen-paths.png')
