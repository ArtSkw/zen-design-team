// Image-to-3D for one approved design, through Meshy or Tripo — an opt-in reference, not
// the shipped model: the GLB it returns is compared with our sculpt (scripts/cast-cmp.mjs
// --glb) and, if a route wins, measured against (img2threejs' GLB-mediated track).
//
// It uploads docs/cast/<id>.png to the vendor. Run it only once Artur has agreed to that
// for the design in question. Keys come from the environment or .env.local (git-ignored):
//   MESHY_API_KEY=…   TRIPO_API_KEY=…
//
//   node scripts/gen3d.mjs artur --via meshy            → img2/artur/meshy/model.glb
//   node scripts/gen3d.mjs magda-r --via tripo          → img2/magda-r/tripo/model.glb
//   [--image path.png] [--poly 60000]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const id = argv[0]
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`)
  return i >= 0 ? argv[i + 1] : d
}
const via = arg('via', 'meshy')
const image = arg('image', `docs/cast/${id}.png`)
const poly = Number(arg('poly', '60000'))
if (!id || !existsSync(image)) {
  console.error(`usage: node scripts/gen3d.mjs <member-id> --via meshy|tripo   (no ${image})`)
  process.exit(2)
}

// keys: environment first, then .env.local
const env = { ...process.env }
if (existsSync('.env.local'))
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/)
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
const key = via === 'meshy' ? env.MESHY_API_KEY : env.TRIPO_API_KEY
if (!key) {
  console.error(`no ${via === 'meshy' ? 'MESHY_API_KEY' : 'TRIPO_API_KEY'} (environment or .env.local)`)
  process.exit(2)
}

const out = `img2/${id}/${via}`
mkdirSync(out, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function json(res, what) {
  const text = await res.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }
  if (!res.ok) {
    console.error(`${what}: HTTP ${res.status}`, typeof body === 'string' ? body.slice(0, 600) : JSON.stringify(body).slice(0, 600))
    process.exit(1)
  }
  return body
}
async function download(url, file) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download ${res.status}`)
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  console.log('saved', file)
}

const png = readFileSync(image)
const t0 = Date.now()

if (via === 'meshy') {
  // https://docs.meshy.ai/en/api/image-to-3d — the image goes inline as a data URI
  const H = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  const created = await json(
    await fetch('https://api.meshy.ai/openapi/v1/image-to-3d', {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        image_url: `data:image/png;base64,${png.toString('base64')}`,
        ai_model: 'latest',
        topology: 'triangle',
        should_remesh: true,
        target_polycount: poly,
        should_texture: true,
        enable_pbr: true,
      }),
    }),
    'create',
  )
  const task = created.result
  console.log('meshy task', task)
  for (;;) {
    await sleep(5000)
    const t = await json(await fetch(`https://api.meshy.ai/openapi/v1/image-to-3d/${task}`, { headers: H }), 'poll')
    process.stdout.write(`\r${t.status} ${t.progress ?? ''}%   `)
    if (t.status === 'SUCCEEDED') {
      writeFileSync(`${out}/response.json`, JSON.stringify(t, null, 2))
      await download(t.model_urls.glb, `${out}/model.glb`)
      if (t.thumbnail_url) await download(t.thumbnail_url, `${out}/thumbnail.png`)
      break
    }
    if (t.status === 'FAILED' || t.status === 'CANCELED') {
      console.error('\nfailed', JSON.stringify(t.task_error ?? t).slice(0, 600))
      process.exit(1)
    }
  }
} else {
  // Tripo OpenAPI v2 (upload → task → poll); v3 exists but its docs are browser-only —
  // any mismatch is printed verbatim
  const base = 'https://api.tripo3d.ai/v2/openapi'
  const form = new FormData()
  form.append('file', new Blob([png], { type: 'image/png' }), `${id}.png`)
  const up = await json(await fetch(`${base}/upload`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form }), 'upload')
  const token = up.data?.image_token ?? up.data?.file_token
  const created = await json(
    await fetch(`${base}/task`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'image_to_model',
        model_version: arg('model', 'v3.1-20260211'),
        file: { type: 'png', file_token: token },
        texture: true,
        pbr: true,
        face_limit: poly,
        geometry_quality: 'detailed',
        texture_quality: 'detailed',
      }),
    }),
    'create',
  )
  const task = created.data?.task_id
  console.log('tripo task', task)
  for (;;) {
    await sleep(5000)
    const t = await json(await fetch(`${base}/task/${task}`, { headers: { Authorization: `Bearer ${key}` } }), 'poll')
    const d = t.data ?? {}
    process.stdout.write(`\r${d.status} ${d.progress ?? ''}%   `)
    if (d.status === 'success') {
      writeFileSync(`${out}/response.json`, JSON.stringify(t, null, 2))
      const url = d.output?.pbr_model ?? d.output?.model ?? d.output?.model_url ?? d.output?.base_model
      await download(url, `${out}/model.glb`)
      if (d.output?.rendered_image) await download(d.output.rendered_image, `${out}/thumbnail.png`)
      break
    }
    if (['failed', 'cancelled', 'banned', 'expired'].includes(d.status)) {
      console.error('\nfailed', JSON.stringify(t).slice(0, 600))
      process.exit(1)
    }
  }
}
console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${out}/model.glb\nnext: node scripts/cast-cmp.mjs ${id} --glb ${out}/model.glb`)
