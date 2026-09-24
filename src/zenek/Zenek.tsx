import { useMemo, useRef, type RefObject } from 'react'
import { useCursor } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { SphereGeometry, Vector3, type Group, type Mesh } from 'three'
import { CANON, ZR, faceOf, type FaceOverride } from './proportions'
import { capGeometry, onSphere } from './geometry'
import { BODY, BODY_AO, EYE_MAT, PLATE_MAT, ghostOf } from './materials'
import { useSculpt } from './sculptAsset'
import { Part, isFacePart, type PartConfig } from './parts'
import { store, useStore } from '../lib/store'
import type { ArmSpec, Seat } from '../cast/team'

export type ZenekRefs = {
  root: RefObject<Group | null>
  head: RefObject<Group | null>
  eyes: RefObject<Group | null>
  eyeL: RefObject<Mesh | null>
  eyeR: RefObject<Mesh | null>
  hands: RefObject<Group | null>
  handL: RefObject<Group | null> // a hand sphere, or a jointed arm's shoulder
  handR: RefObject<Group | null>
  elbowL: RefObject<Group | null> // jointed arms only
  elbowR: RefObject<Group | null>
}

export function useZenekRefs(): ZenekRefs {
  return { root: useRef(null), head: useRef(null), eyes: useRef(null), eyeL: useRef(null), eyeR: useRef(null), hands: useRef(null), handL: useRef(null), handR: useRef(null), elbowL: useRef(null), elbowR: useRef(null) }
}

const R = ZR
const bodyGeo = new SphereGeometry(R, 72, 48)
const unitGeo = new SphereGeometry(1, 28, 20)
const handGeo = new SphereGeometry(CANON.hand.r * R, 40, 28)
export const HAND_L = new Vector3(-CANON.hand.x * R, CANON.hand.y * R, CANON.hand.z * R)
export const HAND_R = new Vector3(CANON.hand.x * R, CANON.hand.y * R, CANON.hand.z * R)
const noRaycast = () => null
const plateCache = new Map<string, ReturnType<typeof capGeometry>>()

type Props = {
  id: string
  refs: ZenekRefs
  parts: PartConfig[]
  seat: Seat
  face?: FaceOverride
  arms?: ArmSpec // jointed sculpted arms in place of the hand spheres (the left one; the right is its mirror)
  ghost?: boolean
  onTap?: () => void
}

export function Zenek({ id, refs, parts, seat, face, arms, ghost = false, onTap }: Props) {
  const hovered = useStore((s) => s.hover === id) && !ghost
  useCursor(hovered)
  const down = useRef<{ x: number; y: number } | null>(null)
  const F = useMemo(() => faceOf(face), [face])
  const plateGeo = useMemo(() => {
    const key = JSON.stringify(F.plate)
    let g = plateCache.get(key)
    if (!g) {
      g = capGeometry(F.plate.a * R, F.plate.b * R, F.plate.n, R, F.plate.h * R, F.plate.lip * R)
      plateCache.set(key, g)
    }
    return g
  }, [F])
  const plateTilt = Math.asin(F.plate.y)
  const eyeArcY = (Math.asin(F.eye.y) - plateTilt) * R
  const eyeL = useMemo(() => onSphere(-F.eye.dx * R, eyeArcY, F.eye.h * R, R), [F, eyeArcY])
  const eyeR = useMemo(() => onSphere(F.eye.dx * R, eyeArcY, F.eye.h * R, R), [F, eyeArcY])
  const eyeScale: [number, number, number] = [F.eye.rx * R, F.eye.ry * R, F.eye.rz * R]

  const black = ghost ? ghostOf(BODY) : BODY
  const upperGeo = useSculpt(arms?.upper ?? '')
  const foreGeo = useSculpt(arms?.fore ?? '')
  const armMat = ghost ? ghostOf(BODY_AO) : BODY_AO
  const white = ghost ? ghostOf(PLATE_MAT) : PLATE_MAT
  const eye = ghost ? ghostOf(EYE_MAT) : EYE_MAT
  const rc = ghost ? noRaycast : undefined

  const handlers = ghost
    ? {}
    : {
        onPointerDown: (e: ThreeEvent<PointerEvent>) => {
          down.current = { x: e.clientX, y: e.clientY }
        },
        onPointerUp: (e: ThreeEvent<PointerEvent>) => {
          const d = down.current
          down.current = null
          if (!d) return
          if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) {
            e.stopPropagation()
            onTap?.()
          }
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          store.set({ hover: id })
        },
        onPointerOut: () => {
          if (store.get().hover === id) store.set({ hover: null })
        },
      }

  const ctx = { R, face: F, ghost }
  return (
    <group ref={refs.root} position={[seat.x, seat.y + R * (seat.scale ?? 1), seat.z]} rotation-y={seat.yaw} scale={seat.scale ?? 1} {...handlers}>
      <group ref={refs.head}>
        <mesh geometry={bodyGeo} material={black} raycast={rc} castShadow receiveShadow />
        {/* face frame: plate centre pitched up to its measured height */}
        <group rotation-x={-plateTilt}>
          <mesh geometry={plateGeo} material={white} raycast={rc} />
          <group ref={refs.eyes}>
            <mesh ref={refs.eyeL} geometry={unitGeo} material={eye} position={eyeL} scale={eyeScale} raycast={rc} />
            <mesh ref={refs.eyeR} geometry={unitGeo} material={eye} position={eyeR} scale={eyeScale} raycast={rc} />
          </group>
          {parts.filter(isFacePart).map((p, i) => (
            <Part key={`f${i}`} cfg={p} ctx={ctx} />
          ))}
        </group>
        {parts.filter((p) => !isFacePart(p)).map((p, i) => (
          <Part key={`h${i}`} cfg={p} ctx={ctx} />
        ))}
      </group>
      {/* the hands follow the body's turn, a beat behind */}
      <group ref={refs.hands}>
        {arms && upperGeo && foreGeo ? (
          ([-1, 1] as const).map((s) => (
            // the right arm is the left one mirrored; motion turns the shoulder and the elbow
            <group key={s} ref={s < 0 ? refs.handL : refs.handR} position={[s * -arms.shoulder[0] * R, arms.shoulder[1] * R, arms.shoulder[2] * R]} scale={[-s, 1, 1]}>
              <mesh geometry={upperGeo} material={armMat} scale={R * (arms.scale ?? 1)} raycast={rc} castShadow />
              <group ref={s < 0 ? refs.elbowL : refs.elbowR} position={[arms.elbow[0] * R * (arms.scale ?? 1), arms.elbow[1] * R * (arms.scale ?? 1), arms.elbow[2] * R * (arms.scale ?? 1)]}>
                <mesh geometry={foreGeo} material={armMat} scale={R * (arms.scale ?? 1)} raycast={rc} castShadow />
              </group>
            </group>
          ))
        ) : (
          <>
            <group ref={refs.handL} position={HAND_L}>
              <mesh geometry={handGeo} material={black} raycast={rc} castShadow />
            </group>
            <group ref={refs.handR} position={HAND_R}>
              <mesh geometry={handGeo} material={black} raycast={rc} castShadow />
            </group>
          </>
        )}
      </group>
    </group>
  )
}
