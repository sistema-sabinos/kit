// Testes do motor de atualizacao de projeto.
// Rodar: node --test _ferramentas/atualizar-projeto.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { hashArquivo, montarPlano, aplicarPlano, desfazer, registrarMudanca } from './atualizar-projeto.mjs'

// fileURLToPath, e nao URL.pathname: no Windows o pathname vem com barra sobrando.
const MOTOR = fileURLToPath(new URL('./atualizar-projeto.mjs', import.meta.url))
const CRLF = String.fromCharCode(13, 10)

const COMPONENTES = {
  componentes: {
    nucleo: { depende: [], caminhos: ['.claude/skills/iniciar/'] },
    bastao: { depende: [], caminhos: ['.claude/skills/bastao/'] },
    checar: { depende: ['nucleo'], caminhos: ['.claude/skills/checar/'] },
  },
  mistos: ['AGENTS.md'],
  ignorar: { pastas: ['templates/'], arquivos: ['README.md'], finais: ['.test.mjs'] },
}

function escrever(base, arquivos) {
  for (const [rel, txt] of Object.entries(arquivos)) {
    const p = join(base, rel)
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(p, txt)
  }
}

// Kit de mentira. modelo: o _modelo de agora. historico: { caminho: { conteudo: versao } }.
// Todo arquivo do modelo de agora entra na tabela como 3.5, como o gerador faz.
function montarKit(raiz, modelo, historico = {}) {
  const kit = join(raiz, 'kit')
  escrever(join(kit, '_modelo'), modelo)
  const arquivos = {}
  for (const [rel, versoes] of Object.entries(historico)) {
    arquivos[rel] = {}
    for (const [conteudo, versao] of Object.entries(versoes)) arquivos[rel][hashArquivo(Buffer.from(conteudo))] = versao
  }
  for (const [rel, txt] of Object.entries(modelo)) {
    arquivos[rel] ??= {}
    arquivos[rel][hashArquivo(Buffer.from(txt))] ??= '3.5'
  }
  escrever(kit, {
    VERSAO: '3.5\n',
    '_ferramentas/componentes.json': JSON.stringify(COMPONENTES),
    '_ferramentas/impressoes.json': JSON.stringify({ versao: '3.5', arquivos }),
  })
  return kit
}

function montarProjeto(raiz, arquivos) {
  const projeto = join(raiz, 'projeto')
  escrever(projeto, { '_contexto/empresa.md': 'minha empresa\n', ...arquivos })
  return projeto
}

function comPasta(fn) {
  const raiz = mkdtempSync(join(tmpdir(), 'atualizar-'))
  try { return fn(raiz) } finally { rmSync(raiz, { recursive: true, force: true }) }
}

const acaoDe = (plano, caminho) => plano.itens.find(i => i.caminho === caminho)?.acao
const INICIAR = '.claude/skills/iniciar/SKILL.md'
const BASTAO = '.claude/skills/bastao/SKILL.md'
const CHECAR = '.claude/skills/checar/SKILL.md'
const SETUP = '.claude/skills/setup/SKILL.md'

test('arquivo intocado de versao antiga e trocado sem perguntar', () => comPasta(raiz => {
  const kit = montarKit(raiz, { [INICIAR]: 'novo\n' }, { [INICIAR]: { 'velho\n': '3.0' } })
  const projeto = montarProjeto(raiz, { [INICIAR]: 'velho\n' })
  const plano = montarPlano({ kit, projeto })
  assert.equal(acaoDe(plano, INICIAR), 'trocar')
  assert.equal(plano.itens.find(i => i.caminho === INICIAR).de, '3.0')
}))

test('CRLF e LF contam como o mesmo arquivo', () => comPasta(raiz => {
  assert.equal(hashArquivo(Buffer.from('a' + CRLF + 'b' + CRLF)), hashArquivo(Buffer.from('a\nb\n')))
  const kit = montarKit(raiz, { [INICIAR]: 'novo\n' }, { [INICIAR]: { 'velho\n': '3.0' } })
  const projeto = montarProjeto(raiz, { [INICIAR]: 'velho' + CRLF })
  assert.equal(acaoDe(montarPlano({ kit, projeto }), INICIAR), 'trocar')
}))

