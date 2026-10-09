/*
 * baixar-video.mjs: baixa o vídeo de uma URL pra um arquivo local.
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

// O YouTube pede um motor de JavaScript pro yt-dlp extrair todos os formatos; sem ele sai aviso
// e pode faltar formato. O Node ja esta instalado, mas so versao nova do yt-dlp conhece a opcao:
// versao velha recusaria a chamada inteira, por isso pergunta antes.
export function opcoesJs(ajuda) {
  return /--js-runtimes/.test(ajuda || '') ? ['--js-runtimes', 'node'] : [];
}

// O Gemini olha poucos quadros por segundo e em resolucao baixa: 720p ainda le texto na tela e
// evita baixar centenas de MB a toa (video 4K virava 723 MB).
export const FORMATO = 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/bv*[height<=720]+ba/b[height<=720]/bv*+ba/b';

function viaYtDlp(url, destino) {
  if (!temNoPath('yt-dlp')) {
    console.error(
      '[baixar] yt-dlp não encontrado no PATH.\n' +
      '  Windows: winget install --id yt-dlp.yt-dlp -e --source winget --accept-source-agreements --accept-package-agreements --disable-interactivity\n' +
      '           (depois feche todas as janelas do VS Code e abra de novo)\n' +
      '  Mac:     brew install yt-dlp'
    );
    return { motivo: 'yt-dlp ausente' };
  }
  const saida = `${destino}.%(ext)s`;
  const ajuda = spawnSync('yt-dlp', ['--help'], { encoding: 'utf8' }).stdout;
  const r = spawnSync('yt-dlp', [
    '--no-warnings', '--no-playlist', ...opcoesJs(ajuda),
    '-f', FORMATO,
    '--merge-output-format', 'mp4',
    '-o', saida, url,
  ], { encoding: 'utf8', timeout: 300000 });

  const alvo = `${destino}.mp4`;
  if (existsSync(alvo) && statSync(alvo).size > 20000) return { arquivo: alvo };
  const motivo = (r.stderr || r.stdout || '').split('\n').filter(Boolean).slice(-2).join(' | ');
  console.error(`[baixar] yt-dlp não deu conta: ${motivo.slice(0, 220)}`);
  return { motivo };
}

// 403 e 429 sao o site recusando por excesso de pedido seguido: passa sozinho, e login nao resolve.
export const ehRecusaPorExcesso = motivo => /HTTP Error (403|429)/.test(motivo || '');

export async function baixarVideo(url, destino) {
  const { arquivo, motivo } = viaYtDlp(url, destino);
  if (arquivo) {
    console.error(`[baixar] yt-dlp ok (${(statSync(arquivo).size / 1e6).toFixed(2)} MB)`);
    return arquivo;
  }
  if (ehRecusaPorExcesso(motivo)) {
    console.error('[baixar] o site recusou o download por excesso de pedidos seguidos (erro 403 ou 429). Espere uns minutos e tente de novo.');
    throw new Error('download recusado pelo site, tentar de novo daqui a uns minutos');
  }
  console.error(
    '[baixar] o yt-dlp não conseguiu baixar esse vídeo. Se a rede exige login (comum no\n' +
    'Instagram), essa rota precisa de um navegador dedicado, que é um recurso avançado\n' +
    'ainda não incluído neste template (ver docs/roadmap-avancado.md). Enquanto isso,\n' +
    'baixe o vídeo manualmente e passe o caminho do arquivo pro ver-video.mjs.'
  );
  throw new Error('não consegui baixar o vídeo (yt-dlp falhou e não há navegador dedicado configurado)');
}
