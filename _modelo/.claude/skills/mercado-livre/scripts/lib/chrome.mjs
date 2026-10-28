// Casca do Chrome dedicado: a lib mora no nucleo (.claude/skills/conectar/scripts/lib/navegador.mjs)
// e esta casca fica enquanto houver script do pacote importando daqui. Daqui saem so o Playwright
// deste pacote e o nome da skill nas mensagens.
export { FAIXA, SENTINELA, AVISO, perfilDedicado, portaDoProjeto, candidatosDeChrome, acharChrome, argumentosDoChrome, guidDaPorta, portaLivre, esperarPorta, pidDoChrome, conferirPerfil, abrirChrome, sessaoCaiu } from '../../../conectar/scripts/lib/navegador.mjs'
import { conectar as conectarNucleo } from '../../../conectar/scripts/lib/navegador.mjs'

// O Playwright vem do node_modules desta skill (npm install --prefix .claude/skills/mercado-livre).
export function conectar(opcoes = {}) { return conectarNucleo({ carregar: () => import('playwright'), skill: 'mercado-livre', ...opcoes }) }