test('arquivo mexido pela pessoa vira pergunta', () => comPasta(raiz => {
  const kit = montarKit(raiz, { [INICIAR]: 'novo\n' }, { [INICIAR]: { 'velho\n': '3.0' } })
  const projeto = montarProjeto(raiz, { [INICIAR]: 'velho com nota minha\n' })
  assert.equal(acaoDe(montarPlano({ kit, projeto }), INICIAR), 'perguntar')
}))

test('arquivo igual ao kit fica como igual', () => comPasta(raiz => {
  const kit = montarKit(raiz, { [INICIAR]: 'novo\n' })
  const projeto = montarProjeto(raiz, { [INICIAR]: 'novo\n' })
  assert.equal(acaoDe(montarPlano({ kit, projeto }), INICIAR), 'igual')
}))

test('arquivo que falta num componente instalado e adicionado', () => comPasta(raiz => {
  const extra = '.claude/skills/iniciar/extra.mjs'
  const kit = montarKit(raiz, { [INICIAR]: 'novo\n', [extra]: 'x\n' })
  const projeto = montarProjeto(raiz, { [INICIAR]: 'novo\n' })
  assert.equal(acaoDe(montarPlano({ kit, projeto }), extra), 'adicionar')
}))

test('componente novo so entra escolhido, e puxa a dependencia', () => comPasta(raiz => {
  const kit = montarKit(raiz, { [INICIAR]: 'novo\n', [CHECAR]: 'checar\n' })
  const projeto = montarProjeto(raiz, {})
  const quieto = montarPlano({ kit, projeto })
  assert.equal(quieto.itens.length, 0)
  assert.equal(quieto.componentes.checar, 'disponivel')
  const plano = montarPlano({ kit, projeto, escolhidos: ['checar'] })
  assert.equal(plano.componentes.checar, 'escolhido')
  assert.equal(plano.componentes.nucleo, 'puxado')
  assert.equal(plano.puxadoPor.nucleo, 'checar')
  assert.equal(acaoDe(plano, CHECAR), 'adicionar')
  assert.equal(acaoDe(plano, INICIAR), 'adicionar')
}))

test('componente desconhecido estoura', () => comPasta(raiz => {
  const kit = montarKit(raiz, { [INICIAR]: 'novo\n' })
  const projeto = montarProjeto(raiz, {})
  assert.throws(() => montarPlano({ kit, projeto, escolhidos: ['nao-existe'] }), /componente desconhecido/)
}))

test('arquivo que saiu do kit: intocado sugere remover, mexido fica quieto', () => comPasta(raiz => {
  const outra = '.claude/skills/outra/SKILL.md'
  const kit = montarKit(raiz, { [INICIAR]: 'novo\n' }, { [SETUP]: { 'setup velho\n': '3.0' }, [outra]: { 'x\n': '3.0' } })
  const projeto = montarProjeto(raiz, { [SETUP]: 'setup velho\n', [outra]: 'x mexido\n' })
  const plano = montarPlano({ kit, projeto })
  assert.equal(acaoDe(plano, SETUP), 'sugerir-remover')
  assert.equal(acaoDe(plano, outra), undefined)
}))

test('semente, misto e skill do projeto nunca entram no plano', () => comPasta(raiz => {
  const kit = montarKit(raiz, { [INICIAR]: 'novo\n', '_contexto/empresa.md': 'molde\n', 'AGENTS.md': 'kit\n' })
  const projeto = montarProjeto(raiz, { [INICIAR]: 'novo\n', 'AGENTS.md': 'meu\n', '.claude/skills/pauta/SKILL.md': 'minha\n' })
  const plano = montarPlano({ kit, projeto })
  for (const c of ['_contexto/empresa.md', 'AGENTS.md', '.claude/skills/pauta/SKILL.md']) assert.equal(acaoDe(plano, c), undefined, c)
  assert.deepEqual(plano.mistos, ['AGENTS.md'])
}))

