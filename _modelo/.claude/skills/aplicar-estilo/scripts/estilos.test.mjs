import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, utimesSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pastaEstilos, pastaEdicoes, lerCatalogo, filtrar, conferir, criar, instalar, rodar, entregar, ambienteDaEdicao, ordenarMp4 } from './estilos.mjs'

const CATALOGO = [
  '# Catálogo de estilos de edição de vídeo',
  '',
  '| estilo | formato | sistema | serve pra | o que mandar | como fica |',
  '|---|---|---|---|---|---|',
  '| aula | 16:9 | todos | cursos online, professores | Vídeo da aula | Slide que se monta na fala |',
  '| receita | 9:16 | todos | confeitaria, culinária | Vídeo da pessoa cozinhando | Cartão de receita com ingredientes |',
  '| guia | 9:16 | mac | tutoriais de apps | Vídeo e prints | Pessoa recortada sobre telas |',
  '',
].join('\r\n')

// pasta-mae falsa: projeto, catalogo ao lado e _video ao lado (sem espaco no caminho)
function mae() {
  const base = mkdtempSync(join(tmpdir(), 'estilos-'))
  const raiz = join(base, 'projeto')
  mkdirSync(raiz)
  const cat = join(base, '_estilos-video')
  for (const m of ['aula', 'receita', 'guia']) {
    mkdirSync(join(cat, `modelo-${m}`, 'assets', 'template', 'scripts'), { recursive: true })
    writeFileSync(join(cat, `modelo-${m}`, 'SKILL.md'), `# ${m}\n`)
    writeFileSync(join(cat, `modelo-${m}`, 'assets', 'template', 'package.json'), '{}\n')
    writeFileSync(join(cat, `modelo-${m}`, 'assets', 'template', 'scripts', 'preparar.mjs'), '// preparar\n')
  }
  writeFileSync(join(cat, 'catalogo.md'), CATALOGO)
  writeFileSync(join(cat, 'VERSAO'), '2026-10-11 abc123def456\n')
  return { base, raiz, cat, env: {} }
}

test('catalogo fica na pasta-mae; SABINOS_ESTILOS relativo ou absoluto troca o lugar', () => {
  const raiz = join(tmpdir(), 'm', 'projeto')
  assert.equal(pastaEstilos({ raiz, env: {} }), resolve(raiz, '..', '_estilos-video'))
  assert.equal(pastaEstilos({ raiz, env: { SABINOS_ESTILOS: '../outro' } }), resolve(raiz, '../outro'))
  const abs = join(tmpdir(), 'estilos-abs')
  assert.equal(pastaEstilos({ raiz, env: { SABINOS_ESTILOS: abs } }), abs)
  assert.equal(pastaEdicoes({ raiz, env: {} }), join(resolve(raiz, '..', '_video'), 'estilos'))
})

test('lerCatalogo le as linhas e filtrar esconde o estilo de Mac fora do Mac', () => {
  const m = mae()
  try {
    const linhas = lerCatalogo(m.cat)
    assert.equal(linhas.length, 3)
    assert.deepEqual(linhas[0], { estilo: 'aula', formato: '16:9', sistema: 'todos', servePra: 'cursos online, professores', mandar: 'Vídeo da aula', comoFica: 'Slide que se monta na fala' })
    assert.deepEqual(filtrar(linhas, { plat: 'win32' }).map((l) => l.estilo), ['aula', 'receita'])
    assert.deepEqual(filtrar(linhas, { plat: 'darwin' }).map((l) => l.estilo), ['aula', 'receita', 'guia'])
    assert.deepEqual(filtrar(linhas, { plat: 'win32', formato: '9:16' }).map((l) => l.estilo), ['receita'])
    assert.deepEqual(filtrar(linhas, { plat: 'win32', busca: 'CULINARIA cartao' }).map((l) => l.estilo), ['receita'], 'sem acento e todas as palavras')
    assert.deepEqual(filtrar(linhas, { plat: 'win32', busca: 'culinaria aula' }), [])
  } finally { rmSync(m.base, { recursive: true, force: true }) }
})

