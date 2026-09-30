import { mulberry32, range } from './rng'
import { P } from './params'

// One wind for the whole world (2026-09-29). The breeze was heard all the time and nothing on
// screen moved with it; now, now and then, a gust crosses the scene from the viewer's left to
// right — a front sweeping along DIR — and everything it passes answers in turn: a hatched
// catspaw runs over the water, the drawn trees on the near hills lean, the plant in the room
// trembles, the clouds hurry a little, one Zenek squints into it, and the breeze swells (the
// sound follows the same clock, src/sound/cues.ts). Between gusts the world is still, as the
// page is. No three.js here: the sound, in the first chunk, reads it too.

/** The gust's heading in the ground plane (world x, z): the home view's left to right. */
export const DIR = [0.83, -0.56] as const
const SPEED = 11 // world units a second, the front
const FROM = -48 // where along DIR a front starts (just off the water, left)…
const TO = 80 // …and where it has gone by
/** A gust felt at a point: up over RISE s as the front arrives, held HOLD, gone over FALL. */
const RISE = 1.4
const HOLD = 1.8
const FALL = 3.2
/** Who may squint into it: faces the viewer can read (no sunglasses), near the open sides. */
const SQUINTERS = ['kamil', 'mateusz-n', 'artur', 'lukasz-p', 'janek', 'karol', 'magda-r', 'aneta']

type Gust = { id: number; t0: number; strength: number; squint: string }

const rng = mulberry32(5150)
const ON = P.flag('wind', true) // ?wind=0: no gusts (comparison)
const FIRST = P.num('gust', -1) // ?gust=s: the first gust s after the room is ready (design check)

export const wind = {
  gust: null as Gust | null,
  next: -1,
  t: 0,
  seq: 0,
  /** Advance to scene time t (once a frame). `live`: the room is up and moving. */
  tick(t: number, live: boolean) {
    if (t < this.t - 1) {
      // the scene clock restarted (the 3D rested behind the title): start the schedule afresh
      this.gust = null
      this.next = -1
    }
    this.t = t
    if (!ON || !live) return
    if (this.next < 0) this.next = t + (FIRST >= 0 ? FIRST : range(rng, 24, 38)) // the first within the first minute
    if (this.gust && t - this.gust.t0 > (TO - FROM) / SPEED + RISE + HOLD + FALL) this.gust = null
    if (!this.gust && t >= this.next) {
      this.gust = { id: ++this.seq, t0: t, strength: range(rng, 0.65, 1), squint: SQUINTERS[Math.floor(rng() * SQUINTERS.length)] }
      this.next = t + range(rng, 45, 90)
    }
  },
  /** Where the front is now, along DIR (world units); null between gusts. */
  front(): number | null {
    return this.gust ? FROM + (this.t - this.gust.t0) * SPEED : null
  },
  /** The gust at a point on the ground (world x, z), 0…1. */
  at(x: number, z: number): number {
    const g = this.gust
    if (!g) return 0
    const since = this.t - g.t0 - (x * DIR[0] + z * DIR[1] - FROM) / SPEED // since the front reached it
    if (since <= 0) return 0
    const up = Math.min(1, since / RISE)
    const down = 1 - Math.min(1, Math.max(0, since - RISE - HOLD) / FALL)
    return g.strength * up * up * (3 - 2 * up) * down * down * (3 - 2 * down)
  },
  /** How gusty the world is overall, 0…1 (the breeze's swell): the gust while its front is over the scene. */
  level(): number {
    const f = this.front()
    if (f === null || !this.gust) return 0
    const into = Math.min(1, Math.max(0, (f + 30) / 20)) // it arrives as the front nears the room…
    const out = 1 - Math.min(1, Math.max(0, (f - 40) / 40)) // …and dies away past it
    return this.gust.strength * into * out
  },
}
