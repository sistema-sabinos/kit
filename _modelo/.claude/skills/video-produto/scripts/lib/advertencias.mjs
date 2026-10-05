// Legenda de ADVERTÊNCIA obrigatória da categoria, queimada no TOPO do quadro.
//
// De onde vem: o Mercado Livre recusa Clips que não trazem as advertências da
// categoria, com o motivo "Não informa as regras de publicidade e marketing
// aplicáveis à categoria do produto". A regra oficial diz:
//
//   "Cumpra as regras de publicidade e marketing aplicadas ao produto. Por
//    exemplo, para a categoria de bebidas alcoólicas, é necessário incluir a
//    legenda: 'Venda proibida a menores de 18 anos'."
//
// O exemplo entrega o formato esperado: LEGENDA NA TELA. Em suplemento
// alimentar as legendas equivalentes são as advertências do art. 14 da RDC
// 243/2018 (o texto está em `referencias/advertencias-categoria.md`).
//
// Detalhe que parece contradição e não é: o ML proíbe "se referir a menores de
// idade", e a advertência de suplemento fala em crianças. O exemplo do próprio
// ML resolve, porque a legenda que ELE exige em bebida cita "menores de 18
// anos". Legenda legal obrigatória não é referência a menor.
//
// Duas decisões de desenho, com o motivo:
//   - vai no TOPO porque o rodapé é zona segura do Clips (botões de
//     compartilhar e favoritar) e já é onde a legenda da narração mora;
//   - o texto é LITERAL e nunca é reescrito nem cortado. É texto de lei: a
//     escada de aperto aqui mexe só no corpo da fonte, jamais nas palavras.
import fs from 'node:fs';
import path from 'node:path';
import { lerPng, acharCaixaDestoante, margensDaCaixa } from './medir-png.mjs';
import { lerSrt } from './legenda.mjs';
import { ZONA_SEGURA, renderizarQuadro } from './zona-segura.mjs';

// Até onde a advertência pode descer, contando do topo. Acima disso ela começa
// a disputar o miolo do quadro com o produto, e o ML proíbe texto em cima do
// produto ("Respeite as zonas seguras").
export const ADVERTENCIA_MAXIMA_PCT = 22;

// TOPO-CENTRO é 6, NÃO 8. Medido no ffmpeg desta máquina em 2026-09-04,
// renderizando quadro e conferindo onde o texto caiu:
//
//   Alignment=2 -> rodapé  (2,3% do fundo)   <- é o da narração
//   Alignment=6 -> TOPO    (2,7% do topo)    <- é o nosso
//   Alignment=8 -> MEIO    (49,3%)           <- o que a doc do ASS chamaria de topo
//
// Ou seja o libass aqui responde pela numeração ANTIGA do SSA (base 1-3 no
// rodapé, +4 sobe pro topo, +8 vai pro meio), e não pela do ASS v4+, onde 8
// seria topo-centro. Com Alignment=8 o MarginV é ignorado de quebra.
//
// Não confiar nesta constante é o ponto: a garantia de verdade é a MEDIÇÃO em
// pixel logo abaixo. Se um ffmpeg futuro trocar o significado do número, a
// advertência cai fora da faixa e o gate REPROVA barulhento, em vez de sair um
// vídeo com o aviso legal no meio da cara da pessoa.
export const ALINHAMENTO_TOPO_CENTRO = 6;

// Escada de aperto: só corpo de fonte. Começa pequena de propósito, porque
// advertência é obrigação legal e não chamada de venda: ela precisa estar
// legível e presente, não gritar mais que a cena.
export const NIVEIS_ADVERTENCIA = [
  { corpo: 26 },
  { corpo: 22 },
  { corpo: 18 },
];

