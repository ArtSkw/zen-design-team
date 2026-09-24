import { Field, lockP, ribbonP, type Prim, type V3 } from '../sculpt'
import { hairline, onScalp, pitchOf, scalpShell, yawOf } from './scalp'
import type { SculptSpec } from './types'

// Magda R (docs/cast/magda-r.png; body circle (633, 670) px, R 388; the design's face is
// turned ≈ 11° toward the viewer's right — the model faces front and is reviewed at that
// turn). Wavy brown hair, parted at the top-left: a big front wave sweeps over the
// forehead to the viewer's right and curls out at the temple; a wavy lock falls down
// the right side; a face-framing lock on the left ends in a curl; the rest is gathered
// from the parting and both sides into a black scrunchie high on the back of the head,
// and a ponytail of coiled curls hangs down the back (Artur, 2026-09-23: tied at the
// back, not swung out to the side). Model yaw = design yaw − 11°. x < 0 is the viewer's
// left (her right).

/** Where the hair is gathered: high on the back of the head, a touch to her right. */
export const TIE_AT: [number, number] = [-172, 40] // yaw, pitch

const PART: [number, number] = [-16, 80] // yaw, pitch of the parting

const edge = hairline(
  [
    [-180, 18],
    [-120, 22],
    [-75, 30],
    [-55, 40],
    [-20, 44],
    [10, 44],
    [60, 44],
    [85, 36],
    [120, 24],
    [180, 18],
  ],
  false,
)
const outerAt = (yaw: number, p: number) => {
  const u = Math.min(1, Math.max(0, (p - edge(yaw)) / 22))
  return 1.02 + 0.11 * u * u * (3 - 2 * u)
}

/** A wavy lock: points along a spine, displaced sideways by a sine (`amp`, `waves`), each lock its own phase. */
function wavy(spine: V3[], side: V3, amp: number, waves: number, phase: number): V3[] {
  const out: V3[] = []
  const n = 10
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const f = t * (spine.length - 1)
    const k = Math.min(spine.length - 2, Math.floor(f))
    const u = f - k
    const p: V3 = [spine[k][0] + (spine[k + 1][0] - spine[k][0]) * u, spine[k][1] + (spine[k + 1][1] - spine[k][1]) * u, spine[k][2] + (spine[k + 1][2] - spine[k][2]) * u]
    const w = Math.sin(t * Math.PI * 2 * waves + phase) * amp * Math.min(1, t * 2.5)
    out.push([p[0] + side[0] * w, p[1] + side[1] * w, p[2] + side[2] * w])
  }
  return out
}

