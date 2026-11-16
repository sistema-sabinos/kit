// Testes do copia.mjs com projeto temporario.
// Rodar: node --test copia.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { rodar } from './copia.mjs'

const SCRIPT = fileURLToPath(new URL('./copia.mjs', import.meta.url))
const CRLF = String.fromCharCode(13, 10)
const MESMO_SEGUNDO = new Date(2026, 10, 16, 14, 3, 22)
const R = '2026-11-16-organizar'

function comProjeto(fn) {
  const raiz = mkdtempSync(join(tmpdir(), 'conselho-copia-'))
  const projeto = join(raiz, 'projeto')
  try {
    mkdirSync(join(projeto, '_contexto', 'pessoas'), { recursive: true })
    return fn(projeto, raiz)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
}

const bytes = (p, rel) => readFileSync(join(p, rel))
const texto = (p, rel) => readFileSync(join(p, rel), 'utf8')

test('antes e voltar devolvem o arquivo CRLF igual byte a byte', () => comProjeto(p => {
  const original = ['# Empresa', '', '- vende capinha'].join(CRLF) + CRLF
  writeFileSync(join(p, '_contexto/empresa.md'), original)
  const r = rodar(['antes', '_contexto/empresa.md', '--reuniao', R], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(r.codigo, 0, r.stderr)
  assert.match(r.stdout, /^copia: _contexto\/empresa\.md -> _memoria\/conselho\/antes\/2026-11-16-140322-01-_contexto--empresa\.md$/)
  writeFileSync(join(p, '_contexto/empresa.md'), '# Empresa\n- mudou tudo\n')
  const v = rodar(['voltar'], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(v.codigo, 0, v.stderr)
  assert.ok(bytes(p, '_contexto/empresa.md').equals(Buffer.from(original)), 'a volta trocou o arquivo ou o final de linha')
  assert.ok(bytes(p, '_contexto/empresa.md').includes(13), 'canario: o arquivo de volta tem CR')
}))

test('dois antes no mesmo arquivo e no mesmo segundo dao duas copias, e a volta devolve o primeiro estado', () => comProjeto(p => {
  writeFileSync(join(p, '_contexto/ferramentas.md'), 'estado 1\n')
  rodar(['antes', '_contexto/ferramentas.md', '--reuniao', R], { projeto: p, agora: MESMO_SEGUNDO })
  writeFileSync(join(p, '_contexto/ferramentas.md'), 'estado 2\n')
  const r2 = rodar(['antes', '_contexto/ferramentas.md', '--reuniao', R], { projeto: p, agora: MESMO_SEGUNDO })
  assert.match(r2.stdout, /-02-_contexto--ferramentas\.md$/, 'a segunda copia atropelou a primeira')
  assert.equal(texto(p, '_memoria/conselho/antes/2026-11-16-140322-01-_contexto--ferramentas.md'), 'estado 1\n')
  writeFileSync(join(p, '_contexto/ferramentas.md'), 'estado 3\n')
  rodar(['voltar', '--reuniao', R], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(texto(p, '_contexto/ferramentas.md'), 'estado 1\n')
}))

test('o registro nasce antes da mudanca e a volta funciona so com ele, sem ata', () => comProjeto(p => {
  writeFileSync(join(p, '_contexto/automacoes.md'), 'velho\n')
  rodar(['antes', '_contexto/automacoes.md', '--reuniao', '2026-11-16-rotinas'], { projeto: p, agora: MESMO_SEGUNDO })
  const lista = texto(p, '_memoria/conselho/antes/LISTA.md')
  assert.match(lista, /\| 2026-11-16-rotinas \| _contexto\/automacoes\.md \| _memoria\/conselho\/antes\/[^ ]+ \| antes/)
  assert.ok(!existsSync(join(p, '_memoria/conselho/2026-11-16-rotinas.md')), 'canario: nenhuma ata foi gravada')
  writeFileSync(join(p, '_contexto/automacoes.md'), 'novo\n')
  // num chat novo: so o processo de novo, lendo o registro do disco
  const r = spawnSync(process.execPath, [SCRIPT, 'voltar'], { cwd: p, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(texto(p, '_contexto/automacoes.md'), 'velho\n')
  assert.equal(rodar(['voltar', '--reuniao', '2026-11-16-rotinas'], { projeto: p }).codigo, 1, 'a mesma reuniao voltou duas vezes')
}))

test('reunioes de mesmo tema em dias diferentes nao se misturam', () => comProjeto(p => {
  writeFileSync(join(p, 'tarefas.md'), 'dia 0\n')
  rodar(['antes', 'tarefas.md', '--reuniao', '2026-11-15-organizar'], { projeto: p, agora: new Date(2026, 10, 15, 9, 0, 0) })
  writeFileSync(join(p, 'tarefas.md'), 'dia 1\n')
  rodar(['antes', 'tarefas.md', '--reuniao', '2026-11-16-organizar'], { projeto: p, agora: MESMO_SEGUNDO })
  writeFileSync(join(p, 'tarefas.md'), 'dia 2\n')
  assert.equal(rodar(['voltar', '--reuniao', '2026-11-16-organizar'], { projeto: p }).codigo, 0)
  assert.equal(texto(p, 'tarefas.md'), 'dia 1\n', 'a volta da segunda reuniao desfez a primeira')
  assert.equal(rodar(['voltar', '--reuniao', '2026-11-15-organizar'], { projeto: p }).codigo, 0, 'a primeira ficou sem volta')
  assert.equal(texto(p, 'tarefas.md'), 'dia 0\n')
  assert.equal(rodar(['antes', 'tarefas.md', '--reuniao', 'organizar'], { projeto: p }).codigo, 2, 'reuniao sem a data passou')
}))

test('arquivo que a reuniao criou some na volta, e o que a pessoa escreveu depois fica guardado', () => comProjeto(p => {
  const r = rodar(['antes', 'tarefas.md', '--reuniao', R], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(r.stdout, 'novo: tarefas.md (a volta apaga)')
  writeFileSync(join(p, 'tarefas.md'), '- [ ] do conselho\n- [ ] minha, escrita depois\n')
  const v = rodar(['voltar'], { projeto: p, agora: MESMO_SEGUNDO })
  assert.ok(!existsSync(join(p, 'tarefas.md')))
  const guardado = /ficou em (\S+)/.exec(v.stdout)?.[1]
  assert.ok(guardado, `a volta nao disse onde guardou: ${v.stdout}`)
  assert.equal(texto(p, guardado), '- [ ] do conselho\n- [ ] minha, escrita depois\n', 'a volta perdeu o que a pessoa escreveu')
}))

test('copia que sumiu nao volta nada pela metade, e pasta apagada depois da reuniao volta', () => comProjeto(p => {
  writeFileSync(join(p, '_contexto/empresa.md'), 'e0\n')
  writeFileSync(join(p, '_contexto/pessoas/joao.md'), 'j0\n')
  const r = rodar(['antes', '_contexto/empresa.md', '_contexto/pessoas/joao.md', '--reuniao', R], { projeto: p, agora: MESMO_SEGUNDO })
  writeFileSync(join(p, '_contexto/empresa.md'), 'e1\n')
  rmSync(join(p, '_contexto/pessoas'), { recursive: true })
  // a volta anda do fim pro comeco: some a copia do primeiro, que seria o ultimo a voltar
  const copiaEmpresa = /empresa\.md -> (\S+)/.exec(r.stdout)[1]
  const guardada = readFileSync(join(p, copiaEmpresa))
  rmSync(join(p, copiaEmpresa))
  const sem = rodar(['voltar'], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(sem.codigo, 2, 'voltou com a copia faltando')
  assert.equal(texto(p, '_contexto/empresa.md'), 'e1\n')
  assert.ok(!existsSync(join(p, '_contexto/pessoas/joao.md')), 'voltou pela metade: o joao voltou e a empresa nao')
  writeFileSync(join(p, copiaEmpresa), guardada)
  const com = rodar(['voltar'], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(com.codigo, 0, com.stderr)
  assert.equal(texto(p, '_contexto/empresa.md'), 'e0\n')
  assert.equal(texto(p, '_contexto/pessoas/joao.md'), 'j0\n', 'a pasta apagada nao voltou')
}))

test('reuniao mais velha so volta depois da mais nova que mexeu no mesmo arquivo', () => comProjeto(p => {
  writeFileSync(join(p, '_contexto/empresa.md'), 'X0\n')
  rodar(['antes', '_contexto/empresa.md', '--reuniao', '2026-11-15-organizar'], { projeto: p, agora: new Date(2026, 10, 15, 9, 0, 0) })
  writeFileSync(join(p, '_contexto/empresa.md'), 'X1\n')
  rodar(['antes', '_contexto/empresa.md', '--reuniao', '2026-11-16-rotinas'], { projeto: p, agora: MESMO_SEGUNDO })
  writeFileSync(join(p, '_contexto/empresa.md'), 'X2\n')
  const velha = rodar(['voltar', '--reuniao', '2026-11-15-organizar'], { projeto: p })
  assert.equal(velha.codigo, 1)
  assert.match(velha.stdout, /antes, volte a reuniao 2026-11-16-rotinas/)
  assert.equal(texto(p, '_contexto/empresa.md'), 'X2\n', 'a recusa mexeu no arquivo')
  assert.equal(rodar(['voltar', '--reuniao', '2026-11-16-rotinas'], { projeto: p }).codigo, 0)
  assert.equal(rodar(['voltar', '--reuniao', '2026-11-15-organizar'], { projeto: p }).codigo, 0)
  assert.equal(texto(p, '_contexto/empresa.md'), 'X0\n')
}))

test('reunioes intercaladas: a mais velha espera a nova mesmo tendo mexido em outro arquivo depois (final do Codex)', () => comProjeto(p => {
  writeFileSync(join(p, 'x.md'), 'X0\n')
  writeFileSync(join(p, 'y.md'), 'Y0\n')
  rodar(['antes', 'x.md', '--reuniao', '2026-11-16-a'], { projeto: p, agora: MESMO_SEGUNDO })
  writeFileSync(join(p, 'x.md'), 'X1\n')
  rodar(['antes', 'x.md', '--reuniao', '2026-11-16-b'], { projeto: p, agora: MESMO_SEGUNDO })
  writeFileSync(join(p, 'x.md'), 'X2\n')
  rodar(['antes', 'y.md', '--reuniao', '2026-11-16-a'], { projeto: p, agora: MESMO_SEGUNDO })
  writeFileSync(join(p, 'y.md'), 'Y1\n')
  const a = rodar(['voltar', '--reuniao', '2026-11-16-a'], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(a.codigo, 1, 'a mais velha voltou por cima da mais nova')
  assert.match(a.stdout, /antes, volte a reuniao 2026-11-16-b, que e mais nova e mexeu em x\.md/)
  assert.equal(texto(p, 'x.md'), 'X2\n', 'a recusa mexeu no arquivo')
  assert.equal(rodar(['voltar', '--reuniao', '2026-11-16-b'], { projeto: p, agora: MESMO_SEGUNDO }).codigo, 0)
  assert.equal(texto(p, 'x.md'), 'X1\n')
  assert.equal(rodar(['voltar', '--reuniao', '2026-11-16-a'], { projeto: p, agora: MESMO_SEGUNDO }).codigo, 0)
  assert.equal(texto(p, 'x.md'), 'X0\n')
  assert.equal(texto(p, 'y.md'), 'Y0\n')
}))

test('reuniao que mexeu no arquivo antes da outra nao segura a volta dela', () => comProjeto(p => {
  writeFileSync(join(p, 'x.md'), 'X0\n')
  rodar(['antes', 'x.md', '--reuniao', '2026-11-16-a'], { projeto: p, agora: MESMO_SEGUNDO })
  writeFileSync(join(p, 'x.md'), 'X1\n')
  rodar(['antes', 'x.md', '--reuniao', '2026-11-16-b'], { projeto: p, agora: MESMO_SEGUNDO })
  writeFileSync(join(p, 'x.md'), 'X2\n')
  const b = rodar(['voltar', '--reuniao', '2026-11-16-b'], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(b.codigo, 0, b.stdout)
  assert.equal(texto(p, 'x.md'), 'X1\n')
}))

test('reuniao dentro de outra no mesmo arquivo nao trava: as duas voltam juntas (revisao do conserto da final)', () => comProjeto(p => {
  writeFileSync(join(p, 'x.md'), 'v0\n')
  rodar(['antes', 'x.md', '--reuniao', '2026-11-16-a'], { projeto: p, agora: MESMO_SEGUNDO })
  writeFileSync(join(p, 'x.md'), 'vA\n')
  rodar(['antes', 'x.md', '--reuniao', '2026-11-16-b'], { projeto: p, agora: MESMO_SEGUNDO })
  writeFileSync(join(p, 'x.md'), 'vB\n')
  rodar(['antes', 'x.md', '--reuniao', '2026-11-16-a'], { projeto: p, agora: MESMO_SEGUNDO })
  writeFileSync(join(p, 'x.md'), 'vA2\n')
  const a = rodar(['voltar', '--reuniao', '2026-11-16-a'], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(a.codigo, 1)
  // B sozinha tambem e recusada (A mexeu de novo por cima): a mensagem nao pode mandar voltar B primeiro
  assert.match(a.stdout, /se cruzaram: so voltam juntas: copia\.mjs voltar --reuniao 2026-11-16-a --reuniao 2026-11-16-b;/)
  assert.doesNotMatch(a.stdout, /antes, volte/)
  const b = rodar(['voltar', '--reuniao', '2026-11-16-b'], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(b.codigo, 1)
  assert.match(b.stdout, /so voltam juntas/)
  assert.equal(texto(p, 'x.md'), 'vA2\n', 'a recusa mexeu no arquivo')
  const j = rodar(['voltar', '--reuniao', '2026-11-16-a', '--reuniao', '2026-11-16-b'], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(j.codigo, 0, j.stderr || j.stdout)
  assert.equal(texto(p, 'x.md'), 'v0\n')
  assert.match(j.stdout, /ficou em (\S+)/)
  assert.equal(texto(p, /ficou em (\S+)/.exec(j.stdout)[1]), 'vA2\n', 'a volta junta perdeu o que estava no arquivo')
  for (const t of ['2026-11-16-a', '2026-11-16-b']) assert.equal(rodar(['voltar', '--reuniao', t], { projeto: p }).codigo, 1, `${t} voltou duas vezes`)
}))

test('reunioes cruzadas em arquivos diferentes voltam juntas pro estado de antes das duas', () => comProjeto(p => {
  writeFileSync(join(p, 'x.md'), 'x0\n')
  writeFileSync(join(p, 'y.md'), 'y0\n')
  rodar(['antes', 'x.md', '--reuniao', '2026-11-16-a'], { projeto: p, agora: MESMO_SEGUNDO })
  writeFileSync(join(p, 'x.md'), 'xA\n')
  rodar(['antes', 'y.md', '--reuniao', '2026-11-16-b'], { projeto: p, agora: MESMO_SEGUNDO })
  writeFileSync(join(p, 'y.md'), 'yB\n')
  rodar(['antes', 'x.md', '--reuniao', '2026-11-16-b'], { projeto: p, agora: MESMO_SEGUNDO })
  writeFileSync(join(p, 'x.md'), 'xB\n')
  rodar(['antes', 'y.md', '--reuniao', '2026-11-16-a'], { projeto: p, agora: MESMO_SEGUNDO })
  writeFileSync(join(p, 'y.md'), 'yA\n')
  assert.equal(rodar(['voltar', '--reuniao', '2026-11-16-a'], { projeto: p }).codigo, 1)
  assert.equal(rodar(['voltar', '--reuniao', '2026-11-16-b'], { projeto: p }).codigo, 1)
  const j = rodar(['voltar', '--reuniao', '2026-11-16-b', '--reuniao', '2026-11-16-a'], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(j.codigo, 0, j.stderr || j.stdout)
  assert.equal(texto(p, 'x.md'), 'x0\n')
  assert.equal(texto(p, 'y.md'), 'y0\n')
}))

test('o mesmo arquivo escrito com outra caixa conta como o mesmo na ordem da volta', () => comProjeto(p => {
  writeFileSync(join(p, 'Notas.md'), 'v0\n')
  rodar(['antes', 'Notas.md', '--reuniao', '2026-11-16-a'], { projeto: p, agora: MESMO_SEGUNDO })
  writeFileSync(join(p, 'Notas.md'), 'vA\n')
  rodar(['antes', 'notas.md', '--reuniao', '2026-11-16-b'], { projeto: p, agora: MESMO_SEGUNDO })
  writeFileSync(join(p, 'Notas.md'), 'vB\n')
  const a = rodar(['voltar', '--reuniao', '2026-11-16-a'], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(a.codigo, 1, 'a mais velha voltou por cima da mais nova escrita com outra caixa')
  assert.equal(texto(p, 'Notas.md'), 'vB\n')
}))

test('varios arquivos numa chamada so guardam todos, e um caminho ruim no meio nao guarda nenhum', () => comProjeto(p => {
  writeFileSync(join(p, '_contexto/empresa.md'), 'e\n')
  writeFileSync(join(p, '_contexto/ferramentas.md'), 'f\n')
  const r = rodar(['antes', '_contexto/empresa.md', '_contexto/ferramentas.md', 'tarefas.md', '--reuniao', R], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(r.codigo, 0, r.stderr)
  assert.equal(r.stdout.split('\n').length, 3, r.stdout)
  assert.match(texto(p, '_memoria/conselho/antes/LISTA.md'), /tarefas\.md \| novo \| antes/)
  const ruim = rodar(['antes', '_contexto/empresa.md', '../fora.md', '--reuniao', '2026-11-17-outra'], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(ruim.codigo, 2)
  assert.ok(!texto(p, '_memoria/conselho/antes/LISTA.md').includes('2026-11-17-outra'), 'caminho ruim no meio guardou os outros')
}))

test('caminho fora do projeto, absoluto, .env, o proprio registro e link pra fora saem 2 sem gravar', () => comProjeto((p, raiz) => {
  writeFileSync(join(p, '.env'), 'CHAVE=1\n')
  const fora = join(raiz, 'fora')
  mkdirSync(fora)
  writeFileSync(join(fora, 'x.md'), 'de fora\n')
  symlinkSync(fora, join(p, '_contexto', 'link'), 'junction')
  assert.equal(texto(p, '_contexto/link/x.md'), 'de fora\n', 'canario: o link aponta pra fora')
  for (const ruim of ['../fora.md', join(p, '_contexto/empresa.md'), '.env', '_memoria/conselho/antes/LISTA.md', '.git/config', '_contexto/link/x.md', '_contexto/link/novo.md']) {
    const r = rodar(['antes', ruim, '--reuniao', R], { projeto: p, agora: MESMO_SEGUNDO })
    assert.equal(r.codigo, 2, ruim)
  }
  assert.ok(!existsSync(join(p, '_memoria/conselho/antes/LISTA.md')), 'recusa gravou registro')
  assert.equal(rodar(['antes', '_contexto/empresa.md'], { projeto: p }).codigo, 2, 'sem --reuniao')
  assert.equal(rodar([], { projeto: p }).codigo, 2)
  assert.equal(rodar(['voltar'], { projeto: p }).codigo, 1, 'registro vazio')
}))

test('.env, .git e o registro em outra caixa tambem saem 2 sem gravar (final do Codex)', () => comProjeto(p => {
  writeFileSync(join(p, '.env'), 'CHAVE=isca\n')
  mkdirSync(join(p, '.git'))
  writeFileSync(join(p, '.git', 'config'), 'isca\n')
  const ruins = ['.ENV', '.Env.local', 'sub/.ENV', '.GIT/config', '_MEMORIA/conselho/antes/LISTA.md', '_memoria/CONSELHO/x.md',
    '.env::$DATA', '.ENV::$DATA', '.env:x', '.env.', '.env ', '.git./config', 'sub/.env.', 'sub/.env ',
    'sub/.git/config', 'sub/.GIT/hooks/pre-commit', 'ARQUIV~1.MD', 'atalho/config']
  // juncao dentro do projeto que aponta pro proprio .git: o nome digitado e limpo, o caminho real nao
  symlinkSync(join(p, '.git'), join(p, 'atalho'), 'junction')
  assert.equal(texto(p, 'atalho/config'), 'isca\n', 'canario: o atalho chega no .git')
  // nome curto do Windows (8.3): so existe onde o disco gera; aqui o C: gera, e o canario diz se rodou
  for (const curto of ['GIT~1/config', 'ENV~1']) if (existsSync(join(p, curto))) ruins.push(curto)
  if (process.platform === 'win32') assert.ok(ruins.includes('GIT~1/config'), 'canario: o disco do teste nao gerou nome curto, a trava do 8.3 nao foi provada')
  for (const ruim of ruins) {
    const r = rodar(['antes', ruim, '--reuniao', R], { projeto: p, agora: MESMO_SEGUNDO })
    assert.equal(r.codigo, 2, ruim)
  }
  assert.ok(!existsSync(join(p, '_memoria')), 'recusa gravou na _memoria')
  assert.equal(rodar(['antes', 'envio.md', '--reuniao', R], { projeto: p, agora: MESMO_SEGUNDO }).codigo, 0, 'canario: nome que so comeca parecido passa')
}))

test('pasta no lugar de arquivo: o antes recusa, e a pasta que a reuniao criou nao trava a volta (revisao do conserto da final)', () => comProjeto(p => {
  writeFileSync(join(p, 'tarefas.md'), 't0\n')
  const r = rodar(['antes', 'tarefas.md', '_contexto/pessoas', '--reuniao', R], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(r.codigo, 2)
  assert.match(r.stderr, /_contexto\/pessoas e uma pasta/)
  assert.ok(!existsSync(join(p, '_memoria')), 'a recusa gravou registro')
  assert.equal(rodar(['antes', 'tarefas.md', 'novapasta', '--reuniao', R], { projeto: p, agora: MESMO_SEGUNDO }).codigo, 0)
  mkdirSync(join(p, 'novapasta'))
  writeFileSync(join(p, 'novapasta', 'a.md'), 'da reuniao\n')
  writeFileSync(join(p, 'tarefas.md'), 't1\n')
  const v = rodar(['voltar'], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(v.codigo, 0, v.stderr)
  assert.equal(texto(p, 'tarefas.md'), 't0\n', 'a pasta travou a volta do resto')
  assert.match(v.stdout, /deixei: novapasta virou pasta/)
  assert.equal(texto(p, 'novapasta/a.md'), 'da reuniao\n', 'a volta apagou a pasta inteira')
}))

test('arquivo guardado que virou pasta recusa a volta sem mexer em nada, e ela volta depois de tirar a pasta (final do Codex)', () => comProjeto(p => {
  writeFileSync(join(p, 'tarefas.md'), 't0\n')
  writeFileSync(join(p, 'outro.md'), 'o0\n')
  rodar(['antes', 'outro.md', 'tarefas.md', '--reuniao', R], { projeto: p, agora: MESMO_SEGUNDO })
  writeFileSync(join(p, 'outro.md'), 'o1\n')
  rmSync(join(p, 'tarefas.md'))
  mkdirSync(join(p, 'tarefas.md'))
  const v = rodar(['voltar'], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(v.codigo, 2, v.stdout)
  assert.match(v.stderr, /tarefas\.md virou pasta/)
  assert.equal(texto(p, 'outro.md'), 'o1\n', 'a recusa voltou metade')
  rmSync(join(p, 'tarefas.md'), { recursive: true })
  const de = rodar(['voltar'], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(de.codigo, 0, de.stderr || de.stdout)
  assert.equal(texto(p, 'tarefas.md'), 't0\n')
  assert.equal(texto(p, 'outro.md'), 'o0\n')
}))

test('LISTA.md que e link pra fora do projeto recusa sem gravar la (final do Codex)', () => comProjeto((p, raiz) => {
  // no Mac e no Linux o link de arquivo nasce sem permissao; no Windows pede administrador, entao aqui
  // vai uma juncao, que o script resolve pelo mesmo caminho real
  const fora = join(raiz, 'fora')
  mkdirSync(fora)
  writeFileSync(join(fora, 'x.md'), 'de fora\n')
  mkdirSync(join(p, '_memoria', 'conselho', 'antes'), { recursive: true })
  symlinkSync(fora, join(p, '_memoria', 'conselho', 'antes', 'LISTA.md'), 'junction')
  assert.equal(texto(p, '_memoria/conselho/antes/LISTA.md/x.md'), 'de fora\n', 'canario: o link aponta pra fora')
  const a = rodar(['antes', 'novo.md', '--reuniao', R], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(a.codigo, 2, a.stdout)
  assert.match(a.stderr, /aponta pra fora do projeto/)
  assert.equal(rodar(['voltar'], { projeto: p, agora: MESMO_SEGUNDO }).codigo, 2)
  assert.deepEqual(readdirSync(fora), ['x.md'], 'o registro foi gravado fora do projeto')
}))

test('juncao pendurada que vai virar o registro recusa, e a volta segue funcionando (revisao do conserto da final)', () => comProjeto(p => {
  writeFileSync(join(p, 'x.md'), 'x0\n')
  symlinkSync(join(p, '_memoria', 'conselho', 'antes'), join(p, 'j'), 'junction')
  const r = rodar(['antes', 'x.md', 'j/LISTA.md', '--reuniao', R], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(r.codigo, 2, r.stdout)
  assert.ok(!existsSync(join(p, '_memoria')), 'a recusa criou a pasta do registro')
  assert.equal(rodar(['antes', 'x.md', '--reuniao', R], { projeto: p, agora: MESMO_SEGUNDO }).codigo, 0)
  writeFileSync(join(p, 'x.md'), 'x1\n')
  assert.equal(rodar(['voltar'], { projeto: p, agora: MESMO_SEGUNDO }).codigo, 0)
  assert.equal(texto(p, 'x.md'), 'x0\n')
}))

test('em pasta que separa maiuscula, Notas.md e notas.md sao dois arquivos e os dois ficam guardados na volta', () => comProjeto((_, raiz) => {
  if (process.platform !== 'win32') return
  // pasta nova e vazia: o Windows so liga a caixa sensivel antes de ela ter subpasta
  const p = join(raiz, 'caixa')
  mkdirSync(p)
  const s = spawnSync('fsutil', ['file', 'setCaseSensitiveInfo', p, 'enable'], { encoding: 'utf8' })
  assert.equal(s.status, 0, `canario: a pasta do teste nao virou sensivel a caixa (${s.stdout}${s.stderr})`)
  writeFileSync(join(p, 'Notas.md'), 'N0\n')
  writeFileSync(join(p, 'notas.md'), 'n0\n')
  assert.equal(texto(p, 'Notas.md'), 'N0\n', 'canario: os dois arquivos existem separados')
  assert.equal(rodar(['antes', 'Notas.md', 'notas.md', '--reuniao', R], { projeto: p, agora: MESMO_SEGUNDO }).codigo, 0)
  writeFileSync(join(p, 'Notas.md'), 'N-reuniao\n')
  writeFileSync(join(p, 'notas.md'), 'n-reuniao\n')
  const v = rodar(['voltar'], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(v.codigo, 0, v.stderr)
  const guardados = [...v.stdout.matchAll(/ficou em (\S+)/g)].map(m => texto(p, m[1])).sort()
  assert.deepEqual(guardados, ['N-reuniao\n', 'n-reuniao\n'], 'um dos dois nao foi guardado antes da volta')
  assert.equal(texto(p, 'Notas.md'), 'N0\n')
  assert.equal(texto(p, 'notas.md'), 'n0\n')
}))

test('_memoria que aponta pra fora do projeto recusa sem gravar la (final do Codex)', () => comProjeto((p, raiz) => {
  writeFileSync(join(p, 'tarefas.md'), 't0\n')
  const fora = join(raiz, 'fora')
  mkdirSync(fora)
  symlinkSync(fora, join(p, '_memoria'), 'junction')
  const r = rodar(['antes', 'tarefas.md', '--reuniao', R], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(r.codigo, 2, r.stdout)
  assert.ok(!existsSync(join(fora, 'conselho')), 'a copia ou o registro foram parar fora do projeto')
  // registro mexido a mao que aponta a copia pra fora pela juncao: a volta nao le de la
  rmSync(join(p, '_memoria'))
  mkdirSync(join(p, '_memoria', 'conselho', 'antes'), { recursive: true })
  writeFileSync(join(fora, 'segredo.md'), 'de fora\n')
  symlinkSync(fora, join(p, '_memoria', 'conselho', 'antes', 'link'), 'junction')
  writeFileSync(join(p, '_memoria/conselho/antes/LISTA.md'), `- 2026-11-16 14:03:22 | ${R} | tarefas.md | _memoria/conselho/antes/link/segredo.md | antes\n`)
  const v = rodar(['voltar'], { projeto: p, agora: MESMO_SEGUNDO })
  assert.equal(v.codigo, 2, v.stdout)
  assert.equal(texto(p, 'tarefas.md'), 't0\n', 'a volta copiou de fora do projeto')
}))
