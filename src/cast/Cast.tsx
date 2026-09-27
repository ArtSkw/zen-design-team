import { Suspense, lazy, useEffect, useRef } from 'react'
import type { Group } from 'three'
import { ENTRANCE_ORDER, TEAM, type Member } from './team'
import { Zenek, useZenekRefs } from '../zenek/Zenek'
import { headRegistry, useMirror, useZenekMotion } from '../zenek/motion'
import { say } from '../lib/talk'
import { DEBUG, P } from '../lib/params'
import { notInWater } from '../set/Reflector'

// dev only: the published page never loads a model named in the URL
const GlbRef = import.meta.env.DEV ? lazy(() => import('./GlbRef')) : null

function Seated({ member, order }: { member: Member; order: number }) {
  const refs = useZenekRefs()
  const ghostRefs = useZenekRefs()
  const motion = useZenekMotion(member, refs, order)
  useMirror(refs, ghostRefs)

  useEffect(() => {
    const head = refs.head.current
    if (head) headRegistry.set(member.id, head)
    return () => {
      headRegistry.delete(member.id)
    }
  }, [member.id, refs.head])

  const onTap = () => {
    say(member.id)
    motion.tap()
  }

  return (
    <>
      <Zenek id={member.id} refs={refs} parts={member.parts} face={member.face} arms={member.arms} seat={member.seat} onTap={onTap} />
      {DEBUG.ghost && (
        <group scale={[1, -1, 1]}>
          <Zenek id={member.id} refs={ghostRefs} parts={member.parts} face={member.face} arms={member.arms} seat={member.seat} ghost />
        </group>
      )}
    </>
  )
}

export function Cast() {
  // the water's reflection never sees the cast: the terrace hides them from it, and they
  // would cost it a pass of their own (Reflector)
  const group = useRef<Group>(null)
  useEffect(() => {
    const g = group.current
    if (!g || DEBUG.waterCast) return
    notInWater.add(g)
    return () => {
      notInWater.delete(g)
    }
  }, [])
  if (DEBUG.lab) {
    const m = TEAM.find((x) => x.id === DEBUG.lab) ?? TEAM[0]
    // `?labyaw=` turns the Zenek (degrees) for views the orbit's limits do not reach (the back)
    const solo: Member = { ...m, seat: { x: 8.6, y: 0, z: -3, yaw: (P.num('labyaw', 0) * Math.PI) / 180 } }
    const glb = P.str('glb', '')
    if (GlbRef && glb)
      return (
        <Suspense fallback={null}>
          <GlbRef url={glb.startsWith('/') ? glb : `/${glb}`} at={[8.6, 0, -3]} width={P.num('glbw', 2.64)} yaw={P.num('glbyaw', 0)} />
        </Suspense>
      )
    return <Seated member={solo} order={0} />
  }
  return (
    <group ref={group}>
      {TEAM.map((m) => (
        <Seated key={m.id} member={m} order={ENTRANCE_ORDER.indexOf(m.id)} />
      ))}
    </group>
  )
}
