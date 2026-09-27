import type { PartConfig } from '../zenek/parts'
import type { FaceOverride } from '../zenek/proportions'
import { EDYTA_FACE } from '../zenek/edyta-layout'

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
    // the plate a little longer and wider than drawn (0.6 × 0.36, +0.26), its top kept: the white
    // reaches down under the moustache and the beard's top out to the sideburns (Artur, 2026-09-26)
    face: { plate: { a: 0.65, b: 0.44, y: 0.182 }, eye: { dx: 0.17, y: 0.065 } },
    seat: at(15.6, 0, 2.4, -0.25),                           // arriving on the terrace, right edge
    gaze: 'viewer',                                            // the host greets whoever is looking
    temperament: { breath: 1.0, blink: 0.9, sway: 1.1 },
  },
  // ---- designs pending: plain Zeneks hold the seats ---------------------------
  {
    // docs/cast/magda-j.png — body circle (672, 653) px, R 421 (fitted on the silhouette below the hands)
    id: 'magda-j', name: 'Magda J.', seed: 41,
    parts: [
      { type: 'sculpt', name: 'magda-j-hair', color: '#41190e', clay: { freq: 160, amp: 0.18, sheen: 0.75, sheenColor: '#e8906a', roughness: 0.5, tip: '#6d2d1b', tipY: [0.95, -0.35] }, traits: { crown: true } },
      // one loose curl out of the hairline onto her forehead (the same clay)
      { type: 'sculpt', name: 'magda-j-curl', color: '#41190e', clay: { freq: 160, amp: 0.18, sheen: 0.75, sheenColor: '#e8906a', roughness: 0.5, tip: '#6d2d1b', tipY: [0.95, -0.35] } },
      { type: 'airpods' },
    ],
    face: { plate: { a: 0.683, b: 0.438, y: 0.307 }, eye: { dx: 0.173, y: 0.072, rx: 0.087, ry: 0.11 } },
    seat: at(5.6, CUSHION, 6.2, 0.5), temperament: { breath: 1.1, blink: 1.0, sway: 1.0 },
  },
  {
    // docs/cast/aneta.png — the drawn body is a touch tall: read on an ellipse centred (637, 720) px, 408 across, 435 up
    id: 'aneta', name: 'Aneta', seed: 43,
    parts: [
      { type: 'sculpt', name: 'aneta-hair', color: '#3f2e23', clay: { freq: 105, amp: 0.12, sheenColor: '#dcc3a4', tip: '#7c5e41', tipY: [0.95, 0.15] }, traits: { crown: true } },
      { type: 'shirt', name: 'aneta-shirt' },
      { type: 'shirt', name: 'aneta-collar', axis: 'collar' },
      { type: 'shirt', name: 'aneta-inner', shade: 0.28 },
      { type: 'buttons', at: [[-0.265, -0.235], [-0.13, -0.44], [-0.13, -0.7]], lift: 1.05, color: '#f1e9d6' }, // on the left front's placket (frontal, R)
    ],
    face: { plate: { a: 0.675, b: 0.461, y: 0.528 }, eye: { dx: 0.18, y: 0.272, rx: 0.086, ry: 0.103 } },
    seat: at(7.6, CUSHION, 5.6, 0.3), temperament: { breath: 0.95, blink: 1.2, sway: 0.9 },
  },
  {
    // docs/cast/edyta.png — body circle (655, 650) px, R 390 (the design's face is turned a touch to the right; the build is square on)
    // the storyteller: loose blond waves under a red kerchief with a gold celestial print, bangles on
    // her right paw (the one that waves), a crystal ball on her left (the earrings came off: Artur, 2026-09-27)
    id: 'edyta', name: 'Edyta', seed: 47,
    parts: [
      { type: 'sculpt', name: 'edyta-hair', color: '#5f4128', clay: { freq: 170, amp: 0.12, sheen: 0.65, sheenColor: '#f6e2bb', roughness: 0.5, tip: '#c39d66', tipY: [0.95, 0.5] }, traits: { crown: true, waveSide: -1, sideWave: true, rigidPaws: true } },
      { type: 'kerchief', name: 'edyta-kerchief', color: '#6f1f28', gold: '#d8a64a' },
      { type: 'bangles', hand: 'l' },
      { type: 'crystal-ball', hand: 'r' },
    ],
    face: EDYTA_FACE,
    seat: at(1.55, BENCH, 4.4, 0.95), temperament: { breath: 1.05, blink: 0.9, sway: 1.1 },
  },
  {
    // docs/cast/karol.png — body circle (626, 692) px, R 380 (fitted on the silhouette below the hands)
    id: 'karol', name: 'Karol', seed: 53,
    parts: [
      { type: 'beanie', color: '#67704b' },
      // dark, greying toward the chin (a gradient to a neutral grey) with a silvery sheen on the locks
      { type: 'sculpt', name: 'karol-beard', color: '#252526', clay: { freq: 210, amp: 0.14, sheen: 0.85, sheenColor: '#aeb0b3', roughness: 0.45, tip: '#3d3e41', tipY: [-0.28, -0.92] }, traits: { front: true } },
    ],
    // the plate a little longer than drawn (0.729 × 0.42, +0.263), its top kept: the white reaches
    // down under the moustache to its tips (Artur, 2026-09-26)
    face: { plate: { a: 0.74, b: 0.47, y: 0.214 }, eye: { dx: 0.186, y: 0.024, rx: 0.087, ry: 0.113 } },
    seat: at(1.55, BENCH, 6.6, 1.05), temperament: { breath: 0.9, blink: 1.0, sway: 1.2 },
  },
  {
    // docs/cast/kamil.png — body circle (627, 638) px, R 402
    id: 'kamil', name: 'Kamil', seed: 59,
    parts: [{ type: 'sculpt', name: 'kamil-hair', color: '#b89673', clay: { freq: 95, amp: 0.34 }, traits: { crown: true } }],
    face: { plate: { a: 0.72, b: 0.455, y: 0.32 }, eye: { dx: 0.18, y: 0.08 } },
    seat: at(13.2, 0, 1.8, 0.2), temperament: { breath: 1.15, blink: 0.85, sway: 1.0 }, // out on the terrace with Artur and Mateusz N (the room was crowded)
  },
  {
    // docs/cast/lukasz-d.png — body circle (625, 702) px, R 413 (fitted); an olive six-panel cap worn backwards (docs/cast/lukasz-d-cap-ref.png)
    id: 'lukasz-d', name: 'Łukasz D.', seed: 61,
    parts: [{ type: 'cap', color: '#85846a' }],
    face: { plate: { a: 0.685, b: 0.37, y: 0.178 }, eye: { dx: 0.184, y: -0.005, rx: 0.091, ry: 0.107 } },
    seat: at(10.0, STEP_UPPER, 9.9, 0.25), temperament: { breath: 1.0, blink: 1.1, sway: 0.85 },
  },
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
        // Artur, 2026-09-26: the first beads came closest; refined toward Janek's mini-lines — slim,
        // flat, matte dashes pointing the way stubble grows, scattered (no rows) and thinning out at
        // the edges instead of stopping at an outline
        type: 'stubble',
        color: '#1e1c1b',
        roughness: 0.85,
        regions: [
          // the beard band, round the mouth
          { poly: [[-0.72, 0.03], [-0.72, -0.15], [-0.63, -0.36], [-0.48, -0.5], [-0.25, -0.57], [0, -0.6], [0.25, -0.57], [0.48, -0.5], [0.63, -0.36], [0.72, -0.15], [0.72, 0.03], [0.6, -0.02], [0.45, -0.12], [0.37, -0.2], [0.34, -0.36], [0.2, -0.46], [0, -0.49], [-0.2, -0.46], [-0.34, -0.36], [-0.37, -0.2], [-0.45, -0.12], [-0.6, -0.02]], scatter: 'blue', spacing: 2.85, falloff: 5, size: [0.0095, 0.024, 0.005], fan: 0.5, seed: 1 },
          // moustache: a little denser
          { poly: [[-0.33, -0.09], [0.33, -0.09], [0.36, -0.17], [0.2, -0.19], [0, -0.18], [-0.2, -0.19], [-0.36, -0.17]], scatter: 'blue', spacing: 2.3, falloff: 2.5, size: [0.0105, 0.026, 0.0055], fan: 0.9, seed: 2 },
          // goatee
          { poly: [[-0.085, -0.255], [0.085, -0.255], [0.05, -0.36], [0, -0.385], [-0.05, -0.36]], scatter: 'blue', spacing: 2.2, falloff: 2, size: [0.0095, 0.025, 0.005], seed: 3 },
          // the fade at the sides, below the hair
          { poly: [[-88, 30], [-62, 34], [-60, 50], [-86, 54]], angles: true, scatter: 'blue', spacing: 4, falloff: 3, size: [0.008, 0.02, 0.004], flow: 20, seed: 4 },
          { poly: [[62, 34], [88, 30], [86, 54], [60, 50]], angles: true, scatter: 'blue', spacing: 4, falloff: 3, size: [0.008, 0.02, 0.004], flow: -20, seed: 5 },
        ],
      },
      { type: 'sunglasses-rect', top: 0.415, bottom: -0.02, inner: 0.085, outer: 0.74, rim: 0.055, bend: 1.12 },
    ],
    // the plate reaches down round the mouth (like Janek's) so the stubble reads on white
    face: { plate: { a: 0.74, b: 0.56, y: 0.15 }, eye: { dx: 0.232, y: 0.1 } },
    seat: at(3.0, 0, 2.6, 1.0), temperament: { breath: 1.0, blink: 0.95, sway: 1.15 },
  },
  {
    // docs/cast/mirek.png — body circle (627, 630) px, R 384 (fitted on the head's sides and top; the drawn jacket hangs below the sphere)
    id: 'mirek', name: 'Mirek', seed: 73,
    parts: [
      { type: 'sculpt', name: 'mirek-hair', color: '#43312a', clay: { freq: 70, amp: 0.035, roughness: 0.45, sheen: 0.6, sheenColor: '#a89084' }, traits: { crown: true } },
      // the flight jacket: leather with pocket flaps, a shearling collar, brass zip and snaps, two patches (the sleeves left off: the hands stay bare)
      { type: 'garment', name: 'mirek-jacket', look: 'leather', color: '#45302a' },
      { type: 'garment', name: 'mirek-collar', look: 'fleece', color: '#b8773f' },
      { type: 'jacket-trim' },
    ],
    face: { plate: { a: 0.702, b: 0.46, y: 0.363 }, eye: { dx: 0.178, y: 0.099, rx: 0.095, ry: 0.12 } },
    seat: at(5.0, 0, 1.9, -0.3), temperament: { breath: 1.2, blink: 1.0, sway: 0.9 },
  },
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
      // the hair in the beard's tone — Mateusz N's moustache and goatee colour (Artur, 2026-09-27: the near-black beard read too black)
      { type: 'sculpt', name: 'mateusz-k-hair', color: '#2c2927', clay: { freq: 130, amp: 0.16, roughness: 0.34, sheen: 0.6, sheenColor: '#8d8580' }, traits: { crown: true } },
      // the beard in clay (2026-09-27: the bead stubble read as a sketched texture): a soft layer
      // round a bare mouth area with a T-shaped soul patch, short tufts in low relief
      { type: 'sculpt', name: 'mateusz-k-beard', color: '#2c2927', clay: { freq: 230, amp: 0.16, roughness: 0.58, sheen: 0.6, sheenColor: '#8d8580' }, traits: { front: true } },
    ],
    // the plate reaches down round the mouth, as drawn
    face: { plate: { a: 0.78, b: 0.6, y: 0.2 }, eye: { dx: 0.22, y: 0.122, rx: 0.085, ry: 0.116 } },
    seat: at(7.4, STEP_UPPER, 9.95, 0.35), temperament: { breath: 1.05, blink: 1.0, sway: 1.05 }, // on the upper platform beside Łukasz D, out of the crowd (in Kamil's old place Magda R hid his face from the home view)
  },
]

export const byId = (id: string) => TEAM.find((mm) => mm.id === id)

// Who chats with whom: small circles that take turns (src/zenek/social.ts). Janek
// sits apart on the platform and keeps an eye on the room; Artur hosts from the
// terrace edge — half to Mateusz N and Kamil beside him, half to whoever is looking.
export const CIRCLES: string[][] = [
  ['krystian', 'mirek'],
  ['edyta', 'karol'],
  ['magda-j', 'aneta'],
  ['magda-r', 'lukasz-p'],
  ['lukasz-d', 'mateusz-k'],
  ['artur', 'mateusz-n', 'kamil'],
]

// Entrance wave: back first, Artur last.
export const ENTRANCE_ORDER: string[] = [...TEAM]
  .sort((a, b) => a.seat.z - b.seat.z)
  .map((mm) => mm.id)
  .filter((id) => id !== 'artur')
  .concat('artur')
