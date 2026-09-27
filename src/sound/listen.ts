import '@fontsource-variable/nunito'
import { mixer, type BusName } from './mix'
import { TARGET, type Cue, type Take } from './samples'
import { hz, inKey } from './key'
import * as syn from './synth'

// The listening page (listen.html, development only): every take in sound-raw/, played the
// way the room will play it — trimmed, levelled to its cue, through its bus and the shared
// space — next to the synthesised stand-in it would replace. Picks become `?take=` for the
// room, or a line to copy back.

const GROUPS: [string, Cue[]][] = [
  ['What you set off', ['click', 'splash', 'plip', 'bowl']],
  ['The intro', ['pen', 'dot', 'air', 'kalimba']],
  ['The world', ['lake', 'breeze', 'songbird', 'uguisu', 'gulls', 'fish']],
]
const BUS: Record<Cue, BusName> = { click: 'ui', bowl: 'ui', splash: 'toy', plip: 'toy', kalimba: 'toy', pen: 'title', dot: 'title', air: 'title', lake: 'near', breeze: 'far', songbird: 'far', uguisu: 'far', gulls: 'far', fish: 'far' }
/** What the room plays now (public/sound/picks.json): checked to begin with, and marked. */
const live = ((await (await fetch('/sound/picks.json')).json()) ?? {}) as Record<string, Take[]>
const MINE: Record<string, number[]> = Object.fromEntries(Object.entries(live).map(([cue, takes]) => [cue, takes.map((t) => Number(t.file.match(/-(\d+)\.mp3$/)?.[1]))]))

type Book = { cues: Record<string, { use: string; prompt: string }> }
const index = (await (await fetch('/sound-raw/index.json')).json()) as Record<string, Record<string, Take>>
const book = (await (await fetch('/docs/sound/prompts.json')).json()) as Book

let ctx: AudioContext | null = null
let mix: ReturnType<typeof mixer> | null = null
const audio = () => {
  if (!ctx) {
    ctx = new AudioContext()
    mix = mixer(ctx)
  }
  void ctx.resume()
  return { ctx, mix: mix! }
}
const out = (cue: Cue) => {
  const { ctx, mix } = audio()
  return { ctx, dest: mix.buses[BUS[cue]].input }
}
const buffers = new Map<string, Promise<AudioBuffer>>()
const load = (cue: string, take: Take) => {
  const url = `/sound-raw/${cue}/${take.file}`
  if (!buffers.has(url)) buffers.set(url, fetch(url).then((r) => r.arrayBuffer()).then((b) => audio().ctx.decodeAudioData(b)))
  return buffers.get(url)!
}

let stopAll: (() => void)[] = []
const hush = () => {
  stopAll.forEach((s) => s())
  stopAll = []
  document.querySelectorAll('.playing').forEach((b) => b.classList.remove('playing'))
}

/** A take as the room plays it: trimmed, levelled, at `rate`, at time `at`. */
function one(cue: Cue, take: Take, buf: AudioBuffer, at: number, { level = 1, rate = 1, seconds }: { level?: number; rate?: number; seconds?: number } = {}) {
  const o = out(cue)
  const src = o.ctx.createBufferSource()
  src.buffer = buf
  src.playbackRate.value = rate
  const g = o.ctx.createGain()
  const gain = (TARGET[cue] * level) / (take.loop ? take.rms : take.peak)
  const len = seconds ?? (take.end - take.start) / rate
  const fade = take.loop ? 1.5 : Math.min(0.03, len * 0.2)
  g.gain.setValueAtTime(0, at)
  g.gain.linearRampToValueAtTime(gain, at + (take.loop ? 1.5 : 0.002))
  g.gain.setValueAtTime(gain, at + len - fade)
  g.gain.linearRampToValueAtTime(0, at + len)
  src.connect(g).connect(o.dest)
  src.start(at, take.start)
  src.stop(at + len + 0.05)
  stopAll.push(() => src.stop())
  return len
}

/** The way the room uses each cue: the arrival's run, the air slowed under the petals, a bed for a while. */
async function hear(cue: Cue, take: Take) {
  const buf = await load(cue, take)
  const t = audio().ctx.currentTime + 0.05
  if (cue === 'air') return one(cue, take, buf, t, { rate: 0.85 }) // as the room plays it, under the falling petals
  if (cue === 'kalimba' && take.hz) {
    for (let i = 0; i < 14; i++) one(cue, take, buf, t + i * 0.07, { level: i === 13 ? 1 : 0.6, rate: hz(i - 3) / take.hz })
    return 2.5
  }
  if (cue === 'bowl' && take.hz) return one(cue, take, buf, t, { rate: inKey(take.hz) / take.hz })
  if (take.loop) return one(cue, take, buf, t, { seconds: 12 })
  return one(cue, take, buf, t)
}

