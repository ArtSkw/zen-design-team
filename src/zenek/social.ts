import { CIRCLES, TEAM, byId } from '../cast/team'
import { mulberry32, range } from '../lib/rng'
import { store } from '../lib/store'
import { DEBUG, P } from '../lib/params'
import { say } from '../lib/talk'

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
/** Laughter: a turn ends in one only now and then, and each is its own moment in the room. */
const LAUGH_CHANCE = 0.1 // was 0.18
const LAUGH_AGAIN = 40 // s, the same circle
const LAUGH_GAP = 12 // s, anywhere in the room
let lastLaugh = -1e9

// ---- the room meets the viewer -----------------------------------------------------------
/**
 * Once, as the last of them arrives (motion.ts calls `greetRoom`): the title said "Meet ZEN
 * Design Team", and here the team meets you — every face turns to the viewer, a ripple
 * spreading out from the host `step` s apart, a few wave and the rest say a small "hi"; each
 * holds it `hold` s, then the circles turn back in, a beat apart (their talk waits for it).
 * `host` s in, the host says his first line — the postcard's own thank-you — unless the
 * visitor has already tapped someone (`?host=0`: not at all). `?greet=1` with `?intro=0`
 * plays it on a settled room (design check).
 */
export const GREET = { step: 0.075, hold: 2.3, host: 1.25 }
export const greeting = { at: -1, until: -1, hostSaid: false }
export const HOST = TEAM.find((m) => m.gaze === 'viewer')?.id ?? TEAM[TEAM.length - 1].id
const HOST_LINE = P.flag('host', true)

export function greetRoom(t: number) {
  if (greeting.at >= 0) return
  greeting.at = t
  greeting.until = t + GREET.hold + (TEAM.length - 1) * GREET.step + 0.2
  circles.forEach((c, i) => {
    c.speaker = null // (a design check may greet a room already talking)
    c.nextAt = Math.max(c.nextAt, greeting.until + 0.4 + i * 0.9 + c.rng() * 0.5)
  })
}

/** Advance every circle to time t (idempotent within a frame). */
export function tickSocial(t: number) {
  if (t === lastTick) return
  lastTick = t
  if (greeting.at < 0 && DEBUG.greet && !DEBUG.intro && store.get().phase === 'ready' && t > 1.5) greetRoom(t)
  if (greeting.at >= 0 && !greeting.hostSaid && t >= greeting.at + GREET.host) {
    greeting.hostSaid = true
    if (HOST_LINE && !store.get().active) say(HOST) // (not over a line the visitor has already asked for)
  }
  const active = store.get().active
  for (const c of circles) {
    if (active && c.ids.includes(active)) continue // the room listens to whoever was tapped
    if (c.speaker && t >= c.t1) {
      // the turn ends: a beat of silence, sometimes a laugh, now and then a lull. A laugh is a
      // moment, not a habit (2026-09-30: with the hops it read as someone laughing every other
      // second): rarer, never twice in a circle within LAUGH_AGAIN, never two circles within LAUGH_GAP
      c.last = c.speaker
      c.speaker = null
      const r = c.rng()
      if (r < LAUGH_CHANCE && (c.laughAt < 0 || t - c.laughAt > LAUGH_AGAIN) && t - lastLaugh > LAUGH_GAP) {
        c.laughAt = t + 0.12
        lastLaugh = c.laughAt
        c.nextAt = t + range(c.rng, 2.4, 3.6)
      } else if (r >= LAUGH_CHANCE && r < LAUGH_CHANCE + 0.2) c.nextAt = t + range(c.rng, 6, 13) // a lull
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
export type SocialEvent = { seq: number; id: string; kind: 'wave' | 'stretch' | 'laugh' | 'gaze'; x: number; y: number; z: number; t: number }
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
