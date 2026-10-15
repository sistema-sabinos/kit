// Testes do instalar.mjs com uma casa temporaria: nunca toca no ~/.claude de verdade.
// Rodar: node --test instalar.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { instalar, faltando, carimbar } from './instalar.mjs'
import { SECOES, RODAPE } from './medir-persona.mjs'
import { carimboPersona } from './lib/carimbo.mjs'
import { ehMestra } from './lib/pasta-mae.mjs'
import { montarBateria } from './montar-bateria.mjs'

const SCRIPT = fileURLToPath(new URL('./instalar.mjs', import.meta.url))
const CRLF = String.fromCharCode(13, 10)
const skill = (a, cita = '(fonte 1, p. 1)') => ['---', `name: ${a}`, 'description: Conselheiro.', 'origem: clonar-especialista', '---',
  ...SECOES.flatMap(s => [s, `Regra ${cita}.`]), RODAPE].join(CRLF)
const agente = a => ['---', `name: ${a}`, 'description: Delega.', 'tools: Read', `skills: [${a}]`, 'origem: clonar-especialista', '---', 'x'].join(CRLF)

// inventario com a coleta completa (as condicoes do medir-coleta ok): 8 feitas e 1 de prova
const fonte = (n, camada, etiqueta, status, novos) => `| ${n} | ${camada} | x | en | 2020 | fonte ${n} | ${etiqueta} | ${status} | 10 | ${novos} |`
const INVENTARIO = ['pessoa: Fulano de Tal', 'nome-no-agente: nao', '',
  '| N | camada | tipo | idioma | ano | fonte | etiqueta | status | itens | novos |', '|---|---|---|---|---|---|---|---|---|---|',
  fonte(1, 'a', 'artifact', 'feita', 40), fonte(2, 'a', 'artifact', 'feita', 30), fonte(3, 'b', 'verbatim', 'feita', 20),
  fonte(4, 'b', 'verbatim', 'feita', 10), fonte(5, 'c', 'verbatim', 'feita', 3), fonte(6, 'd', 'impression', 'feita', 1),
  fonte(7, 'c', 'verbatim', 'feita', 0), fonte(8, 'e', 'impression', 'feita', 0), fonte(9, 'b', 'verbatim', 'prova', 0)]

// bateria rodada de verdade: gabarito no formato fixo, perguntas geradas pelo montar-bateria e
// respostas salvas, os tres com o -v<rodada>
const PARTES = [...Array(10).fill('prova'), ...Array(5).fill('isca'), 'constancia', 'constancia', 'constancia-b', 'mudanca', 'negocio', 'negocio', 'negocio']
const bateria = (mestra, n) => {
  const g = ['# Gabarito', '', ...PARTES.flatMap((parte, i) => [`## P${i + 1} ${parte}`, `pergunta: O que fazer na situacao ${i + 1}?`, `posicao esperada: segredo numero ${i + 1} do gabarito, so o juiz ve`, ''])]
  writeFileSync(join(mestra, 'prova', `gabarito-v${n}.md`), g.join(CRLF))
  assert.equal(montarBateria(mestra, n).codigo, 0)
  writeFileSync(join(mestra, 'prova', `respostas-v${n}.md`), ['## P1 prova', 'Insistir com prova social.', ''].join(CRLF))
}

// copia-mestra que passa em tudo: persona medida, citacao batendo com a ficha, sem o nome real,
// coleta completa e teste de fidelidade da rodada 1 rodado, liberado e carimbado
function cenario(apelido = 'mentor-x') {
  // a raiz e a pasta-mae (com _modelo e VERSAO): so a copia-mestra em <pasta-mae>/agentes instala
  const raiz = mkdtempSync(join(tmpdir(), 'instalar-'))
  mkdirSync(join(raiz, '_modelo'))
  writeFileSync(join(raiz, 'VERSAO'), '5.15')
  const mestra = join(raiz, 'agentes', apelido)
  mkdirSync(join(mestra, 'fichas'), { recursive: true })
  mkdirSync(join(mestra, 'prova'))
  writeFileSync(join(mestra, 'SKILL.md'), skill(apelido))
  writeFileSync(join(mestra, 'agente.md'), agente(apelido))
  writeFileSync(join(mestra, 'fichas', '01-livro.md'), '[p. 1] x')
  writeFileSync(join(mestra, 'inventario.md'), INVENTARIO.join(CRLF))
  bateria(mestra, 1)
  writeFileSync(join(mestra, 'prova', 'resultado.md'), ['# Resultado', '', '## Rodada 1, 2026-10-12', 'Volta: 0', 'Liberado: sim', ''].join(CRLF))
  assert.equal(carimbar(mestra).codigo, 0)
  const casa = join(raiz, 'casa')
  mkdirSync(casa)
  return { raiz, mestra, casa, apelido }
}

