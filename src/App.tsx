import { useEffect } from 'react'
import { Frame } from './ui/Frame'
import { Scene } from './scene/Scene'
import { BubbleLayer } from './ui/Bubble'
import { NameTag } from './ui/NameTag'
import { A11yList } from './ui/A11y'
import { Loader } from './ui/Loader'
import { ViewControls } from './ui/ViewControls'
import { Sheet } from './ui/Sheet'
import { TITLE_MS } from './ui/TitleCard'
import { preloadSculpts } from './zenek/sculptAsset'
import { TEAM } from './cast/team'
import { store } from './lib/store'
import { DEBUG } from './lib/params'

// Boot sequence: loading → title (the loader's check done, "Meet ZEN Design Team"
// writes itself in) → intro (the title dissolves, the curtain lifts, the room rises,
// Zeneks arrive) → ready.
function useBoot() {
  useEffect(() => {
    const start = performance.now()
    const html = document.documentElement
    const setPhase = (phase: 'loading' | 'title' | 'intro' | 'ready') => {
      store.set({ phase })
      html.dataset.phase = phase
    }

    if (DEBUG.hold && DEBUG.done) setTimeout(() => store.set({ loaded: true }), 300)
    const fontsTimeout = setTimeout(() => store.set({ fontsReady: true }), 4000)
    // nobody arrives half-dressed: the loader waits for every baked sculpt the cast wears
    const sculpts = [...new Set(TEAM.flatMap((mm) => [...mm.parts.flatMap((p) => (p.type === 'sculpt' ? [p.name] : [])), ...(mm.arms ? [mm.arms.upper, mm.arms.fore] : [])]))]
    preloadSculpts(sculpts).then(() => store.set({ sculptsReady: true }))
    document.fonts?.ready.then(() => store.set({ fontsReady: true }))

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMq = () => store.set({ reducedMotion: mq.matches })
    onMq()
    mq.addEventListener('change', onMq)

    let scheduled = false
    const unsub = store.subscribe(() => {
      const s = store.get()
      const p = 0.45 * +s.plateLoaded + 0.15 * +s.fontsReady + 0.2 * +s.firstFrame + 0.2 * +s.sculptsReady
      if (Math.abs(p - s.progress) > 1e-6) store.set({ progress: p })
      if (!DEBUG.intro) {
        if (s.firstFrame && s.phase !== 'ready') setPhase('ready')
        return
      }
      if (s.phase === 'loading' && p >= 0.999 && !scheduled && !DEBUG.hold) {
        scheduled = true
        const wait = Math.max(0, 900 - (performance.now() - start)) + 200
        setTimeout(() => {
          store.set({ loaded: true }) // the loader's ring closes and the check draws (done by 0.9 s)
          const intro = () => {
            setPhase('intro')
            setTimeout(() => setPhase('ready'), 2600)
          }
          setTimeout(() => {
            if (DEBUG.title === '0') return intro()
            setPhase('title')
            if (DEBUG.title !== 'hold') setTimeout(intro, s.reducedMotion ? 1400 : TITLE_MS)
          }, 1100)
        }, wait)
      }
    })

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') store.set({ active: null })
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(fontsTimeout)
      unsub()
      mq.removeEventListener('change', onMq)
      window.removeEventListener('keydown', onKey)
    }
  }, [])
}

export default function App() {
  useBoot()
  if (DEBUG.sheet) return <Sheet />
  return (
    <>
      <Frame>
        <Scene />
        <BubbleLayer />
        <div className="bubble-layer">
          <NameTag />
        </div>
        <A11yList />
      </Frame>
      {!DEBUG.lab && <ViewControls />}
      <Loader />
      <h1 className="sr-only">ZEN Design Team</h1>
    </>
  )
}
