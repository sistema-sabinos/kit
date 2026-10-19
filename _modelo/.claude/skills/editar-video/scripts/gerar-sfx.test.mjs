// P4: gerador proprio de efeitos sonoros. Roda o ffmpeg de verdade numa pasta temporaria.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SONS, FONTE, gerarSfx, picoDb } from './gerar-sfx.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SOM_MD = readFileSync(join(AQUI, '..', 'referencias', 'som.md'), 'utf8')
const QUEBRA = new RegExp(String.fromCharCode(13) + '?' + String.fromCharCode(10))
const celulas = (l) => l.split('|').slice(1, -1).map((c) => c.trim())

function comTemp(fn) {
  const d = mkdtempSync(join(tmpdir(), 'gerar-sfx-'))
  try { return fn(d) } finally { rmSync(d, { recursive: true, force: true }) }
}

test('P4: gerar-sfx cria os efeitos na biblioteca, com o registro nas colunas e no Uso do som.md', () => comTemp((d) => {
  // o que o som.md manda: colunas do registro (linha "sfx/registro.md: ...") e a coluna Momento da tabela
  const m = /`sfx\/registro\.md`: ([^.]+)\./.exec(SOM_MD)
  assert.ok(m, 'canario: o som.md tem a linha das colunas do sfx/registro.md')
  const colunas = m[1].split(',').map((c) => c.trim())
  const momentos = SOM_MD.split(QUEBRA).filter((l) => l.startsWith('| ') && !l.startsWith('| Momento')).map((l) => celulas(l)[0])
  assert.ok(momentos.length >= 4, 'canario: achei a tabela de Momento do som.md: ' + momentos.join(' / '))
  assert.deepEqual(SONS.map((s) => s.arquivo), ['pop.wav', 'acende.wav'], 'so os 2 que passaram no ouvido (decisao 6 da 5.17)')

  const pasta = join(d, 'midia', 'biblioteca', 'sfx')
  const r = gerarSfx({ pasta })
  assert.deepEqual(r.gerados, SONS.map((s) => s.arquivo))
  for (const s of SONS) {
    const arq = join(pasta, s.arquivo)
    const p = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=sample_rate,channels:format=duration', '-of', 'json', arq], { encoding: 'utf8' })
    assert.equal(p.status, 0, p.stderr)
    const j = JSON.parse(p.stdout)
    assert.equal(j.streams[0].sample_rate, '48000', s.arquivo)
    assert.equal(j.streams[0].channels, 2, s.arquivo)
    const dur = Number(j.format.duration)
    assert.ok(dur > 0.1 && dur <= 1.5, `${s.arquivo}: ${dur} s`)
    const pico = picoDb(spawnSync, arq)
    assert.ok(pico > -4 && pico < -2, `${s.arquivo}: pico ${pico} dB`)
  }
  const linhas = readFileSync(r.registro, 'utf8').split(QUEBRA).filter((l) => l.startsWith('|'))
  assert.deepEqual(celulas(linhas[0]), colunas)
  const corpo = linhas.slice(2).map(celulas)
  assert.equal(corpo.length, SONS.length)
  for (const [arquivo, , duracao, uso, fonte] of corpo) {
    assert.ok(momentos.some((mo) => uso.startsWith(mo)), `${arquivo}: o Uso "${uso}" nao comeca por nenhum Momento do som.md`)
    assert.match(duracao, /^\d,\d\d s$/)
    assert.equal(fonte, FONTE)
  }
}))

test('P4: gerar-sfx nao sobrescreve som nem linha do aluno, guarda o CRLF do registro e nao repete na segunda vez', () => comTemp((d) => {
  const pasta = join(d, 'sfx')
  mkdirSync(pasta, { recursive: true })
  const CRLF = String.fromCharCode(13, 10)
  writeFileSync(join(pasta, 'pop.wav'), 'som-do-aluno')
  const doAluno = '| pop.wav | Pop do aluno | 0,20 s | Cartão, número ou palavra-chave entrando | Mixkit |'
  writeFileSync(join(pasta, 'registro.md'), ['| Arquivo | Nome | Duração | Uso | Fonte |', '|---|---|---|---|---|', doAluno].join(CRLF) + CRLF)
  const r = gerarSfx({ pasta })
  assert.deepEqual(r.pulados, ['pop.wav'])
  assert.equal(r.gerados.length, SONS.length - 1)
  assert.equal(readFileSync(join(pasta, 'pop.wav'), 'utf8'), 'som-do-aluno')
  const texto = readFileSync(r.registro, 'utf8')
  assert.ok(texto.includes(doAluno + CRLF), 'a linha do aluno sumiu ou mudou')
  assert.equal(texto.split('| pop.wav |').length - 1, 1, 'pop.wav ganhou linha repetida')
  assert.equal(texto.split(CRLF).length, texto.split(String.fromCharCode(10)).length, 'misturou LF solto num registro CRLF')
  assert.equal(texto.split(FONTE).length - 1, SONS.length - 1)
  gerarSfx({ pasta })
  assert.equal(readFileSync(r.registro, 'utf8'), texto, 'a segunda rodada mexeu no registro')
  assert.deepEqual(readdirSync(pasta).sort(), [...SONS.map((s) => s.arquivo), 'registro.md'].sort(), 'sobrou arquivo temporario')
}))

test('P4: gerar-sfx registra cada som assim que ele nasce, e falha no segundo nao deixa o primeiro sem linha', () => comTemp((d) => {
  const pasta = join(d, 'sfx')
  const [primeiro, segundo] = SONS.map((s) => s.arquivo)
  let falhou = 0
  const quebraNoSegundo = (cmd, args, op) => {
    if (cmd === 'ffmpeg' && args.some((a) => String(a).includes(segundo))) { falhou++; return { status: 1, stderr: 'falha de teste' } }
    return spawnSync(cmd, args, op)
  }
  assert.throws(() => gerarSfx({ pasta, executar: quebraNoSegundo }), new RegExp(segundo))
  assert.ok(falhou > 0, 'canario: o executar injetado chegou a falhar no ' + segundo)
  assert.deepEqual(readdirSync(pasta).sort(), [primeiro, 'registro.md'].sort(), 'o primeiro som nasceu e ganhou registro, sem temporario')
  const depoisDaFalha = readFileSync(join(pasta, 'registro.md'), 'utf8')
  assert.equal(depoisDaFalha.split(`| ${primeiro} |`).length - 1, 1, primeiro + ' ficou sem linha no registro depois da falha')
  const r = gerarSfx({ pasta })
  assert.deepEqual(r.pulados, [primeiro])
  assert.deepEqual(r.gerados, [segundo])
  const texto = readFileSync(r.registro, 'utf8')
  for (const a of SONS.map((s) => s.arquivo)) assert.equal(texto.split(`| ${a} |`).length - 1, 1, a + ' sem linha ou repetido')
  assert.equal(texto.split(FONTE).length - 1, SONS.length)
}))
