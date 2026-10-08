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

// Caractere invisivel em texto de fora (concorrente, avaliacao, legenda, manchete). Sai:
// largura zero, controle de direcao (bidi), bloco Tag (U+E0000 a U+E007F, texto que a
// pessoa nao ve e o modelo le), seletor de variacao estendido (U+E0100 a U+E01EF, carrega
// 1 byte escondido colado num emoji), controle C0 fora tab, LF e CR, DEL e C1. Fica o
// ZWJ (U+200D, junta emoji composto) e as 3 bandeiras oficiais de subdivisao (Inglaterra,
// Escocia e Pais de Gales), que usam o bloco Tag de verdade. U+FE00 a U+FE0F tambem fica,
// porque tira-lo quebra emoji comum, mesmo podendo esconder dado: limite sabido.
// Tudo montado pela BARRA, sem escape unicode escrito no arquivo (a ferramenta de
// gravacao troca o escape pelo proprio caractere).
const u = h => BARRA + 'u{' + h + '}'
const faixa = (a, b) => u(a) + '-' + u(b)
const emTag = s => [...s].map(c => u((0xe0000 + c.charCodeAt(0)).toString(16))).join('')
const BANDEIRA = u('1F3F4') + '(?:' + ['gbeng', 'gbsct', 'gbwls'].map(emTag).join('|') + ')' + u('E007F')
const TAG = '[' + faixa('E0000', 'E007F') + faixa('E0100', 'E01EF') + ']'
const BIDI = '[' + faixa('202A', '202E') + faixa('2066', '2069') + u('200E') + u('200F') + u('061C') + ']'
const LARGURA_ZERO = u('200B') + u('200C') + faixa('2060', '2064') + u('FEFF')
const CONTROLE = faixa('0', '8') + u('B') + u('C') + faixa('E', '1F') + faixa('7F', '9F')
const INVISIVEL = new RegExp('(' + BANDEIRA + ')|(' + TAG + ')|(' + BIDI + ')|[' + LARGURA_ZERO + CONTROLE + ']', 'gu')

export function limpar(s) {
  return String(s ?? '').replace(INVISIVEL, (_, bandeira) => bandeira || '')
}

// Conta, antes de limpar, o que vira alerta no relatorio: bloco Tag (com o seletor
// estendido) e bidi. Largura zero sozinha e lixo comum de copiar e colar e so sai calada.
export function suspeitos(s) {
  const conta = { tag: 0, bidi: 0 }
  for (const m of String(s ?? '').matchAll(INVISIVEL)) {
    if (m[2]) conta.tag++
    else if (m[3]) conta.bidi++
  }
  return conta
}
