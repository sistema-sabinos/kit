// Testes do motor de atualizacao de projeto.
// Rodar: node --test _ferramentas/atualizar-projeto.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { hashArquivo, montarPlano, aplicarPlano, desfazer, registrarMudanca, mesclarSettings, resumo, TIRADAS_DO_KIT, compararMae, PERMISSOES_DO_KIT } from './atualizar-projeto.mjs'

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

test('recibo e mudanca levam a data do relogio da pessoa, nunca a de UTC', () => comPasta(raiz => {
  const { kit, projeto } = cenario(raiz)
  const noite = new Date(2026, 9, 5, 23, 30)   // 23h30 local: em UTC no Brasil ja seria dia 6
  aplicarPlano({ kit, projeto, plano: montarPlano({ kit, projeto }), agora: noite })
  registrarMudanca({ projeto, id: 'regra-trava', estado: 'aplicada', agora: noite })
  const r = JSON.parse(ler(projeto, '.sabinos/instalado.json'))
  assert.equal(r.data, '2026-10-05')
  assert.equal(r.mudancas['regra-trava'], 'aplicada 2026-10-05')
}))

// linha de comando: roda o motor de verdade, como a skill roda
function rodar(args, env = process.env) {
  try {
    return { saida: execFileSync(process.execPath, [MOTOR, ...args], { encoding: 'utf8', stdio: 'pipe', env }), codigo: 0 }
  } catch (e) {
    return { saida: (e.stdout || '') + (e.stderr || ''), codigo: e.status }
  }
}

test('linha de comando: opcao digitada errada ou sem valor para com erro, sem mexer em nada', () => comPasta(raiz => {
  const { kit, projeto } = cenario(raiz)
  const errada = rodar(['aplicar', projeto, '--kit', kit, '--tambme', 'checar'])
  assert.equal(errada.codigo, 1)
  assert.match(errada.saida, /opcao desconhecida: --tambme/)
  const sem = rodar(['plano', projeto, '--kit'])
  assert.equal(sem.codigo, 1)
  assert.match(sem.saida, /--kit precisa de um valor/)
  assert.ok(!existsSync(join(projeto, '.sabinos')), 'nada foi gravado')
}))

test('duas copias no mesmo segundo ganham nomes diferentes, na ordem certa', () => comPasta(raiz => {
  const { kit, projeto } = cenario(raiz)
  const mesmo = new Date(2026, 8, 22, 10, 0, 0)
  const a = aplicarPlano({ kit, projeto, plano: montarPlano({ kit, projeto }), agora: mesmo })
  const b = aplicarPlano({ kit, projeto, plano: montarPlano({ kit, projeto }), agora: mesmo })
  assert.notEqual(a.backup, b.backup)
  assert.ok(b.backup > a.backup, 'a segunda fica com o carimbo um segundo depois')
  const d1 = desfazer({ projeto, backup: b.backup, agora: mesmo })
  const d2 = desfazer({ projeto, backup: a.backup, agora: mesmo })
  assert.notEqual(d1.seguranca, d2.seguranca)
}))

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

test('aplicar em projeto sem recibo e tudo igual só registra, sem pasta antes-', () => comPasta(raiz => {
  const kit = montarKit(raiz, { [INICIAR]: 'novo\n', 'AGENTS.md': 'kit\n' })
  const projeto = montarProjeto(raiz, { [INICIAR]: 'novo\n', 'AGENTS.md': 'kit\n' })
  const r = aplicarPlano({ kit, projeto, plano: montarPlano({ kit, projeto }), registro: true })
  assert.ok(existsSync(join(projeto, '.sabinos/instalado.json')), 'canario: o recibo foi gravado')
  const nomes = readdirSync(join(projeto, '.sabinos'))
  assert.ok(nomes.length > 0, 'canario: .sabinos nao esta vazia')
  assert.deepEqual(nomes.filter(n => n.startsWith('antes-')), [])
  assert.equal(r.backup, null)
}))

test('atualizacao de projeto antigo sem recibo e tudo igual guarda o misto (sem --registro)', () => comPasta(raiz => {
  const kit = montarKit(raiz, { [INICIAR]: 'novo\n', 'AGENTS.md': 'kit\n' })
  const projeto = montarProjeto(raiz, { [INICIAR]: 'novo\n', 'AGENTS.md': 'do usuario\n' })
  const plano = montarPlano({ kit, projeto })
  assert.ok(plano.mistos.includes('AGENTS.md'), 'canario: AGENTS.md e misto no plano')
  const r = aplicarPlano({ kit, projeto, plano })
  assert.ok(r.backup, 'sem copia, o desfazer nao volta o AGENTS.md que a conversa mexer')
  assert.equal(ler(projeto, `.sabinos/${r.backup}/arquivos/AGENTS.md`), 'do usuario\n')
}))

test('linha de comando: registro do setup, depois atualizacao, desfazer sem --backup acha uma copia só', () => comPasta(raiz => {
  const kit = montarKit(raiz, { [INICIAR]: 'novo\n', 'AGENTS.md': 'kit\n' })
  const projeto = montarProjeto(raiz, { [INICIAR]: 'novo\n', 'AGENTS.md': 'kit\n' })
  assert.equal(rodar(['plano', projeto, '--kit', kit]).codigo, 0)
  const reg = rodar(['aplicar', projeto, '--registro'])
  assert.equal(reg.codigo, 0, reg.saida)
  assert.match(reg.saida, /Nada trocado; so o registro da versao\./)
  const kit2 = montarKit(join(raiz, 'v2'), { [INICIAR]: 'mais novo\n', 'AGENTS.md': 'kit\n' }, { [INICIAR]: { 'novo\n': '3.4' } })
  assert.equal(rodar(['plano', projeto, '--kit', kit2]).codigo, 0)
  const ap = rodar(['aplicar', projeto])
  assert.match(ap.saida, /Copia de seguranca: /, 'canario: a atualizacao de verdade fez copia')
  const d = rodar(['desfazer', projeto])
  assert.equal(d.codigo, 0, d.saida)
  assert.ok(!/Outras:/.test(d.saida), d.saida)
  assert.equal(ler(projeto, INICIAR), 'novo\n')
}))

