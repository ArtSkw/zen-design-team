// The bubble's motions frame by frame (dev server; animations paused and scrubbed):
// the next line (breath + words rising), and the read exit (words go, bubble draws back).
//   node scripts/debug-bubble-anim.mjs → shots/bubble-anim.png
import { chromium } from 'playwright'
import sharp from 'sharp'
const DPR = 2
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DPR })
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.goto('http://localhost:5173/?motion=0')
await page.waitForFunction(() => document.documentElement.dataset.phase === 'ready', null, { timeout: 120000 })
await page.waitForTimeout(2500)
const tap = (n) => page.evaluate((n) => [...document.querySelectorAll('.sr-only button')].find((b) => b.textContent === n).click(), n)
// only the motion under test (a finished entrance still counts as an animation, filled)
const scrub = (t, names) => page.evaluate(([t, names]) => {
  for (const a of document.getAnimations()) {
    const el = a.effect?.target
    const name = a.animationName ?? 'script'
    if (el instanceof Element && el.closest('.bubble') && names.includes(name)) { a.pause(); a.currentTime = t }
  }
}, [t, names])
const clip = async () => {
  const r = await page.evaluate(() => { const b = document.querySelector('.bubble-pos:last-of-type .bubble') ?? document.querySelector('.bubble'); const q = b.getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.bottom } })
  return { x: Math.round(r.x - 190), y: Math.round(r.y - 110), width: 380, height: 150 }
}
const rows = []
// next line
await tap('Janek'); await page.waitForTimeout(600)
const c1 = await clip()
await tap('Janek'); await page.waitForTimeout(16)
const next = []
for (const t of [0, 40, 80, 140, 200, 280]) { await scrub(t, ['script', 'quote-in']); await page.waitForTimeout(50); next.push({ t, img: await page.screenshot({ clip: c1 }) }) }
rows.push({ label: 'next line', frames: next })
await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))
await page.waitForTimeout(600)
// read exit
await page.keyboard.press('Escape'); await page.waitForTimeout(16)
const out = []
for (const t of [0, 100, 180, 260, 340, 420, 480]) { await scrub(t, ['bubble-out', 'quote-out']); await page.waitForTimeout(50); out.push({ t, img: await page.screenshot({ clip: c1 }) }) }
rows.push({ label: 'read exit', frames: out })
const W = 380, H = 150, G = 6, L = 26
const cols = Math.max(...rows.map((r) => r.frames.length))
const comp = []
rows.forEach((r, j) => r.frames.forEach((f, i) => {
  const left = i * (W + G) * DPR, top = j * (H + L + G) * DPR
  comp.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W * DPR}" height="${L * DPR}"><text x="8" y="${18 * DPR}" font-family="Helvetica" font-size="${14 * DPR}" fill="#111">${r.label} · ${f.t} ms</text></svg>`), left, top })
  comp.push({ input: f.img, left, top: top + L * DPR })
}))
await sharp({ create: { width: cols * (W + G) * DPR, height: rows.length * (H + L + G) * DPR, channels: 3, background: '#e9e7e2' } }).composite(comp).png().toFile('shots/bubble-anim.png')
console.log('shots/bubble-anim.png')
await browser.close()
