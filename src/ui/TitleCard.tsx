import { useEffect, useId, useRef } from 'react'
import { store, useStore } from '../lib/store'
import { mulberry32 } from '../lib/rng'
import { GLYPHS } from './title-glyphs'
import { NIB, PEN, WORD_ENDS } from './title-pen'

// The title card, between the loader's check and the room: "Meet ZEN Design Team",
// written by hand. Artur's type (docs/brand/app-title.svg, split into letters) is
// revealed through the path a pen would take to write each letter (title-pen.ts):
// every stroke grows as a mask, so ink appears only where the pen has passed, and the
// last frame is exactly the type.
//
// The hand is a small model, not an easing curve: along every stroke the pen's speed
// follows the path — it glides on straights and slows into curves and corners (the
// way handwriting moves) — and it never quite stops: a stroke starts and lands at
// about half speed, the pen lifts and travels through the air, and each letter sets
// off while the last one is still being finished, so the line is written as one wave.
// The tempo opens gently, settles into a cruise and lands softly on "Team"; the i gets
// its dot once "Design" is written; a few percent of variation keeps it human.
//
// The nib is soft: ahead of the solid ink runs a lighter, blurred wet edge, a few
// units long, so every stroke blooms in through a short gradient and settles crisp
// behind the pen. Once written, only the solid layer matters — the title is sharp.

const START = 140 // ms: the loader mark is still leaving
const CRUISE = { regular: 1.84, bold: 1.54 } // pen speed on a straight, units per ms ("Meet" is lighter, quicker)
const CORNER = 0.42 // speed factor in the tightest curve or at a sharp corner
const LAND = 0.5 // share of the cruise the pen starts and lands at
const AIR = 2.2 // the pen travels through the air this much faster than it writes
const FLOW = 0.32 // the next letter starts before the last stroke lands, by this share of it
const BREATH = 70 // ms between words
const HOLD = 440 // ms the finished title holds before the room comes (the plain fade; its petals start sooner: TitleDust)
const WET = 8 // units of soft, wet ink ahead of the solid ink
const DRY = 90 // ms for the ink to settle after the pen leaves a stroke
const SOFT = 1.5 // blur of the wet edge, in units
const WET_INK = 0.55 // how dark the wet edge is before it settles

// ---- geometry -------------------------------------------------------------------
type Pt = { x: number; y: number }

/** Points along an absolute M/L/C path, cubic segments finely flattened. */
function flatten(d: string): Pt[] {
  const t = d.match(/[MLC]|-?\d+(?:\.\d+)?/g) ?? []
  const out: Pt[] = []
  let i = 0
  let x = 0
  let y = 0
  let cmd = ''
  while (i < t.length) {
    if (/[MLC]/.test(t[i])) cmd = t[i++]
    if (cmd === 'M') {
      x = +t[i++]
      y = +t[i++]
      out.push({ x, y })
      cmd = 'L'
    } else if (cmd === 'L') {
      x = +t[i++]
      y = +t[i++]
      out.push({ x, y })
    } else {
      const p = [x, y, +t[i++], +t[i++], +t[i++], +t[i++], +t[i++], +t[i++]]
      for (let k = 1; k <= 24; k++) {
        const u = k / 24
        const a = (1 - u) ** 3
        const b = 3 * (1 - u) ** 2 * u
        const c = 3 * (1 - u) * u * u
        const e = u ** 3
        out.push({ x: a * p[0] + b * p[2] + c * p[4] + e * p[6], y: a * p[1] + b * p[3] + c * p[5] + e * p[7] })
      }
      x = p[6]
      y = p[7]
    }
  }
  return out
}

/** Resample a polyline every `step` units: positions s and the turning (radians) at each. */
function resample(pts: Pt[], step = 0.5) {
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  const L = cum[cum.length - 1]
  const n = Math.max(2, Math.ceil(L / step) + 1)
  const res: Pt[] = []
  let j = 0
  for (let k = 0; k < n; k++) {
    const s = (L * k) / (n - 1)
    while (j < cum.length - 2 && cum[j + 1] < s) j++
    const u = cum[j + 1] > cum[j] ? (s - cum[j]) / (cum[j + 1] - cum[j]) : 0
    res.push({ x: pts[j].x + (pts[j + 1].x - pts[j].x) * u, y: pts[j].y + (pts[j + 1].y - pts[j].y) * u })
  }
  const turn = res.map((p, k) => {
    if (k === 0 || k === res.length - 1) return 0
    const a = Math.atan2(p.y - res[k - 1].y, p.x - res[k - 1].x)
    const b = Math.atan2(res[k + 1].y - p.y, res[k + 1].x - p.x)
    return Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)))
  })
  return { L, ds: L / (n - 1), turn, first: res[0], last: res[res.length - 1] }
}

