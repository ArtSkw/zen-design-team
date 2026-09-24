import { useEffect, useMemo, useRef, useState } from 'react'
import type { Mesh } from 'three'
import { ReflectorMaterial } from './Reflector'
import { LanternGlow, LightPool } from './Environment'
import {
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  DoubleSide,
  ExtrudeGeometry,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector3,
} from 'three'
import { SET, P } from './dims'
import { LITE } from '../lib/params'
import { LOGO_ASPECT, gravelTexture, logoTexture, plankTexture, posterTexture } from './textures'
import { taperedTube } from '../zenek/geometry'
import { leafGeometry, padGeometry, pillowGeometry } from './props'
import { mulberry32, range } from '../lib/rng'
import { store } from '../lib/store'

// ---- materials (one family for the whole set) -------------------------------
const M = {
  concrete: new MeshStandardMaterial({ color: '#c6c3bd', roughness: 0.62 }),
  concreteDark: new MeshStandardMaterial({ color: '#b9b6b0', roughness: 0.7 }),
  concreteTable: new MeshStandardMaterial({ color: '#a9a6a1', roughness: 0.75 }),
  white: new MeshStandardMaterial({ color: '#f2f0eb', roughness: 0.92 }),
  oak: new MeshStandardMaterial({ color: '#d4b07c', roughness: 0.68 }),
  oakLight: new MeshStandardMaterial({ color: '#e1c391', roughness: 0.66 }),
  walnut: new MeshStandardMaterial({ color: '#4a301f', roughness: 0.8 }),
  slat: new MeshStandardMaterial({ color: '#6e4528', roughness: 0.7 }),
  black: new MeshStandardMaterial({ color: '#171819', roughness: 0.55 }),
  blackGloss: new MeshStandardMaterial({ color: '#141516', roughness: 0.3 }),
  paper: new MeshStandardMaterial({ color: '#f5f0e5', emissive: '#f6eedd', emissiveIntensity: 0.22, roughness: 1 }),
  glass: new MeshPhysicalMaterial({ color: '#dfe9ee', transparent: true, opacity: 0.16, roughness: 0.05, metalness: 0, reflectivity: 0.6, clearcoat: 1, clearcoatRoughness: 0.05, side: DoubleSide, depthWrite: false }),
  green: new MeshStandardMaterial({ color: '#22e243', roughness: 0.8 }),
  leaf: new MeshStandardMaterial({ color: '#2a6630', roughness: 0.46, side: DoubleSide }),
  leaf2: new MeshStandardMaterial({ color: '#347a3a', roughness: 0.5, side: DoubleSide }),
  needles: new MeshStandardMaterial({ color: '#3f6f37', roughness: 0.92 }),
  needles2: new MeshStandardMaterial({ color: '#4d7f3f', roughness: 0.92 }),
  soil: new MeshStandardMaterial({ color: '#2a2320', roughness: 1 }),
  stone: new MeshStandardMaterial({ color: '#4d4c4b', roughness: 0.5 }),
  stone2: new MeshStandardMaterial({ color: '#5c5a57', roughness: 0.55 }),
  bigStone: new MeshStandardMaterial({ color: '#57585a', roughness: 0.62 }),
  foliage: new MeshStandardMaterial({ color: '#4f8a3c', roughness: 0.9 }),
  foliage2: new MeshStandardMaterial({ color: '#5f9a45', roughness: 0.9 }),
  trunk: new MeshStandardMaterial({ color: '#5a3b24', roughness: 0.85 }),
  lantern: new MeshStandardMaterial({ color: '#fff5e0', emissive: '#ffd9a0', emissiveIntensity: 1.6, roughness: 0.6 }),
  cup: new MeshStandardMaterial({ color: '#2a2a2c', roughness: 0.4 }),
}
const unit = new SphereGeometry(1, 32, 20)
const box = new BoxGeometry(1, 1, 1)

