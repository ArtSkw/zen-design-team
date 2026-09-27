import { clamp } from '../lib/anim'
import { mulberry32 } from '../lib/rng'

// The instruments, synthesised. They are stand-ins, drawn in the hand the finished sounds
// will have (ElevenLabs recordings, trimmed and tuned): enough to judge the timing, the key
// and the mix now, each one swappable for its recording later. Everything takes a context,
// a destination and a start time, so the same code plays live (src/sound/engine.ts) and
// renders offline for a look at its waveforms (scripts/sound-render.mjs).
//
// The palette: wood (the deck, the controls), water (the lake, the bubbles, a touch on
// the water), air (the hills, the petals), a bell (the singing bowl), and the kalimba of
// the fourteen arriving.

export type Out = { ctx: BaseAudioContext; dest: AudioNode }
type Rng = () => number

// ---- building blocks -----------------------------------------------------------------
const buffers = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>()

function cached(ctx: BaseAudioContext, key: string, make: () => AudioBuffer) {
  let m = buffers.get(ctx)
  if (!m) buffers.set(ctx, (m = new Map()))
  let b = m.get(key)
  if (!b) m.set(key, (b = make()))
  return b
}

/**
 * Noise that loops without a seam: generated a little long, its head crossfaded with what
 * follows its tail, so sample n−1 runs on into sample 0.
 */
export function noise(ctx: BaseAudioContext, kind: 'white' | 'pink' | 'brown', seconds = 4, channels = 2) {
  return cached(ctx, `${kind}${seconds}${channels}`, () => {
    const sr = ctx.sampleRate
    const n = Math.floor(sr * seconds)
    const fade = Math.floor(sr * 0.08)
    const b = ctx.createBuffer(channels, n, sr)
    for (let ch = 0; ch < channels; ch++) {
      const rng = mulberry32(1009 + ch * 7919 + kind.length)
      const d = new Float32Array(n + fade)
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0
      for (let i = 0; i < d.length; i++) {
        const w = rng() * 2 - 1
        if (kind === 'white') d[i] = w * 0.5
        else if (kind === 'pink') {
          // Paul Kellet's refined filter
          b0 = 0.99886 * b0 + w * 0.0555179
          b1 = 0.99332 * b1 + w * 0.0750759
          b2 = 0.969 * b2 + w * 0.153852
          b3 = 0.8665 * b3 + w * 0.3104856
          b4 = 0.55 * b4 + w * 0.5329522
          b5 = -0.7616 * b5 - w * 0.016898
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
          b6 = w * 0.115926
        } else {
          last = (last + 0.02 * w) / 1.02
          d[i] = last * 3.5
        }
      }
      const out = b.getChannelData(ch)
      for (let i = 0; i < n; i++) out[i] = d[i]
      for (let i = 0; i < fade; i++) {
        const u = i / fade
        out[i] = d[i] * Math.sin((u * Math.PI) / 2) + d[n + i] * Math.cos((u * Math.PI) / 2)
      }
    }
    return b
  })
}

/**
 * The one space every sound shares: an open-air tail, dark and sparse — a lake between
 * hills, not a room. Sounds are made dry and placed in it, so takes from different
 * sessions (and, later, different generations) belong to the same place.
 */
export function impulse(ctx: BaseAudioContext, seconds = 2.8) {
  return cached(ctx, `ir${seconds}`, () => {
    const sr = ctx.sampleRate
    const n = Math.floor(sr * seconds)
    const b = ctx.createBuffer(2, n, sr)
    const pre = Math.floor(sr * 0.018)
    for (let ch = 0; ch < 2; ch++) {
      const rng = mulberry32(77 + ch * 31)
      const d = b.getChannelData(ch)
      let y = 0
      for (let i = pre; i < n; i++) {
        const t = (i - pre) / sr
        const w = rng() * 2 - 1
        // air takes the highs first: a one-pole low-pass that closes as the tail ages
        const a = 0.55 * Math.exp(-t / 0.5) + 0.06
        y += a * (w - y)
        d[i] = y * Math.exp(-t / 0.42) * 0.9
      }
      // a few early reflections off the water and the deck
      for (let k = 0; k < 6; k++) {
        const at = pre + Math.floor(sr * (0.006 + rng() * 0.07))
        d[at] += (rng() < 0.5 ? -1 : 1) * (0.25 - k * 0.03)
      }
    }
    return b
  })
}

