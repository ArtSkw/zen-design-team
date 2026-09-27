// Hear with your eyes. Renders the sound layer offline, through the live mix
// (src/sound/engine.ts: mixer), into shots/sound/*.wav — for levels and spectrograms
// (scripts/sound-look.py), since the build cannot listen.
//   node scripts/sound-render.mjs [--only ui,toy,...]
import { chromium } from 'playwright'
import { createServer } from 'vite'
import { mkdirSync, writeFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const only = (argv[argv.indexOf('--only') + 1] ?? '').split(',').filter((s) => argv.includes('--only') && s)
mkdirSync('shots/sound', { recursive: true })

const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { host: '127.0.0.1', port: 5198, strictPort: false } })
await server.listen()
const port = server.config.server.port
const browser = await chromium.launch()
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('pageerror:', e.message))
await page.goto(`http://127.0.0.1:${port}/?intro=0&motion=0&snd=0`)
await page.waitForFunction(() => document.querySelector('#root')?.childElementCount > 0)

const scenes = await page.evaluate(async (only) => {
  const syn = await import('/src/sound/synth.ts')
  const { mixer } = await import('/src/sound/engine.ts')
  const { hz } = await import('/src/sound/cues.ts')
  const { TAP_SY, TAP_DUR } = await import('/src/zenek/tap.ts')
  const { mulberry32 } = await import('/src/lib/rng.ts')
  const SR = 48000
  const rng = mulberry32(7)

  const scenes = {
    // the controls: five presses, then the sound off (knock) and on (bowl)
    async ui(b) {
      for (let i = 0; i < 5; i++) syn.tick(b.ui, 0.3 + i * 0.5, { pan: -0.3 + i * 0.12, rng })
      syn.tok(b.ui, hz(5), 3.0, { level: 0.7 })
      syn.bell(b.ui, hz(5), 3.8, { kind: 'bowl', level: 0.7 })
      return 9
    },
    // a Zenek tapped: boop and bubble (the line is read in silence); read and drawn back
    async toy(b) {
      let t = 0.3
      for (const deg of [-3, 0, 4]) {
        syn.boop(b.toy, hz(deg), t, { curve: TAP_SY, dur: TAP_DUR })
        syn.plip(b.toy, t + 0.03, { level: 0.9 })
        t += 0.9
      }
      syn.swish(b.toy, t, { dur: 0.38, from: 2400, to: 650, q: 1.4, level: 0.05 })
      syn.swish(b.toy, t + 0.8, { dur: 0.16, from: 1800, to: 900, level: 0.05 })
      return t + 2
    },
    // the fourteen arriving, 70 ms apart, back rows first, home on D6
    async arrival(b) {
      for (let i = 0; i < 14; i++) {
        const last = i === 13
        const low = Math.min(1, Math.max(0.55, i / 8))
        syn.pluck(b.toy, hz(i - 3), 0.3 + i * 0.07, { vel: last ? 0.75 : 0.55 * low, bright: 0.8, decay: last ? 1.6 : 0.55 * low, pan: -0.6 + (i / 13) * 1.2 })
        if (last) syn.pluck(b.toy, hz(i - 8), 0.31 + i * 0.07, { vel: 0.4, bright: 0.5, decay: 1.8 })
      }
      return 4
    },
    // the title: strokes and lifts, the dot, then letting go (air and the glass bell)
    async title(b, ctx) {
      const pen = syn.pen(b.title, 0.2)
      let t = 0.3
      for (let k = 0; k < 14; k++) {
        const dur = 0.09 + rng() * 0.16
        for (let i = 0; i <= 20; i++) pen.set(Math.sin((Math.PI * i) / 20) ** 0.8 * (0.5 + (k / 14) * 0.5), t + (dur * i) / 20)
        pen.set(0, t + dur + 0.005)
        t += dur + 0.03 + rng() * 0.07
      }
      syn.dot(b.title, t + 0.1)
      pen.stop(t + 0.4)
      t += 0.6
      syn.swish(b.title, t, { dur: 2.2, from: 420, to: 2600, q: 0.7, level: 0.07, pan: -0.2, panTo: 0.25 })
      let at = t + 0.12
      for (const d of [11, 13, 10]) {
        syn.bell(b.title, hz(d), at, { kind: 'glass', level: 0.8 })
        at += 0.3 + rng() * 0.35
      }
      return at + 4
    },
    // a touch on the water: three splashes, near to far
    async splash(b) {
      syn.splash(b.toy, 0.3, { level: 1, rng })
      syn.splash(b.toy, 1.3, { level: 0.75, pan: 0.4, rng })
      syn.splash(b.toy, 2.3, { level: 0.5, pan: -0.5, rng })
      return 4
    },
    // the bells: glass (the title), bowl (sound on)
    async bell(b) {
      syn.bell(b.title, hz(10), 0.3, { kind: 'glass', level: 0.8 })
      syn.bell(b.ui, hz(5), 3.3, { kind: 'bowl', level: 0.7 })
      return 10
    },
    // the world: the lake and the breeze, a songbird, the uguisu, gulls, a fish, the plane
    async world(b, ctx) {
      const lake = syn.lake(b.near, 0, rng)
      const breeze = syn.breeze(b.far, 0, rng)
      lake.tick(24)
      breeze.tick(24)
      syn.songbird(b.far, 4, { pan: -0.5, rng })
      syn.plop(b.far, 7.5, { pan: 0.4, level: 0.45 })
      syn.uguisu(b.far, 10, { pan: 0.5, level: 0.8 })
      syn.gull(b.far, 14, { pan: 0.2, rng })
      syn.gull(b.far, 14.6, { pan: 0.25, rng })
      const hum = syn.planeHum(b.far, 0)
      for (let i = 0; i <= 40; i++) hum.set(0.5 * Math.sin((Math.PI * i) / 40) ** 1.5, -0.6 + (i / 40) * 1.2, (24 * i) / 40) // the plane: 24 s, heard throughout
      return 24
    },
    // the world's passing things alone, without the bed: a songbird, a fish, the uguisu, gulls, the plane
    async events(b) {
      syn.songbird(b.far, 0.3, { pan: -0.5, rng })
      syn.plop(b.far, 3, { pan: 0.4, level: 0.45 })
      syn.uguisu(b.far, 4, { pan: 0.5, level: 0.8 })
      syn.gull(b.far, 7, { pan: 0.2, rng })
      syn.gull(b.far, 7.6, { pan: 0.25, rng })
      const hum = syn.planeHum(b.far, 9)
      for (let i = 0; i <= 20; i++) hum.set(0.5 * Math.sin((Math.PI * i) / 20) ** 1.5, 0, 9 + (10 * i) / 20)
      return 20
    },
    // the world alone, a long stretch: the bed's own level
    async bed(b) {
      const lake = syn.lake(b.near, 0, rng)
      const breeze = syn.breeze(b.far, 0, rng)
      lake.tick(20)
      breeze.tick(20)
      return 20
    },
  }

  const wav = (buf) => {
    const n = buf.length
    const ch = buf.numberOfChannels
    const data = new DataView(new ArrayBuffer(44 + n * ch * 2))
    const str = (o, s) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)))
    str(0, 'RIFF'); data.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ')
    data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true); data.setUint32(24, SR, true)
    data.setUint32(28, SR * ch * 2, true); data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true); str(36, 'data'); data.setUint32(40, n * ch * 2, true)
    const chans = [...Array(ch)].map((_, c) => buf.getChannelData(c))
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) data.setInt16(44 + (i * ch + c) * 2, Math.max(-1, Math.min(1, chans[c][i])) * 32767, true)
    let s = ''
    const u8 = new Uint8Array(data.buffer)
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
    return btoa(s)
  }

  const out = {}
  for (const [name, fn] of Object.entries(scenes)) {
    if (only.length && !only.includes(name)) continue
    // a dry run to learn the length, then the render
    const probe = new OfflineAudioContext(2, SR, SR)
    const len = await fn(Object.fromEntries(Object.entries(mixer(probe).buses).map(([k, v]) => [k, { ctx: probe, dest: v.input }])), probe)
    const ctx = new OfflineAudioContext(2, Math.ceil(SR * len), SR)
    const m = mixer(ctx)
    const b = Object.fromEntries(Object.entries(m.buses).map(([k, v]) => [k, { ctx, dest: v.input }]))
    await fn(b, ctx)
    out[name] = wav(await ctx.startRendering())
  }
  return out
}, only)

for (const [name, b64] of Object.entries(scenes)) {
  writeFileSync(`shots/sound/${name}.wav`, Buffer.from(b64, 'base64'))
  console.log(`shots/sound/${name}.wav`)
}
await browser.close()
await server.close()
