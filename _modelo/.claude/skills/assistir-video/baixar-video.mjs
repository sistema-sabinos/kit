/*
 * baixar-video.mjs — baixa o vídeo de uma URL pra um arquivo local.
 *
 * Usado pelo ver-video.mjs quando a URL NÃO é do YouTube (o Gemini só aceita link
 * direto de YouTube; qualquer outra URL ele busca e recebe HTML, dando
 * "Unsupported MIME type: text/html").
 *
 * Rota: yt-dlp (grátis, no PATH) resolve TikTok, Kwai, Facebook, X, Vimeo e afins
 * sozinho. Rede que exige sessão de navegador logada (ex: Instagram sem cookie,
 * que devolve "empty media response") não baixa por aqui: é um recurso avançado
 * (automação de navegador dedicado, ver docs/roadmap-avancado.md) e não está
 * incluído neste template. Enquanto isso não estiver montado, o caminho é o
 * usuário baixar o vídeo manualmente e passar o arquivo local pro ver-video.mjs.
 *
 * Exporta: baixarVideo(url, destinoSemExtensao) -> caminho do .mp4
 */
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';

function temNoPath(bin) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8' });
  return r.status === 0;
}

export function ehYoutube(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    return h === 'youtube.com' || h === 'm.youtube.com' || h === 'youtu.be' || h === 'youtube-nocookie.com';
  } catch { return false; }
}

function viaYtDlp(url, destino) {
  if (!temNoPath('yt-dlp')) {
    console.error(
      '[baixar] yt-dlp não encontrado no PATH.\n' +
      '  Windows: winget install yt-dlp\n' +
      '  Mac:     brew install yt-dlp'
    );
    return null;
  }
  const saida = `${destino}.%(ext)s`;
  const r = spawnSync('yt-dlp', [
    '--no-warnings', '--no-playlist',
    '-f', 'bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b',
    '--merge-output-format', 'mp4',
    '-o', saida, url,
  ], { encoding: 'utf8', timeout: 300000 });

  const alvo = `${destino}.mp4`;
  if (existsSync(alvo) && statSync(alvo).size > 20000) return alvo;
  const motivo = (r.stderr || r.stdout || '').split('\n').filter(Boolean).slice(-2).join(' | ');
  console.error(`[baixar] yt-dlp não deu conta: ${motivo.slice(0, 220)}`);
  return null;
}

export async function baixarVideo(url, destino) {
  const porYtDlp = viaYtDlp(url, destino);
  if (porYtDlp) {
    console.error(`[baixar] yt-dlp ok (${(statSync(porYtDlp).size / 1e6).toFixed(2)} MB)`);
    return porYtDlp;
  }
  console.error(
    '[baixar] o yt-dlp não conseguiu baixar esse vídeo. Se a rede exige login (comum no\n' +
    'Instagram), essa rota precisa de um navegador dedicado, que é um recurso avançado\n' +
    'ainda não incluído neste template (ver docs/roadmap-avancado.md). Enquanto isso,\n' +
    'baixe o vídeo manualmente e passe o caminho do arquivo pro ver-video.mjs.'
  );
  throw new Error('não consegui baixar o vídeo (yt-dlp falhou e não há navegador dedicado configurado)');
}
