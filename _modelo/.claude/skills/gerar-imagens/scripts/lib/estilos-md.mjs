// Le o referencias/estilos.md: de cada "## <Estilo>", as linhas
// "- Cores de partida: #RRGGBB ..." e "- Letras: título <Família> <peso>; texto <Família> <peso>".
// Devolve { Limpo: { cores: [...], titulo: { familia, peso }, texto: { familia, peso } }, ... };
// linha que falta vira cores [] ou titulo/texto null, e quem chama decide.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const CAMINHO_ESTILOS = fileURLToPath(new URL('../../referencias/estilos.md', import.meta.url))

const RX_CORES = /^- Cores de partida:\s*((?:#[0-9A-Fa-f]{6}\s*)+)$/m
const RX_LETRAS = /^- Letras:\s*t[ií]tulo\s+(.+?)\s+(\d{3})\s*;\s*texto\s+(.+?)\s+(\d{3})\s*$/m

export function lerEstilosMd(texto) {
  const estilos = {}
  const partes = String(texto).replace(/\r\n/g, '\n').split(/^## /m).slice(1)
  for (const parte of partes) {
    const nome = parte.split('\n')[0].trim()
    const cores = parte.match(RX_CORES)
    const letras = parte.match(RX_LETRAS)
    estilos[nome] = {
      cores: cores ? cores[1].trim().split(/\s+/).map(c => c.toUpperCase()) : [],
      titulo: letras ? { familia: letras[1], peso: Number(letras[2]) } : null,
      texto: letras ? { familia: letras[3], peso: Number(letras[4]) } : null,
    }
  }
  return estilos
}

export function lerEstilos(caminho = CAMINHO_ESTILOS) {
  return lerEstilosMd(readFileSync(caminho, 'utf8'))
}
