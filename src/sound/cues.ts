import { ENTRANCE_ORDER } from '../cast/team'
import { store, type State } from '../lib/store'
import { clamp } from '../lib/anim'
import { SOUND, bus, duck, ear, note, now, onTurn, play, setSoundOn, whenRunning } from './engine'
import * as syn from './synth'
import * as rec from './samples'
import { hz } from './key'
import { PETALS_FALLING } from '../ui/TitleDust'

// What the app sounds like, and when (direction A, 2026-09-27: wood, water, air and one
// bell for the world; the Zeneks sound like toys). Nothing sounds without a reason: every
// cue answers something the app already does or the visitor's own hand — a tap, a bubble,
// a pen stroke, a gull crossing, a ring blooming on the water. The world stays a step
// below whatever the visitor sets off (owner-directed 2026-09-27).
//
// Each cue plays its recording (src/sound/samples.ts) once one is in, and its synthesised
// stand-in until then.
export { hz }

/** A Zenek's own note: its place in the entrance wave, G3 at the back up to D6 — home — for Artur, who arrives last. */
const noteOf = (id: string) => Math.max(0, ENTRANCE_ORDER.indexOf(id)) - 3

// ---- the Zeneks ---------------------------------------------------------------------------
/**
 * The bubbles, as the store tells them. A tap on a Zenek is one sound, its bubble's drop
 * (owner-directed 2026-09-28: minimal — the pitched boop and the swish of a bubble stepping
 * aside are gone); the next line takes the same drop, a little softer. The line itself is
 * read in silence (2026-09-27); when it has been read the bubble draws back with a breath.
 */
function bubbles(prev: State, s: State) {
  if (s.active === prev.active && s.said === prev.said) return
  duck(!!s.active)
  const from = prev.active
  const to = s.active
  if (to && (to !== from || s.said !== prev.said)) {
    const again = to === from
    play('toy', (o) => {
      note(`bubble:${again ? 'next' : 'in'}:${to}`)
      const t = o.ctx.currentTime + 0.01
      const pan = ear.of(to).pan
      const level = again ? 0.8 : 1
      if (!rec.shot(o, 'plip', t, { level, pan, rate: 0.98 + Math.random() * 0.04 })) syn.plip(o, t, { level: 0.9 * level, pan })
    })
  }
  else if (!to && from) {
    // read: the words go, then the bubble draws back into the speaker
    const o = bus('toy')
    if (!o) return
    note(`bubble:out:${from}`)
    syn.swish(o, o.ctx.currentTime + 0.1, { dur: 0.38, from: 2400, to: 650, q: 1.4, level: 0.05, pan: ear.of(from).pan })
  }
}

/** A touch on the water: a small splash where it landed. */
function splash(x: number, y: number, z: number) {
  play('toy', (o) => {
    const { pan, dist } = ear.at(x, y, z)
    note('splash')
    const level = clamp(30 / dist, 0.5, 1)
    if (!rec.shot(o, 'splash', o.ctx.currentTime, { pan, level, rate: 0.96 + Math.random() * 0.08 })) syn.splash(o, o.ctx.currentTime, { pan, level })
  })
}

/** The fourteen arrive, back rows first: each on its own note, a rising run that comes home on Artur's D. */
function arrive(id: string) {
  const o = bus('toy')
  if (!o) return
  const { pan } = ear.of(id)
  const last = ENTRANCE_ORDER.indexOf(id) === ENTRANCE_ORDER.length - 1
  const t = o.ctx.currentTime
  note(`arrive:${id}`)
  const low = clamp((noteOf(id) + 3) / 8, 0.55, 1) // the low notes softer and shorter: a run, not a wash
  if (rec.has('kalimba')) {
    // the recorded kalimba, tuned to each one's note: its nearest take, by playback rate
    rec.shot(o, 'kalimba', t, { hz: hz(noteOf(id)), level: last ? 1 : 0.6 * low, pan })
    if (last) rec.shot(o, 'kalimba', t + 0.01, { hz: hz(noteOf(id) - 5), level: 0.55, pan })
    return
  }
  syn.pluck(o, hz(noteOf(id)), t, { vel: last ? 0.75 : 0.55 * low, bright: 0.8, decay: last ? 1.6 : 0.55 * low, pan })
  if (last) syn.pluck(o, hz(noteOf(id) - 5), t + 0.01, { vel: 0.4, bright: 0.5, decay: 1.8, pan })
}

