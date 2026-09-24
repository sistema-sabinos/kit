// As regras do Mercado Ads, sem rede. O porque de cada numero esta em referencias/estrategia.md.
// Os numeros da conta moram em dados/ads/guard-rails.json (o freio), que a /mercado-ads monta
// com a pessoa; o que faltar la vem daqui.
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { RAIZ } from '../../mercado-livre/scripts/lib/raiz.mjs'

export const CAMINHO_FREIO = join(RAIZ, 'dados', 'ads', 'guard-rails.json')

export const PADROES = {
  acos_alvo: 0.15,             // abaixo disso sobra margem e vale escalar
  acos_teto: 0.25,             // acima disso a campanha come a margem; nunca acima da margem do produto
  janela_minima_dias: 7,       // antes disso o algoritmo ainda aprende e nada se julga
  gasto_min_sem_conversao: 30, // R$ gastos sem nenhuma venda que ja pedem pausa
  passo_escala_pct: 20,
  passo_corte_pct: 20,
  orcamento_diario_max: 50,
  uso_min_escalar: 0.7,        // so escala quem gasta 70% ou mais do orcamento (a verba e a trava)
  furar_acos_pp: 0.03,         // decisao em vigor volta pra fila se o ACOS de 7 dias subir 3 pontos
  furar_gasto_sem_venda: 30,   // ou se queimar isso sem venda desde a decisao
}

export function carregarFreio(caminho = CAMINHO_FREIO) {
  if (!existsSync(caminho)) return { ...PADROES, _padrao: true }
  const arquivo = JSON.parse(readFileSync(caminho, 'utf8'))
  if (arquivo.acos_alvo != null && arquivo.acos_teto != null && arquivo.acos_alvo > arquivo.acos_teto) {
    throw new Error(`o freio em ${caminho} tem acos_alvo (${arquivo.acos_alvo}) acima do acos_teto (${arquivo.acos_teto}). Corrija com a /mercado-ads.`)
  }
  return { ...PADROES, ...arquivo }
}

// TACOS: gasto de anuncio sobre a receita inteira (anuncio mais organico).
export const tacos = ({ cost, totalAmount }) => (totalAmount > 0 ? cost / totalAmount : 0)

// m = { clicks, cost, conversions, acos, orcamento, gasto_diario }; freio com dias_dados.
// Devolve { status: boa|observar|ruim, acao: escalar|manter|reduzir|pausar|aprender, motivo, alavanca? }
export function classificarCampanha(m, freio) {
  const g = { ...PADROES, ...freio }
  const pct = v => (v * 100).toFixed(1)
  // gasto sem venda vem antes da janela: campanha que sangra nao ganha tempo pra aprender
  if (m.conversions === 0 && m.cost >= g.gasto_min_sem_conversao) {
    return { status: 'ruim', acao: 'pausar', motivo: `gastou R$ ${m.cost.toFixed(2)} sem nenhuma venda (limite R$ ${g.gasto_min_sem_conversao}).` }
  }
  if ((g.dias_dados ?? 0) < g.janela_minima_dias) {
    return { status: 'observar', acao: 'aprender', motivo: `so ${g.dias_dados ?? 0} dias de dado, abaixo da janela minima de ${g.janela_minima_dias}. Deixar aprender.` }
  }
  const orc = m.orcamento ?? 0
  const gastoDia = m.gasto_diario ?? 0
  if (m.acos > g.acos_teto) {
    const cabeca = `ACOS ${pct(m.acos)}% acima do teto de ${pct(g.acos_teto)}%.`
    if (orc > 0 && gastoDia / orc >= g.uso_min_escalar) {
      return { status: 'ruim', acao: 'reduzir', alavanca: 'orcamento', motivo: `${cabeca} Usa ${((gastoDia / orc) * 100).toFixed(0)}% do orcamento, a verba e a trava: cortar o orcamento em ${g.passo_corte_pct}%.` }
    }
    if (orc > 0) {
      return { status: 'ruim', acao: 'reduzir', alavanca: 'lance', motivo: `${cabeca} Usa so ${((gastoDia / orc) * 100).toFixed(0)}% do orcamento, entao cortar verba nao muda nada: baixar o ACOS objetivo (subir o ROAS objetivo) da campanha.` }
    }
    return { status: 'ruim', acao: 'reduzir', motivo: `${cabeca} Reduzir lance ou orcamento em ${g.passo_corte_pct}%.` }
  }
  if (m.acos <= g.acos_alvo && m.conversions > 0) {
    if (orc > 0 && gastoDia < g.uso_min_escalar * orc) {
      return { status: 'boa', acao: 'manter', motivo: `ACOS ${pct(m.acos)}% bom, mas usa so ${((gastoDia / orc) * 100).toFixed(0)}% do orcamento: mais verba nao adianta, o limite e lance ou demanda.` }
    }
    return { status: 'boa', acao: 'escalar', motivo: `ACOS ${pct(m.acos)}% no alvo, com venda e batendo no orcamento: subir o orcamento em ${g.passo_escala_pct}%, sem passar de R$ ${g.orcamento_diario_max} por dia.` }
  }
  if (m.conversions === 0) {
    return { status: 'observar', acao: 'manter', motivo: `sem venda ainda e gasto abaixo do limite de R$ ${g.gasto_min_sem_conversao}: observar.` }
  }
  return { status: 'observar', acao: 'manter', motivo: `ACOS ${pct(m.acos)}% entre o alvo e o teto: manter e observar.` }
}
