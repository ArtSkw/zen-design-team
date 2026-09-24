# Character fidelity — getting the 3D Zeneks to match their 2D designs

> Research note, 2026-09-23 (Round 12). Question from Artur: the three rebuilt
> characters are close to their designs but not there — hair waves, beard softness,
> the moustache; what tools or frameworks get the 3D as close as possible to the
> 2D references? Evidence: `shots/r12-cmp-{artur,janek,magda-r}.png` (design vs
> today's render, close-up) and `shots/r12-beard-spike-sheet.png` (the spike below).

## What the gap actually is

Side by side at close range the difference is not "a few details". It has three causes,
in order of weight:

1. **Construction.** The designs are sculpted clay: every lock or tuft is its own lobe,
   and the lobes *fuse* into one mass through soft creases. Ours are separate shells —
   ellipsoid plates (beard), a hood plus lobes plus flat ribbons (hair) — that
   intersect. Where two shells cross at a shallow angle the render shows jagged,
   torn-looking patches (Magda's and Janek's hair close up). No amount of tuning removes
   that; it is what intersecting surfaces look like.
2. **Surface.** The designs carry fine strand grooves and a dark crease between lobes
   (ambient occlusion) and a soft velvet sheen. Ours are smooth and evenly lit.
3. **Material and light on the body.** The designs' body is a soft charcoal satin with a
   broad highlight; ours is a darker, glossier black with glossy bead eyes. This one is a
   tuning pass, not a modelling problem.

## The options

| | Route | Fidelity ceiling | Cost | Consistency across 14 | Runtime | Constraints |
|---|---|---|---|---|---|---|
| **A** | **Keep primitives, tune harder** (today's method) | Low–medium: seams and intersections stay | Low per pass, many passes | High | Free | Hits a wall at close range |
| **B** | **SDF sculpt in code** — each lock is a soft primitive, all fused with a smooth union, meshed (marching cubes); AO baked from the field; strand grooves in the shader | Medium–high: the clay read, fused lobes, soft creases | Medium: a spec per accessory + 3–6 gated passes (a few hours each) | High — one hand, one material | ~1 s per accessory to mesh at load → bake at build time (≈ 50–150 KB each, compressed) | Shape still has to be authored against the design; fine strands only as shader detail |
| **C** | **AI image-to-3D for the accessory** — the approved design into Rodin Gen-2 / Tripo 3 / Hunyuan3D; cut the hair or beard out of the result, clean it, our clay material, on our code-built Zenek | High for the front; hidden sides are the model's guess | Low per character (minutes + cleanup), a few credits | Medium — each result differs a little; cleanup evens it out | GLB per accessory, 100–300 KB compressed | Uploads the designs to a vendor (your call); the brief caps AI at ≤ 3 accessories — would need revising for 14; needs an account |
| **D** | **Hybrid: C as a 3D *reference*, B as the build** — generate once, use the mesh only to measure depth and hidden sides, then sculpt the SDF against it (img2threejs' "GLB-mediated" track) | High, and procedural | Medium (B's passes, fewer guesses) | High | As B | As C for the upload |
| **E** | **Hand sculpting** — Nomad Sculpt (iPad/web) or Blender, by you or a 3D freelancer, export GLB | Highest, if the hand is good | ~1–2 h per accessory for a pro | Depends on one person doing all 14 | GLB per accessory | Human time |

Across all routes: **a shading pass** (clay material with sheen, baked crease AO, strand
grooves; a satin charcoal body closer to the designs) is worth doing regardless.

## The spike (route B), on Artur's own beard

`?sculpt=1` swaps the beard for an SDF sculpt (`src/zenek/sculpts.ts`, `src/zenek/sculpt.ts`,
lazy-loaded, off by default). Measured from the design grid: the outline traced in the
front view, 60 teardrop tufts in shingled rows (rooted back, swelling forward, tips over
the row below), a three-lobe handlebar moustache per side, fused with a small smooth
union; AO baked from the field; vertical strand grooves in the shader.

What it proves (`shots/r12-beard-spike-sheet.png`, front and ¾, next to the design and today's beard):

- **The clay read works.** Rows of rounded teardrop tips with soft creases between them —
  the design's texture, which the plates never had. No seams, no torn patches.
- **Shape is still authoring.** After three passes the beard is too boxy at the top edge
  and the moustache too slim; the design's rounder U and bushy handlebar need more
  passes. That is normal reconstruction work — the route's ceiling is high, but it is not
  free.
- **Cost at load:** meshing takes about a second per accessory on the main thread, so
  a shipped version would bake the meshes at build time.

## Recommendation

1. **Now, whichever route:** the shading pass on body, eyes and hair material.
2. **Run one cheap test of route C on the same beard** (and, if it looks good, Magda's
   hair — the hardest one): put `docs/cast/artur.png` through Rodin Gen-2 or Tripo 3 (web
   apps, minutes), drop the GLB into `img2/artur/`, and I cut out the beard, apply our
   clay material and compare it on the same sheet as the SDF spike.
3. **Then pick the scaling route on evidence:** if the cleaned AI beard is clearly closer,
   go **C** for all hair and beards (revise the brief's AI cap); if it is close but
   messy, go **D** (sculpt in code against the AI mesh). If neither convinces, **E** for
   the hardest hairstyles.

## Decisions needed from Artur

- May the approved 2D designs be uploaded to a 3D generator (which one), and can you run
  it or give me an API key? (I cannot sign up to services.)
- Is the brief's "≤ 3 AI accessories" rule still wanted, given that most of the fourteen
  will have hair?
- Should Blender be installed on this machine (for cleanup and for route E)?

## Tools landscape (checked 2026-09-23)

- **Image-to-3D:** Hyper3D Rodin (Gen-2) — the most-cited for stylized, near-ready
  characters; Tripo 3.0 — clean topology, stylized modes; Tencent Hunyuan3D — the best
  open model; Microsoft TRELLIS.2 — open, research frontier, needs a CUDA GPU (not this
  Mac); ByteDance Seed3D — strong on organic, stylized shapes.
- **SDF → mesh in the web stack:** the three.js `MarchingCubes` addon (used in the spike,
  no new dependency); `manifold-3d` (WASM, `levelSet` — marching tetrahedra, manifold
  output; the better choice for a build-time bake).
- **Agent method:** the installed img2threejs skill — its implicit-SDF path, its stylized
  hair pipeline, and the GLB-mediated track (a generated GLB as a measured reference,
  never the output).
- **Human sculpting:** Nomad Sculpt, Blender (drivable by an agent through
  blender-mcp), Womp (SDF "goop" modelling in the browser).

Sources: [RunDiffusion — AI 3D generators compared (2026)](https://learn.rundiffusion.com/ai-3d-model-generators/),
[Indie Hackers — 9 AI 3D generators tested](https://www.indiehackers.com/post/best-ai-3d-model-generator-in-2026-i-tested-9-of-the-best-and-here-is-what-i-found-70ecab1a0a),
[TRELLIS vs Meshy vs Tripo vs Hitem3D](https://trellis2.app/blog/best-ai-3d-model-generator),
[Hyper3D Rodin](https://hyper3d.ai/),
[Manifold — three.js example](https://manifoldcad.org/three), [manifold-3d on npm](https://www.npmjs.com/package/manifold-3d),
[img2threejs overview](https://explainx.ai/blog/img2threejs-bunpav-procedural-photo-threejs-july-2026),
and the img2threejs checkout (`grimoire/build/implicit_sdf_modeling.md`,
`grimoire/character/stylized_hair_threejs.md`, `docs/RESEARCH_TRELLIS2_TO_IMG2THREEJS.md`).

## Update 2026-09-23 (Round 17) — route B scaled, route C ready to run

Route B (sculpted SDF) is now the production method: all hair and beards on Artur, Magda R,
Krystian, Kamil and Mateusz N are baked sculpts (see plan.md Round 17). Honest read after
3–4 passes each: masses, silhouettes, placement and colour match the designs; surface
detail (sharp flame tufts, deep S-waves, fuzz) is a step behind the designs' sculpted
renders.

Route C (Meshy / Tripo) is wired but not run — this machine has no keys, and uploading the
designs is Artur's call. Current APIs (checked 2026-09-23): Meshy `POST
/openapi/v1/image-to-3d`, `ai_model: latest` = Meshy 7.1, image inline as a data URI, PBR,
remesh to a target poly count, GLB out; Tripo H3 (`v3.1-20260211`), `geometry_quality` /
`texture_quality: detailed`, PBR, GLB out. One command per character:
`node scripts/gen3d.mjs <id> --via meshy|tripo` (key in `.env.local`), then
`node scripts/cast-cmp.mjs <id> --glb img2/<id>/<vendor>/model.glb` for the side-by-side.
If a vendor's hair or beard is clearly closer, the next step is route D: cut the accessory
out of the GLB, apply our clay material, keep our code-built Zenek underneath.

Sources: [Meshy Image to 3D API](https://docs.meshy.ai/en/api/image-to-3d),
[Tripo H3 image to model](https://docs.tripo3d.ai/model-generation/image-to-model-v3-0-v3-1.html),
[Tripo quick start](https://developers.tripo3d.ai/en/docs/quick-start).
