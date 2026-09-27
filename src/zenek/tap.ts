// The boing when a Zenek is tapped: body height (squash, stretch, a wobble) and hop, over
// TAP_DUR seconds (src/zenek/motion.ts).
export const TAP_DUR = 0.48
export const TAP_SY: [number, number][] = [[0, 1], [0.14, 0.86], [0.34, 1.1], [0.52, 0.96], [0.72, 1.02], [1, 1]]
export const TAP_Y: [number, number][] = [[0, 0], [0.14, -0.03], [0.34, 0.3], [0.56, 0], [0.7, 0.05], [0.84, 0], [1, 0]]
