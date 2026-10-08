// Dobra de acento: "PREÇO" e "preco" viram o mesmo texto pra comparar.
// Troca caractere por caractere (cada unidade da string), entao o texto dobrado tem o
// mesmo tamanho do original e a mesma posicao: casa no dobrado, recorta no original.
// Depois da dobra, a fronteira de palavra do JavaScript volta a funcionar, porque ela
// so enxerga letra sem acento.
const MARCA = new RegExp('[' + String.fromCharCode(92) + 'p{M}]', 'gu')

export function dobrar(s) {
  const t = String(s ?? '')
  let out = ''
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    const d = c.normalize('NFD').replace(MARCA, '').toLowerCase()
    if (d.length === 1) { out += d; continue }
    const m = c.toLowerCase()
    out += m.length === 1 ? m : c
  }
  return out
}

// Deixa o texto literal dentro de um RegExp, inclusive com a flag u (o Node 20 nao tem a
// funcao pronta). Escapa so os caracteres de sintaxe, porque na flag u escapar letra,
// numero ou hifen fora de colchete e erro.
const BARRA = String.fromCharCode(92)
const ESPECIAL = new RegExp('[' + BARRA + '^$.*+?()[' + BARRA + ']{}|/' + BARRA + BARRA + ']', 'g')

export function escapar(s) {
  return String(s ?? '').replace(ESPECIAL, BARRA + '$&')
}
