// O relatorio que a pessoa le, em linguagem de quem nunca fez estatistica, e o recibo curto
// do chat. Ordem fixa: o aviso que muda a leitura vem antes de qualquer achado.
export const AVULSAS_NO_RELATORIO = 10
const pct = n => `${Math.round(n * 100)}%`
const reais = n => (typeof n === 'number' && Number.isFinite(n) ? `R$ ${n.toFixed(2).replace('.', ',')}` : 'sem dado')
const fracao = f => (f?.fracao == null ? 'sem dado' : `${pct(f.fracao)} (de ${f.base})`)
const BLOQUEIO = {
  'amostra-pequena': 'poucos anúncios na comparação',
  'piso-de-campeoes': 'menos de 3 campeões fazendo, pouco pra afirmar',
  'piso-de-controle': 'menos de 3 anúncios fracos fazendo, pouco pra afirmar',
  'sem-ficha': 'o Gemini não leu as fotos de anúncios suficientes',
}
const linhaDoTeste = p => `- **${p.nome}**: ${p.campeoes_fazendo} de ${p.campeoes_total} campeões contra ${p.controle_fazendo} de ${p.controle_total} anúncios fracos`

export function montarRelatorio(r) {
  const L = []
  const porVeredito = v => r.padroes.filter(p => p.veredito === v && !p.erros_no_teste)
  L.push(`# Engenharia reversa: ${r.termo}`, '')
  L.push(`> Gerado pela /engenharia-reversa em ${r.data}. ${r.amostra.campeoes} campeões (os que mais faturam) contra ${r.amostra.controle} anúncios fracos do mesmo produto, de ${r.amostra.busca ?? '?'} anúncios da busca. ${r.com_ver ? 'Com a leitura das fotos pelo Gemini.' : 'Só os testes grátis.'}`, '')

  if (r.inconclusivo) {
    L.push('## Atenção: esta rodada não permite conclusão', '')
    L.push('Os números abaixo são pista, nunca regra. Motivo:', '')
    for (const m of r.diagnostico.motivos) L.push(`- ${m}`)
    L.push('', 'Rodar de novo com um termo de busca mais amplo costuma resolver.', '')
  }
  if (r.composicao.escopo === 'produto') {
    const c = r.composicao.campeoes
    L.push('## Esta rodada estuda o PRODUTO', '')
    L.push(`${c.catalogo} de ${c.total} campeões são página de catálogo. No catálogo a foto é a mesma pra todo vendedor, e a briga é preço e reputação. Então o que aparece aqui explica por que esse produto vende. Pra estudar como montar o anúncio, rode com \`--so-tradicional\`.`, '')
  }

  L.push('## Escada de preço do catálogo', '')
  const escadas = r.escada.filter(e => e.vendedores || e.sem_dado)
  if (!escadas.length) L.push('Nenhum campeão ou anúncio fraco desta rodada é página de catálogo.', '')
  for (const e of escadas) {
    L.push(`### ${e.titulo ?? e.id} (${e.grupo === 'campeao' ? 'campeão' : 'fraco'})`, '')
    if (e.sem_dado) { L.push(`Sem dado: ${e.sem_dado}.`, ''); continue }
    L.push(`- ${e.vendedores} ${e.vendedores === 1 ? 'vendedor' : 'vendedores'} disputando. Menor preço ${reais(e.piso)}, um quarto vende até ${reais(e.p25)}, metade até ${reais(e.mediana)}, maior ${reais(e.teto)}.`)
    L.push(`- Frete grátis: ${fracao(e.frete_gratis)}. Loja oficial: ${fracao(e.loja_oficial)}. No Full: ${e.full} de ${e.vendedores}.`)
    L.push(`- Tipo de anúncio: ${Object.entries(e.modalidades).map(([m, n]) => `${n} ${m === 'gold_pro' ? 'Premium' : m === 'gold_special' ? 'Clássico' : m}`).join(', ') || 'sem dado'}.`, '')
  }
  L.push('Sem o custo do seu produto, esta escada não diz se cabe margem: isso a /decidir-anuncio calcula.', '')

  // rodada de PRODUTO mostra o achado, mas nunca como licao de anuncio (spec, secao 5)
  const titulo = r.inconclusivo ? ' (pista, rodada inconclusiva)' : r.composicao.escopo === 'produto' ? ' (diferença de PRODUTO, não ensina anúncio)' : ''
  L.push(`## O que separa campeão de anúncio fraco${titulo}`, '')
  const regras = porVeredito('regra')
  L.push(...(regras.length ? regras.map(linhaDoTeste) : ['Nenhum teste separou os dois grupos.']), '')
  L.push(`## O que o anúncio fraco faz e o campeão não${titulo}`, '')
  const anti = porVeredito('anti-padrao')
  L.push(...(anti.length ? anti.map(linhaDoTeste) : ['Nada.']), '')
  L.push(`## Obrigação da categoria${titulo}`, '')
  L.push('Todo mundo faz, campeão e fraco. Não dá vantagem, mas sem isso você fica atrás.', '')
  const custo = porVeredito('custo-de-entrada')
  L.push(...(custo.length ? custo.map(linhaDoTeste) : ['Nenhum.']), '')

  L.push('## Dúvidas de cliente que nenhum concorrente responde', '')
  const cob = r.cobertura_perguntas
  L.push(`Lista montada sobre ${cob.com_perguntas} de ${cob.anuncios} anúncios (${cob.perguntas} perguntas).${cob.sem_perguntas.length ? ` Voltaram sem pergunta: ${cob.sem_perguntas.join(', ')}.` : ''} "Repetida" quer dizer que mais de um cliente perguntou.`, '')
  if (!r.objecoes.length) L.push('Nenhuma: toda dúvida achada já tem resposta em algum concorrente.', '')
  // repetidas todas; avulsas so as 10 primeiras, o resto fica no resultado.json
  const avulsas = r.objecoes.filter(o => !o.validada)
  const mostrar = [...r.objecoes.filter(o => o.validada), ...avulsas.slice(0, AVULSAS_NO_RELATORIO)]
  if (avulsas.length > AVULSAS_NO_RELATORIO) L.push(`Mais ${avulsas.length - AVULSAS_NO_RELATORIO} dúvidas avulsas ficaram no \`resultado.json\`.`, '')
  for (const o of mostrar) L.push(`- ${o.validada ? '**Repetida**' : 'Avulsa'}: "${o.texto}" (${o.ocorrencias} ${o.ocorrencias === 1 ? 'vez' : 'vezes'}, em ${o.anuncios} ${o.anuncios === 1 ? 'anúncio' : 'anúncios'})`)
  if (r.objecoes.length) L.push('')

  if (r.anatomia) {
    L.push('## Como os campeões montam as fotos', '')
    for (const p of r.anatomia.posicoes) L.push(`- Foto ${p.posicao}: ${p.papel} (${p.quantos} de ${p.de})`)
    L.push('', `Ninguém entre os campeões usa: ${r.anatomia.papeis_que_nenhum_campeao_usa.join(', ') || 'todos os papéis aparecem'}.`, '')
  }

  const bloqueados = r.padroes.filter(p => p.bloqueio)
  const irrelevantes = r.padroes.filter(p => !p.bloqueio && ['irrelevante', 'ruido'].includes(p.veredito) && !p.erros_no_teste)
  if (irrelevantes.length) {
    L.push('## Não fez diferença', '')
    L.push(...irrelevantes.map(linhaDoTeste), '')
  }
  if (bloqueados.length) {
    L.push('## Testes que não puderam decidir', '')
    L.push('Diferente de dar negativo: faltou amostra pra afirmar qualquer coisa.', '')
    L.push(...bloqueados.map(p => `${linhaDoTeste(p)}. Motivo: ${BLOQUEIO[p.bloqueio] ?? p.bloqueio}`), '')
  }
  const quebrados = r.padroes.filter(p => p.erros_no_teste)
  if (quebrados.length) {
    L.push('## Testes que quebraram (defeito do programa, avisar quem mantém o kit)', '')
    L.push(...quebrados.map(p => `- ${p.nome}: ${p.erros_no_teste} anúncios deram erro dentro do teste`), '')
  }

  const d = r.controle_diagnostico ?? {}
  L.push('## Como a amostra foi montada', '')
  if (d.restricao_nao_cumprida) L.push(`- Pedidos ${d.pedidos} anúncios fracos, saíram ${d.sorteados}: não tinha mais anúncio do mesmo produto vendendo pouco.`)
  if (d.especificacao?.length) L.push(`- Número que define o produto (tirado dos campeões): ${d.especificacao.join(', ')}.`)
  for (const c of d.campeoes_fora_da_especificacao ?? []) L.push(`- Campeão fora desse número: ${c.titulo}.`)
  if (d.descartados) L.push(`- Fora da comparação: ${d.descartados.vendas_desconhecidas} sem número de vendas, ${d.descartados.vendas_altas} com mais de ${d.teto_vendas} vendas, ${d.descartados.fora_da_faixa_de_preco} fora da faixa de preço, ${d.descartados.especificacao_diferente} com outro número no título.`)
  if (r.amostra.duplicatas?.length) L.push(`- ${r.amostra.duplicatas.length} ${r.amostra.duplicatas.length === 1 ? 'anúncio patrocinado era vendedor' : 'anúncios patrocinados eram vendedores'} de um catálogo já presente e contou uma vez só.`)
  if (r.amostra.falharam?.length) L.push(`- ${r.amostra.falharam.length} anúncios não abriram: ${r.amostra.falharam.map(f => `${f.id} (${f.erro})`).join('; ')}.`)
  L.push('')

  L.push('## Anexo: os anúncios', '')
  L.push('| Grupo | Anúncio | Preço | Vendidos | Tipo | Fotos | Vídeo |', '|---|---|---|---|---|---|---|')
  for (const a of r.anuncios) L.push(`| ${a.grupo === 'campeao' ? 'campeão' : 'fraco'} | [${String(a.titulo ?? a.id).replace(/\|/g, '/')}](${a.url}) | ${reais(a.preco)} | ${a.vendidos ?? 'sem dado'} | ${a.tipo ?? 'sem dado'} | ${a.fotos} | ${a.video == null ? 'sem dado' : a.video ? 'sim' : 'não'} |`)
  return L.join('\n') + '\n'
}

