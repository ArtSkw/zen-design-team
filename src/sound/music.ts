import { clamp, lerp } from '../lib/anim'
import { mulberry32 } from '../lib/rng'
import { hz } from './key'
import { noise, pluck, bell, type Out } from './synth'

// Music, composed as it plays (2026-09-28; the room plays the breath, by the shō — its dials
// are in src/sound/cues.ts: CHOSEN). After (Not Boring) Vibes: nothing
// is a track; a few instruments are played by rules, in the room's own key (the yo scale on
// D, src/sound/key.ts), so it never comes round the same way twice and never asks to be
// listened to. Four moods to hear side by side (music.html), and in the room with
// `?music=postcards|felt|breath|lake`:
//
//   postcards  a soft electric piano, a few notes at a time: short phrases, each on a loop
//              of its own length, drifting in and out of step (Eno's Music for Airports;
//              the sound of Hiroshi Yoshimura's Music for Nine Post Cards)
//   felt       a felt piano, the Nordic way: a low note, a chord rolled slowly upward,
//              now and then a high answer; the chords walk D, G, Em, A, Bm
//   breath     a chord of reeds (a shō, far off) that swells and fades like a breath and
//              changes one reed at a time, as gagaku does; the singing bowl, rarely
//   lake       no score of its own: now and then the music touches the water where it can
//              be seen, and the ring that blooms there sings a kalimba note — left is low,
//              right is high, far is soft. Every note is something seen.
//
// Like the vibes app, two dials: `energy` 0..1 (how much is played) and `presence` 0..1
// (near → far: darker, wetter, quieter). `hush` thins it while a Zenek speaks.

export type Mood = 'postcards' | 'felt' | 'breath' | 'lake'
export const MOODS: Mood[] = ['postcards', 'felt', 'breath', 'lake']
export const isMood = (s: string): s is Mood => (MOODS as string[]).includes(s)

/**
 * A recorded note to play at other pitches by its rate (src/sound/samples.ts): struck (the
 * kalimba, the bowl: `gain` brings its peak to 1) or held (a reed: `rms`, its loudness).
 */
export type Sample = { buf: AudioBuffer; hz: number; gain: number; start: number; end: number; rms?: number }
/** The recordings a mood may play instead of its synthesised voices: the lake's kalimba, the breath's reeds and bowl. */
export type Kit = { kalimba?: Sample[]; bowl?: Sample[]; reed?: Sample[] }

/** A note as it sounds, for drawing (music.html): its pitch, strength, how long it rings, and for the lake, where. */
export type Heard = { at: number; f: number; vel: number; len: number; kind: 'tine' | 'felt' | 'reed' | 'bowl' | 'kalimba'; x?: number; depth?: number }

export type Music = {
  mood: Mood
  /** Schedule what is due up to `until` (the room calls it four times a second, 1.2 s ahead). */
  tick(until: number): void
  set(p: Partial<{ energy: number; presence: number; hush: boolean }>, at: number): void
  stop(at: number): void
}

/**
 * The lake: a ring asked of the water `delay` s from now, somewhere it can be seen. Where
 * it will bloom — `across` 0..1 the view, `depth` 0 near … 1 far — or null if no water
 * is in view.
 */
export type Water = (delay: number) => { across: number; depth: number; pan?: number } | null

type Opts = { seed?: number; energy?: number; presence?: number; kit?: Kit; heard?: (h: Heard) => void; water?: Water }
type Rng = () => number

// ---- building blocks ----------------------------------------------------------------------
const cache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer | PeriodicWave>>()
function cached<T extends AudioBuffer | PeriodicWave>(c: BaseAudioContext, key: string, make: () => T): T {
  let m = cache.get(c)
  if (!m) cache.set(c, (m = new Map()))
  if (!m.has(key)) m.set(key, make())
  return m.get(key) as T
}

/**
 * The music's own space: a long, dark hall, wider and slower than the room's open air
 * (src/sound/synth.ts: impulse) — the music is not in the room, it is around it.
 */