test('versao do projeto: o recibo manda; sem recibo, estima pela mais nova que bateu', () => comPasta(raiz => {
  const kit = montarKit(raiz, { [INICIAR]: 'novo\n', [BASTAO]: 'b35\n' },
    { [INICIAR]: { 'velho\n': '3.0' }, [BASTAO]: { 'b34\n': '3.4' } })
  const projeto = montarProjeto(raiz, { [INICIAR]: 'velho\n', [BASTAO]: 'b34\n' })
  const sem = montarPlano({ kit, projeto })
  assert.equal(sem.versaoProjeto, '3.4')
  assert.equal(sem.versaoEstimada, true)
  escrever(projeto, { '.sabinos/instalado.json': JSON.stringify({ versao: '3.3', arquivos: {}, mudancas: {} }) })
  const com = montarPlano({ kit, projeto })
  assert.equal(com.versaoProjeto, '3.3')
  assert.equal(com.versaoEstimada, false)
}))

// cenario comum: iniciar intocado (troca), bastao mexido (pergunta), setup saiu do kit
function cenario(raiz) {
  const kit = montarKit(raiz, { [INICIAR]: 'novo\n', [BASTAO]: 'bastao novo\n', 'AGENTS.md': 'kit\n' },
    { [INICIAR]: { 'velho\n': '3.0' }, [BASTAO]: { 'bastao velho\n': '3.0' }, [SETUP]: { 'setup\n': '3.0' } })
  const projeto = montarProjeto(raiz, {
    [INICIAR]: 'velho' + CRLF, [BASTAO]: 'bastao com nota minha\n', [SETUP]: 'setup\n', 'AGENTS.md': 'meu agents\n',
  })
  return { kit, projeto }
}
const ler = (projeto, rel) => readFileSync(join(projeto, rel), 'utf8')

test('aplicar copia so o aprovado, guarda backup e o recibo nao abencoa o mexido', () => comPasta(raiz => {
  const { kit, projeto } = cenario(raiz)
  const r = aplicarPlano({ kit, projeto, plano: montarPlano({ kit, projeto }) })
  assert.equal(ler(projeto, INICIAR), 'novo\n')
  assert.equal(ler(projeto, BASTAO), 'bastao com nota minha\n')
  assert.ok(existsSync(join(projeto, SETUP)), 'sugerir-remover nao sai sem aprovacao')
  const backup = join(projeto, '.sabinos', r.backup, 'arquivos')
  assert.equal(readFileSync(join(backup, INICIAR), 'utf8'), 'velho' + CRLF)
  assert.equal(readFileSync(join(backup, 'AGENTS.md'), 'utf8'), 'meu agents\n', 'misto sempre entra no backup')
  const recibo = JSON.parse(ler(projeto, '.sabinos/instalado.json'))
  assert.equal(recibo.versao, '3.5')
  assert.ok(recibo.arquivos[INICIAR])
  assert.equal(recibo.arquivos[BASTAO], undefined, 'arquivo mexido nao entra no recibo')
  assert.equal(acaoDe(montarPlano({ kit, projeto }), BASTAO), 'perguntar', 'continua perguntando na proxima')
}))

test('aplicar com tambem troca o mexido e remove o que saiu, com a pasta vazia junto', () => comPasta(raiz => {
  const { kit, projeto } = cenario(raiz)
  aplicarPlano({ kit, projeto, plano: montarPlano({ kit, projeto }), tambem: [BASTAO, SETUP] })
  assert.equal(ler(projeto, BASTAO), 'bastao novo\n')
  assert.ok(!existsSync(join(projeto, '.claude/skills/setup')))
}))

