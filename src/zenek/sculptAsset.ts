import { useEffect, useState } from 'react'
import { BufferAttribute, BufferGeometry, Float32BufferAttribute } from 'three'

// Baked sculpts (scripts/sculpt-bake.mjs → public/sculpts/<name>.bin): positions
// quantised to 16 bits in the mesh's box, lock directions as bytes, baked crease
// shading as a byte, triangle indices. Decoded once, shared by every Zenek that wears it.

const cache = new Map<string, Promise<BufferGeometry>>()

function decode(buf: ArrayBuffer) {
  const dv = new DataView(buf)
  if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'ZSC1') throw new Error('not a sculpt')
  const V = dv.getUint32(4, true)
  const I = dv.getUint32(8, true)
  const min = [dv.getFloat32(12, true), dv.getFloat32(16, true), dv.getFloat32(20, true)]
  const max = [dv.getFloat32(24, true), dv.getFloat32(28, true), dv.getFloat32(32, true)]
  const pad4 = (n: number) => (n + 3) & ~3
  let o = 36
  const q = new Uint16Array(buf, o, V * 3)
  o += pad4(V * 6)
  const d8 = new Int8Array(buf, o, V * 3)
  o += pad4(V * 3)
  const a8 = new Uint8Array(buf, o, V)
  o += pad4(V)
  const index = V > 65535 ? new Uint32Array(buf, o, I) : new Uint16Array(buf, o, I)
  const pos = new Float32Array(V * 3)
  for (let i = 0; i < V * 3; i++) {
    const c = i % 3
    pos[i] = min[c] + (q[i] / 65535) * (max[c] - min[c])
  }
  const col = new Float32Array(V * 3)
  for (let v = 0; v < V; v++) col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = a8[v] / 255
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.setAttribute('dir', new BufferAttribute(new Int8Array(d8), 3, true))
  g.setIndex(new BufferAttribute(index.slice(), 1))
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

export function loadSculpt(name: string): Promise<BufferGeometry> {
  let p = cache.get(name)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}sculpts/${name}.bin`)
      .then((r) => {
        if (!r.ok) throw new Error(`sculpt ${name}: ${r.status}`)
        return r.arrayBuffer()
      })
      .then(decode)
    cache.set(name, p)
  }
  return p
}

/** Load every sculpt the cast wears (the boot waits for it, so nobody arrives half-dressed). */
export const preloadSculpts = (names: string[]) => Promise.all(names.map((n) => loadSculpt(n).catch(() => null))).then(() => undefined)

export function useSculpt(name: string): BufferGeometry | null {
  const [g, setG] = useState<BufferGeometry | null>(null)
  useEffect(() => {
    if (!name) return
    let live = true
    loadSculpt(name)
      .then((geo) => live && setG(geo))
      .catch((e) => console.warn(e))
    return () => {
      live = false
    }
  }, [name])
  return g
}
