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
const decide = (tool_name, tool_input, extra = {}) => avaliarMcp({ tool_name, tool_input, cwd: CWD, ...extra }).decisao
// nome sensivel e o .. montados em pedacos, nunca inteiros
const ENV = '.e' + 'nv'
const PONTOS = '.' + '.'

test('navegador: leitura de sessao e codigo arbitrario barram, com qualquer nome de servidor', () => {
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

test('navegador: canario, snapshot, navegar e clicar passam', () => {
  for (const servidor of ['playwright', 'pw2']) {
    assert.equal(decide(`mcp__${servidor}__browser_snapshot`, {}), 'passa')
    assert.equal(decide(`mcp__${servidor}__browser_navigate`, { url: 'https://exemplo.com' }), 'passa')
    assert.equal(decide(`mcp__${servidor}__browser_click`, { element: 'botao', ref: 'e1' }), 'passa')
  }
  assert.equal(decide('mcp__claude-in-chrome__read_page', {}), 'passa')
})

test('navegador: ferramenta que a trava nao conhece barra', () => {
  assert.equal(decide('mcp__playwright__browser_algo_novo', {}), 'barra')
  // devtools, opt-in por --caps: grava a rede com cabecalho
  assert.equal(decide('mcp__playwright__browser_start_tracing', {}), 'barra')
  assert.equal(decide('mcp__claude-in-chrome__ferramenta_nova', {}), 'barra')
})

test('navegador: filename so passa em dados/navegador-saida ou em imagem das pastas de print do app', () => {
  const tela = filename => decide('mcp__playwright__browser_take_screenshot', { filename })
  for (const f of ['dados/navegador-saida/tela.png', 'app/telas-minhas/T07.png', 'app/visual/vitrine.png'])
    assert.equal(tela(f), 'passa', `deveria passar: ${f}`)
  const ruins = ['tela.png', PONTOS + '/tela.png', 'dados/ses' + 'sao/x.json', resolve(tmpdir(), 'fora', 'tela.png'),
    'dados/navegador-saida/' + PONTOS + '/' + PONTOS + '/' + ENV, 'app/codigo/x.png', 'app/telas-minhas/x.yml',
    'app/telas-minhas/' + PONTOS + '/' + PONTOS + '/' + ENV]
  for (const f of ruins) assert.equal(tela(f), 'barra', `deveria barrar: ${f}`)
  assert.equal(decide('mcp__playwright__browser_snapshot', { filename: 'dados/navegador-saida/p.yml' }), 'passa', 'canario: o snapshot tambem grava')
})

test('navegador: upload so passa arquivo do projeto fora de segredo', () => {
  const base = mkdtempSync(join(tmpdir(), 'barrar-mcp-'))
  try {
    const proj = join(base, 'proj')
    const fora = join(base, 'fora')
    const criar = rel => { const p = join(proj, ...rel.split('/')); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, 'x'); return p }
    const bom = criar('app/foto.png')
    mkdirSync(fora)
    writeFileSync(join(fora, 'foto.png'), 'x')
    // caixa trocada: no Windows .ENV abre o mesmo arquivo que .env
    const ruins = [join(fora, 'foto.png'), criar(ENV), criar(ENV + '.local'), criar('app/' + ENV.toUpperCase()),
      criar('Dados/Ses' + 'sao/x.json'), criar('dados/ses' + 'sao/y.json'), criar('dados/chrome-perfil/Default/Coo' + 'kies'),
      criar('x.h' + 'ar'), criar('storage-' + 'state.json'), criar('.au' + 'th/x'),
      criar('sec' + 'rets/c.txt'), criar('.sec' + 'rets/c.txt'),
      [proj, 'app', PONTOS, 'app', 'foto.png'].join(sep)]
    // pasta inteira sobe pelo input de pasta da pagina (revisao interna)
    ruins.push(join(proj, 'dados', 'ses' + 'sao'), join(proj, 'app'))
    // semente de 2FA salva em arquivo (chat 7 da 5.28)
    ruins.push(criar('dados/to' + 'tp.json'), criar('dados/ML-TO' + 'TP-seed.json'))
    // atalho dentro do projeto que aponta pra fora: o caminho real e o que vale
    symlinkSync(fora, join(proj, 'app', 'atalho'), 'junction')
    ruins.push(join(proj, 'app', 'atalho', 'foto.png'))
    for (const nome of ['browser_file_upload', 'browser_drop']) {
      const sobe = paths => avaliarMcp({ tool_name: `mcp__playwright__${nome}`, tool_input: { paths }, cwd: proj }).decisao
      assert.equal(sobe([bom]), 'passa', `${nome}: canario, o arquivo comum do projeto passa`)
      for (const p of ruins) assert.equal(sobe([p]), 'barra', `${nome}: deveria barrar ${p}`)
      assert.equal(sobe([bom, ruins[1]]), 'barra', `${nome}: um caminho ruim na lista barra a chamada`)
    }
    // o C1b nao rodou (D4, 5.29): o campo de caminho do Claude in Chrome nao foi medido, e os dois barram sempre
    for (const nome of ['file_upload', 'upload_image'])
      for (const campo of ['paths', 'path', 'filePath'])
        assert.equal(avaliarMcp({ tool_name: `mcp__claude-in-chrome__${nome}`, tool_input: { [campo]: [bom] }, cwd: proj }).decisao, 'barra', `${nome}.${campo}`)
  } finally { rmSync(base, { recursive: true, force: true }) }
})

test('navegador: filename por juncao dentro da pasta de saida vale pelo destino', () => {
  const base = mkdtempSync(join(tmpdir(), 'barrar-mcp-saida-'))
  try {
    const proj = join(base, 'proj')
    const fora = join(base, 'fora')
    mkdirSync(join(proj, 'dados', 'navegador-saida'), { recursive: true })
    mkdirSync(join(proj, 'app', 'telas-minhas'), { recursive: true })
    mkdirSync(fora)
    symlinkSync(fora, join(proj, 'dados', 'navegador-saida', 'link'), 'junction')
    symlinkSync(fora, join(proj, 'app', 'telas-minhas', 'link'), 'junction')
    const tela = filename => avaliarMcp({ tool_name: 'mcp__playwright__browser_take_screenshot', tool_input: { filename }, cwd: proj }).decisao
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
    const decideOutro = filename => avaliarMcp({ tool_name: 'mcp__playwright__browser_snapshot', tool_input: { filename }, cwd: outro }).decisao
    assert.equal(decideOutro(join(fora2, 'config.json')), 'barra')
    assert.equal(decideOutro('dados/navegador-saida/p.yml'), 'barra')
  } finally { rmSync(base, { recursive: true, force: true }) }
})

test('navegador: o nome com __ no sufixo nao vira leitura de outro servidor', () => {
  assert.equal(decide('mcp__playwright__webmcp_demo__get_secret', {}), 'barra')
  assert.equal(decide('mcp__claude_ai_Gmail__get_message', {}), 'passa', 'canario: leitura de conta com nome normal passa')
})

test('navegador: browser_batch julgado acao por acao', () => {
  // o C1b nao rodou (D4, 5.29): o exemploBatch do arquivo de dados da bancada e null, entao o formato do
  // lote nao foi medido e todo browser_batch barra, inclusive o lote so de leitura
  for (const entrada of [{}, { actions: [] }, { actions: [{ tool: 'read_page', input: {} }] }, { actions: [{ name: 'javascript_tool', input: {} }] }])
    assert.equal(decide('mcp__claude-in-chrome__browser_batch', entrada), 'barra', JSON.stringify(Object.keys(entrada)))
})

test('fora do navegador: verbo de leitura no comeco passa e o resto pede', () => {
  for (const nome of ['mcp__claude_ai_Gmail__search_threads', 'mcp__claude_ai_Gmail__get_message', 'mcp__claude_ai_Gmail__list_labels'])
    assert.equal(decide(nome, {}), 'passa', nome)
  for (const nome of ['mcp__claude_ai_Gmail__send_message', 'mcp__claude_ai_Gmail__forward', 'mcp__claude_ai_Gmail__trash_message',
    'mcp__claude_ai_Buffer__create_post', 'mcp__claude_ai_NotFair-GoogleAds__executeRead'])
    assert.equal(decide(nome, {}), 'pede', nome)
})

// chat 7 (item 3 do recibo do chat 2): o servidor do Bling do proprio kit, so leitura, pedia a cada chamada
test('fora do navegador: verbo em portugues depois do prefixo do proprio servidor passa', () => {
  const texto = readFileSync(fileURLToPath(new URL('../skills/cadastrar-bling/mcp/ferramentas.mjs', import.meta.url)), 'utf8')
  const nomes = [...texto.matchAll(/name: '([a-z_]+)'/g)].map(m => m[1])
  assert.ok(nomes.length > 0, 'canario: a lista do Bling nao veio vazia')
  for (const nome of nomes) assert.equal(decide(`mcp__bling__${nome}`, {}), 'passa', nome)
  for (const nome of ['mcp__bling__bling_criar_produto', 'mcp__x__delete_list', 'mcp__outro__bling_listar'])
    assert.equal(decide(nome, {}), 'pede', nome)
})

test('entrada sem tool_name ou fora do mcp barra', () => {
  assert.equal(avaliarMcp({}).decisao, 'barra')
  assert.equal(avaliarMcp().decisao, 'barra')
  for (const nome of ['Bash', 'mcp__playwright', 'mcp____browser_snapshot', 'mcp__playwright__', 'xmcp__playwright__browser_snapshot', 42])
    assert.equal(decide(nome, {}), 'barra', String(nome))
  assert.equal(decide('mcp__playwright__browser_snapshot', 'texto'), 'barra', 'tool_input fora de objeto')
})

test('ponta a ponta: barra sai 2, pede devolve ask, passa sai 0 calado', () => {
  const rodar = entrada => spawnSync(process.execPath, [HOOK], {
    input: typeof entrada === 'string' ? entrada : JSON.stringify(entrada), encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: CWD },
  })
  const barra = rodar({ tool_name: 'mcp__playwright__browser_run_code_unsafe', tool_input: { code: 'x' }, cwd: CWD })
  assert.equal(barra.status, 2)
  assert.ok(barra.stderr.length > 0, 'o motivo sai no stderr')
  assert.ok(!barra.stderr.includes('"code"'), 'o motivo nunca repete o tool_input')
  const pede = rodar({ tool_name: 'mcp__claude_ai_Gmail__send_message', tool_input: { to: 'x' }, cwd: CWD })
  assert.equal(pede.status, 0)
  const saida = JSON.parse(pede.stdout)
  assert.equal(saida.hookSpecificOutput.hookEventName, 'PreToolUse')
  assert.equal(saida.hookSpecificOutput.permissionDecision, 'ask')
  assert.ok(saida.hookSpecificOutput.permissionDecisionReason.length > 0)
  const passa = rodar({ tool_name: 'mcp__playwright__browser_snapshot', tool_input: {}, cwd: CWD })
  assert.equal(passa.status, 0)
  assert.equal(passa.stdout, '')
  assert.equal(passa.stderr, '')
  assert.equal(rodar('{ isso nao e json').status, 2)
  assert.equal(rodar('').status, 2)
})

