# ZEN Design Team

A thank-you postcard for the ZEN.COM design team: fourteen Zeneks, the ZEN mascot, one
per designer, chatting on a terrace in a hand-drawn ZenDS world. Real-time 3D in the
browser, built from code.

**Live:** https://artskw.github.io/zen-design-team/ (a work in progress)

## Run it

```sh
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # typecheck + production build into dist/
npm run shot       # Playwright screenshots of the stage into shots/
```

Stack: Vite, React, TypeScript, three.js with React Three Fiber and drei.

## Tuning from the URL

Every tunable has a default; the query string only overrides it.

| Param | Does |
|---|---|
| `intro=0` | skip the loader and entrance, land settled |
| `motion=0` | freeze idle motion (deterministic screenshots) |
| `lab=<id>` | one Zenek on a neutral backdrop, e.g. `lab=janek` |
| `title=0` · `title=hold` | skip the title card · stay on it |
| `sheet=1` | the drawn world as a flat layer sheet |
| `az=` `el=` `dist=` | override the home camera (degrees, units) |

The full list lives in [src/lib/params.ts](src/lib/params.ts).

## Where things are

- [BRIEF.md](BRIEF.md): what this is and why (the product brief, with dated decisions)
- [docs/plan.md](docs/plan.md): the execution spec and the log of each build round
- `src/set/`: the diorama and the drawn world · `src/zenek/`: the mascot, sculpts, motion ·
  `src/cast/team.ts`: who sits where · `scripts/`: offline bakes and review tools

Reference images (the 2D character designs, ZenDS exports, concept renders) stay
outside the repo, so the scripts that read `docs/**/*.png|svg` work only on the
author's machine. Their outputs are committed (`src/set/ds-paths.ts`,
`src/ui/title-glyphs.ts`, `public/sculpts/*.bin`).

## Deploy

Every push to `main` builds and publishes to GitHub Pages
([.github/workflows/deploy.yml](.github/workflows/deploy.yml)). The build is served
from `/zen-design-team/` (`base` in [vite.config.ts](vite.config.ts)).