/** A gain node on the way to `o`, placed left–right. */
function voice(o: Out, level: number, pan = 0): Out {
  const g = o.ctx.createGain()
  g.gain.value = level
  if (pan) {
    const p = o.ctx.createStereoPanner()
    p.pan.value = clamp(pan, -1, 1)
    g.connect(p).connect(o.dest)
  } else g.connect(o.dest)
  return { ctx: o.ctx, dest: g }
}

function filter(o: Out, type: BiquadFilterType, freq: number, q = 0.7): Out {
  const f = o.ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  f.Q.value = q
  f.connect(o.dest)
  return { ctx: o.ctx, dest: f }
}

/** 0 → peak in `attack`, then an exponential fall with time constant `tau`. */
function strike(p: AudioParam, t: number, peak: number, attack: number, tau: number) {
  p.setValueAtTime(0, t)
  p.linearRampToValueAtTime(peak, t + attack)
  p.setTargetAtTime(0, t + attack, tau)
}

/** One sine partial of a struck thing. Returns the oscillator, for pitch moves. */
function partial(o: Out, f: number, t: number, amp: number, attack: number, tau: number, type: OscillatorType = 'sine') {
  const osc = o.ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(f, t)
  const g = o.ctx.createGain()
  g.gain.value = 0
  strike(g.gain, t, amp, attack, tau)
  osc.connect(g).connect(o.dest)
  osc.start(t)
  osc.stop(t + attack + tau * 9)
  return osc
}

/** A short burst of filtered noise: a nib, a mallet's contact, a clapper. */
function click(o: Out, t: number, amp: number, freq: number, q = 1, dur = 0.006) {
  const src = o.ctx.createBufferSource()
  src.buffer = noise(o.ctx, 'white', 1, 1)
  const bp = o.ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = freq
  bp.Q.value = q
  const g = o.ctx.createGain()
  g.gain.value = 0
  strike(g.gain, t, amp, 0.0006, dur / 3)
  src.connect(bp).connect(g).connect(o.dest)
  src.start(t, Math.random() * 0.8)
  src.stop(t + dur * 5)
}

// ---- the Zeneks: toys ----------------------------------------------------------------

/**
 * A kalimba note: a steel tine plucked by the thumb — the fundamental, a faint octave from
 * the body, the tine's high bending mode (≈ 5.9×) that dies almost at once, and the
 * thumb's contact. The pitch settles from a hair sharp. Lower notes ring longer.
 */
export function pluck(o: Out, f: number, t: number, { vel = 1, bright = 1, decay = 1, pan = 0 } = {}) {
  const v = voice(o, 0.42 * vel, pan)
  const w = filter(v, 'lowpass', Math.min(9000, f * 11), 0.5)
  const tau = clamp(0.5 * Math.sqrt(330 / f), 0.16, 1.0) * decay
  const fund = partial(w, f, t, 1, 0.002, tau)
  fund.frequency.setValueAtTime(f * 1.008, t)
  fund.frequency.exponentialRampToValueAtTime(f, t + 0.03)
  partial(w, f * 2.005, t, 0.06, 0.002, tau * 0.4)
  if (f * 5.93 < 15000) partial(w, f * 5.93, t, 0.16 * bright, 0.001, 0.045)
  click(w, t, 0.06 * bright, 3800, 1.2, 0.005)
}

// ---- water ------------------------------------------------------------------------------

/** A drop into a small bowl: a round tone whose pitch rises fast, as a drop's resonance does. */
export function plip(o: Out, t: number, { from = 880, to = 1175, dur = 0.05, level = 1, pan = 0 } = {}) {
  const v = voice(o, 0.3 * level, pan)
  const osc = partial(v, from, t, 1, 0.0015, 0.032)
  osc.frequency.exponentialRampToValueAtTime(to, t + dur)
}

/** A fish rising, somewhere out on the lake: a low bloop and a little splash. */
export function plop(o: Out, t: number, { level = 1, pan = 0 } = {}) {
  const v = voice(o, 0.15 * level, pan)
  const w = filter(v, 'lowpass', 2400, 0.5)
  const osc = partial(w, 260, t, 1, 0.002, 0.045)
  osc.frequency.exponentialRampToValueAtTime(640, t + 0.035)
  click(w, t + 0.004, 0.5, 1300, 0.8, 0.035)
}

