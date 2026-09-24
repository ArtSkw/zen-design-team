// Close-up frames of the held title card at 2× (scrubbed like debug-title.mjs),
// cropped to the line and stacked.   node scripts/debug-title-zoom.mjs --at 400,520,640,...
import { chromium } from 'playwright'
import { createServer } from 'vite'
import sharp from 'sharp'
const argv = process.argv.slice(2)
const at = (argv[argv.indexOf('--at') + 1] ?? '500,700,900').split(',').map(Number)
const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { host: '127.0.0.1', port: 5196, strictPort: false } })
await server.listen()
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 })
await page.goto(`http://127.0.0.1:${server.config.server.port}/?title=hold`)
await page.waitForFunction(() => document.documentElement.dataset.phase === 'title', null, { timeout: 60000 })
await page.waitForTimeout(300)
const box = await page.locator('.tc-svg').boundingBox()
const tiles = []
for (const ms of at) {
  await page.evaluate((t) => window.__title?.seek(t), ms)
  await page.waitForTimeout(120)
  const buf = await page.screenshot({ clip: { x: box.x - 10, y: box.y - 6, width: box.width + 20, height: box.height + 12 } })
  const lab = Buffer.from(`<svg width="120" height="30"><text x="4" y="20" font-size="18" font-family="Helvetica" fill="#999">${ms} ms</text></svg>`)
  tiles.push(await sharp(buf).composite([{ input: lab, top: 0, left: 0 }]).png().toBuffer())
}
await browser.close()
await server.close()
const m = await sharp(tiles[0]).metadata()
await sharp({ create: { width: m.width, height: m.height * tiles.length, channels: 3, background: '#fff' } })
  .composite(tiles.map((b, i) => ({ input: b, left: 0, top: i * m.height })))
  .png()
  .toFile('shots/title-zoom.png')
console.log('wrote shots/title-zoom.png')
