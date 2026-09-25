// Validacao da receita de um robo (robos/<nome>.mjs no projeto). Erro sai em portugues,
// porque quem le e o agente conversando com o aluno.
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab']

export function validarQuando(q) {
  if (!q || !['diario', 'semanal'].includes(q.tipo)) throw new Error('quando.tipo tem que ser "diario" ou "semanal"')
  if (typeof q.hora !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(q.hora)) {
    throw new Error(`quando.hora tem que ser HH:MM (ex.: 08:00), veio ${q.hora}`)
  }
  if (q.tipo === 'semanal' && !DIAS.includes(q.dia)) throw new Error(`quando.dia tem que ser um de ${DIAS.join(', ')}`)
  return q
}

export function validarReceita(r) {
  if (!r || typeof r !== 'object') throw new Error('a receita precisa de "export default { ... }"')
  if (typeof r.nome !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.nome)) {
    throw new Error('nome da receita: so letra minuscula, numero e hifen (ex.: estoque-zerado)')
  }
  validarQuando(r.quando)
  if (!Number.isFinite(r.prazoMinutos) || r.prazoMinutos < 1 || r.prazoMinutos > 120) {
    throw new Error('prazoMinutos tem que ficar entre 1 e 120')
  }
  for (const f of ['conferirAcesso', 'rodar']) {
    if (typeof r[f] !== 'function') throw new Error(`a receita precisa da funcao ${f}`)
  }
  return r
}

export async function carregarReceita(caminho) {
  const mod = await import(pathToFileURL(resolve(caminho)).href)
  return validarReceita(mod.default)
}