test('aplicar recusa aprovar caminho que nao e pergunta nem sugestao', () => comPasta(raiz => {
  const { kit, projeto } = cenario(raiz)
  assert.throws(() => aplicarPlano({ kit, projeto, plano: montarPlano({ kit, projeto }), tambem: ['_contexto/empresa.md'] }), /fora do plano/)
}))

test('desfazer volta os bytes de antes e apaga o que entrou', () => comPasta(raiz => {
  const extra = '.claude/skills/iniciar/extra.mjs'
  const kit = montarKit(raiz, { [INICIAR]: 'novo\n', [extra]: 'x\n' }, { [INICIAR]: { 'velho\n': '3.0' } })
  const projeto = montarProjeto(raiz, { [INICIAR]: 'velho' + CRLF })
  const r = aplicarPlano({ kit, projeto, plano: montarPlano({ kit, projeto }) })
  assert.ok(existsSync(join(projeto, extra)))
  desfazer({ projeto, backup: r.backup })
  assert.equal(ler(projeto, INICIAR), 'velho' + CRLF)
  assert.ok(!existsSync(join(projeto, extra)))
  assert.ok(!existsSync(join(projeto, '.sabinos/instalado.json')), 'recibo que nao existia sai junto')
}))

test('registrar mudanca grava no recibo e recusa estado invalido', () => comPasta(raiz => {
  const { kit, projeto } = cenario(raiz)
  aplicarPlano({ kit, projeto, plano: montarPlano({ kit, projeto }) })
  registrarMudanca({ projeto, id: 'regra-trava', estado: 'recusada', agora: new Date('2026-09-22T10:00:00Z') })
  assert.equal(JSON.parse(ler(projeto, '.sabinos/instalado.json')).mudancas['regra-trava'], 'recusada 2026-09-22')
  assert.throws(() => registrarMudanca({ projeto, id: 'x', estado: 'talvez' }), /estado invalido/)
}))

// linha de comando: roda o motor de verdade, como a skill roda
function rodar(args) {
  try {
    return { saida: execFileSync(process.execPath, [MOTOR, ...args], { encoding: 'utf8', stdio: 'pipe' }), codigo: 0 }
  } catch (e) {
    return { saida: (e.stdout || '') + (e.stderr || ''), codigo: e.status }
  }
}

test('linha de comando: plano mostra resumo, aplicar copia o motor pro projeto, conferir fica verde', () => comPasta(raiz => {
  const { kit, projeto } = cenario(raiz)
  const p = rodar(['plano', projeto, '--kit', kit])
  assert.equal(p.codigo, 0, p.saida)
  assert.match(p.saida, /Troca sem perguntar/)
  assert.ok(existsSync(join(projeto, '.sabinos/plano.json')))
  const a = rodar(['aplicar', projeto])
  assert.equal(a.codigo, 0, a.saida)
  assert.ok(existsSync(join(projeto, '.sabinos/atualizar-projeto.mjs')), 'desfazer precisa funcionar sem o kit baixado')
  assert.ok(!existsSync(join(projeto, '.sabinos/plano.json')))
  const c = rodar(['conferir', projeto, '--kit', kit])
  assert.equal(c.codigo, 0, c.saida)
  assert.match(c.saida, /em dia/)
}))

test('linha de comando: aplicar sem plano, com plano velho, ou fora de projeto falha', () => comPasta(raiz => {
  const { kit, projeto } = cenario(raiz)
  const semPlano = rodar(['aplicar', projeto])
  assert.equal(semPlano.codigo, 1)
  assert.match(semPlano.saida, /rode "plano"/)
  rodar(['plano', projeto, '--kit', kit])
  writeFileSync(join(projeto, INICIAR), 'mexi depois do plano\n')
  const velho = rodar(['aplicar', projeto])
  assert.equal(velho.codigo, 1)
  assert.match(velho.saida, /mudou depois do plano/)
  const fora = rodar(['plano', join(raiz, 'kit'), '--kit', kit])
  assert.equal(fora.codigo, 1)
  assert.match(fora.saida, /nao parece projeto/)
}))

