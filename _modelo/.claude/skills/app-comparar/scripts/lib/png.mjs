// Leitura e gravacao de PNG sem pacote nenhum, so com o node:zlib.
// Le cinza e RGB (com a cor transparente do tRNS), paleta (com transparencia por indice), cinza com alfa e RGBA, de 1 a 16 bits,
// com os 5 filtros do PNG. Imagem entrelacada e recusada com mensagem. A transparencia e
// pintada sobre branco, do jeito que uma pagina aparece no print.
// A imagem lida vira { largura, altura, rgb }, com rgb um Uint8Array de largura x altura x 3
// (vermelho, verde e azul de cada pixel, linha por linha).
import { readFileSync, writeFileSync } from 'node:fs'
import zlib from 'node:zlib'

export const ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export class ErroPng extends Error {}

const CANAIS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

export function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

// Desfaz o filtro de cada linha. O Uint8Array ja corta em 0 a 255 na gravacao (resto da
// divisao por 256), que e a conta que o PNG pede.
function desfiltrar(cru, altura, passo, bpp) {
  const linhas = []
  let ant = new Uint8Array(passo)
  let pos = 0
  for (let y = 0; y < altura; y++) {
    if (pos + 1 + passo > cru.length) throw new ErroPng('os dados da imagem estao cortados (arquivo incompleto): tire o print de novo')
    const f = cru[pos]
    const l = Uint8Array.from(cru.subarray(pos + 1, pos + 1 + passo))
    pos += 1 + passo
    if (f === 1) {
      for (let i = bpp; i < passo; i++) l[i] = l[i] + l[i - bpp]
    } else if (f === 2) {
      for (let i = 0; i < passo; i++) l[i] = l[i] + ant[i]
    } else if (f === 3) {
      for (let i = 0; i < passo; i++) {
        const esq = i >= bpp ? l[i - bpp] : 0
        l[i] = l[i] + ((esq + ant[i]) >> 1)
      }
    } else if (f === 4) {
      for (let i = 0; i < passo; i++) {
        const esq = i >= bpp ? l[i - bpp] : 0
        const cimaEsq = i >= bpp ? ant[i - bpp] : 0
        l[i] = l[i] + paeth(esq, ant[i], cimaEsq)
      }
    } else if (f !== 0) {
      throw new ErroPng(`filtro de PNG desconhecido (${f}): o arquivo pode estar corrompido`)
    }
    linhas.push(l)
    ant = l
  }
  return linhas
}

// Abre uma linha ja desfiltrada em amostras de 8 bits. Em 16 bits fica o byte alto; abaixo
// de 8 bits sai o valor cru (o cinza e escalado depois, a paleta usa como indice).
function amostras(linha, largura, canais, prof) {
  const n = largura * canais
  if (prof === 8) return linha.subarray(0, n)
  const out = new Uint8Array(n)
  if (prof === 16) {
    for (let i = 0; i < n; i++) out[i] = linha[2 * i]
    return out
  }
  const porByte = 8 / prof
  const mascara = (1 << prof) - 1
  let k = 0
  for (let b = 0; b < linha.length && k < n; b++) {
    for (let j = 0; j < porByte && k < n; j++) out[k++] = (linha[b] >> (8 - prof * (j + 1))) & mascara
  }
  return out
}

function sobreBranco(rgb, o, r, g, b, a) {
  const inv = 255 - a
  rgb[o] = a === 255 ? r : Math.floor((r * a + 255 * inv) / 255)
  rgb[o + 1] = a === 255 ? g : Math.floor((g * a + 255 * inv) / 255)
  rgb[o + 2] = a === 255 ? b : Math.floor((b * a + 255 * inv) / 255)
}

