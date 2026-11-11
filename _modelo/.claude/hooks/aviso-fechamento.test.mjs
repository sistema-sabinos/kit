import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { MARCA, ROTULO_ATUALIZACAO, TETO_PRECOMPACT } from './aviso-fechamento.mjs'

const HOOK = fileURLToPath(new URL('./aviso-fechamento.mjs', import.meta.url))

// dia local n dias atras de hoje (0 = hoje)
const dia = n => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const p = x => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const somar = (d, n) => {
  const [a, m, x] = d.split('-').map(Number)
  const r = new Date(a, m - 1, x + n)
  const p = y => String(y).padStart(2, '0')
  return `${r.getFullYear()}-${p(r.getMonth() + 1)}-${p(r.getDate())}`
}

// projeto e home falsos, sempre em mkdtemp; diarios = { 'AAAA-MM-DD.md': ['linha', ...] }
// o corte padrao fica antes de todo diario dos testes (sem corte o hook fica quieto); corte null tira o instalado.json
function montar({ diarios = {}, origem, corte = dia(60), settingsUsuario } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'aviso-fechamento-'))
  const home = join(dir, 'home')
  const proj = join(dir, 'projeto')
  mkdirSync(join(home, '.claude'), { recursive: true })
  mkdirSync(join(proj, '_memoria', 'diario'), { recursive: true })
  for (const [nome, linhas] of Object.entries(diarios))
    writeFileSync(join(proj, '_memoria', 'diario', nome), `# ${nome.slice(0, 10)}\n\n${linhas.join('\n')}\n`)
  if (origem !== undefined) writeFileSync(join(proj, '.origem'), origem + '\n')
  if (corte) {
    mkdirSync(join(proj, '.sabinos'))
    writeFileSync(join(proj, '.sabinos', 'instalado.json'), JSON.stringify({ versao: '5.54', avisoFechamentoDesde: corte }))
  }
  if (settingsUsuario) writeFileSync(join(home, '.claude', 'settings.json'), JSON.stringify(settingsUsuario))
  return { dir, home, proj }
}

// 5.56 (G): o programa vai sempre explicito; a suite roda dentro da extensao e herdaria claude-vscode
function rodar(p, entrada, entrypoint = '') {
  const env = { ...process.env, CLAUDE_CODE_ENTRYPOINT: entrypoint, HOME: p.home, USERPROFILE: p.home, CLAUDE_PROJECT_DIR: p.proj }
  const stdin = typeof entrada === 'string' ? entrada : JSON.stringify({ cwd: p.proj, ...entrada })
  return spawnSync(process.execPath, [HOOK], { input: stdin, encoding: 'utf8', env })
}
const inicio = (p, source = 'startup', entrypoint = '') => rodar(p, { hook_event_name: 'SessionStart', source }, entrypoint)

// roda o mesmo cenario em dois projetos: o de controle tem de avisar, o outro nao
function quietoComControle(controle, alvo) {
  const c = montar(controle)
  const a = montar(alvo)
  try {
    const rc = inicio(c)
    assert.equal(rc.status, 0)
    assert.notEqual(rc.stdout, '', 'controle: a saida nao veio vazia')
    const ra = inicio(a)
    assert.deepEqual([ra.status, ra.stdout, ra.stderr], [0, '', ''])
  } finally {
    rmSync(c.dir, { recursive: true, force: true })
    rmSync(a.dir, { recursive: true, force: true })
  }
}

const L = (h, t) => `- ${h}, ${t}`
const rotulada = L('18:00', `SabinOS atualizado pra 5.54 ${ROTULO_ATUALIZACAO}: travas novas`)

test('marca no ultimo dia: quieto', () => {
  quietoComControle(
    { diarios: { [`${dia(1)}.md`]: [L('10:00', 'anuncio novo')] } },
    { diarios: { [`${dia(1)}.md`]: [L('10:00', 'anuncio novo'), L('11:00', MARCA)] } })
})

