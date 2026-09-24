// Look at your own frames. Starts a dev server, screenshots the stage.
//   npm run shot -- --label p1 --q "grid=1&intro=0&motion=0" [--vp 1600x900,1280x720,390x844]
//                   [--series 300,900,1500,2400] [--dsf 1] [--wait 600] [--clip]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync } from 'node:fs'

const argv = process.argv.slice(2)
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d
}
const has = (k) => argv.includes(`--${k}`)

const label = arg('label', 'shot')
const q = arg('q', 'intro=0&motion=0')
const vps = arg('vp', '1600x900,1280x720,390x844').split(',').map((s) => s.split('x').map(Number))
const series = arg('series', '').split(',').filter(Boolean).map(Number)
const dsf = Number(arg('dsf', '1'))
const wait = Number(arg('wait', '700'))
const clipStage = has('clip')
const tap = arg('tap', '')  // name of a Zenek to open (via the accessible button list)
const click = arg('click', '') // 'x,y' viewport coords to click before the shot (raycast path)
const hover = arg('hover', '') // 'x,y' viewport coords to hover before the shot
const nowait = has('nowait') // do not wait for phase=ready (loader design checks)

mkdirSync('shots', { recursive: true })
const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { host: '127.0.0.1', port: 5199, strictPort: false } })
await server.listen()
const port = server.config.server.port
const base = `http://127.0.0.1:${port}/?${q}`

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
})

for (const [w, h] of vps) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dsf })
  page.on('pageerror', (e) => console.log(`[${w}x${h}] pageerror:`, e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`[${w}x${h}] console.${m.type()}:`, m.text().slice(0, 300))
  })
  const t0 = Date.now()
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  const shotOpts = async () => {
    if (!clipStage) return {}
    const box = await page.locator('.stage').boundingBox()
    return box ? { clip: box } : {}
  }
  if (series.length) {
    await page.waitForSelector('.loader, .scene canvas', { timeout: 30000 }).catch(() => {})
    const s0 = Date.now()
    for (const ms of series) {
      await page.waitForTimeout(Math.max(0, ms - (Date.now() - s0)))
      const path = `shots/${label}-${w}x${h}-${String(ms).padStart(4, '0')}ms.png`
      await page.screenshot({ path, ...(await shotOpts()) })
      console.log('wrote', path)
    }
  } else {
    const ok = nowait
      ? true
      : await page
          .waitForFunction(() => document.documentElement.dataset.phase === 'ready', null, { timeout: 40000 })
          .then(() => true)
          .catch(() => false)
    if (!ok) console.log(`[${w}x${h}] timed out waiting for phase=ready (phase=${await page.evaluate(() => document.documentElement.dataset.phase)})`)
    if (hover) {
      const [hx, hy] = hover.split(',').map(Number)
      await page.mouse.move(hx - 30, hy - 30)
      await page.waitForTimeout(120)
      await page.mouse.move(hx, hy)
      await page.waitForTimeout(700)
    }
    if (click) {
      const [cx, cy] = click.split(',').map(Number)
      await page.mouse.move(cx, cy)
      await page.mouse.down()
      await page.mouse.up()
      await page.waitForTimeout(600)
    }
    if (tap) {
      await page.evaluate((name) => {
        const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.trim() === name)
        b?.click()
      }, tap)
      await page.waitForTimeout(500)
    }
    await page.waitForTimeout(wait)
    const path = `shots/${label}-${w}x${h}.png`
    await page.screenshot({ path, ...(await shotOpts()) })
    console.log('wrote', path, `(${Date.now() - t0} ms)`)
  }
  await page.close()
}
await browser.close()
await server.close()
