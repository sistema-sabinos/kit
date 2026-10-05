// Ferramenta de QA: lê um PNG (RGB/RGBA 8 bits, sem paleta, o que o
// "ffmpeg -pix_fmt rgb24 ... arquivo.png" produz) e acha a caixa delimitadora
// dos pixels que destoam de uma cor de fundo conhecida. Usado pra medir em
// PIXEL onde a legenda cai no quadro (ver montar.test.mjs), não faz parte
// do pipeline de geração de vídeo, é só instrumento de medição/teste.
//
// Existe porque "olhar o frame e achar que tá bom" já deixou passar um erro
// real: um token de 60 caracteres sem espaço deixava só 1px de margem
// direita (0,14%) e isso só apareceu medindo pixel de verdade, não no olho.
import fs from 'node:fs';
import zlib from 'node:zlib';

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// decodificador PNG mínimo: só o que a gente precisa (8 bits, RGB ou RGBA,
// sem interlace). Sem depender de nenhum pacote externo.
export function lerPng(caminho) {
  const buf = fs.readFileSync(caminho);
  let offset = 8; // pula a assinatura PNG
  let width, height, bitDepth, colorType, interlace;
  const idatChunks = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    if (type === 'IHDR') {
      width = buf.readUInt32BE(dataStart);
      height = buf.readUInt32BE(dataStart + 4);
      bitDepth = buf.readUInt8(dataStart + 8);
      colorType = buf.readUInt8(dataStart + 9);
      interlace = buf.readUInt8(dataStart + 12);
    } else if (type === 'IDAT') {
      idatChunks.push(buf.subarray(dataStart, dataStart + length));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataStart + length + 4; // pula os 4 bytes de CRC
  }
  if (bitDepth !== 8) throw new Error(`PNG com bitDepth ${bitDepth}, esse leitor só entende 8`);
  if (interlace) throw new Error('PNG entrelaçado não suportado');
  const canais = { 2: 3, 6: 4 }[colorType];
  if (!canais) throw new Error(`PNG com colorType ${colorType}, só entendo 2 (RGB) ou 6 (RGBA)`);

  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const linhaBytes = width * canais;
  const pixels = Buffer.alloc(height * linhaBytes);
  let pos = 0;
  let anterior = Buffer.alloc(linhaBytes);
  for (let y = 0; y < height; y++) {
    const filtro = raw[pos]; pos += 1;
    const linha = raw.subarray(pos, pos + linhaBytes); pos += linhaBytes;
    const saida = Buffer.alloc(linhaBytes);
    for (let x = 0; x < linhaBytes; x++) {
      const a = x >= canais ? saida[x - canais] : 0;
      const b = anterior[x];
      const c = x >= canais ? anterior[x - canais] : 0;
      let valor = linha[x];
      if (filtro === 1) valor += a;
      else if (filtro === 2) valor += b;
      else if (filtro === 3) valor += Math.floor((a + b) / 2);
      else if (filtro === 4) valor += paeth(a, b, c);
      saida[x] = valor & 0xff;
    }
    saida.copy(pixels, y * linhaBytes);
    anterior = saida;
  }
  return { width, height, canais, pixels };
}

// acha a caixa delimitadora dos pixels que destoam da cor de fundo (soma da
// diferença absoluta dos 3 canais RGB acima da tolerância). Devolve null se
// não achar nenhum pixel destoante (ex: legenda não apareceu).
export function acharCaixaDestoante(png, corFundo, tolerancia = 40) {
  const { width, height, canais, pixels } = png;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * canais;
      const diff = Math.abs(pixels[idx] - corFundo[0])
        + Math.abs(pixels[idx + 1] - corFundo[1])
        + Math.abs(pixels[idx + 2] - corFundo[2]);
      if (diff > tolerancia) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { minX, maxX, minY, maxY, largura: width, altura: height };
}

// margens da caixa em relação às bordas do quadro, em pixel e em porcentagem
export function margensDaCaixa(caixa) {
  const { minX, maxX, minY, maxY, largura, altura } = caixa;
  const esquerda = minX;
  const direita = largura - 1 - maxX;
  const topo = minY;
  const baixo = altura - 1 - maxY;
  return {
    esquerda, direita, topo, baixo,
    esquerdaPct: (esquerda / largura) * 100,
    direitaPct: (direita / largura) * 100,
    topoPct: (topo / altura) * 100,
    baixoPct: (baixo / altura) * 100,
  };
}