test('desfazer devolve o arquivo removido e o mexido aprovado, com os bytes de antes', () => comPasta(raiz => {
  const { kit, projeto } = cenario(raiz)
  const r = aplicarPlano({ kit, projeto, plano: montarPlano({ kit, projeto }), tambem: [SETUP, BASTAO] })
  desfazer({ projeto, backup: r.backup, agora: new Date('2026-09-22T10:00:00Z') })
  assert.equal(ler(projeto, SETUP), 'setup\n')
  assert.equal(ler(projeto, BASTAO), 'bastao com nota minha\n')
}))

test('desfazer guarda copia de seguranca do estado atual antes de mexer, e usa o backup renomeado', () => comPasta(raiz => {
  const { kit, projeto } = cenario(raiz)
  const r = aplicarPlano({ kit, projeto, plano: montarPlano({ kit, projeto }) })
  writeFileSync(join(projeto, 'AGENTS.md'), 'editado depois\n')
  writeFileSync(join(projeto, INICIAR), 'novo\nnota extra\n')
  const d = desfazer({ projeto, backup: r.backup, agora: new Date('2026-09-22T10:00:00Z') })
  assert.match(d.seguranca, /^antes-desfazer-\d{8}-\d{6}$/)
  assert.ok(!existsSync(join(projeto, '.sabinos', r.backup)), 'o backup usado sai do nome antigo')
  assert.ok(existsSync(join(projeto, '.sabinos', `desfeito-${r.backup}`)), 'e vira desfeito-<nome>')
  const arquivosSeguranca = join(projeto, '.sabinos', d.seguranca, 'arquivos')
  assert.equal(readFileSync(join(arquivosSeguranca, 'AGENTS.md'), 'utf8'), 'editado depois\n')
}))

test('a copia de seguranca do desfazer pode ela mesma ser desfeita', () => comPasta(raiz => {
  const { kit, projeto } = cenario(raiz)
  const r = aplicarPlano({ kit, projeto, plano: montarPlano({ kit, projeto }) })
  writeFileSync(join(projeto, 'AGENTS.md'), 'editado depois\n')
  const d = desfazer({ projeto, backup: r.backup, agora: new Date('2026-09-22T10:00:00Z') })
  assert.equal(ler(projeto, 'AGENTS.md'), 'meu agents\n', 'o primeiro desfazer volta pro estado de antes de aplicar')
  desfazer({ projeto, backup: d.seguranca, agora: new Date('2026-09-22T10:05:00Z') })
  assert.equal(ler(projeto, 'AGENTS.md'), 'editado depois\n', 'desfazer a copia de seguranca traz de volta o que tinha antes dela')
}))

test('linha de comando desfazer escolhe a copia mais nova pela data no nome, nao pela ordem alfabetica', () => comPasta(raiz => {
  const projeto = montarProjeto(raiz, {})
  const dir = join(projeto, '.sabinos')
  for (const nome of ['antes-3.9-20260101-100000', 'antes-3.10-20260102-100000']) {
    mkdirSync(join(dir, nome, 'arquivos'), { recursive: true })
    writeFileSync(join(dir, nome, 'adicionados.json'), '[]')
  }
  const r = rodar(['desfazer', projeto])
  assert.equal(r.codigo, 0, r.saida)
  assert.match(r.saida, /Usando a mais nova \(antes-3\.10-20260102-100000\)/)
}))

const GITIGNORE = ['antes-*/', 'desfeito-*/', 'plano.json']
const linhasDe = (projeto) => ler(projeto, '.sabinos/.gitignore').split(/\r?\n/).filter(Boolean)

