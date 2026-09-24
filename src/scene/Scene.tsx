import { useEffect, useMemo, useRef, type ComponentRef } from 'react'
import type { Group } from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping, NoToneMapping, Vector3, type Camera } from 'three'
import cam from '../stage/camera.json'
import { DEBUG, P } from '../lib/params'
import { store, useStore } from '../lib/store'
import { clamp, damp, easeOutCubic } from '../lib/anim'
import { Lighting } from './Lighting'
import { Diorama } from '../set/Diorama'
import { Environment, FOG } from '../set/Environment'
import { Cast } from '../cast/Cast'
import { headRegistry } from '../zenek/motion'
import { ZR } from '../zenek/proportions'
import { bubbleEl } from '../ui/Bubble'
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

// Pins the speech bubble above the speaker, and the name tag above the hovered Zenek.
function Projector() {
  useFrame(({ camera, size }) => {
    const S = store.get()
    const bubble = bubbleEl.current
    if (bubble && S.active) {
      const head = headRegistry.get(S.active)
      if (head) {
        _v.setFromMatrixPosition(head.matrixWorld)
        _v.y += ZR * 1.28
        _v.project(camera)
        const px = ((_v.x + 1) / 2) * size.width
        const py = ((1 - _v.y) / 2) * size.height
        const w = bubble.offsetWidth
        const half = w / 2 + 12
        const cx = clamp(px, half, size.width - half)
        const top = Math.max(bubble.offsetHeight + 12, py - 8)
        bubble.style.left = `${cx}px`
        bubble.style.top = `${top}px`
        bubble.style.setProperty('--tail-x', `${clamp(px - (cx - w / 2), 18, w - 18)}px`)
      }
    }
    const tag = nameEl.current
    if (tag && S.hover) {
      const head = headRegistry.get(S.hover)
      if (head) {
        _v.setFromMatrixPosition(head.matrixWorld)
        _v.y += ZR * 1.22
        _v.project(camera)
        const px = ((_v.x + 1) / 2) * size.width
        const py = ((1 - _v.y) / 2) * size.height
        const half = tag.offsetWidth / 2 + 8
        tag.style.left = `${clamp(px, half, size.width - half)}px`
        tag.style.top = `${Math.max(tag.offsetHeight + 8, py - 6)}px`
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
      g.visible = false
      return
    }
    g.visible = true
    const u = clamp((clock.elapsedTime - S.introClock) / 1.5, 0, 1)
    g.position.y = -1.6 * (1 - easeOutCubic(u))
  })
  return <group ref={ref}>{children}</group>
}

function Clocks() {
  const phase = useStore((s) => s.phase)
  useFrame(({ clock }) => {
    const s = store.get()
    if (!s.firstFrame) store.set({ firstFrame: true })
    if (phase === 'intro' && s.introClock < 0) store.set({ introClock: clock.elapsedTime })
  })
  return null
}

export function Scene() {
  return (
    <div className="scene" onPointerMove={() => store.mutate({ pointerActiveAt: performance.now() })}>
      <Canvas
        shadows="variance"
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        dpr={[1, 2]}
        camera={{ fov: P.num('fov', cam.fov), near: 0.5, far: 600, position: [18, 12, 12] }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0)
          gl.toneMapping = TONE[DEBUG.tone as keyof typeof TONE] ?? NeutralToneMapping
          gl.toneMappingExposure = P.num('exp', 1.0)
        }}
        onPointerMissed={() => store.set({ active: null })}
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
