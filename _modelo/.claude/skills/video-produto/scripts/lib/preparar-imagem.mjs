// Prepara a foto de produto pro Veo. Achado da task 7 (rodada 3): o Veo NÃO
// preenche o canvas 9:16 pedido, ele preserva a proporção da imagem de
// entrada e deixa tarja preta (letterbox) no que sobra. O Mercado Livre
// recusa vídeo com borda no upload, então a imagem precisa já nascer 9:16
// antes de ir pro Veo. Fica em lib/ (não dentro de clipe.mjs) porque é
// utilidade pura de imagem, não fala com nenhuma API, e serve qualquer
// consumidor futuro que precise do mesmo tratamento, seguindo o padrão já
// usado no projeto (wav.mjs, normalizar.mjs, direcao.mjs, cada um com seu
// próprio teste).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lerPng } from './medir-png.mjs';

const run = promisify(execFile);

// Descobre a dimensão real da imagem via ffprobe (sem depender de nenhuma
// lib de imagem nova, só o ffprobe que o projeto já usa pra vídeo).
export async function dimensaoDaImagem(imagemPath) {
  const { stdout } = await run('ffprobe', [
    '-v', 'quiet', '-print_format', 'json', '-show_streams', imagemPath,
  ]);
  const j = JSON.parse(stdout);
  const stream = (j.streams ?? []).find((s) => s.width && s.height);
  if (!stream) throw new Error(`ffprobe não achou stream de imagem em ${imagemPath}`);
  return { largura: stream.width, altura: stream.height };
}

// Menor canvas 9:16 que CONTÉM a imagem original nos dois eixos, sem cortar
// nada. largura = 9k, altura = 16k pra qualquer k inteiro, então a proporção
// sai sempre EXATA (nunca fica "quase" 9:16 por causa de arredondamento).
// k par garante largura par também (16k já é par sempre), que os encoders
// de vídeo/imagem preferem.
function calcularCanvas9x16(largura, altura) {
  let k = Math.ceil(Math.max(largura / 9, altura / 16));
  if ((9 * k) % 2 !== 0) k += 1;
  return { larguraCanvas: 9 * k, alturaCanvas: 16 * k };
}

// Fundo chapado que sobra nas laterais. Mesma ideia do lib/bordas.mjs (que mede
// topo e base num quadro de vídeo), virada 90 graus: uma coluna só conta como
// margem se for uniforme de cima a baixo. É isso que diz quanto dá pra CORTAR
// sem encostar no produto.
//
// A tolerância existe por causa do JPEG: margem branca de foto comprimida não
// é 255 exato, ela treme uns pontos perto da borda do produto. Tolerância
// baixa erra pra menos (corta menos que podia), que é o lado seguro do erro.
const TOLERANCIA_PADRAO = 6;

function colunaChapada(png, x, tolerancia) {
  const { width, height, pixels, canais } = png;
  const o0 = x * canais;
  const [r0, g0, b0] = [pixels[o0], pixels[o0 + 1], pixels[o0 + 2]];
  for (let y = 1; y < height; y++) {
    const o = (y * width + x) * canais;
    if (Math.abs(pixels[o] - r0) > tolerancia
      || Math.abs(pixels[o + 1] - g0) > tolerancia
      || Math.abs(pixels[o + 2] - b0) > tolerancia) return false;
  }
  return true;
}

export async function margensLateraisChapadas(imagemPath, { tolerancia = TOLERANCIA_PADRAO } = {}) {
  // o medir-png só lê PNG, e a foto do produto chega em JPG. Converte pra um
  // PNG temporário fora do repo só pra medir, e apaga em seguida.
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'margem-')), 'medir.png');
  try {
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', imagemPath, '-pix_fmt', 'rgb24', tmp]);
    const png = lerPng(tmp);
    let esquerda = 0;
    while (esquerda < png.width && colunaChapada(png, esquerda, tolerancia)) esquerda++;

    // Imagem inteira uniforme (nenhuma coluna com conteúdo). Não existe produto
    // pra proteger, e medir "margem esquerda = largura inteira, direita = 0"
    // faria o corte sair todo de um lado só. Reparte no meio, que dá corte
    // centralizado. Caso raro na prática, mas é o que as fixtures de cor sólida
    // dos testes antigos são, e sem isto o corte fica torto sem motivo.
    if (esquerda === png.width) {
      const metade = Math.floor(png.width / 2);
      return { esquerda: metade, direita: png.width - metade, largura: png.width, altura: png.height, homogenea: true };
    }

    let direita = 0;
    while (direita < png.width - esquerda && colunaChapada(png, png.width - 1 - direita, tolerancia)) direita++;
    return { esquerda, direita, largura: png.width, altura: png.height, homogenea: false };
  } finally {
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  }
}