function carimbo(segundos) {
  const ms = Math.round(segundos * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  const mil = String(ms % 1000).padStart(3, '0');
  return `${h}:${m}:${s},${mil}`;
}

// Reparte a duração inteira do vídeo entre as advertências, em fatias iguais e
// coladas uma na outra: em qualquer instante do vídeo há exatamente uma
// advertência na tela. A última fecha no fim exato pra não sobrar um pedaço de
// vídeo sem advertência nenhuma (que é justamente o que derrubou o vídeo).
export function gerarSrtAdvertencias(advertencias, duracaoTotal) {
  const lista = (advertencias ?? []).map((t) => String(t).trim()).filter(Boolean);
  if (!lista.length) return null;
  if (!(duracaoTotal > 0)) throw new Error(`duracaoTotal precisa ser positiva pra repartir as advertências, veio ${duracaoTotal}`);

  const fatia = duracaoTotal / lista.length;
  return lista.map((texto, i) => {
    const inicio = i * fatia;
    const fim = i === lista.length - 1 ? duracaoTotal : (i + 1) * fatia;
    return `${i + 1}\n${carimbo(inicio)} --> ${carimbo(fim)}\n${texto}\n`;
  }).join('\n');
}

export function estiloAdvertencia(largura, altura, nivel) {
  return [
    `PlayResX=${largura}`, `PlayResY=${altura}`,
    // a mesma Montserrat Bold embutida da legenda (ver DIR_FONTES em zona-segura.mjs)
    'FontName=Montserrat', 'Bold=1', `FontSize=${nivel.corpo}`,
    // BRANCO, não o amarelo da narração: são duas camadas de texto diferentes
    // e o espectador tem que separar uma da outra num relance. Caixa escura
    // semitransparente por trás (BorderStyle=3) porque a cena de suplemento é
    // clara quase sempre (bancada, luz de janela) e texto claro sobre fundo
    // claro some.
    'PrimaryColour=&H00FFFFFF', 'OutlineColour=&HA0000000',
    'BorderStyle=3', 'Outline=3', 'Shadow=0',
    // topo-centro (ver o bloco de ALINHAMENTO_TOPO_CENTRO). Assim o MarginV
    // conta a partir do TOPO do quadro.
    `Alignment=${ALINHAMENTO_TOPO_CENTRO}`, 'MarginV=30',
    `MarginL=${Math.round(largura * (ZONA_SEGURA.lateralPct / 100))}`,
    `MarginR=${Math.round(largura * (ZONA_SEGURA.lateralPct / 100))}`,
    'WrapStyle=0',
  ].join(',');
}

function medirNivel({ srt, largura, altura, nivel, trabalho, rotulo }) {
  fs.mkdirSync(trabalho, { recursive: true });
  const arquivoSrt = path.join(trabalho, `${rotulo}.srt`);
  fs.writeFileSync(arquivoSrt, srt, 'utf8');
  const estilo = estiloAdvertencia(largura, altura, nivel);

  const cues = lerSrt(srt);
  const medicoes = cues.map((c, i) => {
    const tempo = c.inicio + (c.fim - c.inicio) / 2;
    const png = path.join(trabalho, `${rotulo}-${i}.png`);
    renderizarQuadro({ arquivoSrt, estilo, largura, altura, tempo, saidaPng: png });
    const caixa = acharCaixaDestoante(lerPng(png), [0, 0, 0], 40);
    // igual ao gate da legenda: advertência que não apareceu no quadro é ERRO,
    // nunca "margem ótima". Aqui pesa mais ainda, porque a ausência dela é
    // exatamente o motivo da recusa que este código existe pra consertar.
    if (!caixa) throw new Error(`a advertência ${c.indice} não apareceu no quadro medido (t=${tempo}s). Isso é erro, não "ok"`);
    const margens = margensDaCaixa(caixa);
    const descidaPct = 100 - margens.baixoPct;
    const cabe = margens.esquerdaPct >= ZONA_SEGURA.lateralPct
      && margens.direitaPct >= ZONA_SEGURA.lateralPct
      && descidaPct <= ADVERTENCIA_MAXIMA_PCT
      && caixa.minY > 0; // encostou no topo = texto cortado
    return { indice: c.indice, tempo, texto: c.texto, caixa, margens, descidaPct, cabe };
  });

  // a pior é a que desce mais: é ela que decide se o nível serve
  const pior = medicoes.reduce((a, b) => (b.descidaPct > a.descidaPct ? b : a));
  return { estilo, medicoes, pior, cabe: medicoes.every((m) => m.cabe), arquivoSrt };
}

// Desce a escada até a advertência caber. Devolve null quando não há
// advertência declarada (papelaria, por exemplo), o que NÃO é erro: é a
// ausência declarada, decidida no roteiro.
export function ajustarAdvertenciasAteCaber({ advertencias, duracaoTotal, largura, altura, trabalho }) {
  const srt = gerarSrtAdvertencias(advertencias, duracaoTotal);
  if (!srt) return null;

  const tentativas = [];
  for (const nivel of NIVEIS_ADVERTENCIA) {
    const r = medirNivel({ srt, largura, altura, nivel, trabalho, rotulo: `advertencia-corpo${nivel.corpo}` });
    tentativas.push({ nivel, descidaPct: r.pior.descidaPct, cabe: r.cabe });
    if (r.cabe) {
      return { nivel, srt, estilo: r.estilo, medicoes: r.medicoes, pior: r.pior, tentativas, caminhoSrt: r.arquivoSrt };
    }
  }
  const detalhe = tentativas
    .map((t) => `corpo ${t.nivel.corpo} -> desceu ${t.descidaPct.toFixed(1)}%`)
    .join(' | ');
  throw new Error(
    `a advertência obrigatória não coube no topo nem no corpo menor. Teto: ${ADVERTENCIA_MAXIMA_PCT}% de descida e `
    + `>=${ZONA_SEGURA.lateralPct}% de margem lateral. Medido: ${detalhe}. `
    + 'O texto da advertência é de lei e NÃO pode ser encurtado: se não coube, é caso de rever a lista no roteiro '
    + '(advertência longa demais junta) ou de aumentar o vídeo, nunca de cortar palavra.',
  );
}
