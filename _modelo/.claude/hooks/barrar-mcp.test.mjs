import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avaliarMcp, MODOS_ASK_CALADO } from './barrar-mcp.mjs'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HOOK = fileURLToPath(new URL('./barrar-mcp.mjs', import.meta.url))
// projeto de mentira so pro juizo de caminho: o filename nao toca no disco
const CWD = resolve(tmpdir(), 'projeto-barrar-mcp')
// 5.49 (bloco B, 2026-11-03): o aluno roda solto e a bancada no estrito. Os testes de antes
// seguem inteiros no estrito (decide); os do solto usam o solto
const decide = (tool_name, tool_input, extra = {}) => avaliarMcp({ tool_name, tool_input, cwd: CWD, ...extra }, { estrito: true }).decisao
const solto = (tool_name, tool_input, cwd = CWD) => avaliarMcp({ tool_name, tool_input, cwd })
// nome sensivel e o .. montados em pedacos, nunca inteiros
const ENV = '.e' + 'nv'
const PONTOS = '.' + '.'

test('estrito: leitura de sessao e codigo arbitrario barram, com qualquer nome de servidor', () => {
  // nomes do Playwright conferidos no coreBundle.js da 0.0.81 e na sonda C1a da 0.0.83; da 0.0.82 em
  // diante a ferramenta da pagina chega como webmcp_<nome>, sem o browser_
  const doPlaywright = ['browser_run_code_unsafe', 'browser_evaluate', 'browser_network_request', 'browser_network_requests',
    'browser_cookie_list', 'browser_localstorage_get', 'browser_sessionstorage_set', 'browser_storage_state',
    'browser_set_storage_state', 'browser_webmcp_call', 'browser_webmcp_list', 'webmcp_x']
  for (const servidor of ['playwright', 'pw2'])
    for (const nome of doPlaywright) assert.equal(decide(`mcp__${servidor}__${nome}`, {}), 'barra', `${servidor}: ${nome}`)
  for (const nome of ['javascript_tool', 'read_network_requests'])
    assert.equal(decide(`mcp__claude-in-chrome__${nome}`, {}), 'barra', `claude-in-chrome: ${nome}`)
})

test('estrito: canario, snapshot, navegar e clicar passam', () => {
  for (const servidor of ['playwright', 'pw2']) {
    assert.equal(decide(`mcp__${servidor}__browser_snapshot`, {}), 'passa')
    assert.equal(decide(`mcp__${servidor}__browser_navigate`, { url: 'https://exemplo.com' }), 'passa')
    assert.equal(decide(`mcp__${servidor}__browser_click`, { element: 'botao', ref: 'e1' }), 'passa')
  }
  assert.equal(decide('mcp__claude-in-chrome__read_page', {}), 'passa')
})

test('estrito: ferramenta que a trava nao conhece barra', () => {
  assert.equal(decide('mcp__playwright__browser_algo_novo', {}), 'barra')
  // devtools, opt-in por --caps: grava a rede com cabecalho
  assert.equal(decide('mcp__playwright__browser_start_tracing', {}), 'barra')
  assert.equal(decide('mcp__claude-in-chrome__ferramenta_nova', {}), 'barra')
})

test('estrito: filename so passa em dados/navegador-saida ou em imagem das pastas de print do app', () => {
  const tela = filename => decide('mcp__playwright__browser_take_screenshot', { filename })
  for (const f of ['dados/navegador-saida/tela.png', 'app/telas-minhas/T07.png', 'app/visual/vitrine.png'])
    assert.equal(tela(f), 'passa', `deveria passar: ${f}`)
  const ruins = ['tela.png', PONTOS + '/tela.png', 'dados/ses' + 'sao/x.json', resolve(tmpdir(), 'fora', 'tela.png'),
    'dados/navegador-saida/' + PONTOS + '/' + PONTOS + '/' + ENV, 'app/codigo/x.png', 'app/telas-minhas/x.yml',
    'app/telas-minhas/' + PONTOS + '/' + PONTOS + '/' + ENV]
  for (const f of ruins) assert.equal(tela(f), 'barra', `deveria barrar: ${f}`)
  assert.equal(decide('mcp__playwright__browser_snapshot', { filename: 'dados/navegador-saida/p.yml' }), 'passa', 'canario: o snapshot tambem grava')
})

