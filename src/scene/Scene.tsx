import { useEffect, useMemo, useRef, type ComponentRef } from 'react'
import type { Group } from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping, NoToneMapping, Vector3, type Camera, type PerspectiveCamera } from 'three'
import cam from '../stage/camera.json'
import { DEBUG, LITE, P } from '../lib/params'
import { store, useStore } from '../lib/store'
import { hush } from '../lib/talk'
import { clamp, damp, easeOutCubic, smoothstep, spring, type Spring } from '../lib/anim'
import { Lighting } from './Lighting'
import { Diorama } from '../set/Diorama'
import { Environment, FOG } from '../set/Environment'
import { Cast } from '../cast/Cast'
import { headRegistry } from '../zenek/motion'
import { greeting } from '../zenek/social'
import { TEAM } from '../cast/team'
import { ZR } from '../zenek/proportions'
import { bubbles } from '../ui/Bubble'
import { nameEl } from '../ui/NameTag'
import { HOME, LIMITS, view, type Spherical } from './view'
import { Ear } from '../sound/Ear'

const TONE = { aces: ACESFilmicToneMapping, agx: AgXToneMapping, neutral: NeutralToneMapping, none: NoToneMapping } as const
const _off = new Vector3()
/** The camera's pace toward a goal the controls set: 90 % of the way in ~0.55 s (`spring`). */
const CAM_W = 7

function place(camera: Camera, target: Vector3, s: Spherical) {
  camera.position.set(
    target.x + s.dist * Math.sin(s.polar) * Math.sin(s.az),
    target.y + s.dist * Math.cos(s.polar),
    target.z + s.dist * Math.sin(s.polar) * Math.cos(s.az),
  )
  camera.lookAt(target)
}

// Portrait (a phone held upright): the room is wider than the screen, so the camera has its own
// cinematography (2026-09-29). A little higher, so the cast gets the height the sky had; the
// view starts on the host's side, so he is in frame as the room meets the viewer; and when
// nobody is touching it, the camera slowly surveys the room — a sideways pan to the far end of
// the team and back — in place of the landscape's ±1° sway, so everyone comes into frame.
/**
 * Pointer parallax (2026-09-29): with a mouse, the camera leans a little with the cursor — up to
 * PAR_AZ round and PAR_POLAR up or down — so the page's three depths slide past each other and
 * past the room the moment it is seen (only a drag showed them before). Not while dragging, not on
 * touch, not in portrait, not under reduced motion.
 */
const PAR_AZ = (0.8 * Math.PI) / 180
const PAR_POLAR = (0.45 * Math.PI) / 180
const FINE = typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches
const PORTRAIT_EL = 23 // degrees (the landscape home is 16°)
const SURVEY_T = 44 // s: there and back
const SURVEY_IDLE = 8000 // ms untouched before it (re)starts; a touch stops it at once
const _p = new Vector3()
const _fwd = new Vector3()