function hall(c: BaseAudioContext) {
  return cached(c, 'hall', () => {
    const sr = c.sampleRate
    const n = Math.floor(sr * 6)
    const pre = Math.floor(sr * 0.028)
    const b = c.createBuffer(2, n, sr)
    for (let ch = 0; ch < 2; ch++) {
      const rng = mulberry32(501 + ch * 97)
      const d = b.getChannelData(ch)
      let y = 0
      for (let i = pre; i < n; i++) {
        const t = (i - pre) / sr
        const a = 0.3 * Math.exp(-t / 1.1) + 0.035 // the highs go first
        y += a * (rng() * 2 - 1 - y)
        d[i] = y * Math.exp(-t / 0.95) * Math.min(1, t / 0.06) // a soft swell in, no early slap
      }
    }
    return b
  })
}

/** A partial series as a wave, for instruments whose tone does not change as they ring. */
function wave(c: BaseAudioContext, key: string, amps: number[]) {
  return cached(c, key, () => {
    const real = new Float32Array(amps.length + 1)
    const imag = new Float32Array(amps.length + 1)
    amps.forEach((a, k) => (imag[k + 1] = a))
    return c.createPeriodicWave(real, imag)
  })
}

function place(o: Out, pan: number) {
  const g = o.ctx.createGain()
  if (!pan) return (g.connect(o.dest), g)
  const p = o.ctx.createStereoPanner()
  p.pan.value = clamp(pan, -1, 1)
  g.connect(p).connect(o.dest)
  return g
}

function osc(c: BaseAudioContext, f: number, t: number, end: number, type: OscillatorType = 'sine') {
  const s = c.createOscillator()
  s.type = type
  s.frequency.value = f
  s.start(t)
  s.stop(end)
  return s
}

// ---- the instruments ----------------------------------------------------------------------------
type Hand = { release(at: number): void }

/**
 * An electric piano's tine: a sine whose bark (frequency modulation at the note's own
 * pitch) fades fast into a pure, long tone, and a faint metallic tick as it is struck.
 * Lower notes ring longer. Returns how long it is heard.
 */
function tine(o: Out, f: number, t: number, vel: number, pan: number) {
  const c = o.ctx
  const env = c.createGain()
  env.connect(place(o, pan))
  const tau = clamp(1.7 * Math.sqrt(262 / f), 0.7, 3.2)
  const end = t + 0.005 + tau * 7
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(0.3 * vel, t + 0.005)
  env.gain.setTargetAtTime(0, t + 0.005, tau)
  const car = osc(c, f, t, end)
  const mod = osc(c, f, t, end)
  const depth = c.createGain()
  depth.gain.setValueAtTime(f * (0.35 + 1.3 * vel), t)
  depth.gain.setTargetAtTime(f * 0.05, t, 0.2)
  mod.connect(depth).connect(car.frequency)
  car.connect(env)
  const tick = c.createGain()
  tick.gain.setValueAtTime(0, t)
  tick.gain.linearRampToValueAtTime(0.035 * vel, t + 0.002)
  tick.gain.setTargetAtTime(0, t + 0.002, 0.05)
  tick.connect(env)
  osc(c, f * 6.97, t, t + 0.5).connect(tick)
  return tau * 3
}

/**
 * A felt piano note: two strings a few cents apart (the slow beat of a real unison),
 * struck a seventh of the way along (the partials that position leaves out), through a
 * tone that closes as the note rings, as a piano's upper partials die first; the hammer's
 * felt, a soft knock. The damper takes it on `release` (the pedal, lifted).
 */
