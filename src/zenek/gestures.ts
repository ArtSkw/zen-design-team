import { Vector3 } from 'three'
import { smoothstep } from '../lib/anim'
import type { HeadTraits } from './parts'

// Idle gestures for a Zenek, authored as small parametric curves over u ∈ [0, 1]:
// what a motion designer would keyframe, written as functions so every character
// can run them on its own clock with its own timing. Hands move in R units from
// their rest position (in the hands' frame, which follows the body's turn); angles
// are radians added to the head; `sy` stretches the body. Amplitudes are tiny on
// purpose — a toy, not a cartoon.

export type GestureKind = 'talk' | 'look' | 'scratch' | 'wave' | 'stretch' | 'nod' | 'tilt' | 'laugh' | 'shrug'
/** hl/hr move the hands (or a jointed arm's shoulder); al/ar raise a jointed arm out to the side, bl/br bend its elbow (radians). */
export type Offsets = { hl: Vector3; hr: Vector3; pitch: number; yaw: number; roll: number; sy: number; al: number; ar: number; bl: number; br: number }

export const DURATION: Record<GestureKind, number> = { talk: 3.2, look: 2.9, scratch: 2.4, wave: 1.7, stretch: 2.0, nod: 1.3, tilt: 2.6, laugh: 1.5, shrug: 1.35 }

/** Gestures a character's parts allow: nobody scratches through their hair. */
export const allowed = (kind: GestureKind, t: HeadTraits) => !(kind === 'scratch' && t.crown)

export const offsets = (): Offsets => ({ hl: new Vector3(), hr: new Vector3(), pitch: 0, yaw: 0, roll: 0, sy: 0, al: 0, ar: 0, bl: 0, br: 0 })
export function resetOffsets(o: Offsets) {
  o.hl.set(0, 0, 0)
  o.hr.set(0, 0, 0)
  o.pitch = o.yaw = o.roll = o.sy = 0
  o.al = o.ar = o.bl = o.br = 0
}

/** Attack / release envelope: 0 → 1 over `a`, 1 → 0 over the last `r`. */
const win = (u: number, a: number, r: number) => smoothstep(u / a) * smoothstep((1 - u) / r)
const TAU = Math.PI * 2
const NO_TRAITS: HeadTraits = { crown: false, longSides: false, front: false }

/**
 * Write the gesture's offsets at progress `u` into `o` (additive to whatever is
 * there). `side` is ±1: which hand, which way to tilt. `dur` is the gesture's
 * length in seconds (a talking turn can be long or short; the hands keep the same
 * rhythm); `traits` keep the hands out of hair and beards.
 */
