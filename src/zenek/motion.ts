import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { MathUtils, Plane, Raycaster, Vector3, type Object3D } from 'three'
import { createNoise2D } from 'simplex-noise'
import type { Member } from '../cast/team'
import { TEAM, byId } from '../cast/team'
import { HAND_L, HAND_R, type ZenekRefs } from './Zenek'
import { ZR } from './proportions'
import { headTraits } from './parts'
import { DURATION, allowed, gesture, offsets, resetOffsets, type GestureKind } from './gestures'
import { circleMates, emit, eventsSince, laughOf, roleOf, tickSocial } from './social'
import { skyAttention } from '../lib/sky'
import { store } from '../lib/store'
import { DEBUG } from '../lib/params'
import { mulberry32, range } from '../lib/rng'
import { clamp, damp, easeOutBack, easeOutCubic, kf } from '../lib/anim'

const R = ZR
const STAGGER = 0.07
const POP = 0.52
const TAP_SY: [number, number][] = [[0, 1], [0.14, 0.86], [0.34, 1.1], [0.52, 0.96], [0.72, 1.02], [1, 1]]
const TAP_Y: [number, number][] = [[0, 0], [0.14, -0.03], [0.34, 0.3], [0.56, 0], [0.7, 0.05], [0.84, 0], [1, 0]]
const _v = new Vector3()
const _w = new Vector3()
const _u = new Vector3()
const _hit = new Vector3()
const _ray = new Raycaster()
const _plane = new Plane(new Vector3(0, 1, 0), 0)
const NEAR = 5.2          // world units: how close the cursor must come to earn a look
const INTRO_DELAY = 0.55  // let the room settle before the first Zenek arrives
const GLANCE_NEAR = 5.5   // how far a laugh, a wave or a stretch carries
const EAVESDROP_NEAR = 8  // a Zenek on its own keeps an eye on talkers this close
const TAU = Math.PI * 2
/** Long hair beside the body: the hands rest a little forward, in front of it (as drawn). */
const HAND_FORWARD = 0.2
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const lerpAngle = (a: number, b: number, t: number) => a + wrapAngle(b - a) * t

// Heads by member id, for the speech-bubble projector and for looking at each other.
export const headRegistry = new Map<string, Object3D>()

function headOf(id: string, out: Vector3) {
  const h = headRegistry.get(id)
  if (h) return out.setFromMatrixPosition(h.matrixWorld)
  const m = byId(id)!
  return out.set(m.seat.x, m.seat.y + R, m.seat.z)
}

type Gest = { kind: GestureKind; t0: number; dur: number; side: 1 | -1; idle: boolean }