function felt(o: Out, f: number, t: number, vel: number, pan: number, rng: Rng): Hand & { len: number } {
  const c = o.ctx
  const damper = c.createGain()
  damper.connect(place(o, pan))
  const env = c.createGain()
  env.connect(damper)
  const tone = c.createBiquadFilter()
  tone.type = 'lowpass'
  tone.Q.value = 0.35
  tone.frequency.setValueAtTime(Math.min(12000, 500 + 2600 * vel + f * 2), t)
  tone.frequency.setTargetAtTime(Math.max(260, f * 1.6), t + 0.02, 0.7)
  tone.connect(env)
  const peak = 0.34 * vel
  const prompt = clamp(0.3 * Math.sqrt(262 / f), 0.12, 0.5)
  const after = clamp(5 * Math.sqrt(220 / f), 1.5, 8)
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(peak, t + 0.008)
  env.gain.setTargetAtTime(peak * 0.3, t + 0.008, prompt)
  env.gain.setTargetAtTime(0, t + 0.9, after)
  const end = t + 0.9 + after * 4.5
  const struck = wave(c, 'felt', Array.from({ length: 16 }, (_, i) => Math.abs(Math.sin((Math.PI * (i + 1)) / 7)) / (i + 1) ** 1.6))
  const strings = [-1, 1].map((s) => {
    const n = c.createOscillator()
    n.setPeriodicWave(struck)
    n.frequency.value = f
    n.detune.value = s * (1.6 + rng() * 1.4)
    n.connect(tone)
    n.start(t)
    n.stop(end)
    return n
  })
  // the hammer's felt
  const knock = c.createBufferSource()
  knock.buffer = noise(c, 'pink', 1, 1)
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 260 + f * 0.8
  const kg = c.createGain()
  kg.gain.setValueAtTime(0, t)
  kg.gain.linearRampToValueAtTime(0.1 * vel, t + 0.003)
  kg.gain.setTargetAtTime(0, t + 0.003, 0.014)
  knock.connect(lp).connect(kg).connect(env)
  knock.start(t, rng() * 0.8)
  knock.stop(t + 0.15)
  return {
    len: Math.min(after * 1.5, 6),
    release(at) {
      if (at >= end) return
      damper.gain.setTargetAtTime(0, at, 0.4)
      for (const s of strings)
        try {
          s.stop(at + 2.5)
        } catch {
          /* already told to stop */
        }
    },
  }
}

/**
 * A reed of the shō: a steady tone rich in partials, swelling in over `swell`, held, and
 * let go over `fade`; its pitch wanders by a cent or two and its breath is never quite
 * even. Played in chords, several at once.
 */
function reed(o: Out, f: number, t: number, { swell, hold, fade, level, pan, rng }: { swell: number; hold: number; fade: number; level: number; pan: number; rng: Rng }) {
  const c = o.ctx
  const end = t + swell + hold + fade * 1.4
  const amp = c.createGain()
  amp.connect(place(o, pan))
  amp.gain.setValueAtTime(0, t)
  amp.gain.setTargetAtTime(level, t, swell / 3.5)
  amp.gain.setTargetAtTime(0, t + swell + hold, fade / 4.5)
  const tremble = c.createGain()
  tremble.connect(amp)
  const tone = c.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 1700
  tone.Q.value = 0.4
  tone.connect(tremble)
  const n = c.createOscillator()
  n.setPeriodicWave(wave(c, 'reed', [1, 0.45, 0.32, 0.17, 0.1, 0.05, 0.03]))
  n.frequency.value = f
  n.detune.value = (rng() - 0.5) * 8
  n.connect(tone)
  n.start(t)
  n.stop(end)
  // the drift of its pitch, and the unevenness of the breath
  const drift = osc(c, 0.05 + rng() * 0.06, t, end)
  const dg = c.createGain()
  dg.gain.value = 2.5
  drift.connect(dg).connect(n.detune)
  const sway = osc(c, 0.13 + rng() * 0.17, t, end)
  const sg = c.createGain()
  sg.gain.value = 0.1
  tremble.gain.value = 0.9
  sway.connect(sg).connect(tremble.gain)
  return end - t
}

