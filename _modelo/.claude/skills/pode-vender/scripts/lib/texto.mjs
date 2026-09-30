// Como o gate compara nome de marca. Mantem o separador como espaco pra exigir palavra
// inteira: comparar tudo colado fez marca curta casar dentro de palavra maior (uma marca de
// 4 letras casando com o nome de uma erva que comeca igual) e virar falso alarme.
const DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g')

export function norm(s) {
  return String(s ?? '').normalize('NFD').replace(DIACRITICOS, '').toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ').trim()
}

export function casaPalavraInteira(texto, chave) {
  const k = norm(chave)
  if (!k) return false
  return ` ${norm(texto)} `.includes(` ${k} `)
}
