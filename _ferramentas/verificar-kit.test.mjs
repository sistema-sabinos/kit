import { test } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rodarGates, carregarProibidos, foraDoBackup } from './verificar-kit.mjs'
import { hashArquivo } from './atualizar-projeto.mjs'

// dois testes leem a lista real, que so existe na _kits; num clone publico eles pulam
const CAMINHO_BANCADA = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bancada', 'proibidos.json')
const SEM_BANCADA = existsSync(CAMINHO_BANCADA) ? false : 'fora da _kits: bancada/proibidos.json nao existe'

function kitFalso() {
  const dir = mkdtempSync(join(tmpdir(), 'kit-'))
  mkdirSync(join(dir, '.claude/skills/iniciar'), { recursive: true })
  writeFileSync(join(dir, '.claude/skills/iniciar/SKILL.md'),
    '---\nname: iniciar\ndescription: Inicia a sessao.\n---\n\n# /iniciar\n')
  return dir
}

// termos sinteticos: a lista real mora na bancada (bancada/proibidos.json), fora do kit,
// e nenhum termo dela pode aparecer aqui, porque este arquivo vai no zip
const TERMOS = ['termo-secreto-exemplo', 'segundo-termo-exemplo']

test('gate 1 pega termo proibido', () => {
  const dir = kitFalso()
  try {
    writeFileSync(join(dir, 'README.md'), '# Kit\n\nUsado na operacao Termo-Secreto-Exemplo.\n')
    writeFileSync(join(dir, 'b.md'), 'Conta segundo-termo-exemplo.\n')
    const { falhas } = rodarGates(dir, { proibidos: TERMOS })
    assert.ok(falhas.some(f => f.gate === 1 && f.arquivo === 'README.md' && /termo-secreto-exemplo/.test(f.detalhe)))
    assert.ok(falhas.some(f => f.gate === 1 && f.arquivo === 'b.md' && /segundo-termo-exemplo/.test(f.detalhe)))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('na pasta-mae do aluno, projeto e backup do /atualizar-kit ficam fora da varredura', () => {
  const dir = kitFalso()
  try {
    // projeto do aluno: tem _contexto/, .env e codigo MLB, que sao dele e nunca vao no zip
    mkdirSync(join(dir, 'loja/_contexto'), { recursive: true })
    writeFileSync(join(dir, 'loja/_contexto/agora.md'), '# agora\n')
    writeFileSync(join(dir, 'loja/.env'), 'API_KEY=' + 'abc123def456ghi789\n')
    writeFileSync(join(dir, 'loja/anuncio.md'), 'Anuncio MLB' + '1234567' + '.\n')
    mkdirSync(join(dir, '_kit-anterior-2026-10-04'), { recursive: true })
    writeFileSync(join(dir, '_kit-anterior-2026-10-04/x.md'), 'Conta termo-secreto-exemplo.\n')
    // o _modelo tambem tem _contexto/ e continua sendo varrido
    mkdirSync(join(dir, '_modelo/_contexto'), { recursive: true })
    writeFileSync(join(dir, '_modelo/_contexto/a.md'), 'Conta termo-secreto-exemplo.\n')
    const { falhas } = rodarGates(dir, { proibidos: TERMOS })
    const g1 = falhas.filter(f => f.gate === 1)
    assert.ok(g1.some(f => f.arquivo === '_modelo/_contexto/a.md'), 'canario: o _modelo segue varrido')
    assert.deepEqual(g1.filter(f => /^(loja|_kit-anterior)/.test(f.arquivo)), [])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('carregarProibidos de caminho inexistente devolve lista vazia', () => {
  assert.deepEqual(carregarProibidos(join(tmpdir(), 'nao-existe-proibidos-exemplo.json')), [])
})

test('carregarProibidos sem argumento le a lista da bancada', { skip: SEM_BANCADA }, () => {
  const termos = carregarProibidos()
  assert.ok(Array.isArray(termos) && termos.length > 0, 'bancada/proibidos.json existe na _kits e tem termos')
})

test('rodarGates sem opcao carrega a lista da bancada e nao avisa', { skip: SEM_BANCADA }, () => {
  const dir = kitFalso()
  try {
    const { falhas, avisos } = rodarGates(dir)
    assert.ok(falhas.length > 0, 'canario: o kit falso sempre falha no gate 3')
    assert.deepEqual(avisos, [])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('gate 1 sem a lista da bancada avisa e segue so com os detectores estruturais', () => {
  const dir = kitFalso()
  const caminho = join(tmpdir(), 'nao-existe-proibidos-exemplo.json')
  try {
    writeFileSync(join(dir, 'a.md'), 'Conta termo-secreto-exemplo.\n')
    writeFileSync(join(dir, 'b.md'), 'Anuncio MLB' + '1234567' + '.\n')
    const { falhas, avisos } = rodarGates(dir, { caminhoProibidos: caminho })
    assert.equal(avisos.length, 1)
    assert.equal(avisos[0], `Gate 1: lista de termos da bancada nao encontrada em ${caminho}; so os detectores estruturais rodaram`)
    assert.ok(!falhas.some(f => f.gate === 1 && f.arquivo === 'a.md'), 'sem lista, termo nenhum acusa')
    assert.ok(falhas.some(f => f.gate === 1 && f.arquivo === 'b.md' && /MLB/.test(f.detalhe)), 'o detector estrutural continua rodando')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('gate 1 fora da bancada (a pasta da lista nao existe) nao avisa', () => {
  const dir = kitFalso()
  const caminho = join(tmpdir(), 'nao-existe-bancada-exemplo', 'proibidos.json')
  try {
    const { falhas, avisos } = rodarGates(dir, { caminhoProibidos: caminho })
    assert.ok(falhas.length > 0, 'canario: o kit falso sempre falha no gate 3')
    assert.deepEqual(avisos, [])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('gate 1 pega valor de segredo mas nao o nome da variavel', () => {
  const dir = kitFalso()
  writeFileSync(join(dir, 'a.md'), 'Preencha GEMINI_API_KEY no arquivo de chaves\n')
  writeFileSync(join(dir, 'b.md'), 'GEMINI_API_KEY=AIzaSyD9x1abcdefgh\n')
  const { falhas } = rodarGates(dir)
  assert.ok(!falhas.some(f => f.gate === 1 && f.arquivo.endsWith('a.md')), 'nome de variavel e permitido')
  assert.ok(falhas.some(f => f.gate === 1 && f.arquivo.endsWith('b.md')), 'valor atribuido e proibido')
  rmSync(dir, { recursive: true, force: true })
})

test('gate 1 ignora placeholder e leitura de env em codigo', () => {
  const dir = kitFalso()
  writeFileSync(join(dir, 'c.md'), 'POSTFORME_API_KEY=pfm_live_xxxxx\nOUTRA_API_KEY=token_longo_aqui\n')
  writeFileSync(join(dir, 'd.js'), 'const API_KEY = process.env.POSTFORME_API_KEY;\n')
  const { falhas } = rodarGates(dir)
  assert.ok(!falhas.some(f => f.gate === 1 && /[cd]\.(md|js)$/.test(f.arquivo)), 'placeholder e process.env sao permitidos')
  rmSync(dir, { recursive: true, force: true })
})

test('permite a palavra sabinos (nome do produto) mas barra sabino sozinho', () => {
  const dir = kitFalso()
  writeFileSync(join(dir, 'a.md'), 'O SabinOS te ajuda a organizar tudo.\n')
  writeFileSync(join(dir, 'b.md'), 'Qualquer duvida, fale com o Sabino.\n')
  const { falhas } = rodarGates(dir, { proibidos: ['sabino'] })
  assert.ok(!falhas.some(f => f.gate === 1 && f.arquivo.endsWith('a.md')), 'sabinos (nome do produto) e permitido')
  assert.ok(falhas.some(f => f.gate === 1 && f.arquivo.endsWith('b.md') && /sabino/i.test(f.detalhe)), 'sabino sozinho continua proibido')
  rmSync(dir, { recursive: true, force: true })
})

test('gate 1 nao acusa o proprio detector por conter a lista de termos e exemplos de segredo', () => {
  const dir = kitFalso()
  mkdirSync(join(dir, '_ferramentas'), { recursive: true })
  writeFileSync(join(dir, '_ferramentas/verificar-kit.mjs'), "const TERMOS = ['termo-secreto-exemplo']\n")
  writeFileSync(join(dir, '_ferramentas/verificar-kit.test.mjs'),
    "writeFileSync(x, 'Usado na operacao termo-secreto-exemplo.\\n')\nwriteFileSync(y, 'GEMINI_API_KEY=AIzaSyD9x1abcdefgh\\n')\n")
  // canario: o mesmo conteudo fora dos arquivos do gate acusa
  writeFileSync(join(dir, 'c.md'), 'Usado na operacao termo-secreto-exemplo.\n')
  const { falhas } = rodarGates(dir, { proibidos: TERMOS })
  assert.ok(falhas.some(f => f.gate === 1 && f.arquivo === 'c.md'), 'canario: fora do detector o termo acusa')
  assert.ok(!falhas.some(f => f.gate === 1 && f.arquivo === '_ferramentas/verificar-kit.mjs'), 'o detector nao se auto-acusa')
  assert.ok(!falhas.some(f => f.gate === 1 && f.arquivo === '_ferramentas/verificar-kit.test.mjs'), 'o teste do detector (com exemplo de segredo sintetico) nao se auto-acusa')
  rmSync(dir, { recursive: true, force: true })
})

test('scripts/ dentro de uma skill e permitido', () => {
  const dir = kitFalso()
  // permitido: scripts dentro de skill, na pasta-mae e dentro do _modelo
  mkdirSync(join(dir, '.claude/skills/transcribe/scripts'), { recursive: true })
  writeFileSync(join(dir, '.claude/skills/transcribe/scripts/x.mjs'), 'export const x = 1\n')
  mkdirSync(join(dir, '_modelo/.claude/skills/transcribe/scripts'), { recursive: true })
  writeFileSync(join(dir, '_modelo/.claude/skills/transcribe/scripts/x.mjs'), 'export const x = 1\n')
  // proibido: pasta scripts/ de primeiro nivel, na pasta-mae e dentro do _modelo
  mkdirSync(join(dir, 'scripts'), { recursive: true })
  writeFileSync(join(dir, 'scripts/y.mjs'), 'export const y = 1\n')
  mkdirSync(join(dir, '_modelo/scripts'), { recursive: true })
  writeFileSync(join(dir, '_modelo/scripts/y.mjs'), 'export const y = 1\n')
  const { falhas } = rodarGates(dir)
  assert.ok(!falhas.some(f => f.gate === 1 && f.arquivo === '.claude/skills/transcribe/scripts/x.mjs'), 'scripts dentro de skill na pasta-mae e permitido')
  assert.ok(!falhas.some(f => f.gate === 1 && f.arquivo === '_modelo/.claude/skills/transcribe/scripts/x.mjs'), 'scripts dentro de skill no _modelo e permitido')
  assert.ok(falhas.some(f => f.gate === 1 && f.arquivo === 'scripts/y.mjs' && /pasta proibida/.test(f.detalhe)), 'scripts de 1o nivel na pasta-mae continua proibido')
  assert.ok(falhas.some(f => f.gate === 1 && f.arquivo === '_modelo/scripts/y.mjs' && /pasta proibida/.test(f.detalhe)), 'scripts de 1o nivel dentro do _modelo e proibido')
  rmSync(dir, { recursive: true, force: true })
})

test('gate 1 varre scripts .ps1/.py/.sh/.cjs em busca de termo proibido', () => {
  const dir = kitFalso()
  mkdirSync(join(dir, '.claude/skills/x/scripts'), { recursive: true })
  writeFileSync(join(dir, '.claude/skills/x/scripts/a.ps1'), "# roda na conta termo-secreto-exemplo\n")
  writeFileSync(join(dir, '.claude/skills/x/scripts/b.py'), "# roda na conta termo-secreto-exemplo\n")
  writeFileSync(join(dir, '.claude/skills/x/scripts/c.sh'), "# roda na conta termo-secreto-exemplo\n")
  writeFileSync(join(dir, '.claude/skills/x/scripts/d.cjs'), "// roda na conta termo-secreto-exemplo\n")
  const { falhas } = rodarGates(dir, { proibidos: TERMOS })
  for (const arquivo of ['a.ps1', 'b.py', 'c.sh', 'd.cjs']) {
    assert.ok(falhas.some(f => f.gate === 1 && f.arquivo.endsWith(arquivo) && /termo-secreto-exemplo/.test(f.detalhe)),
      `gate 1 devia acusar termo proibido em ${arquivo}`)
  }
  rmSync(dir, { recursive: true, force: true })
})

test('gate 2 ignora o catalogo de referencia', () => {
  const dir = kitFalso()
  mkdirSync(join(dir, '_modelo/templates/skills'), { recursive: true })
  writeFileSync(join(dir, '_modelo/templates/skills/catalogo.md'), '# Catalogo de Skills\n')
  const { falhas } = rodarGates(dir)
  assert.ok(!falhas.some(f => f.gate === 2 && /catalogo\.md$/.test(f.arquivo)))
  rmSync(dir, { recursive: true, force: true })
})

test('gate 2 pega frontmatter quebrado', () => {
  const dir = kitFalso()
  mkdirSync(join(dir, '.claude/skills/quebrada'), { recursive: true })
  writeFileSync(join(dir, '.claude/skills/quebrada/SKILL.md'), '# sem frontmatter\n')
  mkdirSync(join(dir, '_modelo/.claude/skills/quebrada'), { recursive: true })
  writeFileSync(join(dir, '_modelo/.claude/skills/quebrada/SKILL.md'), '# sem frontmatter\n')
  const { falhas } = rodarGates(dir)
  assert.ok(falhas.some(f => f.gate === 2 && f.arquivo === '.claude/skills/quebrada/SKILL.md'))
  assert.ok(falhas.some(f => f.gate === 2 && f.arquivo === '_modelo/.claude/skills/quebrada/SKILL.md'))
  rmSync(dir, { recursive: true, force: true })
})

test('gate 3 pega arquivo obrigatorio faltando', () => {
  const dir = kitFalso()
  const { falhas } = rodarGates(dir)
  assert.ok(falhas.some(f => f.gate === 3 && /CLAUDE\.md/.test(f.detalhe)))
  rmSync(dir, { recursive: true, force: true })
})

test('manifesto exige os arquivos da pasta-mae e do _modelo', () => {
  const dir = kitFalso()
  const { falhas } = rodarGates(dir)
  assert.ok(falhas.some(f => f.gate === 3 && /RESPONDA-AQUI\.txt/.test(f.detalhe)), 'exige RESPONDA-AQUI.txt da pasta-mae')
  assert.ok(falhas.some(f => f.gate === 3 && /_modelo\/CLAUDE\.md/.test(f.detalhe)), 'exige CLAUDE.md do _modelo')
  rmSync(dir, { recursive: true, force: true })
})

test('gate 4 pega link interno quebrado', () => {
  const dir = kitFalso()
  writeFileSync(join(dir, 'README.md'), 'Veja [isso](docs/nao-existe.md).\n')
  const { falhas } = rodarGates(dir)
  assert.ok(falhas.some(f => f.gate === 4 && /nao-existe/.test(f.detalhe)))
  rmSync(dir, { recursive: true, force: true })
})

test('gate 5 exige guarda de git no hook', () => {
  const dir = kitFalso()
  mkdirSync(join(dir, '.claude'), { recursive: true })
  writeFileSync(join(dir, '.claude/settings.json'),
    JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'git push' }] }] } }))
  const { falhas } = rodarGates(dir)
  assert.ok(falhas.some(f => f.gate === 5))
  rmSync(dir, { recursive: true, force: true })
})

test('gate 5 tambem confere o settings.json do _modelo', () => {
  const dir = kitFalso()
  mkdirSync(join(dir, '_modelo/.claude'), { recursive: true })
  writeFileSync(join(dir, '_modelo/.claude/settings.json'),
    JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'git push' }] }] } }))
  const { falhas } = rodarGates(dir)
  assert.ok(falhas.some(f => f.gate === 5 && f.arquivo === '_modelo/.claude/settings.json'))
  rmSync(dir, { recursive: true, force: true })
})

test('gate 6 acusa caminho windows chumbado dentro de _modelo', () => {
  const dir = kitFalso()
  mkdirSync(join(dir, '_modelo'), { recursive: true })
  writeFileSync(join(dir, '_modelo/x.md'), 'O caminho fica em C:\\Users\\fulano\\dados\n')
  writeFileSync(join(dir, '_modelo/y.mjs'), 'exec("schtasks /create ...")\n')
  const { falhas } = rodarGates(dir)
  assert.ok(falhas.some(f => f.gate === 6 && f.arquivo === '_modelo/x.md'))
  assert.ok(falhas.some(f => f.gate === 6 && f.arquivo === '_modelo/y.mjs'))
  rmSync(dir, { recursive: true, force: true })
})

test('gate 6 pega drive minusculo (case-insensitive) e caminho com barra normal', () => {
  const dir = kitFalso()
  mkdirSync(join(dir, '_modelo'), { recursive: true })
  writeFileSync(join(dir, '_modelo/minusculo.md'), 'o caminho fica em c:\\users\\x\n')
  writeFileSync(join(dir, '_modelo/barra.md'), 'o caminho fica em C:/Users/x\n')
  const { falhas } = rodarGates(dir)
  assert.ok(falhas.some(f => f.gate === 6 && f.arquivo === '_modelo/minusculo.md'), 'drive minusculo tambem acusa')
  assert.ok(falhas.some(f => f.gate === 6 && f.arquivo === '_modelo/barra.md'), 'caminho com barra normal tambem acusa')
  rmSync(dir, { recursive: true, force: true })
})

test('gate 6 ignora doc que ensina os dois sistemas', () => {
  const dir = kitFalso()
  mkdirSync(join(dir, 'docs'), { recursive: true })
  mkdirSync(join(dir, '_ferramentas/lib'), { recursive: true })
  writeFileSync(join(dir, 'docs/robo.md'), 'Agende via Task Scheduler (Windows) ou launchd (Mac).\n')
  writeFileSync(join(dir, '_ferramentas/lib/README.md'), 'Task Scheduler (Windows) ou launchd (Mac) fazem o agendamento.\n')
  const { falhas } = rodarGates(dir)
  assert.ok(!falhas.some(f => f.gate === 6), 'docs/ e _ferramentas/lib/ ficam fora do escopo do gate 6')
  rmSync(dir, { recursive: true, force: true })
})

test('gate 6 ignora linha windows quando ensina os dois sistemas mesmo dentro do escopo verificado', () => {
  const dir = kitFalso()
  mkdirSync(join(dir, '_modelo/.claude/skills/agendar'), { recursive: true })
  writeFileSync(join(dir, '_modelo/.claude/skills/agendar/SKILL.md'),
    '---\nname: agendar\ndescription: Agenda o robo.\n---\n\nAgende via Task Scheduler (Windows) ou launchd (Mac).\n')
  const { falhas } = rodarGates(dir)
  assert.ok(!falhas.some(f => f.gate === 6), 'linha que ensina os dois sistemas nao falha mesmo dentro do _modelo/.claude')
  rmSync(dir, { recursive: true, force: true })
})

test('gate 3 exige AGENTS.md na pasta-mae e no _modelo', () => {
  const dir = kitFalso()
  const { falhas } = rodarGates(dir)
  assert.ok(falhas.some(f => f.gate === 3 && /faltando: AGENTS\.md/.test(f.detalhe)), 'exige AGENTS.md da pasta-mae')
  assert.ok(falhas.some(f => f.gate === 3 && /faltando: _modelo\/AGENTS\.md/.test(f.detalhe)), 'exige AGENTS.md do _modelo')
  rmSync(dir, { recursive: true, force: true })
})

test('AGENTS.md deixa de ser arquivo proibido', () => {
  const dir = kitFalso()
  writeFileSync(join(dir, 'AGENTS.md'), '# Conteudo real\n')
  const { falhas } = rodarGates(dir)
  assert.ok(!falhas.some(f => f.arquivo === 'AGENTS.md' && /arquivo proibido/.test(f.detalhe)), 'AGENTS.md nao e mais banido')
  rmSync(dir, { recursive: true, force: true })
})

test('CLAUDE.md tem que ser so o ponteiro @AGENTS.md', () => {
  const dir = kitFalso()
  writeFileSync(join(dir, 'AGENTS.md'), '# Conteudo real\n')
  writeFileSync(join(dir, 'CLAUDE.md'), '# Ainda tem conteudo velho aqui\n')
  mkdirSync(join(dir, '_modelo'), { recursive: true })
  writeFileSync(join(dir, '_modelo/AGENTS.md'), '# Conteudo real do modelo\n')
  writeFileSync(join(dir, '_modelo/CLAUDE.md'), '@AGENTS.md\n')
  const { falhas } = rodarGates(dir)
  assert.ok(falhas.some(f => f.arquivo === 'CLAUDE.md' && /so o ponteiro @AGENTS\.md/.test(f.detalhe)), 'CLAUDE.md com conteudo velho falha')
  assert.ok(!falhas.some(f => f.arquivo === '_modelo/CLAUDE.md' && /ponteiro/.test(f.detalhe)), 'CLAUDE.md so com @AGENTS.md passa')
  rmSync(dir, { recursive: true, force: true })
})

test('CLAUDE.md ponteiro tolera espaco em volta e comentario html, mas nao texto extra', () => {
  const dir = kitFalso()
  writeFileSync(join(dir, 'CLAUDE.md'), '  \n@AGENTS.md\n\n')
  mkdirSync(join(dir, '_modelo'), { recursive: true })
  writeFileSync(join(dir, '_modelo/CLAUDE.md'), '<!-- ponteiro -->\n@AGENTS.md\n')
  const { falhas } = rodarGates(dir)
  assert.ok(!falhas.some(f => f.arquivo === 'CLAUDE.md' && /ponteiro/.test(f.detalhe)), 'espaco em volta nao quebra o ponteiro')
  assert.ok(!falhas.some(f => f.arquivo === '_modelo/CLAUDE.md' && /ponteiro/.test(f.detalhe)), 'comentario html acima do ponteiro nao quebra')
  rmSync(dir, { recursive: true, force: true })
})

test('.agents continua banido mesmo com o padrao AGENTS.md liberado', () => {
  const dir = kitFalso()
  mkdirSync(join(dir, '.agents/skills'), { recursive: true })
  writeFileSync(join(dir, '.agents/skills/x.md'), '# ponte\n')
  const { falhas } = rodarGates(dir)
  assert.ok(falhas.some(f => f.gate === 1 && f.arquivo === '.agents/skills/x.md' && /pasta proibida: \.agents/.test(f.detalhe)), '.agents/skills continua banido no kit versionado')
  rmSync(dir, { recursive: true, force: true })
})

test('gate exige .agents/ no .gitignore da pasta-mae e do _modelo', () => {
  const dir = kitFalso()
  writeFileSync(join(dir, '.gitignore'), '.env\nnode_modules/\n')
  mkdirSync(join(dir, '_modelo'), { recursive: true })
  writeFileSync(join(dir, '_modelo/.gitignore'), '.env\n')
  const { falhas } = rodarGates(dir)
  assert.ok(falhas.some(f => f.arquivo === '.gitignore' && /\.agents\//.test(f.detalhe)), '.gitignore da pasta-mae sem .agents/ falha')
  assert.ok(falhas.some(f => f.arquivo === '_modelo/.gitignore' && /\.agents\//.test(f.detalhe)), '.gitignore do _modelo sem .agents/ falha')
  rmSync(dir, { recursive: true, force: true })
})

test('gate passa quando os .gitignore ja tem a linha .agents/', () => {
  const dir = kitFalso()
  writeFileSync(join(dir, '.gitignore'), '.env\n.agents/\n')
  mkdirSync(join(dir, '_modelo'), { recursive: true })
  writeFileSync(join(dir, '_modelo/.gitignore'), '.env\n.agents/\n')
  const { falhas } = rodarGates(dir)
  assert.ok(!falhas.some(f => /\.agents\//.test(f.detalhe)), '.gitignore com .agents/ passa nos dois')
  rmSync(dir, { recursive: true, force: true })
})

test('gate 6 isenta a skill otimizar-pc (declaradamente so Windows), mas continua acusando fora dela', () => {
  const dir = kitFalso()
  mkdirSync(join(dir, '_modelo/.claude/skills/otimizar-pc'), { recursive: true })
  writeFileSync(join(dir, '_modelo/.claude/skills/otimizar-pc/SKILL.md'),
    '---\nname: otimizar-pc\ndescription: Faxina do PC (Windows).\n---\n\nO caminho fica em C:\\Users\\fulano\\dados\n')
  mkdirSync(join(dir, '_modelo/.claude/skills/otimizar-pc/scripts'), { recursive: true })
  writeFileSync(join(dir, '_modelo/.claude/skills/otimizar-pc/scripts/x.mjs'), 'const p = "C:\\Users\\fulano\\dados";\n')
  mkdirSync(join(dir, '_modelo/.claude/skills/outra'), { recursive: true })
  writeFileSync(join(dir, '_modelo/.claude/skills/outra/SKILL.md'),
    '---\nname: outra\ndescription: Outra skill.\n---\n\nO caminho fica em C:\\Users\\fulano\\dados\n')
  const { falhas } = rodarGates(dir)
  assert.ok(!falhas.some(f => f.gate === 6 && f.arquivo.includes('/otimizar-pc/')), 'otimizar-pc e isenta do gate 6 por ser so Windows')
  assert.ok(falhas.some(f => f.gate === 6 && f.arquivo === '_modelo/.claude/skills/outra/SKILL.md'), 'outra skill continua acusada normalmente')
  rmSync(dir, { recursive: true, force: true })
})

// zip minimo em memoria: um local file header + um central directory header + EOCD,
// com o separador de caminho escolhido pelo teste
function zipFalso(nomeEntrada) {
  const nome = Buffer.from(nomeEntrada, 'utf8')
  const local = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(22),
    Buffer.from([nome.length, 0, 0, 0]), nome,
  ])
  const central = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x01, 0x02]), Buffer.alloc(24),
    Buffer.from([nome.length, 0]), Buffer.alloc(16), nome,
  ])
  const eocd = Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), Buffer.alloc(18)])
  return Buffer.concat([local, central, eocd])
}

