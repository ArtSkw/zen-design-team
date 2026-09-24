import { useLayoutEffect, useRef } from 'react'
import { byId } from '../cast/team'
import { useStore } from '../lib/store'

// The projector (inside the canvas) moves this every frame, above the tapped Zenek. It
// moves only a transform on its own layer: no layout, no repaint — the bubble is painted
// once, and measured only when its size changes (not by reading it every frame).
export const bubbleEl = {
  pos: null as HTMLDivElement | null, // the positioned layer
  box: null as HTMLDivElement | null, // the bubble itself (its tail follows --tail-x)
  w: 0,
  h: 0,
  tail: -1,
}

function Bubble({ id }: { id: string }) {
  const pos = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const member = byId(id)
  useLayoutEffect(() => {
    const p = pos.current
    const b = box.current
    if (!p || !b) return
    const measure = () => {
      bubbleEl.w = b.offsetWidth
      bubbleEl.h = b.offsetHeight
    }
    measure()
    Object.assign(bubbleEl, { pos: p, box: b, tail: -1 })
    const ro = new ResizeObserver(measure)
    ro.observe(b)
    return () => {
      ro.disconnect()
      Object.assign(bubbleEl, { pos: null, box: null })
    }
  }, [])
  if (!member) return null
  const quote = member.quote.trim()
  return (
    <div ref={pos} className="bubble-pos" style={{ transform: 'translate3d(-9999px, 0, 0)' }}>
      <div ref={box} className="bubble" role="dialog" aria-live="polite">
        <p className={`bubble__quote${quote ? '' : ' bubble__quote--placeholder'}`}>{quote || 'Tu wkrótce pojawi się mój cytat.'}</p>
      </div>
    </div>
  )
}

export function BubbleLayer() {
  const active = useStore((s) => s.active)
  return <div className="bubble-layer">{active && <Bubble key={active} id={active} />}</div>
}