test('trabalho depois da marca: avisa o dia, e so ele', () => {
  const p = montar({ diarios: {
    [`${dia(3)}.md`]: [L('09:00', 'carrossel'), L('09:30', MARCA)],
    [`${dia(2)}.md`]: [L('10:00', 'anuncio'), L('11:00', MARCA), L('12:00', 'mais um anuncio')],
    [`${dia(1)}.md`]: [L('10:00', 'video')],
  } })
  try {
    const r = inicio(p)
    assert.equal(r.status, 0)
    const linhas = r.stdout.trim().split('\n')
    assert.ok(linhas.length >= 1 && linhas.length <= 3, 'ate 3 linhas')
    assert.match(linhas[0], new RegExp(`${dia(2)} e ${dia(1)}\\.$`))
    assert.ok(!r.stdout.includes(dia(3)), 'o dia fechado pela propria marca fica fora')
    assert.match(r.stdout, /fechar agora \(`\/atualizar`\) ou dispensar/)
    assert.ok(r.stdout.includes(`${MARCA} (dispensada)`))
  } finally { rmSync(p.dir, { recursive: true, force: true }) }
})

// Final do Codex (5.54): o /atualizar fecha so os dias da conversa dele; dia fechado por outra
// conversa nao esconde o dia aberto de antes. Cada dia se julga sozinho.
test('dia fechado por outra conversa nao esconde o dia aberto de antes', () => {
  const p = montar({ diarios: {
    [`${dia(2)}.md`]: [L('09:00', 'carrossel')],
    [`${dia(1)}.md`]: [L('10:00', 'anuncio'), L('11:00', MARCA)],
  } })
  try {
    const r = inicio(p)
    assert.equal(r.status, 0)
    assert.equal(r.stdout.split('\n')[0], `Ficou sem fechar: o diário tem trabalho sem a marca do /atualizar em ${dia(2)}.`)
  } finally { rmSync(p.dir, { recursive: true, force: true }) }
})

test('dia com fechamento no meio nao esconde o dia aberto de antes', () => {
  const p = montar({ diarios: {
    [`${dia(3)}.md`]: [L('09:00', 'carrossel')],
    [`${dia(2)}.md`]: [L('10:00', 'anuncio'), L('11:00', MARCA), L('12:00', 'mais um anuncio')],
    [`${dia(1)}.md`]: [L('10:00', 'video'), L('11:00', MARCA)],
  } })
  try {
    const r = inicio(p)
    assert.equal(r.stdout.split('\n')[0], `Ficou sem fechar: o diário tem trabalho sem a marca do /atualizar em ${dia(3)} e ${dia(2)}.`)
  } finally { rmSync(p.dir, { recursive: true, force: true }) }
})

test('sem corte (instalado.json sem o campo, ou sem o arquivo): quieto', () => {
  const diarios = { [`${dia(1)}.md`]: [L('10:00', 'anuncio')] }
  quietoComControle({ diarios }, { diarios, corte: null })
  const p = montar({ diarios, corte: null })
  try {
    mkdirSync(join(p.proj, '.sabinos'))
    writeFileSync(join(p.proj, '.sabinos', 'instalado.json'), JSON.stringify({ versao: '5.41', data: dia(5) }))
    assert.deepEqual((r => [r.status, r.stdout, r.stderr])(inicio(p)), [0, '', ''])
  } finally { rmSync(p.dir, { recursive: true, force: true }) }
})

