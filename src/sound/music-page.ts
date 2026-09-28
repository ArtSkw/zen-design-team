import '@fontsource-variable/nunito'
import { mixer } from './mix'
import * as rec from './samples'
import { hz } from './key'
import { music, MOODS, type Heard, type Kit, type Mood, type Music, type Sample } from './music'
import type { Take } from './samples'
import type { Bed } from './synth'

// The music page (music.html, development only): the moods of src/sound/music.ts played
// live through the room's own mix, with the world's lake and breeze beneath if wanted, and
// the dials the room will read from its address. Every note is drawn as it sounds, a ring
// on the water, so how much is played can be seen as well as heard. The breath and the lake
// can be played by other instruments — the ElevenLabs takes in sound-raw/ — on the same
// seed, so the same music is heard by another hand. The page opens on the dials of its
// own address (?music=breath&energy=0.8&…), as the room does.

const ABOUT: Record<Mood, { name: string; what: string; after: string }> = {
  postcards: {
    name: 'Postcards',
    what: 'A soft electric piano, two or three notes at a time, then quiet. Five short phrases each loop at a length of their own, so they meet differently every time.',
    after: 'After Hiroshi Yoshimura, Music for Nine Post Cards (1982), and the loops of Brian Eno’s Music for Airports.',
  },
  felt: {
    name: 'Felt',
    what: 'A felt piano, the Nordic way: a low note, a chord rolled slowly upward, now and then a high answer. The chords walk D, G, Em, A, Bm.',
    after: 'After Ólafur Arnalds and Nils Frahm’s felt pianos.',
  },
  breath: {
    name: 'Breath',
    what: 'A chord of reeds, like a shō far off, swells and fades like a slow breath, then rests; it changes one reed at a time. The singing bowl, rarely.',
    after: 'After the shō of gagaku and kankyō ongaku, Japan’s environmental music. In the room: the shō, energy 0.95, Distant, 0 dB, seed 326436.',
  },
  lake: {
    name: 'The lake',
    what: 'No score. Now and then the music touches the water where you can see it, and the ring sings a kalimba note as it blooms — left is low, right is high, far is soft.',
    after: 'The room’s own rings and the arrival’s kalimba.',
  },
}
const ENERGY: [string, number][] = [['Chill', 0.25], ['Normal', 0.5], ['Awake', 0.8]]
const PRESENCE: [string, number][] = [['Near', 0.05], ['Distant', 0.35], ['Far', 0.75]]
/** Who plays it: '' synthesised; otherwise a cue of recordings (the arrival's kalimba is published; the rest are raw takes). */
const INSTRUMENTS: Partial<Record<Mood, [string, string][]>> = {
  breath: [['Synthesised', ''], ['Shō', 'sho'], ['Harmonium', 'harmonium'], ['Glass', 'glass']],
  lake: [['The arrival’s kalimba', 'kalimba'], ['Kalimba by note', 'kalimba-notes']],
}
const RAW = ['sho', 'harmonium', 'glass', 'kalimba-notes']

const q = new URLSearchParams(location.search)
const num = (k: string, d: number) => (q.get(k) != null && !Number.isNaN(Number(q.get(k))) ? Number(q.get(k)) : d)
const state = {
  mood: null as Mood | null,
  energy: num('energy', 0.25),
  presence: num('presence', 0.35),
  db: num('mlevel', 0),
  world: true,
  arrival: false,
  seed: num('seed', 0),
  inst: { breath: q.get('reed') ?? '', lake: q.get('kalimba') ?? 'kalimba' } as Partial<Record<Mood, string>>,
}
const asked = MOODS.find((m) => m === q.get('music')) ?? null

// ---- sound ---------------------------------------------------------------------------------------
let ctx: AudioContext | null = null
let mix: ReturnType<typeof mixer> | null = null
let level: GainNode | null = null
function audio() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'playback' })
    mix = mixer(ctx)
    level = ctx.createGain()
    level.connect(mix.buses.music.input)
  }
  void ctx.resume()
  return { ctx, mix: mix!, level: level! }
}
const loaded = rec.preload()

/** The raw takes of the other instruments, measured (scripts/sfx-look.py) and decoded, as notes to play. */
const raw: Record<string, Sample[]> = {}
const rawTakes: Record<string, string[]> = {}
const rawLoaded = (async () => {
  const index = (await (await fetch('/sound-raw/index.json')).json()) as Record<string, Record<string, Take>>
  const decoder = new OfflineAudioContext(2, 1, 44100)
  await Promise.all(
    RAW.flatMap((cue) =>
      Object.entries(index[cue] ?? {}).map(async ([n, take]) => {
        if (!take.hz) return
        const buf = await decoder.decodeAudioData(await (await fetch(`/sound-raw/${cue}/${take.file}`)).arrayBuffer())
        const level = take.level ?? 1
        ;(raw[cue] ??= []).push({ buf, hz: take.hz, gain: level / Math.max(1e-4, take.peak), start: take.start, end: take.end, rms: take.rms / level })
        ;(rawTakes[cue] ??= []).push(n)
      }),
    ),
  )
  for (const ns of Object.values(rawTakes)) ns.sort((a, b) => Number(a) - Number(b))
})()

