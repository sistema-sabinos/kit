import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { carregar, pontuar, juntar, mostrar, notasVisuais, principal } from './paridade.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(AQUI, 'paridade.mjs')
const MODELO = join(AQUI, '..', '..', 'app-estudar', 'funcoes.csv')
const BOM = String.fromCharCode(0xfeff)

const MATRIZ = `funcao,area,prioridade,original,minha,notas
Escolher um horario,agendamento,obrigatoria,sim,sim,
Confirmacao por e-mail,agendamento,obrigatoria,sim,parcial,sem arquivo de agenda ainda
Link pra remarcar,agendamento,obrigatoria,sim,nao,
Rodizio entre a equipe,equipe,importante,sim,nao,
Perguntas extras no agendamento,agendamento,importante,sim,sim,
Botao no site do salao,divulgacao,desejavel,sim,nao,
Loja de parceiros,integracoes,desejavel,sim,pular,a rede de parceiros e deles
Lembrete por WhatsApp,avisos,importante,nao,sim,o pedido que mais aparece nas avaliacoes
`

function comPasta(fn) {
  const d = mkdtempSync(join(tmpdir(), 'paridade-'))
  try {
    return fn(d)
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
}

function gravar(d, nome, texto) {
  const p = join(d, nome)
  writeFileSync(p, texto)
  return p
}

function rodar(argv) {
  const saida = []
  const erro = []
  const codigo = principal(argv, s => saida.push(s), s => erro.push(s))
  return { codigo, saida: saida.join('\n'), erro: erro.join('\n') }
}

test('nota ponderada: peso 3, 2 e 1, parcial vale metade', () => comPasta(d => {
  const r = pontuar(carregar(gravar(d, 'f.csv', MATRIZ)))
  // pesos contados: 3+3+3+2+2+1 = 14; ganho: 3 + 1,5 + 0 + 0 + 2 + 0 = 6,5
  assert.equal(r.nota_funcoes, Math.round(1000 * 6.5 / 14) / 10)
  assert.equal(r.nota_funcoes, 46.4)
  assert.equal(r.contadas, 6)
  assert.deepEqual([r.obrigatorias_feitas, r.obrigatorias_total], [1, 3])
}))

test('pular e funcao so sua ficam fora da nota e aparecem listadas', () => comPasta(d => {
  const r = pontuar(carregar(gravar(d, 'f.csv', MATRIZ)))
  assert.deepEqual(r.fora.map(m => m.funcao), ['Loja de parceiros'])
  assert.deepEqual(r.extras.map(m => m.funcao), ['Lembrete por WhatsApp'])
}))

test('faltando sai na ordem de construir', () => comPasta(d => {
  const r = pontuar(carregar(gravar(d, 'f.csv', MATRIZ)))
  const ordem = r.faltando.map(m => m.funcao)
  assert.equal(ordem[0], 'Link pra remarcar')
  assert.equal(ordem[1], 'Confirmacao por e-mail')
  assert.equal(ordem[2], 'Rodizio entre a equipe')
  assert.equal(ordem.at(-1), 'Botao no site do salao')
  assert.equal(r.faltando[0].prioridade, 'obrigatoria')
}))

test('area mais fraca primeiro', () => comPasta(d => {
  const r = pontuar(carregar(gravar(d, 'f.csv', MATRIZ)))
  assert.equal(r.por_area[0].nota, 0)
  assert.ok(['equipe', 'divulgacao'].includes(r.por_area[0].area))
}))

test('relatorio diz que ainda nao da pra lancar', () => comPasta(d => {
  const r = juntar(pontuar(carregar(gravar(d, 'f.csv', MATRIZ))), [])
  const texto = mostrar(r)
  assert.match(texto, /Ainda nao da pra lancar: 2 obrigatorias/)
  assert.match(texto, /a rede de parceiros e deles/)
}))

test('telas entram com 20% na nota geral', () => comPasta(d => {
  const v1 = gravar(d, 'a.json', JSON.stringify({ nota: 80, modo: 'layout', arquivos: { minha: 'app/telas-minhas/S01.png' } }))
  const v2 = gravar(d, 'b.json', JSON.stringify({ score: 60, mode: 'layout' }))
  const r = juntar(pontuar(carregar(gravar(d, 'f.csv', MATRIZ))), notasVisuais([v1, v2]))
  assert.equal(r.nota_telas, 70)
  assert.equal(r.nota_geral, Math.round(10 * (0.8 * r.nota_funcoes + 14)) / 10)
  assert.equal(r.visual[0].arquivo, 'app/telas-minhas/S01.png')
}))

test('--visual aceita a pasta inteira e le so os .json, em ordem', () => comPasta(d => {
  const pasta = join(d, 'comparacoes')
  mkdirSync(pasta)
  gravar(pasta, 'S02.json', JSON.stringify({ nota: 60 }))
  gravar(pasta, 'S01.json', JSON.stringify({ nota: 80 }))
  gravar(pasta, 'S01.png', 'nao e json')
  const f = gravar(d, 'f.csv', MATRIZ)
  const { codigo, saida } = rodar([f, '--visual', pasta, '--json'])
  assert.equal(codigo, 0)
  const r = JSON.parse(saida)
  assert.equal(r.visual.length, 2)
  assert.equal(r.nota_telas, 70)
  assert.deepEqual(r.visual.map(v => v.nota), [80, 60])
}))

test('--visual com pasta sem .json sai 2', () => comPasta(d => {
  const pasta = join(d, 'vazia')
  mkdirSync(pasta)
  const { codigo, erro } = rodar([gravar(d, 'f.csv', MATRIZ), '--visual', pasta])
  assert.equal(codigo, 2)
  assert.match(erro, /nao tem nenhum \.json/)
}))

test('valor ruim vira problema, sem derrubar', () => comPasta(d => {
  const r = pontuar(carregar(gravar(d, 'ruim.csv', 'funcao,prioridade,minha\nCoisa,urgente,talvez\n')))
  assert.equal(r.problemas.length, 2)
  assert.equal(r.nota_funcoes, 0)
}))

test('coluna faltando sai 2', () => comPasta(d => {
  const { codigo, erro } = rodar([gravar(d, 'semcol.csv', 'funcao,area\nx,y\n')])
  assert.equal(codigo, 2)
  assert.match(erro, /nao tem a coluna "prioridade"/)
}))

test('--minimo sai 1 abaixo e 0 acima', () => comPasta(d => {
  const f = gravar(d, 'f.csv', MATRIZ)
  assert.equal(rodar([f, '--minimo', '80']).codigo, 1)
  assert.equal(rodar([f, '--minimo', '10']).codigo, 0)
}))

test('--exigir-obrigatorias sai 1 quando falta obrigatoria, mesmo sem --minimo', () => comPasta(d => {
  const f = gravar(d, 'f.csv', MATRIZ)
  const r = rodar([f, '--exigir-obrigatorias'])
  assert.ok(r.saida.length > 0)
  assert.match(r.saida, /obrigatorias 1 de 3 prontas/)
  assert.equal(r.codigo, 1)
}))

test('--exigir-obrigatorias sai 0 com todas as obrigatorias feitas', () => comPasta(d => {
  const f = gravar(d, 'p.csv', 'funcao,prioridade,original,minha\nA,obrigatoria,sim,sim\nB,obrigatoria,sim,sim\nC,importante,sim,nao\n')
  const r = rodar([f, '--exigir-obrigatorias'])
  assert.ok(r.saida.length > 0)
  assert.match(r.saida, /obrigatorias 2 de 2 prontas/)
  assert.equal(r.codigo, 0)
}))

test('sem --exigir-obrigatorias, faltando obrigatoria sai 0 como antes', () => comPasta(d => {
  const f = gravar(d, 'f.csv', MATRIZ)
  const r = rodar([f])
  assert.match(r.saida, /obrigatorias 1 de 3 prontas/)
  assert.equal(r.codigo, 0)
  const p = spawnSync(process.execPath, [SCRIPT, f, '--exigir-obrigatorias'], { encoding: 'utf8' })
  assert.ok(p.stdout.length > 0)
  assert.equal(p.status, 1)
}))

test('lista modelo da /app-estudar le sem problema', () => {
  const r = pontuar(carregar(MODELO))
  assert.ok(r.contadas > 0)
  assert.deepEqual(r.problemas, [])
})

test('CSV do Excel: ponto e virgula, BOM e CRLF', () => comPasta(d => {
  const texto = BOM + MATRIZ.replace(/,/g, ';').replace(/\n/g, '\r\n')
  const r = pontuar(carregar(gravar(d, 'excel.csv', texto)))
  assert.equal(r.nota_funcoes, 46.4)
  assert.equal(r.contadas, 6)
  assert.deepEqual(r.problemas, [])
  assert.deepEqual(r.fora.map(m => m.funcao), ['Loja de parceiros'])
}))

test('acento e maiuscula nao atrapalham coluna nem valor', () => comPasta(d => {
  const texto = 'Função;Área;Prioridade;Original;Minha;Notas\n'
    + 'Escolher horário;agendamento;Obrigatória;Sim;Sim;\n'
    + 'Remarcar;agendamento;OBRIGATÓRIA;sim;Não;\n'
    + 'Botão no site;divulgação;Desejável;sim;Parcial;\n'
    + 'Coisa só minha;avisos;importante;Não;sim;\n'
  const r = pontuar(carregar(gravar(d, 'acento.csv', texto)))
  assert.deepEqual(r.problemas, [])
  assert.equal(r.contadas, 3)
  // pesos 3+3+1 = 7; ganho 3 + 0 + 0,5 = 3,5
  assert.equal(r.nota_funcoes, 50)
  assert.deepEqual(r.extras.map(m => m.funcao), ['Coisa só minha'])
}))

test('colunas e valores em ingles tambem valem', () => comPasta(d => {
  const texto = 'feature,area,priority,original,clone,notes\nA,x,must,yes,yes,\nB,x,P1,yes,partial,\nC,x,could,no,yes,\nD,x,should,yes,skip,fora\n'
  const r = pontuar(carregar(gravar(d, 'en.csv', texto)))
  assert.deepEqual(r.problemas, [])
  // pesos 3+2 = 5; ganho 3 + 1 = 4
  assert.equal(r.nota_funcoes, 80)
  assert.deepEqual(r.extras.map(m => m.funcao), ['C'])
  assert.deepEqual(r.fora.map(m => m.funcao), ['D'])
}))

test('veredito: da pra lancar e melhor que a referencia', () => comPasta(d => {
  const pronto = 'funcao,prioridade,original,minha\nA,obrigatoria,sim,sim\nB,importante,sim,sim\n'
  const r1 = juntar(pontuar(carregar(gravar(d, 'p.csv', pronto))), [])
  assert.match(r1.veredito, /^Da pra lancar/)
  const melhor = pronto + 'C,desejavel,nao,sim\n'
  const r2 = juntar(pontuar(carregar(gravar(d, 'm.csv', melhor))), [])
  assert.match(r2.veredito, /^Melhor que a referencia/)
}))

test('funcao so sua obrigatoria sem fazer fica fora da nota e entra nas obrigatorias e no faltando', () => comPasta(d => {
  const f = gravar(d, 's.csv', 'funcao,prioridade,original,minha\nA,obrigatoria,sim,sim\nB,obrigatoria,nao,nao\n')
  const r = juntar(pontuar(carregar(f)), [])
  assert.equal(r.nota_funcoes, 100)
  assert.deepEqual([r.obrigatorias_feitas, r.obrigatorias_total], [1, 2])
  assert.deepEqual(r.faltando.map(m => m.funcao), ['B'])
  assert.match(r.veredito, /^Ainda nao da pra lancar: 1 obrigatorias/)
  assert.doesNotMatch(mostrar(r), /Melhor que a referencia/)
  const cli = rodar([f, '--exigir-obrigatorias'])
  assert.ok(cli.saida.length > 0)
  assert.equal(cli.codigo, 1)
}))

test('veredito: Melhor so com as funcoes so suas importantes feitas', () => comPasta(d => {
  const base = 'funcao,prioridade,original,minha\nA,obrigatoria,sim,sim\nX,desejavel,nao,sim\n'
  const r1 = juntar(pontuar(carregar(gravar(d, 'a.csv', base + 'C,importante,nao,parcial\n'))), [])
  assert.equal(r1.nota_funcoes, 100)
  assert.match(r1.veredito, /^Da pra lancar/)
  assert.deepEqual(r1.faltando.map(m => m.funcao), ['C'])
  const r2 = juntar(pontuar(carregar(gravar(d, 'b.csv', base + 'C,importante,nao,sim\n'))), [])
  assert.match(r2.veredito, /^Melhor que a referencia/)
}))

test('--markdown poe titulo de secao e o texto sem flag nao', () => comPasta(d => {
  const f = gravar(d, 'f.csv', MATRIZ)
  const md = rodar([f, '--markdown'])
  assert.equal(md.codigo, 0)
  assert.match(md.saida, /^## Paridade: 46,4 \/ 100/)
  const simples = rodar([f])
  assert.equal(simples.codigo, 0)
  assert.ok(simples.saida.length > 0)
  assert.match(simples.saida, /^Paridade: 46,4 \/ 100/)
  assert.doesNotMatch(simples.saida, /## /)
}))

test('arquivo que nao existe sai 2', () => comPasta(d => {
  const { codigo, erro } = rodar([join(d, 'nao-existe.csv')])
  assert.equal(codigo, 2)
  assert.match(erro, /nao achei/)
}))

test('CLI de verdade, sem nenhuma flag: sai 0 e mostra o placar', () => comPasta(d => {
  const f = gravar(d, 'f.csv', MATRIZ)
  const p = spawnSync(process.execPath, [SCRIPT, f], { encoding: 'utf8' })
  assert.equal(p.status, 0, p.stderr)
  assert.ok(p.stdout.length > 0)
  assert.match(p.stdout, /Paridade: 46,4/)
  const p2 = spawnSync(process.execPath, [SCRIPT, f, '--minimo', '80'], { encoding: 'utf8' })
  assert.equal(p2.status, 1)
}))