// arquivos de senha, montados em pedacos, e o projeto com um arquivo comum e uma pasta de fora
function comUpload(fn) {
  const base = mkdtempSync(join(tmpdir(), 'barrar-mcp-'))
  try {
    const proj = join(base, 'proj')
    const fora = join(base, 'fora')
    const criar = rel => { const p = join(proj, ...rel.split('/')); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, 'x'); return p }
    const bom = criar('app/foto.png')
    mkdirSync(fora)
    writeFileSync(join(fora, 'foto.png'), 'x')
    writeFileSync(join(fora, ENV), 'x')
    // caixa trocada: no Windows .ENV abre o mesmo arquivo que .env
    const senhas = [criar(ENV), criar(ENV + '.local'), criar('app/' + ENV.toUpperCase()),
      criar('Dados/Ses' + 'sao/x.json'), criar('dados/ses' + 'sao/y.json'), criar('dados/chrome-perfil/Default/Coo' + 'kies'),
      criar('x.h' + 'ar'), criar('storage-' + 'state.json'), criar('.au' + 'th/x'),
      criar('sec' + 'rets/c.txt'), criar('.sec' + 'rets/c.txt'),
      // semente de 2FA salva em arquivo (chat 7 da 5.28)
      criar('dados/to' + 'tp.json'), criar('dados/ML-TO' + 'TP-seed.json')]
    fn({ base, proj, fora, bom, senhas })
  } finally { rmSync(base, { recursive: true, force: true }) }
}

test('estrito: upload so passa arquivo do projeto fora de segredo', () => comUpload(({ proj, fora, bom, senhas }) => {
  const ruins = [join(fora, 'foto.png'), ...senhas, [proj, 'app', PONTOS, 'app', 'foto.png'].join(sep)]
  // pasta inteira sobe pelo input de pasta da pagina (revisao interna)
  ruins.push(join(proj, 'dados', 'ses' + 'sao'), join(proj, 'app'))
  // atalho dentro do projeto que aponta pra fora: o caminho real e o que vale
  symlinkSync(fora, join(proj, 'app', 'atalho'), 'junction')
  ruins.push(join(proj, 'app', 'atalho', 'foto.png'))
  for (const nome of ['browser_file_upload', 'browser_drop']) {
    const sobe = paths => avaliarMcp({ tool_name: `mcp__playwright__${nome}`, tool_input: { paths }, cwd: proj }, { estrito: true }).decisao
    assert.equal(sobe([bom]), 'passa', `${nome}: canario, o arquivo comum do projeto passa`)
    for (const p of ruins) assert.equal(sobe([p]), 'barra', `${nome}: deveria barrar ${p}`)
    assert.equal(sobe([bom, ruins[1]]), 'barra', `${nome}: um caminho ruim na lista barra a chamada`)
  }
  // o C1b nao rodou (D4, 5.29): o campo de caminho do Claude in Chrome nao foi medido, e os dois barram sempre
  for (const nome of ['file_upload', 'upload_image'])
    for (const campo of ['paths', 'path', 'filePath'])
      assert.equal(avaliarMcp({ tool_name: `mcp__claude-in-chrome__${nome}`, tool_input: { [campo]: [bom] }, cwd: proj }, { estrito: true }).decisao, 'barra', `${nome}.${campo}`)
}))