/**
 * A fingertip on still water, close: the slap of the touch, the round bloop of the bubble
 * it pulls under (its pitch rising), a hiss of spray, and two droplets falling back.
 */
export function splash(o: Out, t: number, { level = 1, pan = 0, rng = Math.random }: { level?: number; pan?: number; rng?: Rng } = {}) {
  const k = 0.92 + rng() * 0.16
  const v = voice(o, 0.3 * level, pan)
  const w = filter(v, 'lowpass', 7000, 0.5)
  click(w, t, 0.75, 2200 * k, 0.7, 0.03)
  const bloop = partial(w, 430 * k, t + 0.008, 0.8, 0.002, 0.028)
  bloop.frequency.exponentialRampToValueAtTime(980 * k, t + 0.045)
  click(w, t + 0.004, 0.32, 4600 * k, 1, 0.16)
  for (const [at, f, a] of [[0.13 + rng() * 0.05, 1450, 0.28], [0.22 + rng() * 0.08, 1800, 0.16]]) {
    const drop = partial(w, f * k, t + at, a, 0.001, 0.014)
    drop.frequency.exponentialRampToValueAtTime(f * k * 1.45, t + at + 0.02)
  }
}

// ---- air -----------------------------------------------------------------------------------

/** Moving air: filtered noise whose band slides from `from` to `to`, swelling then fading. */
export function swish(o: Out, t: number, { dur, from, to, q = 1.2, level = 1, pan = 0, panTo = pan }: { dur: number; from: number; to: number; q?: number; level?: number; pan?: number; panTo?: number }) {
  const src = o.ctx.createBufferSource()
  src.buffer = noise(o.ctx, 'white', 1, 1)
  src.loop = true
  const bp = o.ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = q
  bp.frequency.setValueAtTime(from, t)
  bp.frequency.exponentialRampToValueAtTime(to, t + dur)
  const g = o.ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(level * 0.5, t + dur * 0.4)
  g.gain.linearRampToValueAtTime(0, t + dur)
  const p = o.ctx.createStereoPanner()
  p.pan.setValueAtTime(clamp(pan, -1, 1), t)
  p.pan.linearRampToValueAtTime(clamp(panTo, -1, 1), t + dur)
  src.connect(bp).connect(g).connect(p).connect(o.dest)
  src.start(t, Math.random() * 0.5)
  src.stop(t + dur + 0.05)
}

// ---- wood ----------------------------------------------------------------------------------

/** A small mallet on a hollow wooden block, muted: three quick modes and the contact. */
export function tok(o: Out, f: number, t: number, { level = 1, pan = 0 } = {}) {
  const v = voice(o, 0.3 * level, pan)
  const w = filter(v, 'lowpass', 3400, 0.5)
  const fund = partial(w, f, t, 1, 0.001, 0.045)
  fund.frequency.setValueAtTime(f * 1.05, t)
  fund.frequency.exponentialRampToValueAtTime(f, t + 0.012)
  partial(w, f * 2.49, t, 0.38, 0.001, 0.026)
  partial(w, f * 4.2, t, 0.16, 0.001, 0.013)
  click(w, t, 0.4, 2600, 0.9, 0.004)
}

/**
 * The controls' click: delicate, a fingertip on a small box of hard wood — two short
 * modes, the box's body under them, and the contact. A hair different every press.
 */
export function tick(o: Out, t: number, { level = 1, pan = 0, rng = Math.random }: { level?: number; pan?: number; rng?: Rng } = {}) {
  const k = 0.97 + rng() * 0.06
  const v = voice(o, 0.16 * level * (0.9 + rng() * 0.2), pan)
  const w = filter(v, 'lowpass', 7000, 0.5)
  partial(w, 1850 * k, t, 1, 0.0006, 0.0065)
  partial(w, 3150 * k, t, 0.45, 0.0005, 0.004)
  partial(w, 720 * k, t, 0.35, 0.001, 0.012)
  click(w, t, 0.5, 3600 * k, 1, 0.0025)
}

// ---- the bell --------------------------------------------------------------------------------

