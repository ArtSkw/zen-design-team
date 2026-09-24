import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { Box3, Vector3 } from 'three'
import { ZR } from '../zenek/proportions'

// Lab only (`?lab=<id>&glb=<path>`): an image-to-3D result (scripts/gen3d.mjs) standing
// where the Zenek would, for side-by-side review. Scaled so its width matches a Zenek's
// hand span (2.64 R, or `?glbw=` in R), feet on the seat; `?glbyaw=` turns it (degrees).
// Loaded lazily, so the GLTF loader never reaches the shipped bundle's first chunk.
export default function GlbRef({ url, at, width, yaw }: { url: string; at: [number, number, number]; width: number; yaw: number }) {
  const { scene } = useGLTF(url)
  const { obj, s, lift } = useMemo(() => {
    const o = scene.clone(true)
    const box = new Box3().setFromObject(o)
    const size = box.getSize(new Vector3())
    const c = box.getCenter(new Vector3())
    o.position.set(-c.x, -box.min.y, -c.z)
    o.traverse((n) => {
      n.castShadow = true
    })
    return { obj: o, s: (width * ZR) / Math.max(size.x, size.z * 0.6, 1e-6), lift: 0 }
  }, [scene, width])
  return (
    <group position={[at[0], at[1] + lift, at[2]]} rotation-y={(yaw * Math.PI) / 180} scale={s}>
      <primitive object={obj} />
    </group>
  )
}