test('estrito: filename por juncao dentro da pasta de saida vale pelo destino', () => {
  const base = mkdtempSync(join(tmpdir(), 'barrar-mcp-saida-'))
  try {
    const proj = join(base, 'proj')
    const fora = join(base, 'fora')
    mkdirSync(join(proj, 'dados', 'navegador-saida'), { recursive: true })
    mkdirSync(join(proj, 'app', 'telas-minhas'), { recursive: true })
    mkdirSync(fora)
    symlinkSync(fora, join(proj, 'dados', 'navegador-saida', 'link'), 'junction')
    symlinkSync(fora, join(proj, 'app', 'telas-minhas', 'link'), 'junction')
    const tela = filename => avaliarMcp({ tool_name: 'mcp__playwright__browser_take_screenshot', tool_input: { filename }, cwd: proj }, { estrito: true }).decisao
    assert.equal(tela('dados/navegador-saida/nova/tela.png'), 'passa', 'canario: pasta que ainda nao existe dentro da saida passa')
    assert.equal(tela('app/telas-minhas/T01.png'), 'passa', 'canario: print do app passa')
    assert.equal(tela('dados/navegador-saida/link/config.json'), 'barra')
    assert.equal(tela('app/telas-minhas/link/T01.png'), 'barra')
    // a propria pasta de saida como juncao pra fora (Codex comum, volta 2)
    const outro = join(base, 'outro')
    mkdirSync(join(outro, 'dados'), { recursive: true })
    const fora2 = join(base, 'fora2')
    mkdirSync(fora2)
    symlinkSync(fora2, join(outro, 'dados', 'navegador-saida'), 'junction')
    const decideOutro = filename => avaliarMcp({ tool_name: 'mcp__playwright__browser_snapshot', tool_input: { filename }, cwd: outro }, { estrito: true }).decisao
    assert.equal(decideOutro(join(fora2, 'config.json')), 'barra')
    assert.equal(decideOutro('dados/navegador-saida/p.yml'), 'barra')
  } finally { rmSync(base, { recursive: true, force: true }) }
})

test('estrito: o nome com __ no sufixo nao vira leitura de outro servidor', () => {
  assert.equal(decide('mcp__playwright__webmcp_demo__get_secret', {}), 'barra')
  assert.equal(decide('mcp__claude_ai_Gmail__get_message', {}), 'passa', 'canario: leitura de conta com nome normal passa')
})

// 5.35: cada servidor com a sua lista; antes, o Claude in Chrome herdava a regra de upload do Playwright MCP
test('estrito: upload com nome do Playwright MCP no servidor do Claude in Chrome barra', () => {
  for (const nome of ['browser_file_upload', 'browser_drop']) {
    assert.equal(decide(`mcp__playwright__${nome}`, {}), 'passa', `canario: no playwright ${nome} sem paths passa`)
    assert.equal(decide(`mcp__claude-in-chrome__${nome}`, {}), 'barra', nome)
  }
})

// forma medida no Claude Code 2.1.312 (recibo das provas C1b, 2026-10-29); a bancada prende a mesma
// medida ao arquivo de dados da sonda (trava-mcp.test.mjs)
const LOTE = '{"actions":[{"name":"tabs_context_mcp","input":{}},{"name":"get_page_text","input":{"tabId":255428954}}]}'
const lote = (entrada, servidor = 'claude-in-chrome') => decide(`mcp__${servidor}__browser_batch`, entrada)
const comAcoes = (...acoes) => ({ actions: [...JSON.parse(LOTE).actions, ...acoes] })
// o formato que nenhum dos dois modos le
const FORMATO_RUIM = {
  'vazio': {}, 'lista vazia': { actions: [] }, 'actions texto': { actions: 'read_page' },
  'actions objeto': { actions: { name: 'read_page', input: {} } },
  'tool no lugar de name': comAcoes({ tool: 'read_page', input: {} }),
  'params no lugar de input': comAcoes({ name: 'read_page', params: {} }),
  'name com __': comAcoes({ name: 'read_page__x', input: {} }),
  'input ausente': comAcoes({ name: 'read_page' }),
  'input nulo': comAcoes({ name: 'read_page', input: null }),
  'input lista': comAcoes({ name: 'read_page', input: [] }),
  'acao nula': comAcoes(null),
  'name fora de texto': comAcoes({ name: 7, input: {} }),
  'chave a mais no topo': { ...JSON.parse(LOTE), extra: 1 },
  'chave a mais na acao': comAcoes({ name: 'read_page', input: {}, extra: 1 }),
  '__proto__ no topo': JSON.parse(LOTE.slice(0, -1) + ',"__proto__":{}}'),
  '__proto__ na acao': JSON.parse('{"actions":[{"name":"read_page","input":{},"__proto__":{}}]}'),
  'lote dentro de lote': comAcoes({ name: 'browser_batch', input: JSON.parse(LOTE) }),
}

