import { useEffect, useMemo } from 'react'
import { AdditiveBlending, BackSide, CanvasTexture, CylinderGeometry, MeshBasicMaterial, MeshStandardMaterial, SRGBColorSpace } from 'three'
import { SET, P } from './dims'
import { plankTexture } from './textures'
import { HATCH, INK, PAPER, PAPER_LIGHT, poolTexture, tone } from './ink'
import { DrawnWorld, PaperSky, Ripples, Sky, WaterBlooms, WATER_Y } from './Illustrated'
import { DEBUG } from '../lib/params'

// The world around the slab (decided 2026-09-22, direction C — the hybrid): the
// timber deck and its pilings stay in 3D — warm wood under the colour room, the one
// piece of the terrace that is not drawn (Artur, 2026-09-23: it serves the centre of
// the view better) — on a pale water that ghosts the room, with ink ripples that
// breathe at the pilings and marks that drift. Everything beyond is the drawn page
// (src/set/ink.ts, src/set/Illustrated.tsx). One paper colour is shared by the sky,
// the fog and the CSS stage. `?inkdeck=1` keeps the drawn-deck variant for comparison.

export { WATER_Y }
export const DECK_TOP = -0.38
export const FOG = PAPER

const MARGIN = 3.2
const DECK = { x0: -MARGIN, x1: SET.slab.w + MARGIN, z0: -MARGIN, z1: SET.slab.d + MARGIN }
const PIER = { x0: -9.5, x1: DECK.x0, z0: 2.4, z1: 6.4 }
const DECK_H = 0.3
const LINE = 0.045 // the DS 2 px stroke at the deck's distance, in world units

/** Piling positions in plan coordinates (x, z). */
export function deckPiles(): [number, number][] {
  const out: [number, number][] = []
  const step = 2.8
  const { x0, x1, z0, z1 } = DECK
  for (let x = x0 + 0.4; x <= x1 - 0.3; x += step) out.push([x, z0 + 0.22], [x, z1 - 0.22])
  for (let z = z0 + 0.4 + step; z <= z1 - 0.4 - step; z += step) out.push([x1 - 0.22, z])
  for (let x = PIER.x0 + 0.4; x < PIER.x1; x += step) out.push([x, PIER.z0 + 0.22], [x, PIER.z1 - 0.22])
  return out
}


// ---- the wooden deck --------------------------------------------------------------
const pileMat = new MeshStandardMaterial({ color: '#7a5a3a', roughness: 0.85 })
const woodPileGeo = new CylinderGeometry(0.15, 0.17, 1.9, 12)

function WoodDeck() {
  const tex = plankTexture()
  const w = DECK.x1 - DECK.x0
  const d = DECK.z1 - DECK.z0
  const piles = useMemo(deckPiles, [])
  return (
    <group>
      <mesh position={P(DECK.x0 + w / 2, DECK_TOP - DECK_H / 2, DECK.z0 + d / 2)} castShadow receiveShadow>
        <boxGeometry args={[w, DECK_H, d]} />
        <meshStandardMaterial map={tex} roughness={0.72} color="#e2c69a" map-repeat={[w / 2.6, d / 2.6]} />
      </mesh>
      <mesh position={P((PIER.x0 + PIER.x1) / 2, DECK_TOP - DECK_H / 2, (PIER.z0 + PIER.z1) / 2)} castShadow receiveShadow>
        <boxGeometry args={[PIER.x1 - PIER.x0, DECK_H, PIER.z1 - PIER.z0]} />
        <meshStandardMaterial map={tex} roughness={0.72} color="#e2c69a" map-repeat={[(PIER.x1 - PIER.x0) / 2.6, (PIER.z1 - PIER.z0) / 2.6]} />
      </mesh>
      {piles.map(([x, z], i) => (
        <mesh key={i} geometry={woodPileGeo} material={pileMat} position={P(x, DECK_TOP + 0.3 - 0.95, z)} castShadow />
      ))}
    </group>
  )
}

// ---- ink textures for the deck (the drawn variant, `?inkdeck=1`) ----------------------
const PPU = 44

