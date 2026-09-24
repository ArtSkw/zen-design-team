import type { PartConfig } from '../zenek/parts'
import type { FaceOverride } from '../zenek/proportions'

/**
 * Jointed arms (the left one; the right is its mirror), in body-radius units: the upper
 * arm (a baked sculpt, origin at the shoulder pivot) hangs from `shoulder`; the forearm
 * (origin at the elbow pivot) hangs from `elbow`, given in the upper arm's frame; `scale`
 * grows the whole arm (both parts and the elbow) about the shoulder.
 */
export type ArmSpec = { upper: string; fore: string; shoulder: [number, number, number]; elbow: [number, number, number]; scale?: number }

// Seats are three.js world coordinates: y = the surface the Zenek rests on.
export type Seat = { x: number; y: number; z: number; yaw: number; scale?: number }

export type Member = {
  id: string
  name: string
  parts: PartConfig[]
  face?: FaceOverride            // plate and eye proportions measured from the design
  arms?: ArmSpec                 // jointed sculpted arms in place of the hand spheres
  seat: Seat
  gaze?: 'partner' | 'viewer'   // rest gaze; default: chat with the nearest neighbour
  temperament: { breath: number; blink: number; sway: number }
  seed: number
}

// Plan coords (x right, y up, z back) → three.js. Yaw ≈ 0.5 faces the home camera.
const at = (x: number, y: number, z: number, yaw: number, scale = 1): Seat => ({ x, y, z: -z, yaw, scale })
const STEP_UPPER = 0.5
const BENCH = 0.46
const CUSHION = 0.16
const STONE = 0.36 - 0.09