export function useZenekMotion(member: Member, refs: ZenekRefs, order: number) {
  const cfg = useMemo(() => {
    const rng = mulberry32(member.seed)
    const tp = member.temperament
    return {
      rng,
      period: range(rng, 3.2, 4.6) / tp.breath,
      phase: rng() * Math.PI * 2,
      blinkMin: 3 / tp.blink,
      blinkMax: 7 / tp.blink,
      firstBlink: 1.5 + rng() * 3,
      swayAmp: MathUtils.degToRad(0.8) * tp.sway,
      noise: createNoise2D(mulberry32(member.seed + 101)),
      ns: rng() * 100,
      laughDelay: range(rng, 0, 0.28), // a circle laughs together, never in unison
      traits: { ...headTraits(member.parts), bulky: !!member.arms },
      mates: circleMates(member.id),
      host: member.gaze === 'viewer',
    }
  }, [member])
  const rest = useMemo(() => {
    const a = member.arms
    if (a) return { l: new Vector3(a.shoulder[0] * R, a.shoulder[1] * R, a.shoulder[2] * R), r: new Vector3(-a.shoulder[0] * R, a.shoulder[1] * R, a.shoulder[2] * R) }
    const f = cfg.traits.longSides ? HAND_FORWARD : 0
    return { l: HAND_L.clone().add(new Vector3(0.05 * R * Math.sign(f), 0, f * R)), r: HAND_R.clone().add(new Vector3(-0.05 * R * Math.sign(f), 0, f * R)) }
  }, [cfg, member.arms])

  const st = useRef({
    t: 0, blinkAt: cfg.firstBlink, blinkStart: -1, lastBlink: -10, hover: 0, tapAt: -1, yaw: 0, pitch: 0, eyeBase: -1, att: 0,
    // gestures: one at a time, on a human interval, seeded per character
    gest: null as Gest | null,
    nextGestAt: 4 + cfg.rng() * 9,
    hoverWaveAt: 0,
    wasHovered: false,
    // conversation
    turnSeen: -2, nodAt: Infinity, nodKind: 'nod' as GestureKind, shrugTurn: -2, laughSeen: -1, focusKey: '', lean: 0,
    // glancing at something nearby: an event, or a talker across the room
    evSeq: 0, gFrom: 0, gUntil: 0, gx: 0, gy: 0, gz: 0, gLook: 0, nextEaves: 6 + cfg.rng() * 8,
    // looking up at whatever crosses the sky
    skyId: -1, skyFrom: 0, skyUntil: 0, skyLook: 0,
    // eyes: small saccades on their own clock; they lead the head
    sacAt: 1 + cfg.rng() * 2, sacX: 0, sacY: 0, sacTx: 0, sacTy: 0,
    handYaw: 0,
  })
  const off = useMemo(offsets, [])

  useFrame((state, rawDt) => {
    const root = refs.root.current
    const head = refs.head.current
    const eyes = refs.eyes.current
    const eyeL = refs.eyeL.current
    const eyeR = refs.eyeR.current
    if (!root || !head || !eyes || !eyeL || !eyeR) return
    const s = st.current
    if (s.eyeBase < 0) {
      s.eyeBase = eyeL.scale.y // the eye is a unit sphere scaled to size; blink scales that
      head.rotation.order = 'YXZ' // turn, then pitch and roll about the turned body
    }
    const dt = Math.min(rawDt, 0.05)
    const t = state.clock.elapsedTime
    s.t = t
    const S = store.get()
    const rm = S.reducedMotion
    const amp = (rm ? 0.5 : 1) * (DEBUG.motion ? 1 : 0)
    const seatScale = member.seat.scale ?? 1
    tickSocial(t)

    // ---- entrance wave ---------------------------------------------------
    let e = 1
    if (DEBUG.intro) {
      if (S.introClock < 0) {
        root.visible = S.phase === 'loading' // drawn under the curtain while loading: compiled before the entrance (Scene: Rise)
        return
      }
      const local = t - S.introClock - INTRO_DELAY - order * STAGGER
      if (local <= 0) {
        root.visible = false
        return
      }
      const u = clamp(local / POP, 0, 1)
      e = rm ? easeOutCubic(u) : easeOutBack(u, 1.15)
    }
    root.visible = true

    // ---- breath, hover, tap → one root transform --------------------------
    const breath = amp * 0.025 * Math.sin((2 * Math.PI * t) / cfg.period + cfg.phase)
    s.hover = damp(s.hover, S.hover === member.id ? 1 : 0, 10, dt)
    let sy = 1
    let hop = 0
    if (s.tapAt >= 0) {
      const u = (t - s.tapAt) / 0.48
      if (u >= 1) s.tapAt = -1
      else {
        sy = kf(TAP_SY, u)
        hop = kf(TAP_Y, u) * R * (rm ? 0.3 : 1)
      }
    }
    const base = seatScale * e * (1 + s.hover * 0.03)
    const sxz = (base * (1 - breath / 2)) / Math.sqrt(sy)
    root.scale.set(sxz, base * (1 + breath) * sy, sxz)
    root.rotation.z = amp * cfg.swayAmp * cfg.noise(t * 0.15, cfg.ns)
    _v.setFromMatrixPosition(head.matrixWorld)

    // ---- gestures ------------------------------------------------------------
    // The conversation drives most of it — a speaker talks with the hands (and
    // sometimes ends on a shrug), listeners nod or tilt once in a turn, a circle
    // laughs together a beat apart. On their own clock, between turns and in the
    // lulls: a look around, a scratch (bare heads only), a stretch, a tilt.
    resetOffsets(off)
    const role = roleOf(member.id)
    const speaking = S.active === member.id
    const settled = e >= 0.999 && amp > 0
    const start = (kind: GestureKind, dur = DURATION[kind], idle = false) => {
      const side: 1 | -1 = kind === 'wave' && cfg.traits.waveSide ? cfg.traits.waveSide : cfg.rng() < 0.5 ? -1 : 1 // a lock framing one side of the face keeps that hand down
      s.gest = { kind, t0: t, dur: dur * (rm ? 1.15 : 1), side, idle }
      if (kind === 'wave' || kind === 'stretch' || kind === 'laugh') emit({ id: member.id, kind, x: _v.x, y: _v.y, z: _v.z, t })
    }
    const hovered = S.hover === member.id
    if (settled) {
      const la = laughOf(member.id)
      if (la > 0 && la !== s.laughSeen && t >= la + cfg.laughDelay) {
        s.laughSeen = la
        if (!s.gest || s.gest.kind !== 'wave') start('laugh')
      }
      if (role.kind === 'listen' && role.turn !== s.turnSeen) {
        // one small acknowledgement somewhere in the middle of the turn, maybe
        s.turnSeen = role.turn
        const len = role.t1 - role.t0
        s.nodAt = Number.isFinite(len) && cfg.rng() < 0.6 ? role.t0 + range(cfg.rng, 0.9, Math.max(1.0, len - 1.3)) : Infinity
        s.nodKind = cfg.rng() < 0.78 ? 'nod' : 'tilt'
      }
    }
    if (settled && !s.gest) {
      if (hovered && !s.wasHovered && t > s.hoverWaveAt && !speaking) {
        // a greeting when the cursor lands on you, at most every so often
        start('wave')
        s.hoverWaveAt = t + 14
      } else if (speaking) {
        // tapped: the bubble is open and this one has the floor
        if (t > s.nextGestAt) start(cfg.rng() < 0.8 ? 'talk' : 'nod', range(cfg.rng, 2.6, 4))
      } else if (role.kind === 'speak') {
        const left = role.t1 - t
        const tail = role.shrug ? 1.45 : 0
        if (left - tail > 1.4) start('talk', left - tail)
        else if (role.shrug && role.turn !== s.shrugTurn && left > 1.1) {
          s.shrugTurn = role.turn
          start('shrug')
        }
      } else if (role.kind === 'listen' && t >= s.nodAt) {
        s.nodAt = Infinity
        start(s.nodKind)
      } else if (t > s.nextGestAt) {
        // listening leaves room for a thoughtful tilt or a scratch; idle for anything
        const listening = role.kind === 'listen'
        const pool: [GestureKind, number][] = [
          ['look', listening ? 0.3 : 2.2],
          ['scratch', listening ? 1 : 1.4],
          ['stretch', listening ? 0 : 1],
          ['tilt', listening ? 1 : cfg.host || s.att > 0.5 ? 1.4 : 0.4],
          ['wave', listening ? 0 : cfg.host ? 0.6 : 0.12],
        ]
        let sum = 0
        for (const [k, w] of pool) if (allowed(k, cfg.traits)) sum += w
        let pick = cfg.rng() * sum
        let kind: GestureKind = 'look'
        for (const [k, w] of pool) {
          if (!allowed(k, cfg.traits)) continue
          pick -= w
          if (pick <= 0) {
            kind = k
            break
          }
        }
        start(kind, DURATION[kind], true)
      }
    }
    s.wasHovered = hovered
    if (s.gest) {
      const u = (t - s.gest.t0) / s.gest.dur
      if (u >= 1 || amp === 0) {
        if (speaking) s.nextGestAt = t + range(cfg.rng, 0.4, 1.4)
        else if (s.gest.idle) s.nextGestAt = t + range(cfg.rng, 9, 21)
        s.gest = null
      } else gesture(s.gest.kind, u, s.gest.side, off, s.gest.dur, cfg.traits)
    }
    let ga = amp // reduced motion halves everything, motion=0 freezes
    if (DEBUG.gest) {
      // design check: every Zenek holds one gesture at one moment
      resetOffsets(off)
      const k = DEBUG.gest as GestureKind
      gesture(k, clamp(DEBUG.gestU, 0, 0.999), member.seed % 2 ? 1 : -1, off, DURATION[k], cfg.traits)
      ga = 1
    }
    root.scale.y *= 1 + ga * off.sy
    root.position.y = member.seat.y + R * root.scale.y + hop + s.hover * 0.06 * R
    const handL = refs.handL.current
    const handR = refs.handR.current
    if (handL && handR) {
      // hands float a little on the breath, each on its own beat, plus the gesture
      const fl = 0.012 * Math.sin((TAU * t) / cfg.period + cfg.phase + 1.3) * ga
      const fr = 0.012 * Math.sin((TAU * t) / cfg.period + cfg.phase + 2.9) * ga
      handL.position.copy(rest.l).addScaledVector(off.hl, R * ga)
      handL.position.y += fl * R
      handR.position.copy(rest.r).addScaledVector(off.hr, R * ga)
      handR.position.y += fr * R
      // a jointed arm: raise at the shoulder (outward: the left turns −z, the mirrored right +z),
      // bend at the elbow (inside the mirror, the same sign on both sides)
      const restLift = member.arms ? 0.14 : 0 // a relaxed muscular arm hangs a little out from the body
      handL.rotation.z = -(restLift + off.al * ga)
      handR.rotation.z = restLift + off.ar * ga
      const elL = refs.elbowL.current
      const elR = refs.elbowR.current
      if (elL) elL.rotation.z = -off.bl * ga
      if (elR) elR.rotation.z = -off.br * ga
    }

    // ---- gaze ---------------------------------------------------------------
    // Rest: in a conversation, look at whoever is talking (a listener) or at the
    // one being addressed (the speaker); between turns, lean loosely toward the
    // circle; alone, look around. A laugh, a wave or a stretch nearby may earn a
    // glance; so may something crossing the sky. A cursor that comes close earns a
    // slow turn to the viewer. A tapped speaker looks at the viewer; the circle
    // and anyone close looks at them.
    const toYawPitch = (tx: number, tyy: number, tz: number) => {
      const dx = tx - _v.x
      const dy = tyy - _v.y
      const dz = tz - _v.z
      return [wrapAngle(Math.atan2(dx, dz) - member.seat.yaw), Math.atan2(dy, Math.hypot(dx, dz))] as const
    }
    const cam = state.camera.position
    const [cy, cp] = toYawPitch(cam.x, cam.y, cam.z)
    // turn toward a point, but never more than ~60° away from the viewer: a
    // three-quarter face still reads
    const toward = (p: Vector3, blend: number) => {
      const [py0, pp0] = toYawPitch(p.x, p.y, p.z)
      return [cy + clamp(wrapAngle(lerpAngle(cy, py0, blend) - cy), -1.05, 1.05), MathUtils.lerp(cp, pp0, blend)] as const
    }
    let ty = 0
    let tp = 0
    let focus = ''
    let override = false
    if (speaking) {
      ;[ty, tp] = [cy, cp]
      override = true
      focus = 'viewer'
    } else if (S.active && role.kind !== 'listen') {
      const sp = byId(S.active)?.seat
      if (sp && Math.hypot(sp.x - member.seat.x, sp.z - member.seat.z) < 2.6) {
        ;[ty, tp] = toward(headOf(S.active, _w), 0.85)
        override = true
        focus = S.active
      }
    }
    if (!override) {
      let ry: number
      let rp: number
      const wander = amp * cfg.noise(t * 0.07, cfg.ns + 7)
      if (role.kind === 'listen') {
        ;[ry, rp] = toward(headOf(role.speaker, _w), cfg.host ? 0.55 : 0.8)
        ry += 0.04 * wander
        focus = role.speaker
      } else if (role.kind === 'speak' && role.to) {
        ;[ry, rp] = toward(headOf(role.to, _w), 0.7)
        ry += 0.05 * wander
        focus = role.to
      } else if (cfg.host || role.kind === 'speak') {
        ry = cy + 0.05 * wander
        rp = cp
        focus = 'viewer'
      } else if (cfg.mates.length) {
        // between turns: loosely toward the circle, eyes free to wander
        _w.set(0, 0, 0)
        for (const id of cfg.mates) _w.add(headOf(id, _u))
        _w.divideScalar(cfg.mates.length)
        ;[ry, rp] = toward(_w, 0.35)
        ry += 0.22 * wander
        rp += amp * 0.05 * cfg.noise(t * 0.05, cfg.ns + 13)
        focus = 'circle'
      } else {
        ry = amp * 0.3 * cfg.noise(t * 0.06, cfg.ns + 7)
        rp = amp * 0.08 * cfg.noise(t * 0.05, cfg.ns + 13)
        focus = 'room'
      }

      // something nearby worth a glance: a laugh, a wave, a stretch — not your own
      // circle's laugh (you are laughing too)
      for (const ev of eventsSince(s.evSeq)) {
        s.evSeq = ev.seq
        if (ev.id === member.id || role.kind === 'speak') continue
        if (ev.kind === 'laugh' && cfg.mates.includes(ev.id)) continue
        const d = Math.hypot(ev.x - _v.x, ev.z - _v.z)
        if (d < GLANCE_NEAR && cfg.rng() < 0.5) {
          s.gFrom = t + range(cfg.rng, 0.15, 0.5)
          s.gUntil = s.gFrom + range(cfg.rng, 1.2, 2.2)
          s.gx = ev.x
          s.gy = ev.y
          s.gz = ev.z
        }
      }
      // alone, or in a lull: now and then watch whoever is talking nearby
      if (settled && role.kind === 'idle' && t > s.nextEaves) {
        s.nextEaves = t + range(cfg.rng, 5, 12)
        if (!cfg.mates.length || cfg.rng() < 0.3) {
          let best: string | null = null
          let bd = EAVESDROP_NEAR
          for (const o of TEAM) {
            if (o.id === member.id || roleOf(o.id).kind !== 'speak') continue
            const d = Math.hypot(o.seat.x - member.seat.x, o.seat.z - member.seat.z)
            if (d < bd) {
              bd = d
              best = o.id
            }
          }
          if (best) {
            headOf(best, _w)
            s.gFrom = t + range(cfg.rng, 0.1, 0.4)
            s.gUntil = s.gFrom + range(cfg.rng, 2, 3.6)
            s.gx = _w.x
            s.gy = _w.y
            s.gz = _w.z
          }
        }
      }
      const glancing = t > s.gFrom && t < s.gUntil
      s.gLook = damp(s.gLook, glancing ? 1 : 0, glancing ? 3.2 : 1.6, dt)
      if (s.gLook > 0.001) {
        _w.set(s.gx, s.gy, s.gz)
        const [gy, gp] = toward(_w, 0.9)
        ry = lerpAngle(ry, gy, s.gLook)
        rp = MathUtils.lerp(rp, gp, s.gLook)
        if (glancing) focus = `glance${s.gFrom.toFixed(2)}`
      }

      // something crossing the sky: about a third of the room looks up, each a beat apart
      if (skyAttention.active && skyAttention.id !== s.skyId) {
        s.skyId = skyAttention.id
        if (cfg.rng() < 0.38) {
          s.skyFrom = t + range(cfg.rng, 0.2, 2.2)
          s.skyUntil = s.skyFrom + range(cfg.rng, 2.2, 4)
        } else s.skyUntil = 0
      }
      const lookingUp = skyAttention.active && t > s.skyFrom && t < s.skyUntil
      s.skyLook = damp(s.skyLook, lookingUp ? 1 : 0, lookingUp ? 2.4 : 1.4, dt)
      if (s.skyLook > 0.001) {
        const [ky, kp] = toYawPitch(skyAttention.x, skyAttention.y, skyAttention.z)
        ry = lerpAngle(ry, ky, s.skyLook)
        rp = MathUtils.lerp(rp, kp, s.skyLook)
        if (lookingUp) focus = 'sky'
      }
      // cursor attention
      let near = false
      if (DEBUG.motion && performance.now() - S.pointerActiveAt < 3500) {
        _ray.setFromCamera(state.pointer, state.camera)
        _plane.constant = -_v.y
        if (_ray.ray.intersectPlane(_plane, _hit)) near = Math.hypot(_hit.x - _v.x, _hit.z - _v.z) < NEAR
      }
      s.att = damp(s.att, near ? 1 : 0, near ? 2.2 : 1.1, dt)
      if (near) focus = 'viewer'
      ty = lerpAngle(ry, cy, s.att)
      tp = MathUtils.lerp(rp, cp, s.att)
    } else {
      s.att = damp(s.att, 0, 2, dt)
    }
    ty = clamp(ty, -0.7, 0.7)
    tp = clamp(tp, -0.25, 0.45)
    if (DEBUG.lab) ty = tp = 0 // the lab compares against the design: head straight, whatever the circle
    // a new focus far from where we look: blink on the way, as people do
    if (focus !== s.focusKey) {
      if (s.focusKey && Math.abs(ty - s.yaw) > 0.3 && s.blinkStart < 0 && t - s.lastBlink > 1.2 && cfg.rng() < 0.7) s.blinkAt = t
      s.focusKey = focus
    }
    s.yaw = damp(s.yaw, ty, override ? 4.5 : 3.2, dt)
    s.pitch = damp(s.pitch, tp, override ? 4.5 : 3.2, dt)
    // listeners lean in a touch, speakers a little less
    const leanTo = amp * (role.kind === 'listen' ? 0.05 : role.kind === 'speak' || speaking ? 0.025 : 0)
    s.lean = damp(s.lean, leanTo, 1.3, dt)
    head.rotation.set(-s.pitch + ga * off.pitch + s.lean, s.yaw + ga * off.yaw, ga * off.roll)
    // the hands follow the body's turn, a beat behind
    s.handYaw = damp(s.handYaw, s.yaw * 0.85 + ga * off.yaw * 0.4, 3, dt)
    if (refs.hands.current) refs.hands.current.rotation.y = s.handYaw

    // eyes: they reach a new target first and the body follows; between moves they
    // make small saccades of their own
    if (t > s.sacAt) {
      s.sacTx = (cfg.rng() * 2 - 1) * 0.014
      s.sacTy = (cfg.rng() * 2 - 1) * 0.009
      s.sacAt = t + range(cfg.rng, 0.5, 2.6)
    }
    s.sacX = damp(s.sacX, s.sacTx * amp, 28, dt)
    s.sacY = damp(s.sacY, s.sacTy * amp, 28, dt)
    const leadY = clamp(ty - s.yaw, -0.3, 0.3) * 0.06
    const leadP = clamp(tp - s.pitch, -0.2, 0.2) * 0.05
    eyes.position.set(((s.yaw + ga * off.yaw) * 0.08 + leadY + s.sacX) * R, ((s.pitch - ga * off.pitch) * 0.08 + leadP + s.sacY) * R, 0)

    // ---- blink ------------------------------------------------------------
    if (amp > 0) {
      if (s.blinkStart < 0 && t >= s.blinkAt) {
        s.blinkStart = t
        s.lastBlink = t
      }
      if (s.blinkStart >= 0) {
        const b = t - s.blinkStart
        let k = 1
        if (b < 0.12) k = 1 - (b / 0.12) * 0.92
        else if (b < 0.16) k = 0.08
        else if (b < 0.3) k = 0.08 + ((b - 0.16) / 0.14) * 0.92
        else {
          s.blinkStart = -1
          s.blinkAt = t + (cfg.rng() < 0.15 ? 0.25 : range(cfg.rng, cfg.blinkMin, cfg.blinkMax))
        }
        eyeL.scale.y = s.eyeBase * k
        eyeR.scale.y = s.eyeBase * k
      }
    }
  })

  return useMemo(
    () => ({
      tap: () => {
        st.current.tapAt = st.current.t
        st.current.nextGestAt = st.current.t + 0.45 // start talking as the boing settles
      },
    }),
    [],
  )
}

// The floor reflection copies the live transform of its original.
export function useMirror(src: ZenekRefs, dst: ZenekRefs) {
  useFrame(() => {
    const a = src.root.current
    const b = dst.root.current
    if (!a || !b) return
    b.visible = a.visible
    b.position.copy(a.position)
    b.rotation.copy(a.rotation)
    b.scale.copy(a.scale)
    if (src.head.current && dst.head.current) dst.head.current.rotation.copy(src.head.current.rotation)
    if (src.eyes.current && dst.eyes.current) dst.eyes.current.position.copy(src.eyes.current.position)
    if (src.eyeL.current && dst.eyeL.current) dst.eyeL.current.scale.copy(src.eyeL.current.scale)
    if (src.eyeR.current && dst.eyeR.current) dst.eyeR.current.scale.copy(src.eyeR.current.scale)
    if (src.hands.current && dst.hands.current) dst.hands.current.rotation.copy(src.hands.current.rotation)
    for (const k of ['handL', 'handR', 'elbowL', 'elbowR'] as const) {
      const a2 = src[k].current
      const b2 = dst[k].current
      if (a2 && b2) {
        b2.position.copy(a2.position)
        b2.rotation.copy(a2.rotation)
      }
    }
  })
}
