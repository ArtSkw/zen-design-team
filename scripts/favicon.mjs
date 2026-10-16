// The favicon, rendered from the mascot itself: Zenek alone (`?lab=zenek`), lit by the room's own
// rig, on a transparent ground, then cut to the sizes a browser and a home screen ask for.
//   node scripts/favicon.mjs [--fill 0.96] [--az 0] [--el 8] [--fov 15] [--chrome <path>] [--out public]
// Writes favicon-16.png, favicon-32.png, favicon-48.png, favicon-512.png (transparent) and
// apple-touch-icon.png (180 px, on the page's paper: iOS fills a transparent icon with black).
import { chromium } from 'playwright'
import { createServer } from 'vite'
import sharp from 'sharp'

const argv = process.argv.slice(2)
const arg = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d)
const OUT = arg('out', 'public')
const CHROME = arg('chrome', '')
const PAPER = '#FDFDFC' // the page's own ground (index.html theme-color)

const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { host: '127.0.0.1', port: 5196, strictPort: false } })
await server.listen()
const port = server.config.server.port
const browser = await chromium.launch({ ...(CHROME ? { executablePath: CHROME } : {}), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 2 })
page.on('pageerror', (e) => console.log('pageerror:', e.message))

// the lab's Zenek sits at (8.6, 0, −3); look at the middle of the body, from the front
async function render(hands) {
  const q = new URLSearchParams({ lab: 'zenek', hands: hands ? '1' : '0', intro: '0', motion: '0', snd: '0', az: arg('az', '0'), el: arg('el', '8'), dist: '10', fov: arg('fov', '15'), tx: '8.6', ty: '0.78', tz: '3' })
  await page.goto(`http://127.0.0.1:${port}/?${q}`)
  await page.addStyleTag({ content: 'html, body, #root, .stage, .stage--lab, .scene { background: transparent !important; } .vc, .tip, .name-tag { display: none !important; }' })
  await page.waitForFunction(() => document.documentElement.dataset.phase === 'ready', null, { timeout: 120000 })
  await page.waitForTimeout(1500)
  return page.screenshot({ omitBackground: true })
}
const shot = await render(true)
const body = await render(false)
await browser.close()
await server.close()

// The tab sizes show the body alone: with his hands Zenek is wide, so a square that held all of
// him left him small beside other tabs' icons, and cropping in cut his hands off (2026-10-16).
// Round, he fills the square as the neighbours do; `fill` is how much of it he takes.
const FILL = Number(arg('fill', '0.96'))
const disc = await sharp(body).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true })
const side = Math.round(Math.max(disc.info.width, disc.info.height) / FILL)
const square = await sharp({ create: { width: side, height: side, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: disc.data, left: Math.round((side - disc.info.width) / 2), top: Math.round((side - disc.info.height) / 2) }])
  .png()
  .toBuffer()
const trimmed = await sharp(shot).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true })
// the large icons have room for all of him: hands and all, a little air round
const wside = Math.round(Math.max(trimmed.info.width, trimmed.info.height) * 1.04)
const whole = await sharp({ create: { width: wside, height: wside, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: trimmed.data, left: Math.round((wside - trimmed.info.width) / 2), top: Math.round((wside - trimmed.info.height) / 2) }])
  .png()
  .toBuffer()

// A thin light rim round the silhouette: nothing on a light tab, but on a dark one the black
// body would sink into the bar without it. Built at 4× the size, then brought down, so it is
// about a pixel at 16 and 32.
async function icon(s) {
  const k = 4
  const big = await sharp(square).resize(s * k, s * k, { kernel: 'lanczos3' }).png().toBuffer()
  const alpha = await sharp(big).extractChannel('alpha').blur(Math.max(1.2, (s * k) / 40)).threshold(8).toBuffer()
  const rim = await sharp({ create: { width: s * k, height: s * k, channels: 3, background: '#F4F3EF' } }).joinChannel(await sharp(alpha).linear(0.92, 0).toBuffer()).png().toBuffer()
  const lit = await sharp(rim).composite([{ input: big }]).png().toBuffer()
  return sharp(lit).resize(s, s, { kernel: 'lanczos3' }).png({ compressionLevel: 9 })
}
for (const s of [16, 32, 48]) await (await icon(s)).toFile(`${OUT}/favicon-${s}.png`)
await sharp(whole).resize(512, 512, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(`${OUT}/favicon-512.png`)
// the home-screen icon: on paper, with more air (iOS rounds the corners off)
const inner = await sharp(whole).resize(146, 146, { kernel: 'lanczos3' }).toBuffer()
await sharp({ create: { width: 180, height: 180, channels: 4, background: PAPER } }).composite([{ input: inner, left: 17, top: 17 }]).png().toFile(`${OUT}/apple-touch-icon.png`)
console.log(`mascot ${trimmed.info.width}×${trimmed.info.height} px → ${OUT}/favicon-{16,32,48,512}.png, ${OUT}/apple-touch-icon.png`)
