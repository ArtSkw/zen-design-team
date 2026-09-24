import { CIRCLES, byId } from '../cast/team'
import { mulberry32, range } from '../lib/rng'
import { store } from '../lib/store'
import { P } from '../lib/params'

// The room's conversations. Each circle (src/cast/team.ts) takes turns: one Zenek
// holds the floor for a few seconds — talks with its hands and looks from one
// listener to the next — while the others turn to it and now and then nod. Turns
// pass with a beat of silence; now and then one ends in a shared laugh or a shrug;
// every so often a circle falls quiet and each looks around on their own. One
// clock per circle, seeded, so no two circles ever keep time together.
//
// Everyone else in the room can notice a little of it: a laugh, a wave or a
// stretch nearby is an event a neighbour may glance at (`events`).

export type Role =
  | { kind: 'speak'; turn: number; t0: number; t1: number; to: string | null; shrug: boolean }
  | { kind: 'listen'; turn: number; t0: number; t1: number; speaker: string }
  | { kind: 'idle' }

type Circle = {
  ids: string[]
  rng: () => number
  speaker: string | null
  turn: number
  t0: number
  t1: number
  shrug: boolean
  last: string | null
  nextAt: number
  to: string | null
  toUntil: number
  laughAt: number
}

export const SOCIAL_ON = P.flag('social', true) // ?social=0 → everyone idles on their own (comparison)

const circles: Circle[] = CIRCLES.map((ids, i) => ({
  ids,
  rng: mulberry32(900 + i * 17),
  speaker: null,
  turn: 0,
  t0: 0,
  t1: 0,
  shrug: false,
  last: null,
  nextAt: 2 + i * 1.3, // circles start a beat apart once the room has settled
  to: null,
  toUntil: 0,
  laughAt: -1,
}))
const circleOf = new Map<string, Circle>()
for (const c of circles) for (const id of c.ids) circleOf.set(id, c)

let lastTick = -1

/** Advance every circle to time t (idempotent within a frame). */
export function tickSocial(t: number) {
  if (t === lastTick) return
  lastTick = t
  const active = store.get().active
  for (const c of circles) {
    if (active && c.ids.includes(active)) continue // the room listens to whoever was tapped
    if (c.speaker && t >= c.t1) {
      // the turn ends: a beat of silence, sometimes a laugh, now and then a lull
      c.last = c.speaker
      c.speaker = null
      const r = c.rng()
      if (r < 0.18) {
        c.laughAt = t + 0.12
        c.nextAt = t + range(c.rng, 2.4, 3.6)
      } else if (r < 0.38) c.nextAt = t + range(c.rng, 6, 13)
      else c.nextAt = t + range(c.rng, 0.8, 2.4)
    }
    if (!c.speaker && t >= c.nextAt && store.get().phase === 'ready') {
      // pairs mostly alternate; a trio passes the floor around; a host (who also
      // minds the viewer) talks less than they listen
      const others = c.ids.filter((id) => id !== c.last)
      const keep = c.last && c.rng() < 0.2
      let pick = keep ? c.last! : others[Math.floor(c.rng() * others.length)]
      if (byId(pick)?.gaze === 'viewer' && c.rng() < 0.5) pick = c.ids.find((id) => id !== pick) ?? pick
      c.speaker = pick
      c.turn++
      c.t0 = t
      c.t1 = t + range(c.rng, 2.8, 5.8)
      c.shrug = c.rng() < 0.22
      c.to = null
      c.toUntil = 0
    }
    if (c.speaker && t >= c.toUntil) {
      // the speaker looks from one listener to the next; a host also turns to the viewer
      const listeners = c.ids.filter((id) => id !== c.speaker)
      const host = byId(c.speaker)?.gaze === 'viewer'
      c.to = host && c.rng() < 0.5 ? null : listeners[Math.floor(c.rng() * listeners.length)]
      c.toUntil = t + range(c.rng, 1.4, 2.8)
    }
  }
}

/** This Zenek's part in its circle's conversation right now. */
export function roleOf(id: string): Role {
  const c = circleOf.get(id)
  if (!c || !SOCIAL_ON) return { kind: 'idle' }
  const active = store.get().active
  if (active && c.ids.includes(active)) {
    // someone in the circle was tapped: they have the floor, the rest listen
    if (id === active) return { kind: 'idle' }
    return { kind: 'listen', turn: -1, t0: 0, t1: Infinity, speaker: active }
  }
  if (!c.speaker) return { kind: 'idle' }
  if (c.speaker === id) return { kind: 'speak', turn: c.turn, t0: c.t0, t1: c.t1, to: c.to, shrug: c.shrug }
  return { kind: 'listen', turn: c.turn, t0: c.t0, t1: c.t1, speaker: c.speaker }
}

/** When this Zenek's circle last broke into a laugh (−1: never). */
export const laughOf = (id: string) => (SOCIAL_ON ? circleOf.get(id)?.laughAt ?? -1 : -1)
export const circleMates = (id: string) => circleOf.get(id)?.ids.filter((x) => x !== id) ?? []

// ---- things worth a glance -------------------------------------------------------
export type SocialEvent = { seq: number; id: string; kind: 'wave' | 'stretch' | 'laugh'; x: number; y: number; z: number; t: number }
const events: SocialEvent[] = []
let seq = 0

export function emit(e: Omit<SocialEvent, 'seq'>) {
  events.push({ ...e, seq: ++seq })
  if (events.length > 24) events.shift()
}

/** Events newer than `after`, oldest first. */
export function eventsSince(after: number) {
  return events.filter((e) => e.seq > after)
}
