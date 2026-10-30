#!/usr/bin/env node
// O QUE ESTA TRAVA E: a rede de protecao das ferramentas de fora (MCP): navegador, email, redes.
// No navegador ela barra o que le o login da pagina (cookie, armazenamento, rede com cabecalho)
// ou roda codigo dentro dela, barra a ferramenta que ela nao conhece, e so deixa gravar arquivo
// (print, snapshot) na pasta de saida e subir arquivo do proprio projeto fora de segredo. Fora do
// navegador, ler (buscar, listar, abrir) passa, e o resto (mandar, apagar, publicar) pergunta antes.
// O QUE ELA NAO E: uma garantia. Ela julga pelo nome da ferramenta e pelos campos que conhece, e
// nao enxerga o que o servidor faz por dentro nem o que roda por fora do assistente. A primeira
// linha de defesa e o perfil de navegador separado do dia a dia e o deny de leitura do settings.json;
// esta trava e a segunda.
// Diferente da trava de comando (barrar-perigoso.mjs), aqui o que a trava nao entende barra:
// entrada ilegivel, nome fora do formato mcp__<servidor>__<ferramenta> e erro dentro dela (ata da
// rodada 5.28, recomendacao coletiva, T2 a T4).
// Doc conferida em 2026-10-23 (code.claude.com/docs/en/hooks): o matcher mcp__.* pega toda ferramenta
// de todo servidor, o exit 2 no PreToolUse barra mesmo com allow, e o permissionDecision "ask" no
// stdout faz o Claude Code perguntar. A sonda C1 da 5.28 provou o tool_name real
// (mcp__playwright__browser_navigate) e que o ask pergunta no interativo nos quatro modos e vira negado
// no -p, sem nunca executar calado (por isso MODOS_ASK_CALADO nasce vazio).
// A lista do navegador vem da sonda C1 da 5.28 (pacote do Playwright MCP na versao 0.0.83, e o Claude in
// Chrome do Claude Code 2.1.308); o arquivo da sonda fica na bancada e um teste de la confere esta copia.
// Ferramenta do Playwright MCP com filename grava relativo a raiz do projeto (README do pacote, 0.0.83),
// mesmo com --output-dir, que so vale pro nome automatico: por isso o filename se julga contra a raiz.
// No servidor navegador (o do Chrome dedicado, rodada 5.30) a trava ainda confere, a cada chamada que
// passaria, que ele veio do escopo local e que o Chrome na porta em que foi ligado e o deste projeto:
// pega o Chrome de outro projeto na mesma porta e a porta que mudou. Nao pega o Chrome trocado entre
// a conferencia e a chamada, alguns milissegundos depois.
// No SessionStart (5.31) ela so anota a porta com que o navegador nasceu nesta janela, sem stdout e
// saindo 0; a conferencia usa a anotada, entao religar no meio da sessao barra ate o Claude Code reabrir.
import { realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// sonda C1d da 5.28: nenhum modo deixou o ask passar calado; modo que entrar aqui troca o pede por barra
export const MODOS_ASK_CALADO = []

export const BARRA_NAVEGADOR = /run_code|evaluate|javascript|network_request|cookie|localstorage|sessionstorage|storage_state|webmcp/i

// Playwright MCP: as de capability core da versao fixada (sobe sem --caps, entao o opt-in nem aparece);
// Claude in Chrome: as que a sonda listou. As duas listas sem o que o BARRA_NAVEGADOR pega. Cada servidor
// so usa a sua (5.35): juntas, o browser_file_upload do Claude in Chrome herdava a regra do Playwright MCP.
export const LIBERADAS_PLAYWRIGHT = [
  'browser_click', 'browser_close', 'browser_console_messages', 'browser_drag', 'browser_drop', 'browser_emulate_media',
  'browser_file_upload', 'browser_fill_form', 'browser_find', 'browser_handle_dialog', 'browser_hover', 'browser_navigate',
  'browser_navigate_back', 'browser_press_key', 'browser_resize', 'browser_select_option', 'browser_snapshot', 'browser_tabs',
  'browser_take_screenshot', 'browser_type', 'browser_wait_for',
]
export const LIBERADAS_CHROME_IA = [
  'browser_batch', 'computer', 'file_upload', 'find', 'form_input', 'get_page_text', 'gif_creator', 'list_connected_browsers',
  'navigate', 'read_console_messages', 'read_page', 'resize_window', 'select_browser', 'shortcuts_execute', 'shortcuts_list',
  'switch_browser', 'tabs_close_mcp', 'tabs_context_mcp', 'tabs_create_mcp', 'upload_image',
]
const CHROME_IA = 'claude-in-chrome'
const liberadasDo = servidor => servidor === CHROME_IA ? LIBERADAS_CHROME_IA : LIBERADAS_PLAYWRIGHT

// campo com a lista de caminhos de cada ferramenta que sobe arquivo do disco pra pagina. O browser_drop
// tambem le arquivo local ("as if dragged from outside the page", sonda C1a). O campo do Claude in Chrome
// nao foi medido (a sonda C1b ficou pra 5.29), e sem ele os dois barram sempre.
const CAMPO_DO_UPLOAD = { browser_file_upload: 'paths', browser_drop: 'paths', file_upload: null, upload_image: null }
const UPLOAD = new Set(Object.keys(CAMPO_DO_UPLOAD))
// onde o navegador grava snapshot e console; as duas listas sao exportadas pro .gitignore da bancada
export const SAIDA_NAVEGADOR = 'dados/navegador-saida'
// onde as skills de app guardam o print (app-construir, app-comparar, app-visual, app-testar)
export const PASTAS_DE_PRINT = ['app/telas-minhas', 'app/prints', 'app/defeitos', 'app/visual']
// sobre o caminho relativo com / e em minusculas: no Windows .ENV abre o mesmo arquivo que .env
const SEGREDO_NO_CAMINHO = /(^|\/)\.env|(^|\/)dados\/(sessao|chrome-perfil)\/|\.har$|storage-state[^/]*\.json$|(^|\/)\.auth\/|(^|\/)\.?secrets\/|(^|\/)[^/]*totp[^/]*\.json$/

// em portugues desde o chat 7 da 5.28: o servidor do Bling do kit (cadastrar-bling/mcp) e so leitura
export const VERBO_LEITURA = /^(get|list|search|read|query|find|describe|view|listar|buscar|consultar|ler|obter|ver|saldo)(_|[A-Z]|$)/

const LEITURA_FALHOU = 'a trava não conseguiu ler esta chamada'
const passa = () => ({ decisao: 'passa', motivo: '' })
const pede = motivo => ({ decisao: 'pede', motivo })
const barra = motivo => ({ decisao: 'barra', motivo })

const relativo = (base, alvo) => relative(base, alvo).split(sep).join('/').toLowerCase()
function dentro(base, alvo) {
  const r = relativo(base, alvo)
  return r !== '' && r !== '..' && !r.startsWith('../') && !isAbsolute(r)
}

// caminho real do pedaco que ja existe, mais o resto que ainda vai nascer: juncao ou link dentro da
// pasta de saida que aponta pra fora vale pelo destino (Codex comum, achado 2)
function real(p) {
  const resto = []
  for (let atual = p; ; atual = dirname(atual)) {
    try { return join(realpathSync.native(atual), ...resto) } catch {}
    if (dirname(atual) === atual) return p
    resto.unshift(basename(atual))
  }
}

export function dentroDaSaida(cwd, alvo) {
  if (typeof alvo !== 'string' || !alvo) return false
  const abs = real(resolve(cwd, alvo))
  const raiz = real(resolve(cwd))
  // a pasta liberada tambem tem de ficar no projeto: ela mesma pode ser juncao pra fora (Codex comum, volta 2)
  const liberada = p => { const b = real(resolve(cwd, p)); return dentro(raiz, b) && dentro(b, abs) }
  if (liberada(SAIDA_NAVEGADOR)) return true
  if (/\.(png|jpe?g)$/i.test(abs) && PASTAS_DE_PRINT.some(liberada)) return true
  return false
}

function uploadLimpo(cwd, sufixo, entrada) {
  const campo = CAMPO_DO_UPLOAD[sufixo]
  if (!campo) return false
  const lista = entrada ? entrada[campo] : undefined
  // sem a lista nada sai do disco (o Playwright MCP so fecha a janela de escolher arquivo)
  if (lista === undefined) return true
  if (!Array.isArray(lista)) return false
  let raiz
  try { raiz = realpathSync.native(cwd) } catch { return false }
  return lista.every(p => {
    if (typeof p !== 'string' || !p || p.split(/[\\/]/).includes('..')) return false
    // atalho, link ou juncao dentro do projeto que aponta pra fora vale pelo destino; caminho que nao existe barra
    let real
    try { real = realpathSync.native(resolve(cwd, p)) } catch { return false }
    if (!dentro(raiz, real)) return false
    // pasta inteira sobe pelo input de pasta da pagina, com o que tiver dentro (revisao interna)
    if (statSync(real).isDirectory()) return false
    return !SEGREDO_NO_CAMINHO.test(relativo(raiz, real)) && !SEGREDO_NO_CAMINHO.test(relativo(cwd, resolve(cwd, p)))
  })
}

// Lote do Claude in Chrome na forma medida no Claude Code 2.1.312 (recibo das provas C1b, 2026-10-29):
// {"actions":[{"name":"<ferramenta>","input":{...}}]}. Qualquer desvio devolve null e o lote barra; formato
// novo de versao futura barra a mais. Lote dentro de lote barra sem recursao.
const objeto = x => x !== null && typeof x === 'object' && !Array.isArray(x)
const soAsChaves = (x, chaves) => {
  const k = Object.keys(x).sort()
  return k.length === chaves.length && k.every((c, i) => c === chaves[i])
}
function acoesDoBatch(servidor, entrada) {
  if (servidor !== CHROME_IA || !objeto(entrada) || !soAsChaves(entrada, ['actions'])) return null
  const { actions } = entrada
  if (!Array.isArray(actions) || actions.length === 0) return null
  const acoes = []
  for (const a of actions) {
    if (!objeto(a) || !soAsChaves(a, ['input', 'name'])) return null
    if (typeof a.name !== 'string' || a.name === 'browser_batch' || !LIBERADAS_CHROME_IA.includes(a.name)) return null
    if (!objeto(a.input)) return null
    acoes.push({ nome: a.name, entrada: a.input })
  }
  return acoes
}

function julgar(tool_name, tool_input, cwd) {
  if (typeof tool_name !== 'string') return barra('chamada sem nome de ferramenta')
  const partes = tool_name.split('__')
  const servidor = partes[1]
  const sufixo = partes.slice(2).join('__')
  // nome de servidor e de ferramenta conhecida nao levam __: partir pelo ultimo deixaria
  // mcp__playwright__webmcp_demo__get_secret virar leitura de outro servidor
  if (partes[0] !== 'mcp' || partes.length < 3 || !servidor || !sufixo || sufixo.includes('__'))
    return barra('ferramenta fora do formato mcp__<servidor>__<ferramenta>')
  if (tool_input !== undefined && (tool_input === null || typeof tool_input !== 'object' || Array.isArray(tool_input)))
    return barra(LEITURA_FALHOU)
  const ehNavegador = servidor === CHROME_IA || sufixo.startsWith('browser_') || sufixo.startsWith('webmcp_')
  if (ehNavegador) {
    if (sufixo === 'browser_batch') {
      const acoes = acoesDoBatch(servidor, tool_input)
      if (!acoes) return barra('lote de ações do navegador num formato que a trava não lê')
      for (const acao of acoes) {
        const d = julgar(`mcp__${servidor}__${acao.nome}`, acao.entrada, cwd)
        if (d.decisao !== 'passa') return d
      }
      return passa()
    }
    if (BARRA_NAVEGADOR.test(sufixo)) return barra('ferramenta do navegador que lê o login da página ou roda código nela')
    if (!liberadasDo(servidor).includes(sufixo)) return barra('ferramenta do navegador que a trava não conhece')
    if (tool_input && 'filename' in tool_input && !dentroDaSaida(cwd, tool_input.filename))
      return barra('arquivo do navegador fora de dados/navegador-saida/ (print de app vai nas pastas de print do app)')
    if (UPLOAD.has(sufixo) && !uploadLimpo(cwd, sufixo, tool_input)) return barra('upload de arquivo fora do projeto ou de segredo')
    return passa()
  }
  // o prefixo <servidor>_ cai so quando e o nome do proprio servidor (mcp__bling__bling_listar);
  // prefixo qualquer cairia e faria mcp__x__delete_list virar leitura
  const verbo = sufixo.startsWith(servidor + '_') ? sufixo.slice(servidor.length + 1) : sufixo
  return VERBO_LEITURA.test(verbo) ? passa() : pede('ação de conta fora do navegador: confirme antes')
}

// Contrato da 5.28: o porteiro MCP da bancada importa esta funcao e repassa o permission_mode dele.
export function avaliarMcp({ tool_name, tool_input, cwd, permission_mode } = {}) {
  let d
  try {
    d = julgar(tool_name, tool_input, typeof cwd === 'string' && cwd ? cwd : process.cwd())
  } catch {
    return barra(LEITURA_FALHOU)
  }
  if (d.decisao === 'pede' && MODOS_ASK_CALADO.includes(permission_mode))
    return barra('neste modo a confirmação não aparece: rode fora dele')
  return d
}

// O porteiro do perfil (5.30, D19 e D20). A lib do Chrome dedicado so carrega pro servidor navegador:
// ferramenta de outro servidor nao paga a rede. A origem local e a do claude mcp add do passo 3 do
// Degrau 5 (C1 da 5.30); com --mcp-config ela vem dynamic e a configuracao lida nao e a que roda.
const LIB_NAVEGADOR = new URL('../skills/conectar/scripts/lib/navegador.mjs', import.meta.url).href
const ATUALIZAR = 'rode o `/atualizar-sabinos`'
const FECHAR_E_ABRIR = 'feche e abra o Claude Code antes de usar'
// o texto de religar vem da lib (c.religar), o mesmo do log do abrir-chrome
const RECADO_DO_PERFIL = {
  'porta-fechada': () => 'o Chrome dedicado não está aberto: rode `node .claude/skills/conectar/scripts/abrir-chrome.mjs` e tente de novo',
  'outro-na-porta': c => `na porta ${c.porta} responde um Chrome que não é o deste projeto: rode o \`abrir-chrome.mjs\`; se ele disser que a porta mudou, ${c.religar}`,
  'porta-mudou': c => `o \`navegador\` foi ligado na porta ${c.porta}, mas o Chrome deste projeto agora usa outra: ${c.religar}`,
  'sem-anotacao': () => `o \`navegador\` não estava ligado quando o Claude Code abriu (ou a anotação se perdeu): ${FECHAR_E_ABRIR}`,
  'religado': c => `o \`navegador\` foi ligado de novo depois que o Claude Code abriu, e o que está rodando segue na porta ${c.porta}: ${FECHAR_E_ABRIR}`,
  'sem-config': () => `não deu pra saber em que porta o \`navegador\` foi ligado: ligue de novo pelo passo 3 do Degrau 5; se continuar, ${ATUALIZAR}`,
  'sem-lib': () => `a conferência do Chrome deste projeto não abriu: ${ATUALIZAR}`,
}
RECADO_DO_PERFIL['sem-sentinela'] = RECADO_DO_PERFIL['outro-na-porta']

async function conferirPeloKit({ raiz, janela, sessao }) {
  let lib
  try { lib = await import(LIB_NAVEGADOR) } catch { return { estado: 'sem-lib' } }
  if (typeof lib.conferirServidor !== 'function' || typeof lib.RELIGAR !== 'string') return { estado: 'sem-lib' }
  return { ...(await lib.conferirServidor({ raiz, janela, sessao })), religar: lib.RELIGAR }
}

// SessionStart: anota e nada mais. O stdout desse evento vira contexto da IA, entao nada sai nele.
async function anotarPeloKit({ raiz, janela, sessao, origem }) {
  try {
    const lib = await import(LIB_NAVEGADOR)
    lib.anotarSessao({ raiz, janela, sessao, origem })
  } catch {}
}

export async function avaliarMcpComPerfil(entrada = {}, { conferir = conferirPeloKit } = {}) {
  const d = avaliarMcp(entrada)
  if (d.decisao !== 'passa' || entrada.tool_name.split('__')[1] !== 'navegador') return d
  const origem = entrada.mcp_server?.source
  if (origem === undefined) return barra('o Claude Code não disse de onde veio o `navegador`: atualize o Claude Code')
  if (origem !== 'local') return barra('o `navegador` deste projeto não veio do passo 3 do Degrau 5: ligue de novo por ele')
  let c
  try {
    c = await conferir({
      raiz: typeof entrada.cwd === 'string' && entrada.cwd ? entrada.cwd : process.cwd(),
      janela: entrada.janela, sessao: entrada.session_id,
    })
  } catch {
    return barra('a trava não conseguiu conferir o Chrome deste projeto')
  }
  if (c?.estado === 'conferido') return d
  const recado = RECADO_DO_PERFIL[c?.estado]
  return barra(recado ? recado({ religar: ATUALIZAR, ...c }) : 'a trava não conseguiu conferir o Chrome deste projeto')
}

// rodada 5.20 (decisao 9, N37): o import.meta.url vem com o atalho resolvido e o argv[1] do jeito que
// veio; com o projeto aberto por juncao ou link, a comparacao crua dava falso e a trava nao rodava
function chamadoDireto() {
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])
  } catch {
    return false
  }
}

