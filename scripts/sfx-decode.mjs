// Decode every take in sound-raw/ (MP3) to WAV with the browser's own decoder, for
// scripts/sfx-look.py to measure and draw. Skips takes already decoded.
//   node scripts/sfx-decode.mjs
import { chromium } from 'playwright'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'

const files = readdirSync('sound-raw', { withFileTypes: true }).filter((d) => d.isDirectory())
  .flatMap((d) => readdirSync(`sound-raw/${d.name}`).filter((f) => f.endsWith('.mp3')).map((f) => `sound-raw/${d.name}/${f}`))
  .filter((f) => !existsSync(f.replace(/\.mp3$/, '.wav')))
const browser = await chromium.launch()
const page = await browser.newPage()
for (const f of files) {
  const wav = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const ctx = new OfflineAudioContext(2, 1, 44100)
    const buf = await ctx.decodeAudioData(bytes.buffer)
    const n = buf.length, ch = buf.numberOfChannels, sr = buf.sampleRate
    const v = new DataView(new ArrayBuffer(44 + n * ch * 2))
    const s = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
    s(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); s(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true)
    v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, n * ch * 2, true)
    const d = [...Array(ch)].map((_, c) => buf.getChannelData(c))
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) v.setInt16(44 + (i * ch + c) * 2, Math.max(-1, Math.min(1, d[c][i])) * 32767, true)
    let out = ''
    const u8 = new Uint8Array(v.buffer)
    for (let i = 0; i < u8.length; i += 0x8000) out += String.fromCharCode(...u8.subarray(i, i + 0x8000))
    return btoa(out)
  }, readFileSync(f).toString('base64'))
  writeFileSync(f.replace(/\.mp3$/, '.wav'), Buffer.from(wav, 'base64'))
}
console.log(`decoded ${files.length}`)
await browser.close()
