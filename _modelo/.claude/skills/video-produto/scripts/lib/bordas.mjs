// Faixa chapada no topo e na base do clipe: detectar e tirar.
//
// De onde vem (medido em 2026-08-14, no primeiro vídeo real): o Veo PRESERVA a
// proporção da imagem de referência dentro do canvas 9:16. Como a foto do
// produto era quadrada, o `prepararImagem9x16` completava o resto com BRANCO
// CHAPADO, e o modelo devolveu o vídeo com esse branco intacto: 21,9% de faixa
// em cima e 21,9% embaixo, ou seja só 56% do quadro tinha imagem, em 3 dos 7
// clipes. O ML recusa vídeo com borda ("o vídeo tem que ocupar a tela toda, sem
// bordas"), então isso derrubaria o Clips.
//
// Por que o gate técnico não pegou: ele confere a RESOLUÇÃO (720x1280 = 9:16
// exato) e o arquivo estava certinho em 720x1280. A borda não estava no
// container, estava DENTRO da imagem. Medir a dimensão do arquivo é proxy;
// quem responde pela borda é o pixel. É a mesma lição da legenda (08/08).
//
// O `cropdetect` do ffmpeg não serve aqui: ele procura borda PRETA. Faixa
// branca passa batido por ele, e passou.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { lerPng } from './medir-png.mjs';

// faixa menor que isso é ruído de compressão/vinheta, não borda de verdade
export const MINIMO_PRA_VALER_PCT = 3;

function linhaChapada(png, y, tolerancia) {
  const { width, pixels, canais } = png;
  const o0 = (y * width) * canais;
  const [r0, g0, b0] = [pixels[o0], pixels[o0 + 1], pixels[o0 + 2]];
  // só conta como faixa se a linha for uniforme E clara/escura o bastante pra
  // ser preenchimento, não conteúdo: parede branca de cozinha varia, pad não.
  for (let x = 1; x < width; x++) {
    const o = (y * width + x) * canais;
    if (Math.abs(pixels[o] - r0) > tolerancia
      || Math.abs(pixels[o + 1] - g0) > tolerancia
      || Math.abs(pixels[o + 2] - b0) > tolerancia) return false;
  }
  return true;
}

// Mede, num quadro do vídeo, quantos % do alto e da base são faixa chapada.
export function medirFaixasNoQuadro(arquivoPng, { tolerancia = 6 } = {}) {
  const png = lerPng(arquivoPng);
  const { height } = png;
  let topo = 0;
  while (topo < height && linhaChapada(png, topo, tolerancia)) topo++;
  let base = 0;
  while (base < height - topo && linhaChapada(png, height - 1 - base, tolerancia)) base++;
  return {
    topoPct: (topo / height) * 100,
    basePct: (base / height) * 100,
    topo,
    base,
    altura: height,
    largura: png.width,
  };
}

function extrairQuadro(video, saidaPng, segundo) {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(segundo),
    '-i', video, '-frames:v', '1', '-pix_fmt', 'rgb24', saidaPng], { encoding: 'utf8', timeout: 120000 });
  if (r.status !== 0 || !fs.existsSync(saidaPng)) {
    throw new Error(`nao consegui extrair o quadro de ${video} pra medir borda: ${(r.stderr || r.error?.message || 'ffmpeg sem saida').slice(-300)}`);
  }
}

function duracaoDoVideo(arquivo) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', arquivo], { encoding: 'utf8' });
  const d = Number(String(r.stdout ?? '').trim());
  return Number.isFinite(d) && d > 0 ? d : null;
}

// Mede em DOIS instantes e fica com a MENOR faixa: um quadro só engana quando a
// cena abre ou fecha em branco (transição), e cortar por causa de uma transição
// jogaria imagem boa fora. Faixa de pad de verdade está em todo quadro.
//
// Os instantes são RELATIVOS à duração, não fixos. Com [1s, 5s] chumbado, todo
// clipe menor que 5s tentava extrair quadro depois do fim do arquivo e a medição
// morria com "ffmpeg sem saida", o que derrubou a suíte inteira, cujos fixtures
// são clipes de 1 a 2 segundos.
export function medirFaixasChapadas(video, { trabalho, instantes } = {}) {
  fs.mkdirSync(trabalho, { recursive: true });
  if (!instantes) {
    const d = duracaoDoVideo(video);
    instantes = d ? [d * 0.25, d * 0.6] : [0];
  }
  const medidas = instantes.map((s, i) => {
    const png = path.join(trabalho, `${path.basename(video, '.mp4')}-borda-${i}.png`);
    extrairQuadro(video, png, s);
    return medirFaixasNoQuadro(png);
  });
  return medidas.reduce((a, b) => ({
    ...a,
    topoPct: Math.min(a.topoPct, b.topoPct),
    basePct: Math.min(a.basePct, b.basePct),
    topo: Math.min(a.topo, b.topo),
    base: Math.min(a.base, b.base),
  }));
}

// Acima disso não é borda, é CENA chapada (plano noturno, fundo preto, macro
// estourado de branco). Um pad de imagem quadrada dentro do 9:16 come 21,9% de
// cada lado, ou seja 43,8% no total; nada legítimo passa de 60%.
export const MAXIMO_PLAUSIVEL_PCT = 60;
// O pad é CENTRALIZADO (o prepararImagem9x16 completa em cima e embaixo em
// partes iguais), então as duas faixas nascem quase idênticas. Diferença grande
// entre topo e base é sinal de cena escura de um lado só, não de borda.
export const ASSIMETRIA_MAXIMA_PCT = 6;

// O detector achava "faixa" em qualquer coisa uniforme, e um clipe legitimamente
// preto virava 96% de borda (pego pela própria suíte, no fixture de vídeo preto
// que serve pra medir legenda). Estas três perguntas juntas separam borda de
// cena: tem tamanho pra importar, é plausível como borda, e é simétrica como
// todo preenchimento centralizado.
export function pareceBorda({ topoPct, basePct }) {
  const total = topoPct + basePct;
  if (total < MINIMO_PRA_VALER_PCT) return false;
  if (total > MAXIMO_PLAUSIVEL_PCT) return false;
  return Math.abs(topoPct - basePct) <= ASSIMETRIA_MAXIMA_PCT;
}

// Calcula o recorte que tira as faixas e volta a encher o quadro na proporção
// original. Devolve null quando não há faixa que valha a pena mexer, pra não
// reencodar clipe pago à toa.
export function planoDeCorte({ largura, altura, topo, base }) {
  const sobra = altura - topo - base;
  if (sobra <= 0) return null;
  const perdidoPct = ((topo + base) / altura) * 100;
  if (!pareceBorda({ topoPct: (topo / altura) * 100, basePct: (base / altura) * 100 })) return null;

  // do miolo sem faixa, pega a maior área que mantém a proporção final do vídeo
  const alvoRazao = largura / altura;
  let cortaLargura = Math.min(largura, Math.round(sobra * alvoRazao));
  let cortaAltura = Math.min(sobra, Math.round(cortaLargura / alvoRazao));
  // dimensão ímpar quebra encoder yuv420p
  cortaLargura -= cortaLargura % 2;
  cortaAltura -= cortaAltura % 2;
  const x = Math.max(0, Math.round((largura - cortaLargura) / 2));
  const y = Math.max(0, topo + Math.round((sobra - cortaAltura) / 2));
  return { largura: cortaLargura, altura: cortaAltura, x, y, perdidoPct };
}
