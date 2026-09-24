// Gesture clearance sheet: every (character × gesture × view) as one labelled grid.
//   node scripts/gest-sheet.mjs --ids janek,magda-r --gest rest,wave,talk,stretch,laugh,shrug --az 0,40 --u 0.5 --out shots/r12-gest.png
import { chromium } from 'playwright'
import { createServer } from 'vite'
import sharp from 'sharp'

const argv = process.argv.slice(2)
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`)
  return i >= 0 ? argv[i + 1] : d
}
const ids = arg('ids', 'janek,magda-r').split(',')
const gests = arg('gest', 'rest,wave,talk').split(',')
const azs = arg('az', '0,40').split(',').map(Number)
const u = arg('u', '0.5')
const fov = arg('fov', '11.5')
const out = arg('out', 'shots/gest-sheet.png')
const S = 360

const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { host: '127.0.0.1', port: 5198, strictPort: false } })
await server.listen()
const port = server.config.server.port
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: S, height: S } })
const tiles = []
for (const id of ids)
  for (const g of gests)
    for (const az of azs) {
      const q = `lab=${id}&intro=0&motion=0&az=${az}&el=4&dist=12&fov=${fov}&tx=8.6&ty=0.8&tz=3${g === 'rest' ? '' : `&gest=${g}&gestu=${u}`}`
      await page.goto(`http://127.0.0.1:${port}/?${q}`)
      await page.waitForFunction(() => document.documentElement.dataset.phase === 'ready', null, { timeout: 40000 }).catch(() => {})
      await page.waitForTimeout(500)
      const buf = await page.screenshot()
      const label = Buffer.from(`<svg width="${S}" height="26"><rect width="100%" height="100%" fill="#fff"/><text x="8" y="18" font-family="Helvetica" font-size="14">${id} · ${g} · az ${az}</text></svg>`)
      tiles.push(await sharp(buf).composite([{ input: label, top: 0, left: 0 }]).png().toBuffer())
    }
await browser.close()
await server.close()
const cols = gests.length * azs.length
const rows = ids.length
await sharp({ create: { width: cols * S, height: rows * S, channels: 3, background: '#fff' } })
  .composite(tiles.map((b, i) => ({ input: b, left: (i % cols) * S, top: Math.floor(i / cols) * S })))
  .png()
  .toFile(out)
console.log('wrote', out)
