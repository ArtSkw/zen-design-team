import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute, Vector2, Vector3, type Material } from 'three'
import { knit } from './knit'
import { ghostOf } from './materials'
import { keyed, smooth } from '../lib/anim'

// Karol's beanie (docs/cast/karol.png, body circle (626, 692) px, R 380): an olive
// fisherman beanie in a deep rib, worn pushed back. A folded cuff runs round the head,
// high over the face (its lower edge 41° up at the front, where it meets the plate's top)
// and down over the sides (12°), and a crown rises out of it into a rounded cone, 1.30 R
// at the top (the design's silhouette). Built in the head frame (R = 1) as surfaces of the
// head's yaw: each yaw has a section (the meridian: `h` out from the head's axis, `y` up)
// through the cuff — a roll at its lower edge, its face, the fold over its top — and one
// up the crown. The ribs run up the meridians: in the silhouette as geometry, in the
// shading as a height field (knit.ts).

const D = Math.PI / 180
const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180
const noRaycast = () => null

/** Keys over |yaw| 0…180°, mirrored both ways so the curve runs smooth through the face and the nape. */
function bySide(keys: [number, number][]) {
  const all: [number, number][] = []
  for (const [x, y] of keys) {
    all.push([x, y])
    if (x > 0) all.push([-x, y])
    if (x < 180) all.push([360 - x, y])
  }
  const f = keyed(all)
  return (yaw: number) => f(Math.abs(wrap(yaw)))
}

// The cuff's lower edge (pitch by yaw): traced from the design's front view (fitted on a
// radius of 1.04) — level across the plate's top, dropping over the temples; the back a
// guess, low on the nape as a beanie sits.
const LOWER = bySide([[0, 40.8], [30, 39.7], [47, 38], [63, 31.5], [70, 25], [77, 19.5], [90, 15], [120, 10], [180, 8]])
// The cuff's height, in degrees of pitch up to the fold (the fold's arc, from the front,
// is rounder than the lower edge's: 1.02 R over the face, 0.93 R at ±0.6 R, 0.8 R at the sides).
const TALL = bySide([[0, 16], [45, 18], [70, 23], [90, 25], [180, 24]])
// The crown's radius by pitch: the design's silhouette (a rounded cone), round at the top.
const DOME = keyed([[20, 1.05], [30, 1.09], [42.5, 1.122], [52, 1.145], [60, 1.183], [70, 1.24], [80, 1.285], [90, 1.305], [100, 1.285]])

const EDGE_R = 1.035 // the cuff's face at its lower edge: snug on the head
const THICK = 0.06 // two layers of knit at the lower edge, rolled
const FOLD = 0.034 // the roll over the cuff's top
const BULGE = 0.016 // the cuff's face swells between its edges
const STEP = 0.065 // the crown comes out of the fold this far inside the dome, meeting it higher up
// Round the head, `RIBS` round knit ribs with a narrow groove between each two (the design:
// a groove every ~0.06 R across the front of the cuff)
export const RIBS = 68
const PER_RIB = 5 // vertex columns per rib (the shading is per pixel)
const RIB_H = 0.016 // crest to groove, R

const m2 = (pitch: number, r: number) => new Vector2(r * Math.cos(pitch * D), r * Math.sin(pitch * D))
type Row = { p: Vector2; amp: number }

/** The cuff's section at a yaw: in at the lower edge, round its roll, up its face, over the fold, down inside. */
function cuffSection(yaw: number): Row[] {
  const pL = LOWER(yaw)
  const p1 = pL + TALL(yaw)
  const P0 = m2(pL, EDGE_R)
  const P1 = m2(p1, DOME(p1) + FOLD)
  const t = P1.clone().sub(P0).normalize() // up the face
  const n = new Vector2(t.y, -t.x) // out of it
  const at = (c: Vector2, r: number, th: number, up: Vector2) => c.clone().addScaledVector(n, r * Math.cos(th)).addScaledVector(up, r * Math.sin(th))
  const rows: Row[] = []
  // inside, a little up from the lower edge, then round the roll under it
  const C0 = P0.clone().addScaledVector(n, -THICK / 2)
  rows.push({ p: C0.clone().addScaledVector(n, -THICK / 2).addScaledVector(t, 0.04), amp: 0.3 })
  for (const th of [Math.PI, 0.75 * Math.PI, 0.5 * Math.PI, 0.25 * Math.PI]) rows.push({ p: at(C0, THICK / 2, th, t.clone().negate()), amp: 0.45 })
  // the face
  const S = 12
  for (let i = 0; i <= S; i++) {
    const s = i / S
    rows.push({ p: P0.clone().lerp(P1, s).addScaledVector(n, BULGE * Math.sin(Math.PI * s)), amp: 1 })
  }
  // over the fold and down inside it
  const C1 = P1.clone().addScaledVector(n, -FOLD)
  for (const th of [0.25 * Math.PI, 0.5 * Math.PI, 0.75 * Math.PI, Math.PI]) rows.push({ p: at(C1, FOLD, th, t), amp: 0.6 })
  rows.push({ p: C1.clone().addScaledVector(n, -FOLD).addScaledVector(t, -0.03), amp: 0.3 })
  return rows
}

