// NaN/Inf hunt on the real GPU (Metal — swiftshader, used by the other shot scripts, often
// computes what Metal leaves undefined, e.g. pow() of a negative, so it hides these bugs).
// Every matching fragment shader paints a NaN/Inf output in a flag colour; N screenshots of
// the room are counted for flagged pixels, the worst saved to shots/probe-nan.png and the last
// frame to shots/probe-last.png.
//   node scripts/probe-nan.mjs [query] [frames] [rules]
//   rules "token:colour,…" (m magenta, g green) — only shaders containing the token; none = all
//   e.g. floor flashes: "tDiffuseBlur:m" (the reflector samples NaN) plus "knitProf:g" to
//   neutralise one suspect — if the floor stays clean, that suspect feeds it (Round 33)
import { chromium } from 'playwright'
import { createServer } from 'vite'
import sharp from 'sharp'
const q = process.argv[2] ?? 'intro=0&title=0'
const N = Number(process.argv[3] ?? 24)
const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { host: '127.0.0.1', port: 5231, strictPort: false } })
await server.listen()
const browser = await chromium.launch({ channel: 'chromium', args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
page.on('pageerror', (e) => console.log('pageerror', e.message))
const rules = (process.argv[4] ?? '').split(',').filter(Boolean).map((r) => r.split(':'))
await page.addInitScript((rules) => {
  const col = { m: 'vec4(1.0, 0.0, 1.0, 1.0)', g: 'vec4(0.0, 1.0, 0.0, 1.0)' }
  const P = WebGL2RenderingContext.prototype
  const src = P.shaderSource
  P.shaderSource = function (sh, s) {
    if (s.includes('pc_fragColor') && s.includes('void main')) {
      const rule = rules.length ? rules.find(([t]) => s.includes(t)) : ['', 'm']
      if (rule) {
        const i = s.lastIndexOf('}')
        s = s.slice(0, i) + `\n{ vec4 c_ = pc_fragColor; if (any(isnan(c_)) || any(isinf(c_)) || c_.x != c_.x || c_.y != c_.y || c_.z != c_.z) pc_fragColor = ${col[rule[1]]}; }\n` + s.slice(i)
      }
    }
    return src.call(this, sh, s)
  }
}, rules)
await page.goto(`http://127.0.0.1:${server.config.server.port}/?${q}`)
await page.waitForFunction(() => document.documentElement.dataset.phase === 'ready', null, { timeout: 90000 }).catch(() => console.log('no ready'))
await page.waitForTimeout(3000)
let best = null
for (let k = 0; k < N; k++) {
  const buf = await page.screenshot()
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true })
  let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels
      if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] > 200) { n++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    }
  console.log(`frame ${k}: magenta ${n}${n ? ` box (${x0},${y0})-(${x1},${y1})` : ''}`)
  if (n && (!best || n > best.n)) best = { n, buf }
  await page.waitForTimeout(120)
}
if (best) await sharp(best.buf).toFile('shots/probe-nan.png')
await sharp(await page.screenshot()).toFile('shots/probe-last.png')
await browser.close()
await server.close()