function tex(c: HTMLCanvasElement) {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** A deck face: paper with a full ink border. */
function faceTexture(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(4, Math.ceil(w * PPU))
  c.height = Math.max(4, Math.ceil(h * PPU))
  const ctx = c.getContext('2d')!
  ctx.fillStyle = PAPER_LIGHT
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.strokeStyle = INK
  ctx.lineWidth = LINE * PPU
  ctx.strokeRect(0, 0, c.width, c.height)
  return tex(c)
}

/**
 * The deck's top: boards running along x, staggered end joints, a full ink border, and
 * the hatched shadow the room's two walls throw across the margin behind and beside it.
 * `shadow` is in plan coordinates relative to the deck's own origin.
 */
function deckTopTexture(w: number, d: number, shadow: { x: number; z: number; w: number; d: number }[] | null, hidden: { x0: number; z0: number; x1: number; z1: number } | null) {
  const c = document.createElement('canvas')
  c.width = Math.ceil(w * PPU)
  c.height = Math.ceil(d * PPU)
  const ctx = c.getContext('2d')!
  // canvas y runs from the back (plan z = d) to the front (plan z = 0)
  const X = (x: number) => x * PPU
  const Y = (z: number) => (d - z) * PPU
  ctx.fillStyle = PAPER_LIGHT
  ctx.fillRect(0, 0, c.width, c.height)
  // boards
  const board = 0.62
  ctx.strokeStyle = tone(0.62)
  ctx.lineWidth = LINE * PPU * 0.8
  ctx.lineCap = 'butt'
  for (let z = board; z < d - 0.01; z += board) {
    ctx.beginPath()
    ctx.moveTo(0, Y(z))
    ctx.lineTo(c.width, Y(z))
    ctx.stroke()
  }
  // end joints, staggered by row
  let row = 0
  for (let z = 0; z < d - 0.01; z += board, row++) {
    const off = ((row * 2.3) % 5.1) + 0.8
    for (let x = off; x < w; x += 5.1) {
      ctx.beginPath()
      ctx.moveTo(X(x), Y(z))
      ctx.lineTo(X(x), Y(Math.min(d, z + board)))
      ctx.stroke()
    }
  }
  // the room's shadow, hatched
  if (shadow) {
    const gap = HATCH.gapPx * 0.024 * PPU // ≈ 6 screen px at the deck's distance
    const tile = document.createElement('canvas')
    const g = Math.max(3, Math.round(gap))
    tile.width = tile.height = g
    const tx = tile.getContext('2d')!
    tx.strokeStyle = tone(1, 0.3)
    tx.lineWidth = Math.max(1.2, HATCH.linePx * 0.024 * PPU * 1.3)
    tx.beginPath()
    tx.moveTo(-1, g + 1)
    tx.lineTo(g + 1, -1)
    tx.stroke()
    ctx.fillStyle = ctx.createPattern(tile, 'repeat')!
    for (const s of shadow) ctx.fillRect(X(s.x), Y(s.z + s.d), s.w * PPU, s.d * PPU)
  }
  // nothing is drawn under the slab
  if (hidden) {
    ctx.fillStyle = PAPER_LIGHT
    ctx.fillRect(X(hidden.x0), Y(hidden.z1), (hidden.x1 - hidden.x0) * PPU, (hidden.z1 - hidden.z0) * PPU)
  }
  ctx.strokeStyle = INK
  ctx.lineWidth = LINE * PPU
  ctx.strokeRect(0, 0, c.width, c.height)
  return tex(c)
}

/** Piling cap: paper disc with an ink rim. */
function capTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')!
  ctx.fillStyle = PAPER_LIGHT
  ctx.fillRect(0, 0, 128, 128)
  ctx.strokeStyle = INK
  ctx.lineWidth = 12
  ctx.beginPath()
  ctx.arc(64, 64, 58, 0, Math.PI * 2)
  ctx.stroke()
  return tex(c)
}

// ---- the ink deck -------------------------------------------------------------------
const pileGeo = new CylinderGeometry(0.15, 0.17, 1.9, 20)
const hullGeo = new CylinderGeometry(0.15 + LINE, 0.17 + LINE, 1.9 + LINE * 2, 20)
const inkMat = new MeshBasicMaterial({ color: INK, side: BackSide, toneMapped: false })
const paperMat = new MeshBasicMaterial({ color: PAPER_LIGHT, toneMapped: false })

