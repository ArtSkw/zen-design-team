// Bake the sculpted accessories: every spec in src/zenek/sculpts/index.ts is meshed
// (marching cubes over its field), welded, given baked crease shading and lock
// directions, simplified with meshoptimizer, quantised and written to
// public/sculpts/<name>.bin — loaded at runtime by src/zenek/sculptAsset.ts.
//   node scripts/sculpt-bake.mjs            (all)
//   node scripts/sculpt-bake.mjs krystian-hair artur-beard
import { createServer } from 'vite'
import { mkdirSync, writeFileSync } from 'node:fs'
import { MeshoptSimplifier } from 'meshoptimizer'

const want = process.argv.slice(2)
const server = await createServer({ configFile: 'vite.config.ts', logLevel: 'silent', server: { middlewareMode: true } })
const { SCULPTS } = await server.ssrLoadModule('/src/zenek/sculpts/index.ts')
const { meshField } = await server.ssrLoadModule('/src/zenek/sculpt.ts')
await MeshoptSimplifier.ready
mkdirSync('public/sculpts', { recursive: true })

for (const [name, spec] of Object.entries(SCULPTS)) {
  if (want.length && !want.includes(name)) continue
  const t0 = Date.now()
  const { sdf, dirAt } = spec.build()
  const m = meshField(sdf, dirAt ?? null, spec.center, spec.half, spec.res ?? 128, spec.ao ?? {})
  const V0 = m.position.length / 3
  const I0 = m.index.length
  // simplify toward the target triangle count, keeping the silhouette (error in units of the mesh extent)
  const target = Math.min(I0, (spec.triangles ?? 16000) * 3)
  const [idx] = MeshoptSimplifier.simplify(m.index, m.position, 3, target, spec.error ?? 0.004, [])
  // compact: keep only the vertices still referenced
  const remap = new Int32Array(V0).fill(-1)
  let V = 0
  for (const i of idx) if (remap[i] < 0) remap[i] = V++
  const pos = new Float32Array(V * 3)
  const dir = new Float32Array(V * 3)
  const ao = new Float32Array(V)
  for (let v = 0; v < V0; v++) {
    const r = remap[v]
    if (r < 0) continue
    pos.set(m.position.subarray(v * 3, v * 3 + 3), r * 3)
    dir.set(m.dir.subarray(v * 3, v * 3 + 3), r * 3)
    ao[r] = m.ao[v]
  }
  const index = Uint32Array.from(idx, (i) => remap[i])
  // smooth the lock directions over the surface: where locks overlap the nearest-lock
  // direction jumps, and the shader's strand grooves (which run across it) would draw
  // wood-grain contours there
  {
    const nb = Array.from({ length: V }, () => new Set())
    for (let t = 0; t < index.length; t += 3)
      for (let e = 0; e < 3; e++) {
        const a = index[t + e]
        const b = index[t + ((e + 1) % 3)]
        nb[a].add(b)
        nb[b].add(a)
      }
    let cur = dir
    for (let it = 0; it < (spec.dirSmooth ?? 12); it++) {
      const nx = new Float32Array(V * 3)
      for (let v = 0; v < V; v++) {
        let x = cur[v * 3]
        let y = cur[v * 3 + 1]
        let z = cur[v * 3 + 2]
        for (const w of nb[v]) {
          // align signs: a lock's direction and its reverse draw the same grooves
          const d = cur[w * 3] * cur[v * 3] + cur[w * 3 + 1] * cur[v * 3 + 1] + cur[w * 3 + 2] * cur[v * 3 + 2]
          const sg = d < 0 ? -1 : 1
          x += cur[w * 3] * sg
          y += cur[w * 3 + 1] * sg
          z += cur[w * 3 + 2] * sg
        }
        const l = Math.hypot(x, y, z) || 1
        nx[v * 3] = x / l
        nx[v * 3 + 1] = y / l
        nx[v * 3 + 2] = z / l
      }
      cur = nx
    }
    dir.set(cur)
  }
  // quantise into the mesh's own box
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let v = 0; v < V; v++)
    for (let c = 0; c < 3; c++) {
      min[c] = Math.min(min[c], pos[v * 3 + c])
      max[c] = Math.max(max[c], pos[v * 3 + c])
    }
  const pad4 = (n) => (n + 3) & ~3
  const wide = V > 65535
  const size = 36 + pad4(V * 6) + pad4(V * 3) + pad4(V) + index.length * (wide ? 4 : 2)
  const buf = Buffer.alloc(size)
  let o = 0
  buf.write('ZSC1', 0, 'ascii')
  buf.writeUInt32LE(V, 4)
  buf.writeUInt32LE(index.length, 8)
  for (let c = 0; c < 3; c++) {
    buf.writeFloatLE(min[c], 12 + c * 4)
    buf.writeFloatLE(max[c], 24 + c * 4)
  }
  o = 36
  for (let v = 0; v < V; v++)
    for (let c = 0; c < 3; c++) {
      const span = max[c] - min[c] || 1
      buf.writeUInt16LE(Math.round(((pos[v * 3 + c] - min[c]) / span) * 65535), o)
      o += 2
    }
  o = 36 + pad4(V * 6)
  for (let v = 0; v < V * 3; v++) buf.writeInt8(Math.max(-127, Math.min(127, Math.round(dir[v] * 127))), o + v)
  o += pad4(V * 3)
  for (let v = 0; v < V; v++) buf.writeUInt8(Math.round(ao[v] * 255), o + v)
  o += pad4(V)
  for (const i of index) {
    if (wide) buf.writeUInt32LE(i, o)
    else buf.writeUInt16LE(i, o)
    o += wide ? 4 : 2
  }
  writeFileSync(`public/sculpts/${name}.bin`, buf)
  console.log(`${name}: ${V0} → ${V} verts, ${I0 / 3} → ${index.length / 3} tris, ${(size / 1024).toFixed(0)} KB, ${Date.now() - t0} ms`)
}
await server.close()
