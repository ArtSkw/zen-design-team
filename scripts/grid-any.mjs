import sharp from 'sharp'
const [src, out, stepArg] = process.argv.slice(2)
const step = Number(stepArg || 100)
const meta = await sharp(src).metadata()
const W = meta.width, H = meta.height
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`
for (let y = 0; y <= H; y += step) svg += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#ff00aa" stroke-width="1.2"/><text x="6" y="${y - 5}" font-size="26" font-family="Helvetica" font-weight="bold" fill="#ff00aa">${y}</text>`
for (let x = 0; x <= W; x += step) svg += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#00b0ff" stroke-width="1.2"/><text x="${x + 4}" y="28" font-size="26" font-family="Helvetica" font-weight="bold" fill="#0090ff">${x}</text>`
svg += '</svg>'
await sharp(src).flatten({ background: '#9a9a9a' }).composite([{ input: Buffer.from(svg) }]).png().toFile(out)
console.log('wrote', out)