test('estrito: browser_batch julgado acao por acao', () => {
  assert.equal(lote(JSON.parse(LOTE)), 'passa', 'canario: o lote medido passa')
  assert.equal(lote(comAcoes({ name: 'computer', input: { action: 'screenshot' } })), 'passa', 'canario: computer vale como solto')
  assert.equal(lote(comAcoes({ name: 'read_page', input: { filename: 'dados/navegador-saida/p.png' } })), 'passa', 'canario: filename na saida passa')
  const ruins = {
    ...FORMATO_RUIM,
    'javascript_tool': comAcoes({ name: 'javascript_tool', input: { text: 'x' } }),
    'read_network_requests': comAcoes({ name: 'read_network_requests', input: {} }),
    'filename fora da saida': comAcoes({ name: 'read_page', input: { filename: 'tela.png' } }),
    'file_upload': comAcoes({ name: 'file_upload', input: {} }),
    'upload_image': comAcoes({ name: 'upload_image', input: {} }),
    'nome do playwright': comAcoes({ name: 'browser_file_upload', input: {} }),
  }
  for (const [caso, entrada] of Object.entries(ruins)) assert.equal(lote(entrada), 'barra', caso)
  assert.equal(lote(undefined), 'barra', 'sem tool_input')
  // a acao ruim por ultimo: o laco olha todas
  assert.equal(lote({ actions: [{ name: 'read_page', input: {} }, { name: 'find', input: {} }, { name: 'file_upload', input: {} }] }), 'barra', 'misto')
  for (const servidor of ['navegador', 'playwright'])
    assert.equal(lote(JSON.parse(LOTE), servidor), 'barra', `lote medido no servidor ${servidor}`)
})

test('estrito: fora do navegador, verbo de leitura no comeco passa e o resto pede', () => {
  for (const nome of ['mcp__claude_ai_Gmail__search_threads', 'mcp__claude_ai_Gmail__get_message', 'mcp__claude_ai_Gmail__list_labels'])
    assert.equal(decide(nome, {}), 'passa', nome)
  for (const nome of ['mcp__claude_ai_Gmail__send_message', 'mcp__claude_ai_Gmail__forward', 'mcp__claude_ai_Gmail__trash_message',
    'mcp__claude_ai_Buffer__create_post', 'mcp__claude_ai_NotFair-GoogleAds__executeRead'])
    assert.equal(decide(nome, {}), 'pede', nome)
})

// chat 7 (item 3 do recibo do chat 2): o servidor do Bling do proprio kit, so leitura, pedia a cada chamada
test('estrito: fora do navegador, verbo em portugues depois do prefixo do proprio servidor passa', () => {
  const texto = readFileSync(fileURLToPath(new URL('../skills/cadastrar-bling/mcp/ferramentas.mjs', import.meta.url)), 'utf8')
  const nomes = [...texto.matchAll(/name: '([a-z_]+)'/g)].map(m => m[1])
  assert.ok(nomes.length > 0, 'canario: a lista do Bling nao veio vazia')
  for (const nome of nomes) assert.equal(decide(`mcp__bling__${nome}`, {}), 'passa', nome)
  for (const nome of ['mcp__bling__bling_criar_produto', 'mcp__x__delete_list', 'mcp__outro__bling_listar'])
    assert.equal(decide(nome, {}), 'pede', nome)
})

test('estrito e solto: entrada sem tool_name ou fora do mcp barra', () => {
  for (const estrito of [true, false]) {
    assert.equal(avaliarMcp({}, { estrito }).decisao, 'barra')
    assert.equal(avaliarMcp(undefined, { estrito }).decisao, 'barra')
    for (const nome of ['Bash', 'mcp__playwright', 'mcp____browser_snapshot', 'mcp__playwright__', 'xmcp__playwright__browser_snapshot', 42])
      assert.equal(avaliarMcp({ tool_name: nome, tool_input: {}, cwd: CWD }, { estrito }).decisao, 'barra', `${estrito}: ${nome}`)
    assert.equal(avaliarMcp({ tool_name: 'mcp__playwright__browser_snapshot', tool_input: 'texto', cwd: CWD }, { estrito }).decisao, 'barra', 'tool_input fora de objeto')
  }
  assert.equal(avaliarMcp().decisao, 'barra')
})

