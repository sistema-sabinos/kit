// Zona segura do Mercado Clips, medida em PIXEL.
//
// O ML manda não pôr texto onde ficam os botões de compartilhar e favoritar
// (faixa lateral) nem na tarja de baixo. Isso é requisito em pixel, não em
// caractere: contar caractere não diz largura nenhuma (glifo estreito e largo
// medem diferente) e delegar tudo ao libass também não basta (ele não quebra
// DENTRO de palavra, então um token comprido sem espaço atravessa a tela).
//
// Então aqui a medição é a autoridade final: antes de queimar, a legenda é
// desenhada com EXATAMENTE o mesmo filtro/estilo/resolução que vai pro vídeo,
// a caixa dela é medida em pixel, e se invadir a zona segura o corpo da fonte
// e a quebra apertam e mede de novo. Só depois de esgotar o aperto é que vira
// erro, e erro BARULHENTO, com o número medido. Gate que devolve valor neutro
// quando falha é pior que gate nenhum, porque parece que está funcionando.
//
// Por que medir num quadro preto sintético em vez do quadro já queimado: no
// quadro queimado a legenda fica por cima do vídeo do Veo, e não existe jeito
// confiável de separar o pixel da legenda do pixel do vídeo (o ruído do
// reencode contamina o quadro inteiro). O desenho da legenda não depende do
// que está atrás: mesmo arquivo .srt, mesmo force_style, mesma resolução,
// mesmo libass = mesmo layout, pixel por pixel. Sobre preto, o fundo
// semitransparente da caixa (BorderStyle=3) some e a medição pega o extent do
// TEXTO, que é o que a regra do ML trata.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { lerPng, acharCaixaDestoante, margensDaCaixa } from './medir-png.mjs';
import { lerSrt, reapertarSrt } from './legenda.mjs';

// pelo menos ~15% de margem lateral (onde ficam os botões) e fora dos ~20% de
// baixo. Requisito do Mercado Clips, conferido em referencias/regras-clips-ml.md.
export const ZONA_SEGURA = { lateralPct: 15, baixoPct: 20 };

// escada de aperto: do mais legível pro mais apertado. Cada degrau diminui o
// corpo da fonte E o teto de token (quebra mais agressiva). O reencode local
// custa segundos de CPU e o clipe já foi PAGO ao Veo (~US$ 0,80), então
// apertar é sempre melhor que falhar.
// 2026-08-14: o topo da escada era 64, e no primeiro vídeo real ele cabia na
// zona segura (a medição aprovava) mas dominava o quadro. A referência que o
// aprovada pede uma legenda DISCRETA, uma linha curta embaixo, do tamanho que
// se usa em vídeo de rede social. Corpo 64 em 720px de largura é letra de
// cartaz. A escada começa em 40, que com 3 legendas por bloco fecha em 1 ou 2
// linhas, e continua descendo se a medição pedir.
export const NIVEIS_LEGENDA = [
  { corpo: 40, contorno: 2, maxToken: 15 },
  { corpo: 36, contorno: 2, maxToken: 12 },
  { corpo: 32, contorno: 2, maxToken: 10 },
  { corpo: 28, contorno: 2, maxToken: 8 },
  { corpo: 24, contorno: 1, maxToken: 6 },
];