/** The synthesised stand-in the take would replace. */
function standIn(cue: Cue) {
  const o = out(cue)
  const t = o.ctx.currentTime + 0.05
  const rng = Math.random
  switch (cue) {
    case 'click': return syn.tick(o, t)
    case 'splash': return syn.splash(o, t)
    case 'plip': return syn.plip(o, t, { level: 0.9 })
    case 'bowl': return syn.bell(o, hz(5), t, { kind: 'bowl', level: 0.7 })
    case 'dot': return syn.dot(o, t)
    case 'air': return syn.swish(o, t, { dur: 2.2, from: 420, to: 2600, q: 0.7, level: 0.07, pan: -0.2, panTo: 0.25 })
    case 'kalimba': for (let i = 0; i < 14; i++) syn.pluck(o, hz(i - 3), t + i * 0.07, { vel: 0.6, bright: 0.8, decay: 0.8 }); return
    case 'fish': return syn.plop(o, t, { level: 0.45 })
    case 'songbird': return void syn.songbird(o, t, { rng })
    case 'uguisu': return void syn.uguisu(o, t, { level: 0.8 })
    case 'gulls': return [0, 0.6].forEach((d) => syn.gull(o, t + d, { rng }))
    case 'pen': {
      const pen = syn.pen(o, t)
      for (let k = 0, at = t; k < 10; k++) {
        const dur = 0.09 + rng() * 0.16
        for (let i = 0; i <= 12; i++) pen.set(Math.sin((Math.PI * i) / 12) ** 0.8, at + (dur * i) / 12)
        pen.set(0, at + dur + 0.005)
        at += dur + 0.04 + rng() * 0.06
      }
      pen.stop(t + 3)
      return
    }
    case 'lake':
    case 'breeze': {
      const bed = (cue === 'lake' ? syn.lake : syn.breeze)(o, t)
      bed.tick(t + 12)
      bed.stop(t + 12)
      stopAll.push(() => bed.stop(o.ctx.currentTime))
      return
    }
  }
}

// ---- the page ------------------------------------------------------------------------------------
const KEY = 'zdt-listen-picks'
let picks: Record<string, number[]>
try {
  picks = JSON.parse(localStorage.getItem(KEY) ?? 'null') ?? { ...MINE }
} catch {
  picks = { ...MINE }
}
function el(tag: string, props: Record<string, unknown> = {}, ...kids: (Node | string)[]): HTMLElement {
  const e = document.createElement(tag)
  Object.assign(e, props)
  e.append(...kids)
  return e
}
const name = (n: number) => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1)
const note = (f: number) => {
  const m = 69 + 12 * Math.log2(f / 440)
  return `${name(Math.round(m))} ${Math.round((m - Math.round(m)) * 100) >= 0 ? '+' : ''}${Math.round((m - Math.round(m)) * 100)}c`
}

function update() {
  try {
    localStorage.setItem(KEY, JSON.stringify(picks))
  } catch {
    /* the page forgets on reload */
  }
  const line = Object.entries(picks).filter(([, ns]) => ns.length).map(([c, ns]) => `${c}:${ns.join('+')}`).join(',')
  document.getElementById('picks')!.textContent = line
  ;(document.getElementById('room') as HTMLAnchorElement).href = `/?take=${line}`
  ;(document.getElementById('room-fast') as HTMLAnchorElement).href = `/?take=${line}&intro=0`
}

const app = document.getElementById('app')!
for (const [title, cues] of GROUPS) {
  app.append(el('h2', { textContent: title }))
  for (const cue of cues) {
    const takes = Object.entries(index[cue] ?? {}).sort(([a], [b]) => Number(a) - Number(b))
    const row = el('div', { className: 'takes' })
    for (const [n, take] of takes) {
      const k = Number(n)
      const box = el('input', { type: 'checkbox', checked: (picks[cue] ?? []).includes(k) }) as HTMLInputElement
      const wrap = el('div', { className: `take${box.checked ? ' on' : ''}` })
      box.onchange = () => {
        picks[cue] = box.checked ? [...new Set([...(picks[cue] ?? []), k])].sort() : (picks[cue] ?? []).filter((x) => x !== k)
        wrap.classList.toggle('on', box.checked)
        update()
      }
      const btn = el('button', { className: 'play', type: 'button', title: `Play take ${n}`, textContent: '▶' })
      btn.onclick = async () => {
        hush()
        btn.classList.add('playing')
        const len = await hear(cue, take)
        setTimeout(() => btn.classList.remove('playing'), (len ?? 1) * 1000)
      }
      const facts = [`${(take.end - take.start).toFixed(take.loop ? 0 : 2)} s`, take.hz ? note(take.hz) : '', `peak ${(20 * Math.log10(take.peak)).toFixed(0)} dB`].filter(Boolean).join(' · ')
      wrap.append(btn, el('label', {}, box, `${n}`), el('small', { textContent: facts }), ...(MINE[cue]?.includes(k) ? [el('span', { className: 'mine', textContent: '· live' })] : []))
      row.append(wrap)
    }
    const stand = el('button', { className: 'standin', type: 'button', textContent: 'Stand-in (now)' })
    stand.onclick = () => (hush(), standIn(cue))
    row.append(stand)
    const info = book.cues[cue]
    app.append(el('div', { className: 'cue' },
      el('div', { className: 'cue__head' }, el('span', { className: 'cue__name', textContent: cue }), el('span', { className: 'cue__use', textContent: info?.use ?? '' })),
      el('div', { className: 'cue__prompt', textContent: info?.prompt ?? '' }),
      row))
  }
}
document.getElementById('copy')!.onclick = () => void navigator.clipboard?.writeText(document.getElementById('picks')!.textContent ?? '')
update()
