// Comando fino da /aplicar-estilo: acha o catalogo de estilos de edicao de video (pasta
// _estilos-video na pasta-mae), filtra o que serve, cria a pasta da edicao fora do projeto e
// roda os scripts do estilo com o ambiente certo (cache do whisper sem espaco e a chave
// opcional do Pexels lida do .env, sem passar pelo chat).
// Uso: node .claude/skills/aplicar-estilo/scripts/estilos.mjs <comando>
//   conferir                                   o que falta pra editar (saida 3 se falta algo)
//   listar [--formato 9:16|16:9] [--busca "palavras"]
//   criar <estilo> <AAAA-MM-DD-assunto>        copia o template pra <_video>/estilos/<pasta>
//   instalar <AAAA-MM-DD-assunto>              npm install dentro da pasta da edicao
//   rodar <AAAA-MM-DD-assunto> <scripts/x.mjs> [argumentos]
//   entregar <AAAA-MM-DD-assunto>              copia o MP4 pronto pra producao/<pasta>/
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, isAbsolute, basename } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { RAIZ } from '../../mercado-livre/scripts/lib/raiz.mjs'
import { lerEnv } from '../../mercado-livre/scripts/lib/env.mjs'
import { pastaVideo } from '../../configurar-video/scripts/lib/pasta-video.mjs'

const envDe = (raiz, env) => env ?? { ...lerEnv(join(raiz, '.env')), ...process.env }

// O catalogo mora na pasta-mae, ao lado dos projetos; SABINOS_ESTILOS no .env troca o lugar.
export function pastaEstilos({ raiz = RAIZ, env } = {}) {
  const v = envDe(raiz, env).SABINOS_ESTILOS
  if (v) return isAbsolute(v) ? v : resolve(raiz, v)
  return resolve(raiz, '..', '_estilos-video')
}

// As edicoes ficam em <_video>/estilos/<pasta>: fora do projeto e do backup, e longe de pasta
// de nuvem (o node trava lendo node_modules em pasta do OneDrive ou do iCloud).
export const pastaEdicoes = ({ raiz = RAIZ, env } = {}) => join(pastaVideo({ raiz, env: envDe(raiz, env) }), 'estilos')

export function lerCatalogo(dir) {
  const arq = join(dir, 'catalogo.md')
  if (!existsSync(arq)) return []
  return readFileSync(arq, 'utf8').split(/\r?\n/)
    .filter((l) => /^\| [a-z0-9]/.test(l) && !l.startsWith('| estilo'))
    .map((l) => {
      const [estilo, formato, sistema, servePra, mandar, comoFica] = l.split('|').slice(1, 7).map((c) => c.trim())
      return { estilo, formato, sistema, servePra, mandar, comoFica }
    })
}

const semAcento = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

// Estilo so de Mac nao aparece fora do Mac; a busca exige todas as palavras.
export function filtrar(linhas, { formato, busca, plat = process.platform } = {}) {
  const palavras = busca ? semAcento(busca).split(/\s+/).filter(Boolean) : []
  return linhas.filter((l) => {
    if (l.sistema === 'mac' && plat !== 'darwin') return false
    if (formato && l.formato !== formato) return false
    const texto = semAcento(`${l.estilo} ${l.servePra} ${l.comoFica}`)
    return palavras.every((p) => texto.includes(p))
  })
}

