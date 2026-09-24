import type { ReactNode } from 'react'
import { DEBUG } from '../lib/params'

// Full-screen scene. The stage is the viewport.
export function Frame({ children }: { children: ReactNode }) {
  return <div className={`stage${DEBUG.lab ? ' stage--lab' : ''}`}>{children}</div>
}
