// The diorama in plan units, measured from docs/set/diorama-hero-v2.png.
// Origin = slab front-left corner; x → right, z → back. P() converts to three.js (z = -z).
export const SET = {
  slab: { w: 18, d: 11.5, h: 0.38 },
  wall: { h: 4.6, t: 0.32 },
  roomW: 12.4,                                        // glass wall stands at x = roomW
  steps: [
    { z0: 9.2, h: 0.5 },                              // upper oak platform along the back wall
    { z0: 8.4, h: 0.25 },                             // lower step
  ],
  slats: { x1: 6.1, panelT: 0.12, slatW: 0.08, slatD: 0.07, pitch: 0.14 },
  shoji: { x0: 6.2, x1: 10.0, h: 4.1, frame: 0.12, cols: 4, rows: 6 },
  glass: { z0: 4.6, post: 0.12, rail: 0.1 },
  benches: [
    { x: 1.55, z0: 3.4, z1: 7.3, cushionZ: null as number | null },   // along the logo wall (clear of it)
    { x: 10.9, z0: 1.6, z1: 5.0, cushionZ: 4.4 },                     // by the glass (clear of the pane)
  ],
  bench: { h: 0.46, w: 0.52, slat: 0.08 },
  cushion: { w: 0.62, h: 0.17 },
  floorCushions: [
    { x: 5.6, z: 6.2, yaw: 0.25 },
    { x: 7.6, z: 5.6, yaw: -0.15 },
  ],
  table: { x: 9.9, z: 3.9, r: 0.55, h: 0.5 },
  plant: { x: 1.55, z: 1.65, potR: 0.46, potH: 0.64 },
  poster: { z0: 2.2, w: 2.7, y0: 1.15, h: 3.05, frame: 0.05 },
  logo: { z: 1.0, y: 3.8, r: 0.26 },  // y = centre of the ring mark
  garden: { x0: 13.0, x1: 17.4, z0: 4.0, z1: 11.0, depth: 0.09 },
  sittingStone: { x: 14.6, z: 5.3, r: 1.05, h: 0.36 },
  stones: [
    { x: 15.2, z: 7.6, r: 0.32 },
    { x: 15.7, z: 7.25, r: 0.24 },
    { x: 15.5, z: 8.05, r: 0.2 },
  ],
  bonsai: { x: 14.8, z: 9.8, potR: 0.7 },
  shrub: { x: 16.3, z: 8.2, r: 0.7 },
  lanterns: [
    { x: 13.6, z: 8.2 },
    { x: 16.5, z: 9.4 },
    { x: 16.4, z: 6.0 },
  ],
}
export const P = (x: number, y: number, z: number): [number, number, number] => [x, y, -z]