function InkBox({ x0, x1, z0, z1, shadow, hidden }: { x0: number; x1: number; z0: number; z1: number; shadow?: { x: number; z: number; w: number; d: number }[]; hidden?: { x0: number; z0: number; x1: number; z1: number } }) {
  const w = x1 - x0
  const d = z1 - z0
  const mats = useMemo(() => {
    const top = deckTopTexture(w, d, shadow ?? null, hidden ?? null)
    const long = faceTexture(w, DECK_H)
    const short = faceTexture(d, DECK_H)
    const mk = (t: CanvasTexture) => new MeshBasicMaterial({ map: t, toneMapped: false })
    // BoxGeometry material order: +x, −x, +y, −y, +z, −z
    return [mk(short), mk(short), mk(top), paperMat, mk(long), mk(long)]
  }, [w, d, shadow, hidden])
  useEffect(() => () => mats.forEach((m) => m !== paperMat && m.dispose()), [mats])
  return (
    <mesh position={P(x0 + w / 2, DECK_TOP - DECK_H / 2, z0 + d / 2)} material={mats}>
      <boxGeometry args={[w, DECK_H, d]} />
    </mesh>
  )
}

function Piles() {
  const piles = useMemo(deckPiles, [])
  const cap = useMemo(() => capTexture(), [])
  const mats = useMemo(() => [paperMat, new MeshBasicMaterial({ map: cap, toneMapped: false }), paperMat], [cap])
  return (
    <group>
      {piles.map(([x, z], i) => (
        <group key={i} position={P(x, DECK_TOP + 0.3 - 0.95, z)}>
          <mesh geometry={pileGeo} material={mats} />
          <mesh geometry={hullGeo} material={inkMat} />
        </group>
      ))}
    </group>
  )
}

function InkDeck() {
  // the key light sits front-right and high, so the walls throw their shadow onto the
  // margin behind and beside the room: a band along the left edge, one along the back
  const shadow = [
    { x: 0, z: 0, w: MARGIN, d: DECK.z1 - DECK.z0 }, // left margin, full depth
    { x: MARGIN, z: SET.slab.d + MARGIN, w: SET.roomW + 0.6, d: MARGIN }, // behind the back wall
  ]
  const hidden = { x0: MARGIN, z0: MARGIN, x1: MARGIN + SET.slab.w, z1: MARGIN + SET.slab.d }
  return (
    <group>
      <InkBox x0={DECK.x0} x1={DECK.x1} z0={DECK.z0} z1={DECK.z1} shadow={shadow} hidden={hidden} />
      <InkBox x0={PIER.x0} x1={PIER.x1} z0={PIER.z0} z1={PIER.z1} />
      <Piles />
    </group>
  )
}

// ---- lantern light: a soft additive glow and a baked pool on the gravel --------------
function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')!
  // dies well inside its own radius, so the sprite never meets the ground with an edge
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255, 226, 176, 1)')
  g.addColorStop(0.22, 'rgba(255, 214, 154, 0.55)')
  g.addColorStop(0.42, 'rgba(255, 208, 144, 0.14)')
  g.addColorStop(0.56, 'rgba(255, 200, 140, 0)')
  g.addColorStop(1, 'rgba(255, 200, 140, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
let glowTex: CanvasTexture | null = null
/** The bulb's halo: a small additive sprite that fades out before it can touch the ground. */
export function LanternGlow({ scale = 1.3 }: { scale?: number }) {
  glowTex ??= glowTexture()
  return (
    <sprite scale={[scale, scale, 1]} position={[0, 0.04, 0]}>
      <spriteMaterial map={glowTex} color="#ffd6a4" transparent opacity={0.8} depthWrite={false} blending={AdditiveBlending} />
    </sprite>
  )
}
let poolTex: CanvasTexture | null = null
/** Warm pool of light on the ground under a lantern; lies flat at the group origin. */
export function LightPool({ size = 2.0, y = 0 }: { size?: number; y?: number }) {
  poolTex ??= poolTexture()
  return (
    <mesh position={[0, y, 0]} rotation-x={-Math.PI / 2}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial map={poolTex} transparent depthWrite={false} />
    </mesh>
  )
}

export function Environment() {
  const piles = useMemo(() => deckPiles().map(([x, z]) => [x, -z] as [number, number]), [])
  const footprint = useMemo(() => ({ x0: PIER.x0, x1: DECK.x1, z0: -DECK.z1, z1: -DECK.z0 }), [])
  return (
    <group>
      <PaperSky />
      <DrawnWorld bridge={DEBUG.bridge} />
      {DEBUG.inkDeck ? <InkDeck /> : <WoodDeck />}
      <Ripples piles={piles} />
      <WaterBlooms avoid={footprint} />
      <Sky />
    </group>
  )
}
