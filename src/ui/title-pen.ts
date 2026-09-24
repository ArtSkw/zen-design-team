// The pen for the title card: for every letter of "Meet ZEN Design Team", the path a
// hand would take to write it — centrelines through the letter's strokes, in a
// human order and direction — traced by hand from the outlines in title-glyphs.ts
// (same units). The card reveals each letter by drawing these strokes as a mask over
// its outline, so ink appears only where the pen has passed and the finished frame
// is exactly Artur's type.
//
// `strokes` are written in order, the pen lifting briefly between them; `later`
// strokes wait until the word is written (the dot on the i). `weight` picks the nib:
// wide enough to cover the letter's thickest stroke with a little to spare.

export type PenLetter = { ch: string; weight: 'regular' | 'bold'; strokes: string[]; later?: string[] }

export const NIB = { regular: 8.2, bold: 10.5 }

// the lowercase e, as a shape to move: regular (Meet) and bold (Design, Team)
const eRegular = (dx: number) =>
  shift(
    'M57.4 28.4 L76.66 28.4 C76.66 21.85 71.9 16.23 66.4 16.23 C60.37 16.23 55.48 21.85 55.48 28.75 C55.48 35.65 60.9 41.26 67.3 41.26 C70.8 41.26 74.3 40.3 76.6 38.8',
    dx,
  )
const eBold = (dx: number) =>
  shift(
    'M330.5 28.4 L348.44 28.4 C348.44 21.96 344.01 16.52 338.55 16.52 C332.51 16.52 327.62 21.96 327.62 28.68 C327.62 35.4 332.9 40.83 339.6 40.83 C343.2 40.83 346.4 40.1 348.6 38.5',
    dx,
  )

/** Move every x coordinate of an absolute path by dx (x, y pairs; no H/V). */
function shift(d: string, dx: number) {
  if (!dx) return d
  let k = 0
  return d.replace(/-?\d+(?:\.\d+)?/g, (n) => (k++ % 2 === 0 ? String(+(+n + dx).toFixed(3)) : n))
}

export const PEN: PenLetter[] = [
  // Meet — lighter, and a touch quicker
  { ch: 'M', weight: 'regular', strokes: ['M7.88 41.2 L7.88 4.4 L25.26 34.5 L42.65 4.4 L42.65 41.2'] },
  { ch: 'e', weight: 'regular', strokes: [eRegular(0)] },
  { ch: 'e', weight: 'regular', strokes: [eRegular(31.152)] },
  {
    ch: 't',
    weight: 'regular',
    strokes: ['M121.04 8.4 L121.04 33 C121.04 37.6 124.3 41.08 129.3 41.08 C130.6 41.08 131.9 40.9 132.9 40.6', 'M114.2 16.96 L131.1 16.96'],
  },
  // ZEN
  { ch: 'Z', weight: 'bold', strokes: ['M153.9 5.2 L179.6 5.2 L154.0 39.9 L180.6 39.9'] },
  { ch: 'E', weight: 'bold', strokes: ['M213.2 5.07 L192.1 5.07 L192.1 40.04 L213.2 40.04', 'M192.1 22.24 L212.0 22.24'] },
  { ch: 'N', weight: 'bold', strokes: ['M226.6 40.9 L226.6 4.3 L254.3 40.9 L254.3 4.3'] },
  // Design
  {
    ch: 'D',
    weight: 'bold',
    strokes: ['M286.0 5.18 L286.0 39.93', 'M286.0 5.18 L297.2 5.18 C307.06 5.18 315.05 12.95 315.05 22.53 C315.05 32.14 307.06 39.93 297.2 39.93 L286.0 39.93'],
  },
  { ch: 'e', weight: 'bold', strokes: [eBold(0)] },
  {
    ch: 's',
    weight: 'bold',
    strokes: [
      'M375.8 18.6 C373.1 17.2 370.9 16.61 368.4 16.61 C363.58 16.61 359.67 19.43 359.67 22.9 C359.67 26.4 362.8 27.6 366.0 28.3 L371.0 29.3 C374.3 30.0 376.43 31.8 376.43 34.6 C376.43 38.8 372.6 41.03 367.6 41.03 C364.5 41.03 361.1 40.3 358.3 38.9',
    ],
  },
  { ch: 'i', weight: 'bold', strokes: ['M389.15 17.4 L389.15 40.2'], later: ['M388.6 5.01 L389.7 5.01'] },
  {
    ch: 'g',
    weight: 'bold',
    strokes: [
      'M420.2 21.0 C418.4 18.3 415.6 16.8 412.4 16.8 C406.6 16.8 402.39 21.6 402.39 28.2 C402.39 34.8 406.6 39.55 412.4 39.55 C416.3 39.55 419.3 37.6 421.0 34.2 L424.2 17.4 L424.2 40.5 C424.2 46.46 419.27 51.3 413.2 51.3 C409.7 51.3 405.3 50.5 402.4 48.6',
    ],
  },
  {
    ch: 'n',
    weight: 'bold',
    strokes: ['M438.85 17.4 L438.85 40.3 L438.9 26.5 C440.4 20.4 445.0 16.9 450.7 16.9 C455.6 16.9 458.25 20.0 458.25 25.9 L458.25 40.3'],
  },
  // Team
  { ch: 'T', weight: 'bold', strokes: ['M484.2 5.21 L514.3 5.21', 'M499.25 5.21 L499.25 40.3'] },
  { ch: 'e', weight: 'bold', strokes: [eBold(190.709)] },
  {
    ch: 'a',
    weight: 'bold',
    strokes: [
      'M550.4 18.9 C553.5 17.3 556.6 16.8 560.0 16.8 C565.6 16.8 568.83 19.9 568.83 25.3 L568.83 40.3',
      'M566.0 28.27 L558.6 28.27 C553.6 28.27 550.17 30.5 550.17 34.4 C550.17 38.5 553.4 41.08 557.9 41.08 C561.9 41.08 565.2 38.5 566.6 34.8',
    ],
  },
  {
    ch: 'm',
    weight: 'bold',
    strokes: [
      'M583.28 17.4 L583.28 40.3 L583.3 26.5 C584.6 20.4 588.6 16.9 594.3 16.9 C598.8 16.9 601.35 20.0 601.35 25.9 L601.35 40.3 L601.35 26.5 C602.7 20.4 606.6 16.9 612.2 16.9 C616.8 16.9 619.39 20.0 619.39 25.9 L619.39 40.3',
    ],
  },
]

/** Letter indices where each word ends (the pen pauses; `later` strokes land here). */
export const WORD_ENDS = [3, 6, 12, 16]
