// Busca do nome real na persona. Cada parte do nome com 4 caracteres ou mais (nome, sobrenome;
// "de" e "da" ficam de fora pra nao acusar palavra comum) e comparada sem acento e sem
// maiuscula, tolerando ate 2 sinais entre as letras ("s.o.u.z.a", "s o u z a"), e so como
// palavra inteira ("souzandia" nao acusa). Mesma ideia do termoEspacado do Gate 1 do kit.
// Nome sem nenhuma parte de 4 letras ("Li Wu") vira uma parte so com as palavras juntas
// ("liwu"), que acha "Li Wu" e "Li-Wu".
// Iniciais so com ponto ("J. S.", "R.B.C."), todas em ordem ou primeiro e ultimo nome, sem as
// particulas: sem ponto, "JS" e "RC" sao palavra comum e acusariam a toa.
export const normalizar = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'y', 'van', 'von', 'der', 'den', 'del', 'della', 'di', 'du', 'la', 'le'])
const palavras = nome => normalizar(nome).split(/[^a-z0-9]+/).filter(Boolean)

export function partesDoNome(nome) {
  const longas = [...new Set(palavras(nome).filter(p => p.length >= 4))]
  if (longas.length) return longas
  const juntas = palavras(nome).filter(p => !PARTICULAS.has(p)).join('')
  return juntas.length >= 4 ? [juntas] : []
}

export function iniciaisDoNome(nome) {
  const ini = palavras(nome).filter(p => !PARTICULAS.has(p)).map(p => p[0])
  if (ini.length < 2) return []
  return [...new Set([ini.join(''), ini[0] + ini[ini.length - 1]])]
}

export function acharNome(texto, nome) {
  const linhas = normalizar(texto).split(/\r?\n/)
  const achados = []
  const buscar = (parte, re) => linhas.forEach((l, i) => {
    for (const m of l.matchAll(re)) achados.push({ parte, linha: i + 1, trecho: m[0] })
  })
  for (const parte of partesDoNome(nome)) {
    buscar(parte, new RegExp('(?<![a-z0-9])' + [...parte].join('[^a-z0-9]{0,2}') + '(?![a-z0-9])', 'g'))
  }
  // nome curto com particula no meio ("Ana de Li"): as palavras juntas ("anali") nao acham o nome
  // escrito com a particula, entao a sequencia inteira tambem se procura
  const todas = palavras(nome)
  if (!todas.some(p => p.length >= 4) && todas.length >= 2 && partesDoNome(nome).length) {
    buscar(partesDoNome(nome)[0], new RegExp('(?<![a-z0-9])' + todas.join('[^a-z0-9]{1,3}') + '(?![a-z0-9])', 'g'))
  }
  for (const seq of iniciaisDoNome(nome)) {
    buscar('iniciais', new RegExp('(?<![a-z0-9])' + [...seq].map(l => l + '\\.').join(' ?') + '(?![a-z0-9])', 'g'))
  }
  return achados
}