function kit(mood: Mood): Kit {
  const inst = state.inst[mood] ?? ''
  if (mood === 'breath') return { bowl: rec.notes('bowl'), reed: inst ? raw[inst] : undefined }
  return { kalimba: inst === 'kalimba' || !raw[inst] ? rec.notes('kalimba') : raw[inst] }
}

let tune: Music | null = null
let beds: Bed[] = []
let clock = 0
function tick() {
  if (!ctx) return
  const until = ctx.currentTime + 1.2
  tune?.tick(until)
  for (const b of beds) b.tick(until)
}

function world(on: boolean) {
  const { ctx, mix } = audio()
  if (!on) {
    for (const b of beds) b.stop(ctx.currentTime)
    beds = []
    return
  }
  if (beds.length) return
  const t = ctx.currentTime + 0.05
  beds = [rec.bed({ ctx, dest: mix.buses.near.input }, 'lake', t), rec.bed({ ctx, dest: mix.buses.far.input }, 'breeze', t)].filter((b): b is Bed => !!b)
  tick()
}

/** The fourteen arriving, as the room plays them (src/sound/cues.ts: arrive): the music grows out of the last D. */
function arrival(at: number) {
  const { ctx, mix } = audio()
  const o = { ctx, dest: mix.buses.toy.input }
  for (let i = 0; i < 14; i++) {
    const last = i === 13
    const low = Math.min(1, Math.max(0.55, i / 8))
    const pan = -0.6 + (i / 13) * 1.2
    rec.shot(o, 'kalimba', at + i * 0.07, { hz: hz(i - 3), level: last ? 1 : 0.6 * low, pan })
    if (last) rec.shot(o, 'kalimba', at + i * 0.07 + 0.01, { hz: hz(i - 8), level: 0.55, pan })
    ring({ at: at + i * 0.07, f: hz(i - 3), vel: 0.4, len: 2, kind: 'kalimba' })
  }
  return at + 13 * 0.07 + 1.2
}

async function play(mood: Mood | null, { fresh = true } = {}) {
  const { ctx, level } = audio()
  tune?.stop(ctx.currentTime)
  tune = null
  state.mood = mood
  render()
  if (!mood) return
  await Promise.all([loaded, rawLoaded])
  if (fresh || !state.seed) state.seed = Math.floor(Math.random() * 1e6)
  let t = ctx.currentTime + 0.1
  if (state.arrival) t = arrival(t)
  tune = music({ ctx, dest: level }, mood, t, {
    seed: state.seed,
    energy: state.energy,
    presence: state.presence,
    kit: kit(mood),
    heard: ring,
    water: () => ({ across: Math.random(), depth: Math.random() }), // anywhere: the whole lake is in view here
  })
  clearInterval(clock)
  clock = window.setInterval(tick, 250)
  tick()
  render()
}

// ---- the page ----------------------------------------------------------------------------------------
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) {
  const e = document.createElement(tag)
  Object.assign(e, props)
  e.append(...kids)
  return e
}
const $ = (id: string) => document.getElementById(id)!

/** The first play of the mood the address asked for keeps its seed; every later one is a new take. */
let opened = false
const first = () => !opened && (opened = true)

const cards = new Map<Mood, HTMLButtonElement>()
for (const mood of MOODS) {
  const a = ABOUT[mood]
  const card = el('button', { className: 'mood', type: 'button' },
    el('span', { className: 'mood__name' }, a.name, el('span', { className: 'mood__state' })),
    el('span', { className: 'mood__what', textContent: a.what }),
    el('span', { className: 'mood__after', textContent: a.after }))
  card.onclick = () => void play(state.mood === mood ? null : mood, { fresh: mood !== asked || !first() })
  cards.set(mood, card)
  $('moods').append(card)
}

function segmented(id: string, options: [string, number][], key: 'energy' | 'presence') {
  const host = $(id)
  for (const [label, v] of options) {
    const b = el('button', { type: 'button', textContent: label })
    b.onclick = () => {
      state[key] = v
      if (ctx) tune?.set({ [key]: v }, ctx.currentTime)
      render()
    }
    b.dataset.v = String(v)
    host.append(b)
  }
}
segmented('energy', ENERGY, 'energy')
segmented('presence', PRESENCE, 'presence')

/** The instrument dial, for the moods that have more than one: a change plays the same seed again. */
function instruments() {
  const host = $('inst')
  host.replaceChildren()
  const list = state.mood ? INSTRUMENTS[state.mood] : undefined
  $('inst-dial').hidden = !list
  if (!list || !state.mood) return
  const mood = state.mood
  for (const [label, cue] of list) {
    const b = el('button', { type: 'button', textContent: label })
    b.setAttribute('aria-pressed', String((state.inst[mood] ?? '') === cue))
    b.onclick = () => {
      state.inst[mood] = cue
      void play(mood, { fresh: false })
    }
    host.append(b)
  }
}

