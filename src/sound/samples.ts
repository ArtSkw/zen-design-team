import { clamp } from '../lib/anim'
import { SWELL, type Bed, type Out } from './synth'
import { inKey } from './key'

// Recorded sounds (ElevenLabs, auditioned and picked: docs/sound/prompts.json) in place of
// the synthesised stand-ins, cue by cue. Nothing is re-encoded: each take is played as it
// came, trimmed to where it sounds, brought to its cue's level by its measured peak (or its
// loudness, for the beds) and tuned by its playback rate. Until a cue's takes are in, the
// stand-in plays. The published picks are public/sound/picks.json; in development,
// `?take=lake:3,splash:3+5` tries takes straight from sound-raw/ (scripts/sfx.mjs), and
// `?take=none` plays the stand-ins only.

/** A take as measured (scripts/sfx-look.py); `level` evens it with its cue's other takes, by ear-weighted loudness (scripts/loudness.py). */
export type Take = { file: string; seconds: number; peak: number; rms: number; loop: boolean; start: number; end: number; hz?: number; level?: number }
type Loaded = { take: Take; buf: AudioBuffer; n: number } // n: its place among the cue's picks

/**
 * Each cue's level as it leaves its voice, before its bus (engine: LEVEL, and the master):
 * one-shots by peak, beds by loudness (RMS) — the balance set by ear on 2026-09-27: what
 * the visitor sets off, then a step down, the world.
 */
export const TARGET = {
  click: 0.21, splash: 0.27, plip: 0.32, bowl: 0.26, // what the visitor sets off
  pen: 0.2, dot: 0.11, air: 0.1, kalimba: 0.44, // the intro
  fish: 0.066, songbird: 0.046, uguisu: 0.05, gulls: 0.053, // the world, passing (their echo adds to their peaks)
  lake: 0.0116, breeze: 0.053, // the world, always (RMS of the take; the breeze's is mostly the rumble it loses)
} as const // calibrated through the mix, 2026-09-27 (scripts/sound-render.mjs: takes, takebed)
export type Cue = keyof typeof TARGET

const loaded = new Map<string, Loaded[]>()
const turn = new Map<string, number>()
let loading: Promise<void> | null = null

async function json<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url)
    return r.ok ? ((await r.json()) as T) : null
  } catch {
    return null
  }
}

/** Which takes play, and from where: the published picks, and in development any tried instead. */
async function choose(): Promise<{ url: string; take: Take; cue: string }[]> {
  const base = `${import.meta.env.BASE_URL}sound/`
  const out: { url: string; take: Take; cue: string }[] = []
  const tried = import.meta.env.DEV ? new URLSearchParams(location.search).get('take') : null
  if (tried === 'none') return out
  const picks = (await json<Record<string, Take[]>>(`${base}picks.json`)) ?? {}
  const trying = new Set<string>()
  if (tried) {
    const index = (await json<Record<string, Record<string, Take>>>('/sound-raw/index.json')) ?? {}
    for (const part of tried.split(',')) {
      const [cue, ns] = part.split(':')
      for (const n of ns?.split(/[+ ]/) ?? []) { // (a + in an address arrives as a space)
        const take = index[cue]?.[n]
        if (take) (trying.add(cue), out.push({ cue, take, url: `/sound-raw/${cue}/${take.file}` }))
      }
    }
  }
  for (const [cue, takes] of Object.entries(picks)) if (!trying.has(cue)) for (const take of takes) out.push({ cue, take, url: base + take.file })
  return out
}

/**
 * Fetch and decode every take — early, behind the loader: decoding needs no gesture on an
 * OfflineAudioContext, and a buffer plays in any context.
 */
