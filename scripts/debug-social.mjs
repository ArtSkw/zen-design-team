import { chromium } from 'playwright'
const url = process.argv[2]
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] })
const page = await browser.newPage({ viewport: { width: 800, height: 450 } })
page.on('pageerror', (e) => console.log('pageerror', e.message))
await page.goto(url)
await page.waitForFunction(() => document.documentElement.dataset.phase === 'ready', null, { timeout: 60000 })
const rows = await page.evaluate(async () => {
  const soc = await import('/src/zenek/social.ts')
  const team = await import('/src/cast/team.ts')
  const out = []
  const t0 = performance.now()
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500))
    const line = team.CIRCLES.map((c) => c.map((id) => { const r = soc.roleOf(id); return r.kind === 'speak' ? `${id}:S${r.to ? '>' + r.to : ''}` : r.kind === 'listen' ? `${id}:l` : `${id}:.` }).join(' ')).join(' | ')
    out.push(((performance.now() - t0) / 1000).toFixed(1) + 's ' + line)
  }
  return out
})
console.log(rows.join('\n'))
await browser.close()