test('mencao solta ao /atualizar nao fecha; fecha a linha que comeca com /atualizar e o "/atualizar rodado"', () => {
  const trab = L('10:00', 'anuncio')
  // controle: a pendencia "falta rodar /atualizar" deixa o dia aberto
  for (const fechou of [L('11:00', '/atualizar: agora e tarefas em dia'), L('11:00', '/atualizar'),
    L('11:00', '/atualizar da sessão do vídeo'), L('11:00', '/atualizar, agora em dia'),
    L('11:00', 'pendências no tarefas.md; /atualizar rodado')])
    quietoComControle(
      { diarios: { [`${dia(1)}.md`]: [trab, L('11:00', 'falta rodar /atualizar')] } },
      { diarios: { [`${dia(1)}.md`]: [trab, fechou] } })
  for (const aberto of [L('11:00', 'deu erro no /atualizar'), L('11:00', '/atualizarx'), L('11:00', '/atualizar-sabinos: 5.54')]) {
    const p = montar({ diarios: { [`${dia(1)}.md`]: [trab, aberto] } })
    try { assert.match(inicio(p).stdout, new RegExp(dia(1)), aberto) } finally { rmSync(p.dir, { recursive: true, force: true }) }
  }
})

test('so hoje: quieto (hoje ainda esta aberto)', () => {
  quietoComControle(
    { diarios: { [`${dia(1)}.md`]: [L('10:00', 'anuncio')] } },
    { diarios: { [`${dia(0)}.md`]: [L('10:00', 'anuncio')] } })
})

test('.origem com nome: le so o diario da origem', () => {
  quietoComControle(
    { origem: 'notebook', diarios: { [`${dia(1)}-notebook.md`]: [L('10:00', 'anuncio')] } },
    { origem: 'notebook', diarios: { [`${dia(1)}.md`]: [L('10:00', 'anuncio')], [`${dia(2)}-outro.md`]: [L('10:00', 'x')] } })
})

test('.origem sem nome (sem arquivo ou vazio): le o diario do dono', () => {
  quietoComControle(
    { diarios: { [`${dia(1)}.md`]: [L('10:00', 'anuncio')] } },
    { diarios: { [`${dia(1)}-notebook.md`]: [L('10:00', 'anuncio')] } })
  quietoComControle(
    { origem: '', diarios: { [`${dia(1)}.md`]: [L('10:00', 'anuncio')] } },
    { origem: '', diarios: { [`${dia(1)}-notebook.md`]: [L('10:00', 'anuncio')] } })
})

test('compact e clear: uma linha de que o /atualizar parte do disco, sem lista de dias', () => {
  const p = montar({ diarios: { [`${dia(1)}.md`]: [L('10:00', 'anuncio')] } })
  try {
    for (const source of ['compact', 'clear']) {
      const r = inicio(p, source)
      assert.equal(r.status, 0)
      assert.notEqual(r.stdout, '')
      assert.equal(r.stdout.trim().split('\n').length, 1, `${source}: uma linha`)
      assert.match(r.stdout, /\/atualizar rel. do disco/)
      assert.ok(!r.stdout.includes(dia(1)), `${source}: sem a lista de dias`)
    }
  } finally { rmSync(p.dir, { recursive: true, force: true }) }
})

test('stdin quebrado: sai 0 calado, nos dois eventos', () => {
  const p = montar({ diarios: { [`${dia(1)}.md`]: [L('10:00', 'anuncio')] } })
  try {
    assert.notEqual(inicio(p).stdout, '', 'canario: o mesmo projeto avisa com stdin bom')
    for (const ruim of ['nao e json{', '', 'null', '"texto"'])
      assert.deepEqual((r => [r.status, r.stdout, r.stderr])(rodar(p, ruim)), [0, '', ''], JSON.stringify(ruim))
  } finally { rmSync(p.dir, { recursive: true, force: true }) }
})

test('mencao ao /atualizar-sabinos ou ao /atualizar-kit nao conta como fechamento', () => {
  // controle: /atualizar no fim do dia fecha
  quietoComControle(
    { diarios: { [`${dia(1)}.md`]: [L('10:00', 'anuncio'), L('11:00', '/atualizar-sabinos rodado')] } },
    { diarios: { [`${dia(1)}.md`]: [L('10:00', 'anuncio'), L('11:00', '/atualizar: agora e tarefas em dia')] } })
  const p = montar({ diarios: { [`${dia(1)}.md`]: [L('10:00', 'anuncio'), L('11:00', 'rodei o /atualizar-kit')] } })
  try { assert.match(inicio(p).stdout, new RegExp(dia(1))) } finally { rmSync(p.dir, { recursive: true, force: true }) }
})

