// The key. Every pitched sound is in one key, the yo scale on D (D E G A B): any notes of it
// sound well together, so notes and bells never clash however they overlap.
const YO = [0, 2, 5, 7, 9]
const midi = (deg: number) => 62 + 12 * Math.floor(deg / 5) + YO[((deg % 5) + 5) % 5]

/** The frequency of a degree of the key: 0 is D4, 5 is D5, −3 is G3. */
export const hz = (deg: number) => 440 * 2 ** ((midi(deg) - 69) / 12)

/** The note of the key nearest a frequency (to tune a recording by its playback rate). */
export function inKey(f: number) {
  const m = 69 + 12 * Math.log2(f / 440)
  let best = 62
  for (let n = 24; n < 110; n++) if (YO.includes((((n - 62) % 12) + 12) % 12) && Math.abs(n - m) < Math.abs(best - m)) best = n
  return 440 * 2 ** ((best - 69) / 12)
}
