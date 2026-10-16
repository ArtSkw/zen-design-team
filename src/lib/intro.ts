import { store } from './store'

// The intro's own clock: seconds since the curtain lifted (store.introClock marks the moment),
// advanced by each frame's time but never by more than a frame at 30 fps. A stall — a first
// visit's shaders compiling, a phone busy — then pauses the room's rise and the entrance wave
// rather than skipping them: the Zeneks still arrive one by one, never all at once (2026-10-16:
// on a cold load a single 0.9 s frame let the whole wave land together).
const MAX_STEP = 1 / 30
let t = -1
let last = NaN

/**
 * Seconds of intro seen so far, or −1 before it starts. Called by everything the intro moves,
 * with the frame's clock and raw delta; the first caller in a frame advances it (idempotent
 * within a frame, like tickSocial).
 */
export function introTime(elapsed: number, rawDt: number) {
  if (store.get().introClock < 0) return (t = -1)
  if (elapsed !== last) {
    last = elapsed
    t = t < 0 ? 0 : t + Math.min(rawDt, MAX_STEP)
  }
  return t
}
