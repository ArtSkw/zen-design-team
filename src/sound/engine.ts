import { P } from '../lib/params'
import { store } from '../lib/store'
import { clamp, lerp } from '../lib/anim'
import type { Out } from './synth'
import { LEVEL, mixer, type BusName } from './mix'
export type { BusName }

// The sound's plumbing. Sound is on by default (owner-directed 2026-09-27), but a browser
// plays nothing before the visitor's first gesture: the AudioContext is made and resumed
// inside it, and whatever that gesture asked to sound plays the moment the context wakes.
// So the finished loader asks for one press before the intro (src/ui/Press.tsx) — unless
// the browser would let it sound anyway (`soundAllowed`).
// Five buses are mixed into a shared open-air space and a gentle limiter (src/sound/mix.ts);
// one on/off (the control cluster) fades, is remembered, and falls silent with the tab.
// `?snd=0` turns the whole layer off (screenshots).

export const SOUND = P.flag('snd', true) && typeof window !== 'undefined' && 'AudioContext' in window
/** "Press to continue" may be asked for; automated browsers go without unless `?press=1`. */
export const PRESS = SOUND && P.flag('press', typeof navigator === 'undefined' || !navigator.webdriver)

const KEY = 'zen-design-team:sound'

let ctx: AudioContext | null = null
let out: GainNode | null = null
const buses = {} as Record<BusName, { input: GainNode; tone: BiquadFilterNode }>
const onRun: (() => void)[] = []
let ran = false

function stored() {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}
if (SOUND) store.set({ soundOn: stored() })

function build() {
  const c = new AudioContext({ latencyHint: 'interactive' })
  const m = mixer(c)
  out = m.out
  out.gain.value = 0
  Object.assign(buses, m.buses)
  c.addEventListener('statechange', () => {
    if (c.state === 'running') started()
  })
  return c
}

function started() {
  if (!ran && ctx && out && audible()) out.gain.setValueAtTime(1, ctx.currentTime) // the first sound is heard whole
  fade()
  const due = performance.now() - 400
  for (const p of pending.splice(0)) if (p.at > due) p.fn()
  if (ran) return
  ran = true
  for (const fn of onRun) fn()
}

/** The first gesture makes the context; any gesture wakes it if it has been stopped. */
export function unlock() {
  if (!SOUND) return
  if (!ctx) ctx = build()
  if (ctx.state !== 'running' && audible()) void ctx.resume().catch(() => {})
}

if (SOUND) {
  for (const ev of ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'])
    window.addEventListener(ev, unlock, { capture: true, passive: true })
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return
    if (!document.hidden && audible()) void ctx.resume().catch(() => {})
    fade()
  })
}

const audible = () => store.get().soundOn && !document.hidden