// ---- the controls: wood ---------------------------------------------------------------------
/** Any control but the sound's own: one delicate wooden click, placed where the button is. */
function control(pan = 0) {
  play('ui', (o) => {
    note('control')
    if (!rec.shot(o, 'click', o.ctx.currentTime, { pan, rate: 0.97 + Math.random() * 0.06, level: 0.9 + Math.random() * 0.2 })) syn.tick(o, o.ctx.currentTime, { pan })
  })
}

// ---- the title --------------------------------------------------------------------------------------
let quill: syn.Pen | null = null

/** The pen, every frame of the title: `speed` 0..1 of the hand's fastest, 0 in the air. */
function pen(speed: number) {
  const o = bus('title')
  // put down for good once the title lets go (its last frames still report a still pen)
  if (!o || store.get().dissolve || (!quill && speed <= 0)) return
  if (!quill) {
    note('pen')
    quill = syn.pen(o, o.ctx.currentTime, { take: rec.penTake() })
  }
  quill.set(speed, o.ctx.currentTime)
}
function dot() {
  const o = bus('title')
  if (!o) return
  note('dot')
  if (!rec.shot(o, 'dot', o.ctx.currentTime)) syn.dot(o, o.ctx.currentTime)
}
/**
 * The written title lets go into petals: the pen is put down, and a breath of air carries
 * them — not as the ink starts to leave, but as the petals are seen to fall (owner-directed
 * 2026-09-27; the bell that rang here is gone: it meant nothing the page could show).
 */
function letGo() {
  quill?.stop(now())
  quill = null
  const o = bus('title')
  if (!o) return
  const t = o.ctx.currentTime + PETALS_FALLING / 1000
  note('letgo')
  // a touch slower than it came: its swell lasts the fall
  if (!rec.shot(o, 'air', t, { rate: 0.85 })) syn.swish(o, t, { dur: 2.2, from: 420, to: 2600, q: 0.7, level: 0.07, pan: -0.2, panTo: 0.25 })
}

// ---- the world ------------------------------------------------------------------------------------------
let world: { beds: syn.Bed[]; timer: number; fadeIn: GainNode[] } | 'coming' | null = null
let nextBird = 0

/**
 * The lake and the hills come in as the room rises (or with the first touch), over `secs`
 * — from their recordings, given a moment to arrive (they load behind the loader).
 */
function startWorld(secs: number) {
  if (world || !['intro', 'ready'].includes(store.get().phase)) return
  world = 'coming'
  void Promise.race([rec.preload(), new Promise((r) => setTimeout(r, 2500))]).then(() => {
    world = null
    begin(secs)
  })
}
function begin(secs: number) {
  if (world) return
  const near = bus('near')
  const far = bus('far')
  if (!near || !far) return
  const t = near.ctx.currentTime
  const fadeIn = [near, far].map((o) => {
    const g = o.ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(1, t + secs)
    g.connect(o.dest)
    return g
  })
  const lake = rec.bed({ ctx: near.ctx, dest: fadeIn[0] }, 'lake', t) ?? syn.lake({ ctx: near.ctx, dest: fadeIn[0] }, t)
  const breeze = rec.bed({ ctx: far.ctx, dest: fadeIn[1] }, 'breeze', t) ?? syn.breeze({ ctx: far.ctx, dest: fadeIn[1] }, t)
  onTurn(lake)
  note('world')
  nextBird = t + 7 + Math.random() * 8
  const tick = () => {
    const at = now()
    lake.tick(at + 1.2)
    breeze.tick(at + 1.2)
    if (at > nextBird) {
      bird()
      nextBird = at + 18 + Math.random() * 32
    }
  }
  tick()
  world = { beds: [lake, breeze], timer: window.setInterval(tick, 250), fadeIn }
}

/** A bird on the hills, somewhere across the view: most often a blackbird's kind of phrase, now and then the uguisu. */
function bird() {
  const o = bus('far')
  if (!o) return
  const pan = Math.random() * 1.5 - 0.75
  const t = o.ctx.currentTime + 0.05
  note('bird')
  const uguisu = Math.random() < 0.3
  if (rec.shot(o, uguisu ? 'uguisu' : 'songbird', t, { pan, rate: 0.97 + Math.random() * 0.06 })) return
  if (uguisu) syn.uguisu(o, t, { pan, level: 0.8 })
  else {
    const d = syn.songbird(o, t, { pan })
    // sometimes it sings the phrase again, a little changed
    if (Math.random() < 0.4) syn.songbird(o, t + d + 1.2 + Math.random() * 1.5, { pan, level: 0.9 })
  }
}

