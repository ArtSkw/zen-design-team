// Zenek canon, measured from the approved 2D designs (docs/cast/*.png).
// Fractions of the body radius R unless noted. Arc coordinates on the sphere.
export const ZR = 0.82 // world radius in the diorama: Ø ≈ 0.36 × wall height

export const CANON = {
  plate: {
    a: 0.64,   // half-width (arc / R)
    b: 0.4,    // half-height
    n: 2.3,    // superellipse exponent (near-ellipse, as drawn)
    y: 0.26,   // plate centre height above the body centre (fraction of R → pitch = asin)
    h: 0.004,  // flush with the body: a painted region, not a raised cap
    lip: 0.004, // vanishing edge, just enough to bury the seam
  },
  eye: {
    rx: 0.085, // half-width — the designs draw vertical ovals, not dots
    ry: 0.11,  // half-height
    rz: 0.06,  // depth
    dx: 0.19,  // half-distance between eyes (arc / R)
    y: 0.12,   // eye centre height above the body centre (fraction of R)
    h: 0.06,   // eye centre height above the body surface
  },
  hand: { r: 0.27, x: 1.05, y: -0.33, z: 0.18 }, // beside the body, a little forward
}

export type FaceOverride = {
  plate?: Partial<typeof CANON.plate>
  eye?: Partial<typeof CANON.eye>
}

export function faceOf(o?: FaceOverride) {
  return { plate: { ...CANON.plate, ...o?.plate }, eye: { ...CANON.eye, ...o?.eye } }
}
