import { useEffect, useState } from 'react'
import { byId } from '../cast/team'
import { useStore } from '../lib/store'

// Positioned by the projector (inside the canvas) above the hovered Zenek.
export const nameEl: { current: HTMLDivElement | null } = { current: null }

export function NameTag() {
  const hover = useStore((s) => s.hover)
  const active = useStore((s) => s.active)
  const [label, setLabel] = useState('')
  useEffect(() => {
    if (hover) setLabel(byId(hover)?.name ?? '')
  }, [hover])
  const on = !!hover && hover !== active
  return (
    <div
      ref={(el) => {
        nameEl.current = el
      }}
      className={`nametag${on ? ' nametag--on' : ''}`}
      style={{ left: -9999 }}
      aria-hidden="true"
    >
      {label}
    </div>
  )
}
