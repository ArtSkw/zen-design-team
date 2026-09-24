// Extract the design-system illustration paths we reuse verbatim (docs/ds/*.svg,
// exported from the ZenDS Assets Figma file) into src/set/ds-paths.ts.
//   node scripts/ds-paths.mjs
// Each motif keeps the original path data in its own "illustration pixel" space
// (the DS draws everything with a 2 px #222 stroke on #F5F5F5), plus a crop box so
// the renderer can scale and anchor it. Fills are classified: ink (#222), paper
// (white), hatch (the DS diagonal pattern, drawn at 15 %), stroke.
import { readFileSync, writeFileSync } from 'node:fs'

const read = (f) => readFileSync(`docs/ds/${f}`, 'utf8')
const elements = (svg) => {
  const out = []
  for (const m of svg.matchAll(/<path\b([^>]*)\/?>/g)) {
    const a = Object.fromEntries([...m[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map((x) => [x[1], x[2]]))
    if (!a.d) continue
    const id = a.id ?? ''
    let op = null
    if (a.stroke && a.stroke !== 'none') op = 'stroke'
    else if (/^url\(#pattern/.test(a.fill ?? '')) op = 'hatch'
    else if (/^#222/i.test(a.fill ?? '')) op = 'ink'
    else if (/^white$|^#fff/i.test(a.fill ?? '')) op = 'paper'
    if (!op) continue
    out.push({ id, op, d: a.d, evenodd: a['fill-rule'] === 'evenodd' })
  }
  return out
}
// `under` lists the stroke ids whose closed shape gets a paper fill before the
// stroke, so a mountain or a roof hides what is drawn behind it (the DS draws on
// empty paper; we draw on a page that already has hills).
const pick = (els, ids, under = []) => {
  const want = new Set(ids)
  const found = els.filter((e) => want.has(e.id))
  const missing = ids.filter((i) => !found.some((e) => e.id === i))
  if (missing.length) throw new Error(`missing ids: ${missing.join(', ')}`)
  const u = new Set(under)
  // keep source order, drop the "_2" duplicates
  return found.filter((e) => !e.id.endsWith('_2')).map((e) => (u.has(e.id) ? { ...e, under: true } : e))
}
const S = (n) => `Stroke ${n}`
const F = (n) => `Fill ${n}`

const torii = elements(read('illo-torii.svg'))
const fuji = elements(read('illo-fuji-scene.svg'))
const bridge = elements(read('illo-bridge-hills.svg'))
const treesA = elements(read('illo-trees-a.svg')) // the "CompanyBig" building with a tree and two gulls
const treesB = elements(read('illo-trees-b.svg')) // the "Company" building with a big and a small tree
const cloudsStreet = elements(read('illo-clouds-street.svg')) // a three-bump cloud rising to the right
const cloudsFlags = elements(read('illo-clouds-flags.svg')) // a longer one rising to the left
const planGate = elements(read('illo-zen-plan-smart.svg')) // the ZenPlanSmart pictogram: a gate with a hanging coin (supplied by Artur, 2026-09-23)
// Paper bodies for the gate, traced from its strokes (the pictogram has no fills): roof,
// beams, struts, pillars and the coin hide the hills behind them; the space under the
// rope arc stays open, so the landscape shows through the gate.
const GATE_BODIES = [
  'M74.5241 88.8944 L55.6642 70.0344 L94.4575 75.1388 C116.28 78.0102 138.384 78.0102 160.207 75.1388 L199 70.0344 L180.14 88.8944 Z',
  'M72.6382 88.8943 L182.026 88.8943 L180.14 100.21 L74.5242 100.21 Z',
  'M85.8403 100.21 H97.1562 V113.412 H85.8403 Z',
  'M157.508 100.21 H168.824 V113.412 H157.508 Z',
  'M74.5242 113.412 L180.14 113.412 L182.026 124.728 L72.6382 124.728 Z',
  'M85.8403 124.728 H97.1562 V200.168 H85.8403 Z',
  'M157.508 124.728 H168.824 V200.168 H157.508 Z',
  'M135.762 151.132 A8.43 8.43 0 1 1 118.902 151.132 A8.43 8.43 0 1 1 135.762 151.132 Z',
]

const motifs = {
  // The torii gate with its two round trees, as drawn (328 × 200, baseline y 198.4).
  torii: {
    crop: [0, 0, 328, 198.4],
    items: pick(torii, [F(1), F(3), S(5), S(7), S(9), F(11), S(12), F(13), S(14), F(16), S(17), F(19), S(20), F(21), S(22), F(23), S(25), F(27), S(29), S(31), S(33), F(35), F(37), S(39), S(41), F(43), S(45), F(47), S(49)]),
  },
  // Fuji: outlined cone with a snow cap, ink foot (37..141 × 164.8..196).
  fuji: { crop: [37, 164.8, 141, 196], items: pick(fuji, [S(70), F(72)], [S(70)]) },
  // The small pagoda and its tree from the same scene.
  pagoda: { crop: [58, 212, 114.5, 250.6], items: pick(fuji, [S(74), S(76), S(78), S(79), S(81)], [S(74), S(76), S(78), S(79), S(81)]) },
  tree: { crop: [126, 223.6, 139, 251], items: pick(fuji, [F(56), S(58), S(60)]) },
  pagodaSmall: { crop: [464, 218, 500.5, 250.6], items: pick(fuji, [S(77), S(80), S(82)], [S(77), S(80), S(82)]) },
  // The plane (the swoosh — it climbs to the right) and the little sun ring from the bridge illustration.
  plane: { crop: [274, 37, 310, 53], items: pick(bridge, [F(57)]) },
  sun: { crop: [343, 28, 361, 46], items: pick(bridge, [S(35)], [S(35)]) },
  // Two gulls, as drawn next to the company building.
  gull: { crop: [35, 20, 62, 33], items: pick(treesA, [S(53)]) },
  gullBig: { crop: [61, 29, 98, 55], items: pick(treesA, [S(52)]) },
  // Round trees with the curl, a big one and a small one, trunks included.
  treeBig: { crop: [2, 88, 66, 189], items: pick(treesB, [S(17), S(23)], [S(17)]) },
  treeSmall: { crop: [226, 144, 254, 189], items: pick(treesB, [S(21), S(25)], [S(21)]) },
  // DS clouds, as drawn: a flat base and wave-crest bumps, hatched; `under` gives
  // them a paper body so nothing behind shows through the hatch. The small one is
  // the Fuji scene's (the pagoda scene repeats it).
  cloud: { crop: [258, 0, 411, 34.484], items: pick(cloudsStreet, [F(3)], [F(3)]) },
  cloudLong: { crop: [0, 0, 191.853, 44.765], items: pick(cloudsFlags, [F(1)], [F(1)]) },
  cloudSmall: { crop: [392, 112.75, 515, 140.482], items: pick(fuji, [F(4)], [F(4)]) },
  // The ZenPlanSmart gate, strokes verbatim over traced paper bodies; baseline = its ground line.
  gate: {
    crop: [55, 69, 200, 200.168],
    items: [...GATE_BODIES.map((d) => ({ id: '', op: 'paper', d, evenodd: false })), ...planGate.filter((e) => e.op === 'stroke')],
  },
  // The suspension bridge alone (towers, cables, deck), hills excluded.
  bridge: {
    crop: [323, 1, 676, 181],
    items: pick(bridge, [S(1), S(3), S(5), S(7), S(9), S(11), S(13), S(15), S(17), S(19), S(21), S(23), S(25), S(27), S(29), S(31), S(33), S(45), S(47), S(49), S(51)]),
  },
}

const ts = `// GENERATED by scripts/ds-paths.mjs from docs/ds/*.svg — do not edit by hand.
// Design-system illustration paths in their original "illustration pixel" space
// (2 px #222 strokes on #F5F5F5). crop = [x0, y0, x1, y1] of the motif; the
// bottom edge of the crop is the motif's baseline.
export type InkOp = 'stroke' | 'ink' | 'paper' | 'hatch'
export type DsItem = { op: InkOp; d: string; evenodd?: boolean; under?: boolean }
export type DsMotif = { crop: [number, number, number, number]; items: DsItem[] }

export const DS: Record<${Object.keys(motifs).map((k) => `'${k}'`).join(' | ')}, DsMotif> = ${JSON.stringify(
  Object.fromEntries(Object.entries(motifs).map(([k, v]) => [k, { crop: v.crop, items: v.items.map((i) => ({ op: i.op, d: i.d, ...(i.evenodd ? { evenodd: true } : {}), ...(i.under ? { under: true } : {}) })) }])),
  null,
  2,
)}
`
writeFileSync('src/set/ds-paths.ts', ts)
console.log('wrote src/set/ds-paths.ts:', Object.entries(motifs).map(([k, v]) => `${k}=${v.items.length}`).join(' '))
