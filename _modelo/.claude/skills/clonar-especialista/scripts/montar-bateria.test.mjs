// Testes do montar-bateria.mjs: do gabarito da rodada sai so o arquivo de perguntas, sem nada
// do gabarito dentro. Rodar: node --test montar-bateria.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { montarBateria, lerGabarito, textoPerguntas } from './montar-bateria.mjs'

const SCRIPT = fileURLToPath(new URL('./montar-bateria.mjs', import.meta.url))
const CRLF = String.fromCharCode(13, 10)
const LF = String.fromCharCode(10)

// gabarito no formato fixo: cada pergunta com a linha "pergunta:" e duas linhas de gabarito
function gabarito({ prova = 10, isca = 5, constancia = 2, constanciaB = 1, mudanca = 1, negocio = 3 } = {}) {
  const partes = [
    ...Array(prova).fill('prova'), ...Array(isca).fill('isca'), ...Array(constancia).fill('constancia'),
    ...Array(constanciaB).fill('constancia-b'), ...Array(mudanca).fill('mudanca'), ...Array(negocio).fill('negocio'),
  ]
  const linhas = ['# Gabarito, rodada 1', '']
  partes.forEach((parte, i) => {
    const n = i + 1
    linhas.push(`## P${n} ${parte}`, `pergunta: O que fazer na situacao ${n} do cliente que some?`,
      `trecho real: "segredo do gabarito numero ${n}, so o juiz ve" (§${n})`,
      `posicao esperada: insistir com prova social na pergunta ${n}`, '')
  })
  return linhas
}
const livres = linhas => linhas.filter(l => l.startsWith('trecho real:') || l.startsWith('posicao esperada:'))

function pasta(linhas, rodada = 1, eol = CRLF) {
  const dir = mkdtempSync(join(tmpdir(), 'montar-bateria-'))
  mkdirSync(join(dir, 'prova'))
  if (linhas) writeFileSync(join(dir, 'prova', `gabarito-v${rodada}.md`), linhas.join(eol))
  return dir
}
const perguntas = (dir, rodada = 1) => join(dir, 'prova', `perguntas-v${rodada}.md`)

