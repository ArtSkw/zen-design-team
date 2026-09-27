// Does a worn accessory keep clear of the hair under it? Both ways: every vertex of the
// accessory's geometry against the hair's field (inside = < 0), and every vertex of the baked
// hair against the accessory's volume. (Round 34: Magda J's AirPods Max over her hair.)
//   node scripts/check-fit.mjs
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'
const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { middlewareMode: true } })
const { SCULPTS } = await server.ssrLoadModule('/src/zenek/sculpts/index.ts')
const { airpodsGeometry } = await server.ssrLoadModule('/src/zenek/airpods.tsx')
const { airpodsShape, airpodsDistance } = await server.ssrLoadModule('/src/zenek/airpods-shape.ts')
const hair = SCULPTS['magda-j-hair'].build().sdf
const g = airpodsGeometry({})
for (const [name, geo] of Object.entries(g)) {
  const p = geo.attributes.position
  let min = Infinity, inside = 0, close = 0
  for (let i = 0; i < p.count; i++) {
    const d = hair(p.getX(i), p.getY(i), p.getZ(i))
    min = Math.min(min, d)
    if (d < 0) inside++
    else if (d < 0.01) close++
  }
  console.log(`${name.padEnd(7)} ${p.count} verts: nearest hair ${min.toFixed(4)} R, inside the hair ${inside}, within 0.01 R ${close}`)
}
// the baked hair vs the headphones' volume
const b = readFileSync('public/sculpts/magda-j-hair.bin')
const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
const V = dv.getUint32(4, true)
const lo = [0, 1, 2].map((c) => dv.getFloat32(12 + c * 4, true))
const hi = [0, 1, 2].map((c) => dv.getFloat32(24 + c * 4, true))
const phones = airpodsDistance(airpodsShape())
let min = Infinity, inside = 0
for (let v = 0; v < V; v++) {
  const q = [0, 1, 2].map((c) => lo[c] + (dv.getUint16(36 + (v * 3 + c) * 2, true) / 65535) * (hi[c] - lo[c]))
  const d = phones(q[0], q[1], q[2])
  min = Math.min(min, d)
  if (d < 0) inside++
}
console.log(`baked hair ${V} verts: nearest headphones ${min.toFixed(4)} R, inside them ${inside}`)
await server.close()
