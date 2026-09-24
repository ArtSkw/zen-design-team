// Frame rate at the home view, zoomed in on the cast, and zoomed in while rotating — on
// a canvas big enough (2560×1600 at 2×) to make this machine's GPU the bottleneck, as a
// phone's GPU is. The production build (run `npm run build` first); `node scripts/perf-zoom.mjs [query]`.
import { chromium } from 'playwright'
import { preview } from 'vite'
const q = process.argv[2] ?? ''
const server = await preview({ configFile: 'vite.config.ts', logLevel: 'silent', preview: { host: '127.0.0.1', port: 4188, strictPort: false } })
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] })
const page = await browser.newPage({ viewport: { width: 2560, height: 1600 }, deviceScaleFactor: 2 })
page.on('pageerror', (e) => console.log('pageerror', e.message))
const fps = async (secs, during) => {
  const f0 = await page.evaluate(() => { window.__worst = 0; return window.__f })
  const t0 = Date.now()
  await (during ? during(secs) : page.waitForTimeout(secs * 1000))
  const r = await page.evaluate(() => ({ f: window.__f, worst: Math.round(window.__worst) }))
  return `fps ${String(Math.round((r.f - f0) / ((Date.now() - t0) / 1000))).padStart(3)}  worst ${r.worst} ms`
}
const drag = async (secs) => {
  const end = Date.now() + secs * 1000
  let dir = 1
  await page.mouse.move(1280, 800)
  await page.mouse.down()
  while (Date.now() < end) {
    for (let i = 0; i < 20; i++) await page.mouse.move(1280 + dir * i * 12, 800, { steps: 1 })
    dir = -dir
  }
  await page.mouse.up()
}
for (const [label, view] of [['home', ''], ['zoomed in', 'dist=10']]) {
  await page.goto(`${server.resolvedUrls.local[0]}?intro=0&${view}&${q}`)
  await page.waitForFunction(() => document.documentElement.dataset.phase === 'ready', null, { timeout: 60000 })
  await page.evaluate(() => { window.__f = 0; let prev = performance.now(); window.__worst = 0; const f = (n) => { window.__f++; window.__worst = Math.max(window.__worst, n - prev); prev = n; requestAnimationFrame(f) }; requestAnimationFrame(f) })
  await page.waitForTimeout(2500)
  console.log(`${label.padEnd(10)} still     ${await fps(4)}`)
  console.log(`${label.padEnd(10)} rotating  ${await fps(4, drag)}  (canvas dpr ${await page.evaluate(() => { const c = document.querySelector('.scene canvas'); return (c.width / c.clientWidth).toFixed(2) })})`)
}
await browser.close()
await server.close()
