// Draws a labelled pixel grid over the plate so lines can be read off by eye.
import sharp from 'sharp'
const W = 1920, H = 1080
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`
for (let y = 0; y <= H; y += 50) {
  const major = y % 100 === 0
  svg += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${major ? '#ff00aa' : '#ff00aa88'}" stroke-width="${major ? 1.5 : 0.75}"/>`
  if (major) svg += `<text x="6" y="${y - 4}" font-size="22" font-family="Helvetica" fill="#ff00aa" font-weight="bold">${y}</text><text x="${W - 60}" y="${y - 4}" font-size="22" font-family="Helvetica" fill="#ff00aa" font-weight="bold">${y}</text>`
}
for (let x = 0; x <= W; x += 100) {
  svg += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#00c8ff99" stroke-width="1"/>`
  svg += `<text x="${x + 4}" y="24" font-size="20" font-family="Helvetica" fill="#00a0ff" font-weight="bold">${x}</text><text x="${x + 4}" y="${H - 8}" font-size="20" font-family="Helvetica" fill="#00a0ff" font-weight="bold">${x}</text>`
}
svg += '</svg>'
await sharp('public/plate/wood-room-src.jpg').composite([{ input: Buffer.from(svg) }]).png().toFile('shots/plate-grid.png')
console.log('wrote shots/plate-grid.png')