/** The breath through the reeds: a little band of air under a chord, on its envelope. */
function air(o: Out, t: number, { swell, hold, fade, level }: { swell: number; hold: number; fade: number; level: number }) {
  const c = o.ctx
  const src = c.createBufferSource()
  src.buffer = noise(c, 'pink', 4, 2)
  src.loop = true
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1500
  bp.Q.value = 0.6
  const g = c.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.setTargetAtTime(level, t, swell / 3.5)
  g.gain.setTargetAtTime(0, t + swell + hold, fade / 4.5)
  src.connect(bp).connect(g).connect(o.dest)
  src.start(t, Math.random() * 3)
  src.stop(t + swell + hold + fade * 1.4)
}

const nearest = (list: Sample[], f: number) => list.reduce((a, b) => (Math.abs(Math.log(b.hz / f)) < Math.abs(Math.log(a.hz / f)) ? b : a))

/** A recorded note (the kalimba, the bowl) at another pitch, by the nearest take's rate. */
function sampled(o: Out, list: Sample[], f: number, t: number, vel: number, pan: number, bright = 1) {
  const s = nearest(list, f)
  const rate = f / s.hz
  const c = o.ctx
  const src = c.createBufferSource()
  src.buffer = s.buf
  src.playbackRate.value = rate
  const g = c.createGain()
  const len = (s.end - s.start) / rate
  const peak = vel * s.gain
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(peak, t + 0.002)
  g.gain.setValueAtTime(peak, t + len - 0.05)
  g.gain.linearRampToValueAtTime(0, t + len)
  let into: AudioNode = place(o, pan)
  if (bright < 1) {
    const lp = c.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 1800 + 9000 * bright * bright
    lp.connect(into)
    into = lp
  }
  src.connect(g).connect(into)
  src.start(t, s.start)
  src.stop(t + len + 0.02)
  return len
}

/** Each held take brought to this loudness (RMS) at level 1: a synthesised reed's own, so either sits in the mix alike. */
const HELD_RMS = 0.05

/**
 * A recorded reed, held (the breath's, in place of `reed`): the take nearest the note,
 * tuned by its rate, under the same swell, hold and fade. A take is only a few seconds
 * long, so it is held as the lake's bed is (samples.ts: bed) — stretches of it from
 * anywhere in the take, each fading into the next — which also hides any seam its loop
 * has. It takes three numbers from `rng`, as `reed` does, so a seed plays the same music
 * whichever instrument plays it.
 */
function held(o: Out, list: Sample[], f: number, t: number, { swell, hold, fade, level, pan, rng }: { swell: number; hold: number; fade: number; level: number; pan: number; rng: Rng }) {
  const s = nearest(list, f)
  const c = o.ctx
  const r1 = rng()
  const r2 = rng()
  const own = mulberry32(Math.floor(rng() * 2 ** 32))
  const rate = (f / s.hz) * 2 ** ((r1 - 0.5) * 6 / 1200) // a few cents either way, as a reed is never quite true
  const end = t + swell + hold + fade * 1.4
  const amp = c.createGain()
  amp.connect(place(o, pan))
  const peak = (level / 0.11) * (HELD_RMS / Math.max(1e-4, s.rms ?? 0.1))
  amp.gain.setValueAtTime(0, t)
  amp.gain.setTargetAtTime(peak, t, swell / 3.5)
  amp.gain.setTargetAtTime(0, t + swell + hold, fade / 4.5)
  // stretches of the take (in its own seconds), crossfaded (in the room's)
  const from = s.start + 0.15
  const usable = s.end - 0.15 - from
  const xf = 1.2
  const n = 32
  const up = new Float32Array(n)
  const down = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    up[i] = Math.sin(((i / (n - 1)) * Math.PI) / 2)
    down[i] = Math.cos(((i / (n - 1)) * Math.PI) / 2)
  }
  let u = t
  let first = true
  while (u < end) {
    const len = Math.min(usable, 4 + own() * 3)
    const at = from + (first ? r2 : own()) * Math.max(0, usable - len)
    const dur = len / rate
    const src = c.createBufferSource()
    src.buffer = s.buf
    src.playbackRate.value = rate
    const g = c.createGain()
    g.gain.value = 0
    if (first) g.gain.setValueAtTime(1, u)
    else g.gain.setValueCurveAtTime(up, u, xf)
    g.gain.setValueCurveAtTime(down, u + dur - xf, xf)
    src.connect(g).connect(amp)
    src.start(u, at)
    src.stop(u + dur + 0.02)
    u += dur - xf
    first = false
  }
  return end - t
}

