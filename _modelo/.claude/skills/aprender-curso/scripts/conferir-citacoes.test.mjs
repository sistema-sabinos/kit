// Testes do conferir-citacoes.mjs rodando o CLI de verdade numa pasta temporaria.
// Rodar: node --test conferir-citacoes.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./conferir-citacoes.mjs', import.meta.url))
const CRLF = String.fromCharCode(13, 10)

function curso({ mentor, aulas = {} }) {
  const dir = mkdtempSync(join(tmpdir(), 'conferir-citacoes-'))
  if (mentor != null) writeFileSync(join(dir, 'mentor.md'), mentor)
  mkdirSync(join(dir, 'aulas'))
  for (const [nome, texto] of Object.entries(aulas)) writeFileSync(join(dir, 'aulas', nome), texto)
  return dir
}

const rodar = dir => spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8' })

test('CLI com curso valido sai 0 e conta as conferidas', () => {
  const dir = curso({
    mentor: ['# Mentor', 'Caixa primeiro (aula 1, 6:15) e (aula 2, p. 41).', 'Revisao (aula 1, 1:02:03).'].join(CRLF),
    aulas: { '01-caixa.md': `[6:15] fala${CRLF}[1:02:03] fecha`, '02-apostila.md': '[p. 41] texto' },
  })
  try {
    const r = rodar(dir)
    assert.ok(r.stdout.length > 0, 'saida veio vazia')
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.equal(r.stdout.trim(), 'conferidas: 3')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CLI com defeito sai 1 e lista cada problema', () => {
  const dir = curso({
    mentor: 'A (aula 1, 6:15), B (aula 7, 1:00), C (aula 1, 9:99).',
    aulas: { '01-caixa.md': '[6:15] fala' },
  })
  try {
    const r = rodar(dir)
    assert.ok(r.stdout.length > 0, 'saida veio vazia')
    assert.equal(r.status, 1)
    assert.deepEqual(r.stdout.trim().split(/\r?\n/), ['aula 7 nao existe em aulas/', 'aula 1 sem a marca [9:99]', 'problemas: 2'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CLI reprova citacao fora do formato mesmo com outra valida', () => {
  const dir = curso({
    mentor: 'A (aula 1, 6:15). B (aula 9, p.41). C (Aula 9, 1:00). D (aula 9, 6:15 a 7:00).',
    aulas: { '01-a.md': '[6:15] x' },
  })
  try {
    const r = rodar(dir)
    assert.ok(r.stdout.length > 0, 'saida veio vazia')
    assert.equal(r.status, 1)
    assert.deepEqual(r.stdout.trim().split(/\r?\n/), [
      'citacao fora do formato: (aula 9, p.41)',
      'citacao fora do formato: (Aula 9, 1:00)',
      'citacao fora do formato: (aula 9, 6:15 a 7:00)',
      'problemas: 3',
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('mentor sem citacao sai 1 com aviso', () => {
  const dir = curso({ mentor: 'Texto sem citacao nenhuma, so fala da aula 3.', aulas: { '03-x.md': '[1:00]' } })
  try {
    const r = rodar(dir)
    assert.equal(r.status, 1)
    assert.match(r.stdout, /nenhuma citacao/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('pasta sem mentor.md sai 1 com aviso', () => {
  const dir = curso({ aulas: { '01-x.md': '[1:00]' } })
  try {
    const r = rodar(dir)
    assert.equal(r.status, 1)
    assert.match(r.stdout, /sem mentor\.md/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

function persona({ skill, fichas = {} }) {
  const dir = mkdtempSync(join(tmpdir(), 'conferir-persona-'))
  if (skill != null) writeFileSync(join(dir, 'SKILL.md'), skill)
  mkdirSync(join(dir, 'fichas'))
  for (const [nome, texto] of Object.entries(fichas)) writeFileSync(join(dir, 'fichas', nome), texto)
  return dir
}
const rodarPersona = dir => spawnSync(process.execPath, [SCRIPT, dir, '--persona'], { encoding: 'utf8' })

test('CLI --persona confere SKILL.md contra fichas/', () => {
  const dir = persona({
    skill: ['# Persona', 'Reciprocidade (fonte 1, p. 17) e (fonte 2, §3).'].join(CRLF),
    fichas: { '01-livro.md': '[p. 17] x', '02-post.md': `[§3] y${CRLF}` },
  })
  try {
    const r = rodarPersona(dir)
    assert.ok(r.stdout.length > 0, 'saida veio vazia')
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.equal(r.stdout.trim(), 'conferidas: 2')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CLI --persona com ficha faltando sai 1', () => {
  const dir = persona({ skill: 'A (fonte 4, 2:00).', fichas: { '01-livro.md': '[2:00]' } })
  try {
    const r = rodarPersona(dir)
    assert.ok(r.stdout.length > 0, 'saida veio vazia')
    assert.equal(r.status, 1)
    assert.deepEqual(r.stdout.trim().split(/\r?\n/), ['fonte 4 nao existe em fichas/', 'problemas: 1'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// Modo --resposta: rascunho da resposta do mentor gravado em resposta.md dentro da pasta do curso
function comResposta(resposta, aulas) {
  const dir = curso({ mentor: 'x (aula 1, 1:00)', aulas })
  writeFileSync(join(dir, 'resposta.md'), resposta)
  return dir
}
const rodarResposta = (dir, ...extra) =>
  spawnSync(process.execPath, [SCRIPT, dir, '--resposta', join(dir, 'resposta.md'), ...extra], { encoding: 'utf8' })

const AULAS_CINCO = {
  '01-a.md': ['[1:00] um', '[2:00] dois', '[3:00] tres'].join(CRLF),
  '02-b.md': ['[4:00] quatro', '[5:00] cinco'].join(CRLF),
}
const RESPOSTA_CINCO = [
  'A (aula 1, 1:00).', 'B (aula 1, 2:00).', 'C (aula 1, 3:00).', 'D (aula 2, 4:00).', 'E (aula 2, 5:00).',
].join(CRLF)

test('resposta: amostra com semente sai igual nas duas vezes e sorteia N de todas', () => {
  const dir = comResposta(RESPOSTA_CINCO, AULAS_CINCO)
  try {
    const a = rodarResposta(dir, '--amostra', '2', '--semente', '7')
    const b = rodarResposta(dir, '--amostra', '2', '--semente', '7')
    assert.ok(a.stdout.length > 0, 'saida veio vazia')
    assert.equal(a.status, 0, a.stdout + a.stderr)
    const cabecas = s => s.split(/\r?\n/).filter(l => l.startsWith('--- ') || l.startsWith('sorteadas:'))
    assert.deepEqual(cabecas(a.stdout), cabecas(b.stdout))
    const escolhidas = cabecas(a.stdout).filter(l => l.startsWith('--- '))
    assert.equal(escolhidas.length, 2)
    assert.equal(new Set(escolhidas.map(l => l.replace(/^--- \d de 2: /, ''))).size, 2)
    for (const l of escolhidas) assert.match(l, /^--- \d de 2: \(aula [12], [1-5]:00\)$/)
    assert.equal(cabecas(a.stdout).at(-1), 'sorteadas: 2 de 5')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('resposta: devolve a linha do mentor e o trecho da aula em volta da marca', () => {
  const aula = ['# Aula 1', 'antes longe', 'antes perto', '- frete gratis acima de 79 [6:15]', 'depois perto', 'depois perto 2', 'depois longe'].join(CRLF)
  const dir = comResposta('Pra sua loja, frete gratis compensa (aula 1, 6:15).', { '01-frete.md': aula })
  try {
    const r = rodarResposta(dir, '--amostra', '1')
    assert.ok(r.stdout.length > 0, 'saida veio vazia')
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.deepEqual(r.stdout.trim().split(/\r?\n/), [
      '--- 1 de 1: (aula 1, 6:15)',
      'resposta: Pra sua loja, frete gratis compensa (aula 1, 6:15).',
      'aulas/01-frete.md:',
      '  antes longe',
      '  antes perto',
      '  - frete gratis acima de 79 [6:15]',
      '  depois perto',
      '  depois perto 2',
      '  ...',
      'sorteadas: 1 de 1',
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('resposta sem citacao sai 1 com aviso', () => {
  const dir = comResposta('Faz assim que da certo, como a aula 1 ensina.', { '01-a.md': '[1:00] x' })
  try {
    const r = rodarResposta(dir)
    assert.equal(r.status, 1)
    assert.match(r.stdout, /AVISO: nenhuma citacao no formato \(aula N, marca\) achada no texto da resposta/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('resposta com marca que nao existe na aula sai 1 e nao sorteia', () => {
  const dir = comResposta('A (aula 1, 1:00). B (aula 1, 9:59).', { '01-a.md': '[1:00] x' })
  try {
    const r = rodarResposta(dir, '--semente', '1')
    assert.ok(r.stdout.length > 0, 'saida veio vazia')
    assert.equal(r.status, 1)
    assert.deepEqual(r.stdout.trim().split(/\r?\n/).filter(l => !l.startsWith('AVISO')), ['aula 1 sem a marca [9:59]', 'problemas: 1'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CLI --resposta sem o caminho do arquivo sai 1 com aviso', () => {
  const dir = comResposta('A (aula 1, 1:00).', { '01-a.md': '[1:00] um' })
  try {
    const r = spawnSync(process.execPath, [SCRIPT, dir, '--resposta'], { encoding: 'utf8' })
    assert.ok(r.stdout.length > 0, 'saida veio vazia')
    assert.equal(r.status, 1, r.stdout + r.stderr)
    assert.match(r.stdout, /AVISO: --resposta precisa do caminho/)
    assert.doesNotMatch(r.stdout, /conferidas:/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CLI --persona sem SKILL.md sai 1 com aviso', () => {
  const dir = persona({ fichas: { '01-x.md': '[1:00]' } })
  try {
    const r = rodarPersona(dir)
    assert.equal(r.status, 1)
    assert.match(r.stdout, /sem SKILL\.md/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// P1 da 5.20: o conselheiro instalado confere a resposta do dia a dia contra as fichas dele.
const rodarPersonaResposta = (dir, arq, ...extra) =>
  spawnSync(process.execPath, [SCRIPT, dir, '--persona', '--resposta', arq, ...extra], { encoding: 'utf8' })

test('persona com resposta: confere o rascunho contra fichas/ e devolve o trecho da ficha', () => {
  const dir = persona({ skill: 'x (fonte 1, p. 17)', fichas: { '01-livro.md': ['antes', '[p. 17] brinde antes do pedido', 'depois'].join(CRLF) } })
  const arq = join(dir, 'r.md')
  writeFileSync(arq, 'Manda um brinde antes de pedir (fonte 1, p. 17).')
  try {
    const r = rodarPersonaResposta(dir, arq, '--amostra', '1')
    assert.ok(r.stdout.length > 0, 'saida veio vazia')
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.deepEqual(r.stdout.trim().split(/\r?\n/), [
      '--- 1 de 1: (fonte 1, p. 17)',
      'resposta: Manda um brinde antes de pedir (fonte 1, p. 17).',
      'fichas/01-livro.md:',
      '  antes',
      '  [p. 17] brinde antes do pedido',
      '  depois',
      '  ...',
      'sorteadas: 1 de 1',
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('persona com resposta que cita ficha inexistente sai 1 sem sortear', () => {
  const dir = persona({ skill: 'x (fonte 1, p. 17)', fichas: { '01-livro.md': '[p. 17] y' } })
  const arq = join(dir, 'r.md')
  writeFileSync(arq, 'A (fonte 1, p. 17). B (fonte 9, 1:00).')
  try {
    const r = rodarPersonaResposta(dir, arq)
    assert.ok(r.stdout.length > 0, 'saida veio vazia')
    assert.equal(r.status, 1, r.stdout + r.stderr)
    assert.deepEqual(r.stdout.trim().split(/\r?\n/), ['fonte 9 nao existe em fichas/', 'problemas: 1'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// Pasta inteligencia/cursos de mentira: { <curso>: { autor, aulas: { nome: texto } } }; autor null
// grava o curso.md sem a linha "Autor:".
function pastaCursos(def) {
  const raiz = mkdtempSync(join(tmpdir(), 'conferir-cursos-'))
  for (const [nome, c] of Object.entries(def)) {
    mkdirSync(join(raiz, nome, 'aulas'), { recursive: true })
    writeFileSync(join(raiz, nome, 'curso.md'), [c.autor == null ? '# Curso' : `Autor: ${c.autor}`, `Fonte: playlist de ${nome}`].join(CRLF))
    for (const [arq, texto] of Object.entries(c.aulas ?? {})) writeFileSync(join(raiz, nome, 'aulas', arq), texto)
  }
  return raiz
}
const rodarCursos = (raiz, ...extra) => spawnSync(process.execPath, [SCRIPT, raiz, '--cursos', ...extra], { encoding: 'utf8' })

// N1 da 5.20: a citacao de um curso so nao diz de qual curso e. A certa do curso B, no rascunho do A,
// sai 1 com o aviso de outro curso (em vez de mandar "corrigir"); com o curso na citacao e --cursos,
// a mesma resposta passa numa rodada so.
test('dois cursos: citacao do curso B no rascunho do A sai 1 com aviso, e com o curso na citacao passa por --cursos', () => {
  const raiz = pastaCursos({
    a: { autor: 'Ana', aulas: { '01-a.md': '[1:00] curso A: frete gratis sempre' } },
    b: { autor: 'Bia', aulas: { '03-b.md': '[7:00] curso B: nunca de frete gratis' } },
  })
  const a = join(raiz, 'a')
  try {
    writeFileSync(join(a, 'mentor.md'), 'x (aula 1, 1:00)')
    writeFileSync(join(a, 'resposta.md'), ['Curso A: frete gratis sempre (aula 1, 1:00).', 'Curso B: nunca (aula 3, 7:00).'].join(CRLF))
    const misturada = rodarResposta(a)
    assert.ok(misturada.stdout.length > 0, 'saida veio vazia')
    assert.notEqual(misturada.status, 0, misturada.stdout)
    const linhas = misturada.stdout.trim().split(/\r?\n/)
    assert.deepEqual(linhas.slice(0, 2), ['aula 3 nao existe em aulas/', 'problemas: 1'])
    assert.match(linhas[2] ?? '', /^AVISO: citacao que nao casa com esta pasta pode ser de outro curso\. .*\(aula N, marca, <curso>\).* com a pasta inteligencia\/cursos e --cursos; .* nunca se apaga\.$/)
    assert.doesNotMatch(misturada.stdout, /sorteadas:/)
    const resp = join(raiz, 'resposta.md')
    writeFileSync(resp, ['Curso A: frete gratis sempre (aula 1, 1:00, a).', 'Curso B: nunca (aula 3, 7:00, b).'].join(CRLF))
    const r = rodarCursos(raiz, '--resposta', resp, '--amostra', '2')
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /^a\/aulas\/01-a\.md:$/m)
    assert.match(r.stdout, /^b\/aulas\/03-b\.md:$/m)
    assert.match(r.stdout, /^sorteadas: 2 de 2$/m)
  } finally {
    rmSync(raiz, { recursive: true, force: true })
  }
})

// 5.21, tarefa 3.3 e item 8 (5.20 chat 3a): so o curso dentro da citacao separa a aula 1 [1:00] do
// curso a da aula 1 [1:00] do curso b.
const OPOSTOS = {
  a: { autor: 'Ana', aulas: { '01-frete.md': ['antes', '[1:00] curso a: frete gratis sempre', 'depois'].join(CRLF) } },
  b: { autor: 'Bia', aulas: { '01-frete.md': ['antes', '[1:00] curso b: nunca de frete gratis', 'depois'].join(CRLF) } },
}

test('cursos 1: mesma aula e marca em dois cursos, o trecho sai do curso citado', () => {
  const raiz = pastaCursos(OPOSTOS)
  try {
    const resp = join(raiz, 'resposta.md')
    writeFileSync(resp, 'Frete gratis nao compensa (aula 1, 1:00, b).')
    const r = rodarCursos(raiz, '--resposta', resp)
    assert.ok(r.stdout.length > 0, 'saida veio vazia')
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.deepEqual(r.stdout.trim().split(/\r?\n/), [
      '--- 1 de 1: (aula 1, 1:00, b)',
      'resposta: Frete gratis nao compensa (aula 1, 1:00, b).',
      'b/aulas/01-frete.md:',
      '  antes',
      '  [1:00] curso b: nunca de frete gratis',
      '  depois',
      '  ...',
      'sorteadas: 1 de 1',
    ])
    assert.doesNotMatch(r.stdout, /curso a:/)
  } finally {
    rmSync(raiz, { recursive: true, force: true })
  }
})

test('cursos 2: o curso citado sem a marca sai 1 dizendo o curso, mesmo com a marca no outro', () => {
  const raiz = pastaCursos({ ...OPOSTOS, b: { autor: 'Bia', aulas: { '01-frete.md': '[2:00] curso b: outra coisa' } } })
  try {
    const resp = join(raiz, 'resposta.md')
    writeFileSync(resp, 'Frete gratis nao compensa (aula 1, 1:00, b). Sem curso (aula 1, 1:00). Curso que nao ha (aula 1, 1:00, z).')
    const r = rodarCursos(raiz, '--resposta', resp)
    assert.ok(r.stdout.length > 0, 'saida veio vazia')
    assert.equal(r.status, 1, r.stdout + r.stderr)
    const nome = raiz.split(/[\\/]/).pop()
    const linhas = r.stdout.trim().split(/\r?\n/)
    assert.deepEqual(linhas.slice(0, 2), ['citacao sem o curso: (aula 1, 1:00)', 'aula 1 sem a marca [1:00] em b'])
    assert.ok(linhas[2].startsWith('curso z nao existe em ') && linhas[2].endsWith(nome + '/'), linhas[2])
    assert.deepEqual(linhas.slice(3), ['problemas: 3'])
    assert.doesNotMatch(r.stdout, /sorteadas:|outro curso/)
  } finally {
    rmSync(raiz, { recursive: true, force: true })
  }
})

test('cursos 3: --tema reprova consenso de um autor so, fonte unica com 2 cursos e curso sem Autor', () => {
  const aula = { '01-x.md': '[1:00] fala' }
  const raiz = pastaCursos({ a: { autor: 'Ana', aulas: aula }, b: { autor: 'ANA ', aulas: aula }, c: { autor: 'Caio', aulas: aula }, d: { autor: null, aulas: aula } })
  const tema = join(raiz, 'tema.md')
  const montar = linhas => writeFileSync(tema, ['# Frete', '## Cursos cruzados', '- a: Ana', ...linhas].join(CRLF))
  try {
    // passa: consenso e divergencia com autores diferentes, fonte unica com 1 curso
    montar(['## Consenso', '- frete conta (aula 1, 1:00, a) (aula 1, 1:00, c)', '## Divergências', '- prazo (aula 1, 1:00, a) contra (aula 1, 1:00, c)', '## FONTE UNICA', '- so ele diz (aula 1, 1:00, c)', '## Lacunas', '- nada sobre imposto'])
    const ok = rodarCursos(raiz, '--tema', tema)
    assert.equal(ok.status, 0, ok.stdout + ok.stderr)
    assert.equal(ok.stdout.trim(), 'conferidas: 5')
    // consenso com os cursos a e b, os dois da Ana (maiuscula e espaco nao mudam o autor)
    montar(['## Consenso', '- frete conta (aula 1, 1:00, a) (aula 1, 1:00, b)'])
    const um = rodarCursos(raiz, '--tema', tema)
    assert.ok(um.stdout.length > 0, 'saida veio vazia')
    assert.equal(um.status, 1, um.stdout)
    assert.deepEqual(um.stdout.trim().split(/\r?\n/), ['consenso com um autor so (linha 5): Ana, ANA', 'problemas: 1'])
    // cabecalho com acento e maiuscula ainda e a secao de divergencias
    montar(['## DIVERGÊNCIAS', '- prazo (aula 1, 1:00, a) contra (aula 1, 1:00, b)'])
    const div = rodarCursos(raiz, '--tema', tema)
    assert.equal(div.status, 1, div.stdout)
    assert.deepEqual(div.stdout.trim().split(/\r?\n/), ['divergencia com um autor so (linha 5): Ana, ANA', 'problemas: 1'])
    montar(['## Fonte unica', '- so um diz (aula 1, 1:00, a) (aula 1, 1:00, c)'])
    const dois = rodarCursos(raiz, '--tema', tema)
    assert.ok(dois.stdout.length > 0, 'saida veio vazia')
    assert.equal(dois.status, 1, dois.stdout)
    assert.deepEqual(dois.stdout.trim().split(/\r?\n/), ['fonte unica com 2 cursos (linha 5): a, c', 'problemas: 1'])
    montar(['## Consenso', '- frete conta (aula 1, 1:00, a) (aula 1, 1:00, d)'])
    const semAutor = rodarCursos(raiz, '--tema', tema)
    assert.ok(semAutor.stdout.length > 0, 'saida veio vazia')
    assert.equal(semAutor.status, 1, semAutor.stdout)
    assert.deepEqual(semAutor.stdout.trim().split(/\r?\n/), ['sem a linha "Autor:" no curso.md de d', 'problemas: 1'])
    // item com outro marcador ou recuado, e cabecalho com sufixo, seguem com a regra da secao
    montar(['## Consenso:', '* frete conta (aula 1, 1:00, a) (aula 1, 1:00, b)', '1. prazo (aula 1, 1:00, a)', '## Fonte unica (menos confirmado)', '  - dois (aula 1, 1:00, a) (aula 1, 1:00, c)', '- sem citacao nenhuma'])
    const marcadores = rodarCursos(raiz, '--tema', tema)
    assert.ok(marcadores.stdout.length > 0, 'saida veio vazia')
    assert.equal(marcadores.status, 1, marcadores.stdout)
    assert.deepEqual(marcadores.stdout.trim().split(/\r?\n/), [
      'consenso com um autor so (linha 5): Ana, ANA', 'consenso com um autor so (linha 6): Ana',
      'fonte unica com 2 cursos (linha 8): a, c', 'fonte unica sem citacao com curso (linha 9)', 'problemas: 4',
    ])
    // a pasta depois das flags: o caminho do --tema nunca vira a pasta
    montar(['## Consenso', '- frete conta (aula 1, 1:00, a) (aula 1, 1:00, c)'])
    const depois = spawnSync(process.execPath, [SCRIPT, '--cursos', '--tema', tema, raiz], { encoding: 'utf8' })
    assert.equal(depois.status, 0, depois.stdout + depois.stderr)
    assert.equal(depois.stdout.trim(), 'conferidas: 2')
    montar(['## Outra coisa', '- texto (aula 1, 1:00, a)'])
    const semSecao = rodarCursos(raiz, '--tema', tema)
    assert.equal(semSecao.status, 1, semSecao.stdout)
    assert.match(semSecao.stdout, /^AVISO: nenhuma das secoes Consenso, Divergencias ou Fonte unica/)
  } finally {
    rmSync(raiz, { recursive: true, force: true })
  }
})

test('cursos 4: --persona com --cursos, --tema sem --cursos e --cursos sozinho saem 1 com AVISO', () => {
  const raiz = pastaCursos(OPOSTOS)
  try {
    const tema = join(raiz, 'tema.md')
    writeFileSync(tema, '## Consenso\n- x (aula 1, 1:00, a) (aula 1, 1:00, b)')
    const casos = [
      [[raiz, '--cursos', '--persona', '--tema', tema], /^AVISO: --cursos nao vale com --persona/],
      [[raiz, '--tema', tema], /^AVISO: --tema so vale com --cursos/],
      [[raiz, '--cursos'], /^AVISO: --cursos precisa de --tema <arquivo> ou --resposta <arquivo>/],
      [[raiz, '--cursos', '--tema'], /^AVISO: --tema precisa do caminho/],
    ]
    for (const [args, aviso] of casos) {
      const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
      assert.ok(r.stdout.length > 0, 'saida veio vazia: ' + args.join(' '))
      assert.equal(r.status, 1, r.stdout + r.stderr)
      assert.match(r.stdout, aviso)
      assert.doesNotMatch(r.stdout, /conferidas:|sorteadas:/)
    }
    // canario: o mesmo tema com --cursos passa
    assert.equal(rodarCursos(raiz, '--tema', tema).status, 0)
  } finally {
    rmSync(raiz, { recursive: true, force: true })
  }
})

// O esqueleto da persona manda rodar com ~/.claude/skills/<apelido>; aspas no Bash ou o
// PowerShell 5.1 entregam o ~ cru, e sem expandir aqui o script nao acharia a pasta.
test('CLI expande o ~ do caminho quando o shell nao expandiu', () => {
  const casa = mkdtempSync(join(tmpdir(), 'conferir-casa-'))
  try {
    const dir = join(casa, '.claude', 'skills', 'mentor-x')
    mkdirSync(join(dir, 'fichas'), { recursive: true })
    writeFileSync(join(dir, 'SKILL.md'), 'x (fonte 1, 2:00)')
    writeFileSync(join(dir, 'fichas', '01-a.md'), '[2:00] y')
    const r = spawnSync(process.execPath, [SCRIPT, '~/.claude/skills/mentor-x', '--persona'], {
      encoding: 'utf8', env: { ...process.env, HOME: casa, USERPROFILE: casa },
    })
    assert.ok(r.stdout.length > 0, 'saida veio vazia')
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.equal(r.stdout.trim(), 'conferidas: 1')
  } finally {
    rmSync(casa, { recursive: true, force: true })
  }
})

// P1 da 5.20: a IA que le o mentor.md direto pelo AGENTS do projeto, sem carregar a skill, tambem
// fica sabendo da conferencia.
test('linha que vai pro AGENTS do projeto cita a fase 2 e o --resposta', () => {
  const t = readFileSync(fileURLToPath(new URL('../SKILL.md', import.meta.url)), 'utf8')
  const linhas = t.match(/`- inteligencia\/cursos\/:[^`]*`/g) ?? []
  assert.equal(linhas.length, 1, `linhas do AGENTS achadas: ${linhas.length}`)
  assert.match(linhas[0], /seguindo a fase 2 da \/aprender-curso/)
  assert.match(linhas[0], /conferir-citacoes\.mjs --resposta/)
})