test('plano cria .sabinos/.gitignore com as tres linhas, e rodar de novo nao duplica', () => comPasta(raiz => {
  const { kit, projeto } = cenario(raiz)
  assert.equal(rodar(['plano', projeto, '--kit', kit]).codigo, 0)
  assert.deepEqual(linhasDe(projeto), GITIGNORE)
  assert.equal(rodar(['plano', projeto, '--kit', kit]).codigo, 0)
  assert.deepEqual(linhasDe(projeto), GITIGNORE)
}))

test('.gitignore da .sabinos: linha que a pessoa pos fica, e so entra o que falta', () => comPasta(raiz => {
  const { kit, projeto } = cenario(raiz)
  escrever(projeto, { '.sabinos/.gitignore': 'minha-linha' + CRLF + 'plano.json' + CRLF })
  assert.equal(rodar(['plano', projeto, '--kit', kit]).codigo, 0)
  assert.deepEqual(linhasDe(projeto), ['minha-linha', 'plano.json', 'antes-*/', 'desfeito-*/'])
  assert.ok(!/[^\r]\n/.test(ler(projeto, '.sabinos/.gitignore')), 'arquivo CRLF continua CRLF')
}))

test('aplicarPlano tambem garante o .gitignore da .sabinos', () => comPasta(raiz => {
  const { kit, projeto } = cenario(raiz)
  aplicarPlano({ kit, projeto, plano: montarPlano({ kit, projeto }) })
  assert.deepEqual(linhasDe(projeto), GITIGNORE)
}))

test('linha de comando: desfazer duas vezes sem --backup nao reaplica a atualizacao', () => comPasta(raiz => {
  const { kit, projeto } = cenario(raiz)
  assert.equal(rodar(['plano', projeto, '--kit', kit]).codigo, 0)
  assert.equal(rodar(['aplicar', projeto]).codigo, 0)
  const um = rodar(['desfazer', projeto])
  assert.equal(um.codigo, 0, um.saida)
  assert.equal(ler(projeto, INICIAR), 'velho' + CRLF)
  const dois = rodar(['desfazer', projeto])
  assert.equal(dois.codigo, 1, dois.saida)
  assert.match(dois.saida, /nenhuma copia/)
  assert.equal(ler(projeto, INICIAR), 'velho' + CRLF, 'a atualizacao nao voltou')
}))

test('desfazer: se nao der pra renomear a pasta, restaura mesmo assim e avisa', () => comPasta(raiz => {
  const { kit, projeto } = cenario(raiz)
  const r = aplicarPlano({ kit, projeto, plano: montarPlano({ kit, projeto }) })
  escrever(projeto, { [`.sabinos/desfeito-${r.backup}/ocupado.txt`]: 'x\n' })
  const d = desfazer({ projeto, backup: r.backup, agora: new Date('2026-09-22T10:00:00Z') })
  assert.equal(d.renomeado, false)
  assert.equal(ler(projeto, INICIAR), 'velho' + CRLF, 'os arquivos ja voltaram')
  assert.ok(existsSync(join(projeto, '.sabinos', r.backup)), 'a pasta ficou com o nome antigo')
}))

test('linha de comando: desfazer que nao renomeia sai com 0 e manda renomear a mao', () => comPasta(raiz => {
  const { kit, projeto } = cenario(raiz)
  const r = aplicarPlano({ kit, projeto, plano: montarPlano({ kit, projeto }) })
  escrever(projeto, { [`.sabinos/desfeito-${r.backup}/ocupado.txt`]: 'x\n' })
  const d = rodar(['desfazer', projeto, '--backup', r.backup])
  assert.equal(d.codigo, 0, d.saida)
  assert.match(d.saida, new RegExp(`nao consegui renomear .*${r.backup}; apague ou renomeie a mao`))
}))

test('registrar mudanca sem id recusa antes de gravar', () => comPasta(raiz => {
  const { kit, projeto } = cenario(raiz)
  aplicarPlano({ kit, projeto, plano: montarPlano({ kit, projeto }) })
  assert.throws(() => registrarMudanca({ projeto, estado: 'aplicada' }), /id obrigatorio/)
}))