function Slab() {
  const { slab, garden } = SET
  const { top, body } = useMemo(() => {
    const s = new Shape()
    s.moveTo(0, 0)
    s.lineTo(slab.w, 0)
    s.lineTo(slab.w, slab.d)
    s.lineTo(0, slab.d)
    s.closePath()
    const hole = new Shape()
    hole.moveTo(garden.x0, garden.z0)
    hole.lineTo(garden.x1, garden.z0)
    hole.lineTo(garden.x1, garden.z1)
    hole.lineTo(garden.x0, garden.z1)
    hole.closePath()
    s.holes.push(hole)
    return { top: new ShapeGeometry(s, 4), body: new ExtrudeGeometry(s, { depth: slab.h, bevelEnabled: false, curveSegments: 4 }) }
  }, [slab, garden])
  const floor = useRef<Mesh>(null)
  return (
    <group>
      <mesh geometry={body} material={M.concreteDark} rotation-x={-Math.PI / 2} position={[0, -slab.h, 0]} castShadow receiveShadow />
      <mesh ref={floor} geometry={top} rotation-x={-Math.PI / 2} position={[0, 0.002, 0]} receiveShadow>
        <ReflectorMaterial host={floor} blur={[360, 120]} resolution={LITE ? 512 : 1024} every={LITE ? 2 : 1} offset={1} mixBlur={1} mixStrength={0.45} roughness={0.75} depthScale={0.8} minDepthThreshold={0.6} maxDepthThreshold={1.3} color="#c7c4be" metalness={0} mirror={0.22} />
      </mesh>
    </group>
  )
}