const CROWN_ROWS = 30
/** The crown's section: out of the fold (tucked inside it) up to the top. */
function crownSection(yaw: number): Row[] {
  const p1 = LOWER(yaw) + TALL(yaw)
  const p0 = p1 - 2
  const rows: Row[] = []
  for (let i = 0; i <= CROWN_ROWS; i++) {
    const u = i / CROWN_ROWS
    const p = p0 + (90 - p0) * (1 - (1 - u) * (1 - u) * 0.35 - 0.65 * (1 - u)) // a little denser toward the top, where it rounds over
    const r = DOME(p) - STEP * (1 - smooth(p1 - 2, p1 + 14, p))
    rows.push({ p: m2(p, r), amp: 1 - smooth(80, 89, p) })
  }
  return rows
}

/**
 * The rib's height, −0.6 (the groove) … 0.4 (the crest): a round rib, a narrow creased
 * groove. Merging in pairs by `w`. The shader draws the same profile (knit.ts).
 */
export const ribProfile = (ph: number) => Math.pow(0.5 + 0.5 * Math.cos(ph), 0.45) - 0.6
const ribAt = (ph: number, w: number) => ribProfile(ph) * (1 - w) + ribProfile(ph * 0.5) * w

/**
 * A surface over (yaw, row): every column a section at its yaw. Positions are pushed out
 * along the smooth cloth's normal by the ribs; the normals stay smooth (the shader bumps
 * the ribs per pixel). `merge(row)` pairs the ribs up (the crown's top).
 */
function surface(section: (yaw: number) => Row[], merge: (p: Vector2) => number) {
  const cols = RIBS * PER_RIB
  const pos: number[] = []
  const nrm: number[] = []
  const kn: number[] = []
  const idx: number[] = []
  const to3 = (yaw: number, p: Vector2) => new Vector3(p.x * Math.sin(yaw * D), p.y, p.x * Math.cos(yaw * D))
  let rows = 0
  for (let j = 0; j <= cols; j++) {
    const yaw = -180 + (360 * j) / cols
    const sec = section(yaw)
    const secA = section(yaw - 0.3)
    const secB = section(yaw + 0.3)
    rows = sec.length
    let along = 0
    for (let i = 0; i < sec.length; i++) {
      if (i > 0) along += sec[i].p.distanceTo(sec[i - 1].p)
      const p = to3(yaw, sec[i].p)
      // the normal: across the yaw × along the section, facing out of the cloth
      const dYaw = to3(yaw + 0.3, secB[i].p).sub(to3(yaw - 0.3, secA[i].p))
      const a = sec[Math.max(0, i - 1)].p
      const b = sec[Math.min(sec.length - 1, i + 1)].p
      const d = b.clone().sub(a)
      const mer = new Vector2(d.y, -d.x).normalize() // out of the cloth, in the section's plane
      const out = to3(yaw, mer).sub(to3(yaw, new Vector2(0, 0)))
      const dRow = to3(yaw, b).sub(to3(yaw, a))
      const n = new Vector3().crossVectors(dYaw, dRow)
      if (n.lengthSq() < 1e-12) n.copy(out)
      n.normalize()
      if (n.dot(out) < 0) n.negate()
      const ph = RIBS * yaw * D
      const w = merge(sec[i].p)
      const amp = sec[i].amp
      p.addScaledVector(n, RIB_H * amp * ribAt(ph, w))
      pos.push(p.x, p.y, p.z)
      nrm.push(n.x, n.y, n.z)
      kn.push(ph, along, amp, w)
    }
  }
  for (let j = 0; j < cols; j++)
    for (let i = 0; i < rows - 1; i++) {
      const a = j * rows + i
      const b = a + rows
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nrm, 3))
  g.setAttribute('knit', new Float32BufferAttribute(kn, 4))
  g.setIndex(idx)
  g.computeBoundingSphere()
  return g
}

const pitchOf = (p: Vector2) => Math.atan2(p.y, p.x) / D

export function Beanie({ R, ghost, color }: { R: number; ghost: boolean; color: string }) {
  const g = useMemo(
    () => ({
      cuff: surface(cuffSection, () => 0),
      crown: surface(crownSection, (p) => smooth(64, 78, pitchOf(p))),
    }),
    [],
  )
  const mat = knit(color)
  const mm = (m: Material) => (ghost ? ghostOf(m) : m)
  const rc = ghost ? noRaycast : undefined
  return (
    <group scale={R}>
      <mesh geometry={g.cuff} material={mm(mat)} raycast={rc} castShadow receiveShadow />
      <mesh geometry={g.crown} material={mm(mat)} raycast={rc} castShadow receiveShadow />
    </group>
  )
}