export function preload() {
  loading ??= (async () => {
    if (typeof OfflineAudioContext === 'undefined') return
    const list = await choose()
    const decoder = new OfflineAudioContext(2, 1, 44100)
    await Promise.all(
      list.map(async ({ cue, take, url }, n) => {
        try {
          const bytes = await (await fetch(url, { priority: 'low' })).arrayBuffer() // never ahead of the room itself
          const buf = await decoder.decodeAudioData(bytes)
          loaded.set(cue, [...(loaded.get(cue) ?? []), { take, buf, n }].sort((a, b) => a.n - b.n)) // in the picks' order, however they arrive
        } catch {
          /* this take stays silent: its cue keeps its stand-in */
        }
      }),
    )
  })()
  return loading
}

export const has = (cue: Cue) => loaded.has(cue)

/** A cue's takes as notes to play at any pitch (the music: src/sound/music.ts), each brought to a peak of 1 (and its loudness known, for held notes). */
export const notes = (cue: string) =>
  (loaded.get(cue) ?? []).filter((s) => s.take.hz).map(({ take, buf }) => ({ buf, hz: take.hz!, gain: (take.level ?? 1) / Math.max(1e-4, take.peak), start: take.start, end: take.end, rms: take.rms / (take.level ?? 1) }))

/** The cue's takes in turn, so a sound heard twice is two takes where there are two. */
function next(cue: Cue): Loaded | null {
  const list = loaded.get(cue)
  if (!list?.length) return null
  const i = turn.get(cue) ?? Math.floor(Math.random() * list.length)
  turn.set(cue, (i + 1) % list.length)
  return list[i % list.length]
}

/** The take nearest a pitch, and the rate that tunes it there (the kalimba of the arrival). */
function nearest(cue: Cue, hz: number): { s: Loaded; rate: number } | null {
  const list = loaded.get(cue)?.filter((s) => s.take.hz)
  if (!list?.length) return null
  const s = list.reduce((a, b) => (Math.abs(Math.log(b.take.hz! / hz)) < Math.abs(Math.log(a.take.hz! / hz)) ? b : a))
  return { s, rate: hz / s.take.hz! }
}

function out(o: Out, pan: number) {
  const g = o.ctx.createGain()
  if (!pan) return (g.connect(o.dest), g)
  const p = o.ctx.createStereoPanner()
  p.pan.value = clamp(pan, -1, 1)
  g.connect(p).connect(o.dest)
  return g
}

/**
 * A one-shot of `cue` at time t: trimmed, at `level` × its cue's level, placed, at `rate`
 * (or tuned to `hz`), or always its `take`-th take (0 = the first picked) where it has one.
 * Returns how long it sounds, or 0 if the cue has no take yet.
 */
export function shot(o: Out, cue: Cue, t: number, { level = 1, pan = 0, rate = 1, hz, tuned = false, take }: { level?: number; pan?: number; rate?: number; hz?: number; tuned?: boolean; take?: number } = {}) {
  const pickd = hz ? nearest(cue, hz) : null
  const list = loaded.get(cue)
  const s = pickd?.s ?? (take !== undefined && list?.length ? list[Math.min(take, list.length - 1)] : next(cue))
  if (!s) return 0
  // `tuned`: brought to the note of the key nearest its own pitch (a bell, the bowl)
  const r = (pickd?.rate ?? (tuned && s.take.hz ? inKey(s.take.hz) / s.take.hz : 1)) * rate
  const src = o.ctx.createBufferSource()
  src.buffer = s.buf
  src.playbackRate.value = r
  const g = out(o, pan)
  const gain = (TARGET[cue] * level * (s.take.level ?? 1)) / Math.max(1e-4, s.take.peak)
  const len = (s.take.end - s.take.start) / r
  const fade = Math.min(0.03, len * 0.2)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(gain, t + 0.002)
  g.gain.setValueAtTime(gain, t + len - fade)
  g.gain.linearRampToValueAtTime(0, t + len)
  src.connect(g)
  src.start(t, s.take.start)
  src.stop(t + len + 0.02)
  return len
}

