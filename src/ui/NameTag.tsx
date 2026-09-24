import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { byId } from '../cast/team'
import { useStore } from '../lib/store'

// Moved by the projector (inside the canvas) above the hovered Zenek — a transform on its
// own layer, measured only when the name changes (see Bubble).
export const nameEl = { pos: null as HTMLDivElement | null, w: 0, h: 0 }

export function NameTag() {
  const hover = useStore((s) => s.hover)
  const active = useStore((s) => s.active)
  const [label, setLabel] = useState('')
  const pos = useRef<HTMLDivElement>(null)
  const tag = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (hover) setLabel(byId(hover)?.name ?? '')
  }, [hover])
  useLayoutEffect(() => {
    const t = tag.current
    if (!t) return
    const measure = () => {
      nameEl.w = t.offsetWidth
      nameEl.h = t.offsetHeight
    }
    measure()
    nameEl.pos = pos.current
    const ro = new ResizeObserver(measure)
    ro.observe(t)
    return () => {
      ro.disconnect()
      nameEl.pos = null
    }
  }, [])
  const on = !!hover && hover !== active
  return (
    <div ref={pos} className="nametag-pos" style={{ transform: 'translate3d(-9999px, 0, 0)' }} aria-hidden="true">
      <div ref={tag} className={`nametag${on ? ' nametag--on' : ''}`}>
        {label}
      </div>
    </div>
  )
}
