import { test } from 'node:test'
import assert from 'node:assert'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rodarGates } from './verificar-kit.mjs'
import { hashArquivo } from './atualizar-projeto.mjs'

function kitFalso() {
  const dir = mkdtempSync(join(tmpdir(), 'kit-'))
  mkdirSync(join(dir, '.claude/skills/iniciar'), { recursive: true })
  writeFileSync(join(dir, '.claude/skills/iniciar/SKILL.md'),
    '---\nname: iniciar\ndescription: Inicia a sessao.\n---\n\n# /iniciar\n')
  return dir
}

test('gate 1 pega termo proibido', () => {
  const dir = kitFalso()
  writeFileSync(join(dir, 'README.md'), '# Kit\n\nUsado na operacao Zabinno.\n')
  const { falhas } = rodarGates(dir)
  assert.ok(falhas.some(f => f.gate === 1 && /zabinno/i.test(f.detalhe)))
  rmSync(dir, { recursive: true, force: true })
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
  const { falhas } = rodarGates(dir)
  assert.ok(!falhas.some(f => f.gate === 1 && f.arquivo.endsWith('a.md')), 'sabinos (nome do produto) e permitido')
  assert.ok(falhas.some(f => f.gate === 1 && f.arquivo.endsWith('b.md') && /sabino/i.test(f.detalhe)), 'sabino sozinho continua proibido')
  rmSync(dir, { recursive: true, force: true })
})

test('gate 1 nao acusa o proprio detector por conter a lista de termos e exemplos de segredo', () => {
  const dir = kitFalso()
  mkdirSync(join(dir, '_ferramentas'), { recursive: true })
  writeFileSync(join(dir, '_ferramentas/verificar-kit.mjs'), "const PROIBIDOS = ['zabinno', 'bling', 'sabino']\n")
  writeFileSync(join(dir, '_ferramentas/verificar-kit.test.mjs'),
    "writeFileSync(x, 'Usado na operacao Zabinno.\\n')\nwriteFileSync(y, 'GEMINI_API_KEY=AIzaSyD9x1abcdefgh\\n')\n")
  const { falhas } = rodarGates(dir)
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
  writeFileSync(join(dir, '.claude/skills/x/scripts/a.ps1'), "# roda na conta Zabinno\n")
  writeFileSync(join(dir, '.claude/skills/x/scripts/b.py'), "# roda na conta Zabinno\n")
  writeFileSync(join(dir, '.claude/skills/x/scripts/c.sh'), "# roda na conta Zabinno\n")
  writeFileSync(join(dir, '.claude/skills/x/scripts/d.cjs'), "// roda na conta Zabinno\n")
  const { falhas } = rodarGates(dir)
  for (const arquivo of ['a.ps1', 'b.py', 'c.sh', 'd.cjs']) {
    assert.ok(falhas.some(f => f.gate === 1 && f.arquivo.endsWith(arquivo) && /zabinno/i.test(f.detalhe)),
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

test('gate 1 pega a marca do kit de origem (fork) sobrando no produto', () => {
  const dir = kitFalso()
  writeFileSync(join(dir, 'a.md'), '# Minha Loja, Claude Code OS\n')
  const { falhas } = rodarGates(dir)
  assert.ok(falhas.some(f => f.gate === 1 && f.arquivo.endsWith('a.md') && /claude code os/.test(f.detalhe)))
  rmSync(dir, { recursive: true, force: true })
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