test('linha de comando: registrar rodado de outra pasta (a pasta-mae) grava no recibo do projeto', () => comPasta(raiz => {
  const { kit, projeto } = cenario(raiz)
  aplicarPlano({ kit, projeto, plano: montarPlano({ kit, projeto }) })
  const mae = join(raiz, 'mae')
  mkdirSync(mae)
  const r = execFileSync(process.execPath, [MOTOR, 'registrar', projeto, 'skill-pedir', 'aplicada'], { cwd: mae, encoding: 'utf8' })
  assert.match(r, /Registrado: skill-pedir aplicada/)
  assert.match(JSON.parse(ler(projeto, '.sabinos/instalado.json')).mudancas['skill-pedir'], /^aplicada /)
  assert.ok(!existsSync(join(mae, '.sabinos')), 'nada gravado na pasta de onde rodou')
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

// Rodada 5.37: o video saiu do ML, e a gerar-imagens e o video-produto viraram componentes.
// Projeto montado como 5.32 (ML com a gerar-imagens, video com as tres skills), no kit de verdade:
// segue com tudo instalado e nada da gerar-imagens nem do video-produto aparece como saido do kit.
test('projeto 5.32 com o video antigo segue com video-produto e gerar-imagens, sem sugerir remover', () => comPasta(raiz => {
  const kit = fileURLToPath(new URL('../', import.meta.url))
  const skills = ['mercado-livre', 'gerar-imagens', 'configurar-video', 'video-produto', 'editar-video', 'assistir-video']
  const arquivos = { '.sabinos/instalado.json': JSON.stringify({ versao: '5.32', arquivos: {} }) }
  for (const s of skills) arquivos[`.claude/skills/${s}/SKILL.md`] = readFileSync(join(kit, '_modelo', '.claude', 'skills', s, 'SKILL.md'), 'utf8')
  const projeto = montarProjeto(raiz, arquivos)
  const plano = montarPlano({ kit, projeto })
  for (const c of ['mercado-livre', 'gerar-imagens', 'video', 'video-produto', 'assistir-video']) assert.equal(plano.componentes[c], 'instalado', c)
  assert.deepEqual(Object.keys(plano.puxadoPor).filter(c => c !== 'nucleo'), [])
  const saidos = plano.itens.filter(i => i.acao === 'sugerir-remover').map(i => i.caminho)
  assert.deepEqual(saidos.filter(c => /skills\/(gerar-imagens|video-produto|configurar-video|editar-video)\//.test(c)), [])
  assert.ok(plano.itens.some(i => i.caminho === '.claude/skills/video-produto/SKILL.md' && i.acao === 'igual'), 'canario: o SKILL.md do video-produto entrou no plano')
  assert.ok(!resumo(plano).includes('video-produto,') && !/ainda nao tem:.*(video-produto|gerar-imagens)/.test(resumo(plano)))
}))

test('componente video depende do assistir-video (o olho final do editar-video usa ele)', () => {
  const real = JSON.parse(readFileSync(fileURLToPath(new URL('./componentes.json', import.meta.url)), 'utf8'))
  assert.deepEqual(real.componentes.video.depende, ['nucleo', 'assistir-video', 'gerar-imagens'])
})

// Rodada 5.28: o settings.json e misto (metade do kit, metade da pessoa). O deny e a trava do MCP
// entram por juncao, sem tirar nada da pessoa. 5.49 (bloco B, 2026-11-03): o kit tirou o deny
// e o SessionStart do barrar-mcp, e so isso sai (TIRADAS_DO_KIT)
const SETTINGS_DO_KIT = JSON.parse(readFileSync(fileURLToPath(new URL('../_modelo/.claude/settings.json', import.meta.url)), 'utf8'))
const ehBlocoMcp = b => (b.hooks || []).some(h => typeof h.command === 'string' && h.command.includes('barrar-mcp.mjs'))
// 5.49 (bloco B): o ask da pessoa era o Read(./.env) antigo, que agora sai; vira um ask dela de verdade
const SETTINGS_DA_PESSOA = {
  permissions: { allow: ['Bash(npm test)'], ask: ['Bash(git push)'], deny: ['Read(./meu/**)'] },
  hooks: {
    PreToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'node meu-hook.mjs' }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'node outro.mjs' }] }],
  },
}

