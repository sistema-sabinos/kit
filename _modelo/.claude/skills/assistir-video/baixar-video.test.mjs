// Testes do download do /assistir-video. Sem rede: so as escolhas que nao dependem do yt-dlp rodar.
// Rodar: node --test baixar-video.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { opcoesJs, FORMATO, ehYoutube } from './baixar-video.mjs'
// funcao nova pelo namespace: se faltar, so o teste dela reprova, o arquivo segue carregando
import * as baixar from './baixar-video.mjs'

test('yt-dlp novo ganha o Node como motor de JavaScript; o velho segue sem a opcao, pra nao quebrar', () => {
  assert.deepEqual(opcoesJs('  --js-runtimes RUNTIMES  JavaScript runtimes to enable'), ['--js-runtimes', 'node'])
  assert.deepEqual(opcoesJs('usage: yt-dlp [OPTIONS] URL'), [])
  assert.deepEqual(opcoesJs(undefined), [])
})

// 5.25, tarefa 3c: o yt-dlp --help sem prazo pendurava a tela se o yt-dlp travasse
test('ajudaDoYtDlp pergunta ao yt-dlp com prazo de 20 s e, no estouro, segue sem a opcao', () => {
  const vistos = []
  const ajuda = baixar.ajudaDoYtDlp((prog, args, op) => { vistos.push([prog, args, op.timeout]); return { stdout: '--js-runtimes RUNTIMES' } })
  assert.deepEqual(vistos, [['yt-dlp', ['--help'], 20000]])
  assert.deepEqual(opcoesJs(ajuda), ['--js-runtimes', 'node'], 'canario: a ajuda volta inteira')
  // estouro: o spawnSync volta com error e sem stdout
  assert.deepEqual(opcoesJs(baixar.ajudaDoYtDlp(() => ({ error: Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' }), stdout: null }))), [])
})

test('o formato pede ate 720p primeiro e so cai pro melhor disponivel se nao houver', () => {
  const opcoes = FORMATO.split('/')
  assert.ok(opcoes.slice(0, 3).every(o => o.includes('[height<=720]')))
  assert.equal(opcoes.at(-1), 'bv*+ba/b'.split('/').at(-1))
})

test('ehYoutube reconhece os enderecos do YouTube e recusa os outros', () => {
  assert.equal(ehYoutube('https://youtu.be/abc'), true)
  assert.equal(ehYoutube('https://www.youtube.com/watch?v=abc'), true)
  assert.equal(ehYoutube('https://www.tiktok.com/@x/video/1'), false)
  assert.equal(ehYoutube('nao e url'), false)
})

test('recado sem download aponta o Chrome dedicado quando a /pauta existe, e o caminho manual sem ela', () => {
  const com = baixar.recadoSemDownload(true)
  assert.match(com, /yt-dlp não conseguiu/)
  assert.match(com, /pauta\/scripts\/coletar\.mjs --perfil/)
  assert.doesNotMatch(com, /ainda não incluído/)
  const sem = baixar.recadoSemDownload(false)
  assert.match(sem, /yt-dlp não conseguiu/)
  assert.match(sem, /baixe o vídeo manualmente/)
  assert.doesNotMatch(sem, /coletar\.mjs/)
})

test('o roadmap avancado e citado pelo caminho da pasta-mae, que o projeto do aluno nao tem docs/', async () => {
  const { readFileSync } = await import('node:fs')
  const fonte = readFileSync(new URL('./baixar-video.mjs', import.meta.url), 'utf8')
  const citacoes = [...fonte.matchAll(/[./]*docs\/roadmap-avancado\.md/g)].map(m => m[0])
  assert.ok(citacoes.length >= 2, `canario: comentario e recado citam o roadmap (${citacoes.length})`)
  assert.deepEqual(citacoes.filter(c => c !== '../docs/roadmap-avancado.md'), [])
  assert.match(baixar.recadoSemDownload(false), /\.\.\/docs\/roadmap-avancado\.md, na pasta-mãe/)
})