test('conferir aponta o que falta: catalogo, Node, skill do Remotion e espaco no caminho', () => {
  const m = mae()
  const home = join(m.base, 'home')
  try {
    let r = conferir({ raiz: m.raiz, env: {}, home, versaoNode: '22.0.0' })
    assert.equal(r.ok, false)
    assert.deepEqual(r.itens.filter((i) => !i.ok).map((i) => i.item), ['skill do Remotion (remotion-best-practices)'])
    assert.equal(r.versao, '2026-10-11 abc123def456')
    mkdirSync(join(m.raiz, '.claude', 'skills', 'remotion-best-practices'), { recursive: true })
    writeFileSync(join(m.raiz, '.claude', 'skills', 'remotion-best-practices', 'SKILL.md'), '# remotion\n')
    r = conferir({ raiz: m.raiz, env: {}, home, versaoNode: '22.0.0' })
    assert.equal(r.ok, true)
    // fronteira do piso 22 (5.12): o ultimo 20 reprova
    r = conferir({ raiz: m.raiz, env: { SABINOS_VIDEO: join(m.base, 'com espaco') }, home, versaoNode: '20.20.2' })
    assert.deepEqual(r.itens.filter((i) => !i.ok).map((i) => i.item), ['Node 20.20.2', 'pasta das edicoes sem espaco'])
    rmSync(join(m.cat, 'catalogo.md'))
    r = conferir({ raiz: m.raiz, env: {}, home, versaoNode: '22.0.0' })
    assert.match(r.itens.find((i) => !i.ok).fazer, /atualizar-kit/)
  } finally { rmSync(m.base, { recursive: true, force: true }) }
})

test('conferir acha a skill do Remotion instalada na pasta do usuario tambem', () => {
  const m = mae()
  const home = join(m.base, 'home')
  try {
    mkdirSync(join(home, '.claude', 'skills', 'remotion-best-practices'), { recursive: true })
    writeFileSync(join(home, '.claude', 'skills', 'remotion-best-practices', 'SKILL.md'), '# remotion\n')
    assert.equal(conferir({ raiz: m.raiz, env: {}, home, versaoNode: '22.0.0' }).ok, true)
  } finally { rmSync(m.base, { recursive: true, force: true }) }
})

test('criar copia o template pra <_video>/estilos/<pasta> e recusa o que nao pode', () => {
  const m = mae()
  try {
    const r = criar({ raiz: m.raiz, env: {}, estilo: 'receita', pasta: '2026-10-11-bolo-de-pote', plat: 'win32' })
    assert.equal(r.destino, join(m.base, '_video', 'estilos', '2026-10-11-bolo-de-pote'))
    assert.ok(existsSync(join(r.destino, 'scripts', 'preparar.mjs')))
    assert.equal(r.pastaDoEstilo, join(m.cat, 'modelo-receita'))
    assert.throws(() => criar({ raiz: m.raiz, env: {}, estilo: 'receita', pasta: '2026-10-11-bolo-de-pote', plat: 'win32' }), /ja existe/)
    assert.throws(() => criar({ raiz: m.raiz, env: {}, estilo: 'guia', pasta: '2026-10-11-tutorial', plat: 'win32' }), /so roda no Mac/)
    assert.throws(() => criar({ raiz: m.raiz, env: {}, estilo: 'nao-existe', pasta: '2026-10-11-x', plat: 'win32' }), /nao esta no catalogo/)
    assert.throws(() => criar({ raiz: m.raiz, env: {}, estilo: 'aula', pasta: 'Aula Nova', plat: 'win32' }), /nome da pasta invalido/)
    assert.throws(() => criar({ raiz: m.raiz, env: {}, estilo: 'aula', pasta: '2026-10-11-../../fora', plat: 'win32' }), /nome da pasta invalido/)
    assert.throws(() => criar({ raiz: m.raiz, env: { SABINOS_VIDEO: join(m.base, 'com espaco') }, estilo: 'aula', pasta: '2026-10-11-aula', plat: 'win32' }), /tem espaco/)
  } finally { rmSync(m.base, { recursive: true, force: true }) }
})

test('instalar roda npm install na pasta da edicao, por shell no Windows', () => {
  const m = mae()
  try {
    const { destino } = criar({ raiz: m.raiz, env: {}, estilo: 'aula', pasta: '2026-10-11-aula', plat: 'win32' })
    const chamadas = []
    const executar = (cmd, args, op) => { chamadas.push({ cmd, args, op }); return { status: 0 } }
    assert.equal(instalar({ raiz: m.raiz, env: {}, pasta: '2026-10-11-aula', plat: 'win32', executar }), 0)
    assert.equal(chamadas[0].cmd, 'npm')
    assert.deepEqual(chamadas[0].args, ['install', '--no-audit', '--no-fund'])
    assert.equal(chamadas[0].op.cwd, destino)
    assert.equal(chamadas[0].op.shell, true)
    instalar({ raiz: m.raiz, env: {}, pasta: '2026-10-11-aula', plat: 'darwin', executar })
    assert.equal(chamadas[1].op.shell, false)
    assert.throws(() => instalar({ raiz: m.raiz, env: {}, pasta: '2026-10-11-outra', plat: 'win32', executar }), /rode o criar antes/)
  } finally { rmSync(m.base, { recursive: true, force: true }) }
})