/**
 * A struck bell. 'glass' is a furin, the small glass wind bell: bright, a quick clapper
 * tick, a short shimmer. 'bowl' is a rin, the singing bowl: soft mallet, long, slowly
 * beating. Each partial is a pair of sines a hair apart, which is where the shimmer lives.
 */
export function bell(o: Out, f: number, t: number, { kind = 'glass', level = 1, pan = 0, rng = Math.random }: { kind?: 'glass' | 'bowl'; level?: number; pan?: number; rng?: Rng } = {}) {
  const glass = kind === 'glass'
  const v = voice(o, 0.2 * level, pan)
  const w = filter(v, 'lowpass', glass ? 11000 : 7000, 0.5)
  const ratios = glass ? [1, 2.756, 5.404, 8.933] : [1, 2.71, 5.15, 8.3]
  const amps = glass ? [1, 0.42, 0.2, 0.09] : [1, 0.5, 0.18, 0.06]
  const taus = glass ? [1.05, 0.55, 0.28, 0.15] : [2.6, 1.4, 0.7, 0.35]
  const beat = glass ? 1.1 : 1.6
  ratios.forEach((r, k) => {
    const fk = f * r
    if (fk > 16000) return
    const d = beat * (0.6 + rng() * 0.8)
    for (const s of [-1, 1]) partial(w, fk + (s * d) / 2, t, amps[k] / 2, glass ? 0.0015 : 0.006, taus[k])
  })
  if (glass) click(w, t, 0.18, 5200, 1.4, 0.004)
  else click(w, t, 0.05, 900, 0.7, 0.012)
}

// ---- the pen -----------------------------------------------------------------------------------

/**
 * A nib on cotton paper, as a texture: noise broken into grains (the paper's tooth
 * catching the nib), over a faint continuous hiss. Looped; speed plays it faster.
 */
function scratchBuffer(ctx: BaseAudioContext) {
  return cached(ctx, 'scratch', () => {
    const sr = ctx.sampleRate
    const seconds = 2
    const n = Math.floor(sr * seconds)
    const fade = Math.floor(sr * 0.05)
    const b = ctx.createBuffer(1, n, sr)
    const rng = mulberry32(4242)
    const d = new Float32Array(n + fade)
    const k = Math.exp(-1 / (0.0008 * sr))
    let e = 0
    for (let i = 0; i < d.length; i++) {
      if (rng() < 750 / sr) e += 0.25 + rng() ** 2 * 0.9
      e *= k
      d[i] = (rng() * 2 - 1) * (0.16 + e)
    }
    const out = b.getChannelData(0)
    for (let i = 0; i < n; i++) out[i] = d[i]
    for (let i = 0; i < fade; i++) {
      const u = i / fade
      out[i] = d[i] * Math.sin((u * Math.PI) / 2) + d[n + i] * Math.cos((u * Math.PI) / 2)
    }
    return b
  })
}

export type Pen = { set(speed: number, at: number): void; stop(at: number): void }

/**
 * The pen, live: silent in the air, scratching while it writes. `speed` is 0..1 of the
 * hand's fastest; faster is louder, brighter and denser, as a real nib is.
 */
export function pen(o: Out, t: number, { level = 1, take }: { level?: number; take?: { buf: AudioBuffer; level: number } | null } = {}): Pen {
  const ctx = o.ctx
  const src = ctx.createBufferSource()
  src.buffer = take?.buf ?? scratchBuffer(ctx) // a recorded pen when there is one (samples: penTake)
  const scale = take ? take.level / 0.26 : 1 // the recording at its own level, the texture at its
  src.loop = true
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = take ? 250 : 900
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 2400
  bp.Q.value = take ? 0.3 : 0.8 // a recording keeps its own colour: only a wide, gentle brightening with speed
  const g = ctx.createGain()
  g.gain.value = 0
  // the paper's body under the nib, a little below the scratch
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 650
  const gb = ctx.createGain()
  gb.gain.value = 0
  src.connect(hp).connect(bp).connect(g).connect(o.dest)
  src.connect(lp).connect(gb).connect(o.dest)
  src.start(t)
  return {
    set(speed, at) {
      const s = clamp(speed, 0, 1)
      const down = s > 0
      const a = down ? 0.26 * scale * level * s ** 0.6 : 0
      g.gain.setTargetAtTime(a, at, down ? 0.008 : 0.014)
      if (!take) gb.gain.setTargetAtTime(a * 0.5, at, down ? 0.01 : 0.016)
      bp.frequency.setTargetAtTime(1500 + 3400 * s, at, 0.02)
      src.playbackRate.setTargetAtTime(0.7 + 0.6 * s, at, 0.03)
    },
    stop(at) {
      g.gain.setTargetAtTime(0, at, 0.02)
      gb.gain.setTargetAtTime(0, at, 0.02)
      src.stop(at + 0.3)
    },
  }
}

