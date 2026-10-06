// Testes da trava do atendimento. Rodar: node --test atendimento.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, cpSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validarCatalogo, conferir } from './atendimento.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(AQUI, 'atendimento.mjs')
const EXEMPLO = join(AQUI, '..', 'referencias', 'catalogo-exemplo.csv')

const CATALOGO = [
  'produto;tamanho;preco;prazo_dias;observacao',
  'Bolo de cenoura;1 kg;90,00;2;',
  'Bolo de cenoura;2 kg;170,00;3;cobertura de chocolate',
  'Bolo de casamento;3 andares;1.200,00;30;sinal de 50%',
  'Brigadeiro;cento;150;1;"minimo 50 unidades; sabores fixos"',
].join('\r\n')

const itens = () => {
  const r = validarCatalogo(CATALOGO)
  assert.deepEqual(r.erros, [])
  return r.itens
}

test('catalogo valido: le preco em formato brasileiro e observacao com ponto e virgula', () => {
  const i = itens()
  assert.equal(i.length, 4)
  assert.equal(i[2].preco, 120000)
  assert.equal(i[3].preco, 15000)
})

test('catalogo com defeito: coluna faltando, preco ilegivel, prazo nao inteiro e linha repetida', () => {
  assert.match(validarCatalogo('produto;preco\nbolo;10').erros[0], /faltam as colunas tamanho, prazo_dias, observacao/)
  const r = validarCatalogo([
    'produto;tamanho;preco;prazo_dias;observacao',
    'Bolo;1 kg;caro;2;',
    'Torta;;50;dois;',
    'Pudim;;30;1;',
    'pudim;;35;1;',
  ].join('\n'))
  assert.equal(r.erros.length, 3, r.erros.join(' | '))
  assert.match(r.erros.join('\n'), /linha 2: preco "caro"/)
  assert.match(r.erros.join('\n'), /linha 3: prazo_dias "dois"/)
  assert.match(r.erros.join('\n'), /linha 5: pudim  repetido/)
  assert.match(validarCatalogo('produto;tamanho;preco;prazo_dias;observacao\n').erros[0], /sem nenhum produto/)
})

test('rascunho que bate com o catalogo passa limpo', () => {
  const rascunho = 'Oi Marina! O bolo de cenoura de 2 kg sai por R$ 170,00 e fica pronto em 3 dias.\n\nOi Rui, o cento de brigadeiro é R$ 150,00, entrego amanhã.'
  assert.deepEqual(conferir(rascunho, itens()), [])
})

test('preco que nao esta no catalogo vira aviso, com o numero da resposta', () => {
  const av = conferir('Oi! O bolo de cenoura de 1 kg sai por R$ 80,00.', itens())
  assert.equal(av.length, 1)
  assert.match(av[0], /^resposta 1 .*R\$ 80,00 nao e o preco de Bolo de cenoura 1 kg \(R\$ 90,00\)/)
  assert.match(conferir('Fica R$ 80,00, tá?', itens())[0], /R\$ 80,00 nao esta no catalogo/)
})

test('prazo menor que o do produto vira aviso, e o tamanho escrito escolhe a linha certa', () => {
  const curto = conferir('O bolo de cenoura 2kg eu consigo em 2 dias.', itens())
  assert.equal(curto.length, 1)
  assert.match(curto[0], /promete "2 dias".*mas Bolo de cenoura 2 kg pede 3 dia\(s\)/)
  // 1 kg pede 2 dias: o mesmo prazo e certo pro tamanho menor (canario do filtro por tamanho)
  assert.deepEqual(conferir('O bolo de cenoura 1 kg eu consigo em 2 dias.', itens()), [])
  assert.match(conferir('Bolo de casamento? Faço pra amanhã sim!', itens())[0], /promete "amanha".*mas Bolo de casamento 3 andares pede 30/)
})

test('preco no fim da frase, com ponto final, tambem e conferido (achado da revisao)', () => {
  assert.match(conferir('O bolo de cenoura de 2 kg sai por R$ 999. Fica pronto em 3 dias.', itens())[0], /R\$ 999,00 nao e o preco/)
  assert.deepEqual(conferir('O bolo de cenoura de 2 kg sai por R$ 170. Fica pronto em 3 dias.', itens()), [])
})

test('valor ilegivel vira aviso em vez de sumir', () => {
  assert.match(conferir('Brigadeiro cento por R$ 1.2345 amanhã', itens())[0], /"R\$ 1\.2345" nao da pra ler/)
})

test('preco de outro tamanho do mesmo produto e pego (achado da revisao)', () => {
  assert.match(conferir('O bolo de cenoura de 2 kg fica R$ 90,00, pronto em 3 dias.', itens())[0], /R\$ 90,00 nao e o preco de Bolo de cenoura 2 kg \(R\$ 170,00\)/)
})

