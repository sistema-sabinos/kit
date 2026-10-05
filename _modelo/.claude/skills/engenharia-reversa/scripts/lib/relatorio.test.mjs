// Testes do relatorio e do recibo. Rodar: node --test relatorio.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarRelatorio, recibo } from './relatorio.mjs'

const padrao = (nome, veredito, extra = {}) => ({ nome, veredito, bloqueio: null, erros_no_teste: 0, campeoes_fazendo: 8, campeoes_total: 10, controle_fazendo: 2, controle_total: 10, ...extra })

function resultado(extra = {}) {
  return {
    termo: 'caneca termica',
    data: '2026-10-04',
    com_ver: false,
    amostra: { busca: 98, campeoes: 10, controle: 10, duplicatas: ['MLB9'], falharam: [{ id: 'MLB8', erro: 'pagina: timeout' }] },
    controle_diagnostico: { pedidos: 10, sorteados: 7, restricao_nao_cumprida: true, especificacao: [500], campeoes_fora_da_especificacao: [{ id: 'MLB3', titulo: 'Caneca 350 ml' }], descartados: { vendas_desconhecidas: 4, vendas_altas: 2, fora_da_faixa_de_preco: 1, especificacao_diferente: 3 }, teto_vendas: 200 },
    composicao: { campeoes: { catalogo: 3, total: 10 }, escopo: 'anuncio' },
    inconclusivo: false,
    diagnostico: { motivos: [], testes: { bloqueados: 1 } },
    padroes: [
      padrao('video do vendedor no anuncio', 'regra'),
      padrao('capa mais poluida que a mediana', 'anti-padrao', { campeoes_fazendo: 1, controle_fazendo: 7 }),
      padrao('8 ou mais fotos', 'custo-de-entrada', { controle_fazendo: 9 }),
      padrao('fundo branco puro na capa', 'irrelevante', { bloqueio: 'piso-de-campeoes', campeoes_fazendo: 2 }),
      padrao('capa com mais respiro que a mediana', 'irrelevante', { erros_no_teste: 3 }),
      padrao('vendedor com loja propria', 'irrelevante', { campeoes_fazendo: 1, controle_fazendo: 1 }),
    ],
    placar: { regra: 1, 'anti-padrao': 1, 'custo-de-entrada': 1, irrelevante: 3, ruido: 0 },
    escada: [{ id: 'MLB1', titulo: 'Caneca Inox 500 ml', grupo: 'campeao', vendedores: 4, piso: 39.9, p25: 42, mediana: 45.5, teto: 60, frete_gratis: { fracao: 0.75, base: 4 }, loja_oficial: { fracao: null, base: 0 }, modalidades: { gold_special: 3, gold_pro: 1 }, full: 2 }, { id: 'MLB2', titulo: 'Outra', grupo: 'controle', vendedores: 0, sem_dado: 'o catalogo nao tem vendedor ativo agora (404)' }],
    objecoes: [{ texto: 'Vai na lava louca?', ocorrencias: 3, anuncios: 2, validada: true }, { texto: 'Tem tampa extra?', ocorrencias: 1, anuncios: 1, validada: false }],
    cobertura_perguntas: { anuncios: 20, com_perguntas: 12, perguntas: 140, sem_perguntas: ['MLB5'] },
    anatomia: null,
    anuncios: [{ id: 'MLB1', grupo: 'campeao', titulo: 'Caneca | Inox', preco: 45, vendidos: 5000, tipo: 'catalogo', url: 'https://x', fotos: 9, video: true }],
    ...extra,
  }
}

const TRAVESSAO = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`)

test('o canario do travessao casa', () => {
  assert.ok(TRAVESSAO.test(`a ${String.fromCharCode(0x2014)} b`))
})

test('relatorio de rodada boa: secoes na ordem, achados certos, sem travessao', () => {
  const md = montarRelatorio(resultado())
  assert.ok(md.length > 500)
  assert.doesNotMatch(md, TRAVESSAO)
  assert.doesNotMatch(md, /não permite conclusão/)
  const ordem = ['Escada de preço', 'O que separa campeão', 'O que o anúncio fraco faz', 'Obrigação da categoria', 'Dúvidas de cliente', 'Não fez diferença', 'Testes que não puderam decidir', 'Testes que quebraram', 'Como a amostra foi montada', 'Anexo']
  const posicoes = ordem.map(t => md.indexOf(`## ${t}`))
  assert.ok(posicoes.every(p => p > 0), JSON.stringify(posicoes))
  assert.deepEqual([...posicoes].sort((a, b) => a - b), posicoes)
  assert.match(md, /\*\*video do vendedor no anuncio\*\*: 8 de 10 campeões contra 2 de 10/)
  assert.match(md, /Menor preço R\$ 39,90/)
  assert.match(md, /Sem dado: o catalogo nao tem vendedor ativo agora \(404\)/)
  assert.match(md, /\*\*Repetida\*\*: "Vai na lava louca\?"/)
  assert.ok(md.indexOf('Repetida') < md.indexOf('Avulsa'))
  assert.match(md, /Pedidos 10 anúncios fracos, saíram 7/)
  assert.match(md, /Campeão fora desse número: Caneca 350 ml/)
  assert.match(md, /MLB8 \(pagina: timeout\)/)
  assert.match(md, /## Não fez diferença\n\n- \*\*vendedor com loja propria\*\*/)
  assert.match(md, /\[Caneca \/ Inox\]\(https:\/\/x\)/)
  // teste que quebrou nao aparece como achado
  assert.ok(md.indexOf('capa com mais respiro') > md.indexOf('## Testes que quebraram'))
})

