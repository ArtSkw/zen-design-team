import cam from '../stage/camera.json'
import { P } from '../lib/params'
import { clamp } from '../lib/anim'

// Camera view state shared between the orbit rig (inside the canvas) and the
// DOM controls. Goals are consumed by the rig with damping. No three.js here: the
// controls ship in the first chunk, ahead of the 3D.
const rad = (deg: number) => (deg * Math.PI) / 180

export type Spherical = { az: number; polar: number; dist: number }

// `?az=&el=&dist=` override the home view for screenshots.
export const HOME: Spherical = {
  az: rad(P.num('az', cam.az)),
  polar: rad(90 - P.num('el', cam.el)),
  dist: P.num('dist', cam.dist),
}
export const LIMITS = {
  minDist: 10,
  maxDist: 52,
  minPolar: rad(30),
  maxPolar: rad(84),
  minAz: rad(-50),
  maxAz: rad(115),
}

type Goal = Partial<Spherical>
const state: { goal: Goal | null; goalLambda?: number; lastUserAt: number; current: Spherical } = { goal: null, lastUserAt: 0, current: { ...HOME } }

export const view = {
  state,
  rotate(dAz: number) {
    state.goal = { ...(state.goal ?? {}), az: clamp((state.goal?.az ?? state.current.az) + dAz, LIMITS.minAz, LIMITS.maxAz) }
    state.lastUserAt = performance.now()
  },
  zoom(factor: number) {
    state.goal = { ...(state.goal ?? {}), dist: clamp((state.goal?.dist ?? state.current.dist) * factor, LIMITS.minDist, LIMITS.maxDist) }
    state.lastUserAt = performance.now()
  },
  reset() {
    state.goal = { ...HOME }
    state.lastUserAt = performance.now()
  },
  touched() {
    state.goal = null
    state.lastUserAt = performance.now()
  },
}
