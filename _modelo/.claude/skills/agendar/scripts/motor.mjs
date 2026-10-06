// Motor dos robos: roda UMA rodada de uma receita, com todas as protecoes.
//
// Ordem: espera o boot (so quando disparado pelo agendador) -> chave do dia ja fechada? sai
// -> espera a rede (so agendado) -> trava contra rodada dupla -> cao de guarda
// -> confere o acesso (caiu: pula e avisa)
// -> roda -> grava relatorio -> avisa SO se houver aviso -> registra.
// Silencio quer dizer que deu tudo certo (regra do Padrao 2 do roadmap).
//
// Uso: node motor.mjs <robos/nome.mjs> [--teste] [--agendado]
//   --teste     avisa mesmo sem problema e nao conta como a rodada do dia
//   --agendado  so o agendador passa; liga a espera de boot e a espera de rede
import { basename, join, resolve } from 'node:path'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { promises as dnsPromises } from 'node:dns'
import { fileURLToPath } from 'node:url'
import { RAIZ } from './lib/raiz.mjs'
import { lerEnv } from './lib/env.mjs'
import { esperarSeBootRecente } from './lib/boot-guard.mjs'
import { armarCaoDeGuarda } from './lib/watchdog.mjs'
import { fetchComTimeout } from './lib/fetch-timeout.mjs'
import { avisar as avisarTelegram } from './avisar.mjs'
import { dataLocal, chaveDa, jaRodou, registrar, caminhoTrava, travar } from './registro.mjs'
import { validarReceita, carregarReceita } from './receita.mjs'
import { vigiarPai } from './vigia.mjs'

export const MINUTOS_BOOT = 10
// Mais longo que o timeout do fetch em avisar.mjs (PRAZO_MS = 15s): um envio que falha
// ainda tem tempo de cair no arquivo de pendentes antes de o cao de guarda matar o processo.
export const PRAZO_AVISO_MS = 20_000

// Notebook que acorda pra rodada perdida pode levar um tempo pra pegar o Wi-Fi. Sem esperar,
// o conferirAcesso da receita veria "sem rede" e o dia fecharia como acesso caido, errado.
// Devolve true quando a rede respondeu, false quando desistiu; nunca lanca.
export async function esperarRedePadrao({
  lookup = (host) => dnsPromises.lookup(host),
  intervaloMs = 15_000,
  limiteMs = 3 * 60_000,
} = {}) {
  const fim = Date.now() + limiteMs
  for (;;) {
    try { await lookup('api.telegram.org'); return true } catch {}
    if (Date.now() + intervaloMs > fim) return false
    await new Promise((res) => setTimeout(res, intervaloMs))
  }
}

// Erro antes de a rodada comecar (receita quebrada, pasta renomeada). No Windows o agendador
// nao guarda a saida do terminal: sem isto, a falha sumiria sem rastro. O aviso no Telegram
// vai so na rodada do agendador: na manual, quem rodou ja ve o erro na tela. Nunca lanca.
export async function falhaAntesDeRodar({ alvo, erro, raiz = RAIZ, env = {}, avisar = avisarTelegram, agora = () => new Date(), argv = process.argv }) {
  const nome = basename(String(alvo), '.mjs')
  const mensagem = String(erro?.message || erro)
  try {
    mkdirSync(join(raiz, 'robos'), { recursive: true })
    appendFileSync(join(raiz, 'robos', `${nome}.log`), `${agora().toISOString()} ${mensagem.replace(/\r?\n/g, ' / ')}\n`)
  } catch {}
  if (!argv.includes('--agendado')) return
  const curta = mensagem.split(/\r?\n/)[0].slice(0, 200)
  try {
    await avisar(`O robô ${nome} não conseguiu nem começar: ${curta}. Abra o projeto e peça pra olhar o robô.`, { env, raiz, robo: nome })
  } catch {}
}

// No Windows o agendador dispara o node por baixo do conhost (sem janela) e, no limite de
// execucao, mata so o conhost: o node ficava orfao. Por isso a rodada agendada vigia o pai
// e sai quando ele some. Rodada manual e teste nao passam por aqui.
export function vigiarSeAgendado({ plataforma = process.platform, argv = process.argv, vigiar = vigiarPai } = {}) {
  if (plataforma !== 'win32' || !argv.includes('--agendado')) return false
  vigiar()
  return true
}

