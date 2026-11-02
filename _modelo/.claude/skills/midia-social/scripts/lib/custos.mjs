// Registro de gasto pago do pacote (Gemini ou outro servico pago, sempre opcional).
// Toda chamada paga vira uma linha em dados/custos.jsonl, pelo registrador comum do kit
// (conectar/scripts/lib/orcamento.mjs; contrato em mercado-livre/referencias/contratos.md, secao 8),
// com a area do extrato do orcamento e os tokens de brinde quando houver. Antes do gasto, a
// liberar-gasto-cli.mjs do conectar confere o orcamento do mes e da a reserva; passada aqui com
// --reserva, a linha leva o id e a reserva fecha (uma linha por rodada, gravada depois do gasto).
// Em dolar porque e assim que o Google cobra: reais dependeriam do cambio do dia.
// Uso: node .claude/skills/midia-social/scripts/lib/custos.mjs --servico "gemini (pauta)" --usd 0,03 [--tokens 18000] [--contexto "..."] [--area imagem] [--reserva <id>]
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { RAIZ } from './raiz.mjs'
import { registrarCusto as registrarComum, fecharReserva, AREAS } from '../../../conectar/scripts/lib/orcamento.mjs'

const numero = v => Number(String(v).replace(',', '.'))

export function registrarCusto({ servico, tokens = null, usd, contexto = '', area = 'outros', reserva = null }, { raiz = RAIZ, agora = new Date() } = {}) {
  const custo = numero(usd)
  if (!Number.isFinite(custo)) throw new Error(`usd precisa ser numero, veio "${usd}"`)
  if (!AREAS.includes(area)) throw new Error(`area precisa ser uma de ${AREAS.join(', ')}, veio "${area}"`)
  const linha = { servico, usd: custo, contexto, area, tokens: tokens == null ? null : numero(tokens), reserva }
  let motivo = ''
  if (!registrarComum(linha, { raiz, agora: () => agora, avisar: (m) => { motivo = m } })) throw new Error(motivo || 'a linha nao foi gravada em dados/custos.jsonl; anote a mao')
  // a cobranca ja virou linha: o que a reserva nao gastou volta pro saldo
  const reserva_fechada = reserva ? fecharReserva(reserva, { raiz }) : false
  return { ...linha, reserva_fechada }
}

export function argumentos(v) {
  const a = { servico: null, usd: null, tokens: null, contexto: '' }
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '--servico') a.servico = v[++i]
    else if (v[i] === '--usd') a.usd = numero(v[++i])
    else if (v[i] === '--tokens') a.tokens = numero(v[++i])
    else if (v[i] === '--contexto') a.contexto = v[++i]
    else if (v[i] === '--area') a.area = v[++i]
    else if (v[i] === '--reserva') a.reserva = v[++i]
  }
  if (!a.servico) throw new Error('faltou --servico')
  return a
}

// Compara os caminhos reais: chamado por junção ou link (a ponte .agents/skills), o argv vem
// com o atalho e o import.meta.url já resolvido, e a comparação crua dava falso calado.
function chamadoDireto() {
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]) } catch { return false }
}

const ehCli = chamadoDireto()
if (ehCli) {
  try { console.log('registrado:', JSON.stringify(registrarCusto(argumentos(process.argv.slice(2))))) }
  catch (e) { console.error('ERRO:', e.message); process.exit(1) }
}
