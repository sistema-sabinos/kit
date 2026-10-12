// Frontmatter simples do topo de um .md: uma chave por linha. Lista ([a, b]) vira array; valor
// '>' ou '|' junta as linhas recuadas seguintes com espaco. Sem frontmatter devolve null.
// ORIGEM marca o que a /clonar-especialista criou: so isso ela sobrescreve no ~/.claude.
export const ORIGEM = 'clonar-especialista'

export function lerFrontmatter(texto) {
  const linhas = String(texto ?? '').split(/\r?\n/)
  if (linhas[0] !== '---') return null
  const fim = linhas.indexOf('---', 1)
  if (fim < 0) return null
  const fm = {}
  for (let i = 1; i < fim; i++) {
    const m = /^([A-Za-z_-]+):\s*(.*)$/.exec(linhas[i])
    if (!m) continue
    let v = m[2].trim()
    if (v === '>' || v === '|') {
      const partes = []
      while (i + 1 < fim && /^\s+\S/.test(linhas[i + 1])) partes.push(linhas[++i].trim())
      v = partes.join(' ')
    }
    fm[m[1]] = /^\[.*\]$/.test(v) ? v.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean) : v
  }
  return fm
}

export const ehNossa = texto => lerFrontmatter(texto)?.origem === ORIGEM
