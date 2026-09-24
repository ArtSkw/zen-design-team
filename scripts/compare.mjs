// Side-by-side comparison sheet: reference | render, equal height.
import sharp from 'sharp'
const [ref, render, out] = process.argv.slice(2)
const H = 800
const a = await sharp(ref).flatten({ background: '#dedbd4' }).resize({ height: H }).png().toBuffer()
const b = await sharp(render).resize({ height: H }).png().toBuffer()
const ma = await sharp(a).metadata()
const mb = await sharp(b).metadata()
await sharp({ create: { width: ma.width + mb.width + 24, height: H, channels: 3, background: '#ffffff' } })
  .composite([{ input: a, left: 0, top: 0 }, { input: b, left: ma.width + 24, top: 0 }])
  .png()
  .toFile(out)
console.log('wrote', out)
