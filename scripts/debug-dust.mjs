// The title coming apart (src/ui/TitleDust.tsx): loads with ?dust=hold, lets the loader
// and the title play, freezes the dust as the intro begins and scrubs it to each offset
// (ms) — deterministic, however slow the renderer. Writes a strip of full frames and a
// strip of close-ups on the title.
//   node scripts/debug-dust.mjs [--vp 1600x900] [--dpr 2] [--at 0,200,400,650,900,1300,1700] [--paper 0]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import sharp from 'sharp'

const argv = process.argv.slice(2)
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`)
  return i >= 0 ? argv[i + 1] : d
}
const [w, h] = arg('vp', '1600x900').split('x').map(Number)
const dpr = Number(arg('dpr', '2'))
const at = arg('at', '0,200,400,650,900,1300,1700').split(',').map(Number)
const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { host: '127.0.0.1', port: 5199, strictPort: false } })
await server.listen()
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr })
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.goto(`http://127.0.0.1:${server.config.server.port}/?dust=hold&${arg('q', '')}`)
await page.waitForFunction(() => window.__dust, null, { timeout: 180000 })
console.log('dust', await page.evaluate(() => JSON.stringify({ ms: Math.round(window.__dust.duration), ...window.__dust.count })))
const box = await page.evaluate(() => window.__dust.rect) // the title's rect, css px
await page.waitForTimeout(1800) // the curtain has lifted
// --paper (default): judge the dust on the page colour, the scene hidden; --paper 0 shows the risen room
if (arg('paper', '1') !== '0') await page.addStyleTag({ content: '.scene { opacity: 0 !important; transition: none !important; }' })
const full = []
const close = []
for (const ms of at) {
  await page.evaluate((t) => window.__dust.seek(t), ms)
  await page.waitForTimeout(200)
  full.push({ buf: await page.screenshot({ timeout: 180000 }), label: `${ms} ms` })
  const clip = { x: Math.max(0, box.x - 40), y: Math.max(0, box.y - 30), width: Math.min(w, box.w + 80), height: Math.min(h - box.y + 30, box.h + 260) }
  close.push({ buf: await page.screenshot({ clip, timeout: 180000 }), label: `${ms} ms` })
}
await browser.close()
await server.close()

async function strip(shots, tw, cols, file) {
  const m = await sharp(shots[0].buf).metadata()
  const th = Math.round((tw * m.height) / m.width)
  const tiles = await Promise.all(
    shots.map(async (s) => {
      const img = await sharp(s.buf).resize({ width: tw }).png().toBuffer()
      const lab = Buffer.from(`<svg width="${tw}" height="24"><rect width="90" height="100%" fill="#fff"/><text x="6" y="17" font-size="14" font-family="Helvetica">${s.label}</text></svg>`)
      return sharp(img).composite([{ input: lab, top: 0, left: 0 }]).png().toBuffer()
    }),
  )
  await sharp({ create: { width: cols * tw, height: Math.ceil(tiles.length / cols) * th, channels: 3, background: '#fff' } })
    .composite(tiles.map((b, i) => ({ input: b, left: (i % cols) * tw, top: Math.floor(i / cols) * th })))
    .png()
    .toFile(file)
  console.log('wrote', file)
}
await strip(full, 800, 2, `shots/dust-strip-${w}x${h}.png`)
await strip(close, 1000, 1, `shots/dust-close-${w}x${h}.png`)
for (const [i, s] of close.entries()) await sharp(s.buf).toFile(`shots/dust-${at[i]}.png`)
