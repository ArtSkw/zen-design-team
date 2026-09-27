import { Suspense, lazy, useEffect } from 'react'
import { Frame } from './ui/Frame'
import { BubbleLayer } from './ui/Bubble'
import { NameTag } from './ui/NameTag'
import { A11yList } from './ui/A11y'
import { Loader } from './ui/Loader'
import { DUST_LEAD, DUST_REST, TitleDust } from './ui/TitleDust'
import { ViewControls } from './ui/ViewControls'
import { TITLE_MS, WRITTEN_MS } from './ui/TitleCard'
import { TEAM } from './cast/team'
import { store, type State } from './lib/store'
import { DEBUG } from './lib/params'
import { hush } from './lib/talk'
import { PRESS, soundAllowed, touched, unlock } from './sound/engine'
import './sound/cues'

// The 3D (three.js, R3F, the set, the cast) is its own chunk: the loader paints as
// soon as the small first chunk has run, while the rest streams in behind it.
const Scene = lazy(() => import('./scene/Scene').then((m) => ({ default: m.Scene })))
const Sheet = lazy(() => import('./ui/Sheet').then((m) => ({ default: m.Sheet })))
// "Kontynuuj" (and its lettering) is needed only once everything else has loaded
const loadPress = () => import('./ui/Press')
const Press = lazy(() => loadPress().then((m) => ({ default: m.Press })))

/** Calls `fn` once: when `pred` holds for the store, or after `ms` whatever happens (nothing may hang the boot). */
function when(pred: (s: State) => boolean, fn: () => void, ms: number) {
  let done = false
  const go = () => {
    if (done) return
    done = true
    unsub()
    clearTimeout(timer)
    fn()
  }
  const unsub = store.subscribe(() => {
    if (pred(store.get())) go()
  })
  const timer = setTimeout(go, ms)
  if (pred(store.get())) go()
}

// Boot sequence: loading → (a press, if the browser would hold the sound back) → title
// (the loader's check done, "Meet ZEN Design Team" writes itself in, then — as soon as it is written — lets go into falling petals, still on the curtain) →
// intro (once the petals are falling: the curtain lifts, the room rises, Zeneks
// arrive) → ready.
function useBoot() {
  useEffect(() => {
    const start = performance.now()
    const html = document.documentElement
    const setPhase = (phase: 'loading' | 'title' | 'intro' | 'ready') => {
      store.set({ phase })
      html.dataset.phase = phase
      if (import.meta.env.DEV) console.debug(`[phase] ${phase}`) // scripts/debug-press.mjs listens
    }

    if (DEBUG.hold && DEBUG.done) setTimeout(() => store.set({ loaded: true }), 300)
    const fontsTimeout = setTimeout(() => store.set({ fontsReady: true }), 4000)
    // nobody arrives half-dressed: the loader waits for every baked sculpt the cast wears
    const sculpts = [...new Set(TEAM.flatMap((mm) => [...mm.parts.flatMap((p) => (p.type === 'sculpt' || p.type === 'shirt' || p.type === 'garment' || p.type === 'kerchief' ? [p.name] : [])), ...(mm.arms ? [mm.arms.upper, mm.arms.fore] : [])]))]
    import('./zenek/sculptAsset')
      .then((m) => m.preloadSculpts(sculpts))
      .then(() => store.set({ sculptsReady: true }))
    document.fonts?.ready.then(() => store.set({ fontsReady: true }))

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMq = () => store.set({ reducedMotion: mq.matches })
    onMq()
    mq.addEventListener('change', onMq)

    // sound is on by default, but a browser holds it until the visitor's first touch: ask
    // now (quietly) whether it would play anyway, so the finished loader need not ask
    const asking = PRESS && store.get().soundOn ? soundAllowed() : null

    let scheduled = false
    const unsub = store.subscribe(() => {
      const s = store.get()
      const p = 0.45 * +s.posterLoaded + 0.15 * +s.fontsReady + 0.2 * +s.firstFrame + 0.2 * +s.sculptsReady
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
          const title = () => {
            if (DEBUG.title === '0') return intro()
            setPhase('title')
            if (DEBUG.title === 'hold') return
            if (s.reducedMotion) return void setTimeout(intro, 1400)
            // the title's own clock says when it is written: a stalled phone writes it later, never skips it
            when((st) => st.written, () => {
              if (DEBUG.dust === '0') return void setTimeout(intro, TITLE_MS - WRITTEN_MS)
              setTimeout(() => {
                store.set({ dissolve: true })
                when((st) => st.lift, intro, DUST_LEAD + 8000) // once its petals are falling
              }, DUST_REST)
            }, WRITTEN_MS + 12000)
          }
          // the intro is meant to be heard: unless the browser allows sound already, the
          // finished loader's check becomes a button, "Kontynuuj" (src/ui/Press.tsx)
          setTimeout(() => {
            if (!asking) return title()
            // the answer is usually in long before; if not, it is not worth a wait: ask
            void Promise.race([asking, new Promise<boolean>((done) => setTimeout(done, 150, false))]).then((allowed) => {
              if (allowed || touched()) {
                unlock()
                return title()
              }
              void loadPress().then(() => store.set({ press: 'waiting' })) // long loaded by now; never a blank hand-over
              const off = store.subscribe(() => {
                if (store.get().press !== 'done') return
                off()
                title()
              })
            })
          }, 1100)
        }, wait)
      }
    })

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hush()
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
  if (DEBUG.sheet)
    return (
      <Suspense fallback={null}>
        <Sheet />
      </Suspense>
    )
  return (
    <>
      <Frame>
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
        <BubbleLayer />
        <div className="bubble-layer">
          <NameTag />
        </div>
        <A11yList />
      </Frame>
      {!DEBUG.lab && <ViewControls />}
      <Loader />
      {PRESS && (
        <Suspense fallback={null}>
          <Press />
        </Suspense>
      )}
      <TitleDust />
      <h1 className="sr-only">ZEN Design Team</h1>
    </>
  )
}