// rodada nova da bateria: arquivos -v<n> e bloco "## Rodada <n>" acrescentado no fim do placar
const rodadaNova = (c, n, liberado) => {
  bateria(c.mestra, n)
  const f = join(c.mestra, 'prova', 'resultado.md')
  writeFileSync(f, readFileSync(f, 'utf8') + ['', `## Rodada ${n}, 2026-10-13`, 'Volta: 0', `Liberado: ${liberado}`, ''].join(CRLF))
}
const mexerRegra = c => {
  const f = join(c.mestra, 'SKILL.md')
  writeFileSync(f, readFileSync(f, 'utf8').replace('Regra (fonte 1, p. 1).', 'Regra mudada (fonte 1, p. 1).'))
}
const RECUSA_RECARIMBO = /^nao carimbei: persona mudou depois do carimbo desta rodada: rode uma rodada nova da bateria$/
const RODADA_TRAVADA = 'nao carimbei: esta rodada teve o carimbo recusado: rode uma rodada nova da bateria'
// recusa depois de achar "Liberado: sim": o placar so ganha a linha "Carimbo recusado:" no fim
const soRecusa = (antes, depois) => {
  assert.ok(depois.startsWith(antes), 'mexeu no placar alem da linha de recusa')
  assert.match(depois.slice(antes.length), /^Carimbo recusado: [^\r\n]+\r\n$/)
}
const fichaDeProva = c => writeFileSync(join(c.mestra, 'fichas', '09-entrevista.md'), '[p. 1] x')

