import { useEffect, useRef } from 'react'
import { ARC, Ink, PAPER, WATER, composition, drawRing, tone } from '../set/ink'
import { DEBUG } from '../lib/params'

// `?sheet=1` — the layer set as a flat composite, the way the design system would
// draw it: the visible arc unrolled as the home camera sees it (φ 335° on the left,
// 95° on the right), far strip first, each ring scaled by its distance so the sheet
// reads with the same depth as the 3D view. Judged before the 3D. `&bridge=1` adds
// the bridge.

function drawSheet(canvas: HTMLCanvasElement, opts: { bridge: boolean }) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const cssW = Math.min(1600, window.innerWidth - 48)
  const cssH = Math.round(cssW * 0.52)
  canvas.width = cssW * dpr
  canvas.height = cssH * dpr
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const W = cssW
  const H = cssH

  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, W, H)

  // Band A: the whole arc the camera can ever see, small. Band B: the home view's
  // arc (φ 175°→255°) at three times the scale, which is how it reads on screen.
  const bands = [
    { from: ARC.from, to: ARC.to, top: 60, horizonY: H * 0.36, waterTo: H * 0.42 },
    { from: 175, to: 255, top: H * 0.44, horizonY: H * 0.9, waterTo: H },
  ]
  const { rings, floaters } = composition({ bridge: opts.bridge })
  for (const band of bands) {
    const arcRad = (band.to - band.from) * (Math.PI / 180)
    const xPx = (phi: number) => ((band.to - phi) / (band.to - band.from)) * W
    const scaleOf = (r: number) => W / (arcRad * r) // px per world unit for a ring at radius r
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, band.top, W, band.waterTo - band.top)
    ctx.clip()
    // water: the pale disc, seen as a band under the horizon
    ctx.fillStyle = WATER
    ctx.fillRect(0, band.horizonY, W, band.waterTo - band.horizonY)
    const all = [...rings.map((r) => ({ r: r.r, draw: (ink: Ink) => drawRing(r, ink), y: 0, phi: null as number | null })), ...floaters.map((f) => ({ r: f.r, draw: f.draw, y: f.y, phi: f.phi as number | null }))].sort((a, b) => b.r - a.r)
    for (const item of all) {
      const s = scaleOf(item.r)
      ctx.save()
      if (item.phi == null) {
        // a strip: x is the arc position whose origin is φ = ARC.to; shift so φ = band.to is the left edge
        const shift = -(item.r * (ARC.to - band.to) * (Math.PI / 180)) * s
        ctx.setTransform(dpr * s, 0, 0, -dpr * s, dpr * shift, dpr * band.horizonY)
      } else {
        ctx.setTransform(dpr * s, 0, 0, -dpr * s, dpr * xPx(item.phi), dpr * (band.horizonY - item.y * s))
      }
      item.draw(new Ink(ctx, 2 / s, 6 * dpr, 1.2 * dpr))
      ctx.restore()
    }
    // the plane and the gulls, where a crossing would be
    {
      const s = scaleOf(66)
      ctx.save()
      ctx.setTransform(dpr * s, 0, 0, -dpr * s, dpr * xPx(236), dpr * (band.horizonY - 6.2 * s))
      new Ink(ctx, 2 / s, 6 * dpr, 1.2 * dpr).plane(0, 0, 2.0, 1)
      ctx.restore()
      const s2 = scaleOf(58)
      ctx.save()
      ctx.setTransform(dpr * s2, 0, 0, -dpr * s2, dpr * xPx(206), dpr * (band.horizonY - 5.0 * s2))
      new Ink(ctx, 2 / s2, 6 * dpr, 1.2 * dpr).gulls(0, 0, 3.4, 1)
      ctx.restore()
    }
    // φ ticks
    ctx.textAlign = 'center'
    ctx.font = '500 10px "Nunito Variable", Nunito, sans-serif'
    const step = band.to - band.from > 120 ? 30 : 10
    for (let phi = Math.ceil(band.from / step) * step; phi <= band.to; phi += step) {
      if (band.to - band.from > 120 && phi % 30 !== 0) continue
      const x = xPx(phi)
      ctx.fillStyle = tone(0.45)
      ctx.fillRect(x - 0.5, band.horizonY + 6, 1, 6)
      ctx.fillText(`${phi}°`, x, band.horizonY + 24)
    }
    if (band.from === ARC.from) {
      // the home view's field on the overview
      ctx.strokeStyle = tone(0.45)
      ctx.setLineDash([3, 4])
      ctx.lineWidth = 1
      for (const phi of [185, 243]) {
        const x = xPx(phi)
        ctx.beginPath()
        ctx.moveTo(x, band.top)
        ctx.lineTo(x, band.horizonY - 4)
        ctx.stroke()
      }
      ctx.setLineDash([])
    }
    ctx.restore()
  }

  // captions
  ctx.textAlign = 'left'
  ctx.fillStyle = tone(0.85)
  ctx.font = '700 14px "Nunito Variable", Nunito, sans-serif'
  ctx.fillText('ZEN Design Team · the drawn world · layer sheet', 20, 26)
  ctx.fillStyle = tone(0.55)
  ctx.font = '500 12px "Nunito Variable", Nunito, sans-serif'
  ctx.fillText(`top: every φ the orbit can ever see, unrolled as seen from the room (dashed = the home view) · bottom: the home arc at 3× · far strip r≈118 · mid r≈78 · near r≈47 · clouds r≈96 · ${opts.bridge ? 'with' : 'without'} the bridge`, 20, 44)
}

export function Sheet() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    document.documentElement.dataset.phase = 'ready'
    const c = ref.current
    if (!c) return
    const run = () => drawSheet(c, { bridge: DEBUG.bridge })
    document.fonts?.ready.then(run)
    run()
    window.addEventListener('resize', run)
    return () => window.removeEventListener('resize', run)
  }, [])
  return (
    <div className="sheet">
      <canvas ref={ref} />
    </div>
  )
}