/** The dot on the i: the pen tapped once on paper, on a desk. */
export function dot(o: Out, t: number, { level = 1 } = {}) {
  const v = voice(o, 0.25 * level)
  const w = filter(v, 'lowpass', 3000, 0.5)
  const osc = partial(w, 210, t, 1, 0.001, 0.028)
  osc.frequency.exponentialRampToValueAtTime(115, t + 0.04)
  click(w, t, 0.5, 2200, 0.8, 0.005)
}

// ---- the world: beds --------------------------------------------------------------------------

export type Bed = { tick(until: number): void; bias(pan: number, at: number): void; stop(at: number): void }

function looped(o: Out, buffer: AudioBuffer, t: number) {
  const src = o.ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  src.start(t, Math.random() * buffer.duration)
  return src
}

/**
 * The lake at the deck: small waves lapping at the posts — each lap a swell of low water
 * and a brighter slosh as it runs back — on two sides of the listener, never in step,
 * and now and then a cluck of water in a gap between the posts.
 */
export function lake(to: Out, t: number, rng: Rng = Math.random): Bed {
  const o = voice(to, 0.16)
  const ctx = o.ctx
  const low = ctx.createChannelSplitter(2)
  looped(o, noise(ctx, 'brown', 6), t).connect(low)
  const high = ctx.createChannelSplitter(2)
  looped(o, noise(ctx, 'white', 4), t).connect(high)
  const sides = [-1, 1].map((s, ch) => {
    const p = ctx.createStereoPanner()
    p.pan.value = s * 0.45
    p.connect(o.dest)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = ch ? 820 : 680
    lp.Q.value = 0.6
    const g = ctx.createGain()
    g.gain.value = 0.08
    low.connect(lp, ch)
    lp.connect(g).connect(p)
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = ch ? 1800 : 1500
    bp.Q.value = 0.8
    const gs = ctx.createGain()
    gs.gain.value = 0
    high.connect(bp, ch)
    bp.connect(gs).connect(p)
    return { p, g, gs, s, next: t + rng() * 1.4 }
  })
  let cluck = t + 2 + rng() * 5
  return {
    tick(until) {
      for (const side of sides) {
        while (side.next < until) {
          const at = side.next
          const rise = 0.3 + rng() * 0.5
          const peak = 0.3 + rng() * 0.7
          const fall = 0.8 + rng() * 1.2
          side.g.gain.setTargetAtTime(peak, at, rise / 3)
          side.g.gain.setTargetAtTime(0.07, at + rise, fall / 3)
          side.gs.gain.setTargetAtTime(peak * 0.12, at + rise * 0.8, 0.07)
          side.gs.gain.setTargetAtTime(0, at + rise + 0.12, fall / 2.5)
          side.next = at + rise + fall * (0.45 + rng() * 0.55)
        }
      }
      while (cluck < until) {
        const v = voice(o, 0.15 + rng() * 0.15, rng() * 1.2 - 0.6)
        const osc = partial(filter(v, 'lowpass', 1400), 380 + rng() * 160, cluck, 1, 0.003, 0.035)
        osc.frequency.exponentialRampToValueAtTime(230, cluck + 0.05)
        cluck += 3 + rng() * 7
      }
    },
    bias(pan, at) {
      for (const side of sides) side.p.pan.setTargetAtTime(clamp(side.s * 0.45 + pan, -1, 1), at, 0.3)
    },
    stop(at) {
      for (const side of sides) {
        side.g.gain.setTargetAtTime(0, at, 0.3)
        side.gs.gain.setTargetAtTime(0, at, 0.3)
      }
    },
  }
}

/**
 * A breeze over the hills: a wide band of air that gusts and settles on its own slow
 * clock, the band itself wandering, and the leaves' fine rustle riding on each gust.
 */