test('gabarito completo gera so perguntas, na mesma numeracao, sem nenhum trecho do gabarito', () => {
  const g = gabarito()
  const dir = pasta(g)
  try {
    const r = montarBateria(dir, 1)
    assert.ok(r.linhas.length > 0, 'saida veio vazia')
    assert.equal(r.codigo, 0, r.linhas.join('\n'))
    assert.equal(r.linhas[0], 'perguntas: 22 em prova/perguntas-v1.md')
    const saida = readFileSync(perguntas(dir), 'utf8')
    // canario: a busca acha o que sabidamente esta la
    assert.ok(saida.includes('O que fazer na situacao 22 do cliente que some?'), 'canario: pergunta 22')
    assert.ok(g.join(CRLF).includes(livres(g)[0]), 'canario: linha livre no gabarito')
    assert.equal(livres(g).length, 44)
    for (const l of livres(g)) assert.ok(!saida.includes(l), `vazou: ${l}`)
    assert.doesNotMatch(saida, /segredo|posicao esperada|trecho real|pergunta:/)
    const cabs = saida.split(/\r?\n/).filter(l => l.startsWith('## '))
    assert.equal(cabs.length, 22)
    assert.equal(cabs[0], '## P1 prova')
    assert.equal(cabs[21], '## P22 negocio')
    // a funcao pura tambem nao leva gabarito (sem depender da conferencia de vazamento)
    const texto = textoPerguntas(lerGabarito(g.join(LF)).perguntas, LF)
    for (const l of livres(g)) assert.ok(!texto.includes(l), `vazou no texto: ${l}`)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('gabarito em CRLF tambem gera so perguntas, em CRLF', () => {
  const g = gabarito()
  const dir = pasta(g, 2, CRLF)
  try {
    const r = montarBateria(dir, 2)
    assert.equal(r.codigo, 0, r.linhas.join('\n'))
    const saida = readFileSync(perguntas(dir, 2), 'utf8')
    const lfs = (saida.match(/\n/g) || []).length
    assert.ok(lfs > 0 && lfs === saida.split(CRLF).length - 1, 'LF solto ou CR sobrando na saida')
    assert.ok(!saida.split(/\r?\n/).some(l => l.endsWith(String.fromCharCode(13))), 'CR no fim da linha')
    assert.ok(saida.includes(`## P1 prova${CRLF}O que fazer na situacao 1 do cliente que some?`), 'cabecalho e pergunta')
    for (const l of livres(g)) assert.ok(!saida.includes(l), `vazou: ${l}`)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('recusa gabarito torto ou curto e nao grava perguntas', () => {
  const tirar = (g, re) => g.filter(l => !re.test(l))
  const casos = [
    [null, /nao achei .*gabarito-v1\.md/],
    [tirar(gabarito(), /^pergunta: O que fazer na situacao 3 /), /P3 sem a linha "pergunta:"/],
    [gabarito().map(l => l === '## P4 prova' ? '## P3 prova' : l), /numero repetido: P3/],
    [gabarito().map(l => l === '## P2 prova' ? '## P2 provas' : l), /cabecalho fora do formato/],
    [gabarito({ prova: 9 }), /prova: 9 \(minimo 10\)/],
    [gabarito({ isca: 4 }), /isca: 4 \(minimo 5\)/],
    [gabarito({ constancia: 1 }), /constancia: 1 \(minimo 2\)/],
    [gabarito({ constanciaB: 0 }), /constancia-b: 0 \(minimo 1\)/],
    [gabarito({ negocio: 2 }), /negocio: 2 \(minimo 3\)/],
  ]
  for (const [g, re] of casos) {
    const dir = pasta(g)
    try {
      const r = montarBateria(dir, 1)
      assert.ok(r.linhas.length > 0, 'saida veio vazia')
      assert.equal(r.codigo, 1, String(re))
      assert.ok(r.linhas.some(l => re.test(l)), `${re}: ${r.linhas.join(' | ')}`)
      assert.ok(!existsSync(perguntas(dir)), `gravou perguntas mesmo recusando (${re})`)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  }
})

test('gabarito escrito na linha da pergunta: vazou gabarito, arquivo apagado', () => {
  const g = gabarito().map(l => l.startsWith('pergunta: O que fazer na situacao 5 ')
    ? `${l} posicao esperada: insistir com prova social na pergunta 5` : l)
  const dir = pasta(g)
  try {
    const r = montarBateria(dir, 1)
    assert.ok(r.linhas.length > 0, 'saida veio vazia')
    assert.equal(r.codigo, 1, r.linhas.join('\n'))
    assert.match(r.linhas[0], /^vazou gabarito/)
    assert.ok(!existsSync(perguntas(dir)), 'arquivo com gabarito ficou')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('valor da resposta colado na linha da pergunta sem o rotulo: vazou gabarito, arquivo apagado', () => {
  const g = gabarito().map(l => l.startsWith('pergunta: O que fazer na situacao 5 ')
    ? `${l} Dica: insistir com prova social na pergunta 5` : l)
  const dir = pasta(g)
  try {
    assert.ok(!g.some(l => l.startsWith('pergunta:') && l.includes('posicao esperada')), 'canario: sem o rotulo na pergunta')
    const r = montarBateria(dir, 1)
    assert.ok(r.linhas.length > 0, 'saida veio vazia')
    assert.equal(r.codigo, 1, r.linhas.join('\n'))
    assert.match(r.linhas[0], /^vazou gabarito/)
    assert.ok(!existsSync(perguntas(dir)), 'arquivo com gabarito ficou')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('vazamento curto no mesmo bloco: valor de 6+ caracteres na pergunta, sem acento nem maiuscula, vazou gabarito', () => {
  // isca com resposta curta: "posicao esperada: recusar." e a pergunta entrega "Dica: Recusár."
  const g = gabarito().flatMap(l => l.startsWith('pergunta: O que fazer na situacao 12 ')
    ? [`${l} Dica: Recusár.`, 'posicao esperada: recusar.'] : [l])
  const dir = pasta(g)
  try {
    assert.ok(g.includes('posicao esperada: recusar.'), 'canario: linha curta no gabarito')
    assert.ok('recusar.'.length < 20, 'canario: abaixo do corte global de 20')
    const r = montarBateria(dir, 1)
    assert.ok(r.linhas.length > 0, 'saida veio vazia')
    assert.equal(r.codigo, 1, r.linhas.join('\n'))
    assert.match(r.linhas[0], /^vazou gabarito: uma linha do gabarito da P12 /)
    assert.ok(!existsSync(perguntas(dir)), 'arquivo com gabarito ficou')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('valor curto de outro bloco ou com menos de 6 caracteres nao conta como vazamento', () => {
  // "recusar." no gabarito da P12 e na pergunta da P13; "sim." curto na propria P14
  const g = gabarito().flatMap(l => {
    if (l.startsWith('pergunta: O que fazer na situacao 12 ')) return [l, 'posicao esperada: recusar.']
    if (l.startsWith('pergunta: O que fazer na situacao 13 ')) return [`${l} Dica: recusar.`]
    if (l.startsWith('pergunta: O que fazer na situacao 14 ')) return [`${l} sim.`, 'o que passa: sim.']
    return [l]
  })
  const dir = pasta(g)
  try {
    const r = montarBateria(dir, 1)
    assert.equal(r.codigo, 0, r.linhas.join('\n'))
    assert.ok(readFileSync(perguntas(dir), 'utf8').includes('Dica: recusar.'), 'canario: pergunta da P13 gravada')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('CLI: rodada que nao e inteiro de 1 em diante recusa; rodada certa grava so perguntas e responde no stdout', () => {
  const g = gabarito()
  const dir = pasta(g, 3)
  try {
    for (const v of ['0', 'x', '1.5', '']) {
      const r = spawnSync(process.execPath, [SCRIPT, dir, v], { encoding: 'utf8' })
      assert.equal(r.status, 1, `rodada "${v}"`)
      assert.match(r.stdout, /<rodada>/)
    }
    assert.ok(!existsSync(perguntas(dir, 3)))
    const r = spawnSync(process.execPath, [SCRIPT, dir, '3'], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.equal(r.stdout.trim(), 'perguntas: 22 em prova/perguntas-v3.md')
    const saida = readFileSync(perguntas(dir, 3), 'utf8')
    assert.ok(saida.includes('## P22 negocio'), 'canario: ultima pergunta')
    for (const l of livres(g)) assert.ok(!saida.includes(l), `vazou: ${l}`)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
