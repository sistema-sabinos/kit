// Testes do passo pago. Nenhuma chamada de verdade: o Gemini entra falso. Rodar: node --test ver.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { escolherFlash, descobrirModelo, precoDoDia, estimar, validarFicha, fichaDaFoto, verFotos, chamarGemini, PRECOS } from './ver.mjs'

test('escolhe o Flash estavel mais novo, por numero e nao por texto', () => {
  const ids = ['gemini-3.8-flash-preview', 'gemini-3.7-flash', 'gemini-3.10-flash-image', 'gemini-3.6-flash', 'gemini-9-pro', 'gemini-3.7-flash-lite', 'text-embedding-004']
  assert.equal(escolherFlash(ids), 'gemini-3.7-flash')
  assert.equal(escolherFlash(['gemini-10-flash', 'gemini-9-flash']), 'gemini-10-flash')
  assert.equal(escolherFlash(['gemini-3.7-pro']), null)
})

test('descobrir modelo le a lista da API e explica chave recusada', async () => {
  const lista = { models: [{ name: 'models/gemini-3.7-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['embedContent'] }] }
  assert.equal(await descobrirModelo('k', { buscar: async () => ({ ok: true, json: async () => lista }) }), 'gemini-3.7-flash')
  await assert.rejects(descobrirModelo('k', { buscar: async () => ({ ok: false, status: 403 }) }), /GEMINI_API_KEY/)
})

test('preco do dia troca depois do fim da promocao', () => {
  assert.equal(precoDoDia('gemini-3.8-flash', '2026-12-31').entrada, 0.75)
  assert.deepEqual([precoDoDia('gemini-3.8-flash', '2027-01-01').entrada, precoDoDia('gemini-3.8-flash', '2027-01-01').saida], [1.5, 7.5])
  assert.equal(precoDoDia('gemini-3.6-flash', '2027-06-01').saida, 7.5)
  assert.equal(precoDoDia('gemini-4-flash', '2026-10-04'), null)
})

test('estimativa: 160 fotos custam US$ 0,82 hoje e 1,64 em janeiro', () => {
  // (1540 x 0,75 + 1060 x 3,75) / 1e6 = 0,00513 por foto; x 160 = 0,8208
  const hoje = estimar({ fotos: 160, modelo: 'gemini-3.8-flash', hoje: '2026-10-04' })
  assert.equal(hoje.usd, 0.82)
  assert.equal(hoje.minutos, 11)
  // (1540 x 1,5 + 1060 x 7,5) / 1e6 = 0,01026 por foto; x 160 = 1,6416
  assert.equal(estimar({ fotos: 160, modelo: 'gemini-3.8-flash', hoje: '2027-01-02' }).usd, 1.64)
})

test('modelo fora da tabela recusa estimar e manda conferir o preco', () => {
  const r = estimar({ fotos: 10, modelo: 'gemini-4-flash', hoje: '2026-10-04' })
  assert.equal(r.usd, undefined)
  assert.match(r.recusado, /tabela de preco/)
  assert.ok(Object.values(PRECOS).every(p => p.conferido_em))
})

test('ficha valida e invalida', () => {
  assert.deepEqual(validarFicha({ papel: 'gancho', confianca: 0.8, evidencia: 'produto inteiro em fundo branco' }), [])
  assert.equal(validarFicha({ papel: 'inventado', confianca: 2, evidencia: '' }).length, 3)
})

const resposta = (texto, uso = { promptTokenCount: 1000, candidatesTokenCount: 200, thoughtsTokenCount: 800 }) => ({ candidates: [{ content: { parts: [{ text: texto }] } }], usageMetadata: uso })
const opcoes = (chamar, linhas) => ({ modelo: 'gemini-3.8-flash', chave: 'k', preco: precoDoDia('gemini-3.8-flash', '2026-10-04'), chamar, registrar: l => linhas.push(l), ler: () => Buffer.from('foto') })

test('a linha de custo e gravada antes do parse, e conta o raciocinio como saida', async () => {
  const linhas = []
  await assert.rejects(fichaDaFoto('a.jpg', { id: 'MLB1', ordem: 1, total: 1 }, { ...opcoes(async () => resposta('isto nao e json'), linhas), reserva: 'r1' }))
  assert.equal(linhas.length, 1)
  // 1000 x 0,75 + 1000 x 3,75 = 4500 por milhao
  assert.deepEqual(linhas[0], { servico: 'gemini-visao', modelo: 'gemini-3.8-flash', tokens_entrada: 1000, tokens_saida: 1000, usd: 0.0045, contexto: 'engenharia-reversa MLB1', area: 'ml', reserva: 'r1' })
})

// D56: sem registrar injetado, a linha vai pelo registrador comum do conectar, com fuso, area e reserva
test('o registrador padrao e o comum: linha com em local, area ml, tokens e reserva', async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'ver-'))
  try {
    const op = { ...opcoes(async () => resposta(JSON.stringify({ papel: 'gancho', confianca: 1, evidencia: 'x' }), { promptTokenCount: 1000, candidatesTokenCount: 1000 }), []), reserva: 'r9', raiz }
    delete op.registrar
    await fichaDaFoto('a.jpg', { id: 'MLB1', ordem: 1, total: 1 }, op)
    const l = JSON.parse(readFileSync(join(raiz, 'dados', 'custos.jsonl'), 'utf8'))
    assert.match(l.em, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/)
    assert.deepEqual([l.servico, l.area, l.reserva, l.tokens_entrada, l.tokens_saida, l.modelo], ['gemini-visao', 'ml', 'r9', 1000, 1000, 'gemini-3.8-flash'])
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('registrador que devolve falso vira erro fatal: a rodada para de pagar', async () => {
  let chamadas = 0
  const chamar = async () => { chamadas++; return resposta(JSON.stringify({ papel: 'gancho', confianca: 1, evidencia: 'x' })) }
  const op = { ...opcoes(chamar, []), registrar: () => { throw new Error('nao consegui gravar dados/custos.jsonl') } }
  await assert.rejects(verFotos([{ id: 'A', titulo: 't', fotos: ['1.jpg', '2.jpg'] }], op), e => e.fatal === true)
  assert.equal(chamadas, 1)
})

// Revisao do plano da 5.42, achado 2: 200 de corpo quebrado pode ter sido cobrado e nao vira linha.
// Comum do bloco, achado 1: a primeira incerta para a rodada, pra nao seguir pagando sem saber.
test('resposta 200 com corpo quebrado conta como incerta, nao grava linha e para a rodada', async () => {
  const linhas = []
  let chamadas = 0
  const buscar = async () => { chamadas++; return { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected end of JSON input') } } }
  const chamar = (args) => chamarGemini({ ...args, buscar })
  const r = await verFotos([{ id: 'A', titulo: 't', fotos: ['1.jpg', '2.jpg'] }, { id: 'B', titulo: 't', fotos: ['3.jpg'] }], opcoes(chamar, linhas))
  assert.equal(r.incertas, 1)
  assert.equal(chamadas, 1)
  assert.equal(r.parou, true)
  assert.equal(linhas.length, 0)
  assert.match(r.fichas.A[0].erro, /pode ter sido cobrada/)
  // canario: 500 de verdade e erro comum, nao incerta
  const r2 = await verFotos([{ id: 'A', titulo: 't', fotos: ['1.jpg'] }], opcoes((args) => chamarGemini({ ...args, buscar: async () => ({ ok: false, status: 500, text: async () => 'x' }) }), linhas))
  assert.equal(r2.incertas, 0)
})

test('chamada recusada pelo Gemini nao grava custo; a ordem vem do laco', async () => {
  const linhas = []
  await assert.rejects(fichaDaFoto('a.jpg', { ordem: 1, total: 1 }, opcoes(async () => { throw new Error('Gemini 403') }, linhas)))
  assert.equal(linhas.length, 0)
  const f = await fichaDaFoto('a.jpg', { ordem: 2, total: 3 }, opcoes(async () => resposta(JSON.stringify({ papel: 'gancho', confianca: 0.9, evidencia: 'x', ordem: 7 })), linhas))
  assert.equal(f.ordem, 2)
  assert.equal(f.valida, true)
})

test('verFotos segue quando uma foto falha', async () => {
  let n = 0
  const chamar = async () => { n++; if (n === 2) throw new Error('Gemini 500'); return resposta(JSON.stringify({ papel: 'gancho', confianca: 1, evidencia: 'x' })) }
  const r = await verFotos([{ id: 'A', titulo: 't', fotos: ['1.jpg', '2.jpg', '3.jpg'] }], opcoes(chamar, []))
  assert.deepEqual(r.fichas.A.map(f => f.valida), [true, false, true])
  assert.match(r.fichas.A[1].erro, /500/)
  assert.equal(r.parou, false)
})

// Regressoes da revisao final de 2026-10-04.
test('custo que nao pode ser anotado para a rodada: nunca segue pagando sem anotar', async () => {
  let chamadas = 0
  const chamar = async () => { chamadas++; return resposta(JSON.stringify({ papel: 'gancho', confianca: 1, evidencia: 'x' })) }
  const op = { ...opcoes(chamar, []), registrar: () => { throw new Error('EBUSY') } }
  await assert.rejects(verFotos([{ id: 'A', titulo: 't', fotos: ['1.jpg', '2.jpg', '3.jpg'] }], op), /custo .*nao foi anotad/)
  assert.equal(chamadas, 1)
})

test('o gasto real tem teto: para quando a soma anotada chega no limite', async () => {
  let chamadas = 0
  const chamar = async () => { chamadas++; return resposta(JSON.stringify({ papel: 'gancho', confianca: 1, evidencia: 'x' })) }
  // cada chamada custa 0,0045 (1000 de entrada e 1000 de saida); limite 0,009 cabe 2
  const r = await verFotos([{ id: 'A', titulo: 't', fotos: ['1.jpg', '2.jpg', '3.jpg', '4.jpg'] }], opcoes(chamar, []), { limite: 0.009 })
  assert.equal(chamadas, 2)
  assert.equal(r.parou, true)
  assert.equal(r.gasto_usd, 0.009)
  assert.equal(r.fichas.A.length, 2)
})

// Comum do bloco da 5.42, achado 2: antes de cada foto, so segue se cabe mais uma pelo custo da mais cara
test('o teto confere antes da chamada: foto mais cara que a media nao deixa a seguinte passar do teto', async () => {
  let chamadas = 0
  // 1000 de entrada e 2000 de saida: 0,00825 por foto, acima da media medida (0,00513)
  const chamar = async () => { chamadas++; return resposta(JSON.stringify({ papel: 'gancho', confianca: 1, evidencia: 'x' }), { promptTokenCount: 1000, candidatesTokenCount: 2000 }) }
  const r = await verFotos([{ id: 'A', titulo: 't', fotos: ['1.jpg', '2.jpg', '3.jpg'] }], opcoes(chamar, []), { limite: 0.012 })
  assert.equal(chamadas, 1)
  assert.equal(r.parou, true)
  assert.ok(r.gasto_usd <= 0.012)
  // a primeira foto ja nao cabe pela media medida: nenhuma chamada
  let nenhuma = 0
  const r2 = await verFotos([{ id: 'A', titulo: 't', fotos: ['1.jpg'] }], opcoes(async () => { nenhuma++; return resposta('{}') }, []), { limite: 0.005 })
  assert.equal(nenhuma, 0)
  assert.equal(r2.parou, true)
})
