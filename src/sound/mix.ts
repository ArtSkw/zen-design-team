import { impulse } from './synth'

// The mix, on its own (no side effects): five buses, each through its tone into the master
// and the one shared open-air space, then a gentle limiter. The app plays through it
// (src/sound/engine.ts), and so do the offline renders and the listening page, so a take
// sounds the same in all three.
//
//   ui     the controls: wood
//   toy    the Zeneks: their bubbles, their arrival; a splash on the water
//   near   the lake at the deck
//   far    the hills: breeze, birds, gulls, the plane, fish
//   title  the pen, and the bell as the title lets go
//   music  the music, when there is any (src/sound/music.ts: its own hall; a touch of the air)
export type BusName = 'ui' | 'toy' | 'near' | 'far' | 'title' | 'music'

export const LEVEL: Record<BusName, number> = { ui: 0.4, toy: 0.5, near: 0.5, far: 0.55, title: 0.7, music: 0.5 }
const SEND: Record<BusName, number> = { ui: 0.05, toy: 0.12, near: 0.1, far: 0.42, title: 0.16, music: 0.06 }
/** The mix: every bus through its tone into the master and the shared space, then the limiter. Offline too (scripts/sound-render.mjs). */
export function mixer(c: BaseAudioContext) {
  const limiter = c.createDynamicsCompressor()
  limiter.threshold.value = -9
  limiter.knee.value = 8
  limiter.ratio.value = 8
  limiter.attack.value = 0.002
  limiter.release.value = 0.2
  const out = c.createGain()
  const master = c.createGain()
  master.gain.value = 0.9
  master.connect(limiter).connect(out).connect(c.destination)
  const verb = c.createConvolver()
  verb.buffer = impulse(c)
  verb.connect(master)
  const buses = {} as Record<BusName, { input: GainNode; tone: BiquadFilterNode }>
  for (const name of Object.keys(LEVEL) as BusName[]) {
    const input = c.createGain()
    input.gain.value = LEVEL[name]
    const tone = c.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 18000
    tone.Q.value = 0.5
    const send = c.createGain()
    send.gain.value = SEND[name]
    input.connect(tone).connect(master)
    tone.connect(send).connect(verb)
    buses[name] = { input, tone }
  }
  return { out, buses }
}

