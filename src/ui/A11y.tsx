import { TEAM } from '../cast/team'
import { say } from '../lib/talk'

// Keyboard and screen-reader path: one button per Zenek, in seat order.
export function A11yList() {
  const ordered = [...TEAM].sort((a, b) => b.seat.z - a.seat.z)
  return (
    <ul className="sr-only" aria-label="Zespół">
      {ordered.map((m) => (
        <li key={m.id}>
          <button type="button" onClick={() => say(m.id)}>
            {m.name}
          </button>
        </li>
      ))}
    </ul>
  )
}
