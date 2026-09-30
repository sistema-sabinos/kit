// A regra do gate de marca, sem rede: recebe o que os gates mediram e devolve o veredito.
// Conservadora de proposito: na duvida sai INCONCLUSIVO ou ATENCAO, nunca PODE. As regras
// vao numeradas na ordem, e a primeira que casa decide.
export const SELO = {
  PODE: 'PODE',
  PODE_MENOS: 'PODE MENOS OS VETADOS',
  PODE_NA_MARCA: 'PODE NA MARCA',
  ATENCAO: 'ATENÇÃO',
  NAO: 'NÃO PODE',
  INCONCLUSIVO: 'INCONCLUSIVO',
}

export const CATEGORIAS = ['suplemento', 'alimento', 'cosmetico', 'saneante', 'outra']

// Tipo de produto como a ANVISA escreve no dossie (medido em 2026-09-29). Suplemento leva
// Medicamento junto porque produto vendido como suplemento as vezes e autuado como remedio.
const TIPOS = {
  suplemento: ['Alimento', 'Medicamento'],
  alimento: ['Alimento'],
  cosmetico: ['Cosmético'],
  saneante: ['Saneantes'],
  outra: [],
}

export const BUSCA_MAGRA = 500

const REFAZER = 'rodar de novo mais tarde; enquanto isso, fazer a pesquisa web do /pode-vender'
const OUTRA_MARCA = 'procurar outra marca do mesmo produto'

export function gatesDaCategoria(categoria) {
  if (!CATEGORIAS.includes(categoria)) throw new Error(`categoria "${categoria}" nao existe. Use uma destas: ${CATEGORIAS.join(', ')}`)
  return { ml: true, dossie: categoria !== 'outra', notificacao: categoria === 'suplemento' }
}

export function tiposDaCategoria(categoria) {
  gatesDaCategoria(categoria)
  return TIPOS[categoria]
}

const resultado = (selo, motivos, rota = null, vetados = []) => ({ selo, motivos, rota, vetados })

export function decidir(linha, { categoria, controleOk }) {
  const g = gatesDaCategoria(categoria)
  const { ml, dossie, notificacao } = linha.gates || {}

  // 1. Sem controle bom, nada do que foi medido vale.
  if (!controleOk) {
    return resultado(SELO.INCONCLUSIVO, ['a marca de controle falhou nesta rodada: o problema esta na leitura (pagina mudou ou a ANVISA nao liberou), nao na marca'], 'ler o motivo na linha do controle, resolver e rodar de novo; enquanto isso, fazer a pesquisa web do /pode-vender')
  }
  const faltou = [['Mercado Livre', g.ml, ml], ['dossie da ANVISA', g.dossie, dossie], ['notificacao da ANVISA', g.notificacao, notificacao]]
    .filter(([, roda, v]) => roda && (!v || v.erro))
  if (faltou.length) return resultado(SELO.INCONCLUSIVO, faltou.map(([nome, , v]) => `${nome}: ${v?.erro || 'nao rodou'}`), REFAZER)

  const motivos = []
  const confirmados = g.dossie ? dossie.confirmados : 0

  // 2. Medida que cita a marca inteira. Se a marca segue viva no Mercado Livre, a medida
  // pode ser contra um revendedor (visto no ensaio), e o selo desce pra ATENCAO.
  if (g.dossie && dossie.guardaChuva > 0) {
    const citadas = dossie.dossies.filter(x => x.guardaChuva).map(x => `${x.data}: ${x.produtos.slice(0, 90)} (empresa autuada: ${x.empresa || 'nao informada'})`)
    if (ml.veredito === 'PRESENTE') {
      return resultado(SELO.ATENCAO, ['a ANVISA tem medida que cita a marca inteira, mas a marca segue viva no Mercado Livre: a medida pode ser contra um revendedor', ...citadas], 'abrir o dossie na consulta da ANVISA e conferir se a empresa autuada e o fabricante; se for, nao anunciar')
    }
    return resultado(SELO.NAO, [`a ANVISA tem medida contra a marca inteira (${dossie.guardaChuva} dossie de alcance total)`, ...citadas], OUTRA_MARCA)
  }

  // 3. A marca sumiu do Mercado Livre.
  if (ml.veredito === 'AUSENTE') {
    motivos.push(`nenhum anuncio com a marca no Mercado Livre (a busca devolveu ${ml.totalBusca} resultados, nenhum dela)`)
    if (confirmados > 0) motivos.push(`e ${confirmados} dossie(s) da ANVISA citam a marca`)
    if (ml.totalBusca < BUSCA_MAGRA || confirmados > 0) return resultado(SELO.NAO, motivos, OUTRA_MARCA)
    return resultado(SELO.ATENCAO, motivos, 'abrir a busca no Mercado Livre e conferir se a marca existe no cadastro de produto antes de investir')
  }
  if (ml.veredito === 'RARA') motivos.push(`so ${ml.anunciosComAMarca} anuncio(s) com a marca no Mercado Livre`)

  // 3b. A ANVISA tem mais dossies do que o gate leu: nada de PODE sem conferir.
  if (g.dossie && dossie.incompleto) {
    return resultado(SELO.ATENCAO, [...motivos, `a busca da ANVISA devolveu ${dossie.total} dossies e o gate leu so os primeiros: pode haver medida contra a marca que ficou de fora`], 'abrir a consulta de dossies da ANVISA com o nome da marca e conferir a lista inteira')
  }

  const vetados = g.dossie ? dossie.dossies.filter(x => !x.guardaChuva).map(x => `${x.data}: ${x.produtos.slice(0, 90)}`) : []

  // 4. Suplemento sem notificacao ativa encontrada. A busca da ANVISA por marca e frouxa e
  // paginada, entao nao achar prova pouco: o selo e ATENCAO, e o numero vem do fornecedor.
  if (g.notificacao && notificacao.notificadosAtivos === 0) {
    motivos.push('nenhuma notificacao ativa encontrada na busca da ANVISA pela marca; essa busca e imprecisa, entao isso nao prova que a marca nao tem')
    if (vetados.length) motivos.push(`${vetados.length} produto(s) da marca tem medida da ANVISA`)
    return resultado(SELO.ATENCAO, motivos, 'pedir ao fornecedor o numero de notificacao e conferir na consulta da ANVISA; sem numero, so lote fabricado antes de 01/09/2026, dentro da validade, com nota fiscal que prove', vetados)
  }
  if (g.notificacao) {
    const achados = notificacao.itens.filter(i => i.situacao === 'Ativo' && i.tipo === 'Notificado').slice(0, 5)
      .map(i => `${i.numero} (${String(i.produto).slice(0, 60)}, ${i.detentor || 'detentor nao informado'})`)
    motivos.push(`${notificacao.notificadosAtivos} produto(s) notificado(s) ativo(s) na busca pela marca; confira que sao mesmo da sua marca: ${achados.join('; ')}`)
  }

  // 5. Dossie de produto especifico: a marca passa, aqueles itens nao.
  if (vetados.length) return resultado(SELO.PODE_MENOS, [...motivos, `${vetados.length} produto(s) da marca tem medida da ANVISA e nao entram`], null, vetados)

  // 6. Notificacao ativa.
  if (g.notificacao) return resultado(SELO.PODE, motivos)

  // 7. Categoria sem gate C.
  return resultado(SELO.PODE_NA_MARCA, [...motivos, 'a marca passou; o produto ainda passa pelo resto do /pode-vender'])
}