// 5.52 (chat 3, Task 3c): o kit voltou a ter permissions, so o ask da permissao escrita e o allow da lista fechada
const FALTA_DO_KIT = [...PERMISSOES_DO_KIT.ask.map(r => `ask ${r}`), ...PERMISSOES_DO_KIT.allow.map(r => `allow ${r}`)]
test('mesclarSettings junta a trava do mcp sem tirar nada da pessoa e e idempotente', () => {
  assert.deepEqual(SETTINGS_DO_KIT.permissions, PERMISSOES_DO_KIT, 'canario: o settings do kit traz a lista fechada exportada (5.52)')
  assert.ok(PERMISSOES_DO_KIT.allow.length > 0 && PERMISSOES_DO_KIT.ask.length > 0, 'canario: a lista fechada nao veio vazia')
  const { settings, faltava, tirou } = mesclarSettings(structuredClone(SETTINGS_DA_PESSOA), SETTINGS_DO_KIT)
  // 5.52 (chat 3, Task 3c): allow, ask e deny da pessoa ficam, na frente, e o do kit entra depois
  assert.deepEqual(settings.permissions, {
    allow: [...SETTINGS_DA_PESSOA.permissions.allow, ...PERMISSOES_DO_KIT.allow],
    ask: [...SETTINGS_DA_PESSOA.permissions.ask, ...PERMISSOES_DO_KIT.ask],
    deny: SETTINGS_DA_PESSOA.permissions.deny,
  })
  assert.ok(settings.hooks.PreToolUse.some(b => b.matcher === 'Write'), 'o hook da pessoa fica')
  assert.equal(settings.hooks.PreToolUse.filter(ehBlocoMcp).length, 1)
  assert.deepEqual(settings.hooks.PreToolUse.find(ehBlocoMcp), SETTINGS_DO_KIT.hooks.PreToolUse.find(ehBlocoMcp))
  assert.deepEqual(settings.hooks.Stop, SETTINGS_DA_PESSOA.hooks.Stop, 'o Stop sem auto-sync fica como a pessoa deixou')
  // 5.49 (bloco B): o deny e a anotacao do navegador sairam do kit; 5.52 (chat 3): o ask e o allow do kit faltam
  // 5.54 (C2): e o aviso de fechamento nos dois eventos
  assert.deepEqual(faltava, [...FALTA_DO_KIT, 'trava do MCP (barrar-mcp)', 'aviso de fechamento (inicio da conversa)', 'aviso de fechamento (antes de compactar)'])
  assert.deepEqual(tirou, [])
  // sem permissions da pessoa, o permissions nasce so com o do kit
  assert.deepEqual(mesclarSettings({}, SETTINGS_DO_KIT).settings.permissions, { ask: PERMISSOES_DO_KIT.ask, allow: PERMISSOES_DO_KIT.allow })
  const segunda = mesclarSettings(structuredClone(settings), SETTINGS_DO_KIT)
  assert.deepEqual(segunda.settings, settings, 'a segunda passada nao muda nada')
  assert.deepEqual(segunda.faltava, [])
  // bloco antigo da trava do mcp (sem o onFailure) e trocado pelo do kit, nunca duplicado
  const velho = structuredClone(settings)
  velho.hooks.PreToolUse.find(ehBlocoMcp).hooks[0].onFailure = undefined
  const trocado = mesclarSettings(JSON.parse(JSON.stringify(velho)), SETTINGS_DO_KIT)
  assert.equal(trocado.settings.hooks.PreToolUse.filter(ehBlocoMcp).length, 1)
  assert.deepEqual(trocado.settings.hooks.PreToolUse.find(ehBlocoMcp), SETTINGS_DO_KIT.hooks.PreToolUse.find(ehBlocoMcp))
  assert.deepEqual(trocado.faltava, ['trava do MCP (barrar-mcp)'])
  // hook da pessoa no mesmo bloco da chamada antiga da trava fica, com o matcher dela (Codex comum)
  const misturado = structuredClone(SETTINGS_DA_PESSOA)
  misturado.hooks.PreToolUse.push({ matcher: 'mcp__x__.*', hooks: [{ type: 'command', command: 'node barrar-mcp.mjs' }, { type: 'command', command: 'node auditoria.mjs' }] })
  misturado.hooks.PreToolUse.push({ matcher: 'Bash', hooks: [{ type: 'command', command: 'node regra.mjs --nome barrar-mcp' }] })
  const junto = mesclarSettings(misturado, SETTINGS_DO_KIT).settings
  assert.ok(junto.hooks.PreToolUse.some(b => b.matcher === 'Bash' && b.hooks[0].command === 'node regra.mjs --nome barrar-mcp'), 'hook que so cita a palavra sumiu')
  assert.ok(junto.hooks.PreToolUse.some(b => b.matcher === 'mcp__x__.*' && b.hooks.length === 1 && b.hooks[0].command === 'node auditoria.mjs'), 'o hook de auditoria da pessoa sumiu')
  assert.equal(junto.hooks.PreToolUse.filter(ehBlocoMcp).length, 1)
  assert.deepEqual(junto.hooks.PreToolUse.find(ehBlocoMcp), SETTINGS_DO_KIT.hooks.PreToolUse.find(ehBlocoMcp))
})

// final do Codex no fechamento da 5.28: so e a trava o hook cujo script e o barrar-mcp.mjs; o nome como
// argumento de outro script fica
test('mesclarSettings guarda hook da pessoa que passa barrar-mcp.mjs como argumento', () => {
  const pessoa = structuredClone(SETTINGS_DA_PESSOA)
  const argumento = 'node auditoria.mjs --arquivo barrar-mcp.mjs'
  pessoa.hooks.PreToolUse.push({ matcher: 'Write', hooks: [{ type: 'command', command: argumento }] })
  pessoa.hooks.PreToolUse.push({ matcher: 'mcp__.*', hooks: [{ type: 'command', command: 'node "C:/Users/Fulano de Tal/p/.claude/hooks/barrar-mcp.mjs"' }] })
  // volta 2 (comum): opcao do node antes do script segue sendo a trava
  pessoa.hooks.PreToolUse.push({ matcher: 'mcp__.*', hooks: [{ type: 'command', command: 'node --no-warnings "C:/Fulano de Tal/.claude/hooks/barrar-mcp.mjs"' }] })
  const { settings } = mesclarSettings(pessoa, SETTINGS_DO_KIT)
  assert.ok(settings.hooks.PreToolUse.some(b => b.matcher === 'Write' && b.hooks[0].command === argumento), 'o hook com o nome no argumento sumiu')
  assert.ok(!JSON.stringify(settings).includes('Fulano de Tal'), 'a chamada antiga da trava, com espaco no caminho, devia sair')
  assert.equal(settings.hooks.PreToolUse.filter(b => b.matcher === 'mcp__.*').length, 1)
})

// 5.49 (bloco B, 2026-11-03): o settings do projeto da 5.39, com o deny, o ask velho e o
// SessionStart do barrar-mcp que o kit tirou, e o que a pessoa pos por conta
const SETTINGS_DA_539 = {
  permissions: {
    allow: ['Bash(npm test)'],
    ask: ['Read(./.env)', 'Read(./.env.*)', 'Bash(git push)'],
    deny: [...TIRADAS_DO_KIT.deny, 'Read(./meu/**)'],
  },
  hooks: {
    PreToolUse: [SETTINGS_DO_KIT.hooks.PreToolUse.find(ehBlocoMcp)],
    SessionStart: [
      { matcher: 'startup', hooks: [{ type: 'command', command: 'node boas-vindas.mjs' }] },
      { hooks: [{ type: 'command', command: 'node "${CLAUDE_PROJECT_DIR}/.claude/hooks/barrar-mcp.mjs"' }, { type: 'command', command: 'node lembrete.mjs' }] },
      { hooks: [{ type: 'command', command: 'node .claude/hooks/barrar-mcp.mjs' }] },
    ],
  },
}

