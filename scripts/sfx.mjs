// Generate the sound layer's takes with ElevenLabs Sound Effects v2, from the prompts in
// docs/sound/prompts.json, into sound-raw/<cue>/<cue>-<n>.mp3 (local only, git-ignored).
// The key is read from .env.local (ELEVENLABS_API_KEY) and never printed. A take already
// on disk is never generated again, so a rerun only fills what is missing (no double
// charges); every take's cost is logged from the response's character-cost header.
//   node scripts/sfx.mjs --dry                 what would be generated, and its cost
//   node scripts/sfx.mjs [--only lake,click]   generate (stops before going over --cap)
//   node scripts/sfx.mjs --only click --more 2 two more takes of a cue
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const arg = (k, d) => (argv.includes(`--${k}`) ? argv[argv.indexOf(`--${k}`) + 1] : d)
const dry = argv.includes('--dry')
const only = arg('only', '').split(',').filter(Boolean)
const more = Number(arg('more', '0'))
const cap = Number(arg('cap', '4000')) // credits this run may spend at most
const CREDITS_PER_SECOND = 10 // measured on this plan (character-cost of a 0.5 s take: 5)

const book = JSON.parse(readFileSync('docs/sound/prompts.json', 'utf8'))
const key = readFileSync('.env.local', 'utf8').match(/^\s*ELEVENLABS_API_KEY\s*=\s*["']?([^"'\s]+)/m)?.[1]
if (!key && !dry) throw new Error('ELEVENLABS_API_KEY missing from .env.local')

// what is missing: every take of every cue asked for, not yet on disk
const jobs = []
for (const [cue, c] of Object.entries(book.cues)) {
  if (only.length && !only.includes(cue)) continue
  const have = (n) => existsSync(`sound-raw/${cue}/${cue}-${n}.mp3`)
  let n = 1
  let want = c.takes
  if (more) {
    while (have(n)) n++
    want = n - 1 + more
  }
  for (let i = 1; i <= want; i++) if (!have(i)) jobs.push({ cue, n: i, c })
}
const estimate = Math.round(jobs.reduce((s, j) => s + j.c.seconds * CREDITS_PER_SECOND, 0))
console.log(`${jobs.length} takes to generate, about ${estimate} credits (cap ${cap})`)
if (dry || !jobs.length) process.exit(0)
if (estimate > cap) throw new Error(`the estimate is over the cap: raise --cap or narrow with --only`)

const H = { 'xi-api-key': key }
const used = async () => (await (await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: H })).json()).character_count
const before = await used()
let spent = 0

async function take({ cue, n, c }) {
  const body = { text: c.prompt, duration_seconds: c.seconds, prompt_influence: c.influence, model_id: 'eleven_text_to_sound_v2', ...(c.loop ? { loop: true } : {}) }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch(`https://api.elevenlabs.io/v1/sound-generation?output_format=${book.format}`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer())
      mkdirSync(`sound-raw/${cue}`, { recursive: true })
      writeFileSync(`sound-raw/${cue}/${cue}-${n}.mp3`, buf)
      const cost = Number(r.headers.get('character-cost') ?? c.seconds * CREDITS_PER_SECOND)
      spent += cost
      appendFileSync('sound-raw/log.jsonl', JSON.stringify({ at: new Date().toISOString(), cue, n, cost, bytes: buf.length, version: book.version, ...body }) + '\n')
      console.log(`  ${cue}-${n}  ${c.seconds}s  ${cost} credits`)
      return
    }
    const why = (await r.text()).slice(0, 200)
    if (r.status === 429 || r.status >= 500) {
      await new Promise((s) => setTimeout(s, 2000 * attempt)) // busy: wait and try again
      continue
    }
    throw new Error(`${cue}-${n}: ${r.status} ${why}`)
  }
  throw new Error(`${cue}-${n}: gave up after 3 attempts`)
}

// two at a time: well inside the plan's concurrency
const queue = [...jobs]
await Promise.all([0, 1].map(async () => {
  while (queue.length) await take(queue.shift())
}))
await new Promise((s) => setTimeout(s, 2000))
const after = await used()
console.log(`done: ${jobs.length} takes, ${spent} credits by the responses (account: ${after - before} more used, ${after} of the month's allowance)`)
