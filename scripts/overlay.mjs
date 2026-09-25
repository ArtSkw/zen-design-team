// Design vs render at the same scale: the design is scaled and moved so its body circle
// lands on the render's (the lab's front view: centre (320, 315), R 193 px in a 640 tile
// of scripts/cast-cmp.mjs), then shown as [design | render | half-and-half blend].
//   node scripts/overlay.mjs shots/cmp-lukasz-d.png --design 625,702,413 [--ref docs/cast/lukasz-d.png] [--tile 1] [--out shots/ov-lukasz-d.png]
//   --design cx,cy,Rx,Ry reads a design drawn a touch oval on its own ellipse (scaled to the render's circle each way)
import sharp from 'sharp'
const argv = process.argv.slice(2)
const cmp = argv[0]
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`)
  return i >= 0 ? argv[i + 1] : d
}
const id = cmp.replace(/^.*cmp-/, '').replace(/(-p\d+)?\.png$/, '')
const ref = arg('ref', `docs/cast/${id}.png`)
const [dcx, dcy, dR, dRy = dR] = arg('design', '627,640,400').split(',').map(Number)
const tile = Number(arg('tile', '1'))
const out = arg('out', `shots/ov-${id}.png`)
const S = 640
const [rcx, rcy, rR] = [320, 315, 193]
const render = await sharp(cmp).extract({ left: tile * (S + 8), top: 0, width: S, height: S }).png().toBuffer()
const k = rR / dR
const ky = rR / dRy
const meta = await sharp(ref).metadata()
const W = Math.round(meta.width * k)
const H = Math.round(meta.height * ky)
const scaled = await sharp(ref).resize(W, H, { fit: 'fill' }).png().toBuffer()
const left = Math.round(rcx - dcx * k)
const top = Math.round(rcy - dcy * ky)
// place the scaled design on a 640 canvas (it may overhang: crop to the canvas)
const cl = Math.max(0, -left)
const ct = Math.max(0, -top)
const cw = Math.min(W - cl, S - Math.max(0, left))
const ch = Math.min(H - ct, S - Math.max(0, top))
const piece = await sharp(scaled).extract({ left: cl, top: ct, width: cw, height: ch }).png().toBuffer()
const design = await sharp({ create: { width: S, height: S, channels: 4, background: '#dedbd4' } })
  .composite([{ input: piece, left: Math.max(0, left), top: Math.max(0, top) }])
  .flatten({ background: '#dedbd4' })
  .png()
  .toBuffer()
const half = await sharp(design).ensureAlpha(0.5).png().toBuffer()
const blend = await sharp(render).composite([{ input: await sharp(half).ensureAlpha().raw().toBuffer().then((b) => { for (let i = 3; i < b.length; i += 4) b[i] = 128; return sharp(b, { raw: { width: S, height: S, channels: 4 } }).png().toBuffer() }) }]).png().toBuffer()
// circle guide on every panel
const guide = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><circle cx="${rcx}" cy="${rcy}" r="${rR}" fill="none" stroke="#ff2a8a" stroke-width="1" stroke-dasharray="4 4"/><line x1="0" y1="${rcy}" x2="${S}" y2="${rcy}" stroke="#ff2a8a" stroke-width="0.6" stroke-dasharray="2 6"/></svg>`)
const panels = await Promise.all([design, render, blend].map((b) => sharp(b).composite([{ input: guide }]).png().toBuffer()))
await sharp({ create: { width: S * 3 + 16, height: S, channels: 3, background: '#fff' } })
  .composite(panels.map((b, i) => ({ input: b, left: i * (S + 8), top: 0 })))
  .png()
  .toFile(out)
console.log('wrote', out)
