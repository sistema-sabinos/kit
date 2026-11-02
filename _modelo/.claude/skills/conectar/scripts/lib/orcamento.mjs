// Porta unica do gasto avulso (hoje, o Gemini). Dois limites, nunca convertidos um no outro:
// - orcamento do mes: o bloco ```orcamento``` de _contexto/orcamento.md, valendo pro projeto inteiro;
// - teto por lote: o limite_gasto_usd do bloco ```mercado-livre``` do _contexto/mercado-livre.md, so
//   enquanto o orcamento nao foi definido (igual antes da 5.33). Quem nao tem o arquivo do ML (projeto
//   so de video) cai no padrao. Le o bloco cru, sem o carregarConfiguracao do ML, que manda rodar /mercado-livre.
// O "pode ir" de cada gasto continua: o orcamento e limite a mais, nunca autorizacao previa.
import { readFileSync, existsSync, writeFileSync, mkdirSync, appendFileSync, renameSync, rmSync, linkSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { RAIZ } from './raiz.mjs'

export const TETO_PADRAO_USD = 4
export const CAMINHO_TETO = join(RAIZ, '_contexto', 'mercado-livre.md')
// entra na soma do mes linha de servico com um destes prefixos ou com area da lista (o gasto de app feito a
// mao, sem area, fica de fora)
export const SERVICOS_DO_ORCAMENTO = ['gemini']
// os baldes do extrato do --saldo; linha antiga sem area cai no balde pelo servico (areaDaLinha)
export const AREAS = ['video', 'imagem', 'ml', 'outros']
// a media do historico so aparece com este minimo de videos (estimativa da ata, a calibrar com dado de aluno)
export const MINIMO_VIDEOS_HISTORICO = 3
export const SEM_ORCAMENTO = 'orcamento do mes ainda nao definido, rode /configurar-video'
const NUMERICOS = new Set(['orcamento_mes_usd', 'preco_segundo_usd', 'preco_cena_usd', 'segundos_por_video', 'cenas_por_video', 'media_video_usd'])
const PRAZO_TRAVA_MS = 10_000
// 5.44: a reserva do gasto feito a mao (sem pid de quem gasta) fica viva por este prazo desde que abriu
export const PRAZO_RESERVA_MAO_MS = 2 * 60 * 60 * 1000

const caminhos = (raiz) => ({
  orcamento: join(raiz, '_contexto', 'orcamento.md'),
  custos: join(raiz, 'dados', 'custos.jsonl'),
  reservas: join(raiz, 'dados', 'orcamento-reservas.json'),
  trava: join(raiz, 'dados', 'orcamento.trava'),
})

export function lerTeto(caminho = CAMINHO_TETO) {
  if (!existsSync(caminho)) return TETO_PADRAO_USD
  const bloco = readFileSync(caminho, 'utf8').match(/```mercado-livre\s*\n([\s\S]*?)```/)
  // a ultima linha vale, como no lerConfiguracao do ML: os dois leitores nunca dao teto diferente
  const par = bloco && bloco[1].split('\n').map(l => l.match(/^\s*limite_gasto_usd\s*:\s*(.*?)\s*$/i)).filter(Boolean).at(-1)
  if (!par || par[1] === '') return TETO_PADRAO_USD
  const usd = Number(par[1].replace(',', '.'))
  if (!Number.isFinite(usd)) throw new Error(`o campo limite_gasto_usd do _contexto/mercado-livre.md precisa ser numero, e veio "${par[1]}"; o gasto parou antes de comecar`)
  return usd
}

// O bloco ```orcamento``` em pares chave: valor (a ultima linha vale). Bloco que falta ou campo numerico que
// nao e numero lanca: arquivo quebrado para o gasto, nunca libera.
export function lerBlocoOrcamento(texto) {
  const m = String(texto).match(/```orcamento\s*\n([\s\S]*?)```/)
  if (!m) throw new Error('o _contexto/orcamento.md existe mas o bloco `orcamento` sumiu ou nao fecha; o gasto parou antes de comecar. Rode /configurar-video pra montar de novo')
  const c = {}
  for (const linha of m[1].split('\n')) {
    const par = linha.match(/^\s*([a-z_]+)\s*:\s*(.*?)\s*$/i)
    if (!par || par[2] === '') continue
    const chave = par[1].toLowerCase()
    if (!NUMERICOS.has(chave)) { c[chave] = par[2]; continue }
    const n = Number(par[2].replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) throw new Error(`o campo ${chave} do _contexto/orcamento.md precisa ser numero, e veio "${par[2]}"; o gasto parou antes de comecar`)
    c[chave] = n
  }
  return c
}

// { tipo: 'mes', usd, bloco } com orcamento definido; { tipo: 'lote', usd, aviso } sem ele. O aviso so sai
// pra quem tem a /configurar-video, que e quem define o orcamento (o projeto so de ML nao tem).
export function lerOrcamento({ raiz = RAIZ, lerLote = () => lerTeto(join(raiz, '_contexto', 'mercado-livre.md')) } = {}) {
  const { orcamento } = caminhos(raiz)
  if (existsSync(orcamento)) {
    const bloco = lerBlocoOrcamento(readFileSync(orcamento, 'utf8'))
    if (bloco.orcamento_mes_usd !== undefined) return { tipo: 'mes', usd: bloco.orcamento_mes_usd, bloco }
  }
  const lote = { tipo: 'lote', usd: lerLote() }
  if (existsSync(join(raiz, '.claude', 'skills', 'configurar-video'))) lote.aviso = SEM_ORCAMENTO
  return lote
}

// O mes da linha no calendario local: data sem hora se le pela propria string (new Date('2026-11-01') e
// meia-noite UTC, 21h do dia 31 no Brasil); com hora, pelo relogio da maquina.
export function mesDaLinha(em) {
  if (typeof em !== 'string') return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(em)) return em.slice(0, 7)
  const d = new Date(em)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const doOrcamento = (servico) => typeof servico === 'string' && SERVICOS_DO_ORCAMENTO.some(p => servico.startsWith(p))
const arred = (n) => Math.round(n * 1e6) / 1e6

// O balde do extrato: a area gravada vale; sem ela, pelo servico (imagem e a engenharia reversa do ML tem
// servico proprio; o resto do Gemini e video: olho final, clipe, narracao, musica e o Gemini assistindo).
export function areaDaLinha(j) {
  if (AREAS.includes(j?.area)) return j.area
  if (j?.servico === 'gemini-imagem') return 'imagem'
  if (j?.servico === 'gemini-visao') return 'ml'
  return doOrcamento(j?.servico) ? 'video' : 'outros'
}

// Gasto do mes: so linha do mes local corrente e de servico da lista ou com area. Linha quebrada, sem data,
// com usd nulo, so com brl ou fora da lista sai da soma e aparece contada a parte, nunca vira zero calada.
export function gastoDoMes(texto, { agora = new Date() } = {}) {
  const mes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`
  const r = { usd: 0, linhas: [], porReserva: {}, por_area: Object.fromEntries(AREAS.map(a => [a, 0])), a_parte: { quebradas: 0, nulas: 0, so_brl: 0, fora_da_lista: 0 } }
  for (const l of String(texto).split(/\r?\n/)) {
    if (!l.trim()) continue
    let j
    try { j = JSON.parse(l) } catch { r.a_parte.quebradas++; continue }
    const m = mesDaLinha(j?.em)
    if (!m) { r.a_parte.quebradas++; continue }
    if (m !== mes) continue
    if (!doOrcamento(j.servico) && !AREAS.includes(j.area)) { r.a_parte.fora_da_lista++; continue }
    if (typeof j.usd !== 'number' || !Number.isFinite(j.usd)) { r.a_parte[j.brl !== undefined ? 'so_brl' : 'nulas']++; continue }
    r.usd += j.usd
    r.por_area[areaDaLinha(j)] += j.usd
    r.linhas.push(j)
    if (j.reserva) r.porReserva[j.reserva] = (r.porReserva[j.reserva] || 0) + j.usd
  }
  r.usd = arred(r.usd)
  for (const a of AREAS) r.por_area[a] = arred(r.por_area[a])
  return r
}

function lerTexto(p) { try { return readFileSync(p, 'utf8') } catch (e) { if (e.code === 'ENOENT') return ''; throw e } }
function lerReservas(p) {
  const t = lerTexto(p)
  if (!t.trim()) return []
  const j = JSON.parse(t)
  if (!Array.isArray(j)) throw new Error(`${p} nao e uma lista; o gasto parou antes de comecar`)
  return j
}

// Saldo = orcamento - gasto do mes - o que falta gastar das reservas abertas. Reserva de processo que morreu
// conta ate alguem fechar pelo --saldo: a chamada paga pode ter sido cobrada sem a linha. A feita a mao (sem pid,
// com ate) vale pelo relogio; a antiga sem pid e sem ate segue morta.
function reservaViva(x, agora, vivo) {
  if (Number.isInteger(x.pid)) return vivo(x.pid)
  const ate = Date.parse(x.ate)
  return Number.isFinite(ate) && agora.getTime() < ate
}

export function saldoDoMes({ raiz = RAIZ, orcamento, agora = new Date(), vivo = processoVivo } = {}) {
  const c = caminhos(raiz)
  const o = orcamento ?? lerOrcamento({ raiz })
  if (o.tipo !== 'mes') return { tipo: 'lote', teto_lote_usd: o.usd, aviso: o.aviso }
  const g = gastoDoMes(lerTexto(c.custos), { agora })
  const reservas = lerReservas(c.reservas).map(x => ({ ...x, falta_usd: arred(Math.max(0, x.usd - (g.porReserva[x.id] || 0))), vivo: reservaViva(x, agora, vivo) }))
  const reservado = arred(reservas.reduce((s, x) => s + x.falta_usd, 0))
  return { tipo: 'mes', orcamento_usd: o.usd, gasto_usd: g.usd, reservado_usd: reservado, saldo_usd: arred(o.usd - g.usd - reservado), por_area: g.por_area, reservas, a_parte: g.a_parte, linhas: g.linhas, bloco: o.bloco }
}

export function processoVivo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' }
}

const dormir = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

// Trava com dono em dados/ (o padrao do baixarNaSaida da 5.36): nasce com wx, guarda o pid, e so a de processo
// morto se rouba, por rename, que so um processo ganha. So quem criou apaga.
export function comTrava(raiz, fazer, { prazoMs = PRAZO_TRAVA_MS, vivo = processoVivo } = {}) {
  const { trava } = caminhos(raiz)
  mkdirSync(join(raiz, 'dados'), { recursive: true })
  const dono = randomUUID()
  const minha = JSON.stringify({ pid: process.pid, dono })
  const fim = Date.now() + prazoMs
  for (;;) {
    try { writeFileSync(trava, minha, { flag: 'wx' }); break } catch (e) {
      if (e.code !== 'EEXIST') throw e
      let lida = null
      try { lida = readFileSync(trava, 'utf8') } catch {}
      let pid = null
      try { pid = JSON.parse(lida).pid } catch {}
      if (Number.isInteger(pid) && !vivo(pid)) {
        const roubada = `${trava}.velha-${dono}`
        try { renameSync(trava, roubada) } catch (e2) { if (e2.code === 'ENOENT') continue; throw e2 }
        let conteudo = null
        try { conteudo = readFileSync(roubada, 'utf8') } catch {}
        if (conteudo !== lida) try { linkSync(roubada, trava) } catch {}
        try { rmSync(roubada, { force: true }) } catch {}
        continue
      }
      if (Date.now() >= fim) throw new Error('outro gasto do projeto esta conferindo o orcamento e nao terminou a tempo; espere ele acabar e rode de novo')
      dormir(50)
    }
  }
  try { return fazer() } finally {
    try { if (JSON.parse(readFileSync(trava, 'utf8')).dono === dono) rmSync(trava, { force: true }) } catch {}
  }
}

const usd = (n) => `US$ ${Number(n).toFixed(2)}`

// O motivo provavel da parada: medido quando o mes tem o minimo de videos com o campo video, hipotese antes disso.
function motivoProvavel(s) {
  const porVideo = {}
  for (const l of s.linhas) if (l.video) porVideo[l.video] = (porVideo[l.video] || 0) + l.usd
  const n = Object.keys(porVideo).length
  const media = s.bloco?.media_video_usd
  if (n >= MINIMO_VIDEOS_HISTORICO && media) {
    const real = arred(Object.values(porVideo).reduce((a, b) => a + b, 0) / n)
    return `este mes teve ${n} videos a ${usd(real)} em media cada, contra ${usd(media)} da media dada`
  }
  return 'provavelmente mais videos, mais cenas, videos mais longos ou mais tentativas do que a media previa (hipotese: ainda falta historico pra medir)'
}

function parada(s, estimativaUsd, acabou) {
  const media = s.bloco?.media_video_usd !== undefined ? ` A media dada no /configurar-video foi ${usd(s.bloco.media_video_usd)} por video.` : ''
  const comeco = acabou
    ? `o orcamento do mes (${usd(s.orcamento_usd)}) acabou: o mes ja gastou ${usd(s.gasto_usd)}`
    : `este gasto (${usd(estimativaUsd)}) nao cabe no que sobrou do orcamento do mes (${usd(s.orcamento_usd)}): o mes ja gastou ${usd(s.gasto_usd)}`
  const aberto = s.reservado_usd > 0 ? ` e ha ${usd(s.reservado_usd)} reservados por gasto em andamento ou que caiu (veja com --saldo)` : ''
  return `${comeco}${aberto}.${media} Motivo: ${motivoProvavel(s)}. Suba o orcamento no /configurar-video ou espere o mes virar.`
}

// A trava unica. 0 libera; 3 parou (nao cabe, acabou, arquivo quebrado ou falta o pode ir). Com orcamento do mes,
// a liberacao reserva a estimativa sob a trava, pra dois gastos juntos nao lerem o mesmo saldo; quem gastou passa a
// reserva no registrarCusto e fecha com fecharReserva no fim. Liberado nunca mostra saldo.
export function liberarGasto({ estimativaUsd, autorizado }, { raiz = RAIZ, lerOrcamento: ler = () => lerOrcamento({ raiz }), pid = process.pid, contexto = '', agora = () => new Date(), vivo = processoVivo } = {}) {
  const estimativa_usd = arred(estimativaUsd)
  let o
  try { o = ler() } catch (e) { return { codigo: 3, parou: e.message, estimativa_usd } }
  if (o.tipo !== 'mes') {
    if (estimativa_usd > o.usd) return { codigo: 3, parou: `passa do limite_gasto_usd (US$ ${o.usd}); divida em partes ou suba o teto em _contexto/mercado-livre.md`, estimativa_usd, aviso: o.aviso }
    if (!autorizado) return { codigo: 3, parou: 'precisa do pode ir da pessoa (rode de novo com --autorizado depois do sim)', estimativa_usd, aviso: o.aviso }
    return { codigo: 0, estimativa_usd, reserva: null, aviso: o.aviso }
  }
  try {
    return comTrava(raiz, () => {
      const t = agora()
      const s = saldoDoMes({ raiz, orcamento: o, agora: t, vivo })
      if (s.saldo_usd <= 0) return { codigo: 3, parou: parada(s, estimativa_usd, true), estimativa_usd }
      if (estimativa_usd > s.saldo_usd) return { codigo: 3, parou: parada(s, estimativa_usd, false), estimativa_usd }
      if (!autorizado) return { codigo: 3, parou: 'precisa do pode ir da pessoa (rode de novo com --autorizado depois do sim)', estimativa_usd }
      const { reservas } = caminhos(raiz)
      const id = randomUUID()
      const lista = lerReservas(reservas)
      // pid null e gasto feito a mao: sem pid pra conferir, a reserva leva o ate do relogio
      lista.push(pid === null
        ? { id, usd: estimativa_usd, em: emLocal(t), ate: emLocal(new Date(t.getTime() + PRAZO_RESERVA_MAO_MS)), contexto }
        : { id, usd: estimativa_usd, pid, em: emLocal(t), contexto })
      writeFileSync(reservas, JSON.stringify(lista, null, 2) + '\n')
      return { codigo: 0, estimativa_usd, reserva: id }
    }, { vivo })
  } catch (e) { return { codigo: 3, parou: `nao consegui conferir o orcamento (${e.message}); o gasto parou antes de comecar`, estimativa_usd } }
}

// Tira a reserva da conta (o que ela nao gastou volta pro saldo). Sem id (gasto por lote), nada a fazer.
export function fecharReserva(id, { raiz = RAIZ } = {}) {
  if (!id) return false
  return comTrava(raiz, () => {
    const { reservas } = caminhos(raiz)
    const lista = lerReservas(reservas)
    const resto = lista.filter(x => x.id !== id)
    if (resto.length === lista.length) return false
    writeFileSync(reservas, JSON.stringify(resto, null, 2) + '\n')
    return true
  })
}

// Data e hora com o deslocamento do fuso da maquina (2026-10-31T21:30:00.000-03:00): quem le ve a hora local
// e o instante continua exato.
export function emLocal(d = new Date()) {
  const dois = (n) => String(Math.trunc(Math.abs(n))).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  const sinal = off >= 0 ? '+' : '-'
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}T${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}${sinal}${dois(off / 60)}:${dois(off % 60)}`
}

// Toda cobranca vira UMA linha em dados/custos.jsonl ({em, servico, usd, contexto} e os opcionais video,
// segundos, cenas, tentativa, reserva, area, modelo e tokens). Area fora da lista nao grava: o extrato
// classifica pelo servico. Falha ao gravar so avisa: a cobranca ja aconteceu.
export function registrarCusto({ servico, usd: valor, contexto, video, segundos, cenas, tentativa, reserva, area, modelo, tokens_entrada, tokens_saida, tokens }, { raiz = RAIZ, avisar = console.error, agora = () => new Date() } = {}) {
  const linha = { em: emLocal(agora()), servico, usd: arred(valor), contexto }
  if (!AREAS.includes(area)) area = undefined
  for (const [k, v] of Object.entries({ video, segundos, cenas, tentativa, reserva, area, modelo, tokens_entrada, tokens_saida, tokens })) if (v !== undefined && v !== null && v !== '') linha[k] = v
  try {
    mkdirSync(join(raiz, 'dados'), { recursive: true })
    appendFileSync(join(raiz, 'dados', 'custos.jsonl'), JSON.stringify(linha) + '\n')
    return true
  } catch (e) {
    avisar(`[custo] ${servico} cobrado (US$ ${linha.usd}) mas a linha nao foi gravada em dados/custos.jsonl; anote a mao. Motivo: ${e.message}`)
    return false
  }
}