// ---- the moods ----------------------------------------------------------------------------------
type Voice = { at: number; fire(at: number): void }
type Ctx = {
  o: Out
  rng: Rng
  s: { energy: number; hush: boolean }
  kit: Kit
  heard: (h: Heard) => void
  /** Too many notes lately? (the melodic ones; the bass and the bowl do not count) */
  busy(at: number, max: number, span?: number): boolean
  sounded(at: number): void
}

const pick = <T,>(rng: Rng, weighted: [T, number][]) => {
  let r = rng() * weighted.reduce((a, [, w]) => a + w, 0)
  for (const [v, w] of weighted) if ((r -= w) <= 0) return v
  return weighted[weighted.length - 1][0]
}
/** Left low, right high — a piano seen from its bench, gently. */
const panOf = (deg: number) => clamp((deg - 3) / 14, -0.45, 0.45)

/**
 * Postcards. Five phrases of one to three notes, each repeating on a loop of its own
 * length (17–38 s, none a multiple of another), so they fall into ever new patterns; and
 * under them, rarely, a low note. Energy wakes more of the phrases and shortens the loops.
 * The first phrase starts on D5, so the music grows out of the arrival's last note.
 */
function postcards(x: Ctx, t0: number): Voice[] {
  const { rng, s } = x
  const periods = [17.3, 19.7, 23.1, 25.3, 29.3, 31.7, 34.1, 37.9].sort(() => rng() - 0.5)
  const voices: Voice[] = []
  for (let i = 0; i < 5; i++) {
    const start = i === 0 ? 5 : 2 + Math.floor(rng() * 8) // G4 … B5
    const count = pick(rng, [[1, 0.35], [2, 0.45], [3, 0.2]])
    const notes = [start]
    for (let k = 1; k < count; k++) notes.push(clamp(notes[k - 1] + pick(rng, [[-1, 0.45], [-2, 0.2], [1, 0.25], [2, 0.1]]), 0, 10))
    const gaps = notes.map(() => 0.45 + rng() * 0.6)
    const period = periods[i]
    const vel = notes.map(() => 0.34 + rng() * 0.16)
    voices.push({
      at: t0 + (i === 0 ? 1.2 : 4 + rng() * period * 0.9),
      fire(at) {
        this.at = at + period * lerp(1.25, 0.8, s.energy)
        const awake = 2 + Math.round(3 * s.energy)
        if (i >= awake || (s.hush && rng() < 0.75) || x.busy(at, 2 + Math.round(2 * s.energy), 2.5)) return
        let u = at
        notes.forEach((d, k) => {
          const f = hz(d)
          const len = tine(x.o, f, u, vel[k] * (0.92 + rng() * 0.16), panOf(d))
          x.heard({ at: u, f, vel: vel[k], len, kind: 'tine' })
          x.sounded(u)
          u += gaps[k] * (0.94 + rng() * 0.12)
        })
      },
    })
  }
  // the low note: D2, G2, A2, E2 — a slow walk, one step a loop
  const lows = [-10, -8, -10, -7, -10, -9]
  let li = 0
  voices.push({
    at: t0 + 0.3,
    fire(at) {
      this.at = at + 43 + rng() * 12
      if (s.hush) return
      const d = lows[li++ % lows.length]
      const len = tine(x.o, hz(d), at, 0.3, -0.15)
      x.heard({ at, f: hz(d), vel: 0.3, len, kind: 'tine' })
    },
  })
  return voices
}

