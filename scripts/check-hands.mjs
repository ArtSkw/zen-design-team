// Do a character's hands keep clear of its sculpts through every gesture? Hands placed by the
// gesture curves (src/zenek/gestures.ts) from the canon rest; each hand's surface is sampled
// against each sculpt's field (the fields are not exact distances, so the centre alone can't
// say): the smallest value found (< 0 = the hand goes into it). Garments on the body always
// read a little INTO at the hands: by the canon they overlap the body sphere by 0.155 R.
// Things worn or held in a paw (bangles, a crystal ball) are sampled with it. `--turn` also
// sweeps the head turned relative to the hands, as motion.ts turns them: the hands follow the
// body's turn at 0.85 (the head turns up to 0.7 rad, so up to ~6° between them) and a gesture's
// own head yaw at 0.4 — so at each moment of a gesture the head can be up to
// 6° + 0.6 × its yaw off the hands (`--turn deg` sweeps a fixed angle instead).
//   node scripts/check-hands.mjs mirek [--turn | --turn 18]
import { createServer } from 'vite'
const id = process.argv[2] ?? 'mirek'
const ti = process.argv.indexOf('--turn')
const TURN = ti < 0 ? 0 : Number.isFinite(Number(process.argv[ti + 1])) ? Number(process.argv[ti + 1]) : 'auto'
const SOCIAL = 0.7 * (1 - 0.85) * (180 / Math.PI) // the social turn's share, degrees
const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { middlewareMode: true } })
const { SCULPTS } = await server.ssrLoadModule('/src/zenek/sculpts/index.ts')
const { TEAM } = await server.ssrLoadModule('/src/cast/team.ts')
const { headTraits } = await server.ssrLoadModule('/src/zenek/parts.tsx')
const { gesture, offsets, DURATION, allowed } = await server.ssrLoadModule('/src/zenek/gestures.ts')
const { CANON } = await server.ssrLoadModule('/src/zenek/proportions.ts')
const { BALL } = await server.ssrLoadModule('/src/zenek/edyta-layout.ts')
const trinkets = await server.ssrLoadModule('/src/zenek/trinkets.tsx')
const m = TEAM.find((t) => t.id === id)
const traits = { ...headTraits(m.parts), bulky: !!m.arms }
const names = m.parts.filter((p) => p.type === 'sculpt' || p.type === 'garment' || p.type === 'kerchief').map((p) => p.name)
const fields = Object.fromEntries(names.map((n) => [n, SCULPTS[n].build().sdf]))
const H = CANON.hand
// points spread over a unit sphere (a Fibonacci lattice)
const SPH = Array.from({ length: 160 }, (_, i) => {
  const y = 1 - (2 * (i + 0.5)) / 160
  const r = Math.sqrt(1 - y * y)
  const a = i * 2.39996
  return [r * Math.cos(a), y, r * Math.sin(a)]
})
// points of what each paw carries, in its frame (R units)
const carried = { l: [], r: [] }
const verts = (g, step, mirror) => {
  const p = g.attributes.position
  const out = []
  for (let i = 0; i < p.count; i += step) out.push([(mirror ? -1 : 1) * p.getX(i), p.getY(i), p.getZ(i)])
  return out
}
for (const p of m.parts) {
  if (p.type === 'bangles') carried[p.hand].push(...verts(trinkets.banglesGeometry(), 3, p.hand === 'r'))
  if (p.type === 'crystal-ball') {
    const s = p.hand === 'l' ? -1 : 1
    carried[p.hand].push(...SPH.map((q) => [s * BALL.at[0] + q[0] * BALL.r, BALL.at[1] + q[1] * BALL.r, BALL.at[2] + q[2] * BALL.r]))
    carried[p.hand].push(...verts(trinkets.cupGeometry(), 2, p.hand === 'l'))
  }
}
if (carried.l.length + carried.r.length) console.log(`carried: ${carried.l.length} points on the left paw, ${carried.r.length} on the right`)
if (TURN) console.log(TURN === 'auto' ? `head turned relative to the hands: ${SOCIAL.toFixed(1)}° + 0.6 × the gesture's yaw, either way` : `head turned ±${TURN}°`)
for (const kind of Object.keys(DURATION)) {
  if (!allowed(kind, traits)) continue
  const worst = Object.fromEntries(names.map((n) => [n, [Infinity, 0]]))
  for (const side of [1, -1])
    for (let k = 0; k <= 30; k++) {
      const u = k / 30
      const o = offsets()
      gesture(kind, u, side, o, DURATION[kind], traits)
      const rel = traits.rigidPaws ? 0 : TURN === 'auto' ? SOCIAL + 0.6 * Math.abs(o.yaw) * (180 / Math.PI) : TURN // rigid paws turn with the head
      const turns = rel ? [-rel, -rel / 2, 0, rel / 2, rel] : [0]
      // the paws must not pass through each other, nor a carried thing through the other paw
      {
        const cr = [H.x + o.hr.x, H.y + o.hr.y, H.z + o.hr.z]
        const cl = [-H.x + o.hl.x, H.y + o.hl.y, H.z + o.hl.z]
        let d = Math.hypot(cr[0] - cl[0], cr[1] - cl[1], cr[2] - cl[2]) - 2 * H.r
        for (const [key, c, other] of [['r', cr, cl], ['l', cl, cr]])
          for (const q of carried[key]) d = Math.min(d, Math.hypot(c[0] + q[0] - other[0], c[1] + q[1] - other[1], c[2] + q[2] - other[2]) - H.r)
        if (d < (worst.paws ?? [Infinity])[0]) worst.paws = [d, u]
      }
      for (const [s, off, key] of [[1, o.hr, 'r'], [-1, o.hl, 'l']]) {
        const c = [s * H.x + off.x, H.y + off.y, H.z + off.z]
        const pts = [...SPH.map((q) => [c[0] + q[0] * H.r, c[1] + q[1] * H.r, c[2] + q[2] * H.r]), ...carried[key].map((q) => [c[0] + q[0], c[1] + q[1], c[2] + q[2]])]
        for (const tdeg of turns) {
          // the head turned by tdeg relative to the hands: bring the points into the head's frame
          const a = (-tdeg * Math.PI) / 180
          const ca = Math.cos(a), sa = Math.sin(a)
          for (const n of names)
            for (const q of pts) {
              const d = fields[n](ca * q[0] + sa * q[2], q[1], -sa * q[0] + ca * q[2])
              if (d < worst[n][0]) worst[n] = [d, u]
            }
        }
        // what a paw carries must stay out of the body too
        for (const q of carried[key]) {
          const d = Math.hypot(c[0] + q[0], c[1] + q[1], c[2] + q[2]) - 1
          if (d < (worst.body ?? [Infinity])[0]) worst.body = [d, u]
        }
      }
    }
  const all = [...names, ...(worst.body ? ['body'] : []), 'paws']
  console.log(kind.padEnd(8), all.map((n) => `${n} ${worst[n][0].toFixed(3)}${worst[n][0] < 0 ? ' INTO' : ''} (u ${worst[n][1].toFixed(2)})`).join(' | '))
}
await server.close()