test('estrito: permission_mode, pede fica pede sem modo e vira barra nos modos do C1d', () => {
  assert.equal(decide('mcp__claude_ai_Gmail__send_message', {}), 'pede')
  // sonda C1d (2026-10-25): o ask perguntou no interativo nos quatro modos e nunca executou calado,
  // entao a lista nasce vazia; os quatro medidos seguem pedindo
  assert.ok(Array.isArray(MODOS_ASK_CALADO))
  for (const modo of MODOS_ASK_CALADO)
    assert.equal(decide('mcp__claude_ai_Gmail__send_message', {}, { permission_mode: modo }), 'barra', modo)
  for (const modo of ['default', 'acceptEdits', 'auto', 'bypassPermissions'].filter(m => !MODOS_ASK_CALADO.includes(m)))
    assert.equal(decide('mcp__claude_ai_Gmail__send_message', {}, { permission_mode: modo }), 'pede', modo)
})

// 5.49 (bloco B, 2026-11-03, blocos 1 a 3): o que o estrito barra ou pede e o solto deixa passar
test('solto: codigo e login na pagina, ferramenta nova, print fora da saida e acao de conta passam', () => comUpload(({ proj, fora, bom }) => {
  const soltos = [
    ['mcp__playwright__browser_evaluate', { function: '() => document.title' }],
    ['mcp__navegador__browser_run_code_unsafe', { code: 'x' }],
    ['mcp__playwright__browser_cookie_list', {}],
    ['mcp__claude-in-chrome__javascript_tool', { text: 'x' }],
    ['mcp__playwright__browser_algo_novo', {}],
    ['mcp__claude-in-chrome__ferramenta_nova', {}],
    ['mcp__playwright__browser_take_screenshot', { filename: 'tela.png' }],
    ['mcp__playwright__browser_take_screenshot', { filename: join(fora, 'tela.png') }],
    ['mcp__playwright__browser_file_upload', { paths: [join(fora, 'foto.png')] }],
    ['mcp__playwright__browser_drop', { paths: [join(fora, 'foto.png')] }],
    ['mcp__claude-in-chrome__file_upload', { paths: [bom] }],
    ['mcp__claude-in-chrome__upload_image', { filePath: join(fora, 'foto.png') }],
    ['mcp__claude_ai_Gmail__send_message', { to: 'x' }],
    ['mcp__claude_ai_Buffer__create_post', {}],
    ['mcp__claude_ai_NotFair-GoogleAds__executeRead', {}],
  ]
  for (const [nome, entrada] of soltos) {
    // canario: o estrito barra ou pede cada um
    assert.notEqual(avaliarMcp({ tool_name: nome, tool_input: entrada, cwd: proj }, { estrito: true }).decisao, 'passa', `canario estrito: ${nome}`)
    assert.equal(solto(nome, entrada, proj).decisao, 'passa', nome)
  }
  // o solto nunca pede, nem no modo que o C1d mediu
  assert.equal(avaliarMcp({ tool_name: 'mcp__claude_ai_Gmail__send_message', tool_input: {}, cwd: proj, permission_mode: 'bypassPermissions' }).decisao, 'passa')
}))

