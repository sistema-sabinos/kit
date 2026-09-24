// Diagnostico da /auditar-conta: aplica as regras a foto da conta, compara com a foto anterior e
// escreve o relatorio. Anuncio com decisao em vigor na ata (escopo conta, como "aposentar") sai da
// fila e vai pro rodape, pra decisao tomada nao voltar toda semana no topo.
// Os limiares ficam em LIMITES; e ali que se calibra quando um achado vira ruido ou passa batido.
import { decisoesVigentes, estadoDaDecisao, prazoDe } from '../../mercado-livre/scripts/lib/decisoes.mjs'

export const LIMITES = {
  fotos_min: 6,
  fotos_ideal: 8,
  titulo_min: 45,          // o titulo vai ate 60; abaixo disso sobra palavra de busca na mesa
  descricao_min: 300,
  conversao_min: 0.01,     // 1%: abaixo disso, com trafego, o problema e a oferta
  visitas_relevantes: 50,
  full_min_vendas: 10,
  health_meta: 0.8,
  // termometro de reputacao (conferir o limite atual ao vivo antes de agir)
  rep_reclamacoes: 0.02,
  rep_atrasos: 0.10,
  rep_cancelamentos: 0.015,
}

const NIVEL = { '1_red': 'vermelha', '2_orange': 'laranja', '3_yellow': 'amarela', '4_light_green': 'verde-clara', '5_green': 'verde' }
const PESO = { critico: 0, alto: 1, oportunidade: 2, medio: 3, baixo: 4 }
const brl = n => `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`

export function analisarItem(it, snap, L = LIMITES) {
  const visitas = snap.visitas?.mapa?.[it.id] ?? null
  const vendas = snap.vendas?.porItem?.[it.id] || 0
  const conv = visitas ? vendas / visitas : null
  const custo = it._custo > 0 ? it._custo : null
  const margemUn = custo ? it.price - custo : null
  const problemas = []
  const add = (sev, tag, msg, acao) => problemas.push({ sev, tag, msg, acao })

  if (it.status === 'paused') {
    if ((it.sold_quantity || 0) >= 5) add('critico', 'morto', `pausado, e ja vendeu ${it.sold_quantity} no total`, 'reativar e revisar o preco: a demanda ja foi provada')
    else add('baixo', 'morto', `pausado, com pouco historico (${it.sold_quantity || 0} vendas)`, 'encerrar pra limpar a conta, ou revisar e reativar')
  } else if (it.status === 'active') {
    if (it.available_quantity === 0) add('critico', 'sem-estoque', 'ativo com quantidade zero (some da busca)', 'ajustar a quantidade pra voltar a aparecer')
    else if (visitas === 0) add('critico', 'morto', 'nenhuma visita na janela', 'revisar titulo e palavra-chave, ou encerrar')
    else if (visitas >= L.visitas_relevantes && vendas === 0) add('alto', 'conversao', `${visitas} visitas e nenhuma venda`, 'mexer em preco, capa e ficha; o trafego ja chega')
    else if (conv !== null && visitas >= L.visitas_relevantes && conv < L.conversao_min) add('alto', 'conversao', `conversao de ${(conv * 100).toFixed(1)}% com ${visitas} visitas`, 'oferta fraca: preco total, capa e prova social')
  }
  const fotos = it.pictures?.length || 0
  if (fotos < L.fotos_min) add('alto', 'fotos', `so ${fotos} fotos`, `chegar a ${L.fotos_ideal} ou mais`)
  else if (fotos < L.fotos_ideal) add('medio', 'fotos', `${fotos} fotos`, `chegar a ${L.fotos_ideal} ou mais`)
  if (it._obrigatorios_faltando?.length) add('critico', 'atributos', `faltam obrigatorios: ${it._obrigatorios_faltando.join(', ')}`, 'preencher os atributos obrigatorios da categoria')
  if (it._descricao_len != null && it._descricao_len < L.descricao_min) {
    add('medio', 'descricao', `descricao curta (${it._descricao_len} caracteres)`, it._descricao_origem === 'catalogo' ? 'a descricao e a do catalogo: so muda pela pagina do catalogo' : 'descricao que explica, antecipa duvida e traz as palavras que nao couberam no titulo')
  }
  if ((it.title?.length || 0) < L.titulo_min) add('medio', 'titulo', `titulo curto (${it.title?.length || 0} de 60)`, 'usar os 60 caracteres com palavra de busca (so antes da primeira venda: depois o titulo trava)')
  if (!it.warranty) add('baixo', 'garantia', 'sem garantia informada', 'informar a garantia')
  if (it.health != null && it.health < L.health_meta) add('alto', 'health', `qualidade ${Math.round(it.health * 100)} de 100 (meta ${L.health_meta * 100})`, 'subir titulo, fotos e atributos')
  if (it.status === 'active' && it.shipping?.logistic_type !== 'fulfillment' && vendas >= L.full_min_vendas) add('oportunidade', 'full', `${vendas} vendas na janela fora do Full`, 'estudar mandar pro Full: giro alto paga a armazenagem')
  if (it._bling_id && !custo) add('baixo', 'custo', 'sem custo cadastrado no Bling', 'lancar o custo no Bling pra auditoria calcular margem')
  const impacto = margemUn ? Math.max(0, vendas * margemUn) : 0
  return { it, visitas, vendas, conv, custo, margemUn, problemas, impacto }
}

