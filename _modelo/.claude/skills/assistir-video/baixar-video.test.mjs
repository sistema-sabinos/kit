// Testes do download do /assistir-video. Sem rede: so as escolhas que nao dependem do yt-dlp rodar.
// Rodar: node --test baixar-video.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { opcoesJs, FORMATO, ehYoutube } from './baixar-video.mjs'

test('yt-dlp novo ganha o Node como motor de JavaScript; o velho segue sem a opcao, pra nao quebrar', () => {
  assert.deepEqual(opcoesJs('  --js-runtimes RUNTIMES  JavaScript runtimes to enable'), ['--js-runtimes', 'node'])
  assert.deepEqual(opcoesJs('usage: yt-dlp [OPTIONS] URL'), [])
  assert.deepEqual(opcoesJs(undefined), [])
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
