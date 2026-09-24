// Fit the body circle of a design: the lowest opaque-dark pixel of each column across
// the middle of the body (the bottom arc — clear of hands, hair and beards) → least-
// squares circle. Prints centre and radius in design pixels.
//   node scripts/fit-body.mjs docs/cast/krystian.png [--rows 480,620]   (rows clear of hair and hands add the side edges)
import sharp from 'sharp'
const file = process.argv[2]
const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const W = info.width
const H = info.height
const solid = (x, y) => {
  const i = (y * W + x) * 4
  return data[i + 3] > 200 && data[i] + data[i + 1] + data[i + 2] < 3 * 110
}
// rough extent: the widest run of solid pixels in the lower half
let lo = W
let hi = 0
for (let y = Math.round(H * 0.55); y < H; y += 4) {
  let l = -1
  let r = -1
  for (let x = 0; x < W; x++) if (solid(x, y)) { l = x; break }
  for (let x = W - 1; x >= 0; x--) if (solid(x, y)) { r = x; break }
  if (l >= 0) { lo = Math.min(lo, l); hi = Math.max(hi, r) }
}
const cx0 = (lo + hi) / 2
const span = (hi - lo) / 2
const pts = []
for (let x = Math.round(cx0 - span * 0.32); x <= Math.round(cx0 + span * 0.32); x += 2) {
  for (let y = H - 1; y > 0; y--)
    if (solid(x, y)) {
      pts.push([x, y + 0.5])
      break
    }
}
// side edges from rows clear of hair, hands and accessories (given by the caller)
const ri = process.argv.indexOf('--rows')
if (ri > 0) {
  const [r0, r1] = process.argv[ri + 1].split(',').map(Number)
  for (let y = r0; y <= r1; y += 3) {
    let l = -1
    let r = -1
    for (let x = 0; x < W; x++) if (solid(x, y)) { l = x; break }
    for (let x = W - 1; x >= 0; x--) if (solid(x, y)) { r = x; break }
    if (l >= 0) pts.push([l, y], [r + 1, y])
  }
}
// algebraic circle fit (Kåsa)
let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0, sz = 0
for (const [x, y] of pts) {
  const z = x * x + y * y
  sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sxz += x * z; syz += y * z; sz += z
}
const n = pts.length
const A = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]]
const b = [sxz, syz, sz]
const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
const D = det(A)
const col = (k) => A.map((row, i) => row.map((v, j) => (j === k ? b[i] : v)))
const [a1, a2, a3] = [det(col(0)) / D, det(col(1)) / D, det(col(2)) / D]
const cx = a1 / 2
const cy = a2 / 2
const R = Math.sqrt(a3 + cx * cx + cy * cy)
console.log(`${file}: centre (${cx.toFixed(0)}, ${cy.toFixed(0)}) R ${R.toFixed(0)}  [${n} bottom-arc points]`)