// ACHADO NO SMOKE (Task 8): o filtro subtitles do ffmpeg, sem cabeçalho de
// resolução no .srt, assume o PlayRes antigo de 384x288 e ESCALA todo valor de
// estilo (FontSize, Outline, MarginV, MarginL/R) pela razão vídeo/288. Num
// clipe de 1280 de altura isso multiplica por ~4,44: MarginV=280 virava
// ~1243px (legenda presa e cortada no topo do quadro). Declarar
// PlayResX/PlayResY do próprio vídeo dentro do force_style (o filtro aceita,
// não é só campo de Style) devolve o mapeamento 1:1 com pixel real, e por
// isso o corpo da fonte aqui é 64 e não 16 (16 só era legível por causa do bug).
//
// MarginV=280 (21,9% de 1280) e MarginL/MarginR=110 (15,3% de 720) são os
// números do brief, mantidos. Eles delimitam a CAIXA; a medição confere o que
// de fato foi desenhado dentro dela.
export function estiloLegenda(largura, altura, nivel) {
  return [
    `PlayResX=${largura}`, `PlayResY=${altura}`,
    // Montserrat Bold, embutida em scripts/fontes (ver DIR_FONTES): 'Montserrat' é o
    // nome de família interno do arquivo Bold, e Bold=1 casa com ele. Se o nome
    // não casar, o libass troca pela fonte do sistema sem avisar.
    'FontName=Montserrat', 'Bold=1', `FontSize=${nivel.corpo}`,
    // Amarelo, não branco (escolha de 2026-08-14): em vídeo de produto quase
    // tudo em cena é claro (peça branca sobre bancada clara, cozinha com luz
    // de janela), e legenda branca sobre fundo claro depende só
    // da caixa escura pra existir. Amarelo destaca sozinho e é a cor que a
    // legenda de vídeo de rede social usa justamente por isso.
    // ASS lê a cor em &HAABBGGRR (não RGB): &H0000FFFF = azul 00, verde FF,
    // vermelho FF = amarelo. Trocar isso por &H00FFFF00 dá CIANO, é a pegadinha.
    'PrimaryColour=&H0000FFFF', 'OutlineColour=&H99000000',
    'BorderStyle=3', `Outline=${nivel.contorno}`, 'Shadow=0',
    'Alignment=2', 'MarginV=280', 'MarginL=110', 'MarginR=110',
    'WrapStyle=0',
  ].join(',');
}

export function caminhoParaFiltro(arquivo) {
  return fs.realpathSync(arquivo).replace(/\\/g, '/').replace(/:/g, '\\:');
}

// Pasta das fontes embutidas (Montserrat, licença OFL). A legenda NUNCA depende
// de fonte instalada no sistema: o aluno pode estar em Windows ou Mac, e cada um
// teria uma fonte de reserva diferente, o que desmancharia a medição em pixel.
export const DIR_FONTES = fileURLToPath(new URL('../fontes', import.meta.url));

// O filtro subtitles inteiro, num lugar só. A medição (renderizarQuadro) e a
// queima (montar.mjs, advertências) chamam esta função, então o que foi medido é
// o que vai pro vídeo, com a mesma fonte, vinda do mesmo fontsdir.
export function filtroSubtitles(srt, estilo) {
  return `subtitles='${caminhoParaFiltro(srt)}':fontsdir='${caminhoParaFiltro(DIR_FONTES)}':force_style='${estilo}'`;
}

// Exportada desde 2026-09-04: a legenda de ADVERTÊNCIA (lib/advertencias.mjs)
// mede do mesmo jeito, com o mesmo filtro e o mesmo estilo que vai pro vídeo.
// Duas implementações do mesmo desenho divergiriam no dia em que uma mudasse.
// `executar` existe só pro teste espiar o comando; o padrão é o spawnSync de verdade.
export function renderizarQuadro({ arquivoSrt, estilo, largura, altura, tempo, saidaPng, executar = spawnSync }) {
  const duracao = (tempo + 1).toFixed(2);
  const r = executar('ffmpeg', ['-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `color=c=black:s=${largura}x${altura}:r=4:d=${duracao}`,
    '-vf', filtroSubtitles(arquivoSrt, estilo),
    '-ss', tempo.toFixed(2), '-frames:v', '1', '-pix_fmt', 'rgb24', saidaPng],
  { encoding: 'utf8', timeout: 120000 });
  if (r.status !== 0 || !fs.existsSync(saidaPng)) {
    throw new Error(`nao consegui renderizar o quadro de medicao da legenda (t=${tempo}s): ${(r.stderr || r.error?.message || 'ffmpeg sem saida').slice(-300)}`);
  }
}

function folga(margens) {
  return Math.min(
    margens.esquerdaPct - ZONA_SEGURA.lateralPct,
    margens.direitaPct - ZONA_SEGURA.lateralPct,
    margens.baixoPct - ZONA_SEGURA.baixoPct,
  );
}

export function resumirMargens(margens) {
  return `esq ${margens.esquerdaPct.toFixed(1)}% dir ${margens.direitaPct.toFixed(1)}% baixo ${margens.baixoPct.toFixed(1)}%`;
}

