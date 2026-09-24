#!/usr/bin/env node
// A ata de decisoes (dados/decisoes.jsonl, contrato 9 de referencias/contratos.md).
//
// Por que existe: robo que diagnostica todo dia sem memoria recomenda amanha o que a pessoa
// acabou de decidir hoje, e a decisao de NAO mexer nao fica em lugar nenhum. A ata guarda cada
// decisao, e a cada rodada diz se ela ainda vale (silencia), se venceu o prazo (cobra) ou se a
// realidade piorou o bastante pra furar o silencio antes da hora.
//
// A ata so cresce: pra reabrir uma decisao, grava-se outra pro mesmo alvo, e a mais recente vale.
// Uso direto, da raiz do projeto:
//   node .claude/skills/mercado-livre/scripts/lib/decisoes.mjs --gravar <arquivo.json>   grava a decisao do arquivo
//   node .claude/skills/mercado-livre/scripts/lib/decisoes.mjs --listar [ads|conta]       mostra a que vale por alvo
import { appendFileSync, readFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RAIZ } from './raiz.mjs'

export const ARQUIVO_ATA = join(RAIZ, 'dados', 'decisoes.jsonl')
// Decisao sem prazo vale esta janela. Silencio infinito so com permanente: true, pedido de proposito.
export const PRAZO_PADRAO_DIAS = 7
export const CAMPOS_OBRIGATORIOS = ['ts', 'escopo', 'alvo', 'decisao', 'resumo', 'motivo', 'baseline']

const DIA_MS = 86400000
const soData = v => String(v).slice(0, 10)
const podeLer = v => typeof v === 'string' && !Number.isNaN(new Date(v).getTime())
const dataValida = v => podeLer(v) && /^\d{4}-\d{2}-\d{2}$/.test(v)
const horaValida = v => podeLer(v) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)

export function validarDecisao(d) {
  if (!d || typeof d !== 'object') return ['a decisao precisa ser um objeto']
  const erros = []
  for (const c of CAMPOS_OBRIGATORIOS) if (d[c] === undefined || d[c] === null) erros.push(`falta o campo ${c}`)
  // ts que nao se le faz o prazo sumir, e prazo sumido cala pra sempre sem ninguem ter pedido
  if (d.ts != null && !horaValida(d.ts)) erros.push(`ts invalido: ${d.ts} (use data e hora ISO, como 2026-09-23T14:00:00.000Z)`)
  if (d.alvo && d.alvo.id == null) erros.push('falta o campo alvo.id')
  if (d.permanente === true && d.reavaliar_em) erros.push('decisao permanente nao leva reavaliar_em')
  // o freio compara em fracao; 18 no lugar de 0.18 fura toda decisao na primeira leitura.
  // Campanha sangrando passa de 100% (1.5 e 150%), por isso o corte fica em 5. Um valor digitado
  // entre 1 e 5 e lido como 100% a 500% (nao acusa aqui, porque tecnicamente fica dentro do corte),
  // por isso a mensagem lembra de conferir antes de gravar.
  if (d.baseline?.acos_7d != null && d.baseline.acos_7d > 5) erros.push('baseline.acos_7d vai em fracao: 18% e 0.18, 150% e 1.5; um valor entre 1 e 5 e lido como 100% a 500%, confira antes de gravar')
  return erros
}

// Data de reavaliar em AAAA-MM-DD; null quando permanente.
export function prazoDe(d, prazoPadraoDias = PRAZO_PADRAO_DIAS) {
  if (d.permanente === true) return null
  if (dataValida(d.reavaliar_em)) return d.reavaliar_em
  const base = new Date(d.ts).getTime()
  if (Number.isNaN(base)) return null
  return new Date(base + prazoPadraoDias * DIA_MS).toISOString().slice(0, 10)
}

export function diasDesde(ts, hoje) {
  const ms = new Date(soData(hoje)).getTime() - new Date(soData(ts)).getTime()
  return Number.isNaN(ms) ? 0 : Math.max(0, Math.floor(ms / DIA_MS))
}

// A decisao que vale pra cada alvo do escopo: a mais recente. Chave: String(alvo.id).
export function decisoesVigentes(decisoes, { escopo } = {}) {
  const m = new Map()
  for (const d of decisoes) {
    if (escopo && d.escopo !== escopo) continue
    if (!d.alvo || d.alvo.id == null) continue
    const k = String(d.alvo.id)
    const atual = m.get(k)
    if (!atual || String(d.ts) > String(atual.ts)) m.set(k, d)
  }
  return m
}