test('solto: arquivo de senha nao sobe, de qualquer pasta, pelo caminho escrito e pelo real', () => comUpload(({ proj, fora, bom, senhas }) => {
  // atalho com nome comum que aponta pra pasta de sessao: o caminho real e o que pega
  symlinkSync(join(proj, 'dados', 'ses' + 'sao'), join(proj, 'app', 'atalho'), 'junction')
  const ruins = [...senhas, join(fora, ENV), join(proj, 'app', 'atalho', 'y.json'),
    // escrito com barra invertida e com .. no meio
    'dados' + String.fromCharCode(92) + 'ses' + 'sao' + String.fromCharCode(92) + 'y.json', 'app/' + PONTOS + '/' + ENV,
    // pasta inteira leva o .env de dentro junto; a dados/sessao sem a barra no fim tambem (revisao do bloco B, 2026-11-03)
    proj, join(proj, 'app'), join(proj, 'dados', 'ses' + 'sao'), '.']
  const sobe = (nome, entrada) => solto(nome, entrada, proj)
  assert.equal(sobe('mcp__playwright__browser_file_upload', { paths: [bom] }).decisao, 'passa', 'canario: o arquivo comum passa')
  for (const p of ruins) {
    for (const nome of ['browser_file_upload', 'browser_drop']) {
      const d = sobe(`mcp__playwright__${nome}`, { paths: [bom, p] })
      assert.deepEqual([d.decisao, d.regra], ['barra', 'upload-de-senha'], `${nome}: ${p}`)
    }
    // o campo do Claude in Chrome nao foi medido: todo texto da entrada conta, pasta inteira inclusive
    // (5.49, revisao do bloco B, 2026-11-03: saiu o pulo das pastas, que escondia o furo)
    for (const nome of ['file_upload', 'upload_image'])
      for (const entrada of [{ paths: [p] }, { path: p }, { filePath: p }, { arquivos: [{ caminho: p }] }]) {
        const d = sobe(`mcp__claude-in-chrome__${nome}`, entrada)
        assert.deepEqual([d.decisao, d.regra], ['barra', 'upload-de-senha'], `${nome} ${JSON.stringify(entrada)}`)
      }
  }
  assert.equal(sobe('mcp__claude-in-chrome__file_upload', { paths: [bom], ref: 'ref_1', tabId: 3 }).decisao, 'passa', 'canario: arquivo comum no Claude in Chrome passa')
  // 5.49 (autonomia, 2026-11-04): o que a trava nao le sai com regra propria, nunca como senha
  for (const [caso, entrada] of [['lista fora de lista', { paths: 'foto.png' }], ['caminho fora de texto', { paths: [7] }], ['caminho vazio', { paths: [bom, ''] }]])
    for (const nome of ['browser_file_upload', 'browser_drop']) {
      const d = sobe(`mcp__playwright__${nome}`, entrada)
      assert.deepEqual([d.decisao, d.regra], ['barra', 'upload-ilegivel'], `${nome}: ${caso}`)
      assert.ok(!/senha/.test(d.motivo), `${nome}: ${caso}: ${d.motivo}`)
    }
  assert.equal(sobe('mcp__playwright__browser_file_upload', {}).decisao, 'passa', 'sem a lista nada sai do disco')
}))

test('solto: lote lido acao por acao, com nome novo passando e o upload de senha barrando dentro', () => comUpload(({ proj, bom, senhas }) => {
  const lotar = entrada => solto('mcp__claude-in-chrome__browser_batch', entrada, proj)
  assert.equal(lotar(JSON.parse(LOTE)).decisao, 'passa', 'canario: o lote medido passa')
  assert.equal(lotar(comAcoes({ name: 'acao_nova', input: {} }, { name: 'javascript_tool', input: { text: 'x' } })).decisao, 'passa')
  assert.equal(lotar(comAcoes({ name: 'file_upload', input: { paths: [bom] } })).decisao, 'passa')
  const senha = lotar(comAcoes({ name: 'file_upload', input: { paths: [senhas[0]] } }))
  assert.deepEqual([senha.decisao, senha.regra], ['barra', 'upload-de-senha'])
  // pasta inteira dentro do lote (revisao do bloco B, 2026-11-03)
  const pasta = lotar(comAcoes({ name: 'file_upload', input: { paths: [proj] } }))
  assert.deepEqual([pasta.decisao, pasta.regra], ['barra', 'upload-de-senha'], 'pasta do projeto dentro do lote')
  for (const [caso, entrada] of Object.entries(FORMATO_RUIM)) {
    const d = lotar(entrada)
    assert.equal(d.decisao, 'barra', caso)
    assert.ok(['lote-ilegivel', 'formato'].includes(d.regra), `${caso}: ${d.regra}`)
  }
  assert.equal(lotar(undefined).regra, 'lote-ilegivel', 'sem tool_input')
  assert.equal(solto('mcp__playwright__browser_batch', JSON.parse(LOTE), proj).decisao, 'barra', 'lote de outro servidor')
}))

