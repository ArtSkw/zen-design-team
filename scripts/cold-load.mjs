// The first visit, measured: a fresh browser profile (no HTTP cache, no GPU shader cache) on the
// real GPU loads the page and every frame is timed, by phase; then a reload in the same browser
// (warm caches) for comparison. Hitches are frames over 50 ms; the worst per phase is reported.
//   node scripts/cold-load.mjs [url] [--runs 2] [--vp 1440x900] [--chrome <path>] [--warm]
// Default url: a local production build (`npm run build && npm run preview`).
import { chromium } from 'playwright'

const argv = process.argv.slice(2)
const arg = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d)
const url = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'http://127.0.0.1:4173/zen-design-team/'
const runs = Number(arg('runs', '2'))
const [W, H] = arg('vp', '1440x900').split('x').map(Number)
const CHROME = arg('chrome', '')

const probe = () => {
  // every animation frame, stamped with the phase the page was in
  const log = []
  window.__frames = log
  const tick = (t) => {
    // on the dev server the renderer is exposed: count its programs and textures as well
    const info = window.__gl?.info
    log.push([t, document.documentElement.dataset.phase ?? '?', info?.programs?.length ?? -1, info?.memory.textures ?? -1])
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

function report(label, frames) {
  const by = {}
  const firstAt = {}
  const gl = {}
  for (let i = 1; i < frames.length; i++) {
    const [t, ph] = frames[i]
    const dt = t - frames[i - 1][0]
    firstAt[ph] ??= t
    const b = (by[ph] ??= { n: 0, hitches: 0, worst: 0, over100: 0 })
    b.n++
    if (dt > 50) b.hitches++
    if (dt > 100) b.over100++
    b.worst = Math.max(b.worst, dt)
    if (frames[i][2] >= 0) {
      const g = (gl[ph] ??= { p0: frames[i - 1][2], t0: frames[i - 1][3] })
      g.p1 = frames[i][2]
      g.t1 = frames[i][3]
      if (dt > 50) (g.at ??= []).push(`${dt.toFixed(0)} ms (programs ${frames[i - 1][2]}→${frames[i][2]}, textures ${frames[i - 1][3]}→${frames[i][3]})`)
    }
  }
  console.log(`\n${label}`)
  for (const ph of ['loading', 'title', 'intro', 'ready']) {
    const b = by[ph]
    if (!b) continue
    const g = gl[ph]
    if (g) console.log(`  ${''.padEnd(8)} programs ${g.p0}→${g.p1}, textures ${g.t0}→${g.t1}${g.at ? `; hitches: ${g.at.join(', ')}` : ''}`)
    console.log(`  ${ph.padEnd(8)} from ${(firstAt[ph] / 1000).toFixed(2)} s  frames ${String(b.n).padStart(4)}  >50 ms ${String(b.hitches).padStart(3)}  >100 ms ${String(b.over100).padStart(3)}  worst ${b.worst.toFixed(0)} ms`)
  }
}

async function visit(page, label) {
  await page.waitForFunction(() => document.documentElement.dataset.phase === 'ready', null, { timeout: 120000 })
  await page.waitForTimeout(2500) // a little of the settled room
  report(label, await page.evaluate(() => window.__frames))
}

for (let r = 0; r < runs; r++) {
  // a new browser is a new profile: nothing cached, no compiled shaders
  const browser = await chromium.launch({
    ...(CHROME ? { executablePath: CHROME } : {}),
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  })
  const page = await browser.newPage({ viewport: { width: W, height: H } })
  await page.addInitScript(probe)
  if (r === 0) {
    await page.goto('about:blank')
    console.log('GPU:', await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2')
      const ext = gl?.getExtension('WEBGL_debug_renderer_info')
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'
    }))
  }
  await page.goto(url)
  await visit(page, `cold load ${r + 1}`)
  if (argv.includes('--warm')) {
    await page.reload()
    await visit(page, `reload ${r + 1} (warm caches)`)
  }
  await browser.close()
}
