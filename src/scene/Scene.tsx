import { useEffect, useMemo, useRef, type ComponentRef } from 'react'
import type { Group } from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping, NoToneMapping, Vector3, type Camera } from 'three'
import cam from '../stage/camera.json'
import { DEBUG, LITE, P } from '../lib/params'
import { store, useStore } from '../lib/store'
import { hush } from '../lib/talk'
import { clamp, damp, easeOutCubic } from '../lib/anim'
import { Lighting } from './Lighting'
import { Diorama } from '../set/Diorama'
import { Environment, FOG } from '../set/Environment'
import { Cast } from '../cast/Cast'
import { headRegistry } from '../zenek/motion'
import { ZR } from '../zenek/proportions'
import { bubbles } from '../ui/Bubble'
import { nameEl } from '../ui/NameTag'
import { HOME, LIMITS, view, type Spherical } from './view'

const TONE = { aces: ACESFilmicToneMapping, agx: AgXToneMapping, neutral: NeutralToneMapping, none: NoToneMapping } as const
const _off = new Vector3()

function place(camera: Camera, target: Vector3, s: Spherical) {
  camera.position.set(
    target.x + s.dist * Math.sin(s.polar) * Math.sin(s.az),
    target.y + s.dist * Math.cos(s.polar),
    target.z + s.dist * Math.sin(s.polar) * Math.cos(s.az),
  )
  camera.lookAt(target)
}

// Free orbit + zoom within limits; DOM controls push goals through `view`;
// a whisper of idle drift when nobody has touched it for a while.
function OrbitRig() {
  const ref = useRef<ComponentRef<typeof OrbitControls>>(null)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const target = useMemo(() => new Vector3(P.num('tx', cam.tx), P.num('ty', cam.ty), -P.num('tz', cam.tz)), [])
  const placed = useRef(false)

  useEffect(() => {
    if (placed.current) return
    placed.current = true
    const aspect = size.width / size.height
    const fit = Math.max(1, Math.pow(1 / aspect, 0.5)) // portrait: step back so the room still fits
    const start: Spherical = { az: HOME.az, polar: HOME.polar, dist: clamp(P.num('dist', HOME.dist) * fit, LIMITS.minDist, LIMITS.maxDist) }
    HOME.dist = start.dist
    place(camera, target, start)
    ref.current?.update()
  }, [camera, size, target])

  const introSeen = useRef(false)
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
    if (vs.goal) {
      const g = { az: vs.goal.az ?? cur.az, polar: vs.goal.polar ?? cur.polar, dist: vs.goal.dist ?? cur.dist }
      const lam = vs.goalLambda ?? 6
      const nx = { az: damp(cur.az, g.az, lam, dt), polar: damp(cur.polar, g.polar, lam, dt), dist: damp(cur.dist, g.dist, lam, dt) }
      place(camera, c.target, nx)
      if (Math.abs(nx.az - g.az) < 0.002 && Math.abs(nx.polar - g.polar) < 0.002 && Math.abs(nx.dist - g.dist) < 0.02) {
        vs.goal = null
        vs.goalLambda = undefined
      }
    } else if (DEBUG.motion && !store.get().reducedMotion && performance.now() - vs.lastUserAt > 6000) {
      // minimal movement: ±1° sway over ~20 s, applied as a velocity so it is seamless
      const t = state.clock.elapsedTime
      const w = (Math.PI * 2) / 20
      const dAz = 0.0175 * w * Math.cos(t * w) * dt
      place(camera, c.target, { ...cur, az: clamp(cur.az + dAz, LIMITS.minAz, LIMITS.maxAz) })
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
      onStart={() => view.touched()}
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
      </Canvas>
    </div>
  )
}