// A party, not a class photo: pairs, singles, three heights, the terrace in play.
export const TEAM: Member[] = [
  // ---- designed ------------------------------------------------------------
  {
    id: 'magda-r', name: 'Magda R.', seed: 11,
    // docs/cast/magda-r.png (2026-09-23 redesign) — body circle (633, 670) px, R 388
    parts: [
      { type: 'sculpt', name: 'magda-r-hair', color: '#5f3c2b', clay: { freq: 80, amp: 0.14, sheenColor: '#dcae8e' }, traits: { crown: true, waveSide: 1 } },
      { type: 'sculpt', name: 'magda-r-tie', color: '#161617', clay: { freq: 60, amp: 0.05, sheen: 0.2, roughness: 0.5 } },
      { type: 'glasses-round', color: '#c99a5c' },
    ],
    face: { plate: { a: 0.75, b: 0.456, y: 0.334 }, eye: { dx: 0.265, y: 0.162 } },
    seat: at(10.9, BENCH + 0.16, 4.4, 0.45),                // on the green cushion, bench by the glass (the table beside her stays in view)
    temperament: { breath: 1.0, blink: 1.0, sway: 1.0 },
  },
  {
    id: 'janek', name: 'Janek', seed: 23,
    // docs/cast/janek.png — body circle (627, 678) px, R 392
    parts: [
      { type: 'sculpt', name: 'janek-hair', color: '#2c2522', clay: { freq: 70, amp: 0.07, roughness: 0.5, sheen: 0.4, sheenColor: '#a89a8e' }, traits: { crown: true } },
      { type: 'face-janek' },
    ],
    face: { plate: { a: 0.78, b: 0.6, y: 0.25 }, eye: { dx: 0.2, y: 0.16 } },
    seat: at(3.2, STEP_UPPER, 9.9, 0.6),                     // upper platform by the slats
    temperament: { breath: 0.9, blink: 1.1, sway: 0.9 },
  },
  {
    id: 'artur', name: 'Artur', seed: 37,
    parts: [
      { type: 'sculpt', name: 'artur-beard', color: '#c68653', clay: { freq: 120, amp: 0.18, sheenColor: '#ffd6b0' }, traits: { front: true } },
      { type: 'sculpt', name: 'artur-moustache', color: '#cd8e5b', clay: { freq: 140, amp: 0.2, sheenColor: '#ffd6b0' } },
    ],
    face: { plate: { a: 0.6, b: 0.36, y: 0.26 }, eye: { dx: 0.17, y: 0.065 } },
    seat: at(15.6, 0, 2.4, -0.25),                           // arriving on the terrace, right edge
    gaze: 'viewer',                                            // the host greets whoever is looking
    temperament: { breath: 1.0, blink: 0.9, sway: 1.1 },
  },
  // ---- designs pending: plain Zeneks hold the seats ---------------------------
  { id: 'magda-j', name: 'Magda J.', seed: 41, parts: [], seat: at(5.6, CUSHION, 6.2, 0.5), temperament: { breath: 1.1, blink: 1.0, sway: 1.0 } },
  { id: 'aneta', name: 'Aneta', seed: 43, parts: [], seat: at(7.6, CUSHION, 5.6, 0.3), temperament: { breath: 0.95, blink: 1.2, sway: 0.9 } },
  { id: 'edyta', name: 'Edyta', seed: 47, parts: [], seat: at(1.55, BENCH, 4.4, 0.95), temperament: { breath: 1.05, blink: 0.9, sway: 1.1 } },
  { id: 'karol', name: 'Karol', seed: 53, parts: [], seat: at(1.55, BENCH, 6.6, 1.05), temperament: { breath: 0.9, blink: 1.0, sway: 1.2 } },
  {
    // docs/cast/kamil.png — body circle (627, 638) px, R 402
    id: 'kamil', name: 'Kamil', seed: 59,
    parts: [{ type: 'sculpt', name: 'kamil-hair', color: '#b89673', clay: { freq: 95, amp: 0.34 }, traits: { crown: true } }],
    face: { plate: { a: 0.72, b: 0.455, y: 0.32 }, eye: { dx: 0.18, y: 0.08 } },
    seat: at(8.2, 0, 7.6, 0.4), temperament: { breath: 1.15, blink: 0.85, sway: 1.0 },
  },
  { id: 'lukasz-d', name: 'Łukasz Dz.', seed: 61, parts: [], seat: at(10.0, STEP_UPPER, 9.9, 0.25), temperament: { breath: 1.0, blink: 1.1, sway: 0.85 } },
  {
    // docs/cast/lukasz-p.png — body circle (624, 645) px, R 369 (fitted); the weight lifter
    id: 'lukasz-p', name: 'Łukasz P.', seed: 67,
    parts: [{ type: 'sculpt', name: 'lukasz-p-hair', color: '#bd9360', clay: { freq: 130, amp: 0.22, sheenColor: '#ffe6c2' }, traits: { crown: true } }],
    arms: { upper: 'lukasz-p-upperarm', fore: 'lukasz-p-forearm', shoulder: [-1.03, 0.0, 0.1], elbow: [-0.08, -0.32, 0.07], scale: 1.12 },
    face: { plate: { a: 0.664, b: 0.42, y: 0.249 }, eye: { dx: 0.183, y: 0.046, rx: 0.095, ry: 0.119 } },
    seat: at(8.4, 0, 2.2, 0.7), temperament: { breath: 0.85, blink: 1.0, sway: 1.0 },
  },
  {
    // docs/cast/krystian.png (2026-09-23 update: the mouth area all black) — body circle (651, 681) px, R 413 (fitted); frontal coordinates below are fractions of R
    id: 'krystian', name: 'Krystian', seed: 71,
    parts: [
      { type: 'sculpt', name: 'krystian-hair', color: '#302c2a', clay: { freq: 90, amp: 0.12, roughness: 0.58, sheen: 0.5, sheenColor: '#a0958e' }, traits: { crown: true } },
      {
        type: 'stubble',
        color: '#1e1c1b', // just off the body's black: relief more than colour, delicate
        regions: [
          // the beard band, round the mouth
          { poly: [[-0.72, 0.03], [-0.72, -0.15], [-0.63, -0.36], [-0.48, -0.5], [-0.25, -0.57], [0, -0.6], [0.25, -0.57], [0.48, -0.5], [0.63, -0.36], [0.72, -0.15], [0.72, 0.03], [0.6, -0.02], [0.45, -0.12], [0.37, -0.2], [0.34, -0.36], [0.2, -0.46], [0, -0.49], [-0.2, -0.46], [-0.34, -0.36], [-0.37, -0.2], [-0.45, -0.12], [-0.6, -0.02]], spacing: 3.7, size: [0.016, 0.027, 0.011], fan: 0.5, jitter: 0.35, seed: 1 },
          // moustache: denser, bigger
          { poly: [[-0.33, -0.09], [0.33, -0.09], [0.36, -0.17], [0.2, -0.19], [0, -0.18], [-0.2, -0.19], [-0.36, -0.17]], spacing: 3.0, size: [0.019, 0.031, 0.013], fan: 0.9, jitter: 0.3, seed: 2 },
          // goatee
          { poly: [[-0.085, -0.255], [0.085, -0.255], [0.05, -0.36], [0, -0.385], [-0.05, -0.36]], spacing: 3.2, size: [0.016, 0.031, 0.012], seed: 3 },
          // the fade at the sides, below the hair
          { poly: [[-88, 30], [-62, 34], [-60, 50], [-86, 54]], angles: true, spacing: 4.2, size: [0.01, 0.024, 0.006], flow: 20, seed: 4 },
          { poly: [[62, 34], [88, 30], [86, 54], [60, 50]], angles: true, spacing: 4.2, size: [0.01, 0.024, 0.006], flow: -20, seed: 5 },
        ],
      },
      { type: 'sunglasses-rect', top: 0.415, bottom: -0.02, inner: 0.085, outer: 0.74, rim: 0.055, bend: 1.12 },
    ],
    // the plate reaches down round the mouth (like Janek's) so the stubble reads on white
    face: { plate: { a: 0.74, b: 0.56, y: 0.15 }, eye: { dx: 0.232, y: 0.1 } },
    seat: at(3.0, 0, 2.6, 1.0), temperament: { breath: 1.0, blink: 0.95, sway: 1.15 },
  },
  { id: 'mirek', name: 'Mirek', seed: 73, parts: [], seat: at(5.0, 0, 1.9, -0.3), temperament: { breath: 1.2, blink: 1.0, sway: 0.9 } },
  {
    // docs/cast/mateusz-n.png — body circle (626, 624) px, R 419
    id: 'mateusz-n', name: 'Mateusz N.', seed: 79,
    parts: [
      { type: 'sculpt', name: 'mateusz-n-hair', color: '#3a2e29', clay: { freq: 120, amp: 0.34, sheenColor: '#9a8578' }, traits: { crown: true } },
      { type: 'sculpt', name: 'mateusz-n-beard', color: '#2c2927', clay: { freq: 190, amp: 0.3, sheen: 0.6, sheenColor: '#8d8580' } },
      { type: 'headphones', pitch: 8.7, cupH: 0.62, cupW: 0.34 },
    ],
    // the plate reaches down round the mouth (like Janek's) so the moustache and goatee read on white
    face: { plate: { a: 0.74, b: 0.58, y: 0.08 }, eye: { dx: 0.167, y: 0.0 } },
    seat: at(14.6, STONE, 5.3, 0.15), temperament: { breath: 0.9, blink: 1.15, sway: 1.0 },
  },
  {
    // docs/cast/mateusz-k.png (the 2026-09-24 design) — body circle (700, 640) px, R 410 (fitted); frontal coordinates are fractions of R
    id: 'mateusz-k', name: 'Mateusz K.', seed: 83,
    parts: [
      { type: 'sculpt', name: 'mateusz-k-hair', color: '#1f1814', clay: { freq: 110, amp: 0.12, roughness: 0.42, sheen: 0.4, sheenColor: '#a89080' }, traits: { crown: true } },
      {
        type: 'stubble',
        color: '#0d0c0c',
        regions: [
          {
            // a full, dense beard: up the sides beside the plate, a moustache under it, round the
            // bare mouth area with a T-shaped soul patch rising into it
            poly: [[-0.81, 0.1], [-0.78, -0.15], [-0.66, -0.37], [-0.44, -0.51], [-0.2, -0.573], [0, -0.585], [0.24, -0.56], [0.49, -0.46], [0.68, -0.29], [0.78, -0.1], [0.81, 0.1], [0.73, 0.024], [0.585, -0.073], [0.44, -0.12], [0.24, -0.078], [0, -0.085], [-0.24, -0.085], [-0.415, -0.12], [-0.54, -0.12], [-0.68, 0.0]],
            holes: [[[-0.34, -0.18], [0.37, -0.18], [0.37, -0.29], [0.29, -0.37], [0.06, -0.378], [0.05, -0.3], [0.146, -0.27], [0.146, -0.256], [-0.146, -0.256], [-0.146, -0.27], [-0.05, -0.3], [-0.06, -0.378], [-0.27, -0.37], [-0.34, -0.29]]],
            spacing: 1.35, size: [0.013, 0.02, 0.011], fan: 0.4, jitter: 0.55, seed: 21,
          },
        ],
      },
    ],
    // the plate reaches down round the mouth, as drawn
    face: { plate: { a: 0.78, b: 0.6, y: 0.2 }, eye: { dx: 0.22, y: 0.122, rx: 0.085, ry: 0.116 } },
    seat: at(11.1, 0, 7.3, 0.5), temperament: { breath: 1.05, blink: 1.0, sway: 1.05 },
  },
]

export const byId = (id: string) => TEAM.find((mm) => mm.id === id)

// Who chats with whom: small circles that take turns (src/zenek/social.ts). Janek
// sits apart on the platform and keeps an eye on the room; Artur hosts from the
// terrace edge — half to Mateusz N, half to whoever is looking.
export const CIRCLES: string[][] = [
  ['krystian', 'mirek'],
  ['edyta', 'karol'],
  ['magda-j', 'aneta', 'kamil'],
  ['magda-r', 'lukasz-p'],
  ['lukasz-d', 'mateusz-k'],
  ['artur', 'mateusz-n'],
]

// Entrance wave: back first, Artur last.
export const ENTRANCE_ORDER: string[] = [...TEAM]
  .sort((a, b) => a.seat.z - b.seat.z)
  .map((mm) => mm.id)
  .filter((id) => id !== 'artur')
  .concat('artur')