export async function rodarRobo({
  receita,
  raiz = RAIZ,
  argv = process.argv,
  env = lerEnv(),
  agora = () => new Date(),
  avisar = avisarTelegram,
  esperarBoot = esperarSeBootRecente,
  esperarRede = esperarRedePadrao,
  armar = armarCaoDeGuarda,
  pastaTrava,
  naTela = (texto) => console.log(texto),
}) {
  validarReceita(receita)
  const nome = receita.nome
  const teste = argv.includes('--teste')
  // Teste sem Telegram ligado: o aviso sai na tela de quem esta testando e nunca vira
  // recado (recado de teste com "precisa de acao" confundia o /iniciar do dia seguinte)
  const semTelegram = !(env.TELEGRAM_TOKEN && env.TELEGRAM_CHAT_ID)
  const falar = (texto) => (teste && semTelegram
    ? (naTela(texto), Promise.resolve({ entregue: false, naTela: true }))
    : avisar(texto, { env, raiz, robo: nome }))

  await esperarBoot(MINUTOS_BOOT, nome, { argv, soAgendado: true })

  const inicio = agora()
  const data = dataLocal(inicio)
  const chave = chaveDa(nome, data)
  const livro = join(raiz, 'robos', 'execucoes.jsonl')
  const anotar = (resultado, motivo) => {
    if (teste) return
    const linha = { chave, robo: nome, resultado, inicio: inicio.toISOString(), fim: agora().toISOString() }
    if (motivo) linha.motivo = motivo
    registrar(livro, linha)
  }
  // O proprio livro pode ser o que falhou (disco, permissao): o aviso de erro nao pode
  // cair por causa disso.
  const anotarSeguro = (resultado, motivo) => {
    try { anotar(resultado, motivo) } catch {}
  }

  const prazoMs = receita.prazoMinutos * 60_000
  let trava
  try {
    if (!teste && jaRodou(livro, chave)) return { resultado: 'ja-rodou', codigo: 0 }
    // Aqui, antes da trava e do cao de guarda: a espera nao come o prazo da receita. Se a
    // rede nao voltar, segue mesmo assim e a receita decide.
    if (argv.includes('--agendado')) await esperarRede()

    trava = travar(caminhoTrava(raiz, nome, pastaTrava), prazoMs)
    if (!trava.ok) return { resultado: 'ocupado', codigo: 0 }
    if (trava.removeuVelha) anotar('trava-velha-removida', 'a rodada anterior morreu sem soltar a trava')
  } catch (e) {
    anotarSeguro('falhou', String(e?.message || e))
    await falar(`O robô ${nome} deu erro e parou. Abra o projeto e peça pra olhar o robos/execucoes.jsonl.`).catch(() => {})
    return { resultado: 'falhou', codigo: 1 }
  }

  // Uma vez que o cao de guarda estourou, o caminho principal (que pode continuar rodando
  // ate perceber) nao pode mais escrever no livro nem mandar aviso: o encerramento ja
  // registrou e avisou por conta propria. Toda escrita e todo aviso do caminho principal
  // passam por aqui, em vez de um "if (encerrado) return" espalhado depois de cada await.
  let encerrado = false
  const anotarPrincipal = (resultado, motivo) => { if (!encerrado) anotar(resultado, motivo) }
  const anotarPrincipalSeguro = (resultado, motivo) => { if (!encerrado) anotarSeguro(resultado, motivo) }
  const falarPrincipal = (texto) => (encerrado ? Promise.resolve({ entregue: true }) : falar(texto))

  const cao = armar({
    ms: prazoMs,
    nome,
    prazoAvisoMs: PRAZO_AVISO_MS,
    aoEstourar: async () => {
      encerrado = true
      anotarSeguro('falhou', `passou de ${receita.prazoMinutos} min`)
      trava.soltar()
      await falar(`O robô ${nome} passou de ${receita.prazoMinutos} minutos e foi parado. Na próxima disparada ele tenta de novo; se repetir, peça pra olhar o robô.`)
    },
  })

  try {
    const ctx = { raiz, data, env, teste, fetch: fetchComTimeout }
    const acesso = await receita.conferirAcesso(ctx)
    // O cao pode ter estourado enquanto isso esperava: a trava ja foi solta la, entao daqui
    // pra frente nao da mais pra confiar nela, e rodar() nao pode comecar (uma disparada
    // nova podia ja ter pego a trava livre e estar rodando ao mesmo tempo).
    if (encerrado) return { resultado: 'falhou', codigo: 1 }
    if (!acesso || acesso.ok !== true) {
      const motivo = acesso?.motivo || 'o acesso não confirmou'
      anotarPrincipal('pulou:acesso', motivo)
      await falarPrincipal(`O robô ${nome} não rodou hoje: ${motivo}. Resolva quando puder; na próxima rodada ele tenta de novo.`)
      return { resultado: 'pulou:acesso', codigo: 0 }
    }

    const saida = (await receita.rodar(ctx)) || {}
    const avisos = Array.isArray(saida.avisos) ? saida.avisos.filter((a) => typeof a === 'string' && a.trim()) : []
    if (!encerrado && typeof saida.relatorio === 'string' && saida.relatorio.trim()) {
      mkdirSync(join(raiz, 'relatorios'), { recursive: true })
      // o relatorio do teste vai num arquivo proprio pra nao apagar o da rodada de verdade
      writeFileSync(join(raiz, 'relatorios', `${nome}-${data}${teste ? '-teste' : ''}.md`), saida.relatorio)
    }
    if (avisos.length) await falarPrincipal(`${teste ? '[teste] ' : ''}${nome}:\n${avisos.join('\n')}`)
    else if (teste) await falarPrincipal(`[teste] ${nome}: rodou e não achou nada pra avisar.`)

    anotarPrincipal('feito')
    return { resultado: 'feito', codigo: 0 }
  } catch (e) {
    anotarPrincipalSeguro('falhou', String(e?.message || e))
    await falarPrincipal(`O robô ${nome} deu erro e parou. Abra o projeto e peça pra olhar o robos/execucoes.jsonl.`).catch(() => {})
    return { resultado: 'falhou', codigo: 1 }
  } finally {
    cao.desarmar()
    trava.soltar()
  }
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  const alvo = process.argv[2]
  if (!alvo || alvo.startsWith('--')) {
    console.error('uso: node motor.mjs <robos/nome.mjs> [--teste] [--agendado]')
    process.exitCode = 2
  } else {
    vigiarSeAgendado()
    try {
      const receita = await carregarReceita(resolve(RAIZ, alvo))
      const r = await rodarRobo({ receita })
      console.log(`${receita.nome}: ${r.resultado}`)
      process.exitCode = r.codigo
    } catch (e) {
      console.error(`motor: ${e.message}`)
      process.exitCode = 1
      let env = {}
      try { env = lerEnv() } catch {}
      await falhaAntesDeRodar({ alvo, erro: e, env })
    }
  }
}