test('mesclarSettings tira o que o kit tirou e deixa o que e da pessoa', () => {
  assert.ok(TIRADAS_DO_KIT.deny.length >= 16 && TIRADAS_DO_KIT.ask.length === 2, 'canario: a lista das tiradas nao veio vazia')
  const { settings, faltava, tirou } = mesclarSettings(structuredClone(SETTINGS_DA_539), SETTINGS_DO_KIT)
  // 5.52 (chat 3, Task 3c): o ask e o allow do kit entram junto do que fica da pessoa
  // 5.54 (C2): e o aviso de fechamento entra no fim do SessionStart e no PreCompact
  assert.deepEqual(faltava, [...FALTA_DO_KIT, 'aviso de fechamento (inicio da conversa)', 'aviso de fechamento (antes de compactar)'])
  assert.deepEqual(settings.permissions, { allow: ['Bash(npm test)', ...PERMISSOES_DO_KIT.allow], ask: ['Bash(git push)', ...PERMISSOES_DO_KIT.ask], deny: ['Read(./meu/**)'] })
  assert.deepEqual(settings.hooks.SessionStart, [
    { matcher: 'startup', hooks: [{ type: 'command', command: 'node boas-vindas.mjs' }] },
    { hooks: [{ type: 'command', command: 'node lembrete.mjs' }] },
    ...SETTINGS_DO_KIT.hooks.SessionStart,
  ], 'o hook da pessoa fica, inclusive o que dividia o bloco com a trava')
  assert.equal(tirou.length, TIRADAS_DO_KIT.deny.length + 2 + 1, tirou.join(', '))
  assert.ok(tirou.includes('ask Read(./.env.*)') && tirou.includes('anotação do navegador (barrar-mcp)'), tirou.join(', '))
  const segunda = mesclarSettings(structuredClone(settings), SETTINGS_DO_KIT)
  assert.deepEqual([segunda.settings, segunda.faltava, segunda.tirou], [settings, [], []], 'a segunda passada nao muda nada')
  // so as tiradas: o deny some inteiro e o permissions fica so com o do kit (5.52), e do SessionStart
  // sobra so o do kit (5.54, C2)
  const soDoKit = mesclarSettings({ permissions: { deny: [...TIRADAS_DO_KIT.deny] }, hooks: { SessionStart: [SETTINGS_DA_539.hooks.SessionStart[2]] } }, SETTINGS_DO_KIT).settings
  assert.deepEqual(soDoKit.permissions, { ask: PERMISSOES_DO_KIT.ask, allow: PERMISSOES_DO_KIT.allow })
  assert.deepEqual(soDoKit.hooks.SessionStart, SETTINGS_DO_KIT.hooks.SessionStart)
  // sem nada do kit em permissions, o permissions some inteiro
  const semKit = mesclarSettings({ permissions: { deny: [...TIRADAS_DO_KIT.deny] } }, { hooks: SETTINGS_DO_KIT.hooks }).settings
  assert.equal(semKit.permissions, undefined)
  // regra que o kit voltar a pedir nao sai
  const pede = mesclarSettings(structuredClone(SETTINGS_DA_539), { ...SETTINGS_DO_KIT, permissions: { deny: ['Read(./.env)'] } })
  assert.ok(pede.settings.permissions.deny.includes('Read(./.env)'))
  // 5.52 (chat 3, Task 3c): o TIRADAS_DO_KIT.allow nasce vazio, entao nenhum allow da pessoa sai
  assert.deepEqual(TIRADAS_DO_KIT.allow, [])
})

// 5.54 (C2): o aviso de fechamento entra no SessionStart e no PreCompact do projeto ja instalado. Toda
// chamada do aviso-fechamento.mjs sai pela regex do nome do script e entra o bloco do kit, entao comando
// de outra versao ou bloco mexido pela pessoa vira um so; o resto do bloco da pessoa fica
const EVENTOS_DO_AVISO = ['SessionStart', 'PreCompact']
// chamada do script (caminho com barra antes do nome); o nome so como argumento de outro nao conta
const ehAviso = h => typeof h?.command === 'string' && /\/aviso-fechamento\.mjs"?$/.test(h.command)
const chamadasDoAviso = lista => (lista ?? []).flatMap(b => b.hooks || []).filter(ehAviso).length
const blocoAvisoDoKit = ev => SETTINGS_DO_KIT.hooks[ev].find(b => (b.hooks || []).some(ehAviso))

test('mesclarSettings junta o aviso de fechamento nos dois eventos e a segunda rodada nao duplica', () => {
  for (const ev of EVENTOS_DO_AVISO) assert.equal(chamadasDoAviso(SETTINGS_DO_KIT.hooks[ev]), 1, `canario: o kit chama o aviso no ${ev}`)
  const { settings, faltava } = mesclarSettings(structuredClone(SETTINGS_DA_PESSOA), SETTINGS_DO_KIT)
  for (const ev of EVENTOS_DO_AVISO) {
    assert.equal(chamadasDoAviso(settings.hooks[ev]), 1, ev)
    assert.ok(settings.hooks[ev].some(b => JSON.stringify(b) === JSON.stringify(blocoAvisoDoKit(ev))), ev)
  }
  assert.deepEqual(faltava, [...FALTA_DO_KIT, 'trava do MCP (barrar-mcp)', 'aviso de fechamento (inicio da conversa)', 'aviso de fechamento (antes de compactar)'])
  const segunda = mesclarSettings(structuredClone(settings), SETTINGS_DO_KIT)
  assert.deepEqual([segunda.settings, segunda.faltava, segunda.tirou], [settings, [], []], 'a segunda passada nao muda nada')
})

test('mesclarSettings: bloco antigo do aviso com comando diferente vira um so, e o hook da pessoa fica', () => {
  const velho = 'node --no-warnings "C:/Fulano de Tal/p/.claude/hooks/aviso-fechamento.mjs"'
  const argumento = 'node registro.mjs --sobre aviso-fechamento.mjs'
  const pessoa = structuredClone(SETTINGS_DA_PESSOA)
  pessoa.hooks.SessionStart = [
    { matcher: 'startup', hooks: [{ type: 'command', command: 'node boas-vindas.mjs' }] },
    { hooks: [{ type: 'command', command: velho }, { type: 'command', command: 'node lembrete.mjs' }] },
    { hooks: [{ type: 'command', command: argumento }] },
  ]
  // o do kit mexido pela pessoa (timeout) e, junto, o bloco igual ao do kit
  const mexido = structuredClone(blocoAvisoDoKit('PreCompact'))
  mexido.hooks[0].timeout = 5
  pessoa.hooks.PreCompact = [mexido, structuredClone(blocoAvisoDoKit('PreCompact'))]
  const { settings } = mesclarSettings(pessoa, SETTINGS_DO_KIT)
  for (const ev of EVENTOS_DO_AVISO) {
    assert.equal(chamadasDoAviso(settings.hooks[ev]), 1, `${ev}: ${JSON.stringify(settings.hooks[ev])}`)
    assert.ok(settings.hooks[ev].some(b => JSON.stringify(b) === JSON.stringify(blocoAvisoDoKit(ev))), ev)
  }
  assert.ok(!JSON.stringify(settings).includes('Fulano de Tal'), 'a chamada antiga do aviso devia sair')
  assert.deepEqual(settings.hooks.SessionStart.slice(0, 3), [
    { matcher: 'startup', hooks: [{ type: 'command', command: 'node boas-vindas.mjs' }] },
    { hooks: [{ type: 'command', command: 'node lembrete.mjs' }] },
    { hooks: [{ type: 'command', command: argumento }] },
  ], 'o SessionStart da pessoa fica, inclusive o hook que dividia o bloco e o que so cita o nome')
})

