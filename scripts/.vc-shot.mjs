import { chromium } from 'playwright'
import { createServer } from 'vite'
import { writeFileSync, rmSync } from 'node:fs'
const out = process.argv[2] || '/tmp/loader-proto/vc.png'
writeFileSync('scripts/.vc-harness.tsx', `import { createRoot } from 'react-dom/client'\nimport { ViewControls } from '../src/ui/ViewControls'\nconst host = document.createElement('div')\ndocument.body.appendChild(host)\ndocument.querySelector('.sheet')?.remove()\ndocument.body.style.background = 'linear-gradient(180deg,#e9ece6,#dfe4dc)'\ncreateRoot(host).render(<ViewControls />)\n`)
const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { host: '127.0.0.1', port: 5193, strictPort: false } })
await server.listen()
const port = server.config.server.port
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 520, height: 160 }, deviceScaleFactor: 2 })
await page.goto(`http://127.0.0.1:${port}/?sheet=1`)
await page.evaluate(() => import('/scripts/.vc-harness.tsx'))
await page.waitForSelector('.vc__btn'); await page.waitForTimeout(300)
await page.hover('.vc__group:nth-child(2) .vc__btn:first-child')
await page.waitForTimeout(300)
await page.screenshot({ path: out })
await browser.close(); await server.close(); rmSync('scripts/.vc-harness.tsx')