/**
 * Felt. A chord at a time, 9–16 s each: its low note, then the chord rolled slowly
 * upward, sometimes only a note of it; now and then, halfway, a high answer. The pedal is
 * lifted as the next chord comes, so the chords never smear into one another.
 */
function feltPiano(x: Ctx, t0: number): Voice[] {
  const { rng, s } = x
  // in the room's key (D E G A B), open and plain: sus and add chords, no thirds stacked
  const CHORDS: Record<string, { low: number; up: number[]; next: [string, number][] }> = {
    D: { low: -10, up: [-2, 0, 1], next: [['G', 3], ['Em', 2], ['A', 1.5], ['Bm', 1]] }, // Dsus2
    G: { low: -8, up: [-1, 0, 3], next: [['D', 3], ['Em', 2], ['Bm', 1]] }, // Gadd9
    Em: { low: -9, up: [-1, 0, 2], next: [['G', 2.5], ['A', 2], ['D', 2]] }, // Em7
    A: { low: -7, up: [-3, 0, 1], next: [['D', 3], ['G', 1.5], ['Em', 1]] }, // A7sus4
    Bm: { low: -6, up: [-2, 0, 1], next: [['G', 3], ['Em', 1.5], ['D', 1]] }, // Bm11
  }
  let chord = 'D'
  let held: Hand[] = []
  let top = 5
  const play = (d: number, at: number, vel: number) => {
    const f = hz(d)
    const n = felt(x.o, f, at, vel, d < 0 ? panOf(d) * 0.3 : panOf(d), rng) // the low notes near the middle: a piano heard, not sat at
    held.push(n)
    x.heard({ at, f, vel, len: n.len, kind: 'felt' })
    return n
  }
  return [
    {
      at: t0 + 0.8,
      fire(at) {
        const c = CHORDS[chord]
        const len = lerp(16, 9, s.energy) * (0.85 + rng() * 0.3)
        this.at = at + len
        for (const h of held) h.release(at - 0.05)
        held = []
        play(c.low, at, 0.42 + rng() * 0.08)
        if (!s.hush) {
          const sparse = rng() < 0.25
          let u = at + 0.5 + rng() * 0.4
          for (const d of c.up) {
            if (sparse ? d !== c.up[c.up.length - 1] : rng() > 0.78 + 0.2 * s.energy) continue
            play(d, u, 0.24 + rng() * 0.12)
            u += 0.7 + rng() * 0.6
          }
          if (rng() < 0.35 + 0.4 * s.energy) {
            // the answer: a note or two up high, stepping from the last one
            const at2 = at + len * (0.45 + rng() * 0.15)
            top = clamp(top + pick(rng, [[-1, 3], [1, 2], [-2, 1], [2, 1], [0, 0.5]]), 4, 9)
            play(top, at2, 0.2 + rng() * 0.1)
            if (rng() < 0.4) play(top - 1, at2 + 0.8 + rng() * 0.5, 0.17 + rng() * 0.06)
          }
        }
        chord = pick(rng, c.next)
      },
    },
  ]
}

/**
 * Breath. A chord of four reeds swells in (5–8 s), holds, and fades (6–9 s); the next
 * keeps two or three of its reeds and moves the rest, so the harmony turns slowly, never
 * jumps. A rest follows each breath, longer at low energy. The bowl, far off, rarely.
 */
