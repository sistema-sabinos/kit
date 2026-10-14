// Testes do carimbo da auditoria. Projeto de mentira numa pasta temporaria, apagada no finally.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { carimbar } from './carimbar-auditoria.mjs'
import { auditoriaEmDia } from './lib/pipeline.mjs'

function projeto(veredito = 'aprovado') {
  const raiz = mkdtempSync(join(tmpdir(), 'carimbo-'))
  const pasta = join(raiz, 'dados', 'pipeline', 'x')
  mkdirSync(pasta, { recursive: true })
  for (const n of ['copy', 'imagens', 'decisao']) writeFileSync(join(pasta, `${n}.json`), JSON.stringify({ n }))
  writeFileSync(join(pasta, 'auditoria.json'), JSON.stringify({ veredito, em: '2026-10-08' }))
  return { raiz, pasta, auditoria: () => JSON.parse(readFileSync(join(pasta, 'auditoria.json'), 'utf8')) }
}

test('carimbar grava o hash dos tres arquivos e a auditoria fica em dia ate um deles mudar', () => {
  const p = projeto()
  try {
    assert.deepEqual(auditoriaEmDia(p.pasta, p.auditoria()), ['sem carimbo'])
    const c = carimbar('x', p.raiz)
    assert.deepEqual(Object.keys(c), ['copy', 'imagens', 'decisao', 'fotos'])
    assert.match(c.copy, /^[0-9a-f]{64}$/)
    assert.equal(p.auditoria().veredito, 'aprovado', 'o resto da auditoria fica')
    assert.deepEqual(auditoriaEmDia(p.pasta, p.auditoria()), [])
    writeFileSync(join(p.pasta, 'imagens.json'), JSON.stringify({ n: 'outra' }))
    assert.deepEqual(auditoriaEmDia(p.pasta, p.auditoria()), ['imagens.json'])
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})

test('carimbar poe etapa_atual auditado no status.json, sem rebaixar quem ja foi cadastrado', () => {
  const p = projeto()
  const q = projeto()
  const status = s => JSON.parse(readFileSync(join(s.pasta, 'status.json'), 'utf8'))
  try {
    writeFileSync(join(p.pasta, 'status.json'), JSON.stringify({ slug: 'x', etapa_atual: 'copy' }))
    writeFileSync(join(q.pasta, 'status.json'), JSON.stringify({ slug: 'x', etapa_atual: 'cadastrado' }))
    assert.match(carimbar('x', p.raiz).copy, /^[0-9a-f]{64}$/, 'canario: o carimbo rodou')
    assert.equal(status(p).etapa_atual, 'auditado')
    assert.equal(status(p).slug, 'x', 'o resto do status fica')
    carimbar('x', q.raiz)
    assert.equal(status(q).etapa_atual, 'cadastrado')
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
    rmSync(q.raiz, { recursive: true, force: true })
  }
})

test('carimbar recusa auditoria reprovada e slug sem auditoria', () => {
  const p = projeto('reprovado')
  try {
    assert.throws(() => carimbar('x', p.raiz), /so se carimba auditoria aprovada/)
    assert.throws(() => carimbar('nao-existe', p.raiz), /nao existe/)
    assert.throws(() => carimbar('', p.raiz), /uso/)
  } finally {
    rmSync(p.raiz, { recursive: true, force: true })
  }
})