export function conferir({ raiz = RAIZ, env, home = homedir(), versaoNode = process.versions.node } = {}) {
  const itens = []
  const catalogo = pastaEstilos({ raiz, env })
  const temCatalogo = existsSync(join(catalogo, 'catalogo.md'))
  itens.push({ item: 'catalogo de estilos', ok: temCatalogo, fazer: `a pasta ${catalogo} nao tem os estilos: rode a /atualizar-kit na pasta-mae` })
  const maior = Number(versaoNode.split('.')[0])
  itens.push({ item: `Node ${versaoNode}`, ok: maior >= 22, fazer: 'os estilos pedem Node 22 ou mais novo: rode a /configurar-video' })
  const remotion = ['.claude/skills/remotion-best-practices/SKILL.md'].flatMap((p) => [join(raiz, p), join(home, p)]).some(existsSync)
  itens.push({ item: 'skill do Remotion (remotion-best-practices)', ok: remotion, fazer: 'faca o passo 5 da /configurar-video (Skills do Remotion)' })
  const edicoes = pastaEdicoes({ raiz, env })
  itens.push({ item: 'pasta das edicoes sem espaco', ok: !/\s/.test(edicoes), fazer: `${edicoes} tem espaco no caminho, e o instalador do Whisper nao aceita: rode a /configurar-video, que grava SABINOS_VIDEO numa pasta sem espaco` })
  return { ok: itens.every((i) => i.ok), itens, catalogo, edicoes, versao: temCatalogo && existsSync(join(catalogo, 'VERSAO')) ? readFileSync(join(catalogo, 'VERSAO'), 'utf8').trim() : null }
}

const RE_PASTA = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/

export function pastaDaEdicao({ raiz = RAIZ, env, pasta }) {
  if (!RE_PASTA.test(pasta || '')) throw new Error(`nome da pasta invalido: "${pasta}"; use AAAA-MM-DD-assunto-curto, minusculo e sem acento`)
  return join(pastaEdicoes({ raiz, env }), pasta)
}

export function criar({ raiz = RAIZ, env, estilo, pasta, plat = process.platform }) {
  const catalogo = pastaEstilos({ raiz, env })
  const linha = lerCatalogo(catalogo).find((l) => l.estilo === estilo)
  if (!linha) throw new Error(`estilo "${estilo}" nao esta no catalogo (${catalogo})`)
  if (linha.sistema === 'mac' && plat !== 'darwin') throw new Error(`o estilo ${estilo} so roda no Mac`)
  const destino = pastaDaEdicao({ raiz, env, pasta })
  if (/\s/.test(destino)) throw new Error(`${destino} tem espaco no caminho; rode a /configurar-video, que grava SABINOS_VIDEO numa pasta sem espaco`)
  if (existsSync(destino)) throw new Error(`a pasta ${destino} ja existe; use outro nome ou continue a edicao dela`)
  mkdirSync(join(destino, '..'), { recursive: true })
  cpSync(join(catalogo, `modelo-${estilo}`, 'assets', 'template'), destino, { recursive: true })
  return { destino, skill: join(catalogo, `modelo-${estilo}`, 'SKILL.md'), pastaDoEstilo: join(catalogo, `modelo-${estilo}`) }
}

// No Windows o npm e um .cmd, que o Node so chama por shell (igual a instalar-motor.mjs).
export function instalar({ raiz = RAIZ, env, pasta, plat = process.platform, executar = spawnSync }) {
  const destino = pastaDaEdicao({ raiz, env, pasta })
  if (!existsSync(join(destino, 'package.json'))) throw new Error(`${destino} nao e uma pasta de edicao: rode o criar antes`)
  const r = executar('npm', ['install', '--no-audit', '--no-fund'], { cwd: destino, stdio: 'inherit', shell: plat === 'win32' })
  return r.status ?? 1
}

// So script do proprio estilo, dentro da pasta da edicao: nada de caminho solto.
const RE_SCRIPT = /^(?:scripts|ferramentas)\/[a-z0-9-]+\.mjs$/

// a unica chave que os estilos leem: busca de fotos gratis, opcional
const CHAVE_PEXELS = 'PEXELS_API_KEY'

export function ambienteDaEdicao({ raiz = RAIZ, env } = {}) {
  const e = envDe(raiz, env)
  const extra = { SABINOS_ESTILOS_CACHE: join(pastaEdicoes({ raiz, env }), '_cache') }
  if (e[CHAVE_PEXELS]) extra[CHAVE_PEXELS] = e[CHAVE_PEXELS]
  return extra
}