function breath(x: Ctx, t0: number): Voice[] {
  const { rng, s } = x
  // aitake, the shō's clusters, in the room's key
  const CLUSTERS = [[0, 3, 4, 5], [3, 4, 5, 6], [2, 3, 5, 6], [1, 3, 4, 6], [0, 1, 3, 4], [2, 4, 5, 6], [1, 2, 3, 5], [3, 5, 6, 7]]
  let now = CLUSTERS[0] // D4 A4 B4 D5: the arrival's D, held
  const next = () => {
    const shared = (a: number[], b: number[]) => a.filter((d) => b.includes(d)).length
    const near = CLUSTERS.filter((c) => c !== now && shared(c, now) >= 2)
    now = pick(rng, near.map((c) => [c, shared(c, now) === 3 ? 3 : 1] as [number[], number]))
    return now
  }
  let first = true
  const voices: Voice[] = [
    {
      at: t0 + 0.4,
      fire(at) {
        const swell = 5 + rng() * 3
        const hold = 1.5 + rng() * 2.5
        const fade = 6 + rng() * 3
        // never a wall of sound: each breath is let go before the next, and a rest follows
        const rest = lerp(6, 2, s.energy) + rng() * lerp(8, 4, s.energy)
        this.at = at + swell + hold + fade * 0.85 + rest
        const chord = first ? now : next()
        first = false
        const level = (s.hush ? 0.5 : 1) * 0.11
        const recorded = x.kit.reed?.length ? x.kit.reed : null
        chord.forEach((d, k) => {
          const f = hz(d)
          const how = { swell, hold, fade, level: 0, pan: panOf(d) * 1.4, rng }
          const u = at + rng() * 0.6
          how.level = level * (0.8 + rng() * 0.4) * (k === 0 ? 1.15 : 1)
          const len = recorded ? held(x.o, recorded, f, u, how) : reed(x.o, f, u, how)
          x.heard({ at: at + swell * 0.5, f, vel: 0.35, len: len * 0.6, kind: 'reed' })
        })
        if (!recorded) air(x.o, at, { swell, hold, fade, level: level * 0.1 }) // a recorded reed has its own breath
      },
    },
    {
      at: t0 + 20 + rng() * 15,
      fire(at) {
        this.at = at + (40 + rng() * 40) * lerp(1.3, 0.8, s.energy)
        if (s.hush) return
        const f = hz(rng() < 0.7 ? 7 : 8) // G5 or A5: the bowl's own pitch is between them
        const pan = (rng() - 0.5) * 1
        const len = x.kit.bowl?.length ? sampled(x.o, x.kit.bowl, f, at, 0.3, pan, 0.6) : (bell(x.o, f, at, { kind: 'bowl', level: 0.45, pan }), 6)
        x.heard({ at, f, vel: 0.3, len, kind: 'bowl' })
      },
    },
  ]
  return voices
}

/**
 * The lake. Every few seconds (fewer at low energy) a ring is asked of the water where it
 * can be seen, and its note sounds as it blooms: across the view is pitch (A3 … E5, never
 * the same note twice running), distance is softness and shade. No water in view, no note.
 */
function lakeSong(x: Ctx, t0: number, water: Water): Voice[] {
  const { rng, s } = x
  let last = 99
  return [
    {
      at: t0 + 1.5,
      fire(at) {
        const gap = lerp(7, 2.8, s.energy) * (0.6 + rng() * 0.8)
        const spot = s.hush ? null : water(Math.max(0, at - x.o.ctx.currentTime))
        this.at = at + (spot || s.hush ? gap : 0.8) // no water in view: look again soon
        if (!spot) return
        let d = Math.round(lerp(-2, 6, clamp(spot.across, 0, 1)))
        if (d === last) d += d >= 6 ? -1 : rng() < 0.5 ? -1 : 1
        last = d
        const f = hz(d)
        const depth = clamp(spot.depth, 0, 1)
        const vel = lerp(0.62, 0.26, depth)
        const pan = spot.pan ?? (spot.across - 0.5) * 1.1
        const len = x.kit.kalimba?.length ? sampled(x.o, x.kit.kalimba, f, at, vel, pan, lerp(1, 0.35, depth)) : (pluck(x.o, f, at, { vel: vel * 0.8, bright: lerp(0.8, 0.3, depth), decay: 1.2, pan }), 1.2)
        x.heard({ at, f, vel, len, kind: 'kalimba', x: spot.across, depth })
      },
    },
  ]
}

