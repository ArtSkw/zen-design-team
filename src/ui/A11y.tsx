import { TEAM } from '../cast/team'
import { store } from '../lib/store'

// Keyboard and screen-reader path: one button per Zenek, in seat order.
export function A11yList() {
  const ordered = [...TEAM].sort((a, b) => b.seat.z - a.seat.z)
  return (
    <ul className="sr-only" aria-label="Zespół">
      {ordered.map((m) => (
        <li key={m.id}>
          <button type="button" onClick={() => store.set({ active: store.get().active === m.id ? null : m.id })}>
            {m.name}
          </button>
        </li>
      ))}
    </ul>
  )
}