test('rodada inconclusiva abre com a faixa e os motivos, antes de tudo', () => {
  const md = montarRelatorio(resultado({ inconclusivo: true, diagnostico: { motivos: ['so 2 campeoes, e o minimo e 3'], testes: { bloqueados: 4 } } }))
  assert.ok(md.indexOf('não permite conclusão') < md.indexOf('## Escada'))
  assert.match(md, /so 2 campeoes, e o minimo e 3/)
  assert.match(md, /## O que separa campeão de anúncio fraco \(pista, rodada inconclusiva\)/)
})

test('escopo de produto avisa antes da escada', () => {
  const md = montarRelatorio(resultado({ composicao: { campeoes: { catalogo: 7, total: 10 }, escopo: 'produto' } }))
  assert.ok(md.indexOf('estuda o PRODUTO') > 0)
  assert.ok(md.indexOf('estuda o PRODUTO') < md.indexOf('## Escada'))
  assert.match(md, /7 de 10 campeões são página de catálogo/)
})

test('com --ver sai a anatomia das fotos', () => {
  const md = montarRelatorio(resultado({ com_ver: true, anatomia: { posicoes: [{ posicao: 1, papel: 'gancho', de: 8, quantos: 6 }], papeis_que_nenhum_campeao_usa: ['comparativo'] } }))
  assert.match(md, /Foto 1: gancho \(6 de 8\)/)
  assert.match(md, /Ninguém entre os campeões usa: comparativo/)
})

test('recibo curto, com placar, achados e caminhos', () => {
  const t = recibo(resultado(), { relatorio: 'relatorios/x.md', pasta: 'dados/engenharia-reversa/x/' })
  assert.ok(t.split('\n').length <= 8)
  assert.match(t, /placar: 1 regra, 1 anti-padrao, 1 obrigacao, 3 sem diferenca; 1 sem amostra/)
  assert.match(t, /regra: video do vendedor no anuncio \(8\/10 contra 2\/10\)/)
  assert.match(t, /1 repetidas, 1 avulsas/)
  assert.match(t, /relatorios\/x\.md/)
})

test('avulsas: so as 10 primeiras no relatorio, o resto contado; plural de um vendedor', () => {
  const objecoes = [{ texto: 'Repetida mesmo?', ocorrencias: 2, anuncios: 2, validada: true }, ...Array.from({ length: 13 }, (_, i) => ({ texto: `Avulsa numero ${i}?`, ocorrencias: 1, anuncios: 1, validada: false }))]
  const escada = [{ id: 'MLB1', titulo: 'Um so', grupo: 'controle', vendedores: 1, piso: 10, p25: 10, mediana: 10, teto: 10, frete_gratis: { fracao: 0, base: 1 }, loja_oficial: { fracao: 0, base: 1 }, modalidades: {}, full: 0 }]
  const md = montarRelatorio(resultado({ objecoes, escada, amostra: { busca: 9, campeoes: 1, controle: 1, duplicatas: ['MLB9'], falharam: [] } }))
  assert.equal((md.match(/^- Avulsa:/gm) || []).length, 10)
  assert.match(md, /Mais 3 dúvidas avulsas ficaram no `resultado.json`/)
  assert.match(md, /Repetida mesmo/)
  assert.match(md, /- 1 vendedor disputando/)
  assert.match(md, /1 anúncio patrocinado era vendedor de um catálogo/)
})

// Regressao da revisao final de 2026-10-04: rodada de PRODUTO nao pode vender achado como lição de anúncio.
test('escopo de produto: as secoes de achado e o recibo avisam que e diferenca de produto', () => {
  const r = resultado({ composicao: { campeoes: { catalogo: 8, total: 10 }, escopo: 'produto' } })
  const md = montarRelatorio(r)
  assert.match(md, /## O que separa campeão de anúncio fraco \(diferença de PRODUTO, não ensina anúncio\)/)
  assert.match(md, /## Obrigação da categoria \(diferença de PRODUTO, não ensina anúncio\)/)
  const t = recibo(r, { relatorio: 'x.md', pasta: 'p/' })
  assert.match(t, /regra \(produto, nao ensina anuncio\): video do vendedor/)
  assert.doesNotMatch(montarRelatorio(resultado()), /diferença de PRODUTO/)
})

test('bloqueio sem ficha vira frase de gente', () => {
  const r = resultado({ padroes: [{ nome: 'rosto humano em alguma foto', veredito: 'ruido', bloqueio: 'sem-ficha', erros_no_teste: 0, campeoes_fazendo: 2, campeoes_total: 2, controle_fazendo: 0, controle_total: 0 }] })
  assert.match(montarRelatorio(r), /Motivo: o Gemini não leu as fotos de anúncios suficientes/)
})