// ---- the player -----------------------------------------------------------------------------------
/**
 * Each mood brought to the same loudness at the default dials: −40 LUFS through the mix, a
 * step below the world's lake and breeze (−38) and far below anything the visitor sets off
 * (scripts/sound-render.mjs `music-*`, then scripts/loudness.py). `mlevel` moves them all.
 */
const TRIM: Record<Mood, number> = { postcards: 0.53, felt: 0.38, breath: 0.16, lake: 0.32 }

/**
 * The music, from `t0`, into `o` (its bus): the mood's voices through the dials — a tone
 * (presence closes it), the hall (presence opens it), a level, the hush — and a fade in.
 */
export function music(o: Out, mood: Mood, t0: number, { seed = Math.floor(Math.random() * 1e9), energy = 0.3, presence = 0.35, kit = {}, heard = () => {}, water }: Opts = {}): Music {
  const c = o.ctx
  const s = { energy: clamp(energy, 0, 1), presence: clamp(presence, 0, 1), hush: false }
  const fade = c.createGain()
  fade.gain.setValueAtTime(0, t0)
  fade.gain.linearRampToValueAtTime(1, t0 + 2)
  fade.connect(o.dest)
  const hush = c.createGain()
  hush.connect(fade)
  const level = c.createGain()
  level.connect(hush)
  const trim = TRIM[mood]
  const input = c.createGain()
  const tone = c.createBiquadFilter()
  tone.type = 'lowpass'
  tone.Q.value = 0.5
  const dry = c.createGain()
  const send = c.createGain()
  const verb = c.createConvolver()
  verb.buffer = hall(c)
  input.connect(tone)
  tone.connect(dry).connect(level)
  tone.connect(send).connect(verb).connect(level)
  // the lake's notes are the room's own: less of the music's hall, more of the open air (mix: SEND)
  const hallAmount = mood === 'lake' ? 0.45 : 1
  const dial = (at: number, tau = 0.4) => {
    const p = s.presence
    tone.frequency.setTargetAtTime(14000 * (2200 / 14000) ** p, at, tau)
    dry.gain.setTargetAtTime(lerp(1, 0.3, p), at, tau)
    send.gain.setTargetAtTime(lerp(0.35, 1.1, p) * hallAmount, at, tau)
    level.gain.setTargetAtTime(lerp(1, 0.72, p) * trim, at, tau)
    hush.gain.setTargetAtTime(s.hush ? 0.5 : 1, at, s.hush ? 0.3 : 1.2)
  }
  dial(t0, 0.01)

  const recent: number[] = []
  const x: Ctx = {
    o: { ctx: c, dest: input },
    rng: mulberry32(seed),
    s,
    kit,
    heard,
    busy(at, max, span = 2.5) {
      while (recent.length && recent[0] < at - span) recent.shift()
      return recent.length >= max
    },
    sounded(at) {
      recent.push(at)
    },
  }
  // (with no water to ask — an offline render — anywhere will do)
  const anywhere: Water = () => ({ across: x.rng(), depth: x.rng() })
  const voices = mood === 'postcards' ? postcards(x, t0) : mood === 'felt' ? feltPiano(x, t0) : mood === 'breath' ? breath(x, t0) : lakeSong(x, t0, water ?? anywhere)
  let stopped = false

  return {
    mood,
    tick(until) {
      if (stopped) return
      for (;;) {
        let v: Voice | null = null
        for (const w of voices) if (!v || w.at < v.at) v = w
        if (!v || v.at >= until) return
        v.fire(v.at)
      }
    },
    set(p, at) {
      if (p.energy != null) s.energy = clamp(p.energy, 0, 1)
      if (p.presence != null) s.presence = clamp(p.presence, 0, 1)
      if (p.hush != null) s.hush = p.hush
      dial(at)
    },
    stop(at) {
      stopped = true
      fade.gain.cancelScheduledValues(at)
      fade.gain.setTargetAtTime(0, at, 0.8)
      setTimeout(() => fade.disconnect(), Math.max(0, (at - c.currentTime) * 1000) + 7000)
    },
  }
}