test('instala skill, fichas e agente, sem levar inventario', () => {
  const c = cenario()
  try {
    const r = instalar(c.mestra, c.casa)
    assert.ok(r.linhas.length > 0, 'saida veio vazia')
    assert.equal(r.codigo, 0, r.linhas.join('\n'))
    assert.ok(existsSync(join(c.casa, '.claude', 'skills', 'mentor-x', 'SKILL.md')))
    assert.ok(existsSync(join(c.casa, '.claude', 'skills', 'mentor-x', 'fichas', '01-livro.md')))
    assert.ok(existsSync(join(c.casa, '.claude', 'agents', 'mentor-x.md')))
    assert.ok(!existsSync(join(c.casa, '.claude', 'skills', 'mentor-x', 'inventario.md')), 'inventario tem o nome real e fica so na copia-mestra')
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('copia fora de agentes/ e conselheiros/ nao instala; a de agentes/ e a de conselheiros/ instalam', () => {
  const c = cenario()
  const skillInstalada = join(c.casa, '.claude', 'skills', c.apelido, 'SKILL.md')
  try {
    const copia = join(c.raiz, 'copia-teste', c.apelido)
    cpSync(c.mestra, copia, { recursive: true })
    // agentes/ fora de qualquer pasta-mae tambem nao e copia-mestra
    const solta = join(c.raiz, 'outra', 'agentes', c.apelido)
    cpSync(c.mestra, solta, { recursive: true })
    for (const p of [copia, solta]) {
      const r = instalar(p, c.casa)
      assert.ok(r.linhas.length > 0, 'saida veio vazia')
      assert.equal(r.codigo, 1, `instalou a copia ${p}: ${r.linhas.join(' | ')}`)
      assert.equal(existsSync(skillInstalada), false, `a copia ${p} chegou no ~/.claude`)
      assert.match(r.linhas.join('\n'), /so a copia-mestra/)
    }
    // canario: a mesma persona na copia-mestra instala
    const ok = instalar(c.mestra, c.casa)
    assert.equal(ok.codigo, 0, ok.linhas.join('\n'))
    assert.ok(existsSync(skillInstalada), 'canario: a copia-mestra instalou')
    // fora da pasta-mae, a copia-mestra mora em ~/.claude/conselheiros/<apelido>
    rmSync(join(c.casa, '.claude', 'skills'), { recursive: true, force: true })
    const cons = join(c.casa, '.claude', 'conselheiros', c.apelido)
    cpSync(c.mestra, cons, { recursive: true })
    assert.equal(instalar(cons, c.casa).codigo, 0, 'a copia-mestra de ~/.claude/conselheiros nao instalou')
    assert.ok(existsSync(skillInstalada))
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('AGENTES com maiuscula na pasta-mae e copia-mestra no Windows', { skip: process.platform !== 'win32' && 'so no Windows AGENTES e agentes sao a mesma pasta' }, () => {
  const raiz = mkdtempSync(join(tmpdir(), 'instalar-'))
  try {
    mkdirSync(join(raiz, '_modelo'))
    writeFileSync(join(raiz, 'VERSAO'), '5.15')
    const casa = join(raiz, 'casa')
    // canario: a grafia de sempre passa e pasta fora de agentes/ nao passa
    assert.equal(ehMestra(join(raiz, 'agentes', 'mentor-x'), casa), true)
    assert.equal(ehMestra(join(raiz, 'copia-teste', 'mentor-x'), casa), false)
    assert.equal(ehMestra(join(raiz, 'AGENTES', 'mentor-x'), casa), true, 'AGENTES no Windows e a mesma pasta agentes')
  } finally { rmSync(raiz, { recursive: true, force: true }) }
})

test('reinstalar troca a versao anterior e tira ficha que sumiu', () => {
  const c = cenario()
  try {
    assert.equal(instalar(c.mestra, c.casa).codigo, 0)
    rmSync(join(c.mestra, 'fichas', '01-livro.md'))
    writeFileSync(join(c.mestra, 'fichas', '02-post.md'), '[§1] y')
    writeFileSync(join(c.mestra, 'SKILL.md'), skill('mentor-x', '(fonte 2, §1)'))
    rodadaNova(c, 2, 'sim')
    assert.equal(carimbar(c.mestra).codigo, 0)
    const r = instalar(c.mestra, c.casa)
    assert.equal(r.codigo, 0, r.linhas.join('\n'))
    const fichas = join(c.casa, '.claude', 'skills', 'mentor-x', 'fichas')
    assert.ok(existsSync(join(fichas, '02-post.md')))
    assert.ok(!existsSync(join(fichas, '01-livro.md')))
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('skill ou agente feito a mao no destino: nada instalado, nada tocado', () => {
  for (const alvo of ['skill', 'agente']) {
    const c = cenario()
    try {
      const destSkill = join(c.casa, '.claude', 'skills', 'mentor-x')
      const destAgente = join(c.casa, '.claude', 'agents', 'mentor-x.md')
      // so o alvo existe no destino: o outro lado nao pode ser o motivo da recusa
      if (alvo === 'skill') {
        mkdirSync(destSkill, { recursive: true })
        writeFileSync(join(destSkill, 'SKILL.md'), 'meu, feito a mao')
      } else {
        mkdirSync(join(c.casa, '.claude', 'agents'), { recursive: true })
        writeFileSync(destAgente, 'meu, feito a mao')
      }
      const r = instalar(c.mestra, c.casa)
      assert.equal(r.codigo, 1, alvo)
      assert.match(r.linhas[0], /nao foi feito por esta skill/)
      if (alvo === 'skill') assert.equal(readFileSync(join(destSkill, 'SKILL.md'), 'utf8'), 'meu, feito a mao')
      else { assert.equal(readFileSync(destAgente, 'utf8'), 'meu, feito a mao'); assert.ok(!existsSync(destSkill), 'skill instalada antes da recusa') }
    } finally { rmSync(c.raiz, { recursive: true, force: true }) }
  }
})

test('persona reprovada no medir-persona nao instala', () => {
  const c = cenario()
  try {
    writeFileSync(join(c.mestra, 'SKILL.md'), skill('mentor-x').replace(RODAPE, ''))
    const r = instalar(c.mestra, c.casa)
    assert.equal(r.codigo, 1)
    assert.match(r.linhas[0], /persona reprovada/)
    assert.ok(!existsSync(join(c.casa, '.claude')))
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('sem teste liberado, citacao quebrada ou nome na persona: nada instalado', () => {
  // Liberado so vale no comeco da linha: o modelo do placar sem preencher e o "Liberado" no meio
  // da linha nao liberam, mesmo com o carimbo certo
  const trocarLiberado = (c, por) => {
    const f = join(c.mestra, 'prova', 'resultado.md')
    writeFileSync(f, readFileSync(f, 'utf8').replace(/^Liberado:.*$/m, por))
  }
  const casos = [
    [c => writeFileSync(join(c.mestra, 'prova', 'resultado.md'), 'Volta: 2. Liberado: não'), /Liberado: sim/],
    [c => trocarLiberado(c, 'Liberado: <sim | sim, com aviso do aluno | não>'), /Liberado: sim/],
    [c => trocarLiberado(c, 'Volta: 0. Liberado: sim'), /Liberado: sim/],
    [c => rmSync(join(c.mestra, 'prova'), { recursive: true }), /Liberado: sim/],
    [c => writeFileSync(join(c.mestra, 'SKILL.md'), skill('mentor-x', '(fonte 9, p. 1)')), /citacoes reprovadas/],
    [c => writeFileSync(join(c.mestra, 'agente.md'), `${agente('mentor-x')}${CRLF}Como o Fulano ensina`), /nome real na persona/],
  ]
  for (const [estragar, re] of casos) {
    const c = cenario()
    try {
      estragar(c)
      const r = instalar(c.mestra, c.casa)
      assert.ok(r.linhas.length > 0, 'saida veio vazia')
      assert.equal(r.codigo, 1, String(re))
      assert.match(r.linhas[0], re)
      assert.ok(!existsSync(join(c.casa, '.claude')), 'instalou antes de recusar')
    } finally { rmSync(c.raiz, { recursive: true, force: true }) }
  }
})

test('persona mexida depois do carimbo: recarimbar recusa e nada instalado', () => {
  const c = cenario()
  try {
    mexerRegra(c)
    const r = instalar(c.mestra, c.casa)
    assert.ok(r.linhas.length > 0, 'saida veio vazia')
    assert.equal(r.codigo, 1, r.linhas.join('\n'))
    assert.match(r.linhas[0], /persona mudou depois do teste de fidelidade \(carimbo diferente\), nada instalado: volte ao Passo 8 \(travas\) e refaca o Passo 9$/)
    assert.ok(!existsSync(join(c.casa, '.claude')), 'instalou antes de recusar')
    const f = join(c.mestra, 'prova', 'resultado.md')
    const antes = readFileSync(f, 'utf8')
    const k = carimbar(c.mestra)
    assert.equal(k.codigo, 1, k.linhas.join('\n'))
    assert.match(k.linhas[0], RECUSA_RECARIMBO)
    soRecusa(antes, readFileSync(f, 'utf8'))
    const r2 = instalar(c.mestra, c.casa)
    assert.equal(r2.codigo, 1, r2.linhas.join('\n'))
    assert.ok(!existsSync(join(c.casa, '.claude')), 'instalou a persona mexida')
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('persona mexida depois do carimbo, rodada 1 com cabecalho e sem rodada nova: carimbar e instalar recusam', () => {
  const c = cenario()
  try {
    const f = join(c.mestra, 'prova', 'resultado.md')
    writeFileSync(f, ['## Rodada 1, 2026-10-12', 'Volta: 0', 'Liberado: sim', ''].join(CRLF))
    assert.equal(carimbar(c.mestra).codigo, 0)
    assert.equal(instalar(c.mestra, c.casa).codigo, 0, 'canario: rodada 1 carimbada instala')
    mexerRegra(c)
    const antes = readFileSync(f, 'utf8')
    const k = carimbar(c.mestra)
    assert.equal(k.codigo, 1, k.linhas.join('\n'))
    assert.match(k.linhas[0], RECUSA_RECARIMBO)
    soRecusa(antes, readFileSync(f, 'utf8'))
    const i = instalar(c.mestra, c.casa)
    assert.equal(i.codigo, 1, i.linhas.join('\n'))
    assert.match(i.linhas[0], /carimbo diferente/)
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('rodada nova liberada depois da mudanca: carimbo vai no ultimo bloco e instala', () => {
  const c = cenario()
  try {
    const f = join(c.mestra, 'prova', 'resultado.md')
    const carimboVelho = /^Persona:.*$/m.exec(readFileSync(f, 'utf8'))[0]
    mexerRegra(c)
    rodadaNova(c, 2, 'sim')
    // Persona da rodada 1 nao vale pra rodada 2
    const semCarimbo = instalar(c.mestra, c.casa)
    assert.equal(semCarimbo.codigo, 1, semCarimbo.linhas.join('\n'))
    assert.match(semCarimbo.linhas[0], /sem carimbo/)
    const k = carimbar(c.mestra)
    assert.equal(k.codigo, 0, k.linhas.join('\n'))
    const texto = readFileSync(f, 'utf8')
    const [primeiro, ultimo] = texto.split('## Rodada 2')
    assert.ok(primeiro.includes(carimboVelho), 'carimbo da rodada 1 foi trocado')
    assert.equal((ultimo.match(/^Persona: [0-9a-f]{64}/gm) || []).length, 1, 'carimbo nao caiu no ultimo bloco')
    const i = instalar(c.mestra, c.casa)
    assert.equal(i.codigo, 0, i.linhas.join('\n'))
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('placar escrito a mao so com Liberado sim, sem ## Rodada: carimbar recusa e nada instalado', () => {
  const c = cenario()
  try {
    const f = join(c.mestra, 'prova', 'resultado.md')
    writeFileSync(f, ['Volta: 0', 'Liberado: sim', ''].join(CRLF))
    const antes = readFileSync(f, 'utf8')
    const k = carimbar(c.mestra)
    assert.equal(k.codigo, 1, k.linhas.join('\n'))
    assert.deepEqual(k.linhas, ['nao carimbei: placar sem "## Rodada <n>": rode a bateria pelo referencias/bateria.md'])
    soRecusa(antes, readFileSync(f, 'utf8'))
    assert.equal(instalar(c.mestra, c.casa).codigo, 1)
    assert.ok(!existsSync(join(c.casa, '.claude')), 'instalou placar escrito a mao')
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('falta arquivo da rodada (gabarito, perguntas ou respostas, ausente ou vazio): carimbar recusa', () => {
  const casos = [['gabarito-v2.md', 'apagar'], ['perguntas-v2.md', 'apagar'], ['respostas-v2.md', 'apagar'], ['respostas-v2.md', 'esvaziar']]
  for (const [arq, como] of casos) {
    const c = cenario()
    try {
      rodadaNova(c, 2, 'sim')
      const alvo = join(c.mestra, 'prova', arq)
      if (como === 'apagar') rmSync(alvo)
      else writeFileSync(alvo, CRLF)
      const f = join(c.mestra, 'prova', 'resultado.md')
      const antes = readFileSync(f, 'utf8')
      const k = carimbar(c.mestra)
      assert.equal(k.codigo, 1, `${arq} ${como}: ${k.linhas.join('\n')}`)
      assert.deepEqual(k.linhas, [`nao carimbei: falta prova/${arq} da rodada 2`])
      soRecusa(antes, readFileSync(f, 'utf8'))
      assert.equal(instalar(c.mestra, c.casa).codigo, 1)
    } finally { rmSync(c.raiz, { recursive: true, force: true }) }
  }
})

test('perguntas editadas a mao: carimbar recusa (CRLF trocado por LF ainda bate)', () => {
  const c = cenario()
  try {
    rodadaNova(c, 2, 'sim')
    const p = join(c.mestra, 'prova', 'perguntas-v2.md')
    const geradas = readFileSync(p, 'utf8')
    assert.ok(geradas.includes(CRLF), 'canario: perguntas geradas em CRLF')
    writeFileSync(p, geradas.split(CRLF).join('\n'))
    const ok = carimbar(c.mestra)
    assert.equal(ok.codigo, 0, ok.linhas.join('\n'))
    rodadaNova(c, 3, 'sim')
    const p3 = join(c.mestra, 'prova', 'perguntas-v3.md')
    writeFileSync(p3, readFileSync(p3, 'utf8').replace('O que fazer na situacao 1?', 'O que fazer na situacao 1? Dica: prova social.'))
    const f = join(c.mestra, 'prova', 'resultado.md')
    const antes = readFileSync(f, 'utf8')
    const k = carimbar(c.mestra)
    assert.equal(k.codigo, 1, k.linhas.join('\n'))
    assert.deepEqual(k.linhas, ['nao carimbei: perguntas da rodada 3 nao batem com o gabarito'])
    soRecusa(antes, readFileSync(f, 'utf8'))
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('resultado liberado sem a linha Persona: sem carimbo, nada instalado', () => {
  const c = cenario()
  try {
    writeFileSync(join(c.mestra, 'prova', 'resultado.md'), ['Volta: 0', 'Liberado: sim'].join(CRLF))
    const r = instalar(c.mestra, c.casa)
    assert.equal(r.codigo, 1, r.linhas.join('\n'))
    assert.match(r.linhas[0], /persona mudou depois do teste de fidelidade \(sem carimbo\), nada instalado: volte ao Passo 8 \(travas\) e refaca o Passo 9$/)
    assert.ok(!existsSync(join(c.casa, '.claude')))
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('carimbar recusa placar sem Liberado sim (resultado intacto) e persona que nao passa nas travas (so a linha de recusa)', () => {
  const trocarLiberado = (c, por) => {
    const f = join(c.mestra, 'prova', 'resultado.md')
    writeFileSync(f, readFileSync(f, 'utf8').replace(/^Liberado:.*$/m, por))
  }
  const casos = [
    [c => trocarLiberado(c, 'Liberado: não'), /^nao carimbei: placar sem "Liberado: sim"/],
    [c => trocarLiberado(c, 'Volta: 0. Liberado: sim'), /^nao carimbei: placar sem "Liberado: sim"/],
    [c => writeFileSync(join(c.mestra, 'SKILL.md'), skill('mentor-x', '(fonte 9, p. 1)')), /^nao carimbei: citacoes reprovadas/],
    [c => writeFileSync(join(c.mestra, 'SKILL.md'), skill('mentor-x').replace(RODAPE, '')), /^nao carimbei: persona reprovada no medir-persona/],
    [c => writeFileSync(join(c.mestra, 'agente.md'), `${agente('mentor-x')}${CRLF}Como o Fulano ensina`), /^nao carimbei: nome real na persona/],
    // quarta trava: coleta com uma fala espontanea so (fonte 4 vira camada c), sem aceite do aluno
    [c => writeFileSync(join(c.mestra, 'inventario.md'), INVENTARIO.join(CRLF).replace('| 4 | b |', '| 4 | c |')), /^nao carimbei: coleta reprovada no medir-coleta, volte ao Passo 8/],
    // ficha escrita de fonte de prova (fonte 9): a prova deixou de ser cega
    [fichaDeProva, /^nao carimbei: coleta reprovada no medir-coleta, volte ao Passo 8/],
  ]
  for (const [estragar, re] of casos) {
    const c = cenario()
    try {
      estragar(c)
      const f = join(c.mestra, 'prova', 'resultado.md')
      const antes = readFileSync(f, 'utf8')
      const r = carimbar(c.mestra)
      assert.ok(r.linhas.length > 0, 'saida veio vazia')
      assert.equal(r.codigo, 1, String(re))
      assert.match(r.linhas[0], re)
      if (/placar sem/.test(String(re))) assert.equal(readFileSync(f, 'utf8'), antes, 'mexeu no placar sem Liberado sim')
      else soRecusa(antes, readFileSync(f, 'utf8'))
    } finally { rmSync(c.raiz, { recursive: true, force: true }) }
  }
})

test('carimbo recusado trava a rodada: apagar a ficha de prova nao libera carimbar nem instalar', () => {
  const c = cenario()
  try {
    const f = join(c.mestra, 'prova', 'resultado.md')
    fichaDeProva(c)
    const antes = readFileSync(f, 'utf8')
    const k = carimbar(c.mestra)
    assert.equal(k.codigo, 1, k.linhas.join('\n'))
    assert.match(k.linhas[0], /^nao carimbei: coleta reprovada no medir-coleta/)
    soRecusa(antes, readFileSync(f, 'utf8'))
    rmSync(join(c.mestra, 'fichas', '09-entrevista.md'))
    // canario: sem a ficha, o carimbo da rodada bate de novo, so a linha de recusa segura
    assert.equal(/^Persona: ([0-9a-f]{64})/m.exec(readFileSync(f, 'utf8'))[1], carimboPersona(c.mestra))
    const travado = readFileSync(f, 'utf8')
    const k2 = carimbar(c.mestra)
    assert.equal(k2.codigo, 1, k2.linhas.join('\n'))
    assert.deepEqual(k2.linhas, [RODADA_TRAVADA])
    assert.equal(readFileSync(f, 'utf8'), travado, 'carimbar mexeu no placar da rodada travada')
    const i = instalar(c.mestra, c.casa)
    assert.equal(i.codigo, 1, i.linhas.join('\n'))
    assert.deepEqual(i.linhas, ['esta rodada teve o carimbo recusado, nada instalado: rode uma rodada nova da bateria'])
    assert.ok(!existsSync(join(c.casa, '.claude')), 'instalou a rodada travada')
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('carimbo recusado: rodada nova liberada carimba e instala', () => {
  const c = cenario()
  try {
    fichaDeProva(c)
    assert.equal(carimbar(c.mestra).codigo, 1)
    assert.match(readFileSync(join(c.mestra, 'prova', 'resultado.md'), 'utf8'), /^Carimbo recusado: /m, 'canario: rodada 1 travada')
    rmSync(join(c.mestra, 'fichas', '09-entrevista.md'))
    rodadaNova(c, 2, 'sim')
    const k = carimbar(c.mestra)
    assert.equal(k.codigo, 0, k.linhas.join('\n'))
    const i = instalar(c.mestra, c.casa)
    assert.equal(i.codigo, 0, i.linhas.join('\n'))
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('recusa por Liberado nao ou sem resultado nao grava a linha Carimbo recusado', () => {
  const c = cenario()
  try {
    const f = join(c.mestra, 'prova', 'resultado.md')
    writeFileSync(f, readFileSync(f, 'utf8').replace(/^Liberado:.*$/m, 'Liberado: não'))
    fichaDeProva(c)
    const antes = readFileSync(f, 'utf8')
    const k = carimbar(c.mestra)
    assert.equal(k.codigo, 1, k.linhas.join('\n'))
    assert.match(k.linhas[0], /^nao carimbei: placar sem "Liberado: sim"/)
    assert.equal(readFileSync(f, 'utf8'), antes)
    rmSync(join(c.mestra, 'prova'), { recursive: true })
    assert.equal(carimbar(c.mestra).codigo, 1)
    assert.ok(!existsSync(f), 'criou resultado.md ao recusar')
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('linha Carimbo recusado preserva o CRLF do placar, com ou sem quebra no fim', () => {
  for (const fim of ['', CRLF]) {
    const c = cenario()
    try {
      const f = join(c.mestra, 'prova', 'resultado.md')
      writeFileSync(f, ['Volta: 0', 'Liberado: sim'].join(CRLF) + fim)
      fichaDeProva(c)
      assert.equal(carimbar(c.mestra).codigo, 1)
      const texto = readFileSync(f, 'utf8')
      assert.match(texto, /^Carimbo recusado: [^\r\n]+\r\n$/m)
      const lfs = (texto.match(/\n/g) || []).length
      const crlfs = texto.split(CRLF).length - 1
      assert.ok(lfs === 3 && lfs === crlfs, 'LF solto num arquivo CRLF')
    } finally { rmSync(c.raiz, { recursive: true, force: true }) }
  }
})

test('placar que acumula rodadas: vale a ultima linha Liberado, nem carimba nem instala com rodada nova reprovada', () => {
  const c = cenario()
  try {
    const f = join(c.mestra, 'prova', 'resultado.md')
    // rodada 1 liberada e carimbada (cenario); rodada 2 acrescentada no fim, reprovada
    writeFileSync(f, readFileSync(f, 'utf8') + ['', '## Rodada 2, 2026-10-13', 'Volta: 1', 'Liberado: não', ''].join(CRLF))
    assert.equal((readFileSync(f, 'utf8').match(/^Liberado:/gm) || []).length, 2, 'canario: duas linhas Liberado')
    const antes = readFileSync(f, 'utf8')
    const r = carimbar(c.mestra)
    assert.equal(r.codigo, 1, r.linhas.join('\n'))
    assert.match(r.linhas[0], /^nao carimbei: placar sem "Liberado: sim"/)
    assert.equal(readFileSync(f, 'utf8'), antes, 'carimbou mesmo recusando')
    const i = instalar(c.mestra, c.casa)
    assert.equal(i.codigo, 1, i.linhas.join('\n'))
    assert.match(i.linhas[0], /Liberado: sim/)
    assert.ok(!existsSync(join(c.casa, '.claude')), 'instalou com a ultima rodada reprovada')
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('CLI --carimbar grava a linha Persona, preserva CRLF e recusa sem resultado', () => {
  const c = cenario()
  try {
    const f = join(c.mestra, 'prova', 'resultado.md')
    writeFileSync(f, ['## Rodada 1, 2026-10-12', 'Volta: 0', 'Liberado: sim'].join(CRLF))
    const r = spawnSync(process.execPath, [SCRIPT, '--carimbar', c.mestra], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /^carimbo: [0-9a-f]{64}/)
    const texto = readFileSync(f, 'utf8')
    assert.equal((texto.match(/^Persona:/gm) || []).length, 1)
    const lfs = (texto.match(/\n/g) || []).length
    const crlfs = texto.split(CRLF).length - 1
    assert.ok(lfs > 0 && lfs === crlfs, 'LF solto num arquivo CRLF')
    assert.equal(instalar(c.mestra, c.casa).codigo, 0)
    rmSync(join(c.mestra, 'prova'), { recursive: true })
    const sem = spawnSync(process.execPath, [SCRIPT, '--carimbar', c.mestra], { encoding: 'utf8' })
    assert.equal(sem.status, 1)
    // recusa do --carimbar no mesmo canal das recusas do instalar: stdout
    assert.match(sem.stdout, /^nao carimbei: /)
    assert.equal(sem.stderr, '')
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('faltando lista so o que nao esta inteiro na casa', () => {
  const c = cenario('mentor-x')
  try {
    const outra = join(c.raiz, 'agentes', 'mentor-y')
    mkdirSync(outra)
    writeFileSync(join(outra, 'SKILL.md'), skill('mentor-y'))
    mkdirSync(join(c.raiz, 'agentes', 'pasta-sem-skill'))
    assert.deepEqual(faltando(join(c.raiz, 'agentes'), c.casa), ['mentor-x', 'mentor-y'])
    assert.equal(instalar(c.mestra, c.casa).codigo, 0)
    assert.deepEqual(faltando(join(c.raiz, 'agentes'), c.casa), ['mentor-y'])
    assert.deepEqual(faltando(join(c.raiz, 'nao-existe'), c.casa), [])
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})

test('CLI instala na casa do HOME e do USERPROFILE e o --faltando responde nenhum', () => {
  const c = cenario()
  try {
    const env = { ...process.env, HOME: c.casa, USERPROFILE: c.casa }
    const r = spawnSync(process.execPath, [SCRIPT, c.mestra], { encoding: 'utf8', env })
    assert.ok(r.stdout.length > 0, 'saida veio vazia')
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.ok(existsSync(join(c.casa, '.claude', 'agents', 'mentor-x.md')))
    const f = spawnSync(process.execPath, [SCRIPT, '--faltando', join(c.raiz, 'agentes')], { encoding: 'utf8', env })
    assert.equal(f.status, 0)
    assert.equal(f.stdout.trim(), 'nenhum')
  } finally { rmSync(c.raiz, { recursive: true, force: true }) }
})
