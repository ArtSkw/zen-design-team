// Publish the picked takes: copy them from sound-raw/ to public/sound/ (served with the
// site) and write public/sound/picks.json, the list the app plays from (src/sound/samples.ts),
// each take with its measurements (sound-raw/index.json) and, where it was evened by ear-
// weighted loudness with its cue's other takes, its level (scripts/loudness.py).
//   node scripts/sfx-publish.mjs "lake:3+1,breeze:1+2,…"
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

// measured 2026-09-27 through the mix: each lake stretch to −38 LUFS, each breeze stretch to
// −41 (three under the lake: near water, far air)
const LEVEL = { 'lake-1': 1.06, 'lake-3': 0.94, 'breeze-1': 0.99, 'breeze-2': 1.5 }

const line = process.argv[2]
if (!line) throw new Error('usage: node scripts/sfx-publish.mjs "cue:n+m,…"')
const index = JSON.parse(readFileSync('sound-raw/index.json', 'utf8'))
const picks = {}
for (const part of line.split(',')) {
  const [cue, ns] = part.trim().split(':')
  for (const n of ns.split(/[+ ]/)) {
    const take = index[cue]?.[n]
    if (!take) throw new Error(`no take ${cue}-${n} in sound-raw/index.json`)
    const name = `${cue}-${n}`
    ;(picks[cue] ??= []).push({ ...take, ...(LEVEL[name] ? { level: LEVEL[name] } : {}) })
  }
}
mkdirSync('public/sound', { recursive: true })
for (const f of readdirSync('public/sound')) if (f.endsWith('.mp3')) rmSync(`public/sound/${f}`) // only the picks are published
let bytes = 0
for (const [cue, takes] of Object.entries(picks))
  for (const t of takes) {
    copyFileSync(`sound-raw/${cue}/${t.file}`, `public/sound/${t.file}`)
    bytes += readFileSync(`public/sound/${t.file}`).length
  }
writeFileSync('public/sound/picks.json', JSON.stringify(picks, null, 1) + '\n')
console.log(`published ${Object.values(picks).flat().length} takes of ${Object.keys(picks).length} cues, ${(bytes / 1024 / 1024).toFixed(2)} MB`)