export function breeze(to: Out, t: number, rng: Rng = Math.random): Bed {
  const o = voice(to, 0.075)
  const ctx = o.ctx
  const air = ctx.createChannelSplitter(2)
  looped(o, noise(ctx, 'pink', 6), t).connect(air)
  const merge = ctx.createChannelMerger(2)
  const gust = ctx.createGain()
  gust.gain.value = 0.5
  merge.connect(gust).connect(o.dest)
  const bands = [0, 1].map((ch) => {
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 450
    bp.Q.value = 0.9
    air.connect(bp, ch)
    bp.connect(merge, 0, ch)
    return bp
  })
  const leaves = ctx.createBiquadFilter()
  leaves.type = 'highpass'
  leaves.frequency.value = 3800
  const lg = ctx.createGain()
  lg.gain.value = 0
  const lp = ctx.createStereoPanner()
  lp.pan.value = 0.3
  air.connect(leaves, 0)
  leaves.connect(lg).connect(lp).connect(o.dest)
  let next = t
  let level = 0.5
  let flutter = t
  return {
    tick(until) {
      while (next < until) {
        level = 0.12 + rng() ** 1.5 * 0.88
        gust.gain.setTargetAtTime(level, next, 1.6 + rng() * 1.8)
        const f = 260 + level * 520
        bands.forEach((bp, i) => bp.frequency.setTargetAtTime(f * (i ? 1.12 : 1), next, 2.4))
        next += 4 + rng() * 5
      }
      while (flutter < until) {
        const leafy = Math.max(0, level - 0.5) * 2
        lg.gain.setTargetAtTime(leafy * rng() * 0.18, flutter, 0.05)
        flutter += 0.08 + rng() * 0.27
      }
    },
    bias() {},
    stop(at) {
      gust.gain.setTargetAtTime(0, at, 0.3)
      lg.gain.setTargetAtTime(0, at, 0.3)
    },
  }
}

// ---- the world: things that pass ---------------------------------------------------------------

/** One whistled syllable: a sine through a pitch contour, with a trace of its octave. */
function syllable(o: Out, t: number, dur: number, contour: [number, number][], amp: number, trill = 0) {
  const g = o.ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(amp, t + Math.min(0.015, dur * 0.25))
  g.gain.setValueAtTime(amp, t + dur * 0.7)
  g.gain.linearRampToValueAtTime(0, t + dur)
  g.connect(o.dest)
  const oscs = [1, 2].map((m) => {
    const osc = o.ctx.createOscillator()
    osc.frequency.setValueAtTime(contour[0][1] * m, t)
    for (const [u, f] of contour.slice(1)) osc.frequency.linearRampToValueAtTime(f * m, t + u * dur)
    const a = o.ctx.createGain()
    a.gain.value = m === 1 ? 1 : 0.07
    osc.connect(a).connect(g)
    osc.start(t)
    osc.stop(t + dur + 0.02)
    return osc
  })
  if (trill) {
    const lfo = o.ctx.createOscillator()
    lfo.frequency.value = trill
    const depth = o.ctx.createGain()
    depth.gain.value = contour[0][1] * 0.09
    lfo.connect(depth)
    for (const osc of oscs) depth.connect(osc.frequency)
    lfo.start(t)
    lfo.stop(t + dur + 0.02)
  }
}

/** A songbird on the hills, a blackbird's kind of phrase: a few fluted notes and a twitter. */
export function songbird(o: Out, t: number, { level = 1, pan = 0, rng = Math.random }: { level?: number; pan?: number; rng?: Rng } = {}) {
  const v = voice(o, 0.045 * level, pan)
  const w = filter(v, 'lowpass', 6000, 0.5)
  const base = 1500 + rng() * 800
  const n = 3 + Math.floor(rng() * 4)
  let at = t
  for (let i = 0; i < n; i++) {
    const kind = rng()
    const f = base * (0.85 + rng() * 0.5)
    const last = i === n - 1
    if (last && rng() < 0.6) {
      syllable(w, at, 0.22, [[0, f * 1.6], [1, f * 1.3]], 0.5, 34) // the twitter at the end
      at += 0.22
    } else {
      const dur = 0.08 + rng() * 0.14
      const c: [number, number][] = kind < 0.35 ? [[0, f], [1, f * 1.35]] : kind < 0.7 ? [[0, f * 1.25], [1, f * 0.82]] : [[0, f], [0.5, f * 1.28], [1, f * 0.94]]
      syllable(w, at, dur, c, 0.8 + rng() * 0.2)
      at += dur
    }
    at += 0.035 + rng() * 0.08
  }
  return at - t
}