test('permission_mode: pede fica pede sem modo e vira barra nos modos do C1d', () => {
  assert.equal(decide('mcp__claude_ai_Gmail__send_message', {}), 'pede')
  // sonda C1d (2026-10-25): o ask perguntou no interativo nos quatro modos e nunca executou calado,
  // entao a lista nasce vazia; os quatro medidos seguem pedindo
  assert.ok(Array.isArray(MODOS_ASK_CALADO))
  for (const modo of MODOS_ASK_CALADO)
    assert.equal(decide('mcp__claude_ai_Gmail__send_message', {}, { permission_mode: modo }), 'barra', modo)
  for (const modo of ['default', 'acceptEdits', 'auto', 'bypassPermissions'].filter(m => !MODOS_ASK_CALADO.includes(m)))
    assert.equal(decide('mcp__claude_ai_Gmail__send_message', {}, { permission_mode: modo }), 'pede', modo)
})

test('settings do _modelo e da pasta-mae ligam a trava pra todo mcp, com onFailure block e o deny do run_code_unsafe', () => {
  const ler = rel => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'))
  const arquivos = { _modelo: ler('../settings.json'), mae: ler('../../../.claude/settings.json') }
  for (const [qual, settings] of Object.entries(arquivos)) {
    const blocos = settings.hooks.PreToolUse.filter(b => b.hooks.some(h => h.command.includes('barrar-mcp')))
    assert.equal(blocos.length, 1, `${qual}: um bloco PreToolUse chama a trava do mcp`)
    assert.equal(blocos[0].matcher, 'mcp__.*', `${qual}: matcher`)
    const hook = blocos[0].hooks.find(h => h.command.includes('barrar-mcp'))
    assert.equal(hook.onFailure, 'block', `${qual}: onFailure`)
    for (const regra of ['mcp__playwright__browser_run_code_unsafe', 'mcp__navegador__browser_run_code_unsafe'])
      assert.ok(settings.permissions.deny.includes(regra), `${qual}: deny sem ${regra}`)
    if (qual === 'mae') {
      assert.match(hook.command, /\/_modelo\/\.claude\/hooks\/barrar-mcp\.mjs/)
      assert.ok(existsSync(HOOK), 'a pasta-mae chama o hook do _modelo, que tem de existir')
    } else assert.match(hook.command, /\/\.claude\/hooks\/barrar-mcp\.mjs/)
  }
})