// BS e a barra invertida, montada por codigo de proposito: escrita literal no fonte,
// ela some numa camada de escape e o zip "quebrado" do teste nasce intacto (ja aconteceu).
const BS = String.fromCharCode(92)

// Os zips de teste moram na pasta pai do kit falso, que e o temp do sistema, compartilhado
// entre os testes. Por isso todo teste daqui limpa no finally: um assert que falha sem limpar
// deixa zip orfao e derruba o teste seguinte por um motivo que nao e dele.
function comZips(arquivos, fn) {
  const dir = kitFalso()
  const caminhos = Object.entries(arquivos).map(([nome, entrada]) => {
    const p = join(dir, '..', nome)
    writeFileSync(p, zipFalso(entrada))
    return p
  })
  try { fn(dir) } finally {
    for (const p of caminhos) rmSync(p, { force: true })
    rmSync(dir, { recursive: true, force: true })
  }
}

test('gate 7 acusa zip com barra invertida no caminho (Compress-Archive)', () => {
  comZips({ 'SabinOS-Sistema-3.0.zip': 'sabinos' + BS + 'COMECE-AQUI.md' }, (dir) => {
    const { falhas } = rodarGates(dir)
    assert.ok(falhas.some(f => f.gate === 7), 'zip com barra invertida tem que falhar o gate 7')
  })
})

