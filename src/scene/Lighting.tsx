import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import type { DirectionalLight } from 'three'
import { LITE, P as PP } from '../lib/params'

// Studio light for a diorama on a white page: one key from the right-front-top
// (soft shadows to the back-left, as in the reference render), a big soft top
// panel, neutral fills. Neutral on purpose (2026-09-23): a warm rig made the room
// read beige against the near-white drawn world around it.
function Key() {
  const ref = useRef<DirectionalLight>(null)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const l = ref.current
    if (!l) return
    l.target.position.set(9, 0.8, -5.7)
    scene.add(l.target)
    l.target.updateMatrixWorld()
    return () => {
      scene.remove(l.target)
    }
  }, [scene])
  return (
    <directionalLight
      ref={ref}
      position={[20, 19, 7]}
      intensity={PP.num('key', 2.3)}
      color="#fffaf4"
      castShadow
      shadow-mapSize-width={LITE ? 1024 : 2048}
      shadow-mapSize-height={LITE ? 1024 : 2048}
      shadow-bias={-0.0002}
      shadow-normalBias={0.02}
      shadow-blurSamples={LITE ? 8 : 16}
      shadow-camera-left={-13}
      shadow-camera-right={13}
      shadow-camera-top={12}
      shadow-camera-bottom={-12}
      shadow-camera-near={5}
      shadow-camera-far={60}
      shadow-radius={LITE ? 3.5 : 7} // the same softness in the world at half the map
    />
  )
}

export function Lighting() {
  return (
    <>
      <Key />
      <hemisphereLight args={['#ffffff', '#8a9494', 0.4]} />
      <Environment resolution={256} frames={1} environmentIntensity={PP.num('env', 0.9)}>
        <Lightformer form="rect" intensity={1.6} color="#ffffff" position={[9, 14, -5.7]} rotation={[Math.PI / 2, 0, 0]} scale={[34, 26, 1]} />
        <Lightformer form="rect" intensity={1.5} color="#fff3e8" position={[28, 6, -4]} rotation={[0, -Math.PI / 2, 0]} scale={[18, 10, 1]} />
        <Lightformer form="rect" intensity={0.5} color="#e9f0f6" position={[-12, 6, -5.7]} rotation={[0, Math.PI / 2, 0]} scale={[18, 10, 1]} />
        <Lightformer form="rect" intensity={0.45} color="#eef2f5" position={[9, 5, 16]} rotation={[0, Math.PI, 0]} scale={[34, 10, 1]} />
        <Lightformer form="rect" intensity={0.3} color="#dcdcda" position={[9, -6, -5.7]} rotation={[-Math.PI / 2, 0, 0]} scale={[34, 26, 1]} />
      </Environment>
    </>
  )
}
