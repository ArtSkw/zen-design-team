// The sound layer's wiring, checked in the running app — read from the dev cue log
// (window.__sound): the first touch heard, a Zenek tapped, taps on the water (and on the
// deck and the room, which must not splash), the controls, the on/off, the world passing
// by; and the controls' tooltips, shot into shots/.
//   node scripts/debug-sound.mjs [--vp 1600x900] [--linger 20000]
import { chromium } from 'playwright'
import { createServer } from 'vite'

const argv = process.argv.slice(2)
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d
}
const [W, H] = arg('vp', '1600x900').split('x').map(Number)
const linger = Number(arg('linger', '20000'))

const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { host: '127.0.0.1', port: 5197, strictPort: false } })
await server.listen()
const port = server.config.server.port
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: W, height: H } })
page.on('pageerror', (e) => console.log('pageerror:', e.message))
page.on('console', (m) => m.type() === 'error' && console.log('console:', m.text()))
const t0 = Date.now()
const log = (...a) => console.log(`${String(Date.now() - t0).padStart(6)} ms`, ...a)
let seen = 0
const cues = async (label) => {
  const s = await page.evaluate(() => ({ state: window.__sound?.state() ?? 'none', cues: window.__sound?.cues ?? [] }))
  const fresh = s.cues.slice(seen)
  seen = s.cues.length
  const counts = {}
  for (const [c] of fresh) {
    const k = c.startsWith('arrive') ? 'arrive' : c
    counts[k] = (counts[k] ?? 0) + 1
  }
  log(`${label} — context ${s.state};`, Object.entries(counts).map(([k, n]) => (n > 1 ? `${k}×${n}` : k)).join(', ') || 'no cues')
}

await page.goto(`http://127.0.0.1:${port}/`)
await page.waitForFunction(() => document.documentElement.dataset.phase === 'ready', null, { timeout: 90000 })
await page.waitForTimeout(1500)
await cues('room ready, untouched')

// the very first touch is a press on a control: its own click must be heard
await page.click('button[aria-label="Widok początkowy"]')
await page.waitForTimeout(700)
await cues('first touch: home')

// taps on the scene: water (front-left, far right) splashes; the deck and the room's wall must not
const at = async (label, x, y) => {
  await page.mouse.click(W * x, H * y)
  await page.waitForTimeout(450)
  await cues(label)
}
await at('tap: water, front left', 0.1, 0.9)
await at('tap: water, far right', 0.96, 0.37)
await at('tap: the deck', 0.5, 0.84)
await at('tap: the room wall', 0.21, 0.46)
await page.screenshot({ path: `shots/splash-${W}x${H}.png` })

// a Zenek, tapped: sweep the middle of the view until one answers
let tapped = false
for (let y = 0.45; y <= 0.72 && !tapped; y += 0.045)
  for (let x = 0.3; x <= 0.72 && !tapped; x += 0.035) {
    await page.mouse.click(W * x, H * y)
    tapped = await page.evaluate(() => (window.__sound?.cues ?? []).some(([c]) => c.startsWith('bubble:in:')))
  }
await page.waitForTimeout(600)
await cues(`zenek tapped (${tapped ? 'hit' : 'missed'})`)
await page.waitForTimeout(8000)
await cues('line read')

// the tooltips: the first after a moment, the next along at once
await page.hover('button[aria-label="Widok początkowy"]')
await page.waitForTimeout(250)
const early = await page.evaluate(() => document.querySelector('.tip')?.className)
await page.waitForTimeout(500)
await page.screenshot({ path: `shots/tip-home-${W}x${H}.png`, clip: { x: W / 2 - 260, y: H - 150, width: 520, height: 150 } })
await page.hover('button[aria-label="Obróć w lewo"]')
await page.waitForTimeout(30)
const next = await page.evaluate(() => ({ cls: document.querySelector('.tip')?.className, text: document.querySelector('.tip')?.textContent }))
await page.screenshot({ path: `shots/tip-rotate-${W}x${H}.png`, clip: { x: W / 2 - 260, y: H - 150, width: 520, height: 150 } })
await page.hover('button[aria-label="Dźwięk"]')
await page.waitForTimeout(30)
const snd = await page.evaluate(() => document.querySelector('.tip')?.textContent)
await page.mouse.move(W / 2, H * 0.3)
await page.waitForTimeout(300)
const gone = await page.evaluate(() => document.querySelector('.tip')?.className)
log(`tooltips: at 250 ms "${early}"; next along "${next.cls}" (${next.text}); sound "${snd}"; left "${gone}"`)

for (const label of ['Obróć w lewo', 'Obróć w prawo', 'Przybliż', 'Oddal', 'Widok początkowy']) {
  await page.click(`button[aria-label="${label}"]`)
  await page.waitForTimeout(350)
}
await cues('controls')
await page.click('button[aria-label="Dźwięk"]')
await page.waitForTimeout(900)
await cues('sound off')
await page.click('button[aria-label="Dźwięk"]')
await page.waitForTimeout(900)
await cues('sound on')
await page.waitForTimeout(linger)
await cues(`after ${linger / 1000} s`)
await browser.close()
await server.close()