// 5.54 (C2, revisao interna): o PreCompact da pessoa fica, o que divide o bloco com a chamada velha e o solto
test('mesclarSettings: o PreCompact da pessoa fica, inclusive o que dividia o bloco com o aviso antigo', () => {
  const pessoa = structuredClone(SETTINGS_DA_PESSOA)
  pessoa.hooks.PreCompact = [
    { hooks: [{ type: 'command', command: 'node meu-resumo.mjs' }] },
    { hooks: [{ type: 'command', command: 'node "C:/velho/.claude/hooks/aviso-fechamento.mjs"' }, { type: 'command', command: 'node minha-copia.mjs' }] },
  ]
  const { settings, faltava } = mesclarSettings(pessoa, SETTINGS_DO_KIT)
  assert.ok(faltava.includes('aviso de fechamento (antes de compactar)'), 'canario: o PreCompact foi remexido')
  assert.deepEqual(settings.hooks.PreCompact, [
    { hooks: [{ type: 'command', command: 'node meu-resumo.mjs' }] },
    { hooks: [{ type: 'command', command: 'node minha-copia.mjs' }] },
    blocoAvisoDoKit('PreCompact'),
  ])
})

test('mesclarSettings: o barrar-mcp antigo no SessionStart sai e o aviso fica', () => {
  const mcpVelho = SETTINGS_DA_539.hooks.SessionStart[2]
  const so = mesclarSettings({ hooks: { SessionStart: [structuredClone(mcpVelho)] } }, SETTINGS_DO_KIT)
  assert.deepEqual(so.settings.hooks.SessionStart, [blocoAvisoDoKit('SessionStart')])
  assert.ok(so.tirou.includes(TIRADAS_DO_KIT.SessionStart), so.tirou.join(', '))
  const junto = mesclarSettings({ hooks: { SessionStart: [structuredClone(blocoAvisoDoKit('SessionStart')), structuredClone(mcpVelho)] } }, SETTINGS_DO_KIT)
  assert.deepEqual(junto.settings.hooks.SessionStart, [blocoAvisoDoKit('SessionStart')])
  assert.ok(!junto.faltava.includes('aviso de fechamento (inicio da conversa)'), junto.faltava.join(', '))
})

// o recibo regravado leva o corte do aviso: nasce no primeiro aplicar e nunca muda depois
test('aplicar grava o avisoFechamentoDesde: nasce com o --registro e o segundo aplicar nao muda', () => comPasta(raiz => {
  const kit = montarKit(raiz, { [INICIAR]: 'novo\n' })
  const projeto = montarProjeto(raiz, { [INICIAR]: 'novo\n' })
  const noite = new Date(2026, 10, 9, 23, 30)   // 23h30 local: em UTC no Brasil ja seria dia 10
  aplicarPlano({ kit, projeto, plano: montarPlano({ kit, projeto }), registro: true, agora: noite })
  assert.equal(JSON.parse(ler(projeto, '.sabinos/instalado.json')).avisoFechamentoDesde, '2026-11-09')
  aplicarPlano({ kit, projeto, plano: montarPlano({ kit, projeto }), agora: new Date(2026, 11, 1, 10) })
  const r = JSON.parse(ler(projeto, '.sabinos/instalado.json'))
  assert.equal(r.data, '2026-12-01', 'canario: o segundo aplicar regravou o recibo')
  assert.equal(r.avisoFechamentoDesde, '2026-11-09')
}))

test('desfazer a atualizacao que trouxe o aviso tira o hook e o campo juntos', () => comPasta(raiz => {
  const AVISO = '.claude/hooks/aviso-fechamento.mjs'
  const kit = montarKit(raiz, { [INICIAR]: 'novo\n', [AVISO]: 'aviso\n' }, { [INICIAR]: { 'velho\n': '3.0' } })
  escrever(kit, { '_ferramentas/componentes.json': JSON.stringify({
    ...COMPONENTES, componentes: { ...COMPONENTES.componentes, nucleo: { depende: [], caminhos: ['.claude/skills/iniciar/', AVISO] } },
  }) })
  const reciboAntigo = JSON.stringify({ versao: '3.0', data: '2026-01-01', arquivos: {}, mudancas: { x: 'aplicada 2026-01-01' } }, null, 2) + '\n'
  const projeto = montarProjeto(raiz, { [INICIAR]: 'velho\n', '.sabinos/instalado.json': reciboAntigo })
  const r = aplicarPlano({ kit, projeto, plano: montarPlano({ kit, projeto }), agora: new Date(2026, 10, 9, 10) })
  assert.ok(existsSync(join(projeto, AVISO)), 'canario: o aplicar trouxe o hook')
  assert.equal(JSON.parse(ler(projeto, '.sabinos/instalado.json')).avisoFechamentoDesde, '2026-11-09')
  desfazer({ projeto, backup: r.backup })
  assert.ok(!existsSync(join(projeto, AVISO)), 'o hook sai no desfazer')
  assert.equal(ler(projeto, '.sabinos/instalado.json'), reciboAntigo, 'o recibo volta sem o campo')
}))

test('plano avisa settings.json sem as travas do kit e com o que o kit tirou', () => comPasta(raiz => {
  const kit = montarKit(raiz, { [INICIAR]: 'novo\n', '.claude/settings.json': JSON.stringify(SETTINGS_DO_KIT) })
  const projeto = montarProjeto(raiz, { [INICIAR]: 'novo\n', '.claude/settings.json': JSON.stringify(SETTINGS_DA_PESSOA) })
  // 5.52 (chat 3, Task 3c): faltam a trava do mcp, o ask e o allow do kit; 5.54 (C2): e o aviso de
  // fechamento nos dois eventos
  const faltam = 1 + FALTA_DO_KIT.length + 2
  assert.ok(resumo(montarPlano({ kit, projeto })).split('\n').includes(`settings.json: faltam ${faltam} regra(s) ou trava(s) do kit; rodar o passo settings`))
  writeFileSync(join(projeto, '.claude/settings.json'), JSON.stringify(SETTINGS_DO_KIT))
  assert.ok(!/settings\.json: (faltam|sobram)/.test(resumo(montarPlano({ kit, projeto }))), 'com tudo junto, o aviso some')
  writeFileSync(join(projeto, '.claude/settings.json'), JSON.stringify(SETTINGS_DA_539))
  const n = TIRADAS_DO_KIT.deny.length + 3
  assert.ok(resumo(montarPlano({ kit, projeto })).split('\n').includes(`settings.json: sobram ${n} regra(s) ou trava(s) que o kit tirou; rodar o passo settings`))
}))

