// A slow phone on the real GPU (Metal): CPU slowed (CPU=6), a slow network, a phone
// viewport; through the boot and 40 s of the room: fps, worst frame, draw calls per
// frame, uploads and JS heap every second, and every frame over 100 ms. The production
// build (run `npm run build` first). Swiftshader starves the main thread — use this.
//   CPU=6 node scripts/perf-phone.mjs
import { chromium } from 'playwright'
import { preview } from 'vite'
const server = await preview({ configFile: 'vite.config.ts', logLevel: 'silent', preview: { host: '127.0.0.1', port: 4181, strictPort: false } })
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu', '--enable-precise-memory-info'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const cdp = await page.context().newCDPSession(page)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU ?? 6) })
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 250 * 1024, uploadThroughput: 100 * 1024 })
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.addInitScript(() => {
  const S = (window.__s = { frames: [], sec: [], draws: 0, uploads: 0, drawsSec: 0, phaseAt: {} })
  const P = WebGL2RenderingContext.prototype
  for (const n of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) { const o = P[n]; P[n] = function (...a) { S.draws++; return o.apply(this, a) } }
  for (const n of ['texImage2D', 'texSubImage2D', 'bufferData', 'bufferSubData', 'compressedTexImage2D']) { const o = P[n]; P[n] = function (...a) { S.uploads++; return o.apply(this, a) } }
  let prev = performance.now()
  let n = 0, worst = 0, t0 = performance.now(), lastDraws = 0, lastUp = 0
  const f = (now) => {
    const p = document.documentElement?.dataset.phase
    if (p && !(p in S.phaseAt)) S.phaseAt[p] = Math.round(now)
    const dt = now - prev
    if (dt > 100) S.frames.push([Math.round(prev), Math.round(dt), p])
    prev = now; n++; worst = Math.max(worst, dt)
    if (now - t0 >= 1000) {
      S.sec.push({ t: Math.round(now), p, fps: Math.round((n * 1000) / (now - t0)), worst: Math.round(worst), drawsPerFrame: Math.round((S.draws - lastDraws) / n), uploads: S.uploads - lastUp, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1 })
      n = 0; worst = 0; t0 = now; lastDraws = S.draws; lastUp = S.uploads
    }
    requestAnimationFrame(f)
  }
  requestAnimationFrame(f)
})
await page.goto(server.resolvedUrls.local[0])
await page.waitForFunction(() => document.documentElement.dataset.phase === 'ready', null, { timeout: 240000 })
await page.waitForTimeout(40000)
console.log("canvas dpr", await page.evaluate(() => { const c = document.querySelector(".scene canvas"); return (c.width / c.clientWidth).toFixed(2) }))
const s = await page.evaluate(() => window.__s)
const title = s.phaseAt.title
console.log('phases (ms):', JSON.stringify(s.phaseAt))
console.log('long frames (>100 ms) from the title on:', s.frames.filter(([a]) => a >= title - 50).map(([a, d, p]) => `${a - title}+${d}(${p})`).join('  ') || 'none')
console.log('long frames while loading:', s.frames.filter(([a]) => a < title - 50).map(([a, d]) => `${a}+${d}`).join('  '))
for (const x of s.sec.filter((x) => x.t >= s.phaseAt.ready - 3000)) console.log(`  ${String(Math.round((x.t - s.phaseAt.ready) / 1000)).padStart(3)} s  ${x.p.padEnd(6)} fps ${String(x.fps).padStart(3)}  worst ${String(x.worst).padStart(4)} ms  draws/frame ${x.drawsPerFrame}  uploads/s ${x.uploads}  heap ${x.heap} MB`)
await browser.close()
await server.close()