if (chamadoDireto()) {
  let bruto = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', pedaco => { bruto += pedaco })
  process.stdin.on('end', async () => {
    let r
    try {
      const entrada = JSON.parse(bruto)
      // o cwd do Bash pode ter andado; o servidor MCP resolve o caminho pela raiz do projeto
      const raiz = process.env.CLAUDE_PROJECT_DIR || entrada.cwd
      if (entrada.hook_event_name === 'SessionStart') {
        await anotarPeloKit({ raiz, janela: process.env.CLAUDE_PID, sessao: entrada.session_id, origem: entrada.source })
        process.exitCode = 0
        return
      }
      r = await avaliarMcpComPerfil({
        tool_name: entrada.tool_name, tool_input: entrada.tool_input, mcp_server: entrada.mcp_server,
        cwd: raiz, permission_mode: entrada.permission_mode,
        janela: process.env.CLAUDE_PID, session_id: entrada.session_id,
      })
    } catch {
      r = barra(LEITURA_FALHOU)
    }
    if (r.decisao === 'passa') { process.exitCode = 0; return }
    if (r.decisao === 'pede') {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: r.motivo },
      }))
      process.exitCode = 0
      return
    }
    process.stderr.write(
      `Uma ferramenta de fora foi barrada antes de rodar: ${r.motivo}.\n` +
      `Pare aqui: explique pro usuario o que voce estava tentando fazer e peca a ele\n` +
      `pra decidir o proximo passo, em vez de tentar de outro jeito pra fazer a mesma coisa.\n`,
    )
    process.exitCode = 2
  })
}