test('"pra hoje" e dia da semana viram prazo, contados a partir de hoje', () => {
  // 2026-10-06 e terca: sabado fica a 4 dias, quinta a 2, terca e o proprio dia
  assert.match(conferir('Bolo de cenoura 2 kg? Consigo pra hoje sim!', itens(), '2026-10-06')[0], /promete "pra hoje" \(0 dia/)
  assert.deepEqual(conferir('Bolo de cenoura 2 kg pra sábado, combinado.', itens(), '2026-10-06'), [])
  assert.match(conferir('Bolo de cenoura 2 kg pra quinta.', itens(), '2026-10-06')[0], /promete "quinta" \(2 dia/)
  assert.match(conferir('Bolo de cenoura 2 kg pra terça.', itens(), '2026-10-06')[0], /promete "terca" \(0 dia/)
})

test('horario de funcionamento nao e prazo (achado da segunda revisao)', () => {
  assert.deepEqual(conferir('Atendemos de segunda a sábado, das 9h às 18h.', itens(), '2026-10-06'), [])
  assert.deepEqual(conferir('Abrimos de terça-feira a domingo.', itens(), '2026-10-06'), [])
  // canario: dia solto continua sendo prazo
  assert.equal(conferir('Entrego na segunda, pode ser?', itens(), '2026-10-06').length, 1)
})

test('"12 kg" nao casa com o tamanho "2 kg" (achado da revisao)', () => {
  const cat = validarCatalogo('produto;tamanho;preco;prazo_dias;observacao\nBolo;2 kg;100;2;\nBolo;12 kg;500;7;').itens
  assert.match(conferir('Bolo de 12 kg em 3 dias', cat)[0], /Bolo 12 kg pede 7/)
  // o preco do de 2 kg dado pro de 12 kg: so o limite de palavra no tamanho pega
  assert.match(conferir('Bolo de 12 kg por R$ 100,00', cat)[0], /R\$ 100,00 nao e o preco de Bolo 12 kg \(R\$ 500,00\)/)
  assert.deepEqual(conferir('Bolo de 2kg em 2 dias por R$ 100,00', cat), [])
})

test('prazo sem produto citado tambem pede conferencia', () => {
  const av = conferir('Consigo entregar em 1 dia, pode ser?', itens())
  assert.equal(av.length, 1)
  assert.match(av[0], /sem citar produto do catalogo/)
})

test('acento e maiuscula nao escondem o produto', () => {
  assert.match(conferir('BOLO DE CENOURA de 2 KG pra amanhã', itens())[0], /pede 3/)
  const comAcento = validarCatalogo('produto;tamanho;preco;prazo_dias;observacao\nPão de mel;dúzia;60;4;').itens
  assert.match(conferir('pao de mel duzia pra amanha', comAcento)[0], /Pão de mel dúzia pede 4/)
})

test('cada resposta e conferida separada: o prazo de uma nao vale pra outra', () => {
  const r = 'Bolo de cenoura 2 kg em 3 dias.\n\nBrigadeiro amanhã.'
  assert.deepEqual(conferir(r, itens()), [])
  const errado = 'Bolo de cenoura 2 kg e brigadeiro amanhã.'
  assert.equal(conferir(errado, itens()).length, 1)
})

test('o catalogo de exemplo que vai no kit e valido', () => {
  const r = validarCatalogo(readFileSync(EXEMPLO, 'utf8'))
  assert.deepEqual(r.erros, [])
  assert.ok(r.itens.length >= 3)
})

test('como o aluno roda: de dentro do projeto, sem --catalogo, acha dados/catalogo.csv e le o rascunho', () => {
  const proj = mkdtempSync(join(tmpdir(), 'proj-'))
  try {
    for (const s of ['atendimento', 'caixa']) cpSync(join(AQUI, '..', '..', s), join(proj, '.claude', 'skills', s), { recursive: true })
    mkdirSync(join(proj, 'dados', 'atendimento'), { recursive: true })
    writeFileSync(join(proj, 'dados', 'catalogo.csv'), CATALOGO)
    writeFileSync(join(proj, 'dados', 'atendimento', 'rascunho.md'), 'Bolo de cenoura 1 kg por R$ 85,00.')
    const r = spawnSync(process.execPath, ['.claude/skills/atendimento/scripts/atendimento.mjs', 'conferir', 'dados/atendimento/rascunho.md'], { cwd: proj, encoding: 'utf8' })
    assert.equal(r.status, 1, r.stderr)
    assert.match(r.stdout, /R\$ 85,00 nao e o preco de Bolo de cenoura 1 kg/)
  } finally {
    rmSync(proj, { recursive: true, force: true })
  }
})

test('linha de comando: conferir sai 1 com aviso e 0 limpo; catalogo faltando sai 2 com recado', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atend-'))
  try {
    const cat = join(dir, 'catalogo.csv')
    const ras = join(dir, 'rascunho.md')
    writeFileSync(cat, CATALOGO)
    writeFileSync(ras, 'Bolo de cenoura 1 kg por R$ 85,00.')
    const ruim = spawnSync(process.execPath, [SCRIPT, 'conferir', ras, '--catalogo', cat], { encoding: 'utf8' })
    assert.equal(ruim.status, 1)
    assert.match(ruim.stdout, /1 ponto\(s\) pra pessoa decidir/)
    writeFileSync(ras, 'Bolo de cenoura 1 kg por R$ 90,00.')
    const bom = spawnSync(process.execPath, [SCRIPT, 'conferir', ras, '--catalogo', cat], { encoding: 'utf8' })
    assert.equal(bom.status, 0)
    assert.equal(bom.stdout.trim(), 'tudo bate com o catalogo')
    const sem = spawnSync(process.execPath, [SCRIPT, 'validar', '--catalogo', join(dir, 'nao.csv')], { encoding: 'utf8' })
    assert.equal(sem.status, 2)
    assert.match(sem.stderr, /monte ele antes de responder preco/)
    writeFileSync(cat, 'produto;tamanho;preco;prazo_dias;observacao\nBolo;;x;1;')
    const quebrado = spawnSync(process.execPath, [SCRIPT, 'validar', '--catalogo', cat], { encoding: 'utf8' })
    assert.equal(quebrado.status, 1)
    assert.match(quebrado.stdout, /catalogo tem problema/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
