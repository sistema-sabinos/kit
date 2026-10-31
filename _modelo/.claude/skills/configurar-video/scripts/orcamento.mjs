// Etapa do orcamento do mes do /configurar-video. A IA confere o preco do dia na web e passa por flag;
// o script grava no bloco ```orcamento``` do _contexto/orcamento.md e faz toda a conta (a IA so le e diz).
// Uso (da pasta do projeto):
//   node .claude/skills/configurar-video/scripts/orcamento.mjs --definir --orcamento-usd 20
//     --preco-segundo-usd <US$ por segundo do olho final> --preco-cena-usd <US$ por imagem>
//     --fonte <pagina oficial de precos> --segundos <duracao do video tipico> --cenas <imagens por IA por video>
//   (tudo numa linha so). Com --cambio <R$ por US$ do dia>, o orcamento pode vir em reais (--orcamento-brl
//   no lugar do --orcamento-usd) e a saida traz os valores em reais tambem.
//   node .claude/skills/configurar-video/scripts/orcamento.mjs --saldo
//   node .claude/skills/configurar-video/scripts/orcamento.mjs --fechar-reserva <id>
// Saida: uma linha JSON no stdout. 0 ok; 1 arquivo quebrado; 2 uso errado.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { realpathSync } from 'node:fs'
import { RAIZ } from '../../conectar/scripts/lib/raiz.mjs'
import { lerOrcamento, saldoDoMes, fecharReserva, SERVICOS_DO_ORCAMENTO, MINIMO_VIDEOS_HISTORICO } from '../../conectar/scripts/lib/orcamento.mjs'

const arred = (n) => Math.round(n * 1e4) / 1e4
const hoje = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function lerArgs(argv) {
  const a = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) a[argv[i].slice(2)] = true
    else { a[argv[i].slice(2)] = v; i++ }
  }
  return a
}

// Consumo de cada video ja feito (linhas com o campo video): segundos e cenas somados, todas as tentativas juntas.
export function consumoPorVideo(texto) {
  const v = {}
  for (const l of String(texto).split(/\r?\n/)) {
    let j
    try { j = JSON.parse(l) } catch { continue }
    if (!j?.video || typeof j.servico !== 'string' || !SERVICOS_DO_ORCAMENTO.some(p => j.servico.startsWith(p))) continue
    const c = (v[j.video] ??= { segundos: 0, cenas: 0 })
    if (Number.isFinite(j.segundos)) c.segundos += j.segundos
    if (Number.isFinite(j.cenas)) c.cenas += j.cenas
  }
  return Object.values(v)
}

// A media pelo preco do dia e, com o minimo de videos, o consumo historico vezes o mesmo preco.
export function calcularMedias({ orcamentoUsd, precoSegundoUsd, precoCenaUsd, segundos, cenas, historico = [] }) {
  const porVideo = arred(segundos * precoSegundoUsd + cenas * precoCenaUsd)
  const r = {
    orcamento_mes_usd: orcamentoUsd,
    media_segundo_usd: precoSegundoUsd,
    media_cena_usd: precoCenaUsd,
    media_video_usd: porVideo,
    da_em_media_videos: porVideo > 0 ? Math.floor(orcamentoUsd / porVideo) : null,
    historico: null,
  }
  if (historico.length >= MINIMO_VIDEOS_HISTORICO) {
    const seg = historico.reduce((s, x) => s + x.segundos, 0) / historico.length
    const cen = historico.reduce((s, x) => s + x.cenas, 0) / historico.length
    const h = arred(seg * precoSegundoUsd + cen * precoCenaUsd)
    r.historico = { videos: historico.length, media_video_usd: h, da_em_media_videos: h > 0 ? Math.floor(orcamentoUsd / h) : null }
  }
  return r
}

// Troca so o bloco; o texto em volta e da pessoa e fica. Sem arquivo, nasce com uma linha de explicacao.
// Arquivo sem bloco que feche (o conserto que o leitor manda) nasce de novo, e o texto antigo vai pra uma
// copia ao lado, devolvida no retorno.
export function gravarBloco(caminho, campos) {
  const antes = existsSync(caminho) ? readFileSync(caminho, 'utf8') : null
  const crlf = antes ? antes.includes(String.fromCharCode(13, 10)) : true
  const fim = crlf ? String.fromCharCode(13, 10) : String.fromCharCode(10)
  const bloco = ['```orcamento', ...Object.entries(campos).map(([k, v]) => `${k}: ${v}`), '```'].join(fim)
  let texto, copia = null
  const trocaSoOBloco = antes !== null && /```orcamento\s*\n[\s\S]*?```/.test(antes)
  if (trocaSoOBloco) texto = antes.replace(/```orcamento\s*\n[\s\S]*?```/, () => bloco)
  else texto = ['# Orçamento do mês', '', 'Quanto você topa gastar por mês com IA paga. Mude pelo /configurar-video.', '', bloco, ''].join(fim)
  mkdirSync(join(caminho, '..'), { recursive: true })
  if (antes !== null && !trocaSoOBloco) {
    copia = join(caminho, '..', `orcamento-antes-${Date.now()}.md`)
    writeFileSync(copia, antes)
  }
  writeFileSync(caminho, texto)
  return { copia }
}

