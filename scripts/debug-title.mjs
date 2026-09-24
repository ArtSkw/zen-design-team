// Title card frames: loads with ?title=hold, waits for data-phase=title, then pauses
// every animation on the page and scrubs it to each offset (ms) — deterministic, however
// slow the renderer — and composes a strip.
//   node scripts/debug-title.mjs [--vp 1600x900] [--at 150,450,800,1200,1800]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import sharp from 'sharp'

const argv = process.argv.slice(2)
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`)
  return i >= 0 ? argv[i + 1] : d
}
const [w, h] = arg('vp', '1600x900').split('x').map(Number)
const at = arg('at', '150,450,800,1200,1800,2300').split(',').map(Number)
const q = arg('q', 'title=hold')
const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { host: '127.0.0.1', port: 5197, strictPort: false } })
await server.listen()
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: w, height: h } })
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.goto(`http://127.0.0.1:${server.config.server.port}/?${q}`)
await page.waitForFunction(() => document.documentElement.dataset.phase === 'title', null, { timeout: 60000 })
await page.waitForTimeout(300)
const shots = []
for (const ms of at) {
  await page.evaluate((t) => window.__title?.seek(t), ms)
  await page.waitForTimeout(150)
  shots.push({ buf: await page.screenshot(), label: `${ms} ms` })
}
await browser.close()
await server.close()
const tw = 800
const th = Math.round((tw * h) / w)
const tiles = await Promise.all(
  shots.map(async (s) => {
    const img = await sharp(s.buf).resize({ width: tw }).png().toBuffer()
    const lab = Buffer.from(`<svg width="${tw}" height="24"><rect width="100%" height="100%" fill="#fff"/><text x="6" y="17" font-size="14" font-family="Helvetica">${s.label}</text></svg>`)
    return sharp(img).composite([{ input: lab, top: 0, left: 0 }]).png().toBuffer()
  }),
)
const cols = 2
await sharp({ create: { width: cols * tw, height: Math.ceil(tiles.length / cols) * th, channels: 3, background: '#fff' } })
  .composite(tiles.map((b, i) => ({ input: b, left: (i % cols) * tw, top: Math.floor(i / cols) * th })))
  .png()
  .toFile(`shots/title-strip-${w}x${h}.png`)
console.log('wrote', `shots/title-strip-${w}x${h}.png`, shots.map((s) => s.label).join(' | '))
