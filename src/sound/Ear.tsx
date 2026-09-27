import { useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { clamp } from '../lib/anim'
import { headRegistry } from '../zenek/motion'
import { HOME, LIMITS, view } from '../scene/view'
import { SOUND, ear, listen } from './engine'

const _v = new Vector3()
const _w = new Vector3()

// The camera is the listener. A sound is placed left–right by where its source is on
// screen, and the mix follows the view: how close it is to the room, how far it has turned.
export function Ear() {
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    if (!SOUND) return
    const at = (x: number, y: number, z: number) => {
      _v.set(x, y, z)
      const dist = _v.distanceTo(camera.position)
      _v.project(camera)
      const x0 = _v.z > 1 ? -_v.x : _v.x // behind the camera: the far side
      return { pan: clamp(x0, -1, 1) * 0.75, dist }
    }
    ear.at = at
    ear.of = (id) => {
      const h = headRegistry.get(id)
      if (!h) return { pan: 0, dist: 28 }
      _w.setFromMatrixPosition(h.matrixWorld)
      return at(_w.x, _w.y, _w.z)
    }
  }, [camera])
  useFrame(() => {
    if (!SOUND) return
    const c = view.state.current
    // 0 at home, 1 zoomed right in, −1 pulled right back
    const close = c.dist < HOME.dist ? Math.log(HOME.dist / c.dist) / Math.log(HOME.dist / LIMITS.minDist) : -Math.log(c.dist / HOME.dist) / Math.log(LIMITS.maxDist / HOME.dist)
    listen(close, c.az - HOME.az)
  })
  return null
}
