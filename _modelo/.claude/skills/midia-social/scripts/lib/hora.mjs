// Data e hora no relogio do computador do aluno, no formato "AAAA-MM-DD HH:MM".
// O Date#toISOString fala UTC: as 22h30 no Brasil (UTC-3) ele ja diz 01:30 do dia seguinte.
// Mesma ideia do dataLocal() da esteira do Mercado Livre, aqui no pacote de midia social
// porque ele nao depende do pacote do Mercado Livre.
export function dataHoraLocal(d = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
