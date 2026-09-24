import { chromium } from 'playwright'
import { createServer } from 'vite'
const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { host: '127.0.0.1', port: 5198 } })
await server.listen()
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.goto('http://127.0.0.1:5198/?intro=0&motion=0')
await page.waitForFunction(() => document.documentElement.dataset.phase === 'ready', null, { timeout: 40000 })
await page.waitForTimeout(800)
for (const [x, y] of [[800, 545], [830, 575], [660, 560]]) {
  await page.mouse.move(x - 40, y - 40)
  await page.waitForTimeout(300)
  await page.mouse.move(x, y)
  await page.waitForTimeout(900)
  const info = await page.evaluate(() => {
    const t = document.querySelector('.nametag')
    return { cls: t?.className, text: t?.textContent, left: t?.style.left, top: t?.style.top, cursor: document.body.style.cursor }
  })
  console.log(x, y, JSON.stringify(info))
}
await page.screenshot({ path: 'shots/hover-debug.png' })
await browser.close()
await server.close()