test('CLI settings mostra antes e depois, so grava com --gravar, e recusa gravar sem o barrar-mcp.mjs ou o aviso-fechamento.mjs no projeto', () => comPasta(raiz => {
  const kit = montarKit(raiz, { [INICIAR]: 'novo\n', '.claude/settings.json': JSON.stringify(SETTINGS_DO_KIT) })
  const original = JSON.stringify(SETTINGS_DA_PESSOA, null, 2) + '\n'
  const projeto = montarProjeto(raiz, { '.claude/settings.json': original })
  const mostra = rodar(['settings', projeto, '--kit', kit])
  assert.equal(mostra.codigo, 0, mostra.saida)
  assert.match(mostra.saida, /antes/)
  assert.match(mostra.saida, /depois/)
  // 5.52 (chat 3, Task 3c): o antes e o depois mostram o allow, e o depois traz o do kit
  const depois = mostra.saida.split('\n').find(l => l.startsWith('depois: '))
  assert.ok(depois, 'canario: a linha do depois saiu')
  assert.deepEqual(JSON.parse(depois.slice('depois: '.length)).allow, [...SETTINGS_DA_PESSOA.permissions.allow, ...PERMISSOES_DO_KIT.allow])
  assert.match(mostra.saida, /^antes: \{.*"allow":\["Bash\(npm test\)"\]/m)
  assert.equal(ler(projeto, '.claude/settings.json'), original, 'sem --gravar o arquivo fica igual')
  const sem = rodar(['settings', projeto, '--kit', kit, '--gravar'])
  assert.equal(sem.codigo, 1)
  assert.match(sem.saida, /rodar o aplicar antes/)
  assert.equal(ler(projeto, '.claude/settings.json'), original, 'sem o barrar-mcp.mjs o arquivo fica igual')
  escrever(projeto, { '.claude/hooks/barrar-mcp.mjs': 'x\n' })
  // 5.54 (C2, revisao interna): o merge junta a chamada do aviso, entao sem o script o gravar recusa
  assert.ok(EVENTOS_DO_AVISO.every(ev => chamadasDoAviso(mesclarSettings(structuredClone(SETTINGS_DA_PESSOA), SETTINGS_DO_KIT).settings.hooks[ev]) === 1), 'canario: o merge chama o aviso')
  const semAviso = rodar(['settings', projeto, '--kit', kit, '--gravar'])
  assert.ok(recusou(semAviso, 'settings-sem-trava'), semAviso.saida)
  assert.match(semAviso.saida, /aviso-fechamento\.mjs/)
  assert.equal(ler(projeto, '.claude/settings.json'), original, 'sem o aviso-fechamento.mjs o arquivo fica igual')
  escrever(projeto, { '.claude/hooks/aviso-fechamento.mjs': 'x\n' })
  const grava = rodar(['settings', projeto, '--kit', kit, '--gravar'])
  assert.equal(grava.codigo, 0, grava.saida)
  const gravado = ler(projeto, '.claude/settings.json')
  assert.ok(!gravado.includes(CRLF) && gravado.endsWith('}\n'), 'LF, com quebra no fim')
  assert.deepEqual(JSON.parse(gravado), mesclarSettings(structuredClone(SETTINGS_DA_PESSOA), SETTINGS_DO_KIT).settings)
  assert.match(gravado, /^\{\n {2}"permissions"/)
}))

// 5.49 (bloco B, 2026-11-03): recusa que segura a IA comeca com o nome da trava e da regra
const FIM_DA_RECUSA = 'Diga ao usuário o nome da trava e da regra e decida o próximo passo; não refaça esta ação por outro caminho.'
// a recusa sai no stderr numa linha so, depois do que o comando ja tinha mostrado
const recusou = (r, regra) => r.codigo === 1 && r.saida.split('\n').some(l => l.startsWith(`Barrada pela trava atualizar-projeto, regra ${regra}: `) && l.endsWith(FIM_DA_RECUSA))

test('linha de comando: as recusas saem no formato da trava, e erro de uso segue com erro:', () => comPasta(raiz => {
  const { kit, projeto } = cenario(raiz)
  const fora = rodar(['plano', join(raiz, 'kit'), '--kit', kit])
  assert.ok(recusou(fora, 'fora-de-projeto'), fora.saida)
  rodar(['plano', projeto, '--kit', kit])
  writeFileSync(join(projeto, INICIAR), 'mexi depois do plano\n')
  const velho = rodar(['aplicar', projeto])
  assert.ok(recusou(velho, 'plano-velho'), velho.saida)
  rodar(['plano', projeto, '--kit', kit])
  const aprovar = rodar(['aplicar', projeto, '--tambem', '_contexto/empresa.md'])
  assert.ok(recusou(aprovar, 'aprovar-fora-do-plano'), aprovar.saida)
  escrever(kit, { '_modelo/.claude/settings.json': JSON.stringify(SETTINGS_DO_KIT) })
  escrever(projeto, { '.claude/settings.json': JSON.stringify(SETTINGS_DA_PESSOA) })
  const sem = rodar(['settings', projeto, '--kit', kit, '--gravar'])
  assert.ok(recusou(sem, 'settings-sem-trava'), sem.saida)
  const uso = rodar(['plano', projeto, '--tambme', 'x'])
  assert.ok(uso.codigo === 1 && uso.saida.startsWith('erro: opcao desconhecida'), 'canario: erro de uso fica como era')
}))

// pasta-mae e kit novo de mentira: as duas com o minimo que o mae confere
function comMae(fn) {
  return comPasta(raiz => {
    const base = { '_modelo/AGENTS.md': 'agents\n', '.claude/skills/setup/SKILL.md': 'setup\n', 'README.md': 'leia\n' }
    const mae = join(raiz, 'mae')
    const kitNovo = join(raiz, 'kit-novo')
    // 5.49 (revisao do bloco B, 2026-11-03): entram o y.md do kit que a pessoa editou (caminho com
    // impressao, conteudo desconhecido), a tabela de impressoes velha, a skill e o template da pessoa, o
    // lixo gerado e o arquivo do kit que saiu; a tabela "mae" cobre o docs/guia.md
    escrever(mae, { ...base, VERSAO: '5.39\n',
      '_modelo/.claude/skills/a/SKILL.md': 'velho\n', '_modelo/.claude/skills/b/SKILL.md': 'mexi\n',
      '_modelo/x.md': 'velho' + CRLF, '_modelo/y.md': 'eu mexi\n', '_modelo/velho.md': 'saiu\n',
      '_modelo/templates/meu.md': 'meu\n', '_modelo/s/__pycache__/a.cpython-312.pyc': 'lixo\n',
      'docs/guia.md': 'guia antigo\n', 'docs/outro.md': 'eu\n', '.claude/skills/velha/SKILL.md': 'velha\n',
      '.claude/skills/minha-skill/SKILL.md': 'minha\n', '_ferramentas/impressoes.json': '{"versao":"5.39"}\n',
      'Projeto-01/_contexto/empresa.md': 'minha\n', '.env': 'X=1\n' })
    const impressao = txt => hashArquivo(Buffer.from(txt))
    escrever(kitNovo, { ...base, VERSAO: '5.41\n',
      '_modelo/.claude/skills/a/SKILL.md': 'novo a\n', '_modelo/.claude/skills/b/SKILL.md': 'novo b\n',
      '_modelo/x.md': 'novo x\n', '_modelo/y.md': 'novo y\n', 'docs/guia.md': 'guia novo\n', 'docs/outro.md': 'outro\n',
      '_ferramentas/novo.mjs': 'x\n',
      '_ferramentas/impressoes.json': JSON.stringify({ versao: '5.41', arquivos: {
        // o mexi so e conhecido noutro caminho: a impressao vale por caminho
        '.claude/skills/a/SKILL.md': { [impressao('velho\n')]: '5.39' },
        '.claude/skills/c/SKILL.md': { [impressao('mexi\n')]: '5.20' },
        'x.md': { [impressao('velho\n')]: '5.30' },
        'y.md': { [impressao('y do kit\n')]: '5.30' },
        'velho.md': { [impressao('saiu\n')]: '5.30' },
      }, mae: {
        'docs/guia.md': { [impressao('guia antigo\n')]: '5.39' },
        '.claude/skills/velha/SKILL.md': { [impressao('velha\n')]: '5.20' },
      } }) })
    return fn({ raiz, mae, kitNovo })
  })
}

test('mae: separa novo, mudou sem mexer, editado e o que some, e igual nao aparece', () => comMae(({ mae, kitNovo }) => {
  const g = compararMae({ kitNovo, mae })
  assert.deepEqual(g, {
    novo: ['_ferramentas/novo.mjs'],
    // o x.md da pasta-mae esta em CRLF: conta como o mesmo conteudo; a tabela de impressoes e gerada
    'mudou-sem-mexer': ['VERSAO', '_ferramentas/impressoes.json', '_modelo/.claude/skills/a/SKILL.md', '_modelo/x.md', 'docs/guia.md'],
    // sem impressao vale editado, a regra segura; o y.md tem impressao, mas de outro conteudo
    editado: ['_modelo/.claude/skills/b/SKILL.md', '_modelo/y.md', 'docs/outro.md'],
    // so o que o kit ja entregou; a skill, o template e o lixo da pessoa ficam fora
    sumiu: ['.claude/skills/velha/SKILL.md', '_modelo/velho.md'],
  })
  const todos = Object.values(g).flat()
  assert.ok(!todos.some(r => r.startsWith('Projeto-01/') || r === '.env' || r === 'README.md'), 'projeto, .env e o igual ficam fora')
  assert.ok(!todos.some(r => r.includes('minha-skill') || r.includes('templates/meu') || r.endsWith('.pyc')), 'o que e da pessoa nao vira "saiu do kit"')
}))

test('linha de comando mae: lista os quatro grupos e recusa pasta que nao e kit', () => comMae(({ raiz, mae, kitNovo }) => {
  const r = rodar(['mae', kitNovo, '--mae', mae])
  assert.equal(r.codigo, 0, r.saida)
  assert.ok(r.saida.startsWith('Pasta-mae na versao 5.39, kit novo na 5.41.'), r.saida)
  for (const linha of ['Novo (entra no sim so): 1', 'Mudou e ninguem mexeu (entra no sim so): 5', 'Editado na pasta-mae (pergunta um por um): 3',
    'Some, saiu do kit (pergunta um por um): 2', '  - docs/outro.md', '  - .claude/skills/velha/SKILL.md'])
    assert.ok(r.saida.split('\n').includes(linha), `sem a linha ${linha}: ${r.saida}`)
  const naoKit = rodar(['mae', join(raiz, 'nada'), '--mae', mae])
  assert.ok(recusou(naoKit, 'fora-do-kit'), naoKit.saida)
}))

// 5.54 (comum do Bloco C): o mae e o passo de comparar e roda antes do "pode aplicar?"; gravar ali mudava
// o settings do computador sem o sim. Os 30 dias vem do aplicar do projeto, que o /atualizar-sabinos ja
// instalado roda depois do sim, com o motor da versao nova. Home de mentira com prazo escolhido (90).
function comHomeEKits(fn) {
  return comMae(({ raiz, mae, kitNovo }) => {
    const home = join(raiz, 'home')
    mkdirSync(join(home, '.claude'), { recursive: true })
    const arq = join(home, '.claude', 'settings.json')
    writeFileSync(arq, '{"desktopSessionCleanupPeriodDays": 90}\n')
    const env = { ...process.env, HOME: home, USERPROFILE: home }
    const script = readFileSync(new URL('./historico-app.mjs', import.meta.url))
    writeFileSync(join(kitNovo, '_ferramentas', 'historico-app.mjs'), script)
    const { kit, projeto } = cenario(raiz)
    writeFileSync(join(kit, '_ferramentas', 'historico-app.mjs'), script)
    return fn({ mae, kitNovo, kit, projeto, home, arq, env })
  })
}

test('linha de comando mae: com o historico-app no kit novo, nao cria nem muda o settings do usuario', () => comHomeEKits(({ mae, kitNovo, arq, env }) => {
  const r = rodar(['mae', kitNovo, '--mae', mae], env)
  assert.equal(r.codigo, 0, r.saida)
  assert.ok(r.saida.startsWith('Pasta-mae na versao'), r.saida)
  assert.ok(!r.saida.includes('Historico do app'), r.saida)
  assert.equal(readFileSync(arq, 'utf8'), '{"desktopSessionCleanupPeriodDays": 90}\n', 'o mae nao mexe no prazo')
  rmSync(arq)
  assert.equal(rodar(['mae', kitNovo, '--mae', mae], env).codigo, 0)
  assert.ok(!existsSync(arq), 'o mae nao cria o settings do usuario')
}))

test('canario do historico: o resumo do plano avisa os 30 dias e o aplicar com a mesma home grava', () => comHomeEKits(({ kit, projeto, home, arq, env }) => {
  const p = rodar(['plano', projeto, '--kit', kit], env)
  assert.equal(p.codigo, 0, p.saida)
  assert.ok(p.saida.split('\n').some(l => l.startsWith('Historico do app:') && l.includes('30 dias') && l.includes('aplicar')), p.saida)
  assert.equal(readFileSync(arq, 'utf8'), '{"desktopSessionCleanupPeriodDays": 90}\n', 'o plano nao grava')
  const a = rodar(['aplicar', projeto], env)
  assert.equal(a.codigo, 0, a.saida)
  assert.ok(a.saida.split('\n').some(l => l.startsWith('Historico do app: 30 dias, gravado em ') && l.includes(home)), a.saida)
  assert.equal(JSON.parse(readFileSync(arq, 'utf8')).desktopSessionCleanupPeriodDays, 30)
}))

test('aplicar: JSON quebrado no settings do usuario nao derruba o aplicar, e kit sem o script nao cita o historico', () => comHomeEKits(({ kit, projeto, arq, env }) => {
  writeFileSync(arq, '{"model":')
  assert.equal(rodar(['plano', projeto, '--kit', kit], env).codigo, 0)
  const q = rodar(['aplicar', projeto], env)
  assert.equal(q.codigo, 0, q.saida)
  assert.ok(q.saida.startsWith('Aplicado.') && q.saida.includes('tem JSON quebrado'), q.saida)
  assert.equal(readFileSync(arq, 'utf8'), '{"model":')
  rmSync(join(kit, '_ferramentas', 'historico-app.mjs'))
  const p = rodar(['plano', projeto, '--kit', kit], env)
  assert.ok(p.saida.startsWith('Projeto na versao') && !p.saida.includes('Historico do app'), p.saida)
}))

// 5.49 (revisao do bloco B, 2026-11-03): entrada antiga do mudancas.md que mandava por de volta o que a
// TIRADAS_DO_KIT tira, ou que confere o hook de antes, deixava o /atualizar-sabinos num vai e volta.
// Fora a travas-soltas, nenhum "Te afeta se", "Como aplicar" ou "Como testar" cita o que saiu.
test('mudancas.md: nenhuma entrada religa o que o kit tirou na 5.49', () => {
  const md = readFileSync(fileURLToPath(new URL('./mudancas.md', import.meta.url)), 'utf8').split(CRLF).join('\n')
  const proibidos = [...new Set([...TIRADAS_DO_KIT.deny, ...TIRADAS_DO_KIT.ask, 'avaliarMcpComPerfil', 'anotarSessao', 'SessionStart', 'code_unsafe'])]
  const entradas = md.split(/\n(?=## )/).slice(1).map(b => [b.match(/^## (\S+)/)[1],
    b.split('\n').filter(l => /^\*\*(Te afeta se|Como aplicar|Como testar):\*\*/.test(l)).join('\n')])
  // canario: o leitor acha as entradas e os campos
  assert.ok(entradas.length > 50 && entradas.find(([id]) => id === 'aviso-backup-falhou')?.[1].includes('.backup-falhou'), 'o leitor nao achou as entradas')
  const religam = entradas.filter(([id, campos]) => id !== 'travas-soltas' && proibidos.some(p => campos.includes(p)))
    .map(([id, campos]) => `${id}: ${proibidos.filter(p => campos.includes(p)).join(' | ')}`)
  assert.deepEqual(religam, [])
})

// 5.54 (C2): o aplicar nunca grava o settings, entao o hook do aviso so chega ao projeto ja instalado
// por uma entrada que manda rodar o settings --gravar
test('mudancas.md: a entrada do aviso de fechamento manda juntar o hook pelo settings', () => {
  const md = readFileSync(fileURLToPath(new URL('./mudancas.md', import.meta.url)), 'utf8').split(CRLF).join('\n')
  const bloco = md.split(/\n(?=## )/).find(b => b.startsWith('## aviso-fechamento\n'))
  assert.ok(bloco, 'falta a entrada aviso-fechamento')
  const campo = nome => bloco.split('\n').find(l => l.startsWith(`**${nome}:**`)) ?? ''
  assert.match(campo('Te afeta se'), /aviso-fechamento/)
  assert.match(campo('Como aplicar'), /\.claude\/hooks\/aviso-fechamento\.mjs/)
  assert.match(campo('Como aplicar'), /settings \..*--gravar/)
  assert.match(campo('Como testar'), /aviso-fechamento/)
})

// merge do main na 5.54: o mesmo comando settings junta a permissao por area e o aviso de fechamento,
// entao cada entrada conta o que a outra poe na linha Falta, e a primeira preve o --gravar parando
test('mudancas.md: permissao-por-area e aviso-fechamento contam o que o settings junta da outra', () => {
  const md = readFileSync(fileURLToPath(new URL('./mudancas.md', import.meta.url)), 'utf8').split(CRLF).join('\n')
  const aplicar = id => (md.split(/\n(?=## )/).find(b => b.startsWith(`## ${id}\n`)) ?? '').split('\n').find(l => l.startsWith('**Como aplicar:**')) ?? ''
  const perm = aplicar('permissao-por-area'), aviso = aplicar('aviso-fechamento')
  assert.ok(perm.includes('settings .') && aviso.includes('settings .'), 'o leitor nao achou as duas entradas')
  assert.match(perm, /aviso-fechamento/)
  assert.match(perm, /falta o \.claude\/hooks\/aviso-fechamento\.mjs/)
  assert.match(perm, /a partir da próxima conversa/)
  assert.match(aviso, /permissao-por-area/)
  assert.match(aviso, /`allow` só passa a valer depois que a pessoa responde que confia na pasta/)
})