/** A tenth of a second of silence, as a WAV: what `soundAllowed` asks the browser to play. */
function silence() {
  const n = 800
  const v = new DataView(new ArrayBuffer(44 + n * 2))
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF')
  v.setUint32(4, 36 + n * 2, true)
  text(8, 'WAVEfmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, 8000, true)
  v.setUint32(28, 16000, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  text(36, 'data')
  v.setUint32(40, n * 2, true)
  // inline, so there is nothing to fetch (or to fail to fetch) once it is refused
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...new Uint8Array(v.buffer)))}`
}

type Nav = Navigator & { userActivation?: { hasBeenActive: boolean }; getAutoplayPolicy?: (t: string) => string }

/**
 * Would the browser let the page sound without a press? Yes once the visitor has touched
 * it (a click during the loader counts); Firefox says so outright; elsewhere, a moment of
 * silence is offered to play — a browser that would block sound refuses it, quietly.
 */
export async function soundAllowed(): Promise<boolean> {
  const nav = navigator as Nav
  if (nav.userActivation?.hasBeenActive) return true
  try {
    const policy = nav.getAutoplayPolicy?.('audiocontext')
    if (policy) return policy === 'allowed'
  } catch {
    /* no such query */
  }
  const clip = new Audio(silence())
  try {
    // a busy page (the 3D compiling as it loads) can take its time to answer
    await Promise.race([clip.play(), new Promise((_, no) => setTimeout(no, 4000))])
    clip.pause()
    return true
  } catch {
    return false
  }
}

/** The visitor has touched the page (sticky activation): sound may start now. */
export const touched = () => !!(navigator as Nav).userActivation?.hasBeenActive

let sleep = 0
/** The on/off, faded: out when muted or the tab is hidden (and then the context rests). */
function fade() {
  if (!ctx || !out) return
  const on = audible()
  out.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, on ? 0.06 : 0.08)
  clearTimeout(sleep)
  if (!on) sleep = window.setTimeout(() => void ctx?.suspend().catch(() => {}), 600)
}

export function setSoundOn(on: boolean) {
  store.set({ soundOn: on })
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    /* private mode: the choice lasts the visit */
  }
  if (on) unlock()
  fade()
}

/** Run once, when sound first becomes audible. */
export function whenRunning(fn: () => void) {
  if (ran) fn()
  else onRun.push(fn)
}

/** A bus to play into, or null while the context is not running (nothing is queued). */
export function bus(name: BusName): Out | null {
  if (!ctx || ctx.state !== 'running' || !buses[name]) return null
  return { ctx, dest: buses[name].input }
}

const pending: { at: number; fn: () => void }[] = []
/**
 * A sound the visitor asked for. If the context is still waking (the very gesture that
 * woke it), it plays as soon as it runs — so the first touch is heard, never swallowed.
 */
export function play(name: BusName, fn: (o: Out) => void) {
  const o = bus(name)
  if (o) return fn(o)
  if (!ctx || !audible()) return
  pending.push({ at: performance.now(), fn: () => {
    const b = bus(name)
    if (b) fn(b)
  } })
}

export const now = () => ctx?.currentTime ?? 0

/** Dev only: which cues sounded, when (scripts check the wiring with it). */
export function note(cue: string) {
  if (!import.meta.env.DEV) return
  const w = window as unknown as { __sound?: { state: () => string; cues: [string, number][] } }
  w.__sound ??= { state: () => ctx?.state ?? 'none', cues: [] }
  w.__sound.cues.push([cue, Math.round(performance.now())])
  console.debug(`[sound] ${cue}`) // read without touching the page (scripts/debug-press.mjs)
}

// ---- the listener: the camera ----------------------------------------------------------
/**
 * Where a sound sits for the camera: `pan` −1..1 from where it is on screen, `dist` in
 * world units, `across` 0..1 left to right on screen. Set by the scene (src/sound/Ear.tsx);
 * centred until then.
 */
export type Placed = { pan: number; dist: number; across: number }
const centred: Placed = { pan: 0, dist: 28, across: 0.5 }
export const ear = {
  at: (_x: number, _y: number, _z: number): Placed => centred,
  of: (_id: string): Placed => centred,
}

/**
 * The lake's music (src/sound/music.ts): a ring asked of the water `delay` s from now,
 * somewhere the camera sees it; where it will bloom, or null. Set by the scene
 * (src/set/Illustrated.tsx: WaterBlooms).
 */
export const water = { ring: (_delay: number): [number, number, number] | null => null }

const mix = { close: 0, turn: 0, duck: 0 }
let applied = { close: NaN, turn: NaN, duck: NaN }
const beds: { bias(pan: number, at: number): void }[] = []
export const onTurn = (b: { bias(pan: number, at: number): void }) => beds.push(b)

/**
 * The mix follows the camera. `close` is 0 at the home view, → 1 zoomed right in, < 0
 * pulled back: closer, the lake at the posts and the Zeneks come forward and the hills
 * fall back and dull; further, the wind opens. `turn` (radians from home) swings the
 * lake's two sides across. `duck` dips the world while a Zenek speaks.
 */
/** How close the view is (as `listen` has it): the music follows it too (src/sound/cues.ts). */
export const closeness = () => mix.close

export function listen(close: number, turn: number) {
  mix.close = close
  mix.turn = turn
  apply()
}
export function duck(on: boolean) {
  mix.duck = on ? 1 : 0
  apply()
}

function apply() {
  if (!ctx || ctx.state !== 'running') return
  const { close, turn, duck: dk } = mix
  if (Math.abs(close - applied.close) < 0.01 && Math.abs(turn - applied.turn) < 0.01 && dk === applied.duck) return
  applied = { ...mix }
  const t = ctx.currentTime
  const c = clamp(close, -1, 1)
  const d = 1 - 0.3 * dk
  buses.near.input.gain.setTargetAtTime(LEVEL.near * (1 + 0.45 * c) * d, t, 0.25)
  buses.far.input.gain.setTargetAtTime(LEVEL.far * (1 - 0.35 * c) * d, t, 0.25)
  buses.far.tone.frequency.setTargetAtTime(c > 0 ? lerp(18000, 4200, c) : 18000, t, 0.25)
  buses.toy.input.gain.setTargetAtTime(LEVEL.toy * (1 + 0.25 * Math.max(0, c) - 0.15 * Math.max(0, -c)), t, 0.25)
  for (const b of beds) b.bias(clamp(-turn * 0.4, -0.45, 0.45), t)
}
whenRunning(() => {
  applied = { close: NaN, turn: NaN, duck: NaN }
  apply()
})