export function analisarReputacao(rep, L = LIMITES) {
  if (!rep) return { nivel: null, acima: false, linhas: ['- sem dado de reputacao'] }
  const m = rep.metrics || {}
  let acima = false
  const linha = (nome, taxa, limite) => {
    const estado = taxa > limite ? 'ACIMA do limite' : taxa > limite * 0.7 ? 'perto do limite' : 'ok'
    if (taxa > limite) acima = true
    return `- ${nome}: ${(taxa * 100).toFixed(2)}% (limite ${(limite * 100).toFixed(1)}%), ${estado}`
  }
  const linhas = [linha('Reclamacoes', m.claims?.rate ?? 0, L.rep_reclamacoes), linha('Envios atrasados', m.delayed_handling_time?.rate ?? 0, L.rep_atrasos), linha('Cancelamentos', m.cancellations?.rate ?? 0, L.rep_cancelamentos)]
  return { nivel: NIVEL[rep.level_id] || rep.level_id || null, acima, linhas }
}

export function evolucao(atual, anterior) {
  if (!anterior) return ['Primeira coleta: a partir da proxima rodada aparece o que subiu e o que caiu.']
  const out = []
  const a = anterior.totais
  const n = atual.totais
  if (n.ativos !== a.ativos) out.push(`Ativos: ${a.ativos} para ${n.ativos}`)
  if (n.pausados !== a.pausados) out.push(`Pausados: ${a.pausados} para ${n.pausados}`)
  const soma = s => Object.values(s.vendas?.porItem || {}).reduce((x, y) => x + y, 0)
  out.push(`Unidades vendidas na janela: ${soma(anterior)} para ${soma(atual)}`)
  const antes = Object.fromEntries((anterior.itens || []).map(i => [i.id, i.status]))
  const pausou = (atual.itens || []).filter(i => i.status === 'paused' && antes[i.id] === 'active')
  if (pausou.length) out.push(`${pausou.length} anuncio(s) pausaram desde a ultima: ${pausou.map(i => i.id).join(', ')}`)
  return out
}

