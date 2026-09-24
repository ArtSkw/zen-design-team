// Matched close-up: the same frontal region (fractions of R) from the design and from
// the lab, rendered with a camera aimed at that region (no cropping guesses).
//   node scripts/cmp-zoom.mjs mateusz-n --design 626,624,419 --box -0.5,0.5,-0.1,-0.78
import { chromium } from 'playwright'
import { createServer } from 'vite'
import sharp from 'sharp'
const argv = process.argv.slice(2)
const id = argv[0]
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`)
  return i >= 0 ? argv[i + 1] : d
}
const [dcx, dcy, dR] = arg('design', '627,640,400').split(',').map(Number)
const [x0, x1, y0, y1] = arg('box', '-0.5,0.5,0,-0.7').split(',').map(Number)
const R = 0.82 // world radius; the lab Zenek's centre is at (8.6, R, -3)
const W = 640
const H = Math.round((W * (y0 - y1)) / (x1 - x0))
const dist = 13.5
const fov = (2 * Math.atan(((y0 - y1) * R) / 2 / (dist - R)) * 180) / Math.PI // the box sits on the front of the body
const ty = R + ((y0 + y1) / 2) * R
const tx = 8.6 + ((x0 + x1) / 2) * R
const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { host: '127.0.0.1', port: 5194, strictPort: false } })
await server.listen()
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: W, height: H } })
await page.goto(`http://127.0.0.1:${server.config.server.port}/?lab=${id}&intro=0&motion=0&az=0&el=0.01&dist=${dist}&fov=${fov.toFixed(4)}&tx=${tx}&ty=${ty}&tz=3`)
await page.waitForFunction(() => document.documentElement.dataset.phase === 'ready', null, { timeout: 60000 }).catch(() => {})
await page.waitForTimeout(1500)
const r = await page.screenshot()
await browser.close()
await server.close()
const d = await sharp(`docs/cast/${id}.png`)
  .extract({ left: Math.round(dcx + x0 * dR), top: Math.round(dcy - y0 * dR), width: Math.round((x1 - x0) * dR), height: Math.round((y0 - y1) * dR) })
  .resize(W, H)
  .png()
  .toBuffer()
await sharp({ create: { width: W * 2 + 8, height: H, channels: 3, background: '#fff' } })
  .composite([{ input: d, left: 0, top: 0 }, { input: r, left: W + 8, top: 0 }])
  .png()
  .toFile(`shots/zoom-${id}.png`)
console.log('wrote', `shots/zoom-${id}.png`)