// mede a caixa de CADA legenda do SRT, no instante do meio dela.
export function medirLegenda({ srt, largura, altura, nivel, trabalho, rotulo = 'medicao' }) {
  fs.mkdirSync(trabalho, { recursive: true });
  const arquivoSrt = path.join(trabalho, `${rotulo}.srt`);
  fs.writeFileSync(arquivoSrt, srt, 'utf8');
  const estilo = estiloLegenda(largura, altura, nivel);

  const cues = lerSrt(srt);
  if (!cues.length) throw new Error('SRT sem nenhuma legenda pra medir: a geracao do roteiro falhou lá atrás');

  const medicoes = cues.map((c, i) => {
    const tempo = c.inicio + (c.fim - c.inicio) / 2;
    const png = path.join(trabalho, `${rotulo}-${i}.png`);
    renderizarQuadro({ arquivoSrt, estilo, largura, altura, tempo, saidaPng: png });
    const caixa = acharCaixaDestoante(lerPng(png), [0, 0, 0], 40);
    // gate que devolve valor neutro quando falha é pior que gate nenhum:
    // legenda que não apareceu no quadro é ERRO, não "margem ótima".
    if (!caixa) throw new Error(`a legenda ${c.indice} nao apareceu no quadro medido (t=${tempo}s): ou nao foi desenhada, ou a medicao esta olhando o lugar errado. Isso e erro, nao "ok"`);
    const margens = margensDaCaixa(caixa);
    const cabe = margens.esquerdaPct >= ZONA_SEGURA.lateralPct
      && margens.direitaPct >= ZONA_SEGURA.lateralPct
      && margens.baixoPct >= ZONA_SEGURA.baixoPct
      && caixa.minY > 0; // encostou no topo = texto cortado
    return { indice: c.indice, tempo, texto: c.texto, caixa, margens, cabe };
  });

  const pior = medicoes.reduce((a, b) => (folga(b.margens) < folga(a.margens) ? b : a));
  // devolve o caminho do .srt que foi de fato medido: quem queima depois tem
  // que queimar ESSE arquivo, não escrever um novo com o mesmo conteúdo (a
  // gravação em disco é feita aqui, não precisa duplicar).
  return { estilo, medicoes, pior, cabe: medicoes.every((m) => m.cabe), arquivoSrt };
}

// desce a escada de aperto até a legenda caber na zona segura. Devolve o SRT e
// o estilo que DEVEM ser usados na queima, usar outro estilo aqui invalidaria
// a medição inteira.
export function ajustarLegendaAteCaber({ srt, largura, altura, trabalho }) {
  const tentativas = [];
  for (const nivel of NIVEIS_LEGENDA) {
    const srtNivel = reapertarSrt(srt, nivel.maxToken);
    const r = medirLegenda({ srt: srtNivel, largura, altura, nivel, trabalho, rotulo: `medicao-corpo${nivel.corpo}` });
    tentativas.push({ nivel, margens: r.pior.margens, cabe: r.cabe });
    if (r.cabe) {
      if (tentativas.length > 1) {
        // eslint-disable-next-line no-console
        console.log(`[montar] legenda apertada ate caber na zona segura: corpo ${nivel.corpo}, quebra de token em ${nivel.maxToken} (${resumirMargens(r.pior.margens)})`);
      }
      // caminhoSrt aponta pro MESMO arquivo que acabou de ser medido e
      // aprovado (r.arquivoSrt): queimar outro arquivo, mesmo com conteudo
      // identico, e uma fresta entre o que foi medido e o que vai pro video.
      return { nivel, srt: srtNivel, estilo: r.estilo, medicoes: r.medicoes, pior: r.pior, tentativas, caminhoSrt: r.arquivoSrt };
    }
  }
  const detalhe = tentativas
    .map((t) => `corpo ${t.nivel.corpo}/token ${t.nivel.maxToken} -> ${resumirMargens(t.margens)}`)
    .join(' | ');
  throw new Error(`legenda invade a zona segura do Mercado Clips mesmo no nivel mais apertado. Exigido: >=${ZONA_SEGURA.lateralPct}% de margem lateral e >=${ZONA_SEGURA.baixoPct}% embaixo. Medido: ${detalhe}`);
}
