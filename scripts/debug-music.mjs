// The music's wiring (src/sound/music.ts): music.html played mood by mood with its dials,
// shot into shots/music-page-*.png; then the room as published (the chosen breath) and with
// `?music=felt`, `?music=lake` and the recorded links, read from the dev cue log (the music
// starting, on which recordings; the lake's rings singing).
//   node scripts/debug-music.mjs
import { chromium } from 'playwright'
import { createServer } from 'vite'

const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { host: '127.0.0.1', port: 5196, strictPort: false } })
await server.listen()
const port = server.config.server.port
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] })
const out = 'shots'

// 1. the page
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } })
  page.on('pageerror', (e) => console.log('page pageerror:', e.message))
  page.on('console', (m) => m.type() === 'error' && console.log('page console:', m.text()))
  await page.goto(`http://127.0.0.1:${port}/music.html`)
  await page.waitForSelector('.mood')
  await page.click('#arrival')
  const moods = await page.$$('.mood')
  await moods[3].click() // the lake
  await page.waitForTimeout(9000)
  await page.screenshot({ path: `${out}/music-page-lake.png` })
  await moods[0].click()
  await page.waitForTimeout(7000)
  await page.screenshot({ path: `${out}/music-page-postcards.png` })
  for (const i of [1, 2]) {
    await moods[i].click()
    await page.waitForTimeout(5000)
  }
  await page.click('#presence button:nth-child(3)')
  await page.click('#energy button:nth-child(3)')
  await page.click('#again')
  await page.waitForTimeout(3000)
  console.log('page pick:', await page.textContent('#pick'))
  await page.screenshot({ path: `${out}/music-page-breath.png` })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${out}/music-page-phone.png`, fullPage: true })
  await page.close()
}

// 1b. your favourites, opened from their addresses, with the recorded instruments: the
// breath keeps its seed across instruments, and its room link carries the raw takes
const links = {}
for (const [mood, address, labels] of [
  ['breath', 'music=breath&energy=0.8&presence=0.75&mlevel=0&seed=326436', ['Shō', 'Harmonium', 'Glass', 'Synthesised']],
  ['lake', 'music=lake&energy=0.8&presence=0.35&mlevel=0&seed=243960', ['Kalimba by note']],
]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } })
  page.on('pageerror', (e) => console.log(`${mood} pageerror:`, e.message))
  page.on('console', (m) => m.type() === 'error' && console.log(`${mood} console:`, m.text()))
  await page.goto(`http://127.0.0.1:${port}/music.html?${address}`)
  await page.waitForSelector('.mood')
  await page.click(`.mood:nth-child(${mood === 'breath' ? 3 : 4})`)
  await page.waitForTimeout(3000)
  for (const label of labels) {
    await page.click(`#inst button:text-is("${label}")`)
    await page.waitForTimeout(2500)
    const pick = await page.textContent('#pick')
    console.log(`${mood} · ${label}:`, pick)
    if (label !== 'Synthesised') links[mood] = pick
  }
  await page.screenshot({ path: `${out}/music-page-${mood}-recorded.png` })
  await page.close()
}

// 2. the room
for (const mood of ['default', 'felt', 'lake', 'breath-recorded', 'lake-recorded']) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  page.on('pageerror', (e) => console.log(`room ${mood} pageerror:`, e.message))
  let sang = 0
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`room ${mood} console:`, m.text())
    if (m.type() !== 'debug') return
    if (m.text().includes('music:ring')) sang++
    else if (/music|world/.test(m.text())) console.log(`room ${mood}:`, m.text())
  })
  // the room as published (the chosen breath, by the shō), then the others by address
  const address = mood === 'default' ? 'x=1' : mood.endsWith('-recorded') ? links[mood.split('-')[0]].slice(2) : `music=${mood}&energy=0.8`
  await page.goto(`http://127.0.0.1:${port}/?${address}&title=0`)
  await page.waitForFunction(() => document.documentElement.dataset.phase === 'ready', null, { timeout: 120000 })
  await page.mouse.click(800, 120) // a touch, in case the context waits for one
  if (mood.startsWith('lake')) {
    // the rings the music asks of the water, seen: a shot a second after each of the first two
    let shots = 0
    for (let s = 0; s < 30 && shots < 2; s++) {
      const was = sang
      await page.waitForTimeout(1000)
      if (sang > was) await page.waitForTimeout(1200), await page.screenshot({ path: `${out}/music-room-${mood}-${++shots}.png` })
    }
    await page.waitForTimeout(10000)
    console.log(`room ${mood}: ${sang} rings sang`)
  } else await page.waitForTimeout(6000)
  await page.close()
}
await browser.close()
await server.close()
