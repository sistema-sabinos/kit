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

// 5.21, tarefa 3.2: curso grande imprime a linha LOTES, pela playlist e pela lista de titulos
const { lerPlaylist, lerTitulos, linhasDaLista } = await import('./listar-aulas.mjs')
const { ordenarAulas } = await import('./lib/aulas.mjs')
const linhaLotes = linhas => linhas.filter(l => l.startsWith('LOTES:'))

test('playlist de curso grande sai com a linha LOTES, e a de curso pequeno sem', () => {
  const playlist = n => () => JSON.stringify({ title: 'Curso X', entries: Array.from({ length: n }, (_, i) => ({ id: `v${n - i}`, title: `Aula ${n - i}`, duration: 600 })) })
  const grande = lerPlaylist('https://exemplo.invalido/p', { rodar: playlist(16) })
  const linhas = linhasDaLista(grande, ordenarAulas(grande.itens))
  assert.ok(linhas.length > 0, 'saida veio vazia')
  assert.deepEqual(linhaLotes(linhas), ['LOTES: L1 aulas 1-8, L2 aulas 9-16'])
  // canario: o curso pequeno nao traz lote
  const pequeno = lerPlaylist('https://exemplo.invalido/p', { rodar: playlist(6) })
  assert.deepEqual(linhaLotes(linhasDaLista(pequeno, ordenarAulas(pequeno.itens))), [])
})

test('--titulos le titulo e duracao, ordena e imprime LOTES no texto e no --json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'listar-titulos-'))
  try {
    const arq = path.join(dir, 'titulos.txt')
    const linhas = ['Aula 3 - estoque | 5:00:00', 'Aula 1 - abrir conta | 1:00:00', '', 'Aula 2 - precificar | 2:30:00', 'Bonus | ao vivo']
    fs.writeFileSync(arq, linhas.join(String.fromCharCode(13, 10)))
    const r = spawnSync(process.execPath, [CLI, '--titulos', arq], { encoding: 'utf8' })
    assert.ok(r.stdout.length > 0, 'saida veio vazia')
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /^ +1\. \[aula 1\] Aula 1 - abrir conta \(60 min, [\d.]+ tokens\) \[linha 2\]$/m)
    assert.match(r.stdout, /^ +2\. \[aula 2\] Aula 2 - precificar \(150 min, [\d.]+ tokens\) \[linha 4\]$/m)
    assert.match(r.stdout, /^ +4\. \[sem numero\] Bonus \| ao vivo \(\?, 0 tokens\) \[linha 5\]$/m)
    assert.deepEqual(r.stdout.split(/\r?\n/).filter(l => l.startsWith('LOTES:')), ['LOTES: L1 aulas 1-2, L2 aula 3, L3 aula 4'])
    const j = spawnSync(process.execPath, [CLI, '--titulos', arq, '--json'], { encoding: 'utf8' })
    assert.equal(j.status, 0, j.stdout + j.stderr)
    const json = JSON.parse(j.stdout)
    assert.equal(json.linha_lotes, 'LOTES: L1 aulas 1-2, L2 aula 3, L3 aula 4')
    assert.equal(json.lotes.length, 3)
    // canario: duas aulas curtas nao fazem lote
    fs.writeFileSync(arq, 'Aula 1 | 10:00\nAula 2 | 12:40')
    const p = spawnSync(process.execPath, [CLI, '--titulos', arq], { encoding: 'utf8' })
    assert.equal(p.status, 0, p.stdout + p.stderr)
    assert.match(p.stdout, /^2 aulas, 23 min no total/m)
    assert.doesNotMatch(p.stdout, /LOTES:/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// Achado do Codex na 5.21: recalcular os lotes pelo --titulos desfazia a ordem decidida com a pessoa
test('--titulos --na-ordem mantem a ordem do arquivo e recalcula os lotes nela', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'listar-na-ordem-'))
  try {
    const arq = path.join(dir, 'titulos.txt')
    fs.writeFileSync(arq, ['Bonus: boas-vindas | 5:00', ...Array.from({ length: 16 }, (_, i) => `Aula ${i + 1} | 10:00`)].join('\n'))
    const r = spawnSync(process.execPath, [CLI, '--titulos', arq, '--na-ordem'], { encoding: 'utf8' })
    assert.ok(r.stdout.length > 0, 'saida veio vazia')
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /ordem por ordem do arquivo$/m)
    assert.match(r.stdout, /^ +1\. \[sem numero\] Bonus: boas-vindas /m)
    assert.deepEqual(r.stdout.split(/\r?\n/).filter(l => l.startsWith('LOTES:')), ['LOTES: L1 aulas 1-8, L2 aulas 9-16, L3 aula 17'])
    // canario: sem --na-ordem o bonus vai pro fim
    const sem = spawnSync(process.execPath, [CLI, '--titulos', arq], { encoding: 'utf8' })
    assert.match(sem.stdout, /^ +17\. \[sem numero\] Bonus: boas-vindas /m)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('lerTitulos aceita segundos, m:ss e h:mm:ss, e sem duracao valida fica null', () => {
  const t = lerTitulos('A | 95\nB | 12:40\nC | 1:02:03\nD | perto de 1h\nE\nF | 95.6\nG | NA\nH | 1h02')
  assert.deepEqual(t.itens.map(i => [i.titulo, i.duracao]), [['A', 95], ['B', 760], ['C', 3723], ['D | perto de 1h', null], ['E', null], ['F', 96], ['G | NA', null], ['H | 1h02', null]])
  // duracao escrita com numero que nao parseia avisa; sem numero (NA) ou sem duracao, nao
  assert.deepEqual(t.avisos.map(a => a.match(/linha (\d+)/)[1]), ['4', '8'])
  assert.match(t.avisos[1], /^duracao que nao entendi na linha 8 \("1h02"\): use segundos, m:ss ou h:mm:ss/)
})
