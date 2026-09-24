import { LINES } from '../cast/lines'
import { clamp } from './anim'
import { store } from './store'

// Lines as in an RPG: a tap says the Zenek's next line, which stays up just long enough to
// read and then goes by itself. Tapping again moves on to the following line; each Zenek
// remembers where it got to, and after its last line starts again from the first. Only one
// speaks at a time: a tap on another Zenek sends the open bubble away.
const next = new Map<string, number>()
let timer = 0

/** How long a line stays up: a moment to find the bubble, then a reading pace per character. */
export const readMs = (text: string) => clamp(1600 + 60 * text.length, 3000, 7500)

export function say(id: string) {
  const lines = LINES[id]
  if (!lines?.length) return
  const line = next.get(id) ?? 0
  next.set(id, (line + 1) % lines.length)
  store.set({ active: id, line, said: store.get().said + 1 })
  clearTimeout(timer)
  timer = window.setTimeout(hush, readMs(lines[line]))
}

/** The bubble goes (read, or dismissed). */
export function hush() {
  clearTimeout(timer)
  if (store.get().active) store.set({ active: null })
}