// Free orbit + zoom within limits; DOM controls push goals through `view`;
// a whisper of idle drift when nobody has touched it for a while.
function OrbitRig() {
  const ref = useRef<ComponentRef<typeof OrbitControls>>(null)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const target = useMemo(() => new Vector3(P.num('tx', cam.tx), P.num('ty', cam.ty), -P.num('tz', cam.tz)), [])
  const placed = useRef(false)
  const home = useMemo(() => new Vector3(), [])
  // the portrait survey: its reach (world units to the left of home, along the view's right), where it is, how awake
  const survey = useRef({ portrait: false, reach: 0, phase: 0, ramp: 0 })

  useEffect(() => {
    if (placed.current) return
    placed.current = true
    const aspect = size.width / size.height
    const fit = Math.max(1, Math.pow(1 / aspect, 0.5)) // portrait: step back so the room still fits
    const portrait = aspect < 0.85
    if (portrait && !P.str('el', '')) HOME.polar = ((90 - PORTRAIT_EL) * Math.PI) / 180
    const start: Spherical = { az: HOME.az, polar: HOME.polar, dist: clamp(P.num('dist', HOME.dist) * fit, LIMITS.minDist, LIMITS.maxDist) }
    HOME.dist = start.dist
    place(camera, target, start)
    if (portrait) {
      // where a Zenek falls across the screen (−1…1), and how wide the view is at its depth
      const right = new Vector3(Math.cos(start.az), 0, -Math.sin(start.az))
      const halfTan = Math.tan(((camera as PerspectiveCamera).fov * Math.PI) / 360) * aspect
      const across = (m: (typeof TEAM)[number]) => {
        _fwd.copy(target).sub(camera.position).normalize()
        _p.set(m.seat.x, m.seat.y + ZR, m.seat.z).sub(camera.position)
        const half = _p.dot(_fwd) * halfTan
        return { x: _p.dot(right) / half, half }
      }
      // start on the host's side: him well inside the frame (at most half-way out to its edge)
      const host = TEAM.find((m) => m.gaze === 'viewer')
      if (host) {
        const h = across(host)
        target.addScaledVector(right, Math.max(0, (h.x - 0.5) * h.half))
        place(camera, target, start)
      }
      // the survey reaches until the farthest on the other side is as well inside
      let reach = 0
      for (const m of TEAM) {
        const q = across(m)
        reach = Math.min(reach, (q.x + 0.5) * q.half)
      }
      survey.current = { portrait: true, reach, phase: 0, ramp: 0 }
    }
    home.copy(target)
    ref.current?.target.copy(target) // the controls hold their own copy of the centre, taken as they rendered
    ref.current?.update()
  }, [camera, size, target, home])

  const introSeen = useRef(false)
  // the pointer parallax: where it has leaned the camera, and whether a drag holds it
  const lean = useRef({ az: 0, polar: 0, drag: false })
  // the camera's speed on its way to a goal the controls set (a spring carries it: see below)
  const vel = useRef({ az: 0, polar: 0, dist: 0, tx: 0, ty: 0, tz: 0 })
  useFrame((state, rawDt) => {
    const c = ref.current
    if (!c) return
    const dt = Math.min(rawDt, 0.05)
    const S = store.get()
    if (DEBUG.intro && S.phase === 'intro' && !introSeen.current) {
      introSeen.current = true
      if (!S.reducedMotion) {
        place(camera, c.target, { az: HOME.az - 0.14, polar: HOME.polar - 0.16, dist: HOME.dist * 1.42 })
        view.state.goal = { ...HOME }
        view.state.goalLambda = 1.7
      }
    }
    // keep the pan inside the room
    c.target.x = clamp(c.target.x, 2, 16)
    c.target.y = clamp(c.target.y, 0.2, 3.2)
    c.target.z = clamp(c.target.z, -10.5, -0.8)
    _off.copy(camera.position).sub(c.target)
    const cur: Spherical = { dist: _off.length(), az: Math.atan2(_off.x, _off.z), polar: Math.acos(clamp(_off.y / _off.length(), -1, 1)) }
    view.state.current = cur
    const vs = view.state
    const v = vel.current
    if (vs.goal) {
      const g = { az: vs.goal.az ?? cur.az, polar: vs.goal.polar ?? cur.polar, dist: vs.goal.dist ?? cur.dist }
      let nx: Spherical
      if (vs.goalLambda) {
        // the intro's dolly, as it has always been: it settles under the curtain's fade
        const lam = vs.goalLambda
        nx = { az: damp(cur.az, g.az, lam, dt), polar: damp(cur.polar, g.polar, lam, dt), dist: damp(cur.dist, g.dist, lam, dt) }
      } else {
        // a press on the controls: a spring, so the camera sets off gently rather than at full
        // speed in its first frame, and presses in a row carry on without a kink (2026-09-29)
        const a: Spring = { x: cur.az, v: v.az }
        const p: Spring = { x: cur.polar, v: v.polar }
        const d: Spring = { x: cur.dist, v: v.dist }
        nx = { az: spring(a, g.az, CAM_W, dt), polar: spring(p, g.polar, CAM_W, dt), dist: spring(d, g.dist, CAM_W, dt) }
        v.az = a.v
        v.polar = p.v
        v.dist = d.v
        if (vs.goal.home) {
          // home: the orbit's centre comes back too (a pan, or where the survey had got to)
          const tx: Spring = { x: c.target.x, v: v.tx }
          const ty: Spring = { x: c.target.y, v: v.ty }
          const tz: Spring = { x: c.target.z, v: v.tz }
          c.target.set(spring(tx, home.x, CAM_W, dt), spring(ty, home.y, CAM_W, dt), spring(tz, home.z, CAM_W, dt))
          v.tx = tx.v
          v.ty = ty.v
          v.tz = tz.v
          survey.current.phase = 0
        }
      }
      place(camera, c.target, nx)
      const still = vs.goalLambda || (Math.abs(v.az) < 0.01 && Math.abs(v.polar) < 0.01 && Math.abs(v.dist) < 0.05 && c.target.distanceTo(vs.goal.home ? home : c.target) < 0.02)
      if (still && Math.abs(nx.az - g.az) < 0.002 && Math.abs(nx.polar - g.polar) < 0.002 && Math.abs(nx.dist - g.dist) < 0.02) {
        vs.goal = null
        vs.goalLambda = undefined
        v.az = v.polar = v.dist = v.tx = v.ty = v.tz = 0
      }
    } else {
      v.az = v.polar = v.dist = v.tx = v.ty = v.tz = 0 // a hand on the view (or nothing to do): no speed carried over
      const sv = survey.current
      const calm = DEBUG.motion && DEBUG.sway && !store.get().reducedMotion
      if (sv.portrait) {
        // the survey: awake once the room has met the viewer and nobody has touched the view for
        // a while; it wakes gently (its pace eases in over ~2 s) and stops at a touch
        const awake = calm && S.phase === 'ready' && state.clock.elapsedTime > greeting.until + 1 && performance.now() - vs.lastUserAt > SURVEY_IDLE
        sv.ramp = awake ? Math.min(1, sv.ramp + dt / 2) : 0
        if (sv.ramp > 0 && sv.reach < -0.3) {
          const at = (ph: number) => (sv.reach * (1 - Math.cos(ph))) / 2
          const was = at(sv.phase)
          sv.phase += ((Math.PI * 2) / SURVEY_T) * dt * smoothstep(sv.ramp)
          const by = at(sv.phase) - was
          // sideways, along the view's right: the camera and its centre move together
          _p.set(Math.cos(cur.az), 0, -Math.sin(cur.az)).multiplyScalar(by)
          c.target.add(_p)
          camera.position.add(_p)
        }
      } else if (calm && performance.now() - vs.lastUserAt > 6000) {
        // minimal movement: ±1° sway over ~20 s, applied as a velocity so it is seamless
        const t = state.clock.elapsedTime
        const w = (Math.PI * 2) / 20
        const dAz = 0.0175 * w * Math.cos(t * w) * dt
        place(camera, c.target, { ...cur, az: clamp(cur.az + dAz, LIMITS.minAz, LIMITS.maxAz) })
      }
    }
    // lean with the pointer: the change in lean this frame, applied on top of whatever moved it
    const ln = lean.current
    if (FINE && !survey.current.portrait && DEBUG.motion && !S.reducedMotion && S.phase === 'ready') {
      const wantAz = ln.drag ? ln.az : state.pointer.x * PAR_AZ
      const wantPolar = ln.drag ? ln.polar : -state.pointer.y * PAR_POLAR
      const az = damp(ln.az, wantAz, 2.4, dt)
      const polar = damp(ln.polar, wantPolar, 2.4, dt)
      if (Math.abs(az - ln.az) + Math.abs(polar - ln.polar) > 1e-6) {
        _off.copy(camera.position).sub(c.target)
        const d = _off.length()
        const now: Spherical = { dist: d, az: Math.atan2(_off.x, _off.z) + az - ln.az, polar: clamp(Math.acos(clamp(_off.y / d, -1, 1)) + polar - ln.polar, LIMITS.minPolar, LIMITS.maxPolar) }
        place(camera, c.target, now)
      }
      ln.az = az
      ln.polar = polar
    }
    c.update()
  })

  return (
    <OrbitControls
      ref={ref}
      target={target}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.55}
      zoomSpeed={0.8}
      panSpeed={0.6}
      minDistance={LIMITS.minDist}
      maxDistance={LIMITS.maxDist}
      minPolarAngle={LIMITS.minPolar}
      maxPolarAngle={LIMITS.maxPolar}
      minAzimuthAngle={LIMITS.minAz}
      maxAzimuthAngle={LIMITS.maxAz}
      onStart={() => {
        view.touched()
        lean.current.drag = true
      }}
      onEnd={() => void (lean.current.drag = false)}
    />
  )
}

