import { chromium } from 'playwright'
import { createServer } from 'vite'
const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { host: '127.0.0.1', port: 5197 } })
await server.listen()
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 800, height: 500 } })
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.goto('http://127.0.0.1:5197/?lab=artur&hold=1&done=1&motion=0')
await page.waitForSelector('.dsl--done', { timeout: 20000 })
await page.waitForTimeout(2200)
const info = await page.evaluate(() => {
  const g = document.querySelector('.dsl__ring')
  const dot = document.querySelector('.dsl__dot')
  const chk = document.querySelector('.dsl__check')
  return { spin: g?.getAttribute('style'), dot: getComputedStyle(dot).transform, dash: chk.style.strokeDasharray, ring: document.querySelector('.dsl__ring')?.style.strokeDasharray }
})
console.log(JSON.stringify(info))
const t0 = Date.now()
await page.screenshot({ path: 'shots/loader5-done.png', clip: { x: 340, y: 190, width: 120, height: 120 }, animations: 'disabled', timeout: 60000 })
console.log('shot in', Date.now() - t0, 'ms')
await browser.close()
await server.close()
