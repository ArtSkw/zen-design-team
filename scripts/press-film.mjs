// The loader's check becoming "Kontynuuj", and going: frames frozen with the dev hook
// window.__press.seek(t, 'in' | 'out'), laid out as a filmstrip in shots/press-film.png.
//   node scripts/press-film.mjs [--vp 1280x800] [--dsf 2]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import sharp from 'sharp'

const argv = process.argv.slice(2)
const arg = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d)
const [W, H] = arg('vp', '1280x800').split('x').map(Number)
const dsf = Number(arg('dsf', '2'))
const IN = [0, 0.07, 0.14, 0.2, 0.26, 0.32, 0.4, 0.5, 0.65, 0.9, 1.35]
const OUT = [0, 0.08, 0.16, 0.24, 0.33, 0.4, 0.46, 0.53, 0.6, 0.68]

const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { host: '127.0.0.1', port: 5192, strictPort: false } })
await server.listen()
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: dsf })
page.on('pageerror', (e) => console.log('pageerror:', e.message))
let waiting
const asked = new Promise((r) => (waiting = r))
page.on('console', (m) => m.text() === '[press] waiting' && waiting())
await page.goto(`http://127.0.0.1:${server.config.server.port}/?press=1`) // listened to, not touched, until it asks
await asked
await page.waitForTimeout(600)
const box = await page.evaluate(() => {
  const r = document.querySelector('.kont').getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
})
const clip = { x: box.x - 160, y: box.y - 62, width: 320, height: 124 }
const frames = []
for (const [which, ts] of [['in', IN], ['out', OUT]])
  for (const t of ts) {
    await page.evaluate(([t, w]) => window.__press.seek(t, w), [t, which])
    await page.waitForTimeout(60)
    frames.push({ which, t, png: await page.screenshot({ clip }) })
  }
await browser.close()
await server.close()

// a sheet: the opening on the first rows, the closing below, each frame with its time
const cw = clip.width * dsf
const ch = clip.height * dsf
const cols = 6
const rows = Math.ceil(IN.length / cols) + Math.ceil(OUT.length / cols)
const pad = 16 * dsf
const label = 22 * dsf
const sheet = sharp({ create: { width: cols * (cw + pad) + pad, height: rows * (ch + label + pad) + pad, channels: 3, background: '#e9e7e2' } })
const parts = []
let row = 0
for (const which of ['in', 'out']) {
  const set = frames.filter((f) => f.which === which)
  set.forEach((f, i) => {
    const x = pad + (i % cols) * (cw + pad)
    const y = pad + (row + Math.floor(i / cols)) * (ch + label + pad)
    parts.push({ input: f.png, left: x, top: y + label })
    const svg = `<svg width="${cw}" height="${label}"><text x="2" y="${label - 6 * dsf}" font-family="Helvetica" font-size="${13 * dsf}" fill="#555">${which} ${f.t.toFixed(2)} s</text></svg>`
    parts.push({ input: Buffer.from(svg), left: x, top: y })
  })
  row += Math.ceil(set.length / cols)
}
await sheet.composite(parts).png().toFile('shots/press-film.png')
console.log('shots/press-film.png')
