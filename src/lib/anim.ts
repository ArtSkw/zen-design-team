export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smoothstep = (t: number) => {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}
// Overshoot ease: settles from above; k controls the bounce (1.70158 = classic).
export const easeOutBack = (t: number, k = 1.2) => {
  const x = clamp(t, 0, 1) - 1
  return 1 + x * x * ((k + 1) * x + k)
}
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3)
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * clamp(t, 0, 1)) - 1) / 2

// Piecewise keyframes [[time, value], ...] with smoothstep between keys.
export function kf(keys: [number, number][], t: number) {
  if (t <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i]
    if (t <= t1) {
      const [t0, v0] = keys[i - 1]
      return lerp(v0, v1, smoothstep((t - t0) / (t1 - t0)))
    }
  }
  return keys[keys.length - 1][1]
}

// Cubic Hermite over [0, d]: leaves p0 at rate v0, arrives at p1 at rate v1 (rates
// per unit of t). The way to hand one motion over to another without a speed jump.
export function hermite(p0: number, v0: number, p1: number, v1: number, d: number, t: number) {
  const u = clamp(t / d, 0, 1)
  const u2 = u * u
  const u3 = u2 * u
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * d * v0 + (3 * u2 - 2 * u3) * p1 + (u3 - u2) * d * v1
}

// Exponential damping toward a target (frame-rate independent).
export const damp = (cur: number, target: number, lambda: number, dt: number) =>
  lerp(cur, target, 1 - Math.exp(-lambda * dt))
