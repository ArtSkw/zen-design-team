import { Vector3 } from 'three'
import { smooth, smoothstep } from '../lib/anim'
import type { HeadTraits } from './parts'
import { CANON } from './proportions'
import { BALL } from './edyta-layout'

// Idle gestures for a Zenek, authored as small parametric curves over u ∈ [0, 1]:
// what a motion designer would keyframe, written as functions so every character
// can run them on its own clock with its own timing. Hands move in R units from
// their rest position (in the hands' frame, which follows the body's turn); angles
// are radians added to the head; `sy` stretches the body (motion.ts keeps its volume),
// `hop` lifts it off its seat (R units). Amplitudes are small on purpose — a toy, not a
// cartoon — but the beats that carry a conversation (talking, laughing) are sized to read
// from the room's distance, where a front-row Zenek is ~120 px across (2026-09-29).

export type GestureKind = 'talk' | 'look' | 'scratch' | 'wave' | 'stretch' | 'nod' | 'tilt' | 'laugh' | 'shrug' | 'gaze' | 'hello' | 'squint'
/** hl/hr move the hands (or a jointed arm's shoulder); al/ar raise a jointed arm out to the side, bl/br bend its elbow (radians); `lid` narrows the eyes (0…1). */
export type Offsets = { hl: Vector3; hr: Vector3; pitch: number; yaw: number; roll: number; sy: number; hop: number; al: number; ar: number; bl: number; br: number; glow: number; lid: number }

export const DURATION: Record<GestureKind, number> = { talk: 3.2, look: 2.9, scratch: 2.4, wave: 1.7, stretch: 2.0, nod: 1.3, tilt: 2.6, laugh: 1.5, shrug: 1.35, gaze: 3.8, hello: 1.0, squint: 1.8 }

/** Gestures a character's parts allow: nobody scratches through their hair; only a crystal ball can be gazed into. */
export const allowed = (kind: GestureKind, t: HeadTraits) => !(kind === 'scratch' && t.crown) && (kind !== 'gaze' || !!t.holds)

export const offsets = (): Offsets => ({ hl: new Vector3(), hr: new Vector3(), pitch: 0, yaw: 0, roll: 0, sy: 0, hop: 0, al: 0, ar: 0, bl: 0, br: 0, glow: 0, lid: 0 })
export function resetOffsets(o: Offsets) {
  o.hl.set(0, 0, 0)
  o.hr.set(0, 0, 0)
  o.pitch = o.yaw = o.roll = o.sy = o.hop = 0
  o.al = o.ar = o.bl = o.br = 0
  o.glow = o.lid = 0
}

/** Attack / release envelope: 0 → 1 over `a`, 1 → 0 over the last `r`. */
const win = (u: number, a: number, r: number) => smoothstep(u / a) * smoothstep((1 - u) / r)
const TAU = Math.PI * 2
const NO_TRAITS: HeadTraits = { crown: false, longSides: false, front: false }
/** A steady pseudo-random number in [0, 1) for a phrase's length, a beat's chance. */
const hash1 = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

// Talking (see 'talk'): phrases of syllables with rests between them, and now and then a beat
// of emphasis with a hand.
const PHRASE = 1.9 // s: one phrase and its rest
const SYLLABLES = 2.9 // a second
const BOUNCE = 0.045 // of the body's height, each syllable
const BEAT = 0.42 // share of a phrase the emphasis takes, from its start
// Laughing (see 'laugh'): [from, to, height in R] — each hop smaller than the last.
const LAUGH: [number, number, number][] = [[0.05, 0.29, 0.11], [0.29, 0.48, 0.07], [0.48, 0.63, 0.04]]

/**
 * Write the gesture's offsets at progress `u` into `o` (additive to whatever is
 * there). `side` is ±1: which hand, which way to tilt. `dur` is the gesture's
 * length in seconds (a talking turn can be long or short; the hands keep the same
 * rhythm); `traits` keep the hands out of hair and beards; `seed` (the character's)
 * keeps two talkers from sharing one rhythm.
 */
export function gesture(kind: GestureKind, u: number, side: 1 | -1, o: Offsets, dur = DURATION[kind], traits: HeadTraits = NO_TRAITS, seed = 0) {
  gestureRaw(kind, u, side, o, dur, traits, seed)
  // a paw holding something moves gently: a third of the gesture (one gesture a frame, so this
  // scales only its own) — except in the gesture made for what it holds
  if (traits.holds && kind !== 'gaze') (traits.holds === 'r' ? o.hr : o.hl).multiplyScalar(HOLD)
}
const HOLD = 0.35

