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
const mod = await import('./listar-aulas.mjs')
const { lerPlaylist, lerTitulos, linhasDaLista } = mod
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

// 5.25, tarefa 3a: o terminal da IA corta em 120 s; o yt-dlp sem prazo pendurava ali, calado
test('lerPlaylist chama o yt-dlp com prazo abaixo dos 120 s do terminal da IA', () => {
  const chamadas = []
  const rodar = (prog, args, opcoes) => {
    chamadas.push({ prog, args, opcoes })
    return JSON.stringify({ title: 'Curso X', entries: [{ id: 'v1', title: 'Aula 1', duration: 60 }] })
  }
  lerPlaylist('https://exemplo.invalido/p', { rodar })
  assert.equal(chamadas.length, 1, 'canario: o rodar falso nao foi chamado')
  assert.equal(chamadas[0].prog, 'yt-dlp')
  const { timeout } = chamadas[0].opcoes
  assert.equal(typeof timeout, 'number', `timeout ausente: ${JSON.stringify(chamadas[0].opcoes)}`)
  assert.ok(timeout > 0 && timeout < 120000, `timeout fora do prazo: ${timeout}`)
})

test('recadoDaPlaylist: no estouro do prazo manda pra rota por link; outro erro, o recado de sempre', () => {
  const { recadoDaPlaylist } = mod
  const estouro = Object.assign(new Error('spawnSync yt-dlp ETIMEDOUT'), { code: 'ETIMEDOUT' })
  const prazo = recadoDaPlaylist(estouro)
  assert.ok(prazo.length > 0, 'recado de prazo veio vazio')
  assert.match(prazo, /demorou demais/)
  assert.match(prazo, /links das aulas/)
  assert.doesNotMatch(prazo, /winget/)
  const outro = recadoDaPlaylist(Object.assign(new Error('spawnSync yt-dlp ENOENT'), { code: 'ENOENT' }))
  assert.ok(outro.length > 0, 'recado de outro erro veio vazio')
  assert.match(outro, /^Nao consegui abrir a playlist\./)
  assert.match(outro, /winget install --id yt-dlp\.yt-dlp/)
  assert.match(outro, /Detalhe: spawnSync yt-dlp ENOENT$/)
  assert.doesNotMatch(outro, /demorou demais/)
})

test('lerTitulos aceita segundos, m:ss e h:mm:ss, e sem duracao valida fica null', () => {
  const t = lerTitulos('A | 95\nB | 12:40\nC | 1:02:03\nD | perto de 1h\nE\nF | 95.6\nG | NA\nH | 1h02')
  assert.deepEqual(t.itens.map(i => [i.titulo, i.duracao]), [['A', 95], ['B', 760], ['C', 3723], ['D | perto de 1h', null], ['E', null], ['F', 96], ['G', null], ['H | 1h02', null]])
  // duracao escrita com numero que nao parseia avisa; o NA (o yt-dlp sem duracao, 5.24) tambem
  // avisa e sai do titulo; a linha sem duracao nenhuma, nao
  assert.deepEqual(t.avisos.map(a => a.match(/linha (\d+)/)[1]), ['4', '7', '8'])
  assert.match(t.avisos[1], /sem duracao na linha 7/)
  assert.match(t.avisos[2], /^duracao que nao entendi na linha 8 \("1h02"\): use segundos, m:ss ou h:mm:ss/)
})

// 5.24, chat 4: link solto. A SKILL manda o yt-dlp gravar "titulo | duracao" no titulos.txt pelo
// --print-to-file, que grava em UTF-8 (o --print pra tela perde acento e emoji no Windows), e o
// --titulos le esse arquivo. O teste aplica o template da propria linha da SKILL.
const SKILL = fileURLToPath(new URL('../SKILL.md', import.meta.url))

test('o comando de link solto da SKILL grava titulo | duracao que o --titulos le', () => {
  const achadas = fs.readFileSync(SKILL, 'utf8').split(/\r?\n/).filter(l => l.includes('--print-to-file'))
  assert.equal(achadas.length, 1, `canario: linhas com --print-to-file achadas ${achadas.length}`)
  const cmd = achadas[0]
  assert.match(cmd, /^yt-dlp --/)
  // --ignore-no-formats-error (revisao interna da 5.24): sem formato pra baixar, o yt-dlp para antes
  // de gravar a linha, e o titulo e a duracao se perdem
  for (const parte of ['--skip-download', '--ignore-no-formats-error', 'youtube:lang=pt', '--print-to-file "%(title)s | %(duration)s" "inteligencia/cursos/<nome>/fontes/titulos.txt"']) {
    assert.ok(cmd.includes(parte), `falta ${parte}: ${cmd}`)
  }
  assert.ok(!cmd.includes('--print "'), `--print pra tela perde acento no Windows: ${cmd}`)
  const tmpl = cmd.match(/--print-to-file "([^"]+)"/)[1]
  const linha = ([titulo, duracao]) => tmpl.replace('%(title)s', () => titulo).replace('%(duration)s', () => String(duracao))
  // titulo com cedilha, til, acento agudo e fogo (U+1F525), montado por codigo
  const TITULO = `Precifica${String.fromCharCode(0xe7, 0xe3)}o na pr${String.fromCharCode(0xe1)}tica ${String.fromCodePoint(0x1f525)}`
  const CRLF = String.fromCharCode(13, 10)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'listar-link-solto-'))
  try {
    const arq = path.join(dir, 'titulos.txt')
    // o --print-to-file acrescenta uma linha por link, com o fim de linha do sistema (CRLF no Windows)
    const rodar = aulas => {
      fs.writeFileSync(arq, aulas.map(linha).join(CRLF) + CRLF)
      return spawnSync(process.execPath, [CLI, '--titulos', arq], { timeout: 30000 })
    }
    const r = rodar([[TITULO, 760], ['Aula 1 | intro', 95.4]])
    assert.ifError(r.error)
    assert.ok(r.stdout.length > 0, `saida veio vazia: ${r.stderr}`)
    assert.equal(r.status, 0, r.stderr.toString('utf8'))
    assert.ok(r.stdout.includes(Buffer.from(TITULO, 'utf8')), `titulo nao veio em UTF-8: ${r.stdout.toString('hex')}`)
    const txt = r.stdout.toString('utf8')
    assert.ok(txt.includes(`${TITULO} (13 min, `), txt)
    assert.ok(txt.includes('Aula 1 | intro (2 min, '), txt)
    // so vira lote pela duracao lida: 10 aulas ficam abaixo do teto de 15, e 10 h passam de 8 h
    const horas = rodar(Array.from({ length: 10 }, (_, i) => [`Aula ${i + 1}`, 3600]))
    assert.equal(horas.status, 0, horas.stderr.toString('utf8'))
    assert.match(horas.stdout.toString('utf8'), /^LOTES: /m)
    // canario: 10 aulas de 1 min nao fazem lote
    const minutos = rodar(Array.from({ length: 10 }, (_, i) => [`Aula ${i + 1}`, 60]))
    assert.equal(minutos.status, 0, minutos.stderr.toString('utf8'))
    assert.ok(minutos.stdout.length > 0, 'saida do canario veio vazia')
    assert.doesNotMatch(minutos.stdout.toString('utf8'), /LOTES:/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