test('dia antes do corte nao avisa', () => {
  quietoComControle(
    { diarios: { [`${dia(2)}.md`]: [L('10:00', 'anuncio')] } },
    { corte: dia(1), diarios: { [`${dia(2)}.md`]: [L('10:00', 'anuncio')] } })
})

test('dia so com a linha rotulada nao avisa', () => {
  const fechado = { [`${dia(2)}.md`]: [L('10:00', 'anuncio'), L('11:00', MARCA)] }
  quietoComControle(
    { diarios: { ...fechado, [`${dia(1)}.md`]: [L('18:00', 'SabinOS atualizado pra 5.54: travas novas')] } },
    { diarios: { ...fechado, [`${dia(1)}.md`]: [rotulada] } })
})

test('MARCA seguida de linha rotulada no mesmo dia nao avisa', () => {
  quietoComControle(
    { diarios: { [`${dia(1)}.md`]: [L('10:00', 'anuncio'), L('11:00', MARCA), L('18:00', 'SabinOS atualizado pra 5.54: x')] } },
    { diarios: { [`${dia(1)}.md`]: [L('10:00', 'anuncio'), L('11:00', MARCA), rotulada] } })
})

test('dia com a MARCA e (dispensada) nao avisa', () => {
  quietoComControle(
    { diarios: { [`${dia(1)}.md`]: [L('10:00', 'anuncio')] } },
    { diarios: { [`${dia(1)}.md`]: [L('10:00', 'anuncio'), L('11:00', `${MARCA} (dispensada)`)] } })
})

test('source fork avisa igual ao resume e ao startup', () => {
  const p = montar({ diarios: { [`${dia(1)}.md`]: [L('10:00', 'anuncio')] } })
  try {
    const resume = inicio(p, 'resume')
    assert.notEqual(resume.stdout, '')
    const fork = inicio(p, 'fork')
    assert.deepEqual([fork.status, fork.stdout], [0, resume.stdout])
    assert.equal(inicio(p, 'startup').stdout, resume.stdout)
  } finally { rmSync(p.dir, { recursive: true, force: true }) }
})

test('frase do "apaga" so com desktopSessionCleanupPeriodDays no settings do usuario', () => {
  const diarios = { [`${dia(3)}.md`]: [L('10:00', 'anuncio')], [`${dia(1)}.md`]: [L('10:00', 'video')] }
  const com = montar({ diarios, settingsUsuario: { theme: 'dark', desktopSessionCleanupPeriodDays: 30 } })
  const sem = montar({ diarios, settingsUsuario: { theme: 'dark' } })
  try {
    const rc = inicio(com)
    assert.ok(rc.stdout.includes(`Essas conversas saem deste computador a partir de cerca de ${somar(dia(3), 30)}.`), rc.stdout)
    const rs = inicio(sem)
    assert.notEqual(rs.stdout, '', 'sem a chave segue avisando')
    assert.ok(!/apaga|saem deste computador/.test(rs.stdout), rs.stdout)
  } finally {
    rmSync(com.dir, { recursive: true, force: true })
    rmSync(sem.dir, { recursive: true, force: true })
  }
})

