// Measures a character reference: silhouette, plate, eyes, hands, coloured masses.
import sharp from 'sharp'
const files = process.argv.slice(2)
for (const f of files) {
  const img = sharp(f).ensureAlpha()
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H } = info
  const bb = () => ({ x0: Infinity, y0: Infinity, x1: -1, y1: -1, n: 0 })
  const add = (b, x, y) => { b.n++; if (x < b.x0) b.x0 = x; if (y < b.y0) b.y0 = y; if (x > b.x1) b.x1 = x; if (y > b.y1) b.y1 = y }
  const all = bb(), dark = bb(), white = bb(), colr = bb()
  const rows = new Array(H).fill(0).map(() => ({ dark: [], white: [] }))
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
    if (a < 128) continue
    add(all, x, y)
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    if (mx < 75) { add(dark, x, y); rows[y].dark.push(x) }
    else if (mn > 200) { add(white, x, y); rows[y].white.push(x) }
    else if (mx - mn > 35) add(colr, x, y)
  }
  // body circle: widest dark row in the middle band, excluding hand rows? report dark width per 10% band
  const bands = []
  for (let k = 0; k < 10; k++) {
    const y = Math.round(all.y0 + (k + 0.5) * (all.y1 - all.y0) / 10)
    const d = rows[y].dark, w = rows[y].white
    bands.push({ y, darkX: d.length ? [d[0], d[d.length - 1]] : null, whiteX: w.length ? [w[0], w[w.length - 1]] : null })
  }
  // eyes: dark pixels inside the white bbox, cluster by x halves
  const eyes = [bb(), bb()]
  if (white.n) {
    const cx = (white.x0 + white.x1) / 2
    for (let y = white.y0; y <= white.y1; y++) for (let x = white.x0; x <= white.x1; x++) {
      const i = (y * W + x) * 4
      if (data[i + 3] > 128 && Math.max(data[i], data[i + 1], data[i + 2]) < 75) {
        // only count if surrounded by white-ish region: check pixel 40px above is white or dark-eye
        add(eyes[x < cx ? 0 : 1], x, y)
      }
    }
  }
  const fmt = (b) => b.n ? `x ${b.x0}-${b.x1} (w ${b.x1 - b.x0}), y ${b.y0}-${b.y1} (h ${b.y1 - b.y0}), n ${b.n}` : 'none'
  console.log(`\n== ${f}  ${W}x${H}`)
  console.log('silhouette :', fmt(all))
  console.log('dark       :', fmt(dark))
  console.log('white plate:', fmt(white))
  console.log('coloured   :', fmt(colr))
  console.log('eye L      :', fmt(eyes[0]))
  console.log('eye R      :', fmt(eyes[1]))
  for (const b of bands) console.log(`row y=${b.y}: dark ${b.darkX ? b.darkX.join('-') : '-'} | white ${b.whiteX ? b.whiteX.join('-') : '-'}`)
}
