// Testes do passo pago. Nenhuma chamada de verdade: o Gemini entra falso. Rodar: node --test ver.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escolherFlash, descobrirModelo, precoDoDia, estimar, validarFicha, fichaDaFoto, verFotos, PRECOS } from './ver.mjs'

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
  assert.equal(precoDoDia('gemini-3.7-flash', '2026-12-31').entrada, 0.75)
  assert.deepEqual([precoDoDia('gemini-3.7-flash', '2027-01-01').entrada, precoDoDia('gemini-3.7-flash', '2027-01-01').saida], [1.5, 7.5])
  assert.equal(precoDoDia('gemini-3.5-flash', '2027-06-01').saida, 9)
  assert.equal(precoDoDia('gemini-4-flash', '2026-10-04'), null)
})

test('estimativa: 160 fotos custam US$ 0,82 hoje e 1,64 em janeiro', () => {
  // (1540 x 0,75 + 1060 x 3,75) / 1e6 = 0,00513 por foto; x 160 = 0,8208
  const hoje = estimar({ fotos: 160, modelo: 'gemini-3.7-flash', hoje: '2026-10-04' })
  assert.equal(hoje.usd, 0.82)
  assert.equal(hoje.minutos, 11)
  // (1540 x 1,5 + 1060 x 7,5) / 1e6 = 0,01026 por foto; x 160 = 1,6416
  assert.equal(estimar({ fotos: 160, modelo: 'gemini-3.7-flash', hoje: '2027-01-02' }).usd, 1.64)
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
const opcoes = (chamar, linhas) => ({ modelo: 'gemini-3.7-flash', chave: 'k', preco: precoDoDia('gemini-3.7-flash', '2026-10-04'), chamar, registrar: l => linhas.push(l), ler: () => Buffer.from('foto'), agora: () => 'T' })

test('a linha de custo e gravada antes do parse, e conta o raciocinio como saida', async () => {
  const linhas = []
  await assert.rejects(fichaDaFoto('a.jpg', { id: 'MLB1', ordem: 1, total: 1 }, opcoes(async () => resposta('isto nao e json'), linhas)))
  assert.equal(linhas.length, 1)
  // 1000 x 0,75 + 1000 x 3,75 = 4500 por milhao
  assert.deepEqual(linhas[0], { em: 'T', servico: 'gemini-visao', modelo: 'gemini-3.7-flash', tokens_entrada: 1000, tokens_saida: 1000, usd: 0.0045, contexto: 'engenharia-reversa MLB1' })
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