function gestureRaw(kind: GestureKind, u: number, side: 1 | -1, o: Offsets, dur: number, traits: HeadTraits, seed: number) {
  const hand = side > 0 ? o.hr : o.hl
  switch (kind) {
    case 'talk': {
      // Talking, the way a toy without a mouth talks: the whole body bounces with the
      // syllables — about three a second, in phrases with rests between them — and the head
      // dips a little on the beat. From across the room that reads as talk; the hands' bob
      // alone did not (2026-09-29). The hands drift low with the phrase, but at the start of
      // about half the phrases one makes a point: forward and up, quick in, slow out (a
      // jointed arm bends at the elbow instead). Hands rest with their centres 0.115 R
      // outside the body; every target below keeps them at least that far out, so a
      // gesture is never swallowed by the sphere.
      const sec = u * dur
      const e = win(u, Math.min(0.3, 0.35 / dur), Math.min(0.3, 0.5 / dur))
      const pc = sec / PHRASE + (side > 0 ? 0.35 : 0.8) // the phrase clock: which phrase, how far into it
      const k = Math.floor(pc)
      const f = pc - k
      const key = k + seed * 0.618 + (side > 0 ? 0.5 : 0)
      const said = 0.55 + 0.25 * hash1(key) // the share of the phrase spoken before its rest
      const gate = smooth(0, 0.07, f) * smooth(said, said - 0.12, f)
      const syl = Math.sin(TAU * (SYLLABLES * sec + 0.18 * Math.sin(TAU * 0.6 * sec + side)))
      o.sy += e * gate * BOUNCE * syl
      o.pitch += e * (0.035 * gate * Math.max(0, syl) + 0.02 * Math.sin(TAU * sec * 0.47))
      const a = e * (0.35 + 0.65 * gate)
      const w = TAU * sec * 0.94
      o.hl.y += a * (0.06 + 0.05 * Math.sin(w))
      o.hr.y += a * (0.06 + 0.05 * Math.sin(w + 2.6))
      o.hl.z += a * 0.08
      o.hr.z += a * 0.08
      if (f < BEAT && hash1(key * 1.7 + 0.3) > 0.45) {
        const x = f / BEAT
        const b = e * smooth(0, 0.22, x) * smooth(1, 0.38, x)
        const right = (k + (side > 0 ? 1 : 0)) % 2 === 0 // the hands take turns making a point
        if (traits.bulky) {
          if (right) (o.br += 0.75 * b), (o.ar += 0.12 * b)
          else (o.bl += 0.75 * b), (o.al += 0.12 * b)
        } else {
          const h = right ? o.hr : o.hl
          const out = right ? 1 : -1 // away from the body (the right hand sits at +x)
          if (traits.front || traits.collar) {
            // a full beard in front, or a collar's lapels: the point is made a little out to
            // the side and lower, clear of them (scripts/check-hands.mjs)
            h.y += (traits.collar ? 0.09 : 0.15) * b
            h.z += (traits.collar ? 0.15 : 0.12) * b
            h.x += out * 0.05 * b
          } else {
            h.y += 0.2 * b
            h.z += 0.2 * b
            h.x -= out * 0.03 * b
          }
        }
      }
      break
    }
    case 'squint': {
      // a gust in the face (src/lib/wind.ts): the eyes narrow, the chin dips into it, a small
      // shiver runs through the body, and it is over
      const e = win(u, 0.18, 0.35)
      o.lid += e
      o.pitch += 0.05 * e
      o.roll += side * 0.035 * e
      o.sy += 0.01 * Math.sin(TAU * u * 9) * e * smoothstep((0.6 - u) / 0.3)
      o.hl.y += 0.04 * e
      o.hr.y += 0.04 * e
      break
    }
    case 'hello': {
      // "hi!" — as the room meets the viewer (motion.ts): a quick little lift with the chin up
      // and the hands up a touch, then a nod as it lands
      const up = Math.sin(Math.PI * Math.min(1, u / 0.42))
      const nod = Math.sin(Math.PI * smoothstep((u - 0.38) / 0.45))
      o.hop += 0.06 * up
      o.sy += 0.03 * up
      o.pitch += -0.09 * up + 0.1 * nod
      o.hl.y += 0.1 * up
      o.hr.y += 0.1 * up
      o.hl.z += 0.05 * up
      o.hr.z += 0.05 * up
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
      } else if (traits.collar || traits.sideWave) {
        // a thick collar with lapels on the shoulders: the paw rises beside the body to shoulder
        // height, only a little forward — raised in front (as the others wave) it stood out past
        // his face whenever he turned to talk and the far paw was the one waving (Artur,
        // 2026-09-26); forward first, then up, clear of the lapel, a narrow swing.
        // scripts/check-hands.mjs keeps it clear.
        const fwd = smoothstep(Math.min(1, e / 0.55))
        const up = smoothstep(Math.max(0, (e - 0.35) / 0.65))
        hand.x += side * (0.15 * e + 0.05 * swing * up) // to (1.20, 0.0, 0.28) R; it swings only while it is up
        hand.y += 0.33 * up
        hand.z += 0.1 * fwd
      } else if (traits.cups) {
        // headphone cups on the sides reaching down near the hands: lower still and further
        // forward, clear of the cups' front corners (≥ 0.07 R)
        hand.x += side * (0.05 * e + 0.1 * swing) // to (1.10, −0.10, 0.85) R
        hand.y += 0.23 * e
        hand.z += 0.67 * e
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
      const lift = traits.cups ? 0.2 : 0.3 // under headphone cups, a lower stretch
      o.sy += 0.045 * e
      o.hl.y += lift * e
      o.hr.y += lift * e
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
      // a shared laugh you can see across the room: two or three little hops, each smaller
      // than the last — squashed as it lands, stretched as it leaves — the chin up, the hands
      // up a touch; over in a breath (it used to giggle in place by 1–2.6 % of its height,
      // which nobody saw from the home view, 2026-09-29)
      const e = win(u, 0.06, 0.3)
      const land = (h: number) => -0.22 * h // squashed where it meets its seat, after a hop of h
      let prev = LAUGH[0][2]
      if (u < LAUGH[0][0]) o.sy += land(prev) * smoothstep(u / LAUGH[0][0]) // a quick crouch before the first
      for (const [a, b, h] of LAUGH) {
        if (u >= a && u < b) {
          const x = (u - a) / (b - a)
          const air = Math.sin(Math.PI * x)
          o.hop += h * 4 * x * (1 - x)
          o.sy += ((1 - x) * land(prev) + x * land(h)) * (1 - air) + 0.18 * h * air // from one landing's squash to the next, stretched in the air
        }
        prev = h
      }
      const last = LAUGH[LAUGH.length - 1]
      if (u >= last[1]) o.sy += land(last[2]) * smoothstep((last[1] + 0.12 - u) / 0.12) // and up again after the last
      o.pitch -= e * 0.1
      o.roll += e * 0.03 * Math.sin(TAU * u * 1.7) * side
      o.hl.y += e * 0.1
      o.hr.y += e * 0.1
      o.hl.z += e * 0.1
      o.hr.z += e * 0.1
      break
    }
    case 'gaze': {
      // the fortune teller (trait `holds`: a crystal ball): she brings the ball round in front of her
      // in an arc and leans in to peer, turning it in small slow circles, the ball glowing brighter —
      // then a little hop, head up and a flash, "aha!", and back. Only the ball paw moves (Artur,
      // 2026-09-27: the other paw hovering beside it crowded it); it travels on an arc round the
      // body (a straight line would pass through it), clear of the face-framing locks, the ball
      // held below the eyes.
      const s = traits.holds === 'l' ? -1 : 1
      const k = win(u, 0.2, 0.17) // out and back
      const pe = smoothstep((u - 0.18) / 0.12) * smoothstep((0.74 - u) / 0.08) // peering
      const aha = Math.exp(-(((u - 0.765) / 0.035) ** 2))
      const H = CANON.hand
      const restB = _gA.set(s * H.x, H.y, H.z)
      const ballT = _gB.set(s * 0.22, -0.36, 1.3)
      const pawT = _gC.set(ballT.x - s * BALL.at[0], ballT.y - BALL.at[1], ballT.z - BALL.at[2])
      const pB = arcBetween(restB, pawT, k, 0.25, _gD)
      const c = TAU * 1.4 * (u - 0.2) // turning the ball in small slow circles as she peers
      pB.x += s * 0.03 * Math.cos(c) * pe
      pB.y += 0.03 * Math.sin(c) * pe
      ;(s > 0 ? o.hr : o.hl).add(pB.sub(restB))
      o.pitch += 0.09 * pe - 0.13 * aha // leaning in to peer; the head pops up at the "aha"
      o.roll += 0.05 * Math.sin(TAU * 0.9 * u) * pe
      o.sy += 0.035 * aha - 0.012 * pe // a hop
      o.glow += 0.25 * k + 0.55 * pe + aha
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

const _gA = new Vector3()
const _gB = new Vector3()
const _gC = new Vector3()
const _gD = new Vector3()
/**
 * A point on an arc round the body from `a` to `b` (both in the hands' frame, R units) at `k`:
 * yaw, pitch and distance from the body's centre interpolated, bulging `bump` further out mid-way,
 * so a paw carried from the side to the front never passes through the body or the hair.
 */
function arcBetween(a: Vector3, b: Vector3, k: number, bump: number, out: Vector3) {
  const ya = Math.atan2(a.x, a.z)
  const yb = Math.atan2(b.x, b.z)
  const ra = a.length()
  const rb = b.length()
  const pa = Math.asin(a.y / ra)
  const pb = Math.asin(b.y / rb)
  const yaw = ya + (yb - ya) * k
  const pitch = pa + (pb - pa) * k
  const r = ra + (rb - ra) * k + bump * Math.sin(Math.PI * k)
  return out.set(r * Math.cos(pitch) * Math.sin(yaw), r * Math.sin(pitch), r * Math.cos(pitch) * Math.cos(yaw))
}