export function rodar({ raiz = RAIZ, env, pasta, script, args = [], executar = spawnSync }) {
  if (!RE_SCRIPT.test(script || '')) throw new Error(`script invalido: "${script}"; use scripts/<nome>.mjs ou ferramentas/<nome>.mjs da pasta da edicao`)
  const destino = pastaDaEdicao({ raiz, env, pasta })
  if (!existsSync(join(destino, script))) throw new Error(`${script} nao existe em ${destino}`)
  const r = executar(process.execPath, [script, ...args], { cwd: destino, stdio: 'inherit', env: { ...process.env, ...ambienteDaEdicao({ raiz, env }) } })
  return r.status ?? 1
}

export const ordenarMp4 = (itens) => [...itens].sort((a, b) => b.t - a.t || a.n.localeCompare(b.n))

// O MP4 mais novo de out/ vai pra producao/<pasta>/ do projeto. Mais de um MP4: o mais novo
// ganha (empate de hora, o nome em ordem) e os outros voltam em "sobra", pra avisar o aluno.
export function entregar({ raiz = RAIZ, env, pasta }) {
  const out = join(pastaDaEdicao({ raiz, env, pasta }), 'out')
  const mp4 = existsSync(out) ? readdirSync(out).filter((n) => n.toLowerCase().endsWith('.mp4')) : []
  if (!mp4.length) throw new Error(`nenhum MP4 em ${out}: o render ainda nao rodou`)
  const ordem = ordenarMp4(mp4.map((n) => ({ n, t: statSync(join(out, n)).mtimeMs })))
  const novo = ordem[0].n
  const destino = join(raiz, 'producao', pasta)
  mkdirSync(destino, { recursive: true })
  cpSync(join(out, novo), join(destino, basename(novo)))
  return { final: join(destino, basename(novo)), sobra: ordem.slice(1).map((x) => x.n) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, ...resto] = process.argv.slice(2)
  const opcao = (nome) => { const i = resto.indexOf(nome); return i >= 0 ? resto[i + 1] : undefined }
  try {
    if (cmd === 'conferir') {
      const r = conferir()
      console.log(`Catalogo: ${r.catalogo}${r.versao ? ` (versao ${r.versao})` : ''}`)
      console.log(`Edicoes: ${r.edicoes}`)
      for (const i of r.itens) console.log(`${i.ok ? 'ok   ' : 'FALTA'} ${i.item}${i.ok ? '' : `: ${i.fazer}`}`)
      process.exit(r.ok ? 0 : 3)
    } else if (cmd === 'listar') {
      const linhas = filtrar(lerCatalogo(pastaEstilos()), { formato: opcao('--formato'), busca: opcao('--busca') })
      for (const l of linhas) console.log(`${l.estilo} (${l.formato}): ${l.comoFica}. Serve pra: ${l.servePra}. Mandar: ${l.mandar}`)
      console.log(`${linhas.length} estilo(s)`)
    } else if (cmd === 'criar') {
      const r = criar({ estilo: resto[0], pasta: resto[1] })
      console.log(`Pasta da edicao: ${r.destino}`)
      console.log(`Pasta do estilo (o SKILL.md e as references): ${r.pastaDoEstilo}`)
    } else if (cmd === 'instalar') {
      process.exit(instalar({ pasta: resto[0] }))
    } else if (cmd === 'rodar') {
      process.exit(rodar({ pasta: resto[0], script: resto[1], args: resto.slice(2) }))
    } else if (cmd === 'entregar') {
      const r = entregar({ pasta: resto[0] })
      console.log(`Video pronto: ${r.final}`)
      if (r.sobra.length) console.log(`Havia mais MP4 em out/ (${r.sobra.join(', ')}); entreguei o mais novo. Confira com o aluno se era esse.`)
    } else {
      console.error('uso: estilos.mjs conferir | listar [--formato 9:16|16:9] [--busca "..."] | criar <estilo> <pasta> | instalar <pasta> | rodar <pasta> <scripts/x.mjs> [args] | entregar <pasta>')
      process.exit(2)
    }
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }
}
