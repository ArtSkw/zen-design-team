# ZEN Design Team — Strategy & Execution Spec (v0.1 → v1.0)

> **Part I is strategy**: the approach, where quality lives, the risks and their
> escape hatches, and the rubric every phase is judged by. **Part II is the
> buildable spec**: phases in dependency order, exact files, starting values,
> exit criteria.
>
> Constraint that shapes everything: **the photo is the set and the camera never
> moves.** Everything 3D must sit inside a plate we did not render — so light
> direction, shadow, scale and tone are matched to the photograph, never the
> reverse. One authored composition, scaled as a unit.
>
> **Where we are (2026-09-22, night):** the pivot is built as a v0.5. The set is a
> code-only diorama reconstructed from Artur's 2D diorama render (`docs/set/`):
> slab with cut-out gravel bed, L-wall with the ZEN.COM mark and the Palace poster,
> walnut slats, shoji screen, glass wall, oak platform, bench with the green cushion,
> plant, zen garden with stones, bonsai, shrub and glowing lanterns; polished-floor
> reflections, soft variance shadows, one studio light rig (`src/set/`). Three
> characters are reconstructed from their 2D designs with measured specs
> (`docs/cast/cast.md`, `src/zenek/parts.tsx`): Artur, Janek, Magda R. The loader,
> entrance wave, idle motion, viewer-facing gaze with pointer offset, tap → bubble,
> portrait pan and the screenshot loop all run. Screenshots: `shots/set5-1600x900.png`,
> `shots/cmp-*.png` (design vs render), `shots/click-1600x900.png`, `shots/portrait-390x844.png`.
>
> **How it was built:** the img2threejs skill could not run here (not installed —
> the classifier blocked the clone — and this machine has Python 3.9.6; the skill needs
> 3.10+). Its method was followed by hand: pixel-measured spec → component tree →
> build → side-by-side comparison sheet → correction passes (five for the characters,
> incl. one geometry fix: hair locks use a radial frame so flat ribbons do not twist).
> Once the skill is installed, the three characters and the set are candidates for its
> gated refinement passes.
>
> **Live-preview fixes (2026-09-22, late):** eye blink multiplied the eye's base scale
> instead of overwriting it (the live app showed unit-length spikes; `motion=0` shots had
> hidden it — shoot with motion on from now on); shoji lattice/paper no longer coplanar;
> glass is a plain clear pane (no transmission pass). The postcard frame is gone:
> full-screen stage, drei OrbitControls within limits, DOM view controls
> (`src/ui/ViewControls.tsx`, `src/scene/view.ts`), idle camera sway. Phase 1.3's stage
> scaling and portrait pan are retired. Character scale vs a 14-strong cast is open:
> Artur is regenerating a larger diorama first.
>
> **Set v2 (2026-09-22, late):** rebuilt from Artur's larger diorama render
> (`docs/set/diorama-hero-v2.png`): slab 18 × 11.5 plan units, two-step oak platform,
> second bench along the logo wall, two floor cushions, concrete side table with cups,
> flat sitting stone, three lanterns; `src/set/dims.ts` is the single source of the
> measurements. All fourteen seats are laid out as a party scatter across three heights
> and the terrace (`src/cast/team.ts`); the eleven undesigned members sit as plain Zeneks
> until their designs arrive. Character radius stays 0.82. Shot: `shots/set7-1600x900.png`.
>
> **Refinement round (2026-09-22, late):** view controls centred at the bottom; resting
> gaze is now social — each Zenek leans toward its nearest neighbour (blend 0.62 toward
> the neighbour, the rest toward the viewer so faces stay readable; Artur greets the
> viewer via `gaze: 'viewer'`), and a cursor that comes within ~5 world units earns a
> slow turn (λ 3.2) and is followed while near; set geometry tidied (steps start at the
> wall face and stop inside the glass post, slat panel clear of the left wall, poster
> frame off the wall, no redundant recess walls, benches/plant/stone/seats moved clear of
> walls and panes); loader is a satin-black "thinking orb" with a luminous sweep and the
> ZEN ring as progress, exiting with a scale/blur while the scene fades in, the camera
> dollies from a pulled-back angle to home (λ 1.7) and the room rises 1.6 units into
> place over 1.5 s; Zeneks arrive 0.55 s after the curtain lifts. Headless shots cannot
> time the intro — judge it live.
>
> **Round 3 (2026-09-22, night):** approach behaviour corrected — a cursor that comes
> close makes the Zenek look at the *viewer* (camera), not at the cursor; hover shows a
> smooth name tag above the head (normal case, `src/ui/NameTag.tsx`), tap shows the
> quote only; hair/beard/glasses are now raycast targets so hovering the hair counts;
> loader replaced by the design-system mark (`✅Loader.svg` path inlined in
> `src/ui/Loader.tsx`) with an eased playful spin, a pop-in and a shrink-out; the wall
> mark is the real brand SVG (`public/set/zen-logo.svg`) rasterised at 4× and rotated
> to read top-to-bottom. `scripts/shot.mjs --hover x,y` and `scripts/debug-hover.mjs`
> verify hover states headlessly.
>
> **Round 4 (2026-09-22, night):** wall logo 0.5 units wide; hover name 17 px, quote
> 16 px. Loader rebuilt from primitives (`src/ui/Loader.tsx`): ring + notch + dot spun
> by a rAF loop with a wobble; on `store.loaded` the spin settles on a whole turn, the
> notch closes, the dot travels to the check anchor (40, 25) and the check draws — the
> completed state matches `Loader-completed.svg`; the curtain lifts 1.35 s later.
> Debug flags: `?hold=1` (loading state), `?hold=1&done=1` (completed state);
> `scripts/debug-done.mjs` verifies the morph geometry (Playwright needs
> `animations: 'disabled'` to screenshot it). Background/environment options were
> analysed for Artur (see the 2026-09-22 conversation summary in BRIEF open decisions).
>
> **Round 5 (2026-09-22, night) — environment + flush faces:** the face plate is
> flush (h 0.004 R, vanishing lip) so it reads as a painted region of the body; eyes
> sit at 0.05 R. `src/set/Environment.tsx` builds the world from
> `docs/set/diorama-hero-v3-water.png`: gradient sky dome with a warm sun glow
> (shader), reflective teal water (MeshReflectorMaterial + procedural noise normal /
> distortion map, scrolled), timber deck with a pier and edge pilings, distant hill
> mounds and mist sprites dissolved by fog (`FOG` colour shared by sky horizon and fog),
> 110 instanced blossom petals (70 drifting on the water, 40 falling), additive glow
> sprites on the lanterns. Home view lowered and widened (el 16°, fov 34°) so the
> horizon sits at the top of the frame; the deck's under-slab shadow replaced the
> desk ContactShadows. Environment sits outside the rising group.
>
> **Round 6 (2026-09-22, late night) — the illustrated page (BRIEF open decision 7 → C):**
> `docs/ds/*.svg` are the real ZenDS illustrations (torii, the Fuji/pagoda scene, the
> bridge-and-hills splash, the hatched skyline with the bird, two cloud scenes), exported
> from the ZenDS Assets Figma file via MCP; `scripts/ds-paths.mjs` extracts the motifs we
> reuse verbatim (torii, fuji, pagoda, tree, bird, sun, bridge) into the generated
> `src/set/ds-paths.ts`. `src/set/ink.ts` is the DS hand as a drawing vocabulary — `Ink`
> (2 px stroke, paper fills, the 6 px diagonal hatch locked to canvas pixels, rounded
> hills as circular arcs, hatched clouds, a hatched skyline with the Palace of Culture)
> plus the composition: three rings (`near` r 47 with the horizon stroke and the torii
> island, `mid` r 78 with Fuji and a pagoda on a ridge, `far` r 118 with the skyline), each
> one continuous strip wrapped on a cylinder around the room (three texture segments,
> seams at φ 165°/260°, outside the home view), and floaters (sun, five drifting clouds)
> on small planes facing the room. Ink fades with depth (tone 1 / 0.7 / 0.42); stroke
> width and hatch pitch are computed per ring so they stay ≈ 2 px / 6 px on screen from
> the home camera. `src/set/Illustrated.tsx` renders it unlit, unfogged and untoned on a
> paper sky with a whisper of grain; the water is a disc ending just inside the near
> strip (`MeshReflectorMaterial`, pale mineral `#ccd5d0`, mirror 0.4, `depthScale 0` so
> reflected hills do not read lighter than reflected sky); stroke ripples sit at every
> piling; two birds cross the home arc every 24–58 s (one holds still under reduced
> motion). Sky, fog and the CSS page share one paper (`#f3f0ea`). Lanterns: point light
> 0.7 / distance 5 plus a baked warm pool. `?sheet=1` renders the layer set flat, as the
> camera sees it (whole arc + the home arc at 3×); `?bridge=1` adds the DS bridge;
> `?az=&el=&dist=` override the home view for shots. The visible arc is φ 50°–370°
> because at the orbit's ends (az −50°/115°, 52 units out) the camera is off-centre.
> Shots: `shots/ink4-*.png` (home, portrait, both orbit ends, el 12°, retina, intro),
> `shots/sheet4*.png`.
>
> **Round 7 (2026-09-23, small hours) — Artur's review of the page, five fixes:**
> (1) the "birds" were the DS *plane* glyph flying backwards on a flat line: it is now
> called what it is (`DS.plane`, nose upper-left as drawn), flies the way it points,
> climbs ~2.6 units over a crossing, and is rare (every 38–80 s); real gulls came from the
> DS company illustration (`DS.gull`, `DS.gullBig`) and cross lower, slower, in a pair
> (`Crossing` in `src/set/Illustrated.tsx`; one plane and one pair hold still under
> reduced motion). (2) Motifs are opaque: `under` in `scripts/ds-paths.mjs` marks strokes
> that get a paper body (Fuji, both pagodas, the sun, tree canopies); clouds and the
> skyline are paper-backed before the hatch; rings draw `back` features (Fuji behind its
> ridge), then every hill, then `front` features (torii, temple, trees), so no hill line
> crosses a motif. (3) The "fog cut" was the camera's far plane at 160 slicing the far
> strip (r 118 + a camera up to 52 out) — far is 600 now; the strips were never fogged.
> (4) Trees from ZenDS (`docs/ds/illo-trees-a/b.svg`, nodes 13069:34168 / 583:3210): round
> canopies with the curl, big and small, standing on hill arcs via `hillY()`. (5) The
> terrace is drawn: paper deck with the DS 2 px ink (board lines, staggered joints, full
> edge strokes, a hatched shadow along the margins the walls fall on), pilings as paper
> cylinders with an inverted-hull ink outline and a ringed cap; the water is a cooler
> mineral (`#bccac6` base — the warm key light pulls it toward cream — mirror .34); ripples are a shader — two rings born at each piling
> every 6 s on their own phase, fading as they grow, plus a still contact ring; 22 short
> stroke marks drift across the water at 5–9 cm/s, never over the deck. Shots:
> `shots/ink7-*.png`, `shots/sheet7-1600x900.png`.
>
> **Round 8 (2026-09-23) — Artur's second review:** the wooden deck is back as the
> default (the drawn deck lives on behind `?inkdeck=1`); the near strip is 9.6 units tall
> so a tree on its tallest hill is no longer clipped by the texture's top edge; the page
> is almost white (`PAPER #f8f7f4`, DS-style pure white fills) and the light rig is
> neutral (key `#fffaf4`, white hemisphere, neutral formers, exposure 1.0) so the room's
> whites, the page and the water (`#d3dbd8`) sit in one tonal family instead of a warm
> room on a beige page. Shots: `shots/ink9-*.png`.
>
> **Round 9 (2026-09-23) — living mascots, living water, the loader's pen:**
> (1) Water: the drifting marks read as scratches; replaced by *blooms* — nine ring pairs
> that appear somewhere on the water, widen and fade over 6–9 s, then move on, never
> over the deck (`WaterBlooms`, one shader, per-mesh clocks; a still frame shows them at
> staggered ages). (2) Lantern halo: the additive sprite met the gravel with a hard cut;
> it is now 1.3 units wide but its gradient dies at 0.56 of the radius — exactly the
> bulb's height above the ground — and the ground carries the warmth through a wider
> baked pool (2.8 units). (3) Gestures (`src/zenek/gestures.ts`): talk (hands bob in
> alternation, a little forward), look (a sweep both ways, chin up), scratch (a hand to
> the temple, wiggles, head tilts away), wave (a hand up, swinging), stretch (taller,
> hands out and up), nod, and a curious tilt — parametric curves over u ∈ [0, 1] with
> attack/release envelopes, picked for the moment (a neighbour → talk/nod; the viewer
> looking → tilt/wave) every 9–21 s per Zenek on its own seeded clock, one at a time;
> the cursor landing on a Zenek earns a wave (at most every 14 s); about a third of the
> room glances up, a beat apart, at whatever crosses the sky (`src/lib/sky.ts`); hands
> also float on the breath, each on its own beat. Hand targets keep the hand centre
> ≥ 0.115 R outside the body — the first targets sat inside the sphere and vanished.
> Auto-riggers (Tripo, Meshy) were checked and ruled out: they need a head, arms and
> legs and apply library clips; Zenek is a legless sphere built in code, so its life is
> authored in code too. (4) Loader: the check path runs left → right; the dot rolls up
> the inside of the ring to the check's start (0.35–0.8 s after `loaded`), draws the
> check as the pen (0.8–1.22 s), then fades and shrinks where it stops (1.22–1.5 s); the
> curtain lifts at 1.6 s. Design checks: `?gest=<kind>&gestu=<0..1>` holds a gesture on
> every Zenek; `?hold=1&done=1&lt=<s>` freezes the loader's completion at second s;
> `scripts/shot.mjs --nowait` skips waiting for ready. Shots: `shots/gest2-*.png`,
> `shots/loader-lt*.png`, `shots/live11-*.png`.
>
> **Round 10 (2026-09-23) — loader rewritten, simple:** on `loaded` the ring snapped
> back to 0° (the rAF effect restarted on `loaded` and reset its angle). A first fix kept
> the old choreography and sent the dot on a hook into the check from wherever it was —
> rejected by Artur: the travelling dot reads weird. Rewritten from scratch
> (`src/ui/Loader.tsx`, one pose function per state): the ring turns at a steady
> 1.2 s/turn; on `loaded`, from whatever angle it is at, the dot shrinks into the line's
> round end and is gone (0–0.2 s), the arc's tail brakes while its head carries on at the
> ring's own rate through the notch and closes the circle (0–0.6 s; a closed ring reads
> the same at any angle, so it may stop anywhere), and a hand-drawn check (curved
> strokes, rounded corner) writes in left → right with a pen rhythm — eases in, slows
> into the corner, sweeps the long stroke (0.45–0.9 s); the mark dips to 0.97 as the
> circle closes and pops to 1.045 as the pen lifts, settled by 1.3 s. Velocity carries
> across the hand-off (text-to-lottie motion rules). `?hold=1&done=1&la=<deg>&lt=<s>`
> freezes the completion from a spin angle; `scripts/debug-loader.mjs` flips `loaded`
> live at several angles (measured: 300°/s → tail 292, head 304°/s on the next frame;
> gap never reopens; nothing turns backwards) and renders `shots/loader-handoff-strip.png`.
>
> **Round 11 (2026-09-23) — snappier loader, controls, UI polish pass:** loader spins
> at 1 turn/s and finishes in 0.88 s (dot 0–0.14, circle 0–0.42, check 0.3–0.62, pop);
> the check is the DS path again (`M20.4 30.9 L27.4 37.7 L40 25`, straight strokes);
> curtain lifts at 1.1 s. The spin is now a Web Animation on an HTML box (compositor
> thread — smooth while shaders compile); on `loaded` its angle is read back on the frame
> clock and the rAF finish takes over (measured: 360°/s → tail 346, head 371°/s). View
> controls: home first, then rotate, zoom; Lucide icons (`lucide-react`, ISC) — ZenDS
> icons pending Figma MCP authorisation. Polish pass using jakubkrehel/
> make-interfaces-feel-better and emilkowalski/skills: `--ease-out`
> (0.23, 1, 0.32, 1) token; press scale 0.96 (was 0.94, under both repos' 0.95 floor);
> hover gated to fine pointers; 44 px targets on touch (was 36); tap highlight off,
> `touch-action: manipulation`; safe-area bottom inset; shadow rings instead of borders
> on the pills and name tag; the bar rises in group by group (50 ms apart) after the
> curtain; name tag 160 ms in / 100 ms out, no overshoot, grows from the head; bubble
> from scale 0.95 in 200 ms (was 0.6 with a bounce); loader mark exits in 240 ms
> (scale 0.94 + blur 4 px) — its pop-in had `fill-mode: both`, which silently cancelled
> the exit transition; reduced motion keeps fades and drops movement.
>
> **Round 12 (2026-09-23) — Artur's review: grounded skyline, more drawn detail, room
> charm, conversation, character-fidelity options.**
> (1) *Drawn world* (`src/set/ink.ts`): every ring is now a continuous chain of hills
> (`chain()`: seeded overlapping arcs along the whole arc, `lift(φ)` dips it where
> something must show through) with the featured motifs drawn over it — a flat stretch
> of baseline read as a floating edge once the rings slid past each other in an orbit.
> The far city (`Ink.skyline`, Palace refined: wings, podium, four side towers, tiers
> with corner pinnacles, crown, spire; every block rooted below the baseline) is a
> `back` feature at φ 165°, behind far hills that dip to 38 % around it — grounded in
> its own strip, so no orbit can separate it from its ground (`shots/r12-city2x-top.png`).
> The mid chain dips at Fuji so its inked foot stays clear. `Ring.shade`: a hatched
> paper-cut shadow — each hill's silhouette lifted `shade` (and nudged a third of that
> away from the sun), hatched onto the hills already drawn, clipped to the baseline (near
> 0.55, mid 0.75, far none). More DS detail: trees on four more hills, the small stupa
> (`DS.pagodaSmall`) on a mid ridge, a line of small trees on another, six cloud
> silhouettes (`CLOUD.two/three/four/long`). The bridge is on by default (`?bridge=0`
> removes it). Far ring 12 units tall.
> (2) *Room* (`src/set/props.ts`, `src/set/Diorama.tsx`): the plant is a broad-leaf
> plant (13 arching ovate blades on stems, `leafGeometry`); the bonsai a pine — leaning
> S-trunk, branches, four flat needle pads (`padGeometry`: lumpy flattened blobs with a
> fine grain); cushions are puffed superellipsoids (`pillowGeometry`, pressed flat
> underneath, top height unchanged); a cast-iron teapot joins the cups. Magda R moved
> onto the green cushion at the glass end of her bench (seat y 0.62) — the table and the
> bench's front half are back in the home view.
> (3) *Conversation* (`src/zenek/social.ts`, `CIRCLES` in `src/cast/team.ts`): six
> circles (five pairs and a trio; Janek alone on the platform). One seeded director per
> circle: a turn of 2.8–5.8 s, then 0.8–2.4 s of silence (18 % a shared laugh, 20 % a
> lull of 6–13 s); pairs mostly alternate, a host (Artur, `gaze: 'viewer'`) takes the
> floor half as often and addresses the viewer half the time. Roles drive
> `src/zenek/motion.ts`: the speaker `talk`s for the turn (hands in phrases, rhythm fixed
> in seconds whatever the length) and 22 % of turns end in a `shrug`; the speaker looks
> from listener to listener every 1.4–2.8 s; listeners look at the speaker (blend 0.8,
> host 0.55), lean in 0.05 rad, and 60 % nod (or tilt) once mid-turn; between turns the
> circle loosely faces itself. A laugh, wave or stretch is an event (`emit`) that a
> neighbour within 5.5 units may glance at; a Zenek alone (or in a lull) now and then
> watches the nearest talker within 8. Eyes: 0.5–2.6 s micro-saccades and a lead toward
> a new target before the body turns; a new focus ≥ 0.3 rad away blinks on the way (70 %).
> The head turns in `YXZ` order (pitch and roll about the turned body); hands live in a
> `hands` group that follows the body's yaw at 0.85 with a lag (λ 3). Tapping a Zenek
> pauses its circle: the rest listen to it. `?social=0` turns the director off.
> (4) *Gestures and parts* (`headTraits()` in `src/zenek/parts.tsx`, `allowed()` in
> `src/zenek/gestures.ts`): `scratch` only on bare heads (no hair, cap or hat); `wave`
> has a lower variant under hair and a front variant for long side hair; long side hair
> rests the hands 0.2 R forward, in front of it (as drawn). New gestures `laugh`, `shrug`.
> `scripts/gest-sheet.mjs` renders character × gesture × view clearance sheets
> (`shots/r12-gest-*.png`); `scripts/debug-social.mjs` samples every circle's roles.
> (5) *Character fidelity*: close-up comparisons (`shots/r12-cmp-*.png`) show the gap is
> construction (intersecting shells), surface (no creases, strands, sheen) and body
> material. Options, spike and recommendation: `docs/research/character-fidelity.md`.
> Spike: Artur's beard as an SDF sculpt (`src/zenek/sculpt.ts` — round cones, smooth
> union, three.js `MarchingCubes`, field-baked AO; `src/zenek/sculpts.ts` — measured
> spec, clay material with sheen and shader strand grooves), `?sculpt=1`, lazy-loaded.
> Bundle: 360 KB gz (was 355.7 before this round; the 350 KB budget was already over —
> Phase 6 perf pass).
>
> **Round 13 (2026-09-23) — Artur: back to the minimal page.** (1) The bridge is off
> again by default (`?bridge=1` shows it): it floated over the hills. (2) The hill chains,
> the paper-cut shadows (the mechanism stays, `Ring.shade`, unset), and Round 12's extra
> trees, stupa and tree row are gone; near and mid rings are back to Round 11's motifs.
> The one Round 12 fix that stays: the far city is a `back` feature behind its own three
> low hills (shoulders 4.4 / 4.0, ridge 3.0 over 76 units) at φ 165°, so it can never
> float. (3) Clouds are DS motifs, verbatim, with a paper body under the hatch
> (`DS.cloud` — clouds-street Fill 3; `DS.cloudLong` — clouds-flags Fill 1;
> `DS.cloudSmall` — fuji-scene Fill 4), some mirrored, plates sized to the motif's own
> aspect; `Ink.cloud` and its square-cornered floor are deleted. Artur also pointed at
> ZenDS nodes 11506:25136, 9065:23311 and 9065:23356 for cloud shapes — the Figma MCP
> was not authorised in this session, so the clouds come from the DS files already
> exported; swap in those nodes once Figma is authorised. Shots: `shots/r13-*`.
>
> **Round 14 (2026-09-23) — clouds clear of the city, the gate, the title card.**
> (1) Clouds drift in lanes (`Floater.lane`, `laneFade` in `src/set/Illustrated.tsx`):
> each moves toward larger φ inside its own [from, to], fading over 7° at both ends and
> wrapping; no lane enters φ 125°–205°, the far city's sector with room for parallax —
> hatched clouds over the hatched city fused into one blob. (2) `DS.gate`: the
> ZenPlanSmart pictogram (`docs/ds/illo-zen-plan-smart.svg`, supplied by Artur) — strokes
> verbatim over paper bodies traced from them (`GATE_BODIES` in `scripts/ds-paths.mjs`;
> the space under the rope arc stays open) — 5.4 units wide on the crest of the near
> hill at φ 120°, the empty right of the orbit view. (3) Name: **ZEN Design Team**
> (`<title>`, `og:title`, a visually hidden `h1`). New phase `title` between `loading` and
> `intro` (`src/lib/store.ts`, `src/App.tsx`): 1.1 s after `loaded` the loader mark leaves
> (`loader--mark-out`) and `src/ui/TitleCard.tsx` writes "Meet ZEN Design Team" on the
> same curtain — SVG text, a `tspan` per letter, stroke-dash outline in 640 ms, 44 ms
> apart, ink flooding each letter 360 ms in (`tc-write`, `tc-ink`), the line breathing
> from 0.985 → 1; `TITLE_MS` (≈ 2.0 s) later the phase goes to `intro`: the card fades
> with a 6 px blur and a 2 % grow while the curtain lifts. "Meet" at weight 420, the name
> at 780, −0.02 em; one line on desktop (≤ 66 px), two on phones (≤ 34 px). Reduced
> motion: a plain fade, 1.4 s. `?title=0` skips the card, `?title=hold` stays on it;
> `scripts/debug-title.mjs` scrubs the held card's animations to exact times
> (`shots/title-strip-*.png`) — headless WebGL is too slow to catch it live. The scene,
> the controls and the Zeneks stay hidden through `title` (CSS on `data-phase`).
>
> **Round 15 (2026-09-23) — the title, written by hand.** Artur: smaller, and not
> "outlines first, then fill" — a stroke drawn like a hand. He supplied the title as
> outlines (`docs/brand/app-title.svg`, 627 × 48, one path; the frame clips the g's
> descender, so the card uses its own view box 0 −2 627 58). `scripts/title-glyphs.mjs`
> splits it into the 17 letters (containment for counters, column overlap for the i's dot;
> coordinates to 0.01) → `src/ui/title-glyphs.ts`. `src/ui/title-pen.ts`: the pen, authored
> by hand from the outline coordinates — a centreline per stroke in a human order (M, N,
> Z, s in one stroke; E top-bar→stem→bottom-bar then the middle bar; D stem then bowl; T
> bar then stem; t stem then crossbar; a hook+stem then bowl; n and m continuous with the
> retrace; the i's dot waits for the end of "Design"); nib 8.2 (regular) / 10.5 (bold).
> `scripts/title-pen-check.mjs` proves coverage (every letter rendered in full vs through
> its fully drawn pen: 0 uncovered pixels at 6×) and draws the paths
> (`shots/title-pen-paths.png`). `src/ui/TitleCard.tsx`: each letter is its outline under
> a `<mask>` of its pen strokes (`pathLength` 1, dash grown by the Web Animations API from
> offset 1.001 so no cap speck shows before the pen lands); the performance is laid out
> once from stroke lengths — pace 1.65 / 1.35 units per ms, +22 ms per stroke, 50 ms pen
> lifts, letters flowing 14 % into each other, 110 ms between words, ±7 % human variation,
> easing (0.42, 0, 0.24, 1) — writing ends at ≈ 2.34 s; `TITLE_MS` ≈ 2.86 s with the hold.
> One line at every size: `clamp(min(300px, 86vw), 44vw, 700px)`. Reduced motion: the
> finished title fades in. Frames: `scripts/debug-title-zoom.mjs` (`shots/title-zoom.png`).
> Delivery chosen: inline SVG + WAAPI over Lottie (no player runtime, exact type, timings
> in code); a Lottie export from the same paths stays possible. Bundle 370.6 KB gz (+9.5
> for the glyphs and pen).
>
> **Round 16 (2026-09-23) — a fluid hand, a soft nib, faster.** Artur: less rigid, more
> fluid, a soft gradient on the reveal, and quicker overall. The per-stroke CSS easing
> (every stroke starting and stopping dead) is replaced by a pen model in
> `src/ui/TitleCard.tsx`, driven by one rAF loop: each stroke is resampled every 0.5
> units, its curvature smoothed over ±3 units sets the local speed (1 on straights, down
> to `CORNER` 0.42 in tight curves and sharp corners), strokes start and land at `LAND`
> 0.5 of the cruise over 6 units (never a dead stop), the pen travels through the air
> between strokes at `AIR` 2.2× its writing speed, letters overlap by `FLOW` 32 %, words
> breathe 70 ms, and the tempo opens at 0.82, cruises, and eases 14 % onto "Team"; ±5 %
> human variation. Cruise 1.84 (regular) / 1.54 (bold) units per ms (signed off by Artur,
> after one more 15 % step): writing ends ≈ 1.55 s, `TITLE_MS` ≈ 1.99 s with the hold
> (was 2.86). The nib is soft: each stroke has two mask
> layers — a wet edge (55 % grey, nib + 1, Gaussian blur 1.5 units) at the pen, and the
> solid ink trailing it by `WET` 8 units, catching up over `DRY` 90 ms once the pen has
> left — so ink blooms in through a short gradient and settles crisp. Pitfall fixed: the
> blur filter's default region follows the masked group's geometry bounds, which for the
> i (only vertical strokes) is a sliver — the soft edge showed as a thin grey tick; the
> filter now uses a fixed user-space region. `window.__title.seek(ms)` freezes the card
> (the debug scripts use it). Bundle 371.5 KB gz.
>
> **Round 17 (2026-09-23) — sculpted cast: Magda R rebuilt, Artur's beard to size,
> Krystian, Kamil, Mateusz N.** Hair and beards are now *sculpts*: signed distance fields
> in code (`src/zenek/sculpt.ts` — round cones, locks swept along Catmull-Rom curves,
> ribbon locks of fused lanes, smooth unions per lock and between locks, scalp shells
> ending at a hairline, a soft clip to a traced outline), one spec per design
> (`src/zenek/sculpts/*.ts`, measured on the design grids `shots/ref-<id>-grid.png`, R and
> centre per design in each file), baked offline by `scripts/sculpt-bake.mjs` — marching
> cubes, welded, crease occlusion from the field, the lock direction per vertex, simplified
> with meshoptimizer, quantised to `public/sculpts/<name>.bin` (1.7 MB total, ≈ 1.1 MB
> gzipped over the wire) — and worn as `{ type: 'sculpt' }` parts with the clay material
> (`src/zenek/clay.ts`: matte, sheen, baked AO, strand grooves across each lock in the
> shader). The loader waits for them (`sculptsReady`). The kit (`src/zenek/kit.tsx`):
> instanced stubble over frontal-coordinate regions, a skin patch, rectangular sunglasses
> bent round the face, over-ear headphones. `HeadTraits.waveSide` keeps Magda's framed
> side's hand down. Review loop per character: `scripts/cast-cmp.mjs <id>` (design | front
> | ¾ | ¾, eye level), 3–4 passes each (`shots/cmp-*.png`). The ?sculpt=1 spike is gone.
> Meshy / Tripo: no keys on this machine; `scripts/gen3d.mjs <id> --via meshy|tripo`
> (Meshy 7.1 image-to-3D with PBR; Tripo H3 v3.1 via the v2 OpenAPI) saves
> `img2/<id>/<vendor>/model.glb`, and `cast-cmp --glb` adds the result as a second row
> (lab `?glb=`, lazy `src/cast/GlbRef.tsx`, never in the first chunk). Bundle 375.9 KB gz.
>
> **Round 18 (2026-09-23) — Artur: external tools on hold; three fixes.** (1) Krystian
> and Kamil had each other's looks: the designs, grids, sculpt specs, baked files and
> team entries are swapped (Krystian = pompadour, sunglasses, stubble; Kamil = blond cap);
> seats stay with the names. (2) Kamil's cap is thin, as drawn: outer surface 1.012 R at
> the hairline rising over 50° to 1.097 R, shorter strands (17–26°, r 0.026–0.034), tighter
> unions, front hairline 66°. (3) Magda R: the hair is gathered from the parting and both
> sides into a black scrunchie high on the back of the head (`TIE_AT` yaw −172°, pitch
> 40°); the ponytail is 11 coiled curls (2.4 turns, loosening toward the ends) hanging
> down the back, fullest halfway, its lower curls drifting slightly to her right. The lab
> takes `?labyaw=` and `cast-cmp` turns the Zenek for views past the orbit's limits
> (`--az 180` = the back). Shots: `shots/cmp-{kamil,krystian,magda-r}.png`, `shots/r18-*`.
>
> **Round 19 (2026-09-23) — Krystian's new design, Janek's hair, the suggestions.**
> Krystian: `docs/cast/krystian.png` replaced (mouth area now black), skin patch removed,
> stubble finer and closer to the body colour, plate/glasses re-measured on the new grid;
> the pompadour rebuilt from leaf-shaped locks (`ribbonP` gained a width `profile`,
> `leafProfile`) swirling out of a crown whorl, round-shouldered, 0.2 R proud. Janek: hair
> is a sculpt (`src/zenek/sculpts/janek.ts`) — six broad locks per side rooted along the
> centre part, a dome beside it, full at the temple (r 1.2 at pitch 33), hugging the
> cheek, ending in a curl at a staggered height; front C-locks onto the plate corners;
> glossy clay (roughness 0.5, fine grooves). Soul patch: a matte rounded triangle.
> Mateusz: moustache a horseshoe of individual feathers (flattened round cones) combed
> diagonally out along the band, goatee stacked short feathers, neutral seed stubble.
> Magda: side waves deeper, a less orange brown. Bake: lock directions are smoothed over
> the mesh (12 passes) — the grooves no longer draw wood-grain contours where locks
> overlap; all sculpts re-baked. Lab: the head looks straight ahead (`DEBUG.lab`) so
> comparisons are square; `scripts/cmp-zoom.mjs` renders a matched close-up of a
> frontal region next to the design's. The primitive hair/beard parts are deleted.
> Sculpts 2.2 MB total; bundle 374.9 KB gz.
>
> **Round 20 (2026-09-23) — Krystian refined; Łukasz P and Mateusz K built.** Bodies are
> now measured by a circle fit (`scripts/fit-body.mjs`: the bottom arc plus side rows clear
> of hair and hands), not by eye — Krystian's plate, eyes and glasses were re-measured on
> it. `src/zenek/sculpts/swept.ts`: leaves laid along paths over the head
> (`leavesAlong` — a great circle; `leavesOnPath` — any path) and `sweptQuiff` — rows of
> locks off the hairline swept up and to the right, the first a blade (`bladeProfile`: full
> at the root, pointed above). Pitfall: quiff paths must interpolate yaw and pitch — a
> great circle toward the crown runs straight up whatever its yaw, and the sweep vanished.
> Krystian: leaves from a side part on the left combed over to the right. Łukasz P: spiky
> blond quiff; muscular arms as a sculpt (`member.arms` → Zenek draws it in place of the
> hand spheres, mirrored for the right; `BODY_AO` material), five lumps measured from the
> design, built at 85 %; `HeadTraits.bulky` makes the wave go out to the side. Mateusz K:
> glossy pompadour (steep front wall, 0.33 quiff), stubble beard with a mouth cut-out
> (`StubbleRegion.holes`). Sculpts 3.0 MB total; bundle 375.3 KB gz.
>
> **Round 21 (2026-09-24) — bigger plates for the bearded, Łukasz's arms, Mateusz K's
> new design.** Krystian, Mateusz N and Mateusz K now wear Janek-style plates that reach
> down round the mouth (a ≈ 0.74–0.78, b ≈ 0.56–0.60), so their moustaches and stubble sit
> on white and read at a glance; stubble beads are lifted to 1.006 R so they clear a flush
> plate. Łukasz P: arms are two pieces (a big round upper arm with a bicep swell, a smaller
> forearm) instead of five lumps; the quiff is taller and spikier (5 rows, lift 0.2) and uses
> `sweepEase` — the sweep is front-loaded, so strands leave the hairline already on the
> diagonal (the front wall faces the camera; a late sweep reads as vertical strands).
> Mateusz K: rebuilt on Artur's new design (`docs/cast/mateusz-k.png`; the old one is
> `mateusz-k-v1.png`) — plate 0.78 × 0.60, a dense beard framing a white mouth area with a
> T-shaped soul patch (stubble with `holes`), a glossy pompadour whose thickness builds
> from the edge (sides hug, top full), fewer broader locks. `sweptQuiff` gained `inset`
> (locks start above the hairline; the shell makes the clean edge) and `sweepEase`.
> Artur also shared a photo for the haircut — used as a reference only, not stored (brief:
> photos never enter the repo).
>
> **Round 22 (2026-09-24) — jointed arms, a person's wave; Mateusz N cleaner.** Łukasz P's
> arms are now jointed (`ArmSpec` in `src/cast/team.ts`: `upper` and `fore` sculpts, the
> `shoulder` pivot in body units, the `elbow` pivot in the upper arm's frame): Zenek draws a
> shoulder group (the `handL/handR` refs are groups now; the right arm is the left mirrored
> by scale) holding the upper arm and an elbow group (`elbowL/elbowR`) holding the forearm.
> `Offsets` gained `al/ar` (raise at the shoulder) and `bl/br` (bend at the elbow): the
> `wave` for `bulky` characters lifts the upper arm 1.15 rad out and bends the elbow 1.85
> rad with a ±0.32 swing, so the forearm waves, not the block; `stretch` becomes a small
> double-biceps flex; at rest the arm hangs 0.14 rad out, the forearm forward (baked into
> its geometry). Signs: the shoulder turns −z (left) / +z (right, outside the mirror); the
> elbow turns −z on both (inside the mirror). `useMirror` copies hands and elbows.
> `scripts/gest-sheet.mjs --fov` widens the frame. Mateusz N: the stubble is gone — the
> moustache and goatee on the big plate, like Mateusz K and Janek. Follow-up (Artur):
> forearms shorter and rounder (the fist close under the elbow), and `ArmSpec.scale` 1.12
> grows both parts and the elbow pivot about the shoulder (shoulder moved out to −1.03).
>
> **Round 23 (2026-09-24) — into the repo, live on GitHub Pages.** The project is a git
> repo pushed to the public `ArtSkw/zen-design-team`; `.github/workflows/deploy.yml` builds
> and publishes every push to `main` to https://artskw.github.io/zen-design-team/ (Vite
> `base` is `/zen-design-team/` for build and preview; the dev server stays at `/`; asset
> URLs go through `import.meta.env.BASE_URL`). The repo is public, so `docs/**/*.png|jpg|svg`
> (designs, DS and brand exports, renders) and `img2/` are git-ignored; the generated
> sources they feed are committed. Security pass: `npm audit` clean, no secrets in the
> tree; the build carries a same-origin Content-Security-Policy; the lab's `?glb=` loader is
> dev-only (it accepted `//host/x.glb`). Clean-up: the Scene is a lazy chunk, so the first
> chunk is 79 KB gz and the loader paints about 0.1 s after navigation; the 3D follows as
> three.core 101 KB and Scene 191 KB. `public/plate/` (unused since the diorama) moved to
> `docs/set/plate/` (local); dead helpers, `maath`, the plate scripts and the dangling
> `og:image` removed. The OpenGraph image is still a v1.0 item (it needs an absolute URL).
>
> **Round 24 (2026-09-24) — the title lets go into petals; shorter arms; initials.** Łukasz
> P's arms are ~14 % shorter at the same girth (biceps −0.185, elbow −0.32, fist closer
> under it). Surname initials carry a dot ("Łukasz P."). The title no longer fades: once
> written and held, it lets go ON THE PAPER (`src/ui/TitleDust.tsx`, store flag `dissolve`
> at `TITLE_MS`): a canvas above the curtain takes over pixel for pixel; the ink greys in a
> smooth wash ahead of a left→right front, then erodes through an organic noise edge
> (per-pixel, ~1.9 s); where it goes, petals are born dark and open into drawn ZenDS
> petals (fine ink line on white, vein; hatched underside when they turn over) that fall
> slowly, rocking like leaves, with a fine ink powder. Artur's direction after the first
> cut: the dissolve must happen before the room shows, slower and subtler, petals soft and
> hand-drawn (not tiles). The curtain lifts `DUST_LEAD` = 1.3 s into it, so the petals fall
> over the revealed room; gone by ~3.8 s. Follow-up (Artur): it lets go as soon as the
> title is written — `WRITTEN_MS` (pen lifted, ink settled, 1.55 s) + `DUST_REST` 120 ms,
> not the 440 ms hold the plain fade keeps — and the first erosion comes 180 ms in (was
> 260): the petals start ~0.4 s sooner. `?dust=0` = the old fade, `?dust=hold` +
> `window.__dust.seek(ms)` for frames; `scripts/debug-dust.mjs` (`--paper 0`, `--vp`,
> `--dpr`). Perf fix found on the way: the room (`Rise`) and every Zenek root were
> invisible until the intro, so all shaders compiled and buffers uploaded AT the reveal
> (1.3–1.5 s frames on an M4). They are now drawn under the curtain during `loading`, and
> `firstFrame` waits for `sculptsReady`: the reveal runs at 60 fps with one ~0.1 s frame
> when the canvas first presents. Real-GPU probing: Playwright `channel: 'chromium'` with
> `--use-angle=metal` (swiftshader starves the main thread; screencast frames are stale).
>
> **Round 25 (2026-09-24) — phones: the title never skips, the room stays smooth.** Artur's
> phone test: after a long load the title appeared already written, and the room ran well
> for 5–10 s then stuttered for good. (1) The pen's clock was wall time from mount: a
> main-thread stall at the title's start (reproduced: a 2 s freeze → 100 % drawn on the
> next frame, petals 14 ms later) skipped the whole write-on. The pen and the dust now
> keep frame clocks that advance ≤ 1/15 s a frame (a stall pauses them), and the boot
> follows milestones, not timers: `written` (TitleCard) → `DUST_REST` → `dissolve` →
> `lift` (TitleDust, at `DUST_LEAD` on its clock) → intro, each with a fallback timer
> (`when()` in App). (2) No leak (draws, uploads, heap flat for 40 s); the rig is ~4 scene
> renders a frame — screen 579 calls/1.3 M tris (shadow map 204/0.5 M), water reflection
> 367/0.78 M, floor reflection 349/0.8 M — which a phone holds until it heats and
> throttles. Fixes: `src/set/Reflector.tsx` = drei's reflector with `every`/`offset` (redraw
> every N frames) and `exclude` — the water no longer sees the cast (hidden by the terrace:
> A/B at home and the orbit extremes is at the noise floor; −0.74 M tris, −156 calls, every
> device); the clay shader's groove freq/amp are uniforms (one program for every sculpt:
> 84 → 64 programs; lab A/B max diff 0); the 3D pauses (`frameloop 'never'`) from `loaded`
> until the curtain lifts, after warming up under the curtain (`firstFrame` = 3 frames with
> the cast dressed); `LITE` tier (`?lite=`; coarse pointer + short side < 820): dpr ≤ 1.5,
> shadow map 1024 / 8 samples / radius 3.5, floor reflection 512 every 2nd frame, water 384
> every 4th; adaptive dpr for all: two 2 s windows < 48 fps → −0.25, floor 1, never back
> up. Emulated phone (CPU ×6, Metal): 33–36 fps → 58–60 steady, 1080 → 672 draws a frame;
> load-to-title (CPU ×4) 2.5–2.9 s → 2.4–2.6 s, loading long frames −25–40 %. Tools:
> `scripts/perf-phone.mjs`, `scripts/perf-passes.mjs` (dev-only `window.__gl`). Not done:
> sculpt downloads are 2.2 MB gz of 2.7 MB — smaller needs a mesh codec (meshopt: +wasm,
> CSP `wasm-unsafe-eval`) or fewer triangles (Artur's call).
>
> **Open craft debt:** the sculpts are close in mass and placement but a step behind the
> designs in surface detail — character face placements measured with a slightly small body radius (Mateusz confirmed: ≈ 0.09 R low) — re-measure all designs on silhouette fits; Meshy/Tripo on hold (Artur, 2026-09-23: refine here first); body/eye material vs the designs; 6 characters and all quotes pending; JS
> JS ≈ 383 KB gz in all (first chunk 82 KB), ~33 KB over the 350 budget in sum.

---

# Part I — Strategy

## 1. The approach in one paragraph

A transparent WebGL canvas sits over a 4K photograph of the ZEN wood room. The
3D camera is calibrated to the photograph's perspective, so an invisible ground
plane in the scene coincides with the concrete floor in the picture. Fourteen
Zeneks — each a small parametric React Three Fiber component: spheres, a
superellipse face cap, tori and capsules for the attribute — sit on that plane;
soft contact shadows and faded mirror-ghosts glue them to the floor. A
hand-built light-former environment mimics the window light. All of this lives
inside a fixed 16:9 "stage" that scales as one unit and pans on portrait
phones. Motion is procedural and seeded per character. The only DOM is the
loader, the postcard frame and the speech bubbles. The build verifies itself
with Playwright screenshots at three viewports, judged against the rubric in §4.

## 2. Where each concern lives

| Concern | Owner | Artifact |
|---|---|---|
| Intent, scope, taste | Brief | `BRIEF.md` |
| Set & camera truth | Plate + calibration | `public/plate/*`, `src/stage/camera.json` |
| Postcard framing, scaling, pan | Stage | `src/stage/Stage.tsx`, `src/lib/stageScale.ts` |
| The mascot | Parametric component | `src/zenek/Zenek.tsx`, `src/zenek/proportions.ts`, `src/zenek/materials.ts` |
| Attributes & props | Parts kit | `src/zenek/parts/*.tsx` |
| Who is who, where, saying what | Cast data | `src/cast/team.ts`, `src/cast/seats.ts`, `docs/cast/` |
| Light, shadow, reflection | Scene | `src/scene/Lighting.tsx`, `src/scene/Floor.tsx` |
| The drawn world beyond the deck | Ink | `src/set/ink.ts` (hand + composition), `src/set/Illustrated.tsx` (3D), `src/set/ds-paths.ts` (generated from `docs/ds/*.svg`), `src/ui/Sheet.tsx` (`?sheet=1`) |
| Aliveness | Motion + conversation | `src/zenek/motion.ts` (per Zenek), `src/zenek/gestures.ts` (the vocabulary), `src/zenek/social.ts` (circles, turns, events), `CIRCLES` in `src/cast/team.ts` |
| Bubbles, loader, frame | UI | `src/ui/*` |
| Self-verification | Screenshot script | `scripts/shot.mjs` → `shots/` |
| Tuning during the build | Dev panel, stripped in prod | Leva folders, `/lab` route |

## 3. Risks and escape hatches

| Risk | Signal | Escape hatch |
|---|---|---|
| Procedural face cap doesn't match the official renders | Side-by-side in the Phase 2 lab reads "off" after one session of tuning | Model the base Zenek once in Blender, export a ≤ 50 KB GLB; everything else stays procedural |
| The 3D doesn't "belong" to the photo | Light direction or warmth visibly disagrees; edges pop | Re-tune light-formers; switch tone mapping; gently grade the plate (never the mascot) |
| Curls or a beard look crude as primitives | Phase 3 review at back-row size | Hand-model ≤ 3 accessories in Blender, or generate accessory-only meshes (Rodin Gen-2.5, quad output), texture stripped, our material |
| One attribute isn't enough to recognise someone | Artur can't name them blind in Phase 3 | Add the optional prop; never a second facial attribute |
| Portrait phones unusable | Zeneks under 44 px tall, or bubbles unreadable | Height-fit + pan is designed in from Phase 1; test on a real phone at Phase 1, not Phase 6 |
| Plate too soft at 2× | Visible blur or upscale halos on a retina laptop | Re-upscale with a different model; accept a 1.5× plate on mobile |
| Scope creep | Anything in the UI that isn't loader, frame or bubble | The NOT list in the brief |
| Quotes arrive late | Phase 5 blocked | Ship with placeholders in `team.ts`; quotes are a data-file swap |

## 4. The rubric — completion blocker for every phase

Judged on three Playwright shots — **1600×900**, **1280×720**, **390×844** —
after every phase. A phase does not exit with a red item.

- **Grounded.** Every Zenek has a contact shadow whose softness and warmth
  match the plate's own shadows; reflections, if kept, fade out within one body
  height.
- **Lit like the room.** Highlights sit right and top, fill comes from the
  left; the white plate is never brighter than the photo's brightest white;
  blacks are rich, not crushed.
- **Scaled by the floor.** Front-row and back-row Zeneks obey the same
  perspective as the floor slabs; nothing floats, nothing sinks.
- **Readable silhouette.** Each attribute is identifiable at back-row size; no
  accessory intersects the face plate or another Zenek.
- **Alive, not busy.** In any 10-second recording no two Zeneks blink or
  breathe in phase; no jitter; every spring settles; nothing moves without a
  cause.
- **Paper type.** Bubble text renders at ≥ 16 px on every viewport; no orphaned
  last word; Polish diacritics render in Nunito, not a fallback face.
- **Fast.** 60 fps on an M1 MacBook Air at DPR 2; ≥ 40 fps on an iPhone 12;
  JS ≤ 350 KB gzipped; plate ≤ 1.2 MB; loader gone in under 2.5 s on a
  throttled 4G profile.
- **Kind.** Tab reaches every Zenek, Enter or Space opens its bubble, Esc
  closes; `prefers-reduced-motion` respected; pointer cursor on hover.

---

# Part II — Buildable spec

Sessions are focused 2–4 h blocks. Phase 0 is design work and runs in parallel
with Phases 1–2.

## Phase 0 — The cast (design; parallel with Phases 1–2)

Goal: fourteen approved character sheets and a locked attribute list before a
single accessory is coded.

- **Inputs from Artur:** 14 photos (kept outside the repo, e.g.
  `~/AS_Zen/private/zenki-photos/`), 14 names, the ZEN green hex from the brand
  guide, and the quote-language decision (brief, open decision 2).
- **Master image:** one clean official Zenek render (front three-quarter, white
  background) becomes the master. Every sheet is an *edit* of the master
  ("add round glasses, change nothing else"), never a fresh generation — this
  keeps angle, light and proportions identical across the fourteen.
- **Attribute rules:** exactly one signature attribute per person; optionally
  one hand-held prop; no duplicates across the team; every attribute must be
  buildable in the parts vocabulary (Phase 3.1) or flagged for Blender.
- **Deliverables:** `docs/cast/NN-firstname.png` (14 sheets) and
  `docs/cast/cast.md` — a table: id · name · signature · prop · colours ·
  notes · seat idea. Photos never enter the repo; `.gitignore` says so.
- **Exit:** Artur approves all 14 sheets; every attribute maps to a part or a
  flagged Blender job; `src/cast/team.ts` holds ids, names, part configs, seeds
  and `quote: 'TODO'`.

## Phase 1 — Stage & plate (v0.1, session 1)

Goal: the postcard exists, the camera matches the photo, and a test sphere sits
believably anywhere on the floor.

### 1.1 Scaffold
- Vite + React + TypeScript. Dependencies: `three`, `@react-three/fiber`,
  `@react-three/drei`, `maath`, `simplex-noise`; dev: `leva`,
  `@playwright/test`. Pin versions at scaffold time and check the R3F/drei
  pair against the installed React major.
- `src/main.tsx` → `App.tsx` → `<Frame><Stage><Plate/><Scene/></Stage></Frame>`.
- `scripts/shot.mjs`: starts the dev server, screenshots `/` at the three
  rubric viewports into `shots/<phase>-<viewport>.png`; `npm run shot`. This
  exists before any visual work so every later step can be looked at.
- `.gitignore` covers `shots/`, `node_modules/`, `dist/`, and any `*photos*`
  folder.

### 1.2 The plate
- Source: the wood-room video-call background. Upscale to **3840×2160**
  (Topaz, Magnific or any current upscaler); inspect at 200 % for halos on the
  window mullions and the poster type. Export `public/plate/wood-room@2x.avif`
  plus a `.webp` fallback, and a 32-px-wide blurred LQIP inlined as a data URL.
  Budget: ≤ 1.2 MB for the 2× WebP.
- `src/stage/Plate.tsx`: a `<picture>` with `image-set`, `decoding="async"`,
  absolutely positioned under the canvas, `object-fit: fill` (the stage is
  exactly the plate's aspect, so nothing is cropped or stretched).

### 1.3 The stage
- Design size **1600 × 900**. `src/lib/stageScale.ts`: given the viewport,
  return `{ scale, width, height, mode }` — `mode: 'contain'` when
  `vw / vh ≥ 1` (fit inside the viewport minus a 40 px margin); `mode: 'pan'`
  when portrait (fit height; width overflows).
- `Stage.tsx` sizes its container in **real CSS pixels** — never a CSS
  `transform: scale` — so the canvas buffer always matches what is on screen.
  It exposes `--stage-scale` for DOM overlays. Aspect is constant, so the R3F
  camera never needs re-composition.
- Pan mode: pointer drag and touch with rubber-band overscroll, inertia via
  `maath` damping, initial position centred on the cast, no scrollbar.
- `src/ui/Frame.tsx`: desk background `#EFECE6`; postcard `border-radius: 24px`,
  shadow `0 30px 80px rgba(0,0,0,.18)`; the frame disappears in pan mode.

### 1.4 Camera calibration
- Run the plate through **fSpy** (two vanishing points from the floor-slab
  seams and the window mullions; origin on the floor). Transcribe focal length,
  position and rotation into `src/stage/camera.json`.
- `src/scene/Scene.tsx` mounts a `PerspectiveCamera` from `camera.json`. A
  dev-only `<Grid>` on `y = 0` and a Leva folder (`fov`, `height`, `pitch`)
  allow fine correction by eye: the grid's converging lines must run along the
  slab seams.
- Three test spheres (front, middle, back) at one world radius — their
  on-screen sizes must fall off exactly as the slabs do.

**Exit:** `shots/p1-*` show the grid locked to the floor seams at all three
viewports; pan works on a real phone; Frame, Stage and Plate render with no
layout shift; `npm run shot` is one command.

## Phase 2 — Zenek (v0.1, session 2)

Goal: one Zenek on the floor that passes for the official mascot, lit like the
room.

### 2.1 Geometry — `src/zenek/Zenek.tsx`
Body radius **R = 0.5** world units; all other values in R.

- **Body:** `SphereGeometry(R, 64, 48)`, resting on `y = 0` via a `Group`
  offset.
- **Face plate:** a parametric spherical cap — `ParametricGeometry`
  (`three/addons`) over a **superellipse** window in angular space (exponent
  ≈ 3.2; ≈ 1.25 R wide, ≈ 1.0 R tall; centre tilted ~8° up and toward the
  camera), surface radius `1.035 R`, with a two-segment rounded rim dipping back
  to R so the edge reads as a soft physical lip. Fallback per risk table: a
  Blender GLB after one session of tuning.
- **Eyes:** two `SphereGeometry(0.072 R)` seated `0.008 R` into the plate at
  `x = ±0.22 R`, slightly below plate centre. Separate meshes: blink is
  `scale.y`, gaze is a tiny translate.
- **Hands:** two `SphereGeometry(0.28 R)` at `(±0.72 R, −0.32 R, +0.60 R)`,
  floating as in the official renders, body material.
- Every value is Leva-tunable in the lab and frozen into
  `src/zenek/proportions.ts` on exit.

### 2.2 Materials — `src/zenek/materials.ts`
- Body, hands, eyes: `MeshPhysicalMaterial` — `color #0B0B0C`, `roughness .42`,
  `clearcoat .65`, `clearcoatRoughness .30`, `envMapIntensity 1.0`. Satin black
  with a soft glaze, not a mirror.
- Plate: `MeshStandardMaterial` — `color #F5F5F2`, `roughness .55`,
  `metalness 0`.
- Tone mapping: start `ACESFilmic`, exposure 1.0; compare `AgX` and `Neutral`
  in the lab; keep the one where plate white ≈ the photo's window-frame white
  and the body keeps a visible clearcoat highlight. Record the pick in open
  decision 7.

### 2.3 Light — `src/scene/Lighting.tsx`
- `<Environment background={false} resolution={256}>` with `Lightformer`s: a
  tall warm-white panel on the right (the glass wall, intensity ~3); a wide
  warm panel above (timber ceiling, ~1.2, tint `#F2D9B8`); a neutral panel on
  the left (white wall, ~0.8); a dim cool floor bounce (~0.3). Plus one
  `directionalLight` from right-top for a crisp key highlight. No shadow maps.
- Verify in `/lab`: Zenek beside the three official renders at equal size.
  Highlights must sit right and top; the shaded side must stay readable.

### 2.4 Floor — `src/scene/Floor.tsx`
- `ContactShadows` at `y = 0`: `opacity .55`, `blur 2.4`, `far 0.8 R`,
  `color #2A1F17` (warm). Render `frames={1}` when idle; re-render only while
  something is moving.
- Reflection: each Zenek group cloned with `scale.y = −1` under the floor,
  opacity `.16`, `depthWrite false`, faded to zero over one body height with a
  vertical gradient alpha (small `shaderMaterial` or `onBeforeCompile`).
  Keep-or-kill recorded in open decision 5.

### 2.5 The lab
- Dev route `/lab`: Zenek on a neutral backdrop *and* on the plate; Leva panels
  for proportions, materials, lights; a compare toggle that overlays an
  official render at 50 % opacity.

**Exit:** `shots/p2-*` — one Zenek at front-row size on the plate; a designer
who knows Zenek says "that's Zenek" with no caveats; *Grounded* and *Lit like
the room* green; `proportions.ts` and `materials.ts` frozen.

## Phase 3 — The cast (v0.5, sessions 3–4)

Goal: fourteen recognisable Zeneks, seated in a composition that reads as one
picture.

### 3.1 Parts kit — `src/zenek/parts/`
Each part is a small component taking `R`, a `variant` and a `color`,
positioned relative to the head. Build only what `docs/cast/cast.md` needs;
starting vocabulary:

| Part | Construction | Notes |
|---|---|---|
| Glasses — round, rect, thin | two `Torus` + `Cylinder` bridge + temples | optional lens `MeshPhysicalMaterial transmission .9` |
| Sunglasses | as glasses; lenses `#111`, roughness .2 | |
| Beard — short, full | `Lathe` crescent under the plate, or a crescent of small spheres | matte |
| Moustache | two `Capsule` | |
| Curly hair | 9–15 spheres, seeded jitter, on the cap | matte; the on-brand hair |
| Long hair, bob | hemisphere shell + hanging `Capsule`s | matte |
| Bun, ponytail | sphere or capsule at the back | |
| Beanie, cap | hemisphere + torus rim (+ pompom); hemisphere + brim | one accent colour max |
| Headphones | torus band + two short cylinders | already canon in the official renders |
| Earrings | tiny tori at the plate sides | ZEN green allowed |
| Props — coffee, phone, laptop, book, pencil, camera, plant, dumbbell | boxes, cylinders, tori held between the hands | hands re-posed to hold |

Palette: black, white, ZEN green (hex from the brand guide), plus matte hair
tones `#2B2118 #6B4A2E #B8895A #D9B47A #A54B2A #9A9A9A`. No metallics except
glass lenses. Anything not expressible here is flagged for a Blender GLB
(≤ 3 parts in total).

### 3.2 Cast data — `src/cast/team.ts`
```ts
type Member = {
  id: string;
  name: string;
  parts: PartConfig[];            // exactly one signature, at most one prop
  seat: { x: number; z: number; yaw: number; scale?: number };
  temperament: { breath: number; blink: number; sway: number }; // 0.8–1.2 multipliers
  quote: string;                  // 'TODO' until Phase 5
  seed: number;                   // fixed integer → reproducible idle in screenshots
};
```
No component ever knows a name; everything about a person lives here.

### 3.3 Composition — `src/cast/seats.ts`
- Author positions in Leva with the plate visible; save to `seats.ts`. A loose
  cluster: ~5 front (largest), ~5 middle, ~4 back. Keep the poster and the wall
  logo un-occluded. Two or three story seats: the low sill by the glass;
  peeking in from the left edge. Avoid equal spacing and straight rows.
- Pickability check at 390×844: every Zenek's raycast hit area ≥ 44 px.

**Exit:** `shots/p3-*`; Artur names all fourteen from a screenshot without a
key; *Readable silhouette* and *Scaled by the floor* green; no
accessory-to-plate intersections at 200 % zoom.

## Phase 4 — Alive (v0.8, session 5)

Goal: the room breathes; nothing is busy.

### 4.1 Motion hooks — `src/zenek/motion/`
All hooks write to refs inside `useFrame` with delta time; no React state per
frame.

- `useIdle` — breath as volume-preserving scale (`y: 1 + a`, `x, z: 1 − a/2`),
  `a = .025 × temperament.breath`, period 3.2–4.6 s and phase from the seed;
  sway as `rotation.z` from 2D simplex noise, ±0.8°, ~0.15 Hz.
- `useBlink` — interval 3–7 s (seeded); close 120 ms, hold 40 ms, open 140 ms;
  15 % double blink; eyes `scale.y → 0.08`.
- `useGaze` — target = pointer; else the speaking Zenek when a bubble is open;
  else a slow noise wander. Head `yaw ±12°`, `pitch ±6°`, eyes translate
  ±0.02 R; `maath/easing.damp3`, λ = 6.
- `useHover` — lift 0.06 R, scale 1.03, spring (stiffness 220, damping 18);
  pointer cursor.
- `useReaction('boing')` — on tap: `scale.y .86 → 1.12 → 1`, hop 0.24 R, one
  settle bounce, 480 ms total.
- `useEntrance` — plate fades in 500 ms; Zeneks pop from `scale 0` with
  overshoot 1.08 over 520 ms, stagger 70 ms back-to-front (Artur last if open
  decision 3 says so). Total ≤ 1.8 s. Reduced motion: fade instead of pop.

### 4.2 Performance
- `<Canvas dpr={[1, 2]}>` with `AdaptiveDpr` and `PerformanceMonitor` (drop
  to 1.5 below 45 fps); `frameloop="always"` (idle motion needs it); MSAA on;
  shadows via `ContactShadows` only.
- One shared geometry instance per primitive across all fourteen (module-level
  `useMemo`); parts likewise.

**Exit:** `shots/p4-*` plus a 10-second screen recording reviewed against
*Alive, not busy*; 60 fps on the M1 Air, ≥ 40 fps on a phone; the
reduced-motion path verified.

## Phase 5 — Voice (v0.8, session 6)

Goal: every Zenek speaks, beautifully, on every screen.

- `src/ui/Bubble.tsx` — a DOM layer above the canvas; position from projecting
  the head anchor each frame (`useFrame` → CSS variables), so the bubble rides
  the breath. Paper white, `border-radius 18px`, padding 14/18, shadow
  `0 12px 40px rgba(0,0,0,.18)`, tail 14 px; name 12 px uppercase, tracking
  .08em, `#7A756E`; quote 19 px / 1.35, Nunito 600, `#111`; `max-width 320px`;
  `text-wrap: balance` for short quotes, an orphan guard for long ones. Font
  size counter-scales below `--stage-scale` 0.8 so text never drops under
  16 px.
- Behaviour: one open at a time; spring scale-in from the tail origin
  (320 ms); closes on outside tap, another Zenek, or Esc; near an edge the tail
  flips and the bubble clamps inside the stage.
- Gaze: while a bubble is open, Zeneks within about two seats look at the
  speaker; the speaker looks at the camera.
- Access: a visually-hidden `<button>` per Zenek (`aria-label = name`), Tab
  order = seat order front to back, Enter or Space opens, focus drawn as a soft
  halo under the Zenek.
- Data: real quotes into `team.ts`; Nunito variable subset (Latin + Latin
  Extended) as `public/fonts/nunito-var.woff2`, `font-display: swap` with the
  loader masking the swap.

**Exit:** `shots/p5-*` with a bubble open at each viewport; *Paper type* and
*Kind* green; every quote read once aloud by Artur for line breaks.

## Phase 6 — Arrival & ship (v1.0, session 7)

- `src/ui/Loader.tsx` — desk-coloured curtain; the ZEN.COM ring (SVG, 64 px,
  stroke 6) as a progress ring via `stroke-dashoffset`, its dot pulsing.
  Progress = plate `decode()` + `document.fonts.ready` + first R3F frame.
  Minimum on screen 900 ms; crossfade out 600 ms into the entrance wave.
- `index.html` — title, `noindex`, OpenGraph and Twitter meta;
  `public/og.jpg` (1200×630) captured by `scripts/og.mjs` (Playwright, bubbles
  closed, Zeneks settled); `favicon.svg` = the Zenek face.
- Perf pass — bundle analysis (`three` tree-shaken, drei imported per path),
  plate size, DPR caps, `PerformanceMonitor` thresholds; a throttled-4G run.
- Device QA — iPhone Safari, Android Chrome, macOS Safari/Chrome/Firefox, one
  Windows laptop: pan, tap, bubble, reduced motion.
- Deploy — Vercel static; unlisted project URL or a custom subdomain (open
  decision 1); `noindex`; no analytics; fonts self-hosted, no third-party
  requests.

**Exit:** all rubric items green on all three shots; the Slack unfurl shows the
room; Artur shares the link.

## v1.1 — candidates (decide after the team has seen v1.0)

- **Ambient sound** — garden birds and faint room tone via Web Audio, unlocked
  on first tap, one tiny speaker toggle in the frame margin; off by default on
  mobile.
- **The back of the postcard** — tap a corner to flip; a handwritten-style
  thank-you note, a stamp, the date. This is where the "love postcard" message
  itself lives; kept out of v1.0 to protect the scene's purity, and the likely
  first addition.
- **Plant cutout** — the left foreground plant as an occluding layer so one
  Zenek can peek from behind it.
- **The room listens** — random neighbour glances between Zeneks during idle; a
  small wave from the speaker when a bubble opens.
- **Vector wall logo** — the ZEN.COM wall mark re-set as SVG for retina
  crispness.

## Cross-cutting

- **Look before you ship.** `npm run shot` after every change that touches the
  scene; the rubric is the gate.
- **Numbers live in one place.** Proportions, materials, seats and motion
  constants are exported consts — tuned in Leva, frozen into `.ts` files, never
  scattered as literals.
- **Data over code for people.** Anything about a person is in `team.ts`.
- **Privacy.** Photos never in the repo; URL unlisted and `noindex`; no
  analytics; no third-party requests.
- **Dev-only stays dev-only.** Leva, `/lab`, the grid and the compare overlay
  sit behind `import.meta.env.DEV`.

## Open decisions

1. **Title and URL** — title decided: ZEN Design Team (2026-09-23); URL at v1.0.
2. **Quote language** — before Phase 5.
3. **Artur's seat** — before Phase 3.3.
4. **Names in bubbles** — recommended yes; confirm at Phase 5.
5. **Reflection keep-or-kill** — Phase 2 lab, on evidence.
6. **Sound** — v1.1.
7. **Tone mapping** — ACESFilmic vs AgX vs Neutral, Phase 2 lab.
8. **Character fidelity route** (supersedes "Blender or not", 2026-09-23) — SDF sculpt
   in code, AI image-to-3D accessories, the two combined, or hand sculpting; evidence and
   recommendation in `docs/research/character-fidelity.md`. Next evidence: one AI-generated
   beard, cleaned, on the same comparison sheet as the SDF spike.

## Appendix — budgets and tree

| Budget | Target |
|---|---|
| JS, gzipped | ≤ 350 KB |
| Plate, 2× WebP | ≤ 1.2 MB |
| Fonts | ≤ 80 KB |
| Loader gone, throttled 4G | < 2.5 s |
| Frame rate, M1 Air @ DPR 2 | 60 fps |
| Frame rate, iPhone 12 | ≥ 40 fps |
| Tap target, 390×844 | ≥ 44 px |
| Bubble text, any viewport | ≥ 16 px |

```
zenki/
  BRIEF.md
  docs/
    plan.md
    cast/                 # 14 sheets + cast.md (Phase 0)
  public/
    plate/                # wood-room@2x.avif, .webp
    fonts/nunito-var.woff2
    og.jpg  favicon.svg
  src/
    main.tsx  App.tsx
    stage/    Stage.tsx  Plate.tsx  camera.json
    scene/    Scene.tsx  Lighting.tsx  Floor.tsx
    zenek/    Zenek.tsx  proportions.ts  materials.ts
              parts/*.tsx
              motion/useIdle.ts useBlink.ts useGaze.ts useHover.ts useReaction.ts useEntrance.ts
    cast/     team.ts  seats.ts
    ui/       Frame.tsx  Bubble.tsx  Loader.tsx
    lib/      stageScale.ts  rng.ts  noise.ts
  scripts/    shot.mjs  og.mjs
  shots/                  # git-ignored
```
