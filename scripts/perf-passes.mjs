// What one frame draws, pass by pass (the screen with its shadow map, each reflection's
// render target): draw calls and triangles. Dev server, real GPU; reads the renderer
// through the dev-only window.__gl (Scene).
//   node scripts/perf-passes.mjs [query]
import { chromium } from 'playwright'
import { createServer } from 'vite'
const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { host: '127.0.0.1', port: 5208, strictPort: false } })
await server.listen()
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(`http://127.0.0.1:${server.config.server.port}/?${process.argv[2] ?? ''}`)
await page.waitForFunction(() => document.documentElement.dataset.phase === 'ready', null, { timeout: 60000 })
await page.waitForTimeout(3000)
const r = await page.evaluate(() => new Promise((res) => {
  const gl = window.__gl
  const out = []
  const origRender = gl.render.bind(gl)
  const origShadow = gl.shadowMap.render.bind(gl.shadowMap)
  gl.info.autoReset = false
  let shadow = null
  gl.shadowMap.render = (...a) => { const c0 = gl.info.render.calls, t0 = gl.info.render.triangles; origShadow(...a); shadow = { calls: gl.info.render.calls - c0, tris: gl.info.render.triangles - t0 } }
  gl.render = (scene, cam) => {
    const tgt = gl.getRenderTarget()
    const c0 = gl.info.render.calls, t0 = gl.info.render.triangles
    shadow = null
    origRender(scene, cam)
    out.push({ target: tgt ? `rt ${tgt.width}x${tgt.height}` : 'screen', calls: gl.info.render.calls - c0, tris: gl.info.render.triangles - t0, shadow })
  }
  requestAnimationFrame(() => { out.length = 0; requestAnimationFrame(() => { gl.render = origRender; gl.shadowMap.render = origShadow; gl.info.autoReset = true; res(out) }) })
}))
for (const p of r) console.log(`${p.target.padEnd(14)} calls ${String(p.calls).padStart(4)}  tris ${String(p.tris).padStart(8)}${p.shadow ? `   (of which shadow map: calls ${p.shadow.calls}, tris ${p.shadow.tris})` : ''}`)
await browser.close()
await server.close()