// Two oak steps along the back wall, full room width.
function Steps() {
  const { steps, roomW, slab, wall, glass } = SET
  const tex = plankTexture()
  const x0 = wall.t
  const x1 = roomW - glass.post / 2 - 0.01
  const w = x1 - x0
  const zBack = slab.d - wall.t
  return (
    <group>
      {steps.map((st, i) => {
        const z1 = i === 0 ? zBack : steps[i - 1].z0
        const depth = z1 - st.z0
        return (
          <group key={i}>
            <mesh geometry={box} material={M.oak} position={P(x0 + w / 2, st.h / 2, st.z0 + depth / 2)} scale={[w, st.h, depth]} castShadow receiveShadow />
            <mesh rotation-x={-Math.PI / 2} position={P(x0 + w / 2, st.h + 0.002, st.z0 + depth / 2)} receiveShadow>
              <planeGeometry args={[w, depth]} />
              <meshStandardMaterial map={tex} roughness={0.6} map-repeat={[3.6, Math.max(0.4, depth / 2.6)]} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function LeftWall() {
  const { wall, slab, poster, logo } = SET
  const [logoTex, setLogoTex] = useState<CanvasTexture | null>(null)
  useEffect(() => {
    logoTexture().then(setLogoTex).catch(() => undefined)
  }, [])
  const posterTex = useMemo(() => posterTexture(() => store.set({ posterLoaded: true })), [])
  const logoW = 0.5
  const logoH = logoW * LOGO_ASPECT
  return (
    <group>
      <mesh geometry={box} material={M.white} position={P(wall.t / 2, wall.h / 2, slab.d / 2)} scale={[wall.t, wall.h, slab.d]} castShadow receiveShadow />
      {logoTex && (
        <mesh rotation-y={Math.PI / 2} position={P(wall.t + 0.012, logo.y - 0.386 * logoH, logo.z)}>
          <planeGeometry args={[logoW, logoH]} />
          <meshStandardMaterial map={logoTex} transparent roughness={0.9} alphaTest={0.05} />
        </mesh>
      )}
      <mesh geometry={box} material={M.blackGloss} position={P(wall.t + 0.035, poster.y0 + poster.h / 2, poster.z0 + poster.w / 2)} scale={[0.05, poster.h + 2 * poster.frame, poster.w + 2 * poster.frame]} castShadow />
      <mesh rotation-y={Math.PI / 2} position={P(wall.t + 0.064, poster.y0 + poster.h / 2, poster.z0 + poster.w / 2)}>
        <planeGeometry args={[poster.w, poster.h]} />
        <meshStandardMaterial map={posterTex} roughness={0.85} />
      </mesh>
    </group>
  )
}

function BackWall() {
  const { wall, slab, roomW, slats, shoji, steps } = SET
  const zFace = slab.d - wall.t
  const slatCount = Math.floor((slats.x1 - wall.t - 0.08) / slats.pitch)
  const shojiW = shoji.x1 - shoji.x0
  const y0 = steps[0].h
  const zS = zFace - 0.1 // screen face, in front of the wall
  return (
    <group>
      <mesh geometry={box} material={M.white} position={P(roomW / 2 + wall.t / 2, wall.h / 2, slab.d - wall.t / 2)} scale={[roomW + wall.t, wall.h, wall.t]} castShadow receiveShadow />
      <mesh geometry={box} material={M.walnut} position={P(wall.t + (slats.x1 - wall.t) / 2, wall.h / 2 - 0.02, zFace - slats.panelT / 2)} scale={[slats.x1 - wall.t, wall.h - 0.04, slats.panelT]} receiveShadow />
      {Array.from({ length: slatCount }, (_, i) => (
        <mesh key={i} geometry={box} material={M.slat} position={P(wall.t + 0.04 + slats.pitch * (i + 0.5), (wall.h - 0.12) / 2, zFace - slats.panelT - slats.slatD / 2)} scale={[slats.slatW, wall.h - 0.12, slats.slatD]} castShadow receiveShadow />
      ))}
      <group>
        <mesh geometry={box} material={M.oak} position={P(shoji.x0 + shoji.frame / 2, y0 + shoji.h / 2, zS)} scale={[shoji.frame, shoji.h, shoji.frame]} castShadow />
        <mesh geometry={box} material={M.oak} position={P(shoji.x1 - shoji.frame / 2, y0 + shoji.h / 2, zS)} scale={[shoji.frame, shoji.h, shoji.frame]} castShadow />
        <mesh geometry={box} material={M.oak} position={P(shoji.x0 + shojiW / 2, y0 + shoji.h - shoji.frame / 2, zS)} scale={[shojiW, shoji.frame, shoji.frame]} castShadow />
        <mesh geometry={box} material={M.oak} position={P(shoji.x0 + shojiW / 2, y0 + shoji.frame / 2, zS)} scale={[shojiW, shoji.frame, shoji.frame]} castShadow />
        {/* paper sits behind the lattice; nothing shares a plane */}
        <mesh material={M.paper} position={P(shoji.x0 + shojiW / 2, y0 + shoji.h / 2, zS + 0.045)}>
          <planeGeometry args={[shojiW - shoji.frame, shoji.h - shoji.frame]} />
        </mesh>
        {Array.from({ length: shoji.cols - 1 }, (_, i) => (
          <mesh key={`c${i}`} geometry={box} material={M.oakLight} position={P(shoji.x0 + (shojiW / shoji.cols) * (i + 1), y0 + shoji.h / 2, zS - 0.01)} scale={[0.045, shoji.h - shoji.frame, 0.04]} />
        ))}
        {Array.from({ length: shoji.rows - 1 }, (_, i) => (
          <mesh key={`r${i}`} geometry={box} material={M.oakLight} position={P(shoji.x0 + shojiW / 2, y0 + (shoji.h / shoji.rows) * (i + 1), zS - 0.04)} scale={[shojiW - shoji.frame, 0.045, 0.03]} />
        ))}
        <mesh geometry={box} material={M.black} position={P(shoji.x0 + 0.02, y0 + shoji.h * 0.5, zS - 0.07)} scale={[0.04, 0.5, 0.03]} />
      </group>
    </group>
  )
}

function GlassWall() {
  const { glass, wall, slab, roomW } = SET
  const zBack = slab.d - wall.t
  const zMid = (glass.z0 + zBack) / 2
  const len = zBack - glass.z0
  return (
    <group>
      {[glass.z0 + glass.post / 2, zMid, zBack - glass.post / 2].map((z) => (
        <mesh key={z} geometry={box} material={M.black} position={P(roomW, wall.h / 2, z)} scale={[glass.post, wall.h, glass.post]} castShadow />
      ))}
      <mesh geometry={box} material={M.black} position={P(roomW, wall.h - glass.rail / 2, glass.z0 + len / 2)} scale={[glass.post, glass.rail, len]} castShadow />
      <mesh geometry={box} material={M.black} position={P(roomW, 0.05, glass.z0 + (SET.steps[1].z0 - glass.z0) / 2)} scale={[glass.post, 0.1, SET.steps[1].z0 - glass.z0]} />
      {[0, 1].map((i) => {
        const z0 = i === 0 ? glass.z0 : zMid
        const z1 = i === 0 ? zMid : zBack
        return (
          <mesh key={i} material={M.glass} rotation-y={Math.PI / 2} position={P(roomW, wall.h / 2, (z0 + z1) / 2)}>
            <planeGeometry args={[z1 - z0 - glass.post, wall.h - glass.rail - 0.1]} />
          </mesh>
        )
      })}
    </group>
  )
}

// Cushions are puffed (thick in the middle, soft pointed corners), as in the reference.
const benchCushionGeo = pillowGeometry(SET.cushion.w / 2, 0.12)
const floorCushionGeo = pillowGeometry(0.46, 0.12)
const CUSHION_UNDER = 0.12 * 0.33 // the pressed underside: the pillow's lowest point sits this far below its seam

function Benches() {
  const { benches, bench } = SET
  return (
    <group>
      {benches.map((b, i) => {
        const len = b.z1 - b.z0
        const zc = (b.z0 + b.z1) / 2
        return (
          <group key={i}>
            {[-1, 1].map((s) => (
              <mesh key={s} geometry={box} material={M.oak} position={P(b.x + s * (bench.w / 4 + 0.01), bench.h - bench.slat / 2, zc)} scale={[bench.w / 2 - 0.02, bench.slat, len]} castShadow receiveShadow />
            ))}
            {[b.z0 + 0.1, b.z1 - 0.1].map((z) => (
              <mesh key={z} geometry={box} material={M.oak} position={P(b.x, (bench.h - bench.slat) / 2, z)} scale={[bench.w, bench.h - bench.slat, 0.14]} castShadow receiveShadow />
            ))}
            {b.cushionZ != null && <mesh geometry={benchCushionGeo} material={M.green} position={P(b.x, bench.h + CUSHION_UNDER, b.cushionZ)} rotation-y={0.06} castShadow receiveShadow />}
          </group>
        )
      })}
    </group>
  )
}

function FloorCushions() {
  return (
    <group>
      {SET.floorCushions.map((c, i) => (
        <mesh key={i} geometry={floorCushionGeo} material={M.green} position={P(c.x, CUSHION_UNDER, c.z)} rotation-y={c.yaw} castShadow receiveShadow />
      ))}
    </group>
  )
}

function SideTable() {
  const { table } = SET
  return (
    <group position={P(table.x, 0, table.z)}>
      <mesh material={M.concreteTable} position={[0, table.h - 0.05, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[table.r, table.r, 0.1, 40]} />
      </mesh>
      <mesh material={M.concreteTable} position={[0, (table.h - 0.1) / 2, 0]} castShadow>
        <cylinderGeometry args={[table.r * 0.42, table.r * 0.5, table.h - 0.1, 24]} />
      </mesh>
      {[-0.2, 0.18].map((dx, i) => (
        <mesh key={i} material={M.cup} position={[dx, table.h + 0.06, i === 0 ? 0.16 : 0.1]} castShadow>
          <cylinderGeometry args={[0.07, 0.06, 0.12, 16]} />
        </mesh>
      ))}
      {/* a small cast-iron teapot with its bail handle */}
      <group position={[0.02, table.h, -0.2]} rotation-y={0.5}>
        <mesh geometry={unit} material={M.cup} position={[0, 0.1, 0]} scale={[0.13, 0.1, 0.13]} castShadow />
        <mesh geometry={unit} material={M.cup} position={[0, 0.2, 0]} scale={[0.03, 0.02, 0.03]} />
        <mesh material={M.cup} position={[0.15, 0.13, 0]} rotation-z={-0.9} castShadow>
          <cylinderGeometry args={[0.014, 0.028, 0.12, 10]} />
        </mesh>
        <mesh material={M.cup} position={[0, 0.17, 0]}>
          <torusGeometry args={[0.1, 0.009, 8, 24, Math.PI]} />
        </mesh>
      </group>
    </group>
  )
}

function Plant() {
  const { plant } = SET
  // broad, glossy leaves on thin stems, arching up and out and over, as drawn
  const leaves = useMemo(() => {
    const rng = mulberry32(21)
    const n = 13
    return Array.from({ length: n }, (_, i) => {
      const inner = i % 3 === 0 // a few younger leaves stand up in the middle
      const len = inner ? range(rng, 0.8, 0.95) : range(rng, 0.95, 1.25)
      return {
        yaw: (i / n) * Math.PI * 2 + rng() * 0.4,
        out: inner ? 0.03 : range(rng, 0.06, 0.14),
        geo: leafGeometry(len, range(rng, 0.46, 0.58), inner ? range(rng, 1.25, 1.4) : range(rng, 0.85, 1.1), inner ? range(rng, 0.6, 0.9) : range(rng, 1.1, 1.6), 0.3, 0.36),
        alt: rng() > 0.5,
      }
    })
  }, [])
  return (
    <group position={P(plant.x, 0, plant.z)}>
      <mesh material={M.blackGloss} position={[0, plant.potH / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[plant.potR, plant.potR * 0.78, plant.potH, 40]} />
      </mesh>
      <mesh material={M.soil} position={[0, plant.potH - 0.01, 0]}>
        <cylinderGeometry args={[plant.potR * 0.9, plant.potR * 0.9, 0.04, 32]} />
      </mesh>
      <group position={[0, plant.potH - 0.02, 0]}>
        {leaves.map((l, i) => (
          <group key={i} rotation-y={l.yaw}>
            <mesh geometry={l.geo} material={l.alt ? M.leaf2 : M.leaf} position={[0, 0, l.out]} castShadow />
          </group>
        ))}
      </group>
    </group>
  )
}

function Garden() {
  const { garden, sittingStone, stones, bonsai, shrub, lanterns } = SET
  const bw = garden.x1 - garden.x0
  const bd = garden.z1 - garden.z0
  const tex = gravelTexture([
    [(sittingStone.x - garden.x0) / bw, 1 - (sittingStone.z - garden.z0) / bd],
    ...stones.map((s) => [(s.x - garden.x0) / bw, 1 - (s.z - garden.z0) / bd] as [number, number]),
  ])
  // a pine bonsai: a trunk that leans and turns, short branches, and flat, layered
  // needle pads (the reference's cloud-pruned pine), not balls of foliage
  const trunk = useMemo(() => {
    const curve = new CatmullRomCurve3([new Vector3(0.05, 0.2, 0), new Vector3(0.22, 0.6, 0.05), new Vector3(0.02, 0.98, -0.04), new Vector3(-0.16, 1.3, 0.02), new Vector3(-0.02, 1.62, 0.04)])
    return taperedTube(curve, 0.12, 0.045, 32, 12)
  }, [])
  const pads = useMemo(() => {
    const spec: { c: [number, number, number]; r: [number, number, number]; from: [number, number, number]; m: MeshStandardMaterial }[] = [
      { c: [-0.62, 1.02, 0.08], r: [0.62, 0.17, 0.46], from: [0.12, 0.85, 0.0], m: M.needles }, // the long low pad, reaching left
      { c: [0.5, 1.28, -0.04], r: [0.46, 0.15, 0.38], from: [0.02, 1.02, -0.03], m: M.needles2 },
      { c: [-0.22, 1.42, -0.32], r: [0.36, 0.13, 0.28], from: [-0.12, 1.28, 0.0], m: M.needles },
      { c: [-0.04, 1.74, 0.02], r: [0.46, 0.18, 0.4], from: [-0.04, 1.6, 0.04], m: M.needles2 }, // the crown
    ]
    return spec.map((p, i) => ({
      ...p,
      geo: padGeometry(p.r[0], p.r[1], p.r[2], 70 + i),
      branch: taperedTube(new CatmullRomCurve3([new Vector3(...p.from), new Vector3((p.from[0] + p.c[0]) / 2, (p.from[1] + p.c[1]) / 2 + 0.04, (p.from[2] + p.c[2]) / 2), new Vector3(p.c[0] * 0.8, p.c[1] - 0.06, p.c[2] * 0.8)]), 0.04, 0.02, 12, 8),
    }))
  }, [])
  const shrubGeo = useMemo(() => {
    const g = new SphereGeometry(shrub.r, 40, 28)
    const rng = mulberry32(3)
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const k = 1 + (rng() - 0.5) * 0.14
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.85, pos.getZ(i) * k)
    }
    g.computeVertexNormals()
    return g
  }, [shrub.r])
  const yG = -garden.depth
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={P(garden.x0 + bw / 2, yG, garden.z0 + bd / 2)} receiveShadow>
        <planeGeometry args={[bw, bd]} />
        <meshStandardMaterial map={tex} roughness={0.95} />
      </mesh>
      {/* flat sitting stone */}
      <mesh geometry={unit} material={M.bigStone} position={P(sittingStone.x, yG + sittingStone.h * 0.35, sittingStone.z)} scale={[sittingStone.r, sittingStone.h * 0.9, sittingStone.r * 0.9]} castShadow receiveShadow />
      {stones.map((s, i) => (
        <mesh key={i} geometry={unit} material={i % 2 ? M.stone2 : M.stone} position={P(s.x, yG + s.r * 0.36, s.z)} scale={[s.r, s.r * 0.62, s.r * 0.85]} castShadow receiveShadow />
      ))}
      <group position={P(bonsai.x, yG, bonsai.z)}>
        <mesh material={M.blackGloss} position={[0, 0.22, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[bonsai.potR, bonsai.potR * 0.8, 0.44, 40]} />
        </mesh>
        <mesh material={M.soil} position={[0, 0.43, 0]}>
          <cylinderGeometry args={[bonsai.potR * 0.9, bonsai.potR * 0.9, 0.03, 32]} />
        </mesh>
        <group position={[0, 0.15, 0]}>
          <mesh geometry={trunk} material={M.trunk} castShadow />
          {pads.map((f, i) => (
            <group key={i}>
              <mesh geometry={f.branch} material={M.trunk} castShadow />
              <mesh geometry={f.geo} material={f.m} position={f.c} castShadow receiveShadow />
            </group>
          ))}
        </group>
      </group>
      <mesh geometry={shrubGeo} material={M.foliage} position={P(shrub.x, yG + shrub.r * 0.62, shrub.z)} castShadow receiveShadow />
      {lanterns.map((l, i) => (
        <group key={i} position={P(l.x, yG + 0.36, l.z)}>
          <mesh geometry={unit} material={M.lantern} scale={0.36} castShadow />
          <mesh material={M.black} position={[0, 0.36, 0]}>
            <cylinderGeometry args={[0.07, 0.09, 0.05, 16]} />
          </mesh>
          <mesh material={M.black} position={[0, -0.35, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 0.04, 16]} />
          </mesh>
          <pointLight color="#ffd9a0" intensity={0.7} distance={5} decay={2} />
          <LanternGlow />
          <LightPool size={2.8} y={-0.352} />
        </group>
      ))}
    </group>
  )
}

export function Diorama() {
  return (
    <group>
      <Slab />
      <Steps />
      <LeftWall />
      <BackWall />
      <GlassWall />
      <Benches />
      <FloorCushions />
      <SideTable />
      <Plant />
      <Garden />
    </group>
  )
}
