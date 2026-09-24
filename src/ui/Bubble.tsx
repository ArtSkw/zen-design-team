import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { byId } from '../cast/team'
import { LINES } from '../cast/lines'
import { store, useStore } from '../lib/store'
import { say } from '../lib/talk'

// Every bubble on screen: the one speaking, and for a moment the one leaving. The projector
// (inside the canvas) moves each above its Zenek's head every frame. It moves only a
// transform on the bubble's own layer: no layout, no repaint — a bubble is painted once, and
// measured only when its size changes (not by reading it every frame).
export type BubbleEl = {
  id: string
  pos: HTMLDivElement // the positioned layer
  box: HTMLDivElement // the bubble itself (its tail follows --tail-x)
  w: number
  h: number
  tail: number
}
export const bubbles = new Set<BubbleEl>()

// A bubble leaves slowly when it has been read (the words first, then the bubble draws back
// into the speaker), quickly when another Zenek takes the floor.
type Out = false | 'read' | 'quick'
type Shown = { key: number; id: string; line: number; n: number; out: Out }

const AT_TAIL = 'translate(-50%, -100%)' // the bubble's own offset (styles.css), kept under any scale

// Polish typesetting: a one-letter word (a, i, o, u, w, z) never ends a line — it is tied
// to the word after it with a no-break space.
const tie = (text: string) =>
  text
    .split(' ')
    .map((w, i, all) => (i === all.length - 1 ? w : w + (/^[aiouwz]$/i.test(w) ? '\u00a0' : ' ')))
    .join('')

// A wrapped line is balanced (`text-wrap: balance`), but its box keeps the full max-width,
// leaving an empty band at the right. Narrow the words to their longest line — measured once
// per line, never per frame, and undone if it would cost a line.
function hug(p: HTMLParagraphElement) {
  p.style.width = ''
  const lines = () => {
    const r = document.createRange()
    r.selectNodeContents(p)
    return [...r.getClientRects()]
  }
  const before = lines()
  if (before.length < 2) return
  const scale = p.getBoundingClientRect().width / p.offsetWidth || 1 // it may be mid scale-in
  p.style.width = `${Math.ceil(Math.max(...before.map((q) => q.width)) / scale) + 1}px`
  if (lines().length !== before.length) p.style.width = ''
}

function Bubble({ id, line, n, out, onGone }: Omit<Shown, 'key'> & { onGone: () => void }) {
  const pos = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const words = useRef<HTMLParagraphElement>(null)
  const first = useRef(n)
  const breath = useRef<Animation | null>(null)
  const gone = useRef(onGone)
  gone.current = onGone
  useLayoutEffect(() => {
    const p = pos.current
    const b = box.current
    if (!p || !b) return
    const el: BubbleEl = { id, pos: p, box: b, w: b.offsetWidth, h: b.offsetHeight, tail: -1 }
    bubbles.add(el)
    const ro = new ResizeObserver(() => {
      el.w = b.offsetWidth
      el.h = b.offsetHeight
    })
    ro.observe(b)
    return () => {
      ro.disconnect()
      bubbles.delete(el)
    }
  }, [id])
  useLayoutEffect(() => {
    if (words.current) hug(words.current)
  }, [n])
  // the next line: the words change in place and the bubble takes a small breath
  useEffect(() => {
    if (n === first.current || store.get().reducedMotion) return
    breath.current = box.current?.animate([{ transform: `${AT_TAIL} scale(0.96)` }, { transform: `${AT_TAIL} scale(1)` }], {
      duration: 280,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
    }) ?? null
  }, [n])
  // gone when its exit ends (its animationend), or anyway soon after (a hidden tab)
  useEffect(() => {
    if (!out) return
    breath.current?.cancel() // it would hold the exit's transform
    const t = setTimeout(() => gone.current(), 900)
    return () => clearTimeout(t)
  }, [out])
  return (
    <div ref={pos} className="bubble-pos" style={{ transform: 'translate3d(-9999px, 0, 0)' }} aria-hidden="true">
      <div
        ref={box}
        className={`bubble${out ? ` bubble--out bubble--${out}` : ''}`}
        onClick={out ? undefined : () => say(id)}
        onAnimationEnd={(e) => {
          if (out && e.target === e.currentTarget) gone.current()
        }}
      >
        <p key={n} ref={words} className={`bubble__quote${n === first.current ? '' : ' bubble__quote--next'}`}>
          {tie(LINES[id]?.[line] ?? '')}
        </p>
      </div>
    </div>
  )
}

export function BubbleLayer() {
  const active = useStore((s) => s.active)
  const line = useStore((s) => s.line)
  const said = useStore((s) => s.said)
  const [shown, setShown] = useState<Shown[]>([])
  // the speaker's next line changes its words in place; any other bubble leaves
  useLayoutEffect(() => {
    setShown((list) => {
      const kept = list.map((b): Shown => (b.out ? b : b.id === active ? { ...b, line, n: said } : { ...b, out: active ? 'quick' : 'read' }))
      return active && !kept.some((b) => b.id === active && !b.out) ? [...kept, { key: said, id: active, line, n: said, out: false }] : kept
    })
  }, [active, line, said])
  const speaker = active ? byId(active) : undefined
  return (
    <div className="bubble-layer">
      {shown.map((b) => (
        <Bubble key={b.key} id={b.id} line={b.line} n={b.n} out={b.out} onGone={() => setShown((list) => list.filter((x) => x.key !== b.key))} />
      ))}
      <p className="sr-only" aria-live="polite">
        {speaker ? `${speaker.name}: ${LINES[speaker.id]?.[line] ?? ''}` : ''}
      </p>
    </div>
  )
}
