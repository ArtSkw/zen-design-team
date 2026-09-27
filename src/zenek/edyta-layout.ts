import { smooth } from '../lib/anim'

// Edyta the storyteller (docs/cast/edyta.png; body circle (655, 650) px, R 390): where her
// pieces sit, shared by the baked sculpts (sculpts/edyta.ts: the hair, the kerchief) and the
// pieces built in code (trinkets.tsx: the bangles, the crystal ball; kerchief.ts:
// the kerchief's print), so they always agree. Head frame, R = 1; yaw 0 = the face, + toward
// the viewer's right; pitch 0 = the equator.

const D = Math.PI / 180

/** Her face, measured from the design (team.ts wears it; the hair's hairline is drawn from the plate's outline). */
export const EDYTA_FACE = { plate: { a: 0.64, b: 0.411, y: 0.193 }, eye: { dx: 0.176, y: 0.0, rx: 0.091, ry: 0.113 } }

/**
 * The hair's outer radius: a thin layer close to the head (Artur's lessons: full hair reads as
 * heavy, hair standing off the body as a cloak; 2026-09-27: thinner again), a little fuller on
 * the crown under the kerchief.
 */
export function hairOuter(yaw: number, pitch: number) {
  void yaw
  return 1.055 + 0.03 * smooth(20, 80, pitch)
}

/**
 * The kerchief: it covers the head above a tilted plane — high over the forehead (its edge 62°
 * up in front, just behind the hairline), down to 30° over the ears and round the back of the
 * head to the nape (−16°), as a kerchief tied at the back sits. Points with dot(p̂, N) > C.
 */
const TILT = 39.2 * D
export const KERCHIEF_N: [number, number, number] = [0, Math.cos(TILT), -Math.sin(TILT)]
export const KERCHIEF_C = 0.387
/** Its thickness over the hair, and where the knot is tied: at the back of her right side (the viewer's left), on the edge. */
export const KERCHIEF_T = 0.02
export const KNOT: [number, number] = [-106, 15] // yaw, pitch — on the kerchief's edge, just behind her right ear (it shows from the front, as drawn)

/**
 * Held in her paws (hand frame: the paw's centre, R units; the right paw is her left, the
 * viewer's right): the crystal ball on its gold cup, resting on top of her left paw, a little out
 * and forward — clear of the body, of the hair above the hands, and of the face-framing locks
 * when the head turns toward it; the bangles round her right
 * paw's upper outer side (on the inner side, toward a wrist, half of each ring was inside the body).
 */
export const BALL = { at: [0.22, 0.36, 0.14] as [number, number, number], r: 0.23 }
export const BANGLE_AXIS: [number, number, number] = [-0.72, 0.6, 0.35] // the left paw's; the right mirrors it (rings at 32/44/56° from it clear the body)

/** How brightly the crystal ball glows beyond its idle shimmer (0…1+): the `gaze` gesture drives it (motion.ts), the ball's shader reads it (trinkets.tsx). One ball in the cast. */
export const crystalGlow = { value: 0 }