export function gesture(kind: GestureKind, u: number, side: 1 | -1, o: Offsets, dur = DURATION[kind], traits: HeadTraits = NO_TRAITS) {
  const hand = side > 0 ? o.hr : o.hl
  switch (kind) {
    case 'talk': {
      // hands bob in alternation, a little forward, as if making a point — in
      // phrases: a slow swell over the turn, so the hands rest between points.
      // Hands rest with their centres 0.115 R outside the body; every target below
      // keeps them at least that far out, so a gesture is never swallowed by the sphere.
      const sec = u * dur
      const e = win(u, Math.min(0.3, 0.5 / dur), Math.min(0.3, 0.7 / dur))
      const phrase = 0.55 + 0.45 * Math.sin(TAU * sec * 0.31 + side)
      const a = e * phrase
      const w = TAU * sec * 0.94
      o.hl.y += a * (0.12 + 0.12 * Math.sin(w))
      o.hr.y += a * (0.12 + 0.12 * Math.sin(w + 2.6))
      o.hl.z += a * 0.1
      o.hr.z += a * 0.1
      o.hl.x -= a * 0.04 * Math.sin(w)
      o.hr.x += a * 0.04 * Math.sin(w + 2.6)
      o.pitch += e * 0.028 * Math.sin(TAU * sec * 0.47)
      break
    }
    case 'look': {
      // a sweep to one side, then the other, chin a hair up
      const e = win(u, 0.2, 0.25)
      o.yaw += side * 0.34 * Math.sin(TAU * u) * e
      o.pitch -= 0.07 * Math.sin(Math.PI * u) * e
      break
    }
    case 'scratch': {
      // one hand rises to the side of the head and wiggles; the head tilts away,
      // thinking. Only on a bare head (see `allowed`).
      const e = win(u, 0.24, 0.26)
      hand.x += -side * 0.19 * e // to (0.86, 0.66, 0.42) R: beside the temple, clear of the body
      hand.y += 0.99 * e + 0.05 * Math.sin(TAU * u * 4.2) * win(u, 0.42, 0.32)
      hand.z += 0.24 * e
      o.roll += -side * 0.1 * e
      o.pitch -= 0.04 * e
      break
    }
    case 'wave': {
      const e = win(u, 0.22, 0.28)
      const swing = Math.sin(TAU * u * 3.1) * win(u, 0.3, 0.3)
      if (traits.bulky) {
        // a jointed arm waves as a person does: the upper arm lifts out to the side, the
        // elbow bends the forearm up, and the forearm swings — not the whole arm
        const lift = 1.15 * e
        const bend = (1.85 + 0.32 * swing) * e
        if (side > 0) {
          o.ar += lift
          o.br += bend
        } else {
          o.al += lift
          o.bl += bend
        }
        hand.y += 0.06 * e
      } else if (traits.longSides) {
        // long hair beside the body: the hand comes up in front of it, beside the
        // face (from the forward rest, HAND_FORWARD in motion.ts)
        hand.x += side * 0.09 * swing // to (1.0, 0.12, 0.76) R: below the glasses, in front of the hair
        hand.y += 0.45 * e
        hand.z += 0.38 * e
      } else if (traits.crown) {
        // hair on top: a lower wave at shoulder height, under the hair's edge
        hand.x += side * (0.14 * e + 0.1 * swing) // to (1.19, 0.07, 0.73) R
        hand.y += 0.4 * e
        hand.z += 0.55 * e
      } else {
        // a bare head: the hand up beside it, swinging side to side
        hand.x += side * 0.07 * e + side * 0.14 * swing // to (1.12, 0.5, 0.4) R
        hand.y += 0.83 * e
        hand.z += 0.22 * e
      }
      o.roll += side * 0.06 * e
      break
    }
    case 'stretch': {
      // a slow stretch: taller, hands out and up, chin up, then settle — a jointed arm
      // makes it a small double-biceps flex (upper arms out, forearms up)
      if (traits.bulky) {
        const f = win(u, 0.3, 0.35)
        o.al += 1.25 * f
        o.ar += 1.25 * f
        o.bl += 1.7 * f
        o.br += 1.7 * f
        o.sy += 0.03 * f
        o.pitch -= 0.05 * f
        break
      }
      const e = win(u, 0.36, 0.42)
      o.sy += 0.045 * e
      o.hl.y += 0.3 * e
      o.hr.y += 0.3 * e
      o.hl.x -= 0.16 * e
      o.hr.x += 0.16 * e
      o.hl.z += 0.12 * e
      o.hr.z += 0.12 * e
      o.pitch -= 0.06 * e
      break
    }
    case 'nod': {
      // two small nods, agreeing
      o.pitch += 0.11 * Math.sin(TAU * u * 2) * win(u, 0.15, 0.2)
      break
    }
    case 'tilt': {
      // a curious head tilt, held
      const e = win(u, 0.3, 0.3)
      o.roll += side * 0.12 * e
      o.pitch -= 0.02 * e
      break
    }
    case 'laugh': {
      // a shared laugh: the body giggles in small decaying bounces, chin up, the
      // hands lift a touch — over in a breath
      const e = win(u, 0.08, 0.35)
      const giggle = Math.sin(TAU * u * 5.4) * (1 - u)
      o.sy += e * (0.01 + 0.016 * giggle)
      o.pitch -= e * 0.075
      o.roll += e * 0.025 * Math.sin(TAU * u * 1.7) * side
      o.hl.y += e * (0.08 + 0.04 * giggle)
      o.hr.y += e * (0.08 + 0.04 * giggle)
      o.hl.z += e * 0.1
      o.hr.z += e * 0.1
      break
    }
    case 'shrug': {
      // "you know?": hands out and up, the body dips, the head tips — and back
      const e = win(u, 0.3, 0.42)
      o.hl.y += 0.16 * e
      o.hr.y += 0.16 * e
      o.hl.x -= 0.1 * e
      o.hr.x += 0.1 * e
      o.hl.z += 0.1 * e
      o.hr.z += 0.1 * e
      o.sy -= 0.018 * e
      o.roll += side * 0.08 * e
      o.pitch -= 0.03 * e
      break
    }
  }
}
