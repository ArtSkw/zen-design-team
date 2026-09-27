// "Press to continue": asked for only when the browser would hold the sound back. Each
// case in a fresh browser. The page is only *listened to* (its dev console.debug lines):
// Playwright's own evaluations count as user gestures and would make every page look
// already touched.
//   ask       the loader's check becomes "Kontynuuj"; pressing it starts the intro, heard
//   enter     the same, with the Enter key
//   allowed   a browser that allows sound: no asking, the intro heard
//   early     a click while the loader spins: no asking, the intro heard
//   muted     sound turned off on an earlier visit: no asking, the intro silent
//   auto      an automated run without ?press=1: no asking (screenshot scripts)
//   node scripts/debug-press.mjs [--only ask,enter,...]
import { chromium } from 'playwright'
import { createServer } from 'vite'

const argv = process.argv.slice(2)
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null
const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { host: '127.0.0.1', port: 5194, strictPort: false } })
await server.listen()
const base = `http://127.0.0.1:${server.config.server.port}/`
const GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl']

async function run(name, { policy = 'user-gesture-required', q = 'press=1', before, act, shot }) {
  if (only && !only.includes(name)) return
  const browser = await chromium.launch({ args: [...GL, `--autoplay-policy=${policy}`] })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const lines = []
  const waiters = []
  page.on('pageerror', (e) => console.log(`[${name}] pageerror:`, e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`[${name}] console:`, m.text())
    lines.push(m.text())
    for (const w of [...waiters]) if (w.test(m.text())) (waiters.splice(waiters.indexOf(w), 1), w.done(true))
  })
  const heardLine = (test, ms) =>
    lines.some(test) ? Promise.resolve(true) : new Promise((done) => {
      const w = { test, done }
      waiters.push(w)
      setTimeout(() => (waiters.includes(w) && waiters.splice(waiters.indexOf(w), 1), done(false)), ms)
    })
  if (before) await page.addInitScript(before)
  await page.goto(`${base}?${q}`)
  if (act === 'early') {
    await page.waitForTimeout(400)
    await page.mouse.click(40, 40) // while the loader spins
  }
  // either the loader asks, or the title begins by itself
  await heardLine((l) => l === '[press] waiting' || l === '[phase] title', 90000)
  const asked = lines.includes('[press] waiting')
  if (asked) {
    await heardLine((l) => l === '[press] open', 30000) // a software-rendered browser can stall for seconds here (shader compiles)
    await page.waitForTimeout(300)
    if (shot) await page.screenshot({ path: `shots/press-${shot}.png` })
    if (act === 'enter') await page.keyboard.press('Enter')
    else await page.mouse.click(640, 399) // the button, where the loader's check was
  }
  await heardLine((l) => l === '[phase] ready', 90000)
  await page.waitForTimeout(800)
  const cues = lines.filter((l) => l.startsWith('[sound] ')).map((l) => l.slice(8))
  const heard = ['pen', 'dot', 'letgo', 'world'].filter((c) => cues.includes(c))
  const arrive = cues.filter((c) => c.startsWith('arrive')).length
  console.log(`${name.padEnd(8)} asked: ${asked ? 'yes' : 'no '}  intro heard: ${heard.join(', ') || '—'}${arrive ? `, arrive×${arrive}` : ''}`)
  await browser.close()
}

await run('ask', { shot: '1280x800' })
await run('enter', { act: 'enter' })
await run('allowed', { policy: 'no-user-gesture-required' })
await run('early', { act: 'early' })
await run('muted', { before: () => localStorage.setItem('zen-design-team:sound', 'off') })
await run('auto', { q: '' })
await server.close()