/** A recorded pen (one of its takes): the whole take, looped, for the pen to play faster and louder as it writes (synth: pen). */
export function penTake(): { buf: AudioBuffer; level: number } | null {
  const list = loaded.get('pen')
  const s = list?.[Math.floor(Math.random() * list.length)]
  return s ? { buf: s.buf, level: (TARGET.pen * (s.take.level ?? 1)) / Math.max(1e-4, s.take.peak) } : null
}

const XF = 2.5 // s: each stretch of a bed fades into the next

/**
 * A bed from recorded loops: stretches of 12–20 s from anywhere in the takes, each fading
 * into the next (equal power), so no seam and no repeat can be heard; brought to the cue's
 * loudness. Same shape as a synthesised bed (synth: Bed), so it swaps in.
 */
export function bed(o: Out, cue: 'lake' | 'breeze', t: number): Bed | null {
  const list = loaded.get(cue)
  if (!list?.length) return null
  const ctx = o.ctx
  const p = ctx.createStereoPanner()
  const master = ctx.createGain()
  master.connect(p).connect(o.dest)
  // the breeze's recordings are mostly wind rumble, heard as nothing but felt as weight: it
  // goes, and the air above it (what the ear hears) comes up to its level (TARGET)
  let into: AudioNode = master
  const filter = (type: BiquadFilterType, f: number) => {
    const b = ctx.createBiquadFilter()
    b.type = type
    b.frequency.value = f
    b.Q.value = 0.707
    b.connect(into)
    into = b
  }
  if (cue === 'breeze') (filter('highpass', 150), filter('highpass', 150))
  if (cue === 'lake') {
    // the lake is calm (owner-directed 2026-09-27): its bigger sloshes, which read as someone
    // moving in the water, are held down, and the bright splash of each lap is rounded off
    filter('lowpass', 2200)
    const calm = ctx.createDynamicsCompressor()
    calm.threshold.value = -34
    calm.knee.value = 10
    calm.ratio.value = 4
    calm.attack.value = 0.004
    calm.release.value = 0.35
    calm.connect(into)
    into = calm
    // the compressor adds its own make-up gain; taken back after it, so the calming is the
    // same whatever the level, and the lake sits at −41.5 LUFS (was −38.5: quieter, owner-directed)
    master.gain.value = 0.25
  }
  const n = 64
  const up = new Float32Array(n)
  const down = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    up[i] = Math.sin(((i / (n - 1)) * Math.PI) / 2)
    down[i] = Math.cos(((i / (n - 1)) * Math.PI) / 2)
  }
  let at = t
  let k = Math.floor(Math.random() * list.length)
  const sources: AudioBufferSourceNode[] = []
  return {
    tick(until) {
      while (at < until) {
        const s = list[k++ % list.length]
        const len = Math.min(s.take.seconds - 0.5, 12 + Math.random() * 8)
        const from = Math.random() * Math.max(0, s.take.seconds - len - 0.2)
        const src = ctx.createBufferSource()
        src.buffer = s.buf
        const g = ctx.createGain()
        const level = (TARGET[cue] * (s.take.level ?? 1)) / Math.max(1e-5, s.take.rms)
        g.gain.value = 0 // (a curve may not share its time with another event)
        g.gain.setValueCurveAtTime(up.map((v) => v * level), at, XF)
        g.gain.setValueCurveAtTime(down.map((v) => v * level), at + len - XF, XF)
        src.connect(g).connect(into)
        src.start(at, from)
        src.stop(at + len + 0.05)
        sources.push(src)
        src.onended = () => sources.splice(sources.indexOf(src), 1)
        at += len - XF
      }
    },
    bias(pan, when) {
      p.pan.setTargetAtTime(clamp(pan, -1, 1) * 0.6, when, 0.3)
    },
    stop(when) {
      master.gain.setTargetAtTime(0, when, 0.3)
      for (const s of sources) s.stop(when + 2)
    },
    // the breeze swells as a gust is seen to cross (src/lib/wind.ts); the lake keeps its calm
    swell: cue === 'breeze' ? (k, when) => master.gain.setTargetAtTime(1 + SWELL * k, when, 0.7) : undefined,
  }
}
