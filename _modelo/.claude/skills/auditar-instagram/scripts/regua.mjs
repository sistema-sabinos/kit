// Regua da auditoria do Instagram: o que entra na conta, quando o token vence e como se escreve o resultado.
// Separada da casca pra ser testada sem rede.
const DIA = 864e5
const GUIA = '.claude/skills/midia-social/referencias/configurar.md'

export function diasParaVencer(venceEm, hoje) {
  if (!venceEm) return null
  return Math.round((new Date(venceEm) - new Date(hoje)) / DIA)
}

export function avisoDoToken(dias) {
  if (dias == null) return 'IG_TOKEN_VENCE_EM nao esta no .env: anotar a data de vencimento do token pra o aviso funcionar'
  if (dias <= 0) throw new Error(`o token do Instagram venceu: gerar outro (secao "Instagram" de ${GUIA})`)
  if (dias <= 7) return `o token do Instagram vence em ${dias} dias: rodar /auditar-instagram --renovar`
  return null
}

export const diasDesde = (timestamp, agora) => Math.floor((agora - new Date(timestamp)) / DIA)
export const entraNaRegua = (post, agora) => agora - new Date(post.timestamp) >= 2 * DIA

export function urlRenovar(token) {
  const u = new URL('https://graph.instagram.com/refresh_access_token')
  u.searchParams.set('grant_type', 'ig_refresh_token')
  u.searchParams.set('access_token', token)
  return u.toString()
}

export function codigoDoLink(link) {
  const m = /instagram\.com\/(?:reel|p)\/([A-Za-z0-9_-]+)/.exec(String(link || ''))
  return m ? m[1] : null
}

export function idInstagramValido(textoPublicacao) {
  const m = /## VALIDO AGORA\r?\n([\s\S]*?)(?=\r?\n## |$)/.exec(String(textoPublicacao))
  const linha = m && /^\|\s*instagram\s*\|\s*([^|\s]+)\s*\|/m.exec(m[1])
  return linha ? linha[1] : null
}

export function secaoResultado({ metricas, prometido, data }) {
  const linha = (rotulo, k) => `| ${rotulo} | ${metricas[k] ?? 'sem dado'} |`
  return [
    `## Resultado (medido em ${data}, 7 dias ou mais depois de postar)`, '',
    `A pauta prometia: ${prometido || 'nao anotado no brief'}`, '',
    '| Metrica | Valor |', '|---|---|',
    linha('Alcance', 'reach'), linha('Salvamentos', 'saved'), linha('Compartilhamentos', 'shares'),
    linha('Visualizacoes', 'views'), linha('Seguidores ganhos', 'follows'), '',
  ].join('\n')
}
