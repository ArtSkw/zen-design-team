// Audit the loader's spin → check handoff, live and frozen.
//   node scripts/debug-loader.mjs
// Live: spins the loader (hold=1) for several durations, flips `store.loaded` at
// whatever angle it has reached and records the ring every frame — its on-screen
// angle is the spinning box's (a Web Animation, while loading) plus the ring's own
// (the rAF finish), so a bad hand-over between the two shows up as a jump. Reports the arc's
// tail and head rates across the flip (they should carry straight on), frames where
// the gap reopens or anything turns backwards (should be 0), and the frame rate.
// Frozen: the completion at ?la=<angle>&lt=<s> → shots/loader-handoff-strip.png.
// The loader is mounted alone on the ?sheet=1 page (no WebGL), so headless
// software rendering doesn't starve its frames.
import { chromium } from 'playwright'
import { createServer } from 'vite'
import sharp from 'sharp'
import { writeFileSync, rmSync } from 'node:fs'

const HARNESS = 'scripts/.loader-harness.tsx'
writeFileSync(
  HARNESS,
  `import { createRoot } from 'react-dom/client'\nimport { Loader } from '../src/ui/Loader'\nconst host = document.createElement('div')\ndocument.body.appendChild(host)\ncreateRoot(host).render(<Loader />)\n`,
)
process.on('exit', () => rmSync(HARNESS, { force: true }))

const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { host: '127.0.0.1', port: 5198, strictPort: false } })
await server.listen()
const port = server.config.server.port
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 800, height: 500 } })
page.on('pageerror', (e) => console.log('pageerror', e.message))
const open = async (q) => {
  await page.goto(`http://127.0.0.1:${port}/?sheet=1&${q}`)
  await page.evaluate(() => import('/scripts/.loader-harness.tsx'))
  await page.waitForSelector('.dsl__ring')
}

// ---- live -------------------------------------------------------------------
const trials = [900, 1130, 1370, 1620, 1880]
for (const spinMs of trials) {
  await open('hold=1')
  await page.waitForTimeout(400) // let the page settle — load jank would clamp the first frames
  const { rows, flipAt } = await page.evaluate(async (spinMs) => {
    const { store } = await import('/src/lib/store.ts')
    const ring = document.querySelector('.dsl__ring')
    const box = document.querySelector('.dsl__spin')
    const C = 2 * Math.PI * 29
    const rows = []
    const t0 = performance.now()
    let flipAt = -1
    let prev = null
    let tail = 0
    return new Promise((res) => {
      const f = (now) => {
        const m = getComputedStyle(box).transform
        const [a, b] = m === 'none' ? [1, 0] : m.slice(7, -1).split(',').map(Number)
        const raw = (Math.atan2(b, a) * 180) / Math.PI + +/rotate\(([-\d.e]+)deg\)/.exec(ring.style.transform)[1]
        tail = prev === null ? raw : tail + ((((raw - prev + 540) % 360) + 360) % 360) - 180 // unwrapped
        prev = raw
        const arc = (parseFloat(ring.style.strokeDasharray) / C) * 360
        rows.push({ t: now, tail, head: tail + arc, arc })
        if (flipAt < 0 && now - t0 > spinMs) {
          store.set({ loaded: true })
          flipAt = now
        }
        if (flipAt > 0 && now - flipAt > 700) return res({ rows, flipAt })
        requestAnimationFrame(f)
      }
      requestAnimationFrame(f)
    })
  }, spinMs)
  const h = rows.findIndex((r) => r.t > flipAt) // first frame after the flip
  const rate = (k, i) => (rows[i][k] - rows[i - 1][k]) / ((rows[i].t - rows[i - 1].t) / 1000)
  let reopen = 0
  let back = 0
  for (let i = h; i < rows.length; i++) {
    if (rows[i].arc < rows[i - 1].arc - 1e-6) reopen++
    if (rows[i].tail < rows[i - 1].tail - 1e-6 || rows[i].head < rows[i - 1].head - 1e-6) back++
  }
  const fps = (rows.length - 1) / ((rows[rows.length - 1].t - rows[0].t) / 1000)
  const f0 = (v) => v.toFixed(0)
  console.log(
    `flip at ${f0((((rows[h - 1].tail - 180) % 360) + 360) % 360)}° · tail ${f0(rate('tail', h - 1))} → ${[h, h + 1, h + 2].map((i) => f0(rate('tail', i))).join(', ')}°/s · ` +
      `head ${f0(rate('head', h - 1))} → ${[h, h + 1, h + 2].map((i) => f0(rate('head', i))).join(', ')}°/s · closed at ${f0(rows[rows.length - 1].arc)}° · ` +
      `gap reopens ${reopen} · backwards ${back} · ${f0(fps)} fps`,
  )
}

// ---- frozen strip ------------------------------------------------------------
const angles = [0, 120, 240]
const times = [0, 0.07, 0.14, 0.22, 0.3, 0.38, 0.46, 0.54, 0.62, 0.74, 0.88]
const tiles = []
for (const la of angles) {
  for (const lt of times) {
    await open(`hold=1&done=1&la=${la}&lt=${lt}`)
    await page.waitForSelector('.dsl--done')
    await page.waitForTimeout(150)
    const box = await page.locator('.dsl__mark').boundingBox()
    const buf = await page.screenshot({ clip: { x: box.x - 8, y: box.y - 8, width: 76, height: 78 }, animations: 'disabled' })
    tiles.push({ input: buf, left: times.indexOf(lt) * 80, top: angles.indexOf(la) * 82 })
  }
}
await sharp({ create: { width: times.length * 80, height: angles.length * 82, channels: 3, background: '#ffffff' } })
  .composite(tiles)
  .png()
  .toFile('shots/loader-handoff-strip.png')
console.log(`strip: rows la=${angles.join(',')}° · columns lt=${times.join(',')} s → shots/loader-handoff-strip.png`)

await browser.close()
await server.close()
