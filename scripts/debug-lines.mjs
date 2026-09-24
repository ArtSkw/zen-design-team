// The RPG-style lines, end to end on the dev server (npm run dev): tap → line 1, tap → line 2
// in the same bubble, the bubble leaves by itself after its reading time, the next tap goes
// on from where it was, another Zenek sends the open bubble away, Esc closes. Logs a timeline
// of what the bubbles did.   node scripts/debug-lines.mjs [url=http://localhost:5173/] [reduce]
import { chromium } from 'playwright'
const url = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:5173/'
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: process.argv.includes('reduce') ? 'reduce' : 'no-preference' })
page.on('pageerror', (e) => console.log('pageerror', e.message))
page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()))
await page.goto(url)
await page.waitForFunction(() => document.documentElement.dataset.phase === 'ready', null, { timeout: 120000 })
await page.waitForTimeout(1500)
// a timeline of the bubbles: which are on screen, their words and state
await page.evaluate(() => {
  window.__log = []
  const t0 = performance.now()
  let last = ''
  const snap = () => {
    const s = [...document.querySelectorAll('.bubble')].map((b) => `${b.className.replace('bubble', '').trim() || 'on'}:"${b.textContent}"`).join(' | ')
    if (s !== last) window.__log.push(`${String(Math.round(performance.now() - t0)).padStart(6)} ms  ${s || '(none)'}`), (last = s)
    requestAnimationFrame(snap)
  }
  snap()
  window.__t0 = t0
})
const tap = (name) => page.evaluate((n) => [...document.querySelectorAll('.sr-only button')].find((b) => b.textContent === n).click(), name)
const mark = (label) => page.evaluate((l) => window.__log.push(`${String(Math.round(performance.now() - window.__t0)).padStart(6)} ms  >> ${l}`), label)
await mark('tap Artur'); await tap('Artur'); await page.waitForTimeout(1000)
await mark('tap Artur'); await tap('Artur'); await page.waitForTimeout(8000) // let it go by itself
await mark('tap Artur'); await tap('Artur'); await page.waitForTimeout(1200)
await mark('tap Kamil'); await tap('Kamil'); await page.waitForTimeout(1200)
await mark('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(1200)
// a real tap on the canvas: open Janek, find his head under the tail, let it go, tap there twice
await tap('Janek'); await page.waitForTimeout(400)
const tip = await page.evaluate(() => { const b = document.querySelector('.bubble').getBoundingClientRect(); const x = parseFloat(getComputedStyle(document.querySelector('.bubble')).getPropertyValue('--tail-x')); return { x: b.left + x, y: b.bottom + 14 } })
await page.keyboard.press('Escape'); await page.waitForTimeout(1000)
await mark('canvas click on Janek'); await page.mouse.click(tip.x, tip.y + 45); await page.waitForTimeout(700)
await mark('canvas click on Janek'); await page.mouse.click(tip.x, tip.y + 45); await page.waitForTimeout(700)
await mark('click the bubble'); await page.click('.bubble'); await page.waitForTimeout(700)
await mark('click empty sky'); await page.mouse.click(700, 60); await page.waitForTimeout(1000)
console.log((await page.evaluate(() => window.__log)).join('\n'))
await browser.close()