// ---- the hand -------------------------------------------------------------------
type Stroke = {
  letter: number
  d: string
  L: number
  start: number // ms
  dur: number // ms
  time: Float32Array // time (ms from the stroke's start) at each sample
  ds: number
}

/**
 * A stroke's timing along its length: curvature, smoothed over a few units, slows
 * the pen (a sharp corner the most); it starts and lands at LAND of the cruise.
 */
function timeAlong(d: string, cruise: number) {
  const r = resample(flatten(d))
  const n = r.turn.length
  // curvature (radians per unit), smoothed over ±3 units so corners are taken in a sweep
  const k = r.turn.map((a) => a / r.ds)
  const win = Math.max(1, Math.round(3 / r.ds))
  const sm = k.map((_, i) => {
    let s = 0
    let w = 0
    for (let j = -win; j <= win; j++) {
      const q = k[i + j]
      if (q === undefined) continue
      const f = 1 - Math.abs(j) / (win + 1)
      s += q * f
      w += f
    }
    return s / w
  })
  const time = new Float32Array(n)
  const ramp = 6 // units to reach cruise, and to land
  for (let i = 1; i < n; i++) {
    const s = i * r.ds
    const bend = CORNER + (1 - CORNER) / (1 + (sm[i] / 0.09) ** 1.4)
    const ends = Math.min(1, LAND + (1 - LAND) * Math.min(s, r.L - s) / ramp)
    time[i] = time[i - 1] + r.ds / (cruise * bend * ends)
  }
  return { L: r.L, ds: r.ds, time, first: r.first, last: r.last }
}

function perform() {
  const rng = mulberry32(2026)
  const human = () => 0.95 + rng() * 0.1
  const strokes: Stroke[] = []
  let t = START
  let wordStart = 0
  let pen: Pt | null = null // where the pen was lifted
  const n = PEN.length
  PEN.forEach((p, k) => {
    // tempo: opens gently, cruises, lands softly on the last word
    const u = k / (n - 1)
    const tempo = (0.82 + 0.18 * Math.min(1, u / 0.2)) * (1 - 0.14 * Math.max(0, (u - 0.8) / 0.2))
    const cruise = CRUISE[p.weight] * tempo * human()
    let lastDur = 0
    p.strokes.forEach((d, j) => {
      const a = timeAlong(d, cruise)
      if (j > 0 && pen) t += Math.hypot(a.first.x - pen.x, a.first.y - pen.y) / (cruise * AIR) // through the air
      const dur = a.time[a.time.length - 1]
      strokes.push({ letter: k, d, L: a.L, start: t, dur, time: a.time, ds: a.ds })
      t += dur
      lastDur = dur
      pen = a.last
    })
    if (!WORD_ENDS.includes(k)) {
      t -= lastDur * FLOW // already on the way to the next letter
      return
    }
    // strokes that wait for the end of the word — the dot on the i: a quick dab
    for (let m = wordStart; m <= k; m++)
      for (const d of PEN[m].later ?? []) {
        const a = timeAlong(d, CRUISE[PEN[m].weight] * 0.35)
        if (pen) t += Math.hypot(a.first.x - pen.x, a.first.y - pen.y) / (CRUISE[PEN[m].weight] * AIR)
        const dur = a.time[a.time.length - 1]
        strokes.push({ letter: m, d, L: a.L, start: t, dur, time: a.time, ds: a.ds })
        t += dur
        pen = a.last
      }
    t += BREATH
    wordStart = k + 1
  })
  return { strokes, end: t - BREATH + DRY }
}

const PERFORMANCE = perform()
/** How long the title phase lasts, from the card appearing to the room starting to rise. */
export const TITLE_MS = Math.round(PERFORMANCE.end + HOLD)
/** When the pen has lifted and the last ink has settled, from the card appearing. */
export const WRITTEN_MS = Math.round(PERFORMANCE.end)