test('ponta a ponta: barra sai 2 com o nome da trava e da regra, passa sai 0 calado, e so o PreToolUse se julga', () => {
  const rodar = entrada => spawnSync(process.execPath, [HOOK], {
    input: typeof entrada === 'string' ? entrada : JSON.stringify(entrada), encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: CWD },
  })
  const fim = '. Diga ao usuário o nome da trava e da regra e decida o próximo passo; não refaça esta ação por outro caminho.\n'
  const barra = rodar({ hook_event_name: 'PreToolUse', tool_name: 'mcp__playwright__browser_file_upload', tool_input: { paths: [ENV] }, cwd: CWD })
  assert.equal(barra.status, 2)
  assert.ok(barra.stderr.length > 0, 'canario: o motivo sai no stderr')
  assert.ok(barra.stderr.startsWith('Barrada pela trava barrar-mcp, regra upload-de-senha: '), barra.stderr)
  assert.ok(barra.stderr.endsWith(fim), barra.stderr)
  assert.ok(!barra.stderr.includes(ENV), 'o motivo nunca repete o tool_input')
  for (const [entrada, regra] of [[{ tool_name: 'Bash', tool_input: {} }, 'formato'], ['{ isso nao e json', 'erro-interno'], ['', 'erro-interno'],
    [{ tool_name: 'mcp__claude-in-chrome__browser_batch', tool_input: {} }, 'lote-ilegivel'],
    // 5.49 (autonomia, 2026-11-04): o upload ilegivel continua com o "nao refaca", pode ser arquivo de senha
    [{ tool_name: 'mcp__playwright__browser_file_upload', tool_input: { paths: 'foto.png' } }, 'upload-ilegivel']]) {
    const r = rodar(entrada)
    assert.equal(r.status, 2, JSON.stringify(entrada))
    assert.ok(r.stderr.startsWith(`Barrada pela trava barrar-mcp, regra ${regra}: `) && r.stderr.endsWith(fim), r.stderr)
  }
  for (const nome of ['mcp__playwright__browser_snapshot', 'mcp__playwright__browser_run_code_unsafe', 'mcp__claude_ai_Gmail__send_message']) {
    const passa = rodar({ hook_event_name: 'PreToolUse', tool_name: nome, tool_input: {}, cwd: CWD })
    assert.deepEqual([passa.status, passa.stdout, passa.stderr], [0, '', ''], nome)
  }
  // o settings antigo ainda chama no SessionStart: sai 0 calado, e a mesma entrada no PreToolUse barra
  assert.equal(rodar({ hook_event_name: 'PreToolUse', session_id: 'S1', source: 'startup', cwd: CWD }).status, 2, 'canario: sem tool_name o PreToolUse barra')
  const inicio = rodar({ hook_event_name: 'SessionStart', session_id: 'S1', source: 'startup', cwd: CWD })
  assert.deepEqual([inicio.status, inicio.stdout, inicio.stderr], [0, '', ''])
})

// 5.49 (bloco B, 2026-11-03): saiu o deny do run_code_unsafe (bloco 1) e o SessionStart da
// anotacao do navegador (bloco 2); a trava segue no PreToolUse dos dois settings
test('settings do _modelo e da pasta-mae ligam a trava pra todo mcp, com onFailure block, sem deny e sem SessionStart', () => {
  const ler = rel => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'))
  const arquivos = { _modelo: ler('../settings.json'), mae: ler('../../../.claude/settings.json') }
  for (const [qual, settings] of Object.entries(arquivos)) {
    const blocos = settings.hooks.PreToolUse.filter(b => b.hooks.some(h => h.command.includes('barrar-mcp')))
    assert.equal(blocos.length, 1, `${qual}: um bloco PreToolUse chama a trava do mcp`)
    assert.equal(blocos[0].matcher, 'mcp__.*', `${qual}: matcher`)
    const hook = blocos[0].hooks.find(h => h.command.includes('barrar-mcp'))
    assert.equal(hook.onFailure, 'block', `${qual}: onFailure`)
    assert.equal(settings.permissions, undefined, `${qual}: o permissions saiu inteiro`)
    assert.equal(settings.hooks.SessionStart, undefined, `${qual}: o SessionStart saiu`)
    assert.ok(Array.isArray(settings.hooks.Stop) && settings.hooks.Stop.length === 1, `${qual}: o Stop do backup fica`)
    if (qual === 'mae') {
      assert.match(hook.command, /\/_modelo\/\.claude\/hooks\/barrar-mcp\.mjs/)
      assert.ok(existsSync(HOOK), 'a pasta-mae chama o hook do _modelo, que tem de existir')
    } else assert.match(hook.command, /\/\.claude\/hooks\/barrar-mcp\.mjs/)
  }
})

// 5.49 (bloco B, 2026-11-03, bloco 2): sairam os testes perfil: e anotacao: (o Chrome dedicado
// conferido a cada chamada do navegador e a porta anotada no SessionStart), junto com o
// avaliarMcpComPerfil e o anotarPeloKit do hook
