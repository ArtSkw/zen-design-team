// Every Zenek's lines in their bubbles, one row per Zenek (dev server; real GPU):
//   node scripts/lines-sheet.mjs [phone] → shots/lines-desktop.png | shots/lines-phone.png
import { chromium } from 'playwright'
import sharp from 'sharp'
const phone = process.argv.includes('phone')
const url = 'http://localhost:5173/'
const DPR = 2
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] })
const page = await browser.newPage(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: DPR })
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.goto(url)
await page.waitForFunction(() => document.documentElement.dataset.phase === 'ready', null, { timeout: 120000 })
await page.waitForTimeout(2500)
const names = await page.evaluate(() => [...document.querySelectorAll('.sr-only button')].map((b) => b.textContent))
const vw = phone ? 390 : 1440
const vh = phone ? 844 : 900
const CW = 360, CH = 190 // a cell, CSS px
const rows = []
for (const name of names) {
  const cells = []
  for (let i = 0; i < 4; i++) {
    await page.evaluate((n) => [...document.querySelectorAll('.sr-only button')].find((b) => b.textContent === n).click(), name)
    await page.waitForTimeout(420)
    const r = await page.evaluate(() => { const b = [...document.querySelectorAll('.bubble')].find((x) => !x.classList.contains('bubble--out')).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height } })
    const cx = r.x + r.w / 2
    const x = Math.max(0, Math.min(vw - CW, Math.round(cx - CW / 2)))
    const y = Math.max(0, Math.min(vh - CH, Math.round(r.y - 14)))
    cells.push(await page.screenshot({ clip: { x, y, width: CW, height: CH } }))
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(650)
  rows.push({ name, cells })
}
const LW = 130, GAP = 8
const W = (LW + 4 * (CW + GAP)) * DPR
const H = rows.length * (CH + GAP) * DPR
const comp = []
rows.forEach((row, j) => {
  const top = j * (CH + GAP) * DPR
  comp.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${LW * DPR}" height="${CH * DPR}"><text x="${12 * DPR}" y="${(CH / 2) * DPR}" font-family="Helvetica" font-size="${17 * DPR}" font-weight="700" fill="#111">${row.name}</text></svg>`), left: 0, top })
  row.cells.forEach((c, i) => comp.push({ input: c, left: (LW + i * (CW + GAP)) * DPR, top }))
})
const out = `shots/lines-${phone ? 'phone' : 'desktop'}.png`
await sharp({ create: { width: W, height: H, channels: 3, background: '#e9e7e2' } }).composite(comp).png().toFile(out)
console.log(out, W, H)
await browser.close()
