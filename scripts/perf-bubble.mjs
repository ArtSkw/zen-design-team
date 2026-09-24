// The cost of an open speech bubble on a slow phone (real GPU, CPU slowed, phone
// viewport, the production build — run `npm run build` first): fps, worst frame, and the
// browser's own layout / style-recalc counts and times, for a few seconds with no bubble,
// then with one open, then closed again.
// A bubble now goes by itself once read, so the default is the longest first line (Krystian's,
// up 5.6 s) and the open window is 4 s.
//   CPU=6 node scripts/perf-bubble.mjs [name=Krystian]
import { chromium } from 'playwright'
import { preview } from 'vite'
const who = process.argv[2] ?? 'Krystian'
const server = await preview({ configFile: 'vite.config.ts', logLevel: 'silent', preview: { host: '127.0.0.1', port: 4186, strictPort: false } })
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
page.on('pageerror', (e) => console.log('pageerror', e.message))
const cdp = await page.context().newCDPSession(page)
await cdp.send('Performance.enable')
await page.goto(server.resolvedUrls.local[0])
await page.waitForFunction(() => document.documentElement.dataset.phase === 'ready', null, { timeout: 120000 })
await page.waitForTimeout(3000)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU ?? 6) })
await page.evaluate(() => { window.__f = 0; let prev = performance.now(); window.__worst = 0; const f = (n) => { window.__f++; window.__worst = Math.max(window.__worst, n - prev); prev = n; requestAnimationFrame(f) }; requestAnimationFrame(f) })
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
async function measure(label, secs = 5) {
  await page.waitForTimeout(800) // let the change settle
  const m0 = await metrics()
  const f0 = await page.evaluate(() => { window.__worst = 0; return window.__f })
  await page.waitForTimeout(secs * 1000)
  const m1 = await metrics()
  const r = await page.evaluate(() => ({ f: window.__f, worst: Math.round(window.__worst) }))
  const per = (k) => ((m1[k] - m0[k]) / secs)
  console.log(`${label.padEnd(12)} fps ${String(Math.round((r.f - f0) / secs)).padStart(3)}  worst ${String(r.worst).padStart(3)} ms  layouts/s ${per('LayoutCount').toFixed(0).padStart(3)} (${(per('LayoutDuration') * 1000).toFixed(1)} ms/s)  style recalcs/s ${per('RecalcStyleCount').toFixed(0).padStart(3)} (${(per('RecalcStyleDuration') * 1000).toFixed(1)} ms/s)  script ${(per('ScriptDuration') * 1000).toFixed(0)} ms/s`)
}
await measure('no bubble')
await page.evaluate((name) => [...document.querySelectorAll('.sr-only button')].find((b) => b.textContent === name)?.click(), who)
await measure('bubble open', 4)
await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
await measure('closed again')
await browser.close()
await server.close()
