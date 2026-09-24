import { useSyncExternalStore } from 'react'

export type Phase = 'loading' | 'title' | 'intro' | 'ready'

export type State = {
  phase: Phase
  progress: number          // 0..1 loader progress
  loaded: boolean           // everything is in; the loader plays its completion
  written: boolean          // the title's pen has finished, by its own clock (TitleCard)
  dissolve: boolean         // the written title lets go and turns into petals (TitleDust), still on the curtain
  lift: boolean             // the petals are falling: the curtain may lift (TitleDust)
  posterLoaded: boolean
  fontsReady: boolean
  sculptsReady: boolean     // every baked hair and beard the cast wears is decoded
  firstFrame: boolean
  introClock: number        // three.js clock time at which the entrance wave started
  active: string | null     // member id with an open bubble
  hover: string | null
  pointerActiveAt: number   // performance.now() of the last pointer move over the stage
  reducedMotion: boolean
}

const state: State = {
  phase: 'loading',
  progress: 0,
  loaded: false,
  written: false,
  dissolve: false,
  lift: false,
  posterLoaded: false,
  fontsReady: false,
  sculptsReady: false,
  firstFrame: false,
  introClock: -1,
  active: null,
  hover: null,
  pointerActiveAt: -1e9,
  reducedMotion: false,
}

const listeners = new Set<() => void>()

export const store = {
  get: () => state,
  set(patch: Partial<State>) {
    Object.assign(state, patch)
    listeners.forEach((l) => l())
  },
  // Silent write for high-frequency, non-rendered fields (pointer timestamps).
  mutate(patch: Partial<State>) {
    Object.assign(state, patch)
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(store.subscribe, () => sel(state), () => sel(state))
}
