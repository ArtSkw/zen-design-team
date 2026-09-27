import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { store, useStore } from '../lib/store'
import { clamp, easeInOutSine, easeOutCubic, lerp, smoothstep } from '../lib/anim'
import { sfx } from '../sound/cues'
import { CONTINUE_LABEL } from './button-label'

// "Kontynuuj" (owner-directed 2026-09-27): when — and only when — the browser holds the
// sound back until the visitor's first touch (src/App.tsx asks), the loader's finished
// check becomes the design system's regular button (docs/ds/button-regular.svg). A circle
// is a pill as wide as it is tall, so the ring itself opens into the button: it gathers a
// hair as the check pops away, then springs out sideways, uncovering the word from the
// middle. A press (or Enter or Space) clicks in wood; the pill folds back into a circle,
// gathers into a drop of ink the size of the loader's own dot, and the drop sinks into
// the page as the pen begins the title. It takes over from the loader's mark at the very
// same place, drawn the same (2 px #222), so the hand-over cannot be seen.
const W = 240
const H = 68
const PX = 34 // room around the button in the drawing: the overshoot, the drop's last pop
const PY = 30
const VW = W + 2 * PX
const VH = H + 2 * PY
const CX = VW / 2
const CY = VH / 2
const RING = 58 // the loader's ring: r 29, stroked 2 px (Loader)
const GATHER = 54
const DROP = 4 // stroked 2 px: a 6 px drop, the loader's dot
const CHECK = 'M20.4 30.9 L27.4 37.7 L40 25' // the loader's check, about its ring's centre (30, 30)
const IN_S = 1.35 // the opening has settled
const OUT_DONE = 0.45 // the title may begin
const OUT_S = 0.72 // the drop is gone

const easeInBack = (u: number, k: number) => u * u * ((k + 1) * u - k)
const easeInCubic = (u: number) => u * u * u
const easeInOutCubic = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2)

/** A damped spring from 0 to 1, `f` its frequency (Hz), `z` its damping: under 1, it overshoots once, a little. */
function spring(t: number, f: number, z: number) {
  if (t <= 0) return 0
  const w = 2 * Math.PI * f
  const r = Math.sqrt(1 - z * z)
  return 1 - Math.exp(-z * w * t) * (Math.cos(w * r * t) + (z / r) * Math.sin(w * r * t))
}

type Pose = { w: number; h: number; check: number; checkA: number; label: number; labelA: number; fill: number | null; scale: number; alpha: number }

/** From the loader's finished check (t = 0) to the button (settled by IN_S). */
function opening(t: number): Pose {
  const g = easeInOutSine(clamp(t / 0.14, 0, 1)) // the ring gathers a hair…
  const size = lerp(RING, GATHER, g)
  const ws = spring(t - 0.15, 2.1, 0.66) // …then springs out sideways,
  const hs = spring(t - 0.13, 3.2, 0.5) // and up to the button's height
  const thin = 3 * Math.sin(Math.PI * clamp((t - 0.15) / 0.35, 0, 1)) // a little thinner while it opens fastest
  const cu = clamp((t - 0.1) / 0.2, 0, 1) // the check pops (a touch bigger first) and is gone
  return {
    w: t < 0.15 ? size : lerp(GATHER, W - 2, ws),
    h: t < 0.13 ? size : lerp(GATHER, H - 2, hs) - thin,
    check: (1 - 0.15 * g) * (1 - easeInBack(cu, 2.2)),
    checkA: 1 - smoothstep((cu - 0.5) / 0.5),
    label: lerp(0.9, 1, clamp(ws, 0, 1.05)),
    labelA: smoothstep((t - 0.2) / 0.3),
    fill: null,
    scale: 1,
    alpha: 1,
  }
}

/** Pressed (t = 0): the word goes, the pill folds into a circle, the circle into a drop, the drop into the page. */
function closing(t: number): Pose {
  const lu = clamp(t / 0.12, 0, 1)
  const fold = easeInOutCubic(clamp((t - 0.03) / 0.3, 0, 1))
  const drop = easeInCubic(clamp((t - 0.33) / 0.17, 0, 1))
  const sink = easeOutCubic(clamp((t - 0.5) / 0.22, 0, 1))
  const size = lerp(GATHER, DROP, drop)
  const w = t < 0.33 ? lerp(W - 2, GATHER, fold) : size
  const h = t < 0.33 ? lerp(H - 2, GATHER, fold) : size
  return { w, h, check: 0, checkA: 0, label: 1 - 0.06 * lu, labelA: 1 - easeOutCubic(lu), fill: smoothstep((24 - Math.min(w, h)) / 18), scale: 1 + 0.8 * sink, alpha: 1 - sink }
}

const SETTLED = opening(IN_S)