// 5.56 (G): a frase do prazo por programa. Cada caso roda com as duas chaves em valores diferentes,
// pra provar qual delas o hook leu
const FRASE = n => `Essas conversas saem deste computador a partir de cerca de ${somar(dia(3), n)}.`
const comPrazo = (settingsUsuario, entrypoint, projeto = {}) => {
  const p = montar({ diarios: { [`${dia(3)}.md`]: [L('10:00', 'anuncio')] }, settingsUsuario })
  try {
    for (const [nome, conteudo] of Object.entries(projeto)) {
      mkdirSync(join(p.proj, '.claude'), { recursive: true })
      writeFileSync(join(p.proj, '.claude', nome), JSON.stringify(conteudo))
    }
    const r = inicio(p, 'startup', entrypoint)
    assert.ok(r.stdout.includes('Ficou sem fechar'), 'canario: o aviso saiu: ' + r.stdout)
    return r.stdout
  } finally { rmSync(p.dir, { recursive: true, force: true }) }
}

test('VS Code: o prazo vem do cleanupPeriodDays, 30 sem a chave, e a chave do app nao conta', () => {
  assert.ok(comPrazo({ theme: 'dark' }, 'claude-vscode').includes(FRASE(30)))
  const r = comPrazo({ cleanupPeriodDays: 10, desktopSessionCleanupPeriodDays: 50 }, 'claude-vscode')
  assert.ok(r.includes(FRASE(10)), r)
  assert.ok(!r.includes(FRASE(50)), r)
})

// achado da comum do G: o cleanupPeriodDays vale em qualquer settings, e o mais perto ganha
test('VS Code: o cleanupPeriodDays do projeto e do local passam por cima do usuario', () => {
  const usuario = { cleanupPeriodDays: 10 }
  assert.ok(comPrazo(usuario, 'claude-vscode', { 'settings.json': { cleanupPeriodDays: 5 } }).includes(FRASE(5)))
  const local = comPrazo(usuario, 'claude-vscode', { 'settings.json': { cleanupPeriodDays: 5 }, 'settings.local.json': { cleanupPeriodDays: 1 } })
  assert.ok(local.includes(FRASE(1)), local)
  // a chave do app no projeto nao vale (so usuario ou gerenciado)
  const app = comPrazo({}, 'claude-desktop', { 'settings.json': { desktopSessionCleanupPeriodDays: 40 } })
  assert.ok(!/saem deste computador/.test(app), app)
})

// final do Codex da 5.56: a conversa velha pode ser do outro programa, entao vale o prazo mais curto
// que pode valer pra alguma (o cleanupPeriodDays); o maior dos dois dava margem falsa no app
test('app: vale o cleanupPeriodDays com a chave do app ligada, e sem a chave do app a frase fica fora', () => {
  assert.ok(comPrazo({ cleanupPeriodDays: 20, desktopSessionCleanupPeriodDays: 7 }, 'claude-desktop').includes(FRASE(20)))
  const curto = comPrazo({ cleanupPeriodDays: 1, desktopSessionCleanupPeriodDays: 90 }, 'claude-desktop')
  assert.ok(curto.includes(FRASE(1)) && !curto.includes(FRASE(90)), curto)
  // o mesmo projeto aberto no VS Code da a mesma data
  assert.ok(comPrazo({ cleanupPeriodDays: 1, desktopSessionCleanupPeriodDays: 90 }, 'claude-vscode').includes(FRASE(1)))
  assert.ok(comPrazo({ desktopSessionCleanupPeriodDays: 7 }, 'claude-desktop').includes(FRASE(30)))
  const sem = comPrazo({ cleanupPeriodDays: 20, desktopSessionCleanupPeriodDays: 0 }, 'claude-desktop')
  assert.ok(!/saem deste computador/.test(sem), sem)
})

test('desconhecido: so a chave do app, como antes da 5.56', () => {
  assert.ok(comPrazo({ cleanupPeriodDays: 20, desktopSessionCleanupPeriodDays: 7 }, '').includes(FRASE(7)))
  const sem = comPrazo({ cleanupPeriodDays: 20 }, 'sdk-ts')
  assert.ok(!/saem deste computador/.test(sem), sem)
})

