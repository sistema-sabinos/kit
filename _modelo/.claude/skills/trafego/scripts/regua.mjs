#!/usr/bin/env node
/**
 * A porta de entrada do /trafego: lê a régua do negócio e o extrato da conta,
 * chama o método e escreve o quadro em JSON e em texto.
 *
 * O texto sai de cálculo, sempre. Nenhum modelo escreve número aqui: sem
 * evidência, não vira frase.
 *
 * Uso:
 *   node regua.mjs --dados dados/trafego/conta-2026-09-18.json --regua _contexto/trafego.md
 *   node regua.mjs --dados ... --regua ... --json      (só o JSON, pra outra ferramenta ler)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quadroDe } from './faixas.mjs';

const NUMERICOS = new Set(['ticket', 'margem_minima', 'cobertura']);

/** Lê o bloco ```regua``` do markdown. O texto em volta é pra pessoa, e se ignora. */
export function lerRegua(texto) {
  const m = String(texto).match(/```regua\s*\n([\s\S]*?)```/);
  if (!m) {
    throw new Error('não achei o bloco `regua` no arquivo.\nO arquivo precisa de um bloco de código marcado como regua, com ticket e objetivo dentro. O modelo está em referencias/regua-exemplo.md.');
  }
  const r = { contas: [] };
  for (const linha of m[1].split('\n')) {
    const par = linha.match(/^\s*([a-z_]+)\s*:\s*(.+?)\s*$/i);
    if (!par) continue;
    const [, chave, valor] = par;
    if (chave === 'contas') r.contas = valor.split(',').map((x) => x.trim()).filter(Boolean);
    else if (NUMERICOS.has(chave)) r[chave] = Number(String(valor).replace(',', '.'));
    else r[chave] = valor;
  }
  if (!(r.ticket > 0)) {
    throw new Error('a régua está sem `ticket`.\nSem saber quanto vale um resultado não existe corte: o ticket é a régua de tudo. Rode /trafego e responda a entrevista.');
  }
  r.objetivo = r.objetivo ?? 'compra';
  r.perfil = r.perfil ?? 'low_ticket';
  r.margem_minima = r.margem_minima ?? 0;
  r.origem_do_resultado = r.origem_do_resultado ?? 'meta';
  return r;
}

/**
 * A trava 6 da spec: a régua só olha conta declarada. A conta vem no topo do
 * extrato, num campo só, e é ela que se compara com a linha `contas`.
 *
 * Conta de fora recusa, porque julgar a conta de um negócio com a régua de
 * outro erra o ticket, o piso e o corte de uma vez, e responder errado é pior
 * que não responder. Lista vazia na régua segue com aviso, senão quem ainda não
 * preencheu o campo fica travado sem motivo. Extrato sem o campo `conta`
 * também segue com aviso: sem os dois lados não existe comparação pra fazer.
 */
export function conferirConta(entrada, regua) {
  const declaradas = (regua.contas ?? []).map((x) => String(x).trim()).filter(Boolean);
  const doExtrato = String(entrada?.conta ?? '').trim();
  if (!declaradas.length) {
    return { ok: true, conferida: false, aviso: 'a régua está sem a linha `contas` preenchida, então a conta do extrato não foi conferida. Preencha `contas` em _contexto/trafego.md pra travar a régua nas contas deste negócio.' };
  }
  if (!doExtrato) {
    return { ok: true, conferida: false, aviso: 'o extrato está sem o campo `conta` no topo, então não deu pra conferir se ele é deste negócio. Acrescente `"conta": "<id>"` no JSON do extrato.' };
  }
  if (!declaradas.includes(doExtrato)) {
    return { ok: false, conferida: true, erro: `o extrato é da conta ${doExtrato}, e a régua declara ${declaradas.join(', ')}.\nA régua de um negócio erra o ticket, o piso e o corte quando aplicada na conta de outro, então nada foi julgado aqui.\nConfira o arquivo do extrato, ou acrescente esta conta na linha \`contas\` de _contexto/trafego.md se ela for deste negócio.` };
  }
  return { ok: true, conferida: true, aviso: null };
}

const brl = (n) => `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;
const ORDEM = ['CRITICO', 'AVISO', 'PASSE', 'RONDA'];

/** O quadro em texto, pronto pra skill ler em voz alta. */
export function textoDoQuadro(resultado, regua) {
  const linhas = [];
  for (const a of resultado.alertas) linhas.push(`AVISO: ${a}`, '');

  const gasto = resultado.quadro.reduce((s, x) => s + x.gasto, 0);
  const res = resultado.quadro.reduce((s, x) => s + x.resultados, 0);
  linhas.push(`Quadro de ${resultado.quadro.length} anúncio(s): ${brl(gasto)} em jogo, ${res} resultado(s).`);
  linhas.push(`Ticket ${brl(regua.ticket)} · corta abaixo de ${resultado.empate.piso.toFixed(2)} · aprova acima de ${resultado.empate.aprova.toFixed(2)}${resultado.empate.origem === 'meta' ? ' (estimado: o resultado vem da própria plataforma)' : ''}`);
  linhas.push('');

  for (const faixa of ORDEM) {
    const nesta = resultado.quadro.filter((x) => x.faixa === faixa);
    if (!nesta.length) continue;
    linhas.push(`${faixa} (${nesta.length})`);
    for (const x of nesta) linhas.push(`  ${x.nome}: ${x.motivo}`);
    linhas.push('');
  }

  const cortes = resultado.quadro.filter((x) => x.faixa === 'CRITICO');
  if (resultado.teto_batido) {
    linhas.push('Nenhuma ação proposta nesta rodada: confira o ticket primeiro.');
  } else if (cortes.length) {
    linhas.push(`Proposta: pausar ${cortes.length} anúncio(s) acima. Nada acontece na conta sem o seu "pode ir".`);
  } else if (resultado.cego_por_orcamento) {
    // A frase de tranquilidade some quando a regra que corta está desligada:
    // ela passaria uma segurança que o dado não sustenta.
    linhas.push('A régua está sem o orçamento da campanha e não julgou retorno nesta rodada. Nenhum corte foi proposto, e isso cobre só o que ela conseguiu enxergar: confira a lista de RONDA acima com os próprios olhos.');
  } else {
    linhas.push('Nada a cortar nesta rodada.');
  }
  return linhas.join('\n').trim();
}

function arg(nome) {
  const i = process.argv.indexOf(`--${nome}`);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null;
}

// `fileURLToPath`, nunca `.pathname`: no Windows o pathname volta com barra
// sobrando (`/E:/...`) e a comparação nunca casa. Lição registrada no licoes.md.
const ehCLI = Boolean(process.argv[1]) && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (ehCLI) {
  try {
    const caminhoRegua = arg('regua') ?? '_contexto/trafego.md';
    const caminhoDados = arg('dados');
    if (!caminhoDados) throw new Error('falta --dados com o caminho do extrato da conta em JSON.');
    const regua = lerRegua(readFileSync(caminhoRegua, 'utf8'));
    const entrada = JSON.parse(readFileSync(caminhoDados, 'utf8'));
    const conferencia = conferirConta(entrada, regua);
    if (!conferencia.ok) throw new Error(conferencia.erro);
    const resultado = quadroDe(entrada, regua);
    if (conferencia.aviso) resultado.alertas.unshift(conferencia.aviso);
    console.log(process.argv.includes('--json')
      ? JSON.stringify(resultado, null, 2)
      : textoDoQuadro(resultado, regua));
  } catch (e) {
    console.error(`\n${e.message}\n`);
    process.exit(1);
  }
}
