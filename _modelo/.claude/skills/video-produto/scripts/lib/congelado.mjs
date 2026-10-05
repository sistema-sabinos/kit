// O ML reprova "imagem estática no vídeo". O ffprobe não enxerga isso porque só
// lê metadado, então quem acusa é o filtro freezedetect do ffmpeg. Aqui a gente
// só lê a saída dele. Rodar o ffmpeg é trabalho do montar.mjs.
export function acharCongelamentos(saidaFfmpeg) {
  const texto = String(saidaFfmpeg ?? '');
  const inicios = [...texto.matchAll(/freeze_start:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const duracoes = [...texto.matchAll(/freeze_duration:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  return inicios.map((inicio, i) => ({ inicio, duracao: duracoes[i] ?? null }));
}
