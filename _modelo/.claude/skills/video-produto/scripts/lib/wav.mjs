// O Gemini TTS devolve PCM cru (24kHz, mono, 16 bit). Sem cabeçalho nenhum
// player abre, e o ffmpeg precisa adivinhar. Aqui vira WAV de verdade.
export const RATE = 24000;

export function pcmParaWav(pcm, rate = RATE) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// O Gemini 3.8 TTS já devolve WAV pronto (mimeType audio/wav, bytes começando
// em "RIFF"); os anteriores devolviam PCM cru (audio/L16;rate=24000). Pôr o
// nosso cabeçalho em cima de um WAV deixava DOIS "RIFF" no arquivo, e o
// cabeçalho de dentro virava um estalo no começo da fala. Aqui sai sempre PCM
// cru e a taxa de verdade, lida do cabeçalho recebido quando ele existe.
export function extrairPcm(bytes) {
  if (bytes.length < 12 || bytes.toString('latin1', 0, 4) !== 'RIFF' || bytes.toString('latin1', 8, 12) !== 'WAVE') {
    return { pcm: bytes, rate: RATE };
  }
  let rate = null;
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const id = bytes.toString('latin1', pos, pos + 4);
    const tamanho = bytes.readUInt32LE(pos + 4);
    const inicio = pos + 8;
    if (id === 'fmt ') {
      const canais = bytes.readUInt16LE(inicio + 2);
      const bits = bytes.readUInt16LE(inicio + 14);
      if (canais !== 1 || bits !== 16) throw new Error(`a voz voltou em WAV de ${canais} canal(is) e ${bits} bits; o kit espera mono de 16 bits`);
      rate = bytes.readUInt32LE(inicio + 4);
    } else if (id === 'data') {
      if (!rate) throw new Error('a voz voltou em WAV sem o bloco "fmt " antes do "data"');
      // cabeçalho de streaming às vezes declara tamanho maior que o que veio
      return { pcm: bytes.subarray(inicio, Math.min(inicio + tamanho, bytes.length)), rate };
    }
    pos = inicio + tamanho + (tamanho % 2);
  }
  throw new Error('a voz voltou em WAV sem o bloco "data"');
}

// Quanto silêncio vai no fim de toda narração. Fica aqui porque a montagem
// precisa do MESMO número pra saber quanto do fim da faixa não é fala (ver
// planejarDublagem no montar.mjs): esse pedaço pode ser cortado sem perder
// palavra nenhuma.
export const SILENCIO_FINAL = 0.4;

// O modelo corta a última palavra (medido em 4 de 8 amostras em 08/08).
// Meio segundo de silêncio no fim resolve, e não dá pra resolver por prompt.
export function silencio(segundos, rate = RATE) {
  return Buffer.alloc(Math.round(rate * segundos) * 2);
}
