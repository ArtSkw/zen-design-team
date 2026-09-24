import { useEffect, useRef } from 'react'
import { byId } from '../cast/team'
import { useStore } from '../lib/store'

// The projector (inside the canvas) positions this element every frame.
export const bubbleEl: { current: HTMLDivElement | null } = { current: null }

function Bubble({ id }: { id: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const member = byId(id)
  useEffect(() => {
    bubbleEl.current = ref.current
    return () => {
      bubbleEl.current = null
    }
  }, [])
  if (!member) return null
  const quote = member.quote.trim()
  return (
    <div ref={ref} className="bubble" role="dialog" aria-live="polite" style={{ left: -9999 }}>
      <p className={`bubble__quote${quote ? '' : ' bubble__quote--placeholder'}`}>{quote || 'Tu wkrótce pojawi się mój cytat.'}</p>
    </div>
  )
}

export function BubbleLayer() {
  const active = useStore((s) => s.active)
  return <div className="bubble-layer">{active && <Bubble key={active} id={active} />}</div>
}
