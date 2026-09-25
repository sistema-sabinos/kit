// Testes da validacao da receita. Rodar: node --test receita.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validarQuando, validarReceita, carregarReceita } from './receita.mjs'

const BOA = {
  nome: 'estoque-zerado', quando: { tipo: 'diario', hora: '08:00' }, prazoMinutos: 10,
  async conferirAcesso() { return { ok: true } }, async rodar() { return { avisos: [] } },
}

test('quando aceita diario e semanal bem escritos', () => {
  assert.doesNotThrow(() => validarQuando({ tipo: 'diario', hora: '00:00' }))
  assert.doesNotThrow(() => validarQuando({ tipo: 'semanal', dia: 'sab', hora: '23:59' }))
})

test('quando recusa hora sem zero, hora 24, dia por extenso e tipo desconhecido', () => {
  assert.throws(() => validarQuando({ tipo: 'diario', hora: '8:00' }), /HH:MM/)
  assert.throws(() => validarQuando({ tipo: 'diario', hora: '24:00' }), /HH:MM/)
  assert.throws(() => validarQuando({ tipo: 'semanal', dia: 'segunda', hora: '08:00' }), /dom, seg/)
  assert.throws(() => validarQuando({ tipo: 'mensal', hora: '08:00' }), /diario/)
})

test('receita recusa nome fora do padrao, prazo fora da faixa e funcao faltando', () => {
  assert.doesNotThrow(() => validarReceita(BOA))
  assert.throws(() => validarReceita({ ...BOA, nome: 'Estoque Zerado' }), /nome da receita/)
  assert.throws(() => validarReceita({ ...BOA, prazoMinutos: 0 }), /prazoMinutos/)
  assert.throws(() => validarReceita({ ...BOA, prazoMinutos: 121 }), /prazoMinutos/)
  assert.throws(() => validarReceita({ ...BOA, rodar: undefined }), /rodar/)
  assert.throws(() => validarReceita(undefined), /export default/)
})

test('carregarReceita le o export default de um arquivo', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'receita-'))
  try {
    const caminho = join(dir, 'estoque-zerado.mjs')
    writeFileSync(caminho, "export default { nome: 'estoque-zerado', quando: { tipo: 'diario', hora: '08:00' }, prazoMinutos: 10, async conferirAcesso() { return { ok: true } }, async rodar() { return {} } }\n")
    const r = await carregarReceita(caminho)
    assert.equal(r.nome, 'estoque-zerado')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
