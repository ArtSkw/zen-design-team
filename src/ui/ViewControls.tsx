import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { House, Minus, Plus, RotateCcw, RotateCw, Volume2, VolumeX, type LucideIcon } from 'lucide-react'
import { view } from '../scene/view'
import { useStore } from '../lib/store'
import { SOUND } from '../sound/engine'
import { sfx } from '../sound/cues'

// Bottom-centre cluster: home first, then rotate and zoom, and the sound on/off. Quiet
// glass pills, no labels; Lucide icons (2 px round strokes, like the loader and the DS
// line work). Every press but the sound's own is one delicate wooden click (src/sound).
//
// Each button names itself in a tooltip: the hover tag's smaller sibling (NameTag), a
// paper pill that grows from the button. The first waits a moment; moving along the
// cluster, the next is there at once and without its entrance (as Radix and shadcn do);
// a press hides it until the pointer leaves; keyboard focus shows it straight away. Mouse
// and pen only — a touch has no hover. The tip is decoration: each button has its label.
const OPEN_MS = 450
const SKIP_MS = 300

type Tip = { text: string; x: number; y: number; on: boolean; instant: boolean }

function useTip() {
  const [tip, setTip] = useState<Tip>({ text: '', x: 0, y: 0, on: false, instant: false })
  const on = useRef(false)
  const hiddenAt = useRef(-1e9)
  const timer = useRef(0)
  const over = useRef<HTMLElement | null>(null)
  const pressed = useRef<HTMLElement | null>(null)

  const show = (el: HTMLElement, instant: boolean) => {
    const r = el.getBoundingClientRect()
    on.current = true
    setTip({ text: el.dataset.tip ?? '', x: r.left + r.width / 2, y: r.top, on: true, instant })
  }
  const hide = () => {
    clearTimeout(timer.current)
    if (!on.current) return
    on.current = false
    hiddenAt.current = performance.now()
    setTip((t) => ({ ...t, on: false, instant: false }))
  }
  const open = (el: HTMLElement, now: boolean) => {
    clearTimeout(timer.current)
    if (now || on.current || performance.now() - hiddenAt.current < SKIP_MS) show(el, true)
    else timer.current = window.setTimeout(() => show(el, false), OPEN_MS)
  }

  useEffect(() => {
    const away = () => hide()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && hide()
    window.addEventListener('blur', away)
    window.addEventListener('resize', away)
    window.addEventListener('keydown', esc)
    return () => {
      clearTimeout(timer.current)
      window.removeEventListener('blur', away)
      window.removeEventListener('resize', away)
      window.removeEventListener('keydown', esc)
    }
  }, [])

  const handlers = {
    onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === 'touch') return
      over.current = e.currentTarget
      if (pressed.current !== e.currentTarget) open(e.currentTarget, false)
    },
    onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => {
      if (pressed.current === e.currentTarget) pressed.current = null
      if (over.current === e.currentTarget) over.current = null
      hide()
    },
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      pressed.current = e.currentTarget
      hide()
    },
    onFocus: (e: FocusEvent<HTMLElement>) => {
      if (e.currentTarget.matches(':focus-visible')) open(e.currentTarget, true)
    },
    onBlur: () => {
      if (!over.current) hide()
    },
  }
  return { tip, handlers }
}

function Tooltip({ tip }: { tip: Tip }) {
  const el = useRef<HTMLDivElement>(null)
  // centred over its button, but never past the edge of a narrow screen
  useLayoutEffect(() => {
    const t = el.current
    if (!t) return
    const half = t.offsetWidth / 2
    t.style.left = `${Math.min(Math.max(tip.x, half + 8), window.innerWidth - half - 8)}px`
    t.style.top = `${tip.y}px`
  }, [tip])
  return (
    <div ref={el} className={`tip${tip.on ? ' tip--on' : ''}${tip.instant ? ' tip--instant' : ''}`} aria-hidden="true">
      {tip.text}
    </div>
  )
}

/** Where the button sits across the screen, for its click's place left–right. */
const panOf = (el: HTMLElement) => {
  const r = el.getBoundingClientRect()
  return ((r.left + r.width / 2) / window.innerWidth - 0.5) * 0.6
}

type BtnProps = { label: string; tip?: string; icon: LucideIcon; onClick: (el: HTMLElement) => void; pressed?: boolean; handlers: ReturnType<typeof useTip>['handlers'] }

function Btn({ label, tip, icon: Icon, onClick, pressed, handlers }: BtnProps) {
  return (
    <button type="button" className="vc__btn" aria-label={label} aria-pressed={pressed} data-tip={tip ?? label} onClick={(e) => onClick(e.currentTarget)} {...handlers}>
      <Icon size={20} aria-hidden="true" />
    </button>
  )
}

export function ViewControls() {
  const soundOn = useStore((s) => s.soundOn)
  const { tip, handlers } = useTip()
  const press = (act: () => void) => (el: HTMLElement) => {
    act()
    sfx.control(panOf(el))
  }
  return (
    <>
      <div className="vc" role="group" aria-label="Widok">
        <div className="vc__group">
          <Btn label="Widok początkowy" icon={House} handlers={handlers} onClick={press(() => view.reset())} />
        </div>
        <div className="vc__group">
          <Btn label="Obróć w lewo" icon={RotateCcw} handlers={handlers} onClick={press(() => view.rotate(-0.42))} />
          <Btn label="Obróć w prawo" icon={RotateCw} handlers={handlers} onClick={press(() => view.rotate(0.42))} />
        </div>
        <div className="vc__group">
          <Btn label="Przybliż" icon={Plus} handlers={handlers} onClick={press(() => view.zoom(0.8))} />
          <Btn label="Oddal" icon={Minus} handlers={handlers} onClick={press(() => view.zoom(1.25))} />
        </div>
        {SOUND && (
          <div className="vc__group">
            <Btn label="Dźwięk" tip={soundOn ? 'Wycisz' : 'Włącz dźwięk'} icon={soundOn ? Volume2 : VolumeX} pressed={soundOn} handlers={handlers} onClick={() => sfx.toggle()} />
          </div>
        )}
      </div>
      <Tooltip tip={tip} />
    </>
  )
}
