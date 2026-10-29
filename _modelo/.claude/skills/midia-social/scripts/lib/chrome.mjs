// Casca do Chrome dedicado: a lib mora no nucleo (.claude/skills/conectar/scripts/lib/navegador.mjs)
// e esta casca fica enquanto houver script do pacote importando daqui. Daqui saem so o Playwright
// deste pacote e o nome da skill nas mensagens.
export { FAIXA, SENTINELA, AVISO, perfilDedicado, portaDoProjeto, candidatosDeChrome, acharChrome, argumentosDoChrome, guidDaPorta, portaLivre, esperarPorta, pidDoChrome, conferirPerfil, abrirChrome, sessaoCaiu, relogar, receitaValida, abaDoSite, tentouHaPouco, marcarTentativa, desmarcarTentativa, travarRelogin, expressaoClique, estadoDaUrl, conferirServidor, anotarSessao, pastaDaAnotacao, RELIGAR, JANELA_RELOGIN_MS, MARCA_RELOGIN, TRAVA_RELOGIN, SAIDA, apontarDownload, comandoCdp, desminimizar, fecharChrome, opcoesDeAbrir, processoVivo, FOLGA_SEM_PID_MS } from '../../../conectar/scripts/lib/navegador.mjs'
import { conectar as conectarNucleo } from '../../../conectar/scripts/lib/navegador.mjs'

// O Playwright vem do node_modules desta skill (npm install --prefix .claude/skills/midia-social).
export function conectar(opcoes = {}) { return conectarNucleo({ carregar: () => import('playwright'), skill: 'midia-social', ...opcoes }) }