const _v = new Vector3()

// Pins each speech bubble above its speaker, and the name tag above the hovered Zenek.
// Moves the bubble and the name tag with the heads they belong to: a transform on each
// one's own layer, snapped to device pixels, from sizes measured when they change (reading
// them here every frame forced a layout and a repaint per frame — costly on phones).
const snap = (v: number) => Math.round(v * window.devicePixelRatio) / window.devicePixelRatio

function Projector() {
  useFrame(({ camera, size }) => {
    const S = store.get()
    for (const b of bubbles) {
      const head = headRegistry.get(b.id)
      if (head) {
        _v.setFromMatrixPosition(head.matrixWorld)
        _v.y += ZR * 1.28
        _v.project(camera)
        const px = ((_v.x + 1) / 2) * size.width
        const py = ((1 - _v.y) / 2) * size.height
        const half = b.w / 2 + 12
        const cx = clamp(px, half, size.width - half)
        const top = Math.max(b.h + 12, py - 8)
        b.pos.style.transform = `translate3d(${snap(cx)}px, ${snap(top)}px, 0)`
        // the tail points at the head; it moves only when the bubble is held at an edge
        const tail = Math.round(clamp(px - (cx - b.w / 2), 18, b.w - 18))
        if (tail !== b.tail) {
          b.tail = tail
          b.box.style.setProperty('--tail-x', `${tail}px`)
        }
      }
    }
    const t = nameEl
    if (t.pos && S.hover) {
      const head = headRegistry.get(S.hover)
      if (head) {
        _v.setFromMatrixPosition(head.matrixWorld)
        _v.y += ZR * 1.22
        _v.project(camera)
        const px = ((_v.x + 1) / 2) * size.width
        const py = ((1 - _v.y) / 2) * size.height
        const half = t.w / 2 + 8
        t.pos.style.transform = `translate3d(${snap(clamp(px, half, size.width - half))}px, ${snap(Math.max(t.h + 8, py - 6))}px, 0)`
      }
    }
  })
  return null
}