export function diagnosticar({ atual, anterior = null, decisoes = [], L = LIMITES }) {
  const vigentes = decisoesVigentes(decisoes, { escopo: 'conta' })
  const guardados = new Map()
  for (const [id, d] of vigentes) if (estadoDaDecisao(d, {}, {}, atual.data).estado === 'em_vigor') guardados.set(id, d)
  const todas = atual.itens.map(it => analisarItem(it, atual, L))
  const analises = todas.filter(a => !guardados.has(String(a.it.id)))
  const naGaveta = todas.filter(a => guardados.has(String(a.it.id)))
  const pior = a => Math.min(...a.problemas.map(p => PESO[p.sev] ?? 9))
  const comAcao = analises.filter(a => a.problemas.some(p => p.tag !== 'custo'))
    .sort((x, y) => pior(x) - pior(y) || y.impacto - x.impacto || (y.it.sold_quantity || 0) - (x.it.sold_quantity || 0))
  const soCusto = analises.filter(a => a.problemas.length && a.problemas.every(p => p.tag === 'custo'))
  const rep = analisarReputacao(atual.reputacao, L)
  const contagem = {}
  for (const a of analises) for (const p of a.problemas) contagem[p.tag] = (contagem[p.tag] || 0) + 1
  const promos = Array.isArray(atual.promocoes) ? atual.promocoes : []
  const abertas = promos.filter(p => p.status === 'candidate' || p.status === 'started')

  const md = [`# Raio-X da conta, ${atual.data}`, '']
  md.push(`Janela de ${atual.janela_dias} dias. Reputacao ${rep.nivel || 'sem dado'}. Anuncios: ${atual.totais.itens} (${atual.totais.ativos} ativos, ${atual.totais.pausados} pausados, ${atual.totais.encerrados} encerrados).`, '')
  md.push('> Regra de plataforma envelhece: antes de agir sobre um limite deste relatorio (reputacao, fotos, titulo, Full), conferir ao vivo na Central de Vendedores.', '')
  md.push('## Termometro', ...rep.linhas, '', '## Evolucao desde a ultima rodada', ...evolucao(atual, anterior).map(e => `- ${e}`), '')
  md.push('## Resumo dos achados')
  for (const t of ['morto', 'sem-estoque', 'atributos', 'conversao', 'health', 'fotos', 'full', 'descricao', 'titulo', 'garantia']) if (contagem[t]) md.push(`- ${t}: ${contagem[t]} anuncio(s)`)
  if (abertas.length) md.push(`- campanhas de desconto abertas pra conta: ${abertas.length} (entrar so com a margem refeita no simulador)`)
  md.push('', '## Acao por anuncio (do mais grave pro mais leve)')
  for (const a of comAcao) {
    md.push('', `### ${a.it.title}`)
    md.push(`${a.it.id}, ${brl(a.it.price)}${a.custo ? `, custo ${brl(a.custo)} (margem bruta ${brl(a.margemUn)})` : ''}, ${a.it.status}, ${a.visitas ?? '?'} visitas e ${a.vendas} vendas na janela. ${a.it.permalink || ''}`)
    for (const p of [...a.problemas].sort((x, y) => (PESO[x.sev] ?? 9) - (PESO[y.sev] ?? 9))) md.push(`- **[${p.sev}] ${p.tag}:** ${p.msg}. Fazer: ${p.acao}`)
  }
  if (!comAcao.length) md.push('Nenhum anuncio com acao pendente.')
  if (naGaveta.length) {
    md.push('', '## Fora da fila por decisao em vigor', 'Pra trazer de volta, grave uma decisao nova na ata.')
    for (const a of naGaveta) { const d = guardados.get(String(a.it.id)); md.push(`- ${a.it.title} (${a.it.id}): ${d.decisao}, ${d.resumo}. ${prazoDe(d) ? `Reavaliar em ${prazoDe(d)}.` : 'Permanente.'}`) }
  }
  if (soCusto.length) {
    md.push('', '## Sem custo no Bling', `${soCusto.length} anuncio(s) casaram o SKU e estao sem custo, e a auditoria fica cega de margem neles:`)
    for (const a of soCusto) md.push(`- ${a.it.title} (${a.it.id})`)
  }
  return { md: md.join('\n') + '\n', comAcao: comAcao.length, contagem, reputacaoAcima: rep.acima, naGaveta: naGaveta.length }
}
