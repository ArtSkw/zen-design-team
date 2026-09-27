// The title's handoff, pixel for pixel: the pen's last frame (TitleCard) against the
// petals' first (TitleDust), at 2×, 3× and 1×. Loads with ?dust=hold (the petals freeze at
// their start), screenshots them, swaps the pen's canvas back in, screenshots again.
// The line's breathe-in is switched off so both draws see the same geometry.
//   node scripts/title-handoff.mjs  →  max difference per viewport (0–1 = identical)
import { chromium } from 'playwright'
import { createServer } from 'vite'
import sharp from 'sharp'

const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { host: '127.0.0.1', port: 5200, strictPort: false } })
await server.listen()
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
for (const [vw, vh, dsf] of [[1600, 900, 2], [390, 844, 3], [1440, 900, 1]]) {
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: dsf })
  await page.addInitScript(() =>
    document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style')
      st.textContent = '.tc-line { animation: none !important; }'
      document.head.append(st)
    }),
  )
  await page.goto(`http://127.0.0.1:${server.config.server.port}/?dust=hold`)
  await page.waitForFunction(() => !!document.querySelector('.title-dust'), null, { timeout: 120000 })
  await page.waitForTimeout(300)
  const clip = await page.evaluate(() => {
    const r = document.querySelector('.tc-svg').getBoundingClientRect()
    return { x: Math.floor(r.left - 12), y: Math.floor(r.top - 12), width: Math.ceil(r.width + 24), height: Math.ceil(r.height + 24) }
  })
  const dust = await page.screenshot({ clip })
  await page.evaluate(() => {
    document.querySelector('.title-dust').style.visibility = 'hidden'
    document.querySelector('.tc-pen').style.display = ''
  })
  await page.waitForTimeout(200)
  const pen = await page.screenshot({ clip })
  const A = await sharp(dust).greyscale().raw().toBuffer()
  const B = await sharp(pen).greyscale().raw().toBuffer()
  let max = 0
  let over8 = 0
  for (let i = 0; i < A.length; i++) {
    const d = Math.abs(A[i] - B[i])
    max = Math.max(max, d)
    if (d > 8) over8++
  }
  console.log(`${vw}x${vh}@${dsf}`, { max, over8 })
  await page.close()
}
await browser.close()
await server.close()
