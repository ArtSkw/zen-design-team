// How far a baked sculpt stands off the head: its outermost radius per band of pitch, split
// into the sides (|yaw| 60–120°), the front (< 60°) and the back (> 120°); and its widest
// frontal half-width (|x|, R) — does it stick out past the body's outline (1.0)?
//   node scripts/hair-extent.mjs mirek-hair krystian-hair
import { readFileSync } from 'node:fs'
for (const name of process.argv.slice(2)) {
  const b = readFileSync(`public/sculpts/${name}.bin`)
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const V = dv.getUint32(4, true)
  const lo = [0, 1, 2].map((c) => dv.getFloat32(12 + c * 4, true))
  const hi = [0, 1, 2].map((c) => dv.getFloat32(24 + c * 4, true))
  const bands = {}
  let maxX = 0
  for (let v = 0; v < V; v++) {
    const [x, y, z] = [0, 1, 2].map((c) => lo[c] + (dv.getUint16(36 + (v * 3 + c) * 2, true) / 65535) * (hi[c] - lo[c]))
    const r = Math.hypot(x, y, z)
    const p = (Math.asin(y / r) * 180) / Math.PI
    const yaw = Math.abs((Math.atan2(x, z) * 180) / Math.PI)
    const zone = yaw < 60 ? 'front' : yaw < 120 ? 'sides' : 'back'
    const k = `${zone} ${Math.floor(p / 15) * 15}`
    bands[k] = Math.max(bands[k] ?? 0, r)
    maxX = Math.max(maxX, Math.abs(x))
  }
  console.log(`${name}: widest |x| ${maxX.toFixed(3)} R`)
  for (const zone of ['front', 'sides', 'back'])
    console.log('  ' + zone.padEnd(6), Object.entries(bands).filter(([k]) => k.startsWith(zone)).sort((a, b) => +a[0].split(' ')[1] - +b[0].split(' ')[1]).map(([k, r]) => `${k.split(' ')[1]}°:${r.toFixed(2)}`).join('  '))
}
