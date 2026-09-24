// Design vs render, for the img2threejs-style review loop: the approved 2D design on
// the left, the character in the lab at several azimuths beside it (0 = facing).
//   node scripts/cast-cmp.mjs krystian [--az 0,35,-35]   (views past the orbit's limits turn the Zenek instead: --az 180 = the back) [--q extra] [--out shots/cmp-krystian.png]
//   … --glb img2/krystian/meshy/model.glb   adds a second row: the image-to-3D result, same views
import { chromium } from 'playwright'
import { createServer } from 'vite'
import sharp from 'sharp'
const argv = process.argv.slice(2)
const id = argv[0]
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`)
  return i >= 0 ? argv[i + 1] : d
}
const azs = arg('az', '0,35,-35').split(',').map(Number)
const extra = arg('q', '')
const out = arg('out', `shots/cmp-${id}.png`)
const ref = arg('ref', `docs/cast/${id}.png`)
const glb = arg('glb', '') // an image-to-3D result (scripts/gen3d.mjs): a second row, same views
const S = 640
const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { host: '127.0.0.1', port: 5195, strictPort: false } })
await server.listen()
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: S, height: S } })
page.on('pageerror', (e) => console.log('pageerror', e.message))
const tiles = []
for (const az of azs) {
  const turn = az < -50 || az > 115
  await page.goto(`http://127.0.0.1:${server.config.server.port}/?lab=${id}&intro=0&motion=0&az=${turn ? 0 : az}&labyaw=${turn ? -az : 0}&el=${arg('el', '1')}&dist=13.5&fov=11.5&tx=8.6&ty=0.8&tz=3&${extra}`)
  await page.waitForFunction(() => document.documentElement.dataset.phase === 'ready', null, { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(1200) // sculpts stream in
  tiles.push(await page.screenshot())
}
const glbTiles = []
if (glb)
  for (const az of azs) {
    await page.goto(`http://127.0.0.1:${server.config.server.port}/?lab=${id}&intro=0&motion=0&az=${az}&el=${arg('el', '1')}&dist=13.5&fov=11.5&tx=8.6&ty=0.8&tz=3&glb=${encodeURIComponent(glb)}&${extra}`)
    await page.waitForFunction(() => document.documentElement.dataset.phase === 'ready', null, { timeout: 60000 }).catch(() => {})
    await page.waitForTimeout(2500)
    glbTiles.push(await page.screenshot())
  }
await browser.close()
await server.close()
const r = await sharp(ref).flatten({ background: '#dedbd4' }).resize(S, S, { fit: 'contain', background: '#dedbd4' }).png().toBuffer()
const all = [r, ...tiles]
const rows = glb ? [all, [r, ...glbTiles]] : [all]
await sharp({ create: { width: S * all.length + 8 * (all.length - 1), height: S * rows.length + 8 * (rows.length - 1), channels: 3, background: '#fff' } })
  .composite(rows.flatMap((row, y) => row.map((b, i) => ({ input: b, left: i * (S + 8), top: y * (S + 8) }))))
  .png()
  .toFile(out)
console.log('wrote', out)