function prims(): Prim[] {
  const out: Prim[] = []
  let g = 0
  // 1. the front wave: two broad ribbons from the parting — the upper one arcs high over
  //    the forehead to the right temple, the lower one falls over the plate's top edge and
  //    curls out past the head at the temple, turning back up
  out.push(
    ...ribbonP([onScalp(PART[0] + 2, PART[1] - 2, 1.1), onScalp(4, 71, 1.27), onScalp(38, 61, 1.24), onScalp(70, 52, 1.17), onScalp(92, 46, 1.17)], 0.36, 5, [0.08, 0.1, 0.09, 0.072, 0.05], g++, { taper: 0.5 }),
    ...ribbonP([onScalp(PART[0] + 6, PART[1] - 7, 1.07), onScalp(10, 60, 1.16), onScalp(44, 49, 1.15), onScalp(76, 43, 1.14), onScalp(98, 36, 1.22), onScalp(95, 43, 1.28)], 0.3, 5, [0.07, 0.085, 0.08, 0.065, 0.045, 0.03], g++, { taper: 0.3 }),
  )
  // 2. the right side: a wavy ribbon from the temple down, curling toward the face
  out.push(
    ...ribbonP(
      [...wavy([onScalp(86, 42, 1.1), onScalp(95, 22, 1.15), onScalp(100, 2, 1.18), onScalp(99, -12, 1.2)], [0, 0, 1], 0.075, 1.6, 0.4), onScalp(92, -17, 1.24), onScalp(86, -12, 1.25)],
      0.13,
      4,
      [0.07, 0.075, 0.07, 0.062, 0.052, 0.04, 0.026],
      g++,
      { taper: 0.4 },
    ),
  )
  // 3. the face-framing lock on the left: a broad S-wave ribbon, curling at the end
  out.push(
    ...ribbonP(
      [...wavy([onScalp(-50, 50, 1.08), onScalp(-56, 32, 1.12), onScalp(-60, 13, 1.14), onScalp(-61, -3, 1.15)], [1, 0, 0.3], 0.08, 1.8, 0.1), onScalp(-54, -9, 1.19), onScalp(-49, -3, 1.2)],
      0.16,
      4,
      [0.07, 0.075, 0.072, 0.064, 0.054, 0.042, 0.026],
      g++,
      { taper: 0.4 },
    ),
  )
  // 4. gathered back into the tie: from the parting over the top, from the left temple
  //    round the left side, and from behind the right lock round the right side
  const T = onScalp(TIE_AT[0], TIE_AT[1], 1.06)
  out.push(
    ...ribbonP([onScalp(PART[0] - 4, PART[1] - 4, 1.09), onScalp(-110, 78, 1.14), T], 0.34, 5, [0.08, 0.095, 0.065], g++, { taper: 0.35 }),
    ...ribbonP([onScalp(-46, 56, 1.08), onScalp(-100, 56, 1.13), onScalp(-150, 46, 1.1), T], 0.3, 5, [0.08, 0.09, 0.085, 0.06], g++, { taper: 0.35 }),
    ...ribbonP([onScalp(108, 46, 1.08), onScalp(150, 50, 1.11), T], 0.3, 5, [0.075, 0.085, 0.06], g++, { taper: 0.35 }),
  )
  // 5. the ponytail: out of the scrunchie and down the back of the head — a full mass of
  //    coiled curls, fullest halfway down, drifting a little to her right (the viewer's
  //    left) so its curls peek out past the head from the front, as drawn
  const spine = (t: number): V3 => onScalp(TIE_AT[0] + 34 * t * t, TIE_AT[1] + 2 - 62 * t, 1.2 + 0.24 * Math.sin(Math.PI * Math.min(1, t * 1.1)))
  const frame = (t: number) => {
    const p = spine(t)
    const l = Math.hypot(p[0], p[1], p[2])
    const away: V3 = [p[0] / l, p[1] / l, p[2] / l]
    const yaw = ((TIE_AT[0] + 34 * t * t) * Math.PI) / 180
    const side: V3 = [Math.cos(yaw), 0, -Math.sin(yaw)] // across the back
    return { p, away, side }
  }
  const locks = 11
  for (let k = 0; k < locks; k++) {
    const phi = (k / locks) * Math.PI * 2
    const pts: V3[] = []
    const radii: number[] = []
    const n = 22
    const len = 0.82 + 0.18 * (((k * 37) % 7) / 6) // curls end at different lengths
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * len
      const { p, away, side } = frame(t)
      const spread = 0.07 + 0.19 * Math.sin(Math.PI * Math.min(1, t * 1.2)) // full in the middle
      const coil = 0.035 + 0.07 * t // curls loosen toward the ends
      const th = phi * 1.7 + t * Math.PI * 2 * 2.4
      const a = Math.cos(phi) * spread + Math.cos(th) * coil
      const b = Math.sin(phi) * spread * 0.6 + Math.sin(th) * coil
      pts.push([p[0] + side[0] * a + away[0] * b, p[1] + side[1] * a + away[1] * b, p[2] + side[2] * a + away[2] * b])
      radii.push(0.085 - 0.05 * (i / n))
    }
    out.push(...lockP(pts, radii, g++, { segs: 48 }))
  }
  return out
}

export const magdaHair: SculptSpec = {
  build: () => {
    const base = scalpShell(edge, 0.97, (p) => p, 0.03, (x, y, z) => outerAt(yawOf(x, y, z), pitchOf(x, y, z)))
    const f = new Field(prims(), { k: 0.045, kGroups: 0.03, base, kBase: 0.04 })
    return { sdf: f.sdf, dirAt: (x, y, z) => f.dirAt(x, y, z) }
  },
  center: [-0.1, 0.25, -0.15],
  half: 1.6,
  res: 170,
  ao: { ao: 0.04, aoDark: 0.55 },
  triangles: 38000,
}

// the black scrunchie where the ponytail is gathered: a puffy ring round the tail's root
export const magdaTie: SculptSpec = {
  build: () => {
    const c = onScalp(TIE_AT[0], TIE_AT[1] + 1, 1.19)
    const l = Math.hypot(...c)
    const axis: V3 = [c[0] / l, c[1] / l, c[2] / l] // the tail leaves along the head's normal
    const yaw = (TIE_AT[0] * Math.PI) / 180
    const u: V3 = [Math.cos(yaw), 0, -Math.sin(yaw)]
    const v: V3 = [axis[1] * u[2] - axis[2] * u[1], axis[2] * u[0] - axis[0] * u[2], axis[0] * u[1] - axis[1] * u[0]]
    const ring: V3[] = []
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2
      ring.push([c[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * 0.12, c[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * 0.12, c[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * 0.12])
    }
    ring.push(ring[0])
    const f = new Field(lockP(ring, ring.map(() => 0.058), 0, { segs: 40 }), { k: 0.02 })
    return { sdf: f.sdf }
  },
  center: onScalp(TIE_AT[0], TIE_AT[1] + 1, 1.19),
  half: 0.24,
  res: 70,
  ao: { ao: 0.02, aoDark: 0.65 },
  triangles: 3000,
}
