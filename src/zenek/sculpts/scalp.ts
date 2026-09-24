import { smax, type Sdf, type V3 } from '../sculpt'

// Helpers for hair that sits on the head: positions by yaw/pitch on the scalp, a
// hairline as pitch-by-yaw, and a shell over the scalp that ends at the hairline.
// Yaw 0 is the face (+z), positive yaw toward the viewer's right (+x); pitch 0 is the
// equator, +90° the crown. Degrees in, head-frame units out.

const D = Math.PI / 180
export const onScalp = (yawDeg: number, pitchDeg: number, r = 1): V3 => {
  const y = yawDeg * D
  const p = pitchDeg * D
  return [r * Math.cos(p) * Math.sin(y), r * Math.sin(p), r * Math.cos(p) * Math.cos(y)]
}
export const yawOf = (x: number, _y: number, z: number) => Math.atan2(x, z) / D
export const pitchOf = (x: number, y: number, z: number) => Math.asin(Math.max(-1, Math.min(1, y / (Math.hypot(x, y, z) || 1)))) / D

/** Linear interpolation through [yaw, pitch] keys (|yaw| symmetric unless keys go negative). */
export function hairline(keys: [number, number][], symmetric = true) {
  const k = [...keys].sort((a, b) => a[0] - b[0])
  return (yawDeg: number) => {
    const y = symmetric ? Math.abs(yawDeg) : yawDeg
    if (y <= k[0][0]) return k[0][1]
    for (let i = 1; i < k.length; i++)
      if (y <= k[i][0]) {
        const t = (y - k[i - 1][0]) / (k[i][0] - k[i - 1][0])
        const s = t * t * (3 - 2 * t)
        return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * s
      }
    return k[k.length - 1][1]
  }
}

/**
 * A shell over the scalp from `inner` to `outer(pitch)` radius, ending at the hairline
 * with a soft rolled edge: above the edge only.
 */
export function scalpShell(edge: (yawDeg: number) => number, inner: number, outer: (pitchDeg: number) => number, soft = 0.03, outerAt?: (x: number, y: number, z: number) => number): Sdf {
  return (x, y, z) => {
    const r = Math.hypot(x, y, z)
    const p = pitchOf(x, y, z)
    const shell = Math.max(r - (outerAt ? outerAt(x, y, z) : outer(p)), inner - r)
    const region = (edge(yawOf(x, y, z)) - p) * D * r // > 0 below the hairline
    return smax(shell, region, soft)
  }
}
