# ZEN Design Team — Project Brief

> **This is the product brief — the PRD.** It owns *what* we're building, *why*,
> for *whom*, and *in what order*. It is the source of truth for intent; it does
> not carry file-level engineering detail. The buildable execution spec lives in
> [`docs/plan.md`](docs/plan.md).
>
> **Where we are (2026-09-23, Round 12):** v0.5 running. The set is a code-only diorama
> rebuilt from Artur's 2D diorama render; Artur, Janek and Magda R are rebuilt from their
> approved 2D designs; loader, entrance, idle, gaze, tap-to-speak and the orbit view all
> work. The world beyond the room is the *illustrated page* (direction C below): the
> wooden terrace on a pale water, and beyond it the DS torii, Fuji, pagodas, trees,
> gulls and plane on three depths of a few rounded hills — kept minimal on purpose; the
> far city with the Palace of Culture rises from behind its own low ridge, and the
> clouds are the design system's own. The room gained its charm back: a broad-leaf plant, a cloud-pruned pine bonsai,
> puffed cushions, a teapot on the side table, and Magda R on the green cushion so the
> table and bench show. The Zeneks now *converse*: small circles take turns — one talks
> with its hands, the others turn to it and nod; turns end in a beat of silence, a
> shrug, sometimes a shared laugh; eyes flick and lead the head; a laugh or a wave
> nearby earns a glance. Nobody scratches through their hair. Eight of the fourteen are now
> designed and built — Artur, Janek, Magda R, Krystian, Kamil, Mateusz N, Łukasz P (the
> weight lifter, muscular arms kept in scale) and Mateusz K — hair, beards and arms
> sculpted as clay in code. Next: Artur decides
> whether to try Meshy/Tripo on the designs (ready to run, `docs/research/character-
> fidelity.md`), supplies the remaining six designs and the Polish quotes. See
> `docs/plan.md`.
>
> **Inspiration, not heritage:** [backyarddesigners.club](https://backyarddesigners.club/)
> (Ridd and Tommy Geoco, 2026). We borrow the feeling — a team sitting together,
> alive, clickable — and nothing else. Their figures are static 2D cutouts on a
> layered DOM backdrop; ours are real-time 3D on a photographic set. From the
> ZENimator project we borrow only the working method: a brief, a plan, and a
> build that looks at its own frames before it calls anything done.

## What we're building

A one-screen web postcard for the ZEN.COM design team: fourteen Zeneks — the
ZEN.COM mascot, one per team member, Artur included — sitting together in the
ZEN wood room, breathing, blinking, glancing at the cursor. Tap one and it
speaks: a short personal quote in a paper-white speech bubble. That is the whole
product.

It is a thank-you for the past year, from Artur to the team. Its only job is to
make fourteen designers smile, and then look closer.

The bar, in one sentence: **every frame should pass as a still from a top-tier
3D studio's product render** — correct light, grounded shadows, believable
scale, restrained motion — and every interaction should feel like touching a
well-made toy.

## Who it's for & how it arrives

**Audience:** the 14 members of the ZEN.COM design team, Artur included. They
are designers. They will notice a wrong shadow, a synced loop, a bubble with an
orphaned last word.

**Delivery:** one unlisted URL shared in the team channel. Most will open it on
a laptop; several on a phone. The link unfurl (the OpenGraph image) is the first
frame anyone sees — it is part of the product, not an afterthought.

**Privacy posture:** names and quotes are personal. The URL is unlisted and
`noindex`. Team photos used to design the characters never leave Artur's
machine and are never committed; only the derived Zenek character sheets are.

## The three beats (scope v1.0)

1. **Arrival.** The design-system loader mark pops in and spins with an eased,
   playful cadence for under a second; its ring closes and the check writes in. Then the
   title card: **"Meet ZEN Design Team"** — Artur's own typesetting in Nunito, black on
   the paper — is *written by hand*: a pen travels each letter's strokes in a human order
   (the i gets its dot when the word is done) and ink appears only where it has passed;
   it holds for a breath and dissolves as the room fades in, rises into place and the
   camera settles
   from a pulled-back angle. The Zeneks arrive in a quick staggered wave, back
   rows first. About three seconds from first paint to a settled scene.
2. **The room.** Fourteen Zeneks on the concrete floor of the wood room, arranged
   like a team that just sat down, not like a chart. Each carries exactly one
   signature attribute drawn from the person's photo — glasses, curls, a beard,
   headphones, a beanie — and optionally one hand-held prop. They breathe, blink
   on their own clocks, sway imperceptibly, and chat: each leans toward a
   neighbour, or looks around on its own; now and then one gestures — talks with
   its hands, scratches its head, stretches, nods, tilts its head — and when a plane
   or a pair of gulls crosses the sky, a few look up. When the cursor comes close they turn,
   slowly, to look at whoever is approaching. Hover lifts one a hair and shows
   the name. Nothing else moves.
3. **The voice.** Tap a Zenek: it boings once and a speech bubble pops from
   above its head with the quote alone; the name lives on hover. One
   bubble open at a time; tap elsewhere, tap another Zenek, or press Esc to
   close. Nearby Zeneks glance toward whoever is speaking; the speaker talks with
   its hands.

No score, no roster, no filters, no menus. Ambient sound is a v1.1 question,
not a v1.0 feature.

## Why these choices

**Real-time 3D from primitives, not AI-generated meshes** (decided 2026-09-22).
Zenek is a sphere, a white cap, two dots and two hands. Written as a parametric
component it is exact, weightless (no meshes to download) and perfectly
consistent across fourteen variants. Image-to-3D tools were evaluated (Meshy
7.1, Tripo H3.1, Hyper3D Rodin Gen-2.5): they return dense meshes with baked
highlights, smeared glasses and fused hats, and their auto-riggers reject a
legless body. They remain an option only for one or two organic accessories
(curls, a beard), texture stripped, our material applied.

**Real-time, not pre-rendered.** Live 3D buys the things a screenshot can't:
highlights that shift as a body breathes, eyes that follow the cursor, a real
squash on tap, and lighting we tune to the photo instead of the other way
round. Fourteen low-poly spheres cost nothing on any phone.

**The wood room** (decided 2026-09-22). Of the three ZEN video-call
backgrounds, the wood room is the warmest and the most "zen": timber ceiling,
the Palace of Culture poster (Warsaw, home), a Japanese garden through the
glass. Its polished-concrete foreground gives fourteen figures a clear floor to
sit on and a surface to reflect in. It is mid-toned, so black bodies need
deliberate grounding — contact shadows and a faint reflection are
load-bearing, not garnish. The white lobby (best palette, no natural seats) and
the dark wall (black on black) were passed over.

**Full-screen, orbitable** (revised 2026-09-22 after the first live preview; replaces
the fixed postcard frame). The diorama fills the viewport on a warm off-white
ground. Drag rotates within limits, wheel or pinch zooms, and a quiet control
cluster in the bottom-right offers rotate, zoom and reset. When nobody touches
it for a few seconds the camera sways by a degree, so the scene never sits
dead still. Portrait phones simply see the room from further back and zoom in.

**The stack.** Vite + TypeScript + React; React Three Fiber + drei for the
scene; plain CSS for the little DOM there is (loader, frame, bubbles); Vercel
static hosting. Leva for a dev-only tuning panel; Playwright to screenshot the
stage so the build can look at its own frames.

## Visual & motion direction

**Set and light.** The photo is the set; the 3D must belong to it. Key light
from the windows (right), warm bounce from the timber ceiling, neutral fill
from the white wall — built as a small light-former rig and matched by eye
against the official Zenek renders and the plate. Tone mapping is chosen so the
body stays a rich black and the face plate reads paper-white against the
photo's own whites, never brighter.

**The mascot.** Base Zenek is sacred: proportions, the satin-black body with a
soft clearcoat, the matte white plate, the two dots, the floating hands.
Attributes are additive and few — one signature, one optional prop — built in
Zenek's own language (spheres, tori, capsules) so a beard or a head of curls
looks designed by the same hand. Palette: black, white, ZEN green, plus a short
list of matte natural tones for hair. Nothing is shiny except the body and the
occasional glass lens.

**Composition** (revised 2026-09-22). Not rows. A cocktail-party scatter: Zeneks
standing or sitting in different places at different depths — a pair chatting
near the front, one alone by the glass, a small group further back, one perched
on something — so every viewer finds a different favourite. Varied distance and
perspective are the point; equal spacing and straight lines are the enemy.
Artur sits at the right edge, arriving last; the focus stays on the team.

**Motion doctrine.** Calm, confident, playful in small doses. Amplitudes are
tiny; springs bounce once and settle; no two characters ever move in sync
(every clock is seeded per character); nothing moves without a reason — a
timer with human intervals, or the user's hand. Life comes from conversation: circles
take turns (a speaker, listeners who turn and nod, a shared laugh now and then, lulls
when each looks around), and gestures respect what a character wears — no hand ever
passes through hair (a head scratch is for bare heads only). `prefers-reduced-motion`
halves every amplitude and swaps hops for fades.

**Type and chrome.** Nunito (the ZEN UI face) in the bubbles and the loader,
subset with Polish diacritics. The bubble is paper: white, soft shadow, a small
tail, name in small caps, quote in 600 weight. The desk is warm off-white; the
postcard has 24 px corners and a soft shadow. That is all the UI there is.

## Taste notes

- **Subtract.** Premium means fewer moving things, better timed.
- **Ground everything.** A floating black sphere is a bug; a shadow and a
  reflection make it furniture.
- **Personality lives in the clocks.** Different breath, blink and sway per
  character turns fourteen copies into fourteen people.
- **Look at the frames.** Every phase ends with screenshots at three viewports,
  judged against the rubric in the plan. A scene that renders but reads wrong
  does not ship.
- **Charm over feature.** Given a choice between one more thing and one better
  thing, pick better.

## What this project is NOT

- **Not a game.** No budget, no roster, no bench map, no filters, no
  gamification of any kind.
- **Not a directory.** No bios, links, roles or hiring calls; the bubble carries
  a name and a quote, nothing more.
- **Not a 3D world.** One fixed camera, one photographic set; no orbit, no
  walking, no time-of-day.
- **Not a template.** Fourteen people, one room, one occasion.
- **Not a CMS.** Quotes live in one data file edited by hand.

## Roadmap

| Version | Scope | Status |
|---|---|---|
| **v0.1** | **Stage & Zenek** — fixed-aspect postcard on the calibrated plate; one parametric Zenek lit to match the room; contact shadow and reflection lab | ◻ next |
| **v0.5** | **The cast** — attribute kit, fourteen configs, seated composition signed off against the character sheets | ◻ |
| **v0.8** | **Alive & talking** — idle system, hover, tap boing, entrance wave, speech bubbles with real quotes | ◻ |
| **v1.0** | **Shipped** — branded loader, OpenGraph image, full-screen orbit view, performance budget met, unlisted Vercel URL shared with the team | ◻ |
| **v1.1** | **Candidates**, chosen after the team has seen v1.0 — ambient sound with a toggle; the back of the postcard (a handwritten note); the plant-cutout depth easter egg; neighbour glances | ◻ later |

## Open decisions

1. **Title and URL** — title DECIDED 2026-09-23: **ZEN Design Team** ("Zenki" was the
   working title; it survives only as the repo folder). The unlisted URL is Artur's call
   at v1.0. **Test hosting 2026-09-24:** GitHub Pages from the public repo
   `ArtSkw/zen-design-team`, rebuilt on every push to `main`:
   https://artskw.github.io/zen-design-team/ (`noindex`). Reference images stay out of the
   public repo.
2. **Language of the quotes** — Polish, English or mixed; affects the font
   subset and bubble widths. Decide before Phase 5.
3. **Where Artur sits** — host in the middle, or the one peeking in from the
   edge, arriving last.
4. **Names in bubbles** — recommended yes, so the "which one is me" guessing
   game resolves; confirm at Phase 5.
5. **Reflection** — keep or kill after the Phase 2 material lab, on evidence.
6. **Sound** — v1.1, only if the room asks for it.
7. **Environment beyond the slab** — DECIDED 2026-09-22 (late): **C, the hybrid — the
   illustrated page.** The first terrace-on-water build (reflective water, sprite mist,
   sphere hills, rectangle petals) was judged "okay, not amazing": lantern light clipped
   to discs, mist and hills popped while orbiting, petals read as rectangles, water read
   as plastic. Of the five directions weighed (A realistic-stylised 3D done properly;
   B a fully illustrated page; C hybrid; D toon-outline everything; E one painted
   backdrop), C was built: the timber deck and pilings stay in 3D on a pale, flattened
   water that still ghosts the room, with stroke ripples at the pilings; everything
   beyond is drawn in the design system's hand from its own illustration files
   (`docs/ds/*.svg`, pulled from the ZenDS Assets Figma) — 2 px #222 strokes, paper
   fills, the 6 px hatch — on three concentric strips (near, mid, far) so the page has
   real parallax and nothing pops. Petals are gone; a bird crosses now and then and
   hatched clouds drift. Lanterns lost their clipping point lights for baked pools.
   Reviewed 2026-09-23 and liked; Artur then asked for, and got, opaque motifs, a plane
   that flies the way it points and climbs, real gulls, DS trees on the hills, no more
   hard cut at the far plane, and living water; a drawn paper-and-ink deck was tried and set aside
   (`?inkdeck=1`) — the wood serves the centre of the view better. The page went almost
   white and the light rig neutral so room, page and water share one tonal family. Still open, Artur's call: the DS suspension bridge (built, off by default,
   `?bridge=1` — it reads as San Francisco); the Palace of Culture in the far skyline (in,
   as a nod to home, easy to remove); home elevation 16° vs 12° (12° shows more of the
   page).
   **Settled 2026-09-23 (Rounds 12–13, Artur):** the Palace of Culture stays, grounded —
   the far city rises from behind its own low ridge, so it no longer floats when the view
   orbits; the home elevation stays at 16°. The bridge was tried and **removed** (it
   floated over the hills and looked messy). A denser page — continuous hill chains,
   hatched paper-cut shadows, extra trees — was tried and **rolled back**: the minimal
   page reads better. Clouds are the DS's own silhouettes (flat base, wave-crest
   bumps), never a procedural shape with a square-cornered floor; each drifts in its own
   lane of sky and never over the far city (hatch over hatch fused into one blob). The
   ZenPlanSmart gate (a DS pictogram Artur supplied) stands on the hill that was empty
   on the right, answering the torii across the water.
8. **Character fidelity route** (2026-09-23: sculpted clay in code is the production
   route; the Meshy/Tripo comparison is ready and waits on Artur's key and consent) — the rebuilt characters are close
   but not there at close range: intersecting shells, no clay creases or strands. Options
   and a recommendation in `docs/research/character-fidelity.md`: sculpted clay in code
   (SDF, spike behind `?sculpt=1`), AI image-to-3D for the hair/beard only, the two
   combined, or hand sculpting. Needs Artur's call on uploading the designs to a 3D
   generator and on the brief's "≤ 3 AI accessories" rule.
