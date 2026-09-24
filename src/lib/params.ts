// URL-driven tunables. Every value has a frozen default; the query string only
// overrides it, so screenshots and the dev loop can dial things in without a UI.
const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '')

export const P = {
  num: (k: string, d: number) => {
    const v = q.get(k)
    return v == null || v === '' || Number.isNaN(Number(v)) ? d : Number(v)
  },
  flag: (k: string, d = false) => {
    const v = q.get(k)
    return v == null ? d : v !== '0'
  },
  str: (k: string, d: string) => q.get(k) ?? d,
}

export const DEBUG = {
  grid: P.flag('grid'),            // calibration grid + depth markers
  intro: P.flag('intro', true),    // 0 = skip loader and entrance, land settled
  motion: P.flag('motion', true),  // 0 = freeze idle motion (deterministic shots)
  ghost: P.flag('ghost', false),   // mirrored ghost copies (off: the floor reflects for real)
  shadow: P.flag('shadow', true),  // contact shadows
  lab: P.str('lab', ''),           // member id → single Zenek on neutral, for material work
  tone: P.str('tm', 'neutral'),    // aces | agx | neutral | none
  hold: P.flag('hold'),            // keep the loader on screen (design check)
  done: P.flag('done'),            // with hold: show the loader's completed state
  progress: P.num('progress', -1), // force the loader ring to a value (design check)
  sheet: P.flag('sheet'),          // the drawn world as a flat layer sheet, no 3D
  bridge: P.flag('bridge'),        // the DS suspension bridge on the mid ring (removed by Artur 2026-09-23: it floats over the hills); ?bridge=1 shows it
  inkDeck: P.flag('inkdeck'),      // the drawn (paper + ink) deck instead of the wooden one
  gest: P.str('gest', ''),         // force one gesture on every Zenek (design check): talk|look|scratch|wave|stretch|nod|tilt
  gestU: P.num('gestu', 0.5),      // …at this progress 0..1
  title: P.str('title', '1'),      // '0' skips the title card; 'hold' stays on it (design check)
  dust: P.str('dust', '1'),        // the title lets go into petals before the room rises; '0' = the plain fade; 'hold' = frozen at its start, window.__dust.seek(ms) (design check)
  loaderT: P.num('lt', -1),        // with hold=1&done=1: freeze the loader's completion timeline at this second
  loaderAngle: P.num('la', 0),     // …and complete from this spin angle, in degrees (0 = dot at the bottom)
}