// Como repartir o corte entre os dois lados sem invadir o produto: proporcional
// à margem disponível de cada lado, e se um lado não comportar a parte dele, o
// resto vai pro outro. Pura, testável, sem tocar em arquivo.
export function repartirCorte(excesso, esquerdaDisponivel, direitaDisponivel) {
  const total = esquerdaDisponivel + direitaDisponivel;
  if (excesso > total) return null; // não dá pra cortar sem comer o produto
  if (total === 0) return { esquerda: 0, direita: 0 };
  let esquerda = Math.round((excesso * esquerdaDisponivel) / total);
  if (esquerda > esquerdaDisponivel) esquerda = esquerdaDisponivel;
  let direita = excesso - esquerda;
  if (direita > direitaDisponivel) {
    direita = direitaDisponivel;
    esquerda = excesso - direita;
  }
  return { esquerda, direita };
}

function ehExatamente9x16(largura, altura) {
  // comparação por produto cruzado, evita erro de ponto flutuante de divisão
  return altura * 9 === largura * 16;
}

function nomeSaidaPadrao(imagemPath) {
  const ext = path.extname(imagemPath);
  const base = imagemPath.slice(0, -ext.length || undefined);
  return `${base}-9x16${ext}`;
}

// Prepara a imagem pra 9:16. Ordem de preferência, e o motivo dela:
//
//   1. já é 9:16 -> devolve o caminho original, sem criar arquivo
//   2. é mais larga que 9:16 e tem fundo chapado sobrando nas laterais ->
//      CORTA a largura até 9:16, sem tocar no produto
//   3. qualquer outro caso -> PAD branco, o comportamento antigo
//
// O passo 2 entrou em 2026-09-04. O pad resolvia a proporção e criava um
// problema pior: o Veo copia a faixa branca pro vídeo, e o ML recusa vídeo com
// borda no upload. Medido na sonda de um pote, foto 3:4 padada pra 9:16:
// 12,5% de faixa chapada em cima e 12,5% embaixo no clipe gerado. Cortar a
// largura mata a faixa na origem, em vez de deixar pro lib/bordas.mjs remendar
// depois (ele corta e reescala, o que custa resolução).
//
// O corte NUNCA é cego: ele só acontece dentro da margem de fundo chapado que
// a própria imagem já tem, medida coluna a coluna. Foto com o produto encostado
// na lateral cai no pad, igual antes. A regra velha continua valendo, o produto
// não é cortado em hipótese nenhuma.
//
// Sempre escreve num arquivo separado, nunca sobrescreve o original.
export async function prepararImagem9x16(imagemPath, saida) {
  const { largura, altura } = await dimensaoDaImagem(imagemPath);

  if (ehExatamente9x16(largura, altura)) {
    return imagemPath;
  }

  const arquivoSaida = saida ?? nomeSaidaPadrao(imagemPath);

  // Maior retângulo 9:16 EXATO que cabe dentro da imagem: 9k por 16k. Calcular
  // a largura por `altura * 9 / 16` e arredondar parece equivalente e não é:
  // numa foto de 500 de altura isso dava 281, e 281 por 500 dá 0,562 em vez de
  // 0,5625. A proporção tem que fechar no inteiro, senão o Veo volta a achar
  // sobra e a faixa nasce de novo, que é o defeito que este código existe pra
  // matar.
  //
  // Aqui k NÃO é forçado a par, ao contrário do pad logo abaixo. O pad aumenta
  // a imagem, então arredondar pra cima não custa nada; o corte tira pixel de
  // verdade, e descer um k só pra deixar a dimensão par jogaria fora 16 linhas
  // à toa. Dimensão ímpar não incomoda ninguém aqui porque a saída é uma imagem
  // parada indo pra API, não um vídeo pra encoder.
  //
  // O preço do corte é aparar até 15 px de ALTURA quando a altura não é
  // múltipla de 16 (na foto de 4000 px do pote, zero). É corte no fundo da
  // cena, longe demais do produto pra importar.
  const k = Math.floor(altura / 16);
  const larguraAlvo = 9 * k;
  const alturaAlvo = 16 * k;

  if (k > 0 && larguraAlvo < largura) {
    const margens = await margensLateraisChapadas(imagemPath);
    const corte = repartirCorte(largura - larguraAlvo, margens.esquerda, margens.direita);
    if (corte) {
      const topo = Math.floor((altura - alturaAlvo) / 2);
      await run('ffmpeg', [
        '-y', '-loglevel', 'error', '-i', imagemPath,
        '-vf', `crop=${larguraAlvo}:${alturaAlvo}:${corte.esquerda}:${topo}`,
        arquivoSaida,
      ]);
      return arquivoSaida;
    }
  }

  const { larguraCanvas, alturaCanvas } = calcularCanvas9x16(largura, altura);
  await run('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', imagemPath,
    '-vf', `pad=${larguraCanvas}:${alturaCanvas}:(ow-iw)/2:(oh-ih)/2:white`,
    arquivoSaida,
  ]);

  return arquivoSaida;
}