test('gate 7 aceita zip com barra normal e nao roda sem zip', () => {
  comZips({ 'SabinOS-Sistema-3.0.zip': 'SabinOS-Sistema/COMECE-AQUI.md' }, (dir) => {
    const { falhas } = rodarGates(dir)
    assert.ok(!falhas.some(f => f.gate === 7), 'zip com / passa o gate 7')
  })
  const dir = kitFalso()
  try {
    const { falhas } = rodarGates(dir)
    assert.ok(!falhas.some(f => f.gate === 7), 'sem zip o gate 7 nao acusa nada')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('gate 7 confere o zip de MAIOR versao, nao o primeiro em ordem alfabetica', () => {
  // o 3.1 esta bom e o 3.2 esta quebrado: conferir o 3.1 daria verde e distribuiria o quebrado
  comZips({
    'SabinOS-Sistema-3.1.zip': 'SabinOS-Sistema/COMECE-AQUI.md',
    'SabinOS-Sistema-3.2.zip': 'sabinos' + BS + 'COMECE-AQUI.md',
  }, (dir) => {
    const g7 = rodarGates(dir).falhas.filter(f => f.gate === 7)
    assert.ok(g7.some(f => /no caminho/.test(f.detalhe)), 'tem que acusar a barra invertida do 3.2, o mais novo')
    assert.ok(g7.every(f => f.arquivo === 'SabinOS-Sistema-3.2.zip'), 'as falhas tem que apontar o zip mais novo')
    assert.ok(g7.some(f => /2 zips na pasta/.test(f.detalhe)), 'tem que avisar da sobra do zip antigo')
  })
})

test('gate 1 pega termo com espaco e em caixa mista (como marca de outro kit)', () => {
  const dir = kitFalso()
  try {
    writeFileSync(join(dir, 'a.md'), '# Minha Loja, Termo Com Espaco Exemplo\n')
    const { falhas } = rodarGates(dir, { proibidos: ['termo com espaco exemplo'] })
    assert.ok(falhas.some(f => f.gate === 1 && f.arquivo.endsWith('a.md') && /termo com espaco exemplo/.test(f.detalhe)))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// ---------------------------------------------------------------------------
// Gate 8: skill de trafego instalada sem regua declarada
// ---------------------------------------------------------------------------

test('gate 8 acusa skill de trafego instalada sem regua declarada', () => {
  const dir = kitFalso()
  try {
    mkdirSync(join(dir, '_modelo/.claude/skills/trafego'), { recursive: true })
    writeFileSync(join(dir, '_modelo/.claude/skills/trafego/SKILL.md'),
      '---\nname: trafego\ndescription: Cuida do trafego pago.\n---\n\n# /trafego\n')
    const { falhas } = rodarGates(dir)
    assert.ok(
      falhas.some(f => f.gate === 8 &&
        f.arquivo === '_modelo/.claude/skills/trafego/SKILL.md' &&
        f.detalhe === 'skill de trafego sem regua declarada'),
      'skill sem _contexto/trafego.md e sem referencias/regua-exemplo.md tem que falhar')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('gate 8 aceita regua-exemplo no _modelo e regua real no projeto', () => {
  const dir = kitFalso()
  try {
    // no _modelo a skill nasce sem regua de proposito (a regua nasce na entrevista);
    // o regua-exemplo.md e a prova de que o caminho existe
    mkdirSync(join(dir, '_modelo/.claude/skills/trafego/referencias'), { recursive: true })
    writeFileSync(join(dir, '_modelo/.claude/skills/trafego/SKILL.md'),
      '---\nname: trafego\ndescription: Cuida do trafego pago.\n---\n\n# /trafego\n')
    writeFileSync(join(dir, '_modelo/.claude/skills/trafego/referencias/regua-exemplo.md'),
      '# Regua de exemplo\n')
    // num projeto de verdade vale a regua preenchida no _contexto/
    mkdirSync(join(dir, '.claude/skills/trafego'), { recursive: true })
    writeFileSync(join(dir, '.claude/skills/trafego/SKILL.md'),
      '---\nname: trafego\ndescription: Cuida do trafego pago.\n---\n\n# /trafego\n')
    mkdirSync(join(dir, '_contexto'), { recursive: true })
    writeFileSync(join(dir, '_contexto/trafego.md'), '# Regua do negocio\n')
    // canario: uma terceira instalacao, essa sem nada, tem que continuar vermelha.
    // Sem ela este teste ficaria verde tambem no dia em que o gate parasse de rodar.
    mkdirSync(join(dir, 'projeto-b/.claude/skills/trafego'), { recursive: true })
    writeFileSync(join(dir, 'projeto-b/.claude/skills/trafego/SKILL.md'),
      '---\nname: trafego\ndescription: Cuida do trafego pago.\n---\n\n# /trafego\n')
    const { falhas } = rodarGates(dir)
    const daRegua = falhas.filter(f => f.detalhe === 'skill de trafego sem regua declarada')
    assert.equal(daRegua.length, 1, 'so a instalacao sem regua nenhuma pode falhar')
    assert.equal(daRegua[0].arquivo, 'projeto-b/.claude/skills/trafego/SKILL.md')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('gate 3 exige os arquivos da skill de trafego do _modelo', () => {
  const dir = kitFalso()
  try {
    const { falhas } = rodarGates(dir)
    for (const alvo of ['SKILL.md', 'referencias/metodo.md', 'referencias/regua-exemplo.md',
      'scripts/regua.mjs', 'scripts/faixas.mjs']) {
      const rel = '_modelo/.claude/skills/trafego/' + alvo
      assert.ok(falhas.some(f => f.gate === 3 && f.detalhe === `faltando: ${rel}`),
        `o manifesto tem que exigir ${rel}`)
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// CR montado por codigo: escrito literal aqui no fonte ele some numa camada de escape
// e o arquivo "torto" do teste nasce reto, dando verde sem ter testado nada.
const CR = String.fromCharCode(13)

test('gate 6 reprova .mjs com shebang terminando em CR', () => {
  const dir = kitFalso()
  try {
    mkdirSync(join(dir, '_modelo/.claude/skills/x/scripts'), { recursive: true })
    writeFileSync(join(dir, '_modelo/.claude/skills/x/scripts/torto.mjs'),
      `#!/usr/bin/env node${CR}\nexport const x = 1\n`)
    writeFileSync(join(dir, '_modelo/.claude/skills/x/scripts/reto.mjs'),
      '#!/usr/bin/env node\nexport const x = 1\n')
    // sem shebang, CRLF no corpo nao interessa ao gate: o risco e so a primeira linha
    writeFileSync(join(dir, '_modelo/.claude/skills/x/scripts/sem-shebang.mjs'),
      `export const x = 1${CR}\n`)
    const { falhas } = rodarGates(dir)
    const doShebang = falhas.filter(f => /shebang/.test(f.detalhe))
    assert.equal(doShebang.length, 1, 'so o arquivo de shebang torto pode falhar')
    assert.equal(doShebang[0].gate, 6)
    assert.ok(doShebang[0].arquivo.endsWith('torto.mjs'), 'a falha tem que apontar o torto.mjs')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// ---------------------------------------------------------------------------
// Gate 9: travas de seguranca do settings.json
// ---------------------------------------------------------------------------

test('gate 9 cobra ask de leitura de .env e deny de secrets nos dois settings.json', () => {
  const dir = kitFalso()
  try {
    mkdirSync(join(dir, '.claude'), { recursive: true })
    mkdirSync(join(dir, '_modelo/.claude'), { recursive: true })
    writeFileSync(join(dir, '.claude/settings.json'), JSON.stringify({}))
    writeFileSync(join(dir, '_modelo/.claude/settings.json'), JSON.stringify({}))
    const { falhas } = rodarGates(dir)
    const noNove = falhas.filter(f => f.gate === 9)
    assert.ok(noNove.length > 0, 'o gate 9 precisa acusar settings sem ask nem deny')
    assert.ok(noNove.some(f => f.arquivo === '.claude/settings.json' && /permissions\.ask/.test(f.detalhe)))
    assert.ok(noNove.some(f => f.arquivo === '_modelo/.claude/settings.json' && /permissions\.ask/.test(f.detalhe)))
    assert.ok(noNove.some(f => /permissions\.deny sem a regra Read\(\.\/secrets\/\*\*\)/.test(f.detalhe)))
    assert.ok(noNove.every(f => f.detalhe && f.detalhe.length > 0), 'toda falha explica o motivo')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('gate 9 aceita settings com ask do .env e deny de secrets', () => {
  const dir = kitFalso()
  try {
    mkdirSync(join(dir, '.claude'), { recursive: true })
    writeFileSync(join(dir, '.claude/settings.json'), JSON.stringify({
      permissions: { ask: ['Read(./.env)', 'Read(./.env.*)'], deny: ['Read(./secrets/**)'] },
    }))
    const { falhas } = rodarGates(dir)
    const daPastaMae = falhas.filter(f => f.gate === 9 && f.arquivo === '.claude/settings.json')
    assert.strictEqual(daPastaMae.length, 0, 'com ask e deny corretos, o gate 9 fica quieto')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('gate 9 acusa quando as regras do .env estao no lugar errado (deny em vez de ask)', () => {
  const dir = kitFalso()
  try {
    mkdirSync(join(dir, '.claude'), { recursive: true })
    // erro mais provavel de quem mexer nisso depois: deixar o .env dentro de deny,
    // que e exatamente o bug que esta rodada corrigiu (deny bloqueia a escrita da chave)
    writeFileSync(join(dir, '.claude/settings.json'), JSON.stringify({
      permissions: { deny: ['Read(./.env)', 'Read(./.env.*)', 'Read(./secrets/**)'] },
    }))
    const { falhas } = rodarGates(dir)
    const doNove = falhas.filter(f => f.gate === 9 && f.arquivo === '.claude/settings.json')
    assert.ok(doNove.some(f => f.detalhe === 'permissions.ask sem a regra Read(./.env)'),
      'regra do .env dentro de deny em vez de ask tem que acusar falta em ask')
    assert.ok(doNove.some(f => f.detalhe === 'permissions.ask sem a regra Read(./.env.*)'),
      'a segunda regra do .env tambem tem que acusar falta em ask')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('gate 9 acusa settings.json quebrado em vez de estourar', () => {
  const dir = kitFalso()
  try {
    mkdirSync(join(dir, '.claude'), { recursive: true })
    writeFileSync(join(dir, '.claude/settings.json'), '{ isso nao e json }')
    const { falhas } = rodarGates(dir)
    assert.ok(falhas.some(f => f.gate === 9 && /JSON/i.test(f.detalhe)))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('gate 9 acusa deny numero em vez de estourar', () => {
  const dir = kitFalso()
  try {
    mkdirSync(join(dir, '.claude'), { recursive: true })
    writeFileSync(join(dir, '.claude/settings.json'), JSON.stringify({
      permissions: { deny: 123 },
    }))
    assert.doesNotThrow(() => rodarGates(dir), 'deny com tipo errado nao pode derrubar o verificador inteiro')
    const { falhas } = rodarGates(dir)
    assert.ok(falhas.some(f => f.gate === 9 && /nao e uma lista/.test(f.detalhe)))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('gate 9 acusa ask numero em vez de estourar', () => {
  const dir = kitFalso()
  try {
    mkdirSync(join(dir, '.claude'), { recursive: true })
    writeFileSync(join(dir, '.claude/settings.json'), JSON.stringify({
      permissions: { ask: 123 },
    }))
    assert.doesNotThrow(() => rodarGates(dir), 'ask com tipo errado nao pode derrubar o verificador inteiro')
    const { falhas } = rodarGates(dir)
    assert.ok(falhas.some(f => f.gate === 9 && /permissions\.ask existe mas nao e uma lista/.test(f.detalhe)))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('gate 9 acusa deny string em vez de aceitar por coincidencia de API', () => {
  const dir = kitFalso()
  try {
    mkdirSync(join(dir, '.claude'), { recursive: true })
    writeFileSync(join(dir, '.claude/settings.json'), JSON.stringify({
      permissions: { ask: ['Read(./.env)', 'Read(./.env.*)'], deny: 'Read(./secrets/**)' },
    }))
    const { falhas } = rodarGates(dir)
    const doNove = falhas.filter(f => f.gate === 9)
    assert.ok(doNove.some(f => /nao e uma lista/.test(f.detalhe)), 'deny string tem que acusar tipo errado')
    assert.ok(!doNove.some(f => /sem a regra Read\(\.\/secrets\/\*\*\)$/.test(f.detalhe)),
      'nao pode dar a regra como presente so porque e substring dela mesma')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('gate 9 cobra o hook que barra comando perigoso no _modelo', () => {
  const dir = kitFalso()
  try {
    mkdirSync(join(dir, '_modelo/.claude'), { recursive: true })
    writeFileSync(join(dir, '_modelo/.claude/settings.json'), JSON.stringify({
      permissions: { ask: ['Read(./.env)', 'Read(./.env.*)'], deny: ['Read(./secrets/**)'] },
    }))
    const { falhas } = rodarGates(dir)
    assert.ok(falhas.some(f => f.gate === 9 && /barrar-perigoso/.test(f.detalhe)),
      'settings do _modelo sem o hook precisa acusar')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('gate 9 acusa matcher que voltou a ser so Bash (perde a trava do PowerShell em silencio)', () => {
  const dir = kitFalso()
  try {
    mkdirSync(join(dir, '_modelo/.claude/hooks'), { recursive: true })
    writeFileSync(join(dir, '_modelo/.claude/hooks/barrar-perigoso.mjs'), 'export function ehPerigoso() { return null }\n')
    writeFileSync(join(dir, '_modelo/.claude/settings.json'), JSON.stringify({
      permissions: { ask: ['Read(./.env)', 'Read(./.env.*)'], deny: ['Read(./secrets/**)'] },
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node barrar-perigoso.mjs' }] }] },
    }))
    const { falhas } = rodarGates(dir)
    assert.ok(falhas.some(f => f.gate === 9 && f.arquivo === '_modelo/.claude/settings.json' && /matcher.*nao cobre Bash e PowerShell/.test(f.detalhe)),
      'matcher so com Bash tem que acusar falha no gate 9')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('gate 9 aceita o _modelo completo, com ask, deny e hook', () => {
  const dir = kitFalso()
  try {
    mkdirSync(join(dir, '_modelo/.claude/hooks'), { recursive: true })
    writeFileSync(join(dir, '_modelo/.claude/hooks/barrar-perigoso.mjs'), 'export function ehPerigoso() { return null }\n')
    writeFileSync(join(dir, '_modelo/.claude/settings.json'), JSON.stringify({
      permissions: { ask: ['Read(./.env)', 'Read(./.env.*)'], deny: ['Read(./secrets/**)'] },
      hooks: { PreToolUse: [{ matcher: 'Bash|PowerShell', hooks: [{ type: 'command', command: 'node barrar-perigoso.mjs' }] }] },
    }))
    const { falhas } = rodarGates(dir)
    const doModelo = falhas.filter(f => f.gate === 9 && f.arquivo === '_modelo/.claude/settings.json')
    assert.strictEqual(doModelo.length, 0, 'com ask, deny e hook, o gate 9 fica quieto')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// Gate 10: atualizador (tabela de impressoes e manifesto de componentes)
// ---------------------------------------------------------------------------

const SKILL_INICIAR = '---\nname: iniciar\ndescription: Inicia.\n---\n\n# /iniciar\n'
const MUDANCA_OK = '# Mudancas\n\n## Como usar (secao comum, sem campos)\n\ntexto\n\n## regra-x\n\n**O que é:** a.\n**Por quê:** b.\n**Te afeta se:** c.\n**Como aplicar:** d.\n**Como testar:** e.\n'

function kitComAtualizador() {
  const dir = kitFalso()
  const comp = { componentes: { nucleo: { depende: [], caminhos: ['.claude/skills/iniciar/'] } }, mistos: [],
    ignorar: { pastas: ['templates/'], arquivos: ['README.md'], finais: ['.test.mjs'] } }
  mkdirSync(join(dir, '_modelo/.claude/skills/iniciar'), { recursive: true })
  mkdirSync(join(dir, '_ferramentas'), { recursive: true })
  writeFileSync(join(dir, '_modelo/.claude/skills/iniciar/SKILL.md'), SKILL_INICIAR)
  writeFileSync(join(dir, 'VERSAO'), '3.5\n')
  writeFileSync(join(dir, 'README.md'), '# SabinOS\n\nVersão 3.5 (2026-09-22)\n')
  writeFileSync(join(dir, '_ferramentas/componentes.json'), JSON.stringify(comp))
  writeFileSync(join(dir, '_ferramentas/mudancas.md'), MUDANCA_OK)
  const tabela = { versao: '3.5', arquivos: { '.claude/skills/iniciar/SKILL.md': { [hashArquivo(Buffer.from(SKILL_INICIAR))]: '3.5' } } }
  writeFileSync(join(dir, '_ferramentas/impressoes.json'), JSON.stringify(tabela))
  return dir
}
const gate10 = dir => rodarGates(dir).falhas.filter(f => f.gate === 10)

test('gate 10 fica quieto em kit sem atualizador', () => {
  const dir = kitFalso()
  try { assert.equal(gate10(dir).length, 0) } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('gate 10 aceita kit em dia e acusa arquivo do _modelo sem impressao', () => {
  const dir = kitComAtualizador()
  try {
    assert.deepEqual(gate10(dir), [], 'canario: o kit montado certo passa')
    writeFileSync(join(dir, '_modelo/.claude/skills/iniciar/SKILL.md'), SKILL_INICIAR + 'linha nova\n')
    assert.ok(gate10(dir).some(f => /impressao digital ausente/.test(f.detalhe)))
    // na pasta-mae do aluno nao existe bancada: a mensagem explica o que significa la
    assert.ok(gate10(dir).some(f => /impressao digital ausente.*\(bancada de desenvolvimento; na pasta-mae do aluno, significa que um arquivo do _modelo foi mexido depois da versao publicada\)/.test(f.detalhe)))
    writeFileSync(join(dir, '_ferramentas/impressoes.json'), JSON.stringify({ versao: '3.4', arquivos: {} }))
    assert.ok(gate10(dir).some(f => /gerada pra 3\.4.*\(bancada de desenvolvimento; na pasta-mae do aluno/.test(f.detalhe)))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('gate 10 acusa arquivo de .claude/ sem componente', () => {
  const dir = kitComAtualizador()
  try {
    mkdirSync(join(dir, '_modelo/.claude/skills/nova'), { recursive: true })
    writeFileSync(join(dir, '_modelo/.claude/skills/nova/SKILL.md'), '---\nname: nova\ndescription: N.\n---\n')
    assert.ok(gate10(dir).some(f => /sem componente/.test(f.detalhe)))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('gate 10 acusa VERSAO diferente do README, dependencia inexistente e mudanca sem campo', () => {
  const dir = kitComAtualizador()
  try {
    writeFileSync(join(dir, 'VERSAO'), '3.6\n')
    const comp = JSON.parse(readFileSync(join(dir, '_ferramentas/componentes.json'), 'utf8'))
    comp.componentes.nucleo.depende = ['fantasma']
    writeFileSync(join(dir, '_ferramentas/componentes.json'), JSON.stringify(comp))
    writeFileSync(join(dir, '_ferramentas/mudancas.md'), MUDANCA_OK.replace('**Como testar:** e.\n', ''))
    const f = gate10(dir).map(x => x.detalhe).join(' | ')
    assert.match(f, /README diz 3\.5/)
    assert.match(f, /fantasma/)
    assert.match(f, /regra-x sem o campo "Como testar"/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// ---------------------------------------------------------------------------
// Pacote Mercado Livre (3.6): gates aceitam o nome de plataforma e conferem agentes
// ---------------------------------------------------------------------------

test('gate 1 aceita mercado livre e bling como nome de plataforma', () => {
  const dir = kitFalso()
  try {
    writeFileSync(join(dir, 'README.md'), '# Kit\n\nVende no Mercado Livre e cadastra no Bling.\n')
    const { falhas } = rodarGates(dir)
    // negativo: a saida precisa ter vindo cheia (o kit falso sempre falha no gate 3)
    assert.ok(falhas.length > 0)
    assert.equal(falhas.filter(f => f.gate === 1).length, 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('gate 1 pega id numerico e marca vindos da lista', () => {
  const dir = kitFalso()
  try {
    writeFileSync(join(dir, 'README.md'), '# Kit\n\nEstoque no deposito 900000001, marca Segundo-Termo-Exemplo.\n')
    const { falhas } = rodarGates(dir, { proibidos: ['900000001', 'segundo-termo-exemplo'] })
    assert.ok(falhas.some(f => f.gate === 1 && /900000001/.test(f.detalhe)))
    assert.ok(falhas.some(f => f.gate === 1 && /segundo-termo-exemplo/.test(f.detalhe)))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('gate 2 exige name, description e tools em agente do _modelo', () => {
  const dir = kitFalso()
  try {
    mkdirSync(join(dir, '_modelo/.claude/agents'), { recursive: true })
    writeFileSync(join(dir, '_modelo/.claude/agents/bom.md'),
      '---\nname: bom\ndescription: Faz algo.\ntools: Read, Write\n---\n\nTexto.\n')
    writeFileSync(join(dir, '_modelo/.claude/agents/sem-tools.md'),
      '---\nname: sem-tools\ndescription: Faz algo.\n---\n\nTexto.\n')
    writeFileSync(join(dir, '_modelo/.claude/agents/sem-frontmatter.md'), '# Agente\n')
    const { falhas } = rodarGates(dir)
    const g2 = falhas.filter(f => f.gate === 2)
    assert.ok(g2.some(f => f.arquivo.endsWith('sem-tools.md') && /tools/.test(f.detalhe)))
    assert.ok(g2.some(f => f.arquivo.endsWith('sem-frontmatter.md')))
    assert.equal(g2.filter(f => f.arquivo.endsWith('bom.md')).length, 0)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// Gate 11: o .gitignore do _modelo e fechado por padrao (nega tudo e libera por tipo).
// Arquivo do kit de tipo fora da lista nasceria fora do backup do aluno, calado.
const GITIGNORE_MODELO = readFileSync(fileURLToPath(new URL('../_modelo/.gitignore', import.meta.url)), 'utf8')

test('gate 11 acusa arquivo do _modelo que o .gitignore fechado deixa fora do backup', () => {
  const dir = kitFalso()
  try {
    mkdirSync(join(dir, '_modelo/marca'), { recursive: true })
    writeFileSync(join(dir, '_modelo/.gitignore'), GITIGNORE_MODELO)
    writeFileSync(join(dir, '_modelo/marca/arte.psd'), '')
    writeFileSync(join(dir, '_modelo/marca/notas.md'), '# notas\n')
    const g11 = rodarGates(dir, { proibidos: [] }).falhas.filter(f => f.gate === 11)
    assert.ok(g11.length > 0, 'canario: o gate rodou e achou alguma coisa')
    assert.deepEqual(g11.map(f => f.arquivo), ['_modelo/marca/arte.psd'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('gate 11 respeita o .gitignore de subpasta do _modelo', () => {
  const dir = kitFalso()
  try {
    mkdirSync(join(dir, '_modelo/motor/out'), { recursive: true })
    writeFileSync(join(dir, '_modelo/.gitignore'), GITIGNORE_MODELO)
    writeFileSync(join(dir, '_modelo/motor/.gitignore'), 'out\n')
    writeFileSync(join(dir, '_modelo/motor/out/a.js'), '')
    writeFileSync(join(dir, '_modelo/motor/b.js'), '')
    const g11 = rodarGates(dir, { proibidos: [] }).falhas.filter(f => f.gate === 11)
    assert.deepEqual(g11.map(f => f.arquivo), ['_modelo/motor/out/a.js'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('gate 11 fica quieto sem .gitignore no _modelo (o Gate 3 cobra a falta)', () => {
  const dir = kitFalso()
  try {
    mkdirSync(join(dir, '_modelo'), { recursive: true })
    writeFileSync(join(dir, '_modelo/arte.psd'), '')
    assert.deepEqual(rodarGates(dir, { proibidos: [] }).falhas.filter(f => f.gate === 11), [])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('o .gitignore do _modelo libera o que o aluno produz e bloqueia o de proposito', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gi-'))
  try {
    writeFileSync(join(dir, '.gitignore'), GITIGNORE_MODELO)
    const entra = ['.gitignore', 'dados/custos.jsonl', 'dados/vendas.xlsx', 'dados/vendas.csv', 'marca/logo.png',
      'marca/FOTO.JPG', 'marca/anim.gif', 'docs/contrato.pdf', 'docs/proposta.docx', '.env.example',
      '_memoria/recados/.gitkeep', '.claude/skills/x/scripts/a.mjs', '.claude/settings.json', 'bem-vindo.html',
      '.claude/skills/configurar-video/referencias/teste-voz.wav',
      '.claude/skills/video-produto/scripts/fontes/Montserrat-Bold.ttf']
    const fica = ['.env', '.env.local', '.origem', '.backup-falhou', '.claude/settings.local.json', 'video.mp4',
      'audio.wav', 'arte.psd', 'pacote.zip', 'node_modules/x/a.js', 'dados/chrome-perfil/Default/Preferences.json',
      'dist/a.js', '.agents/skills/x.md', 'robos/vigia.log']
    assert.deepEqual(foraDoBackup(dir, [...entra, ...fica]), [...fica].sort())
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// .gitignore da pasta-mae: fechado por padrao como o do _modelo. Entra todo arquivo do kit
// fora do _modelo/ (lista real, lida do disco); projeto do aluno e _kit-anterior-* ficam fora.
const RAIZ_KIT = fileURLToPath(new URL('..', import.meta.url))
const GITIGNORE_MAE = readFileSync(join(RAIZ_KIT, '.gitignore'), 'utf8')

function arquivosDoKitForaDoModelo(dir, base = dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    if (nome === '.git' || nome === 'node_modules') continue
    if (dir === base && (nome === '_modelo' || /^_kit-anterior-/.test(nome) || existsSync(join(dir, nome, '_contexto')))) continue
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) arquivosDoKitForaDoModelo(caminho, base, acc)
    else acc.push(relative(base, caminho).split(sep).join('/'))
  }
  return acc
}

test('o .gitignore da pasta-mae libera o kit e deixa fora segredo, midia, projeto e backup do kit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gi-mae-'))
  try {
    writeFileSync(join(dir, '.gitignore'), GITIGNORE_MAE)
    const entra = arquivosDoKitForaDoModelo(RAIZ_KIT).filter(r => r !== '.gitignore')
    assert.ok(entra.length > 20, 'canario: a lista real do kit veio cheia')
    for (const r of ['VERSAO', 'RESPONDA-AQUI.txt', '.claude/skills/.gitkeep', '_ferramentas/componentes.json', 'docs/roadmap-avancado.md'])
      assert.ok(entra.includes(r), `canario: ${r} esta na lista`)
    const fica = ['.env', '.env.local', 'video.mp4', 'SabinOS-Sistema-4.4.zip', 'node_modules/x.js', '.backup-falhou',
      '.claude/settings.local.json', '.agents/skills/x.md', 'meu-projeto/_contexto/empresa.md', 'meu-projeto/AGENTS.md',
      '_kit-anterior-4.3/x.md', '_kit-anterior-4.3/_modelo/AGENTS.md', 'docs/aula.mp4']
    const fora = foraDoBackup(dir, ['.gitignore', ...entra, ...fica])
    assert.ok(fora !== null, 'git rodou')
    assert.deepEqual(fora, [...fica].sort())
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('gate 11 acusa arquivo do kit fora do _modelo que o .gitignore da pasta-mae deixa fora', () => {
  const dir = kitFalso()
  try {
    mkdirSync(join(dir, 'docs'), { recursive: true })
    writeFileSync(join(dir, '.gitignore'), GITIGNORE_MAE)
    writeFileSync(join(dir, 'docs/aula.mp4'), '')
    writeFileSync(join(dir, 'docs/guia.md'), '# guia\n')
    writeFileSync(join(dir, 'VERSAO'), '4.4\n')
    const g11 = rodarGates(dir, { proibidos: [] }).falhas.filter(f => f.gate === 11)
    assert.ok(g11.length > 0, 'canario: o gate rodou e achou alguma coisa')
    assert.deepEqual(g11.map(f => f.arquivo), ['docs/aula.mp4'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// Gate 13: gavetas da memoria do Mapa do _modelo/AGENTS.md
const AGENTS_GAVETAS = [
  '# Sistema', '', '## Mapa', '',
  '- negocio: `_contexto/empresa.md`',
  '- contato: `_contexto/pessoas/`, um por nome',
  '- o que foi feito em cada dia (o diário): `_memoria/diario/AAAA-MM-DD.md`',
  '- decisao: `_memoria/decisoes.md`',
  '- a marca: `marca/tom-de-voz.md`; projeto com `marca/` propria usa a dela',
  '- material: `dados/`', '',
  '## Tabela de destinos', '',
  '- fato → `empresa.md`', '- contato → `pessoas/<nome>.md`', '- feito hoje → o diário',
  '- decisao → `decisoes.md`', '- jeito de falar → a marca', '',
  '## Gatilhos', '', '- comeco → ler `empresa.md`', '',
].join('\r\n')

function kitComGavetas() {
  const dir = kitFalso()
  for (const p of ['_contexto/pessoas', '_memoria/diario', 'marca']) mkdirSync(join(dir, '_modelo', p), { recursive: true })
  writeFileSync(join(dir, '_modelo/AGENTS.md'), AGENTS_GAVETAS)
  for (const f of ['_contexto/empresa.md', '_contexto/pessoas/.gitkeep', '_memoria/diario/.gitkeep', '_memoria/decisoes.md', 'marca/tom-de-voz.md'])
    writeFileSync(join(dir, '_modelo', f), '')
  return dir
}
const gate13 = dir => rodarGates(dir, { proibidos: [] }).falhas.filter(f => f.gate === 13).map(f => f.detalhe)

test('gate 13 passa em kit com toda gaveta do Mapa existindo e com destino', () => {
  const dir = kitComGavetas()
  try { assert.deepEqual(gate13(dir), []) } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('gate 13 acusa gaveta do Mapa que falta no _modelo (arquivo e pasta vazia)', () => {
  const dir = kitComGavetas()
  try {
    rmSync(join(dir, '_modelo/_memoria/decisoes.md'))
    rmSync(join(dir, '_modelo/_memoria/diario/.gitkeep'))
    const g13 = gate13(dir)
    assert.ok(g13.length > 0, 'canario: o gate rodou e achou alguma coisa')
    assert.deepEqual(g13.map(d => d.split(':')[0]).sort(), ['_memoria/decisoes.md', '_memoria/diario/'])
    assert.ok(g13.every(d => /nao existe no _modelo/.test(d)))
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('gate 13 acusa gaveta que a Tabela de destinos e os Gatilhos nao citam', () => {
  const dir = kitComGavetas()
  try {
    writeFileSync(join(dir, '_modelo/AGENTS.md'), AGENTS_GAVETAS.replace('- decisao → `decisoes.md`\r\n', ''))
    assert.deepEqual(gate13(dir), ['_memoria/decisoes.md: gaveta sem quem escreve nem le: o nome nao aparece na Tabela de destinos, nos Gatilhos, no Recall nem em Rotinas'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('gate 13 reprova quando o titulo do Mapa muda, em vez de passar sem conferir', () => {
  const dir = kitComGavetas()
  try {
    writeFileSync(join(dir, '_modelo/AGENTS.md'), AGENTS_GAVETAS.replace('## Mapa', '## Mapa do sistema'))
    assert.deepEqual(gate13(dir).map(d => d.split(':')[0]), ['AGENTS.md'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// o travessao se monta por codigo: literal aqui faria o proprio teste reprovar no Gate 12
test('gate 12 acusa travessao em md, mjs e html do kit, e so neles', () => {
  const dir = kitFalso()
  const D = String.fromCharCode(0x2014), N = String.fromCharCode(0x2013)
  try {
    mkdirSync(join(dir, '_modelo/templates'), { recursive: true })
    writeFileSync(join(dir, '_modelo/AGENTS.md'), `# A\n\nlinha limpa\numa ${D} outra\n`)
    writeFileSync(join(dir, '_modelo/templates/a.mjs'), `// ok\n// x ${N} y\n`)
    writeFileSync(join(dir, '_modelo/templates/b.html'), `<p>a ${D} b</p>\n`)
    writeFileSync(join(dir, '_modelo/templates/limpo.md'), 'nada aqui - hifen comum\n')
    const g12 = rodarGates(dir, { proibidos: [] }).falhas.filter(f => f.gate === 12)
    assert.ok(g12.length > 0, 'canario: o gate rodou e achou alguma coisa')
    assert.deepEqual(g12.map(f => `${f.arquivo} ${f.detalhe.split(':')[0]}`).sort(),
      ['_modelo/AGENTS.md linha 4', '_modelo/templates/a.mjs linha 2', '_modelo/templates/b.html linha 1'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('gate 5 cobra o auto-sync.mjs com guarda no _modelo', () => {
  const dir = kitFalso()
  try {
    mkdirSync(join(dir, '_modelo/.claude/hooks'), { recursive: true })
    const settings = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node "${CLAUDE_PROJECT_DIR}/.claude/hooks/auto-sync.mjs"' }] }] } }
    writeFileSync(join(dir, '_modelo/.claude/settings.json'), JSON.stringify(settings))
    const g5 = () => rodarGates(dir, { proibidos: [] }).falhas.filter(f => f.gate === 5).map(f => f.detalhe)
    assert.deepEqual(g5(), ['settings.json chama o auto-sync.mjs, que nao existe'])
    writeFileSync(join(dir, '_modelo/.claude/hooks/auto-sync.mjs'), "git(dir, ['push'])\n")
    assert.deepEqual(g5(), ['auto-sync.mjs sem guarda de repo/remote'])
    writeFileSync(join(dir, '_modelo/.claude/hooks/auto-sync.mjs'), "git(dir, ['rev-parse', '--git-dir']); git(dir, ['remote', 'get-url', 'origin'])\n")
    assert.deepEqual(g5(), [])
    writeFileSync(join(dir, '_modelo/.claude/settings.json'), JSON.stringify({ hooks: {} }))
    assert.deepEqual(g5(), ['Stop do _modelo sem o auto-sync.mjs'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
