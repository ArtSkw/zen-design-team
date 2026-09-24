import { useEffect, useRef, useState } from 'react'
import { store, useStore } from '../lib/store'
import { DEBUG } from '../lib/params'
import { easeInOutSine, easeOutCubic, hermite, kf, lerp, smoothstep } from '../lib/anim'
import { TitleCard } from './TitleCard'

// The design-system loader: a ring with a notch and a dot at its head, turning at a
// steady pace. When the load completes the motion carries on from wherever the ring
// is — nothing resets: the dot shrinks into the line and is gone, the ring's tail
// brakes while its head sweeps on through the notch to close the circle, and the
// check writes itself in, left to right, with a pen's rhythm. The mark gathers a
// little as the circle closes and pops when the pen lifts. After `loaded`, in
// seconds: dot 0–0.14 · circle 0–0.42 · check 0.3–0.62 · pop settled by 0.88. At 1.1
// the mark leaves and the title card writes itself in on the same curtain; the
// curtain lifts when the title is done (App).
const R = 29
const C = 2 * Math.PI * R
const RATE = 360 // deg/s while loading — a turn a second
const CLOSE = 0.42 // the circle closes and the ring comes to rest
const DOT_OUT = 0.14
const DRAW = { at: 0.3, dur: 0.32 }
const END = 0.88
const CHECK = 'M20.4 30.9 L27.4 37.7 L40 25' // the DS check, left → right
const CORNER = 0.353 // share of the check's length before its corner
const CAP = 1 / 2.9 // dot scale at which it is exactly the line's round end

type Pose = {
  tail: number // where the arc starts, degrees clockwise from 3 o'clock
  arc: number // how much of the ring is drawn, degrees
  dot: number // 1 = full dot, 0 = merged into the line
  ink: number // how much of the check is drawn, 0..1
  scale: number
}

// while loading: a steady turn, the notch at the bottom-left, the dot at the head
const spinning = (angle: number): Pose => ({ tail: 180 + angle, arc: 270, dot: 1, ink: 0, scale: 1 })

// the completion, from the angle the ring had reached when the load finished
function finishing(angle: number, s: number): Pose {
  const tail0 = 180 + angle
  const coast = (RATE * CLOSE) / 3 // a cubic brake from RATE travels a third of rate × time
  // the head leaves at the ring's own rate — no speed jump — and meets the tail as it stops
  const head = hermite(tail0 + 270, RATE, tail0 + coast + 360, 0, CLOSE, s)
  const tail = tail0 + coast * easeOutCubic(s / CLOSE)
  return {
    tail,
    arc: Math.min(360, head - tail),
    dot: 1 - easeInOutSine(s / DOT_OUT),
    ink: pen((s - DRAW.at) / DRAW.dur),
    scale: kf([[0, 1], [CLOSE, 0.975], [DRAW.at + DRAW.dur, 1.05], [0.74, 0.99], [END, 1]], s),
  }
}

// the pen's progress along the check: eases in, slows into the corner, sweeps the long
// stroke and lifts while still moving
function pen(u: number) {
  if (u <= 0) return 0
  if (u >= 1) return 1
  const turn = 0.4 // share of the time spent on the short stroke
  return u < turn ? hermite(0, 0.5, CORNER, 0.6, turn, u) : hermite(CORNER, 0.6, 1, 0.7, 1 - turn, u - turn)
}

export function Loader() {
  const phase = useStore((s) => s.phase)
  const loaded = useStore((s) => s.loaded)
  const [gone, setGone] = useState(!DEBUG.intro)
  const spinRef = useRef<HTMLDivElement>(null)
  const markRef = useRef<SVGGElement>(null)
  const ringRef = useRef<SVGCircleElement>(null)
  const dotRef = useRef<SVGCircleElement>(null)
  const checkRef = useRef<SVGPathElement>(null)
  const markOut = phase !== 'loading'
  const out = phase === 'intro' || phase === 'ready' // the curtain lifts

  // The spin runs on the compositor (a Web Animation on an HTML box), so it stays smooth
  // while shaders compile and textures upload on the main thread. When the load
  // completes, its angle is read back and the rAF-driven finish takes over from there.
  useEffect(() => {
    const box = spinRef.current
    const mark = markRef.current
    const ring = ringRef.current
    const dot = dotRef.current
    const check = checkRef.current
    if (!box || !mark || !ring || !dot || !check || gone) return
    let calm = false // reduced motion: the finish keeps its drawing but drops the dip and pop
    const render = (p: Pose) => {
      ring.style.transform = `rotate(${p.tail}deg)`
      ring.style.strokeDasharray = `${(p.arc / 360) * C} ${C}`
      const a = ((p.tail + p.arc) * Math.PI) / 180
      dot.style.transform = `translate(${30 + R * Math.cos(a)}px, ${30 + R * Math.sin(a)}px) scale(${lerp(CAP, 1, p.dot)})`
      dot.style.opacity = String(smoothstep(p.dot / 0.35))
      // a growing dash rather than an offset: an offset of 1 leaves a zero-length dash
      // at the far end, and its round cap shows as a speck
      check.style.strokeDasharray = `${p.ink} 2`
      check.style.visibility = p.ink > 0 ? 'visible' : 'hidden'
      mark.style.transform = `scale(${calm ? 1 : p.scale})`
    }
    render(spinning(0))
    const period = (360 / RATE) * 1000
    const spin = box.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], { duration: period, iterations: Infinity })

    let raf = 0
    let finished = false
    const finish = () => {
      finished = true
      calm = store.get().reducedMotion
      const frozen = DEBUG.loaderT >= 0
      const from = frozen ? DEBUG.loaderAngle : (Number(spin.currentTime ?? 0) / period) * 360
      spin.cancel()
      let s = frozen ? DEBUG.loaderT : 0
      render(finishing(from, s)) // same task: the ring now holds the angle the box had
      if (frozen) return
      // the frame clock the spin's angle was read on — performance.now() runs a few ms
      // ahead of it and would make the first step short
      let last = Number(document.timeline.currentTime ?? performance.now())
      const tick = (now: number) => {
        s += Math.min(0.05, (now - last) / 1000) // clamped, so a hitch can't make it jump
        last = now
        render(finishing(from, s))
        if (s < END) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }
    const onStore = () => {
      if (!finished && store.get().loaded) finish()
    }
    const unsub = store.subscribe(onStore)
    onStore()
    return () => {
      unsub()
      spin.cancel()
      cancelAnimationFrame(raf)
    }
  }, [gone])

  useEffect(() => {
    if (!out || gone) return
    const t = setTimeout(() => setGone(true), 1000)
    return () => clearTimeout(t)
  }, [out, gone])
  if (gone) return null

  return (
    <div className={`loader${markOut ? ' loader--mark-out' : ''}${out ? ' loader--out' : ''}`} aria-hidden="true">
      <TitleCard />
      <div className={`dsl${loaded ? ' dsl--done' : ''}`}>
        <div ref={spinRef} className="dsl__spin">
          <svg className="dsl__mark" width="60" height="62" viewBox="0 0 60 62" fill="none">
            <g ref={markRef} className="dsl__pop">
              <circle ref={ringRef} className="dsl__ring" cx="30" cy="30" r={R} style={{ transform: 'rotate(180deg)', strokeDasharray: `${0.75 * C} ${C}` }} />
              <path ref={checkRef} className="dsl__check" d={CHECK} pathLength={1} />
              <circle ref={dotRef} className="dsl__dot" r="2.9" style={{ transform: 'translate(30px, 59px)' }} />
            </g>
          </svg>
        </div>
      </div>
    </div>
  )
}
