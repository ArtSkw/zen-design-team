// Mirek's flight jacket (docs/cast/mirek.png; body circle (627, 630) px, R 384): where its
// pieces sit on the head's sphere, in yaw/pitch degrees (yaw 0 = the face, + toward the
// viewer's right; the viewer's left side mirrors the right). Shared by the baked sculpts
// (sculpts/mirek.ts: the leather, the shearling collar, the pocket flaps) and the trim built
// in code (jacket.tsx: the zip, the snaps, the patches), so the two always agree.
//
// The design draws the jacket puffy, hanging well below the round body (its hem at −1.25 R);
// the build keeps it a slim layer on the sphere (Aneta's lesson: bulk made her look heavy),
// so the collar is placed as drawn (near the equator the drawn body is the head's sphere) and
// the lower pieces are read on the drawn jacket's own bulge (an ellipsoid 1.03 R across, 1.25 R
// down) and set on the sphere at the same place on it — the patches a little higher, the
// pockets nearer the hem.

/** The collar's edges, by |yaw|: the neck edge it rolls over, and its outer edge on the shoulders. */
export const COLLAR_ROLL: [number, number][] = [[20, -6.9], [30, -4.3], [45, 2.5], [60, 9], [75, 17], [90, 19], [130, 18], [180, 17], [215, 17]] // (past 180: the back is no edge — the collar is whole round the neck)
// over the shoulders, where the hands rest and talk (yaw 67–97°, as for Aneta's hair), the collar
// is a slim roll high round the neck, above their reach; the lapels in front keep their size
export const COLLAR_OUTER: [number, number][] = [[20, -6.9], [36, -15], [51, -23], [56, -15], [62, -1], [72, 12], [90, 14], [108, 11], [140, 3], [180, 0], [215, 0]] // wider again behind, clear of the hands
/** The fronts' V: from the lapel tips down to where the zip closes. */
export const V_TIP: [number, number] = [20, -6.9]
export const ZIP_TOP = -20
/** The hem, all round (under the body: the camera never sees it). */
export const HEM = -66
/** The chest pockets' flaps (|yaw| span, pitch span) and the snap on each. */
export const FLAP = { yaw: [20, 62] as [number, number], pitch: [-49, -36] as [number, number] }
export const SNAP: [number, number] = [41, -42.5]
/** The chest patches: the carrier roundel on the viewer's left, the jet shield on the right. */
export const PATCH_L = { yaw: -29, pitch: -22.5, size: 0.34 } // a circle 0.34 R across
export const PATCH_R = { yaw: 29, pitch: -22.5, size: 0.31 } // a shield 0.31 R across and as tall
/** How far off the body each layer stands (R). */
export const LEATHER = 1.034
export const FLAP_T = 0.024