export function decodificarPng(dados, nome = 'a imagem') {
  if (dados.length < 8 || !dados.subarray(0, 8).equals(ASSINATURA)) {
    throw new ErroPng(`${nome} nao e PNG: tire o print de novo salvando em PNG`)
  }
  let pos = 8
  let ihdr = null
  let plte = null
  let trns = null
  const idat = []
  while (pos + 8 <= dados.length) {
    const tam = dados.readUInt32BE(pos)
    const tipo = dados.toString('latin1', pos + 4, pos + 8)
    const corpo = dados.subarray(pos + 8, pos + 8 + tam)
    pos += 12 + tam
    if (tipo === 'IHDR') ihdr = corpo
    else if (tipo === 'PLTE') plte = corpo
    else if (tipo === 'tRNS') trns = corpo
    else if (tipo === 'IDAT') idat.push(corpo)
    else if (tipo === 'IEND') break
  }
  if (!ihdr || ihdr.length < 13) throw new ErroPng(`${nome} esta sem o cabecalho do PNG (IHDR): o arquivo pode estar corrompido`)
  const largura = ihdr.readUInt32BE(0)
  const altura = ihdr.readUInt32BE(4)
  const prof = ihdr[8]
  const cor = ihdr[9]
  if (ihdr[12]) {
    throw new ErroPng(`${nome} e um PNG entrelacado, que este script nao le. Abra a imagem num editor e salve de novo como PNG sem entrelacamento, ou tire o print de novo`)
  }
  const canais = CANAIS[cor]
  if (canais === undefined) throw new ErroPng(`tipo de cor de PNG nao suportado (${cor})`)
  if (![1, 2, 4, 8, 16].includes(prof)) throw new ErroPng(`profundidade de bits nao suportada (${prof})`)
  if (cor === 3 && !plte) throw new ErroPng(`${nome} e PNG de paleta sem a paleta: o arquivo pode estar corrompido`)
  const bits = prof * canais
  const bpp = Math.max(1, Math.floor(bits / 8))
  const passo = Math.ceil((largura * bits) / 8)
  let cru
  try {
    cru = zlib.inflateSync(Buffer.concat(idat))
  } catch {
    throw new ErroPng(`${nome} esta com os dados corrompidos: tire o print de novo`)
  }
  const linhas = desfiltrar(cru, altura, passo, bpp)

  const escala = prof < 8 ? Math.floor(255 / ((1 << prof) - 1)) : 1
  const alfaPal = cor === 3 && trns && trns.length ? trns : null
  const nPal = plte ? Math.floor(plte.length / 3) : 0
  // Em cinza e RGB o tRNS traz uma cor so (2 bytes por canal): o pixel exatamente daquela cor,
  // na profundidade original, e transparente e vira branco.
  let chave = null
  if (cor === 0 && trns && trns.length >= 2) chave = [trns.readUInt16BE(0)]
  else if (cor === 2 && trns && trns.length >= 6) chave = [trns.readUInt16BE(0), trns.readUInt16BE(2), trns.readUInt16BE(4)]
  const rgb = new Uint8Array(largura * altura * 3)
  let o = 0
  for (const linha of linhas) {
    const s = amostras(linha, largura, canais, prof)
    const original = (i) => (prof === 16 ? (linha[2 * i] << 8) | linha[2 * i + 1] : s[i])
    if (cor === 0) {
      for (let i = 0; i < s.length; i++, o += 3) rgb.fill(chave && original(i) === chave[0] ? 255 : s[i] * escala, o, o + 3)
    } else if (cor === 2 && chave) {
      for (let i = 0; i < s.length; i += 3, o += 3) {
        const transparente = original(i) === chave[0] && original(i + 1) === chave[1] && original(i + 2) === chave[2]
        if (transparente) rgb.fill(255, o, o + 3)
        else rgb.set(s.subarray(i, i + 3), o)
      }
    } else if (cor === 2) {
      rgb.set(s, o)
      o += s.length
    } else if (cor === 3) {
      for (let i = 0; i < s.length; i++, o += 3) {
        const idx = s[i]
        const [r, g, b] = idx < nPal ? [plte[3 * idx], plte[3 * idx + 1], plte[3 * idx + 2]] : [0, 0, 0]
        const a = alfaPal && idx < alfaPal.length ? alfaPal[idx] : 255
        sobreBranco(rgb, o, r, g, b, a)
      }
    } else if (cor === 4) {
      for (let i = 0; i < s.length; i += 2, o += 3) sobreBranco(rgb, o, s[i], s[i], s[i], s[i + 1])
    } else {
      for (let i = 0; i < s.length; i += 4, o += 3) sobreBranco(rgb, o, s[i], s[i + 1], s[i + 2], s[i + 3])
    }
  }
  return { largura, altura, rgb }
}

export function lerPng(caminho) {
  let dados
  try {
    dados = readFileSync(caminho)
  } catch {
    throw new ErroPng(`nao achei o arquivo ${caminho}: confira o caminho a partir da raiz do projeto`)
  }
  return decodificarPng(dados, caminho)
}

// CRC-32 do PNG (o mesmo do zip), feito aqui porque o Node 20.0 nao traz a funcao pronta.
const TABELA_CRC = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  TABELA_CRC[n] = c >>> 0
}

export function crc32(dados) {
  let c = 0xffffffff
  for (let i = 0; i < dados.length; i++) c = TABELA_CRC[(c ^ dados[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pedaco(tipo, corpo) {
  const cab = Buffer.alloc(8)
  cab.writeUInt32BE(corpo.length, 0)
  cab.write(tipo, 4, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([cab.subarray(4), corpo])), 0)
  return Buffer.concat([cab, corpo, crc])
}

// Grava RGB de 8 bits, filtro 0 em toda linha.
export function codificarPng({ largura, altura, rgb }) {
  const cru = Buffer.alloc(altura * (1 + largura * 3))
  for (let y = 0; y < altura; y++) {
    const base = y * (1 + largura * 3)
    cru[base] = 0
    cru.set(rgb.subarray(y * largura * 3, (y + 1) * largura * 3), base + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(largura, 0)
  ihdr.writeUInt32BE(altura, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    ASSINATURA,
    pedaco('IHDR', ihdr),
    pedaco('IDAT', zlib.deflateSync(cru, { level: 6 })),
    pedaco('IEND', Buffer.alloc(0)),
  ])
}

export function gravarPng(caminho, img) {
  writeFileSync(caminho, codificarPng(img))
}
