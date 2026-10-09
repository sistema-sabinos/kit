// Sem o yt-dlp no PATH, o listar-aulas diz como instalar pelo comando direto.
// Roda com: node --test listar-aulas.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI = fileURLToPath(new URL('./listar-aulas.mjs', import.meta.url))

// F.2 (5.7): o recado mandava instalar pela /configurar-video, que nao instala o yt-dlp.
test('sem yt-dlp no PATH o recado traz o winget do yt-dlp e nao cita a /configurar-video', () => {
  const vazio = fs.mkdtempSync(path.join(os.tmpdir(), 'listar-aulas-'))
  try {
    const env = { ...process.env, PATH: vazio, Path: vazio }
    const r = spawnSync(process.execPath, [CLI, 'https://exemplo.invalido/playlist'], { encoding: 'utf8', env })
    assert.equal(r.status, 1)
    assert.ok((r.stderr ?? '').length > 0, 'stderr veio vazio')
    assert.match(r.stderr, /winget install --id yt-dlp\.yt-dlp -e --source winget --accept-source-agreements --accept-package-agreements --disable-interactivity/)
    assert.match(r.stderr, /brew install yt-dlp/)
    assert.doesNotMatch(r.stderr, /\/configurar-video/)
  } finally {
    fs.rmSync(vazio, { recursive: true, force: true })
  }
})
