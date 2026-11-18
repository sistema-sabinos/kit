// 5.57: com "primeira-pessoa: sim" no inventario o conselheiro fala como a pessoa, so no chat
// com quem montou. Cobra: o Papel ainda diz que e IA e a saida ainda proibe autoria da pessoa
// (medir-persona), a bateria pede 6 iscas (montar-bateria e o carimbar) e ligar a opcao depois
// do teste muda o carimbo, sem mudar o carimbo de quem nao liga.
// Rodar: node --test primeira-pessoa.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { medirPersona, SECOES, RODAPE, CONFERENCIA, FRASE_IA, FRASE_AUTORIA } from './medir-persona.mjs'
import { lerGabarito, minimos, montarBateria } from './montar-bateria.mjs'
import { carimboPersona } from './lib/carimbo.mjs'
import { opcoesDoInventario } from './lib/inventario.mjs'

const CRLF = String.fromCharCode(13, 10)
const INV = op => ['# Inventario', 'pessoa: José de Souza', ...op, ''].join(CRLF)
const COM = INV(['nome-no-agente: sim', 'primeira-pessoa: sim'])
const SEM = INV(['nome-no-agente: sim'])

const corpo = (sec, apelido) => {
  if (sec === '## Papel') return `Falo como a pessoa. ${FRASE_IA} e digo a verdade quando perguntam a serio.`
  if (sec === '## Regras de saída') return `- ${FRASE_AUTORIA}: post, anuncio ou depoimento, nunca.`
  if (sec === '## Como respondo') return `7. Rodo node .claude/skills/aprender-curso/scripts/conferir-citacoes.mjs ~/.claude/skills/${apelido} ${CONFERENCIA} r.md`
  return 'texto'
}
const skill = (apelido, troca = s => s) => troca(['---', `name: ${apelido}`, 'description: Conselheiro.', 'origem: clonar-especialista', '---',
  ...SECOES.flatMap(s => [s, corpo(s, apelido)]), RODAPE].join(CRLF))
const agente = apelido => ['---', `name: ${apelido}`, 'description: Delega.', 'tools: Read, Bash, Write', `skills: [${apelido}]`, 'origem: clonar-especialista', '---', 'corpo'].join(CRLF)

function pasta({ inventario = COM, troca } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'primeira-pessoa-'))
  const dir = join(raiz, 'souza')
  mkdirSync(join(dir, 'prova'), { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), skill('souza', troca))
  writeFileSync(join(dir, 'agente.md'), agente('souza'))
  if (inventario != null) writeFileSync(join(dir, 'inventario.md'), inventario)
  return { raiz, dir }
}

test('le as duas opcoes do inventario, so com "sim"', () => {
  assert.deepEqual(opcoesDoInventario(COM), { nomeNoAgente: true, primeiraPessoa: true })
  assert.deepEqual(opcoesDoInventario(INV(['nome-no-agente: nao', 'primeira-pessoa: nao'])), { nomeNoAgente: false, primeiraPessoa: false })
  assert.deepEqual(opcoesDoInventario(''), { nomeNoAgente: false, primeiraPessoa: false })
})

test('medir-persona: com primeira pessoa, Papel sem a frase da IA ou saida sem a regra de autoria reprova', () => {
  const casos = [
    [s => s, 0, null],
    [s => s.replace(FRASE_IA, 'Eu sou ele'), 1, /primeira pessoa sem "Sou uma IA" no Papel/],
    [s => s.replace(`- ${FRASE_AUTORIA}:`, '- Livre:'), 1, /primeira pessoa sem "Nada sai em nome da pessoa pra fora" nas Regras de saída/],
    // a frase fora da secao dela nao vale
    [s => s.replace(FRASE_IA, 'Eu sou ele').replace(RODAPE, `${FRASE_IA}. ${RODAPE}`), 1, /no Papel/],
  ]
  for (const [troca, codigo, re] of casos) {
    const p = pasta({ troca })
    try {
      const r = medirPersona(p.dir)
      assert.ok(r.linhas.length > 0, 'saida veio vazia')
      assert.equal(r.codigo, codigo, r.linhas.join('\n'))
      if (re) assert.match(r.linhas.join('\n'), re)
    } finally { rmSync(p.raiz, { recursive: true, force: true }) }
  }
})

test('medir-persona: sem primeira pessoa, Papel sem a frase segue passando (conselheiro antigo reinstala)', () => {
  const p = pasta({ inventario: SEM, troca: s => s.replace(FRASE_IA, 'Eu sou ele').replace(`- ${FRASE_AUTORIA}:`, '- Livre:') })
  try {
    const r = medirPersona(p.dir)
    assert.equal(r.codigo, 0, r.linhas.join('\n'))
  } finally { rmSync(p.raiz, { recursive: true, force: true }) }
})

const gabarito = iscas => {
  const partes = [...Array(10).fill('prova'), ...Array(iscas).fill('isca'), 'constancia', 'constancia', 'constancia-b', 'negocio', 'negocio', 'negocio']
  return ['# Gabarito', '', ...partes.flatMap((parte, i) => [`## P${i + 1} ${parte}`, `pergunta: situacao ${i + 1}?`, `o que passa: resposta numero ${i + 1} do gabarito`, ''])].join(CRLF)
}

test('montar-bateria: 5 iscas bastam sem primeira pessoa; com ela, pede 6', () => {
  assert.deepEqual(lerGabarito(gabarito(5)).problemas, [])
  assert.deepEqual(lerGabarito(gabarito(5), { iscas: 6 }).problemas, ['isca: 5 (minimo 6)'])
  const com = pasta(), sem = pasta({ inventario: SEM })
  try {
    assert.deepEqual(minimos(com.dir), { iscas: 6 })
    assert.deepEqual(minimos(sem.dir), { iscas: 5 })
    for (const p of [com, sem]) writeFileSync(join(p.dir, 'prova', 'gabarito-v1.md'), gabarito(5))
    const rc = montarBateria(com.dir, 1), rs = montarBateria(sem.dir, 1)
    assert.equal(rc.codigo, 1, rc.linhas.join('\n'))
    assert.deepEqual(rc.linhas, ['nao montei: isca: 5 (minimo 6)'])
    assert.equal(rs.codigo, 0, rs.linhas.join('\n'))
    writeFileSync(join(com.dir, 'prova', 'gabarito-v2.md'), gabarito(6))
    assert.equal(montarBateria(com.dir, 2).codigo, 0)
  } finally { for (const p of [com, sem]) rmSync(p.raiz, { recursive: true, force: true }) }
})

test('carimbo: ligar a primeira pessoa muda o carimbo; sem ela, igual a sem inventario', () => {
  const com = pasta(), sem = pasta({ inventario: SEM }), nada = pasta({ inventario: null })
  try {
    assert.notEqual(carimboPersona(com.dir), carimboPersona(sem.dir))
    assert.equal(carimboPersona(sem.dir), carimboPersona(nada.dir))
  } finally { for (const p of [com, sem, nada]) rmSync(p.raiz, { recursive: true, force: true }) }
})