export function recibo(r, { relatorio, pasta }) {
  const p = r.placar
  const linhas = [
    `${r.termo}: ${r.amostra.campeoes} campeoes contra ${r.amostra.controle} fracos${r.inconclusivo ? ' (INCONCLUSIVA)' : ''}${r.composicao.escopo === 'produto' ? ', rodada de PRODUTO (maioria dos campeoes em catalogo)' : ''}`,
    `placar: ${p.regra} regra, ${p['anti-padrao']} anti-padrao, ${p['custo-de-entrada']} obrigacao, ${p.irrelevante + p.ruido} sem diferenca; ${r.diagnostico.testes.bloqueados} sem amostra pra decidir`,
    ...r.padroes.filter(x => ['regra', 'anti-padrao'].includes(x.veredito)).map(x => `${x.veredito}${r.composicao.escopo === 'produto' ? ' (produto, nao ensina anuncio)' : ''}: ${x.nome} (${x.campeoes_fazendo}/${x.campeoes_total} contra ${x.controle_fazendo}/${x.controle_total})`),
    `objecoes sem resposta: ${r.objecoes.filter(o => o.validada).length} repetidas, ${r.objecoes.filter(o => !o.validada).length} avulsas`,
    relatorio,
    pasta,
  ]
  return linhas.join('\n')
}