// The whole room rises a little into place as the curtain lifts.
function Rise({ children }: { children: React.ReactNode }) {
  const ref = useRef<Group>(null)
  useFrame(({ clock }) => {
    const g = ref.current
    if (!g) return
    const S = store.get()
    if (!DEBUG.intro || S.reducedMotion) {
      g.position.y = 0
      return
    }
    if (S.introClock < 0) {
      g.position.y = -1.6
      // drawn under the curtain while loading, so every shader compiles and every buffer
      // uploads then (the loader spins on the compositor) — not in the middle of the reveal
      g.visible = S.phase === 'loading'
      return
    }
    g.visible = true
    const u = clamp((clock.elapsedTime - S.introClock) / 1.5, 0, 1)
    g.position.y = -1.6 * (1 - easeOutCubic(u))
  })
  return <group ref={ref}>{children}</group>
}

const DPR_MAX = LITE ? 1.5 : 2

function Clocks() {
  const phase = useStore((s) => s.phase)
  const loaded = useStore((s) => s.loaded)
  const setFrameloop = useThree((s) => s.setFrameloop)
  const setDpr = useThree((s) => s.setDpr)
  const warm = useRef(0)
  const perf = useRef({ t0: 0, frames: 0, low: 0, dpr: Math.min(DPR_MAX, window.devicePixelRatio || 1) })

  // Once everything has been drawn under the curtain (compiled, uploaded), the 3D rests
  // until the curtain lifts: the loader's check, the title and its petals get the whole
  // device (a phone was drawing the hidden room four times a frame meanwhile).
  const behind = DEBUG.intro && loaded && (phase === 'loading' || phase === 'title')
  useEffect(() => {
    setFrameloop(behind ? 'never' : 'always')
  }, [behind, setFrameloop])

  useFrame(({ clock }, rawDt) => {
    const s = store.get()
    // the scene counts as drawn a few frames after the whole cast is dressed (the sculpt
    // meshes mount a frame or two after their data is in)
    if (!s.firstFrame && s.sculptsReady && ++warm.current > 3) store.set({ firstFrame: true })
    if (phase === 'intro' && s.introClock < 0) store.set({ introClock: clock.elapsedTime })

    // A device that cannot hold the frame rate (a phone warming up and throttling) steps
    // its pixel density down, 0.25 at a time, never below 1 and never back up (no
    // flip-flopping): two 2-second windows under 48 fps in a row make one step.
    if (s.phase !== 'ready' || !DEBUG.adapt) return
    const p = perf.current
    const now = performance.now()
    if (!p.t0 || rawDt > 0.25) {
      p.t0 = now // (re)start the window; a hidden tab or a hitch is no measure
      p.frames = 0
      return
    }
    p.frames++
    if (now - p.t0 < 2000) return
    const fps = (p.frames * 1000) / (now - p.t0)
    p.t0 = now
    p.frames = 0
    p.low = fps < 48 ? p.low + 1 : 0
    if (p.low >= 2 && p.dpr > 1) {
      p.dpr = Math.max(1, p.dpr - 0.25)
      p.low = 0
      setDpr(p.dpr)
    }
  })
  return null
}

export function Scene() {
  return (
    <div className="scene" onPointerMove={() => store.mutate({ pointerActiveAt: performance.now() })}>
      <Canvas
        shadows="variance"
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, DPR_MAX]}
        camera={{ fov: P.num('fov', cam.fov), near: 0.5, far: 600, position: [18, 12, 12] }}
        onCreated={({ gl }) => {
          if (import.meta.env.DEV) (window as unknown as { __gl?: unknown }).__gl = gl // perf probes (dev only)
          gl.setClearColor(0x000000, 0)
          gl.toneMapping = TONE[DEBUG.tone as keyof typeof TONE] ?? NeutralToneMapping
          gl.toneMappingExposure = P.num('exp', 1.0)
        }}
        onPointerMissed={hush}
      >
        <OrbitRig />
        <Lighting />
        {!DEBUG.lab && <fog attach="fog" args={[FOG, 42, 150]} />}
        {!DEBUG.lab && <Environment />}
        <Rise>
          {!DEBUG.lab && <Diorama />}
          <Cast />
        </Rise>
        <Projector />
        <Clocks />
        <Ear />
      </Canvas>
    </div>
  )
}