/** Where the pen is along a stroke `lt` ms after it began (units). */
function headAt(s: Stroke, lt: number) {
  if (lt <= 0) return 0
  if (lt >= s.dur) return s.L
  const T = s.time
  let lo = 0
  let hi = T.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (T[mid] <= lt) lo = mid
    else hi = mid
  }
  const f = (lt - T[lo]) / Math.max(1e-6, T[hi] - T[lo])
  return Math.min(s.L, (lo + f) * s.ds)
}

const smooth = (x: number) => {
  const c = Math.min(1, Math.max(0, x))
  return c * c * (3 - 2 * c)
}

// ---- the card ---------------------------------------------------------------------
function Written({ out }: { out: boolean }) {
  const id = useId().replace(/:/g, '')
  const wet = useRef<(SVGPathElement | null)[]>([])
  const ink = useRef<(SVGPathElement | null)[]>([])
  const reduced = store.get().reducedMotion

  useEffect(() => {
    const S = PERFORMANCE.strokes
    const draw = (t: number) => {
      S.forEach((s, i) => {
        const w = wet.current[i]
        const k = ink.current[i]
        if (!w || !k) return
        const lt = t - s.start
        const head = headAt(s, lt)
        // the solid ink trails the wet edge by WET units, and catches up once the pen has left
        const settle = smooth((lt - s.dur) / DRY)
        const solid = Math.max(0, Math.min(s.L, head - WET * (1 - settle)))
        w.style.strokeDashoffset = head > 0 ? String(1 - head / s.L) : '1.001'
        k.style.strokeDashoffset = solid > 0 ? String(1 - solid / s.L) : '1.001'
      })
    }
    if (reduced) {
      draw(Infinity)
      return
    }
    // design check: window.__title.seek(ms) freezes the card at a moment
    let frozen = false
    ;(window as unknown as { __title?: object }).__title = {
      seek: (ms: number) => {
        frozen = true
        draw(ms)
      },
      duration: TITLE_MS,
    }
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      if (!frozen) draw(now - t0)
      if (now - t0 < PERFORMANCE.end + 100) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduced])

  return (
    <div className={`title-card${out ? ' title-card--out' : ''}${reduced ? ' title-card--calm' : ''}`}>
      <svg className="tc-svg" viewBox="0 -2 627 58" aria-hidden="true">
        <defs>
          {/* a fixed region in the title's own units: a region sized from each letter's pen
              paths would be a sliver for the i (all its strokes are vertical) and clip the blur */}
          <filter id={`${id}-soft`} filterUnits="userSpaceOnUse" x="-20" y="-20" width="700" height="100">
            <feGaussianBlur stdDeviation={SOFT} />
          </filter>
          {GLYPHS.map((_, k) => {
            const nib = NIB[PEN[k].weight]
            const mine = PERFORMANCE.strokes.map((s, i) => (s.letter === k ? i : -1)).filter((i) => i >= 0)
            const common = { pathLength: 1, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeDasharray: '1 2', strokeDashoffset: 1.001 }
            return (
              <mask key={k} id={`${id}-${k}`} maskUnits="userSpaceOnUse" x="-20" y="-20" width="700" height="100">
                {/* the wet edge: lighter and soft, running just ahead */}
                <g filter={`url(#${id}-soft)`}>
                  {mine.map((i) => (
                    <path
                      key={i}
                      ref={(el) => {
                        wet.current[i] = el
                      }}
                      d={PERFORMANCE.strokes[i].d}
                      stroke={`rgb(${Math.round(255 * WET_INK)}, ${Math.round(255 * WET_INK)}, ${Math.round(255 * WET_INK)})`}
                      strokeWidth={nib + 1}
                      {...common}
                    />
                  ))}
                </g>
                {/* the ink, settled */}
                {mine.map((i) => (
                  <path
                    key={i}
                    ref={(el) => {
                      ink.current[i] = el
                    }}
                    d={PERFORMANCE.strokes[i].d}
                    stroke="#fff"
                    strokeWidth={nib}
                    {...common}
                  />
                ))}
              </mask>
            )
          })}
        </defs>
        {GLYPHS.map((g, k) => (
          <path key={k} d={g.d} className="tc-ink" mask={`url(#${id}-${k})`} />
        ))}
      </svg>
    </div>
  )
}

export function TitleCard() {
  const phase = useStore((s) => s.phase)
  if (phase === 'loading') return null
  return <Written out={phase !== 'title'} />
}