// Estado frente as metricas de hoje (atual = { acos_7d, cost_7d, total_amount_7d }).
// Precedencia: permanente, furou, vencida, em vigor. Sem metricas (atual = {}), so o prazo decide.
export function estadoDaDecisao(d, atual = {}, guard = {}, hoje = new Date().toISOString().slice(0, 10)) {
  if (d.permanente === true) return { estado: 'em_vigor', motivo: `decisao permanente de ${soData(d.ts)}: ${d.resumo}` }
  const pp = guard.furar_acos_pp ?? 0.03
  const limiteGasto = guard.furar_gasto_sem_venda ?? 30
  const baseAcos = d.baseline?.acos_7d
  // Gatilho 1, a eficiencia piorou. Infinity (gastou sem vender) fica pro gatilho 2, que tem limiar.
  if (baseAcos != null && Number.isFinite(atual.acos_7d) && atual.acos_7d >= baseAcos + pp) {
    return { estado: 'furou', motivo: `furou o combinado: o ACOS de 7 dias foi de ${(baseAcos * 100).toFixed(1)}% pra ${(atual.acos_7d * 100).toFixed(1)}% desde a decisao de ${soData(d.ts)}` }
  }
  // Gatilho 2, sangria: parou de vender e segue gastando. O gasto desde a decisao sai do ritmo
  // diario recente, porque a janela de 30 dias desliza e a subtracao de acumulados da negativo.
  if (atual.total_amount_7d === 0 && atual.cost_7d != null) {
    const acumulado = (atual.cost_7d / 7) * diasDesde(d.ts, hoje)
    if (acumulado >= limiteGasto) {
      return { estado: 'furou', motivo: `furou o combinado: sem venda ha 7 dias e ja foram uns R$ ${acumulado.toFixed(2)} desde a decisao de ${soData(d.ts)}` }
    }
  }
  const prazo = prazoDe(d)
  if (prazo && soData(hoje) >= prazo) {
    const esperado = d.esperado ? ` Esperavamos: ${d.esperado}.` : ''
    return { estado: 'vencida', motivo: `combinamos reavaliar hoje. Em ${soData(d.ts)}: ${d.resumo}.${esperado}` }
  }
  return { estado: 'em_vigor', motivo: `${d.resumo} (decidido em ${soData(d.ts)}, reavaliar em ${prazo})` }
}

// Leitura que nunca derruba o diagnostico: ata ausente ou linha quebrada vira aviso, e o resto segue.
export function lerDecisoes(arquivo = ARQUIVO_ATA, { log = () => {} } = {}) {
  let bruto
  try {
    bruto = readFileSync(arquivo, 'utf8')
  } catch (e) {
    if (e.code !== 'ENOENT') log(`ata: erro lendo ${arquivo}: ${e.message}`)
    return []
  }
  const saida = []
  bruto.split('\n').forEach((linha, i) => {
    const t = linha.trim()
    if (!t) return
    let d
    try { d = JSON.parse(t) } catch { log(`ata: linha ${i + 1} ignorada, JSON invalido`); return }
    const erros = validarDecisao(d)
    if (erros.length) { log(`ata: linha ${i + 1} ignorada: ${erros.join(', ')}`); return }
    saida.push(d)
  })
  return saida
}

// Gravacao barulhenta: acontece no chat, com gente presente pra corrigir.
export function gravarDecisao(d, arquivo = ARQUIVO_ATA) {
  const erros = validarDecisao(d)
  if (erros.length) throw new Error(`decisao invalida: ${erros.join(', ')}`)
  mkdirSync(dirname(arquivo), { recursive: true })
  appendFileSync(arquivo, JSON.stringify(d) + '\n', 'utf8')
  return d
}

const ehCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (ehCli) {
  try {
    const [acao, valor] = process.argv.slice(2)
    if (acao === '--gravar') {
      if (!valor) throw new Error('faltou o arquivo: --gravar <arquivo.json>')
      const d = JSON.parse(readFileSync(valor, 'utf8'))
      if (!d.ts) d.ts = new Date().toISOString()
      gravarDecisao(d)
      console.log(`decisao gravada na ata: ${d.escopo} ${d.alvo?.id}, ${d.decisao}, reavaliar em ${prazoDe(d) ?? 'nunca (permanente)'}`)
    } else if (acao === '--listar') {
      const vigentes = decisoesVigentes(lerDecisoes(undefined, { log: m => console.error(m) }), { escopo: valor })
      if (!vigentes.size) console.log('a ata esta vazia pra esse escopo')
      for (const d of vigentes.values()) console.log(`${d.escopo} ${d.alvo.id} (${d.alvo.nome ?? ''}): ${d.decisao}, ${estadoDaDecisao(d).motivo}`)
    } else {
      throw new Error('uso: decisoes.mjs --gravar <arquivo.json> | --listar [ads|conta]')
    }
  } catch (e) { console.error(e.message); process.exitCode = 1 }
}