test('rodar so aceita script do estilo e passa o cache e a chave do .env sem por na linha de comando', () => {
  const m = mae()
  try {
    const { destino } = criar({ raiz: m.raiz, env: {}, estilo: 'aula', pasta: '2026-10-11-aula', plat: 'win32' })
    const env = { PEXELS_API_KEY: 'chave-de-teste-exemplo' }
    const chamadas = []
    const executar = (cmd, args, op) => { chamadas.push({ cmd, args, op }); return { status: 0 } }
    assert.equal(rodar({ raiz: m.raiz, env, pasta: '2026-10-11-aula', script: 'scripts/preparar.mjs', args: ['video.mp4', '--modelo', 'small'], executar }), 0)
    assert.equal(chamadas[0].cmd, process.execPath)
    assert.deepEqual(chamadas[0].args, ['scripts/preparar.mjs', 'video.mp4', '--modelo', 'small'])
    assert.equal(chamadas[0].op.cwd, destino)
    assert.equal(chamadas[0].op.env.PEXELS_API_KEY, 'chave-de-teste-exemplo')
    assert.equal(chamadas[0].op.env.SABINOS_ESTILOS_CACHE, join(m.base, '_video', 'estilos', '_cache'))
    assert.ok(!chamadas[0].args.join(' ').includes('chave-de-teste-exemplo'), 'a chave nao vai nos argumentos')
    for (const script of ['../fora.mjs', 'scripts/../../fora.mjs', 'outra/x.mjs', 'scripts/x.js']) {
      assert.throws(() => rodar({ raiz: m.raiz, env, pasta: '2026-10-11-aula', script, executar }), /script invalido/, script)
    }
    assert.throws(() => rodar({ raiz: m.raiz, env, pasta: '2026-10-11-aula', script: 'scripts/render.mjs', executar }), /nao existe/)
    assert.equal(chamadas.length, 1, 'nada rodou nas recusas')
    assert.equal(ambienteDaEdicao({ raiz: m.raiz, env: {} }).PEXELS_API_KEY, undefined, 'sem chave no .env, sem chave no ambiente')
  } finally { rmSync(m.base, { recursive: true, force: true }) }
})

test('ordenarMp4: o mais novo primeiro; empate de hora decide pelo nome, em qualquer ordem de leitura', () => {
  const itens = [{ n: 'teste.mp4', t: 5 }, { n: 'final.mp4', t: 5 }, { n: 'velho.mp4', t: 1 }]
  assert.deepEqual(ordenarMp4(itens).map((x) => x.n), ['final.mp4', 'teste.mp4', 'velho.mp4'])
  assert.deepEqual(ordenarMp4([...itens].reverse()).map((x) => x.n), ['final.mp4', 'teste.mp4', 'velho.mp4'])
})

test('entregar copia o MP4 mais novo de out/ pra producao/<pasta>/ do projeto', () => {
  const m = mae()
  try {
    const { destino } = criar({ raiz: m.raiz, env: {}, estilo: 'aula', pasta: '2026-10-11-aula', plat: 'win32' })
    assert.throws(() => entregar({ raiz: m.raiz, env: {}, pasta: '2026-10-11-aula' }), /nenhum MP4/)
    mkdirSync(join(destino, 'out'))
    writeFileSync(join(destino, 'out', 'velho.mp4'), 'v1')
    writeFileSync(join(destino, 'out', 'novo.mp4'), 'v2')
    utimesSync(join(destino, 'out', 'velho.mp4'), new Date(2026, 0, 1), new Date(2026, 0, 1))
    const r = entregar({ raiz: m.raiz, env: {}, pasta: '2026-10-11-aula' })
    assert.equal(r.final, join(m.raiz, 'producao', '2026-10-11-aula', 'novo.mp4'))
    assert.equal(readFileSync(r.final, 'utf8'), 'v2')
    assert.deepEqual(r.sobra, ['velho.mp4'], 'a sobra volta pra avisar')
    // empate de hora: o nome em ordem decide, nunca a ordem de leitura da pasta
    const hora = new Date(2026, 1, 1)
    for (const n of ['b.mp4', 'a.mp4', 'novo.mp4', 'velho.mp4']) { writeFileSync(join(destino, 'out', n), n); utimesSync(join(destino, 'out', n), hora, hora) }
    assert.equal(entregar({ raiz: m.raiz, env: {}, pasta: '2026-10-11-aula' }).final, join(m.raiz, 'producao', '2026-10-11-aula', 'a.mp4'))
  } finally { rmSync(m.base, { recursive: true, force: true }) }
})
