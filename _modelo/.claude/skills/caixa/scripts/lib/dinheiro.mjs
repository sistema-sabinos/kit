// Dinheiro em centavos inteiros, pra conta de sinal e saldo nunca errar no centavo.
// Aceita "R$ 1.234,56", "1234,56", "1234.56", "1.500" (mil e quinhentos) e "81 mil".

export function centavos(texto) {
  let s = String(texto ?? '').trim().replace(/^R\$\s*/i, '').replace(/\s/g, '')
  if (!s) return null
  let mult = 1
  const mil = /mil$/i.exec(s)
  if (mil) { mult = 1000; s = s.slice(0, -3) }
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if (/\.\d{3}$/.test(s) || (s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '')
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null
  return Math.round(Number(s) * 100) * mult
}

export function reais(c) {
  const neg = c < 0
  const v = Math.abs(c)
  const inteiro = String(Math.floor(v / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${neg ? '-' : ''}R$ ${inteiro},${String(v % 100).padStart(2, '0')}`
}

// Pro CSV: sem "R$" e sem ponto de milhar, que o Excel em portugues le como numero.
export function paraCsv(c) {
  return `${Math.floor(c / 100)},${String(c % 100).padStart(2, '0')}`
}

// Todo "R$ ..." de um texto, na ordem: o trecho como apareceu e o valor em centavos (null quando
// ilegivel, pra quem confere poder avisar em vez de descartar calado). Ponto no fim e o da frase.
export function trechosEmReais(texto) {
  const out = []
  for (const m of String(texto).matchAll(/R\$\s?(\d[\d.]*(?:,\d{1,2})?)(\s?mil\b)?/gi)) {
    const numero = m[1].replace(/\.$/, '')
    out.push({ trecho: 'R$ ' + numero + (m[2] ? ' mil' : ''), centavos: centavos(numero + (m[2] ? 'mil' : '')) })
  }
  return out
}

export function valoresEmReais(texto) {
  return trechosEmReais(texto).map(t => t.centavos).filter(c => c !== null)
}