const slider = $('level') as HTMLInputElement
slider.oninput = () => {
  state.db = Number(slider.value)
  if (ctx && level) level.gain.setTargetAtTime(10 ** (state.db / 20), ctx.currentTime, 0.05)
  render()
}
;($('world') as HTMLInputElement).onchange = (e) => {
  state.world = (e.target as HTMLInputElement).checked
  if (state.mood) world(state.world)
}
;($('arrival') as HTMLInputElement).onchange = (e) => (state.arrival = (e.target as HTMLInputElement).checked)
$('again').onclick = () => state.mood && void play(state.mood)
$('copy').onclick = () => void navigator.clipboard?.writeText(location.origin + ($('room') as HTMLAnchorElement).getAttribute('href'))

function render() {
  for (const [mood, card] of cards) {
    const on = state.mood === mood
    card.setAttribute('aria-pressed', String(on))
    card.querySelector('.mood__state')!.textContent = on ? 'Playing · stop' : 'Play'
  }
  for (const [id, key] of [['energy', 'energy'], ['presence', 'presence']] as const)
    $(id).querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.v) === state[key])))
  $('level-out').textContent = `${state.db > 0 ? '+' : ''}${state.db} dB`
  if (state.mood && state.world) world(true)
  if (!state.mood && beds.length) world(false)
  instruments()
  slider.value = String(state.db)
  // the instrument, and in development the raw takes it needs (they are not published)
  const inst = state.mood ? state.inst[state.mood] ?? '' : ''
  const which = !inst ? '' : state.mood === 'breath' ? `&reed=${inst}` : inst !== 'kalimba' ? `&kalimba=${inst}` : ''
  const takes = which && rawTakes[inst] ? `&take=${inst}:${rawTakes[inst].join('+')}` : ''
  const q = state.mood ? `?music=${state.mood}&energy=${state.energy}&presence=${state.presence}&mlevel=${state.db}&seed=${state.seed}${which}${takes}` : ''
  $('pick').textContent = q ? `/${q}` : 'Choose a mood'
  ;($('room') as HTMLAnchorElement).href = `/${q}`
  ;($('room-fast') as HTMLAnchorElement).href = `/${q}${q ? '&' : '?'}intro=0`
}
render()

// ---- the water: every note, a ring --------------------------------------------------------------------
type Ring = Heard & { depth: number; x: number }
const rings: Ring[] = []
function ring(h: Heard) {
  const across = h.x ?? Math.min(1, Math.max(0, Math.log2(h.f / hz(-10)) / 4.2)) // D2 at the left, past D6 at the right
  // the lake's rings are as slow as the room's (7 s); the others last as long as their note
  rings.push({ ...h, len: h.x != null ? 4.5 : h.len, x: 0.06 + across * 0.88, depth: h.depth ?? 0.15 + Math.random() * 0.7 })
}

const canvas = $('stage') as HTMLCanvasElement
const g = canvas.getContext('2d')!
function draw() {
  requestAnimationFrame(draw)
  const dpr = Math.min(2, devicePixelRatio || 1)
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (canvas.width !== Math.round(w * dpr)) (canvas.width = Math.round(w * dpr)), (canvas.height = Math.round(h * dpr))
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, w, h)
  const horizon = h * 0.2
  g.strokeStyle = 'rgba(17,18,20,0.18)'
  g.lineWidth = 1
  g.beginPath()
  g.moveTo(16, horizon)
  g.lineTo(w - 16, horizon)
  g.stroke()
  const now = ctx?.currentTime ?? 0
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]
    const life = Math.min(8, Math.max(3, r.len * 1.6))
    const age = now - r.at
    if (age < 0) continue
    if (age > life) {
      rings.splice(i, 1)
      continue
    }
    // one ring widening and fading, a fainter one a beat behind — as on the room's water
    const y = horizon + 14 + (1 - r.depth) * (h - horizon - 44)
    const scale = 0.45 + 0.55 * (1 - r.depth)
    for (let k = 0; k < 2; k++) {
      const u = age / life - k * 0.16
      if (u <= 0) continue
      const rad = (6 + 70 * (1 - (1 - u) ** 2)) * scale
      const a = (1 - u) ** 2 * Math.min(1, u / 0.04) * (k ? 0.35 : 1) * (0.35 + r.vel)
      g.strokeStyle = `rgba(17,18,20,${a.toFixed(3)})`
      g.lineWidth = 1.25
      g.beginPath()
      g.ellipse(r.x * w, y, rad, rad * 0.3, 0, 0, Math.PI * 2)
      g.stroke()
    }
    if (age < 0.6) {
      g.fillStyle = `rgba(17,18,20,${(0.8 * (1 - age / 0.6)).toFixed(3)})`
      g.beginPath()
      g.arc(r.x * w, y, 2.2 * scale, 0, Math.PI * 2)
      g.fill()
    }
  }
}
requestAnimationFrame(draw)
