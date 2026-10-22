// Qual motor gera o cenario das fotos, do melhor pro mais simples:
//   codex    Codex logado pela conta ChatGPT (Plus ou Pro): sem cobranca por imagem dentro da
//            cota do plano; quem comprou creditos avulsos do Codex gasta esses creditos ao passar dela
//   gemini   chave do Gemini no .env: pago por imagem, com estimativa e "pode ir" antes
//   zero-ia  nenhum dos dois: fundo liso da paleta, foto real e texto em HTML
// Codex logado por chave de API fica de fora: ali cada imagem e cobrada.
// Uso: node .claude/skills/gerar-imagens/scripts/motor.mjs
import { spawnSync, spawn, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { lerEnv } from '../../mercado-livre/scripts/lib/env.mjs'
import { realpathSync } from 'node:fs'

export function escolherDegrau({ codex, env }) {
  if (codex.logado) return { degrau: 'codex', motivo: 'Codex logado com a conta do ChatGPT: gera o cenario sem cobranca por imagem dentro da cota do plano; se voce comprou creditos avulsos do Codex, passar do limite do plano gasta esses creditos' }
  if (env.GEMINI_API_KEY) return { degrau: 'gemini', motivo: 'chave do Gemini no .env: gera o cenario pago por imagem, com estimativa antes' }
  return { degrau: 'zero-ia', motivo: 'sem Codex e sem Gemini: fundo liso da paleta, foto real e texto em HTML, custo zero' }
}

export function lerStatusCodex(r) {
  const saida = `${r.stdout || ''}\n${r.stderr || ''}`
  if (r.error || /not recognized|command not found|reconhecido como/i.test(saida)) return { instalado: false, logado: false }
  return { instalado: true, logado: r.status === 0 && /logged in using chatgpt/i.test(saida) }
}

// Derruba o processo e tudo que ele abriu (Windows).
export function derrubarArvore(pid) {
  execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', timeout: 10000 })
}

// Roda um programa com prazo e devolve { status, stdout, stderr, error } como o spawnSync. No
// Windows o codex do npm e um .cmd e so sobe com shell; o prazo do spawnSync mataria so o cmd.exe
// e o codex seguiria rodando sozinho, gastando a cota (sonda da 5.25). Por isso ali ele sobe pelo
// spawn, com cronometro proprio que derruba a arvore inteira enquanto o cmd.exe ainda vive. Fora
// do Windows, o spawnSync de sempre, sem shell.
export function rodarComPrazo(cmd, args, op = {}, { plataforma = process.platform, executarSync = spawnSync, subir = spawn, encerrar = derrubarArvore } = {}) {
  const { input, cwd, timeout, maxBuffer = 64 * 1024 * 1024 } = op
  if (plataforma !== 'win32') return executarSync(cmd, args, { input, cwd, encoding: 'utf8', maxBuffer, timeout })
  return new Promise(resolve => {
    let stdout = ''
    let stderr = ''
    let estourou = false
    let encheu = false
    let saiu = false
    let saida = null
    const filho = subir(cmd, args, { cwd, shell: true })
    // o cano que um neto segura nao deixa o close chegar nem o node sair: solta os dois
    const soltar = () => { filho.stdout?.destroy?.(); filho.stderr?.destroy?.() }
    const erro = () => estourou
      ? Object.assign(new Error(`o ${cmd} passou de ${timeout >= 60000 ? `${Math.round(timeout / 60000)} min` : `${Math.round(timeout / 1000)} s`} sem terminar e foi encerrado, junto com tudo que ele tinha aberto`), { code: 'ETIMEDOUT' })
      : encheu ? Object.assign(new Error(`o ${cmd} escreveu mais que ${maxBuffer} bytes e foi encerrado`), { code: 'ENOBUFS' }) : undefined
    const derrubar = () => { try { encerrar(filho.pid) } catch {} filho.kill() }
    // Ja saiu e so o cano segue aberto (um neto segurando): o pid pode ter ido pra outro processo,
    // entao nada de taskkill; volta a saida dele. Saiu depois de derrubado (o taskkill pode ter
    // falhado): volta com o recado sem esperar o close
    filho.on('exit', status => {
      saiu = true; saida = status
      if (estourou || encheu) { clearTimeout(cronometro); soltar(); resolve({ status: null, stdout, stderr, error: erro() }) }
    })
    filho.stdout?.setEncoding?.('utf8')
    filho.stderr?.setEncoding?.('utf8')
    // o teto do spawnSync (maxBuffer) vale aqui tambem (revisao final do Codex, 5.25)
    // conta em bytes, como o spawnSync; filho que ja saiu nao leva taskkill (pid reaproveitado)
    let bytes = 0
    const juntar = (qual, d) => {
      if (encheu) return
      bytes += Buffer.byteLength(d)
      if (bytes > maxBuffer) {
        encheu = true
        if (!saiu) return derrubar()
        clearTimeout(cronometro); soltar(); return resolve({ status: null, stdout, stderr, error: erro() })
      }
      if (qual === 'out') stdout += d; else stderr += d
    }
    filho.stdout?.on('data', d => juntar('out', d))
    filho.stderr?.on('data', d => juntar('err', d))
    filho.stdin?.on?.('error', () => {})
    const cronometro = timeout ? setTimeout(() => {
      if (saiu) { soltar(); return resolve({ status: saida, stdout, stderr, error: undefined }) }
      estourou = true
      derrubar()
    }, timeout) : null
    filho.on('error', error => { clearTimeout(cronometro); resolve({ status: null, stdout, stderr, error }) })
    filho.on('close', status => {
      clearTimeout(cronometro)
      const e = erro()
      resolve({ status: e ? null : status, stdout, stderr, error: e })
    })
    filho.stdin?.end(input ?? '')
  })
}

export async function detectarCodex(executar = rodarComPrazo) {
  return lerStatusCodex(await executar('codex', ['login', 'status'], { timeout: 20000 }))
}

// Compara os caminhos reais: chamado por junção ou link (a ponte .agents/skills), o argv vem
// com o atalho e o import.meta.url já resolvido, e a comparação crua dava falso calado.
function chamadoDireto() {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}

const ehCli = chamadoDireto()
if (ehCli) {
  const codex = await detectarCodex()
  const env = lerEnv()
  console.log(JSON.stringify({ ...escolherDegrau({ codex, env }), codex, gemini: Boolean(env.GEMINI_API_KEY) }))
}
