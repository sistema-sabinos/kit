// Aviso dos robos no Telegram, pelo bot do proprio aluno.
//
// Aviso que nao sai (sem token, token recusado, rede fora) nunca se perde: vira um recado
// em _memoria/recados/, um arquivo por aviso, e o /iniciar mostra na proxima sessao.
// O robo assina como robo-<nome>, a mesma origem da linha dele no _contexto/automacoes.md.
//
// Uso na mao (o /agendar chama na primeira vez):
//   node avisar.mjs --descobrir-chat     lista as conversas que mandaram mensagem pro bot
//   node avisar.mjs --gravar-chat <id>   grava TELEGRAM_CHAT_ID no .env
//   node avisar.mjs --teste              manda uma mensagem de teste
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchComTimeout } from './lib/fetch-timeout.mjs'
import { RAIZ } from './lib/raiz.mjs'
import { lerEnv, gravarEnv } from './lib/env.mjs'

// O Telegram aceita ate 4096 caracteres por mensagem (conferido em 2026-09-24, Bot API 10.3).
export const LIMITE_TEXTO = 4000
const PRAZO_MS = 15_000
const API = 'https://api.telegram.org/bot'

export function caminhoRecados(raiz) {
  return join(raiz, '_memoria', 'recados')
}

// nome de arquivo seguro no Windows e no Mac: minuscula sem acento, numero e hifen
export function origemDoRobo(robo) {
  const limpo = String(robo).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `robo-${limpo || 'sem-nome'}`
}

const p2 = (n) => String(n).padStart(2, '0')
// data de calendario pelo fuso do aluno, nunca toISOString (UTC vira o dia seguinte de noite)
const dia = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`

function guardarRecado(raiz, robo, texto, agora) {
  const pasta = caminhoRecados(raiz)
  mkdirSync(pasta, { recursive: true })
  const origem = origemDoRobo(robo)
  const hora = `${p2(agora.getHours())}:${p2(agora.getMinutes())}`
  const base = `${dia(agora)}-${origem}-aviso-${hora.replace(':', '')}`
  const corpo = `de: ${origem}\nquando: ${dia(agora)} ${hora}\nprecisa de ação: sim\n\n${texto}\n`
  // wx: dois avisos no mesmo minuto (ou dois robos ao mesmo tempo) nunca se sobrescrevem
  for (let n = 1; ; n++) {
    try {
      writeFileSync(join(pasta, n === 1 ? `${base}.md` : `${base}-${n}.md`), corpo, { flag: 'wx' })
      return
    } catch (e) {
      if (e.code !== 'EEXIST') throw e
    }
  }
}

export async function avisar(texto, { env = {}, raiz, robo, fetch = fetchComTimeout, agora = new Date() }) {
  const corpo = String(texto).slice(0, LIMITE_TEXTO)
  if (env.TELEGRAM_TOKEN && env.TELEGRAM_CHAT_ID) {
    try {
      const resp = await fetch(`${API}${env.TELEGRAM_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: corpo }),
      }, { timeoutMs: PRAZO_MS })
      const json = await resp.json().catch(() => ({}))
      if (resp.ok && json.ok) return { entregue: true }
    } catch {
      // rede fora: cai no arquivo logo abaixo
    }
  }
  guardarRecado(raiz, robo, corpo, agora)
  return { entregue: false }
}

export async function descobrirChats(token, fetch = fetchComTimeout) {
  const resp = await fetch(`${API}${token}/getUpdates`, {}, { timeoutMs: PRAZO_MS })
  const json = await resp.json().catch(() => ({}))
  if (!json.ok) throw new Error('o Telegram recusou o token (confira se copiou inteiro do BotFather)')
  const vistos = new Map()
  for (const u of json.result || []) {
    const chat = u.message?.chat
    if (!chat || vistos.has(chat.id)) continue
    const nome = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.title || chat.username || ''
    vistos.set(chat.id, { id: String(chat.id), nome })
  }
  return [...vistos.values()]
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  const [cmd, arg] = process.argv.slice(2)
  const env = lerEnv()
  try {
    if (cmd === '--descobrir-chat') {
      if (!env.TELEGRAM_TOKEN) throw new Error('falta TELEGRAM_TOKEN no .env')
      const chats = await descobrirChats(env.TELEGRAM_TOKEN)
      if (!chats.length) console.log('nenhuma conversa ainda: mande um "oi" pro bot no Telegram e rode de novo')
      for (const c of chats) console.log(`${c.id}  ${c.nome}`)
    } else if (cmd === '--gravar-chat' && /^-?\d+$/.test(arg || '')) {
      gravarEnv({ TELEGRAM_CHAT_ID: arg })
      console.log('TELEGRAM_CHAT_ID gravado no .env')
    } else if (cmd === '--teste') {
      const r = await avisar('Teste do SabinOS: se esta mensagem chegou, o aviso dos robôs está ligado.', { env, raiz: RAIZ, robo: 'teste' })
      console.log(r.entregue ? 'entregue' : 'nao entregue, virou recado em _memoria/recados/')
      process.exitCode = r.entregue ? 0 : 1
    } else {
      console.error('uso: node avisar.mjs --descobrir-chat | --gravar-chat <id> | --teste')
      process.exitCode = 2
    }
  } catch (e) {
    console.error(`avisar: ${e.message}`)
    process.exitCode = 1
  }
}