export function rodar(argv, { raiz = RAIZ, agora = new Date() } = {}) {
  const a = lerArgs(argv)
  const caminho = join(raiz, '_contexto', 'orcamento.md')
  if (a.saldo) {
    const s = saldoDoMes({ raiz, agora })
    if (s.tipo !== 'mes') return { codigo: 0, saida: s }
    return { codigo: 0, saida: { tipo: s.tipo, orcamento_usd: s.orcamento_usd, gasto_usd: s.gasto_usd, reservado_usd: s.reservado_usd, saldo_usd: s.saldo_usd, a_parte: s.a_parte, reservas: s.reservas.map(({ id, falta_usd, contexto, em, vivo }) => ({ id, falta_usd, contexto, em, vivo })) } }
  }
  if (typeof a['fechar-reserva'] === 'string') return { codigo: 0, saida: { fechou: fecharReserva(a['fechar-reserva'], { raiz }) } }
  if (!a.definir) return { codigo: 2, saida: { erro: 'uso: --definir (com o orcamento e os precos do dia), --saldo ou --fechar-reserva <id>' } }
  const num = (k, { min = 0, inteiro = false } = {}) => {
    const n = Number(String(a[k] ?? '').replace(',', '.'))
    if (a[k] === undefined || a[k] === true || !Number.isFinite(n) || n < min || (inteiro && !Number.isInteger(n))) throw new Error(`--${k} precisa ser numero${inteiro ? ' inteiro' : ''} a partir de ${min}, e veio "${a[k] ?? ''}"`)
    return n
  }
  let v, cambio
  try {
    cambio = a.cambio === undefined ? null : num('cambio', { min: 0.01 })
    // em reais, o orcamento vira dolar pelo cambio do dia, pra baixo no centavo
    const orcamentoUsd = a['orcamento-brl'] !== undefined && cambio ? Math.floor(num('orcamento-brl', { min: 0.01 }) / cambio * 100) / 100 : num('orcamento-usd', { min: 0.01 })
    v = { orcamentoUsd, precoSegundoUsd: num('preco-segundo-usd'), precoCenaUsd: num('preco-cena-usd'), segundos: num('segundos', { min: 1 }), cenas: num('cenas', { inteiro: true }) }
    if (typeof a.fonte !== 'string' || !a.fonte.trim()) throw new Error('--fonte precisa da pagina oficial de onde saiu o preco do dia')
  } catch (e) { return { codigo: 2, saida: { erro: e.message } } }
  const custos = join(raiz, 'dados', 'custos.jsonl')
  const m = calcularMedias({ ...v, historico: consumoPorVideo(existsSync(custos) ? readFileSync(custos, 'utf8') : '') })
  if (cambio) {
    const brl = (usd) => Math.round(usd * cambio * 100) / 100
    Object.assign(m, { cambio_brl_por_usd: cambio, orcamento_mes_brl: brl(m.orcamento_mes_usd), media_video_brl: brl(m.media_video_usd) })
    if (m.historico) m.historico.media_video_brl = brl(m.historico.media_video_usd)
  }
  const dia = hoje(agora)
  const { copia } = gravarBloco(caminho, {
    orcamento_mes_usd: v.orcamentoUsd, definido_em: dia, preco_segundo_usd: v.precoSegundoUsd, preco_cena_usd: v.precoCenaUsd,
    fonte: a.fonte.trim(), conferido_em: dia, segundos_por_video: v.segundos, cenas_por_video: v.cenas, media_video_usd: m.media_video_usd,
  })
  try { lerOrcamento({ raiz }) } catch (e) { return { codigo: 1, saida: { erro: `gravei mas o arquivo nao le de volta: ${e.message}` } } }
  if (copia) m.copia_do_texto_antigo = copia
  return { codigo: 0, saida: m }
}

function chamadoDireto() {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}

if (chamadoDireto()) {
  let r
  try { r = rodar(process.argv.slice(2)) } catch (e) { r = { codigo: 1, saida: { erro: e.message } } }
  console.log(JSON.stringify(r.saida))
  process.exitCode = r.codigo
}