/** Japan's spring bird, the bush warbler (uguisu): a long held whistle, then "ho-ke-kyo". */
export function uguisu(o: Out, t: number, { level = 1, pan = 0 } = {}) {
  const v = voice(o, 0.05 * level, pan)
  const w = filter(v, 'lowpass', 6500, 0.5)
  syllable(w, t, 1.05, [[0, 1020], [0.2, 1080], [1, 1140]], 0.8)
  syllable(w, t + 1.2, 0.12, [[0, 1650], [1, 1500]], 0.9)
  syllable(w, t + 1.36, 0.07, [[0, 2650], [1, 2350]], 0.8)
  syllable(w, t + 1.48, 0.2, [[0, 2950], [0.3, 2800], [1, 1750]], 1)
  return 1.7
}

/** A gull's call, far off: "kee-ow", a reed's rasp in it. */
export function gull(o: Out, t: number, { level = 1, pan = 0, rng = Math.random }: { level?: number; pan?: number; rng?: Rng } = {}) {
  const v = voice(o, 0.085 * level, pan)
  const w = filter(filter(v, 'lowpass', 3600, 0.5), 'bandpass', 1800, 1.4)
  const k = 0.9 + rng() * 0.2
  const dur = 0.32 + rng() * 0.12
  const osc = o.ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(900 * k, t)
  osc.frequency.linearRampToValueAtTime(1500 * k, t + dur * 0.2)
  osc.frequency.linearRampToValueAtTime(1150 * k, t + dur * 0.4)
  osc.frequency.linearRampToValueAtTime(760 * k, t + dur)
  const rasp = o.ctx.createGain()
  rasp.gain.value = 0.65
  const lfo = o.ctx.createOscillator()
  lfo.type = 'square'
  lfo.frequency.value = 36
  const depth = o.ctx.createGain()
  depth.gain.value = 0.35
  lfo.connect(depth).connect(rasp.gain)
  const g = o.ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(1, t + 0.02)
  g.gain.setValueAtTime(1, t + dur * 0.6)
  g.gain.linearRampToValueAtTime(0, t + dur)
  osc.connect(rasp).connect(g).connect(w.dest)
  osc.start(t)
  osc.stop(t + dur + 0.02)
  lfo.start(t)
  lfo.stop(t + dur + 0.02)
}

export type Hum = { set(level: number, pan: number, at: number): void; stop(at: number): void }

/** A small plane, high and far: a soft propeller drone and the air it moves. */
export function planeHum(o: Out, t: number): Hum {
  const ctx = o.ctx
  const out = ctx.createGain()
  out.gain.value = 0
  const p = ctx.createStereoPanner()
  out.connect(p).connect(o.dest)
  const throb = ctx.createGain()
  throb.gain.value = 0.8
  throb.connect(out)
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 1.1
  const depth = ctx.createGain()
  depth.gain.value = 0.2
  lfo.connect(depth).connect(throb.gain)
  lfo.start(t)
  const src = looped(o, noise(ctx, 'brown', 6), t)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 320
  src.connect(lp).connect(throb)
  const saw = ctx.createOscillator()
  saw.type = 'sawtooth'
  saw.frequency.value = 94
  const sl = ctx.createBiquadFilter()
  sl.type = 'lowpass'
  sl.frequency.value = 260
  sl.Q.value = 2
  const sg = ctx.createGain()
  sg.gain.value = 0.12
  saw.connect(sl).connect(sg).connect(throb)
  saw.start(t)
  return {
    set(level, pan, at) {
      out.gain.setTargetAtTime(level * 0.22, at, 0.4)
      p.pan.setTargetAtTime(clamp(pan, -1, 1), at, 0.3)
      saw.frequency.setTargetAtTime(88 + 10 * (1 - Math.abs(pan)), at, 1)
    },
    stop(at) {
      out.gain.setTargetAtTime(0, at, 0.5)
      for (const s of [src, saw, lfo]) s.stop(at + 3)
    },
  }
}