export function Press() {
  const press = useStore((s) => s.press)
  const reduced = useStore((s) => s.reducedMotion)
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const [ready, setReady] = useState(false)
  const [alive, setAlive] = useState(false)
  const art = useRef<SVGGElement>(null)
  const pill = useRef<SVGRectElement>(null)
  const inside = useRef<SVGRectElement>(null)
  const check = useRef<SVGGElement>(null)
  const label = useRef<SVGGElement>(null)
  const running = useRef<(() => void) | null>(null) // stops whichever animation is playing
  const frozen = useRef(false)

  const draw = (p: Pose) => {
    const [a, pl, ins, ck, lb] = [art.current, pill.current, inside.current, check.current, label.current]
    if (!a || !pl || !ins || !ck || !lb) return
    const r = Math.min(p.w, p.h) / 2
    const set = (el: SVGRectElement, x: number, y: number, w: number, h: number, rr: number) => {
      el.setAttribute('x', `${x}`)
      el.setAttribute('y', `${y}`)
      el.setAttribute('width', `${Math.max(0, w)}`)
      el.setAttribute('height', `${Math.max(0, h)}`)
      el.setAttribute('rx', `${Math.max(0, rr)}`)
    }
    set(pl, CX - p.w / 2, CY - p.h / 2, p.w, p.h, r)
    set(ins, CX - p.w / 2 + 1, CY - p.h / 2 + 1, p.w - 2, p.h - 2, r - 1) // the word is seen only inside the pill
    const about = (s: number) => `translate(${CX} ${CY}) scale(${s}) translate(${-CX} ${-CY})`
    ck.setAttribute('transform', about(p.check))
    ck.style.opacity = `${p.checkA}`
    lb.setAttribute('transform', about(p.label))
    lb.style.opacity = `${p.labelA}`
    a.setAttribute('transform', about(p.scale))
    a.style.opacity = `${p.alpha}`
    pl.style.fill = p.fill == null ? '' : `rgba(34, 34, 34, ${p.fill})`
  }

  /**
   * Plays `pose` from 0 to `until` seconds on the frame clock, then `end`. Returns its own
   * stop: the opening's cleanup must never stop the closing that follows it.
   */
  const play = (pose: (t: number) => Pose, until: number, end: () => void, marks: [number, () => void][] = []) => {
    running.current?.()
    frozen.current = false
    let id = 0
    let t = 0
    let last = -1
    const tick = (now: number) => {
      if (frozen.current) return
      t += last < 0 ? 0 : Math.min(0.05, (now - last) / 1000)
      last = now
      for (const m of [...marks]) if (t >= m[0]) (marks.splice(marks.indexOf(m), 1), m[1]())
      draw(pose(Math.min(t, until)))
      if (t < until) id = requestAnimationFrame(tick)
      else end()
    }
    id = requestAnimationFrame(tick)
    const stop = () => cancelAnimationFrame(id)
    running.current = stop
    return stop
  }

  // the hand-over: exactly where the loader's ring is (it hides the same instant: Loader)
  useLayoutEffect(() => {
    if (press !== 'waiting') return
    const place = () => {
      const r = document.querySelector('.dsl__mark')?.getBoundingClientRect()
      setAt(r ? { x: r.left + 30, y: r.top + 30 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 - 1 })
    }
    place()
    setAlive(true)
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [press])

  // the check opens into the button
  useLayoutEffect(() => {
    if (!at || press !== 'waiting' || ready) return
    if (reduced) {
      draw({ ...SETTLED })
      setReady(true)
      return
    }
    draw(opening(0))
    return play(opening, IN_S, () => setReady(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at, press])

  const go = () => {
    if (store.get().press !== 'waiting') return
    store.set({ press: 'pressed' })
    sfx.control() // its first sound is the controls' own wooden click
    const done = () => store.set({ press: 'done' })
    if (reduced) {
      setTimeout(done, 150)
      setTimeout(() => setAlive(false), 260)
      return
    }
    play(closing, OUT_S, () => setAlive(false), [[OUT_DONE, done]])
  }

  // Enter or Space from anywhere, as well as a press on the button itself
  useEffect(() => {
    if (press !== 'waiting') return
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      go()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [press])

  useEffect(() => {
    if (import.meta.env.DEV && press !== 'idle') console.debug(`[press] ${press}`) // scripts/debug-press.mjs listens
  }, [press])
  useEffect(() => {
    if (import.meta.env.DEV && ready) console.debug('[press] open') // the button has settled
  }, [ready])

  // design check (dev only): window.__press.seek(t, 'in' | 'out') freezes the button at a moment
  useEffect(() => {
    if (!import.meta.env.DEV || !alive) return
    ;(window as unknown as { __press?: object }).__press = {
      seek: (t: number, which: 'in' | 'out' = 'in') => {
        frozen.current = true
        running.current?.()
        draw((which === 'in' ? opening : closing)(t))
      },
    }
  }, [alive])

  if (!alive || !at) return null
  return (
    <button
      type="button"
      className={`kont${ready && press === 'waiting' ? ' kont--ready' : ''}${reduced && press !== 'waiting' ? ' kont--calm-out' : ''}`}
      style={{ left: at.x - W / 2, top: at.y - H / 2 }}
      aria-label="Kontynuuj"
      disabled={press !== 'waiting'}
      onClick={go}
    >
      <svg className="kont__art" width={VW} height={VH} viewBox={`0 0 ${VW} ${VH}`} aria-hidden="true">
        <defs>
          <clipPath id="kont-inside">
            <rect ref={inside} />
          </clipPath>
        </defs>
        <g ref={art}>
          <rect ref={pill} className="kont__pill" />
          <g ref={check}>
            <path className="kont__check" d={CHECK} transform={`translate(${CX - 30} ${CY - 30})`} />
          </g>
          <g clipPath="url(#kont-inside)">
            <g ref={label} style={{ opacity: 0 }}>
              <path className="kont__label" d={CONTINUE_LABEL} transform={`translate(${CX - W / 2} ${CY - H / 2})`} />
            </g>
          </g>
        </g>
      </svg>
    </button>
  )
}