test('a checagem do hook concorda com o programa() do conectar nos tres casos', async () => {
  const { programa } = await import('../skills/conectar/scripts/lib/programa.mjs')
  const { programaDoHook } = await import('./aviso-fechamento.mjs')
  const valores = ['claude-vscode', 'claude-desktop', 'claude-desktop-3p', '', 'cli', 'sdk-ts', undefined]
  const vistos = new Set()
  for (const v of valores) {
    const env = v === undefined ? {} : { CLAUDE_CODE_ENTRYPOINT: v }
    assert.equal(programaDoHook(env), programa(env), String(v))
    vistos.add(programa(env))
  }
  assert.deepEqual([...vistos].sort(), ['app', 'desconhecido', 'vscode'], 'canario: os tres casos passaram')
})

test('settings.json e instalado.json com BOM (Bloco de Notas, PowerShell 5) seguem valendo', () => {
  const BOM = String.fromCharCode(0xFEFF)
  const diarios = { [`${dia(3)}.md`]: [L('10:00', 'anuncio')], [`${dia(1)}.md`]: [L('10:00', 'video')] }
  const p = montar({ diarios, corte: null })
  try {
    writeFileSync(join(p.home, '.claude', 'settings.json'), BOM + JSON.stringify({ desktopSessionCleanupPeriodDays: 30 }))
    mkdirSync(join(p.proj, '.sabinos'))
    // sem corte lido o hook fica quieto: o aviso do dia 3 prova que os dois JSON com BOM valeram
    writeFileSync(join(p.proj, '.sabinos', 'instalado.json'), BOM + JSON.stringify({ avisoFechamentoDesde: dia(3) }))
    const ra = inicio(p)
    assert.ok(ra.stdout.includes(`Essas conversas saem deste computador a partir de cerca de ${somar(dia(3), 30)}.`), ra.stdout)
    writeFileSync(join(p.proj, '.sabinos', 'instalado.json'), BOM + JSON.stringify({ avisoFechamentoDesde: dia(2) }))
    const rc = inicio(p)
    assert.notEqual(rc.stdout, '', 'o dia depois do corte segue avisando')
    assert.ok(rc.stdout.includes(dia(1)), rc.stdout)
    assert.ok(!rc.stdout.includes(`em ${dia(3)}`), rc.stdout)
  } finally { rmSync(p.dir, { recursive: true, force: true }) }
})

test('PreCompact sai 0 com texto nao vazio de ate 600 caracteres, e calado no stdin quebrado', () => {
  const muitos = {}
  for (let n = 1; n <= 31; n++) muitos[`${dia(n)}.md`] = [L('10:00', 'anuncio')]
  for (const diarios of [{}, { [`${dia(1)}.md`]: [L('10:00', 'anuncio')] }, muitos]) {
    const p = montar({ diarios })
    try {
      const r = rodar(p, { hook_event_name: 'PreCompact', trigger: 'auto', custom_instructions: null })
      assert.equal(r.status, 0)
      assert.notEqual(r.stdout.trim(), '')
      assert.ok(r.stdout.trim().length <= TETO_PRECOMPACT, `tamanho ${r.stdout.trim().length}`)
      assert.match(r.stdout, /\/atualizar rel. do disco/)
      if (Object.keys(diarios).length === 1) assert.ok(r.stdout.includes(dia(1)), 'guarda o dia sem fechar')
      assert.deepEqual((x => [x.status, x.stdout, x.stderr])(rodar(p, '{quebrado')), [0, '', ''])
    } finally { rmSync(p.dir, { recursive: true, force: true }) }
  }
})

test('outro evento sai 0 calado', () => {
  const p = montar({ diarios: { [`${dia(1)}.md`]: [L('10:00', 'anuncio')] } })
  try {
    assert.notEqual(inicio(p).stdout, '')
    const r = rodar(p, { hook_event_name: 'Stop' })
    assert.deepEqual([r.status, r.stdout, r.stderr], [0, '', ''])
  } finally { rmSync(p.dir, { recursive: true, force: true }) }
})