type Flyer = { id: number; hum?: syn.Hum; calls: number[] }
const flyers: Record<'plane' | 'gulls', Flyer | null> = { plane: null, gulls: null }

/**
 * Something crossing the sky, every frame while it is up (src/set/Illustrated.tsx):
 * `u` 0..1 along its way, `pan` from where it is on screen. The plane hums faintly all
 * the way; the gulls call once or twice as they pass.
 */
function flyer(kind: 'plane' | 'gulls', id: number, u: number, pan: number) {
  const o = bus('far')
  let f = flyers[kind]
  if (!o || u >= 1) {
    f?.hum?.stop(now())
    flyers[kind] = null
    return
  }
  if (!f || f.id !== id) {
    f?.hum?.stop(now())
    f = flyers[kind] = { id, calls: kind === 'gulls' ? [0.18 + Math.random() * 0.1, ...(Math.random() < 0.65 ? [0.5 + Math.random() * 0.15] : [])] : [] }
    note(`flyer:${kind}`)
    if (kind === 'plane') f.hum = syn.planeHum(o, o.ctx.currentTime)
  }
  const t = o.ctx.currentTime
  if (f.hum) f.hum.set(0.5 * Math.sin(Math.PI * clamp(u, 0, 1)) ** 1.5, pan, t)
  while (f.calls.length && u >= f.calls[0]) {
    f.calls.shift()
    if (rec.shot(o, 'gulls', t, { pan, rate: 0.96 + Math.random() * 0.08 })) continue
    const n = 1 + Math.floor(Math.random() * 2)
    for (let i = 0; i < n; i++) syn.gull(o, t + i * (0.45 + Math.random() * 0.35), { pan: pan + (Math.random() - 0.5) * 0.15 })
  }
}

/** A ring about to bloom on the water: now and then — never often — a fish made it. */
let lastPlop = -1e9
function plop(x: number, y: number, z: number, delay: number) {
  const o = bus('far')
  if (!o || Math.random() > 0.25 || o.ctx.currentTime - lastPlop < 7) return
  lastPlop = o.ctx.currentTime
  const { pan, dist } = ear.at(x, y, z)
  note('plop')
  const at = o.ctx.currentTime + Math.max(0, delay)
  if (!rec.shot(o, 'fish', at, { pan, level: clamp(30 / dist, 0.3, 1) })) syn.plop(o, at, { pan, level: clamp(15 / dist, 0.12, 0.45) })
}

// ---- on and off -------------------------------------------------------------------------------------------
/** The sound's own control: a low knock as it goes quiet, the singing bowl as it comes back with the world. */
function toggle() {
  if (store.get().soundOn) {
    const o = bus('ui')
    note('toggle:off')
    if (o) syn.tok(o, hz(5), o.ctx.currentTime, { level: 0.7 })
    setSoundOn(false)
    return
  }
  setSoundOn(true)
  play('ui', (o) => {
    note('toggle:on')
    if (!rec.shot(o, 'bowl', o.ctx.currentTime + 0.03, { tuned: true })) syn.bell(o, hz(5), o.ctx.currentTime + 0.03, { kind: 'bowl', level: 0.7 })
    startWorld(2.5)
  })
}

// ---- wiring ---------------------------------------------------------------------------------------------------
if (SOUND) {
  void rec.preload() // the recordings, fetched low behind the room and decoded without a gesture
  let prev = { ...store.get() }
  store.subscribe(() => {
    const s = store.get()
    bubbles(prev, s)
    if (s.dissolve && !prev.dissolve) letGo()
    if (s.phase !== prev.phase && s.phase === 'intro') startWorld(2.6)
    prev = { ...s }
  })
  // the world comes in with the first touch, around that touch's own sound
  whenRunning(() => startWorld(3))
}

const quiet = () => {}
export const sfx = SOUND
  ? { arrive, control, splash, pen, dot, flyer, plop, toggle }
  : { arrive: quiet, control: quiet, splash: quiet, pen: quiet, dot: quiet, flyer: quiet, plop: quiet, toggle: quiet }
