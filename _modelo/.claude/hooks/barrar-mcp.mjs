#!/usr/bin/env node
// O QUE ESTA TRAVA E: a rede de protecao das ferramentas de fora (MCP): navegador, email, redes.
// 5.49 (bloco B, 2026-11-03): no projeto do aluno ela so barra subir arquivo de senha pelo
// navegador (de qualquer pasta, pelo caminho escrito e pelo real, solto ou dentro do lote do Claude in
// Chrome), o lote num formato que ela nao le, o nome fora do formato e a entrada que ela nao entende.
// Saiu o resto (decisoes de 2026-11-03, blocos 1 a 3): a barra de
// codigo e login no navegador, a lista de ferramenta conhecida, o print fora da pasta de saida, o
// upload de fora do projeto, a conferencia do Chrome dedicado e a pergunta da acao de conta.
// Com { estrito: true } (so a bancada passa, T45) valem as regras de antes, inteiras, menos rodar codigo
// na pagina, que passa desde a 5.52 (decisao 20 da carta, 2026-11-05).
// O QUE ELA NAO E: uma garantia. Ela julga pelo nome da ferramenta e pelos campos que conhece, e
// nao enxerga o que o servidor faz por dentro nem o que roda por fora do assistente.
// Diferente da trava de comando (barrar-perigoso.mjs), aqui o que a trava nao entende barra:
// entrada ilegivel, nome fora do formato mcp__<servidor>__<ferramenta> e erro dentro dela (ata da
// rodada 5.28, recomendacao coletiva, T2 a T4).
// Doc conferida em 2026-10-23 (code.claude.com/docs/en/hooks): o matcher mcp__.* pega toda ferramenta
// de todo servidor, o exit 2 no PreToolUse barra mesmo com allow, e o permissionDecision "ask" no
// stdout faz o Claude Code perguntar (so o porteiro da bancada pede, pelo estrito). A sonda C1 da 5.28 provou o tool_name real
// (mcp__playwright__browser_navigate) e que o ask pergunta no interativo nos quatro modos e vira negado
// no -p, sem nunca executar calado (por isso MODOS_ASK_CALADO nasce vazio).
// A lista do navegador vem da sonda C1 da 5.28 (pacote do Playwright MCP na versao 0.0.83, e o Claude in
// Chrome do Claude Code 2.1.308); o arquivo da sonda fica na bancada e um teste de la confere esta copia.
// Ferramenta do Playwright MCP com filename grava relativo a raiz do projeto (README do pacote, 0.0.83),
// mesmo com --output-dir, que so vale pro nome automatico: por isso o filename se julga contra a raiz.
import { realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// sonda C1d da 5.28: nenhum modo deixou o ask passar calado; modo que entrar aqui troca o pede por barra
export const MODOS_ASK_CALADO = []

// 5.52 (decisao 20 da carta de delegacao, 2026-11-05): a barra de antes (run_code, evaluate,
// javascript e o grupo de sessao numa regex so) se separou em dois. Ler a sessao da pagina (cookie,
// armazenamento, rede, webmcp) segue barrando no estrito; rodar codigo passa, logado ou nao,
// na grafia que cada servidor tem na sonda C1 (classe rce). Nome novo com as mesmas palavras cai no
// navegador-desconhecida, e o filename de quem grava segue julgado como o das outras.
// Furo aceito (decisao confirmada em 2026-11-05): o browser_run_code_unsafe passa junto, e ele roda no
// processo do servidor do Playwright, nao na pagina (a doc dele diz que equivale a rodar codigo na
// maquina): por ali alcanca o cookie HttpOnly, o storageState, o upload e a gravacao em qualquer pasta,
// que esta trava nao ve. O filename dele e de entrada (de onde ler o codigo).
export const SESSAO_NAVEGADOR = /network_request|cookie|localstorage|sessionstorage|storage_state|webmcp/i
export const CODIGO_PLAYWRIGHT = ['browser_evaluate', 'browser_run_code_unsafe']
export const CODIGO_CHROME_IA = ['javascript_tool']

// Playwright MCP: as de capability core da versao fixada (sobe sem --caps, entao o opt-in nem aparece);
// Claude in Chrome: as que a sonda listou. As duas listas sem as de sessao e sem as de codigo, que vem
// das listas acima. Cada servidor so usa a sua (5.35): juntas, o browser_file_upload do Claude in Chrome
// herdava a regra do Playwright MCP.
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
const liberadasDo = servidor => servidor === CHROME_IA ? [...LIBERADAS_CHROME_IA, ...CODIGO_CHROME_IA] : [...LIBERADAS_PLAYWRIGHT, ...CODIGO_PLAYWRIGHT]

// campo com a lista de caminhos de cada ferramenta que sobe arquivo do disco pra pagina. O browser_drop
// tambem le arquivo local ("as if dragged from outside the page", sonda C1a). O campo do Claude in Chrome
// nao foi medido (a sonda C1b ficou pra 5.29): no estrito os dois barram sempre, e fora dele a trava
// olha todo texto da entrada.
const CAMPO_DO_UPLOAD = { browser_file_upload: 'paths', browser_drop: 'paths', file_upload: null, upload_image: null }
const UPLOAD = new Set(Object.keys(CAMPO_DO_UPLOAD))
// onde o navegador grava snapshot e console; as duas listas sao exportadas pro .gitignore da bancada
export const SAIDA_NAVEGADOR = 'dados/navegador-saida'
// onde as skills de app guardam o print (app-construir, app-comparar, app-visual, app-testar)
export const PASTAS_DE_PRINT = ['app/telas-minhas', 'app/prints', 'app/defeitos', 'app/visual']
// sobre o caminho com / e em minusculas: no Windows .ENV abre o mesmo arquivo que .env
const SEGREDO_NO_CAMINHO = /(^|\/)\.env|(^|\/)dados\/(sessao|chrome-perfil)\/|\.har$|storage-state[^/]*\.json$|(^|\/)\.auth\/|(^|\/)\.?secrets\/|(^|\/)[^/]*totp[^/]*\.json$/

// em portugues desde o chat 7 da 5.28: o servidor do Bling do kit (cadastrar-bling/mcp) e so leitura
export const VERBO_LEITURA = /^(get|list|search|read|query|find|describe|view|listar|buscar|consultar|ler|obter|ver|saldo)(_|[A-Z]|$)/

const LEITURA_FALHOU = 'a trava não conseguiu ler esta chamada'
const passa = () => ({ decisao: 'passa', motivo: '', regra: '' })
const pede = (regra, motivo) => ({ decisao: 'pede', motivo, regra })
const barra = (regra, motivo) => ({ decisao: 'barra', motivo, regra })

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

// estrito (a bancada): so arquivo do projeto, fora de segredo, e que ja existe
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

// 5.49 (bloco B, 2026-11-03): fora do estrito, so o arquivo de senha nao sobe, de qualquer pasta.
// Cada texto da entrada vale como caminho: o escrito (barra invertida vira /) e o real, que pega o atalho
// com nome comum apontando pro .env. O campo do Claude in Chrome nao foi medido, entao todo texto conta.
const comBarra = p => p.split(String.fromCharCode(92)).join('/').toLowerCase()
function textosDe(x, acc = []) {
  if (typeof x === 'string') acc.push(x)
  else if (Array.isArray(x)) for (const v of x) textosDe(v, acc)
  else if (x && typeof x === 'object') for (const v of Object.values(x)) textosDe(v, acc)
  return acc
}
// 5.49 (autonomia, 2026-11-04): a lista que a trava nao le sai com regra propria, upload-ilegivel; antes
// saia como upload-de-senha e a IA dizia ao usuario que uma foto comum era arquivo de senha
const ILEGIVEL = barra('upload-ilegivel', 'a lista de arquivos do upload veio num formato que a trava não lê')
function sobeSenha(cwd, sufixo, entrada) {
  const campo = CAMPO_DO_UPLOAD[sufixo]
  const lista = campo && entrada ? entrada[campo] : undefined
  if (lista !== undefined && !Array.isArray(lista)) return ILEGIVEL
  for (const p of textosDe(entrada)) {
    if (!p) continue
    const abs = resolve(cwd, p)
    if (SEGREDO_NO_CAMINHO.test(comBarra(p)) || SEGREDO_NO_CAMINHO.test(comBarra(real(abs))))
      return barra('upload-de-senha', 'upload de arquivo de senha ou de sessão logada')
  }
  // pasta inteira sobe pelo input de pasta da pagina, com o .env que tiver dentro (revisao interna).
  // 5.49 (bloco B, 2026-11-03, revisao do bloco): sem campo medido (Claude in Chrome) todo texto conta
  // aqui tambem, senao a pasta do projeto e a dados/sessao sem a barra no fim subiam caladas
  for (const p of campo ? (Array.isArray(lista) ? lista : []) : textosDe(entrada).filter(Boolean)) {
    if (typeof p !== 'string' || !p) return ILEGIVEL
    try { if (statSync(real(resolve(cwd, p))).isDirectory()) return barra('upload-de-senha', 'upload de pasta inteira, que leva junto o arquivo de senha que tiver dentro') } catch {}
  }
  return null
}

// Lote do Claude in Chrome na forma medida no Claude Code 2.1.312 (recibo das provas C1b, 2026-10-29):
// {"actions":[{"name":"<ferramenta>","input":{...}}]}. Qualquer desvio devolve null e o lote barra; formato
// novo de versao futura barra a mais. Lote dentro de lote barra sem recursao. No estrito so ferramenta
// da lista; fora dele (5.49, bloco B) nome novo passa e e julgado como solto.
const objeto = x => x !== null && typeof x === 'object' && !Array.isArray(x)
const soAsChaves = (x, chaves) => {
  const k = Object.keys(x).sort()
  return k.length === chaves.length && k.every((c, i) => c === chaves[i])
}
function acoesDoBatch(servidor, entrada, estrito) {
  if (servidor !== CHROME_IA || !objeto(entrada) || !soAsChaves(entrada, ['actions'])) return null
  const { actions } = entrada
  if (!Array.isArray(actions) || actions.length === 0) return null
  const acoes = []
  for (const a of actions) {
    if (!objeto(a) || !soAsChaves(a, ['input', 'name'])) return null
    if (typeof a.name !== 'string' || !a.name || a.name === 'browser_batch') return null
    if (estrito && !liberadasDo(CHROME_IA).includes(a.name)) return null
    if (!objeto(a.input)) return null
    acoes.push({ nome: a.name, entrada: a.input })
  }
  return acoes
}

function julgar(tool_name, tool_input, cwd, estrito) {
  if (typeof tool_name !== 'string') return barra('formato', 'chamada sem nome de ferramenta')
  const partes = tool_name.split('__')
  const servidor = partes[1]
  const sufixo = partes.slice(2).join('__')
  // nome de servidor e de ferramenta conhecida nao levam __: partir pelo ultimo deixaria
  // mcp__playwright__webmcp_demo__get_secret virar leitura de outro servidor
  if (partes[0] !== 'mcp' || partes.length < 3 || !servidor || !sufixo || sufixo.includes('__'))
    return barra('formato', 'ferramenta fora do formato mcp__<servidor>__<ferramenta>')
  if (tool_input !== undefined && (tool_input === null || typeof tool_input !== 'object' || Array.isArray(tool_input)))
    return barra('erro-interno', LEITURA_FALHOU)
  const ehNavegador = servidor === CHROME_IA || sufixo.startsWith('browser_') || sufixo.startsWith('webmcp_')
  if (ehNavegador) {
    if (sufixo === 'browser_batch') {
      const acoes = acoesDoBatch(servidor, tool_input, estrito)
      if (!acoes) return barra('lote-ilegivel', 'lote de ações do navegador num formato que a trava não lê')
      for (const acao of acoes) {
        const d = julgar(`mcp__${servidor}__${acao.nome}`, acao.entrada, cwd, estrito)
        if (d.decisao !== 'passa') return d
      }
      return passa()
    }
    if (!estrito) {
      return (UPLOAD.has(sufixo) && sobeSenha(cwd, sufixo, tool_input)) || passa()
    }
    if (SESSAO_NAVEGADOR.test(sufixo)) return barra('navegador-sessao', 'ferramenta do navegador que lê o login ou a sessão da página (cookie, armazenamento, rede)')
    if (!liberadasDo(servidor).includes(sufixo)) return barra('navegador-desconhecida', 'ferramenta do navegador que a trava não conhece')
    if (tool_input && 'filename' in tool_input && !dentroDaSaida(cwd, tool_input.filename))
      return barra('filename-fora-saida', 'arquivo do navegador fora de dados/navegador-saida/ (print de app vai nas pastas de print do app)')
    if (UPLOAD.has(sufixo) && !uploadLimpo(cwd, sufixo, tool_input)) return barra('upload', 'upload de arquivo fora do projeto ou de segredo')
    return passa()
  }
  if (!estrito) return passa()
  // o prefixo <servidor>_ cai so quando e o nome do proprio servidor (mcp__bling__bling_listar);
  // prefixo qualquer cairia e faria mcp__x__delete_list virar leitura
  const verbo = sufixo.startsWith(servidor + '_') ? sufixo.slice(servidor.length + 1) : sufixo
  return VERBO_LEITURA.test(verbo) ? passa() : pede('acao-de-conta', 'ação de conta fora do navegador: confirme antes')
}

// Contrato da 5.28: o porteiro MCP da bancada importa esta funcao e repassa o permission_mode dele.
// 5.49 (bloco B): e passa { estrito: true }; sem ele valem as regras soltas do aluno.
export function avaliarMcp({ tool_name, tool_input, cwd, permission_mode } = {}, { estrito = false } = {}) {
  let d
  try {
    d = julgar(tool_name, tool_input, typeof cwd === 'string' && cwd ? cwd : process.cwd(), estrito === true)
  } catch {
    return barra('erro-interno', LEITURA_FALHOU)
  }
  if (d.decisao === 'pede' && MODOS_ASK_CALADO.includes(permission_mode))
    return barra('modo-sem-pergunta', 'neste modo a confirmação não aparece: rode fora dele')
  return d
}

// 5.49 (bloco B): mensagem com o nome da trava e da regra, que a IA repete ao usuario
const recadoDeBarra = r => `Barrada pela trava barrar-mcp, regra ${r.regra}: ${r.motivo}. ` +
  'Diga ao usuário o nome da trava e da regra e decida o próximo passo; não refaça esta ação por outro caminho.\n'

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
  process.stdin.on('end', () => {
    let r
    try {
      const entrada = JSON.parse(bruto)
      // 5.49 (bloco B): o hook so julga PreToolUse. O settings antigo ainda chama no SessionStart ate o
      // passo settings do /atualizar-sabinos tirar o bloco; ali sai 0 calado
      if (entrada.hook_event_name && entrada.hook_event_name !== 'PreToolUse') { process.exitCode = 0; return }
      // o cwd do Bash pode ter andado; o servidor MCP resolve o caminho pela raiz do projeto
      r = avaliarMcp({
        tool_name: entrada.tool_name, tool_input: entrada.tool_input,
        cwd: process.env.CLAUDE_PROJECT_DIR || entrada.cwd, permission_mode: entrada.permission_mode,
      })
    } catch {
      r = barra('erro-interno', LEITURA_FALHOU)
    }
    // 5.49 (bloco B): sem o estrito nada pede, entao o ask saiu do hook; o que nao passa barra
    if (r.decisao === 'passa') { process.exitCode = 0; return }
    process.stderr.write(recadoDeBarra(r))
    process.exitCode = 2
  })
}
