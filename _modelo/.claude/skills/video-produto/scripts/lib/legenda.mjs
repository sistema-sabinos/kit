// A legenda sai do ROTEIRO, não de transcrição. Assim ela nasce fiel e com
// português correto. Uma entrada por bloco, alinhada com os 8s de cada clipe.
//
// HISTÓRICO DAS DUAS TENTATIVAS QUE FALHARAM (não repetir nenhuma delas):
//
// 1) Quebrar linha contando CARACTERE (teto de 42). Nunca garante largura em
//    PIXEL: glifo estreito e glifo largo têm larguras diferentes, então 42
//    caracteres de "i" e 42 de "W" dão caixas completamente diferentes.
//
// 2) Delegar 100% da quebra ao libass (renderizador de legenda do ffmpeg),
//    entregando a fala inteira numa linha só. Também não cobre: o libass NÃO
//    quebra DENTRO de palavra, em WrapStyle nenhum (0/1/3 são variações de
//    quebra por palavra, 2 desliga a quebra automática). Medido ao vivo: um
//    token de 60 caracteres sem espaço saiu de x=0 a x=719 num quadro de 720,
//    ou seja 0% de margem lateral, atravessando a tela inteira.
//
// O QUE VALE AGORA (as três coisas juntas, nenhuma sozinha resolve):
//   a) o libass continua quebrando o texto normal, porque é ele quem conhece
//      a largura real de cada glifo (e o resultado dele já foi medido certo);
//   b) aqui a gente só ABRE OPORTUNIDADE DE QUEBRA dentro de token comprido
//      demais, pra existir onde quebrar quando não há espaço nenhum;
//   c) quem manda de verdade é a MEDIÇÃO EM PIXEL do montar.mjs
//      (lib/zona-segura.mjs), que mede a caixa da legenda no quadro e aperta
//      corpo/quebra até caber na zona segura do Mercado Clips.
//
// MEDIDO (ffmpeg 8.1.2 / libass, token de 60 caracteres cortado a cada 15):
// quebra de linha de verdade, "\N", U+200B (zero-width space), U+00AD (soft
// hyphen) e hífen comum, TODOS foram honrados como ponto de quebra. Mesmo
// assim a escolha aqui é a QUEBRA DE LINHA DE VERDADE (que o decodificador de
// SRT do ffmpeg converte pro "\N" do ASS), porque é a única determinística: as
// outras são "oportunidade" que o renderizador pode ignorar numa versão
// futura, e a gente precisa de uma alavanca em que dê pra confiar. Hífen ainda
// sujaria o texto com um traço que o roteiro não escreveu.

// token maior que isso ganha quebra. 15 caracteres largos ("a") medem ~473px
// dos ~500px úteis entre as margens laterais no corpo 64, cabe com folga, e
// palavra de português mais comprida que isso é rara em roteiro de anúncio.
export const MAX_TOKEN_PADRAO = 15;

const LIMITE_SEGURANCA = 300; // rede de segurança contra roteiro absurdo/bugado, não é a regra de quebra

function protegerContraTextoAbsurdo(texto) {
  if (texto.length <= LIMITE_SEGURANCA) return texto;
  return `${texto.slice(0, LIMITE_SEGURANCA - 1).trimEnd()}…`;
}

function partirToken(token, maxToken) {
  const chars = [...token]; // por code point: acento e emoji não podem ser cortados no meio
  if (chars.length <= maxToken) return token;
  const pedacos = [];
  for (let i = 0; i < chars.length; i += maxToken) pedacos.push(chars.slice(i, i + maxToken).join(''));
  return pedacos.join('\n');
}

// abre quebra dentro de token comprido demais, sem tocar em nada mais:
// pontuação e a ordem das palavras saem idênticos ao roteiro. O espaço é
// NORMALIZADO (qualquer sequência de espaço/quebra de linha vira um espaço
// só): a fala vem do roteiro e pode trazer linha em branco, tab ou espaço
// duplo, e isso ao virar cue de SRT literalmente parte o bloco em dois (uma
// linha em branco no meio do texto é o mesmo separador que o formato usa
// entre cues), estourando o `lerSrt` com "bloco de SRT sem linha de tempo
// válida". Achado ao vivo, confirmado em legenda.test.mjs.
export function abrirQuebrasEmTokens(texto, maxToken = MAX_TOKEN_PADRAO) {
  return String(texto)
    .trim()
    .split(/\s+/)
    .map((token) => partirToken(token, maxToken))
    .join(' ');
}

// Arredonda o instante inteiro pra milissegundo ANTES de fatiar em h/m/s/ms.
// Arredondar só a fração (o que se fazia antes) emite 4 dígitos quando ela
// chega perto de 1: 7,9996s virava "00:00:07,1000", que nem o lerSrt daqui do
// lado consegue ler. Era inofensivo enquanto a duração do bloco era o inteiro
// 8; com a duração MEDIDA de cada bloco (ver gerarSrtDeDuracoes) morde na
// primeira rodada de verdade.
const carimbo = (s) => {
  const totalMs = Math.round(Math.max(0, Number(s) || 0) * 1000);
  const ms = totalMs % 1000;
  const totalSeg = (totalMs - ms) / 1000;
  const h = String(Math.floor(totalSeg / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeg % 3600) / 60)).padStart(2, '0');
  const seg = String(totalSeg % 60).padStart(2, '0');
  return `${h}:${m}:${seg},${String(ms).padStart(3, '0')}`;
};

function cue(indice, ini, fim, fala, maxToken) {
  const texto = abrirQuebrasEmTokens(protegerContraTextoAbsurdo(fala), maxToken);
  return `${indice}\n${carimbo(ini)} --> ${carimbo(fim)}\n${texto}\n`;
}

// Quantas legendas cada bloco vira (2026-08-14). Era UMA por bloco, com a fala
// inteira de 30 a 34 sílabas na tela de uma vez: no primeiro vídeo de verdade
// isso deu 6 e 7 LINHAS empilhadas, ocupando o meio do quadro e cobrindo o
// produto nos blocos de macro. O gate de zona segura aprovava, e com razão,
// porque ele mede a margem contra os BOTÕES do ML; ele não sabia que a regra do
// ML também diz pra não pôr texto "onde o produto é exibido".
//
// Partir a fala em duas legendas de ~4s corta a altura pela metade sem tirar
// uma palavra do roteiro, e como a legenda é ancorada embaixo (Alignment=2 com
// MarginV=280), menos linha significa texto mais BAIXO no quadro, que é
// exatamente o que se queria. A margem de baixo continua sendo os mesmos 280px
// (21,9%), acima do piso de 20% da zona segura: quem desce é o topo do texto.
// 2026-08-14, segunda passada: 2 legendas por bloco ainda davam 3 linhas
// empilhadas e a referência aprovada pede, que é UMA linha curta,
// discreta, embaixo. Com 3 pedaços a fala de ~33 sílabas cai pra ~11 palavras
// por legenda (~2,7s cada), que no corpo menor da escada fecha em 1 ou 2 linhas.
export const CUES_POR_BLOCO = 3;

const TERMINA_FRASE = /[.!?…]$/;
const TERMINA_PAUSA = /[,;:]$/;

// Escolhe onde cortar perto do ponto ideal, preferindo respeitar a pontuação:
// cortar depois de ponto final é invisível pra quem lê, cortar no meio de
// "não desnaturado" é ruído. Só cai no corte cru quando não há pontuação por
// perto, e nunca corta antes do corte anterior.
function melhorCorte(palavras, ideal, minimo) {
  const cabe = (i) => i > minimo && i < palavras.length;
  const candidatos = [];
  for (let d = 0; d <= 2; d++) {
    for (const i of new Set([ideal - d, ideal + d])) if (cabe(i)) candidatos.push(i);
  }
  const porPontuacao = (re) => candidatos.find((i) => re.test(palavras[i - 1]));
  return porPontuacao(TERMINA_FRASE) ?? porPontuacao(TERMINA_PAUSA) ?? candidatos[0] ?? minimo + 1;
}

// Parte a fala em até `pedacos` trechos equilibrados, sem mexer em palavra
// nenhuma: junta tudo de volta e dá o texto original. Fala curta demais pra
// dividir volta inteira, porque legenda de uma palavra pisca e atrapalha mais
// que ajuda.
export function fatiarFala(fala, pedacos = CUES_POR_BLOCO) {
  const palavras = String(fala ?? '').trim().split(/\s+/).filter(Boolean);
  if (!palavras.length) return [''];
  // cada pedaço precisa de pelo menos 2 palavras
  const n = Math.max(1, Math.min(pedacos, Math.floor(palavras.length / 2)));
  if (n === 1) return [palavras.join(' ')];

  const cortes = [];
  for (let k = 1; k < n; k++) {
    const ideal = Math.round((k * palavras.length) / n);
    cortes.push(melhorCorte(palavras, ideal, cortes.at(-1) ?? 0));
  }
  const limites = [0, ...cortes, palavras.length];
  return limites.slice(0, -1).map((ini, i) => palavras.slice(ini, limites[i + 1]).join(' '));
}

// A legenda tem que sair da duração REAL de cada bloco montado, não de um 8
// presumido. Motivo (CRÍTICO 1 da revisão final de 08/08): a legenda e o vídeo
// combinavam por convenção e ninguém conferia a convenção; bastava um bloco
// medir 7,9s pra tudo que vem depois andar pra frente e a legenda mentir. Regra
// que ficou: quando a fase 3 depende de um número produzido pela fase 2
// (duração, faixas, taxa), ela MEDE, não assume.
export function gerarSrtDeDuracoes(blocos, duracoes, { maxToken = MAX_TOKEN_PADRAO, cuesPorBloco = CUES_POR_BLOCO } = {}) {
  if (!Array.isArray(duracoes) || duracoes.length !== blocos.length) {
    throw new Error(`preciso de uma duracao medida por bloco: vieram ${blocos.length} blocos e ${Array.isArray(duracoes) ? duracoes.length : typeof duracoes} duracoes`);
  }
  let inicio = 0;
  let indice = 0;
  const cues = [];
  blocos.forEach((b, i) => {
    const d = Number(duracoes[i]);
    if (!Number.isFinite(d) || d <= 0) throw new Error(`duracao invalida no bloco ${i + 1}: ${JSON.stringify(duracoes[i])}`);
    const partes = fatiarFala(b.fala, cuesPorBloco);
    // o último pedaço fecha em inicio+d cravado, sem deixar sobra de
    // arredondamento: a legenda do bloco seguinte começa exatamente onde esta
    // termina, que é o que impede a legenda de andar pra frente ao longo do
    // vídeo (o defeito de 08/08, quando ela combinava por convenção).
    partes.forEach((texto, k) => {
      indice += 1;
      const ini = inicio + (k * d) / partes.length;
      const fim = k === partes.length - 1 ? inicio + d : inicio + ((k + 1) * d) / partes.length;
      cues.push(cue(indice, ini, fim, texto, maxToken));
    });
    inicio += d;
  });
  return cues.join('\n');
}

// Atalho pra quando todo bloco dura o mesmo (teste e medição de zona segura).
export function gerarSrt(blocos, segundosPorBloco = 8, { maxToken = MAX_TOKEN_PADRAO } = {}) {
  return gerarSrtDeDuracoes(blocos, blocos.map(() => segundosPorBloco), { maxToken });
}

// lê o SRT de volta pra saber quantas legendas existem e em que instante cada
// uma aparece, é disso que a medição em pixel precisa pra escolher o quadro
// representativo de cada legenda.
export function lerSrt(srt) {
  const partes = String(srt).split(/\r?\n\s*\r?\n/).map((b) => b.trim()).filter(Boolean);
  return partes.map((bloco) => {
    const linhas = bloco.split(/\r?\n/);
    const t = (linhas[1] ?? '').match(/(\d\d):(\d\d):(\d\d),(\d{3})\s*-->\s*(\d\d):(\d\d):(\d\d),(\d{3})/);
    if (!t) throw new Error(`bloco de SRT sem linha de tempo válida: ${JSON.stringify(bloco.slice(0, 60))}`);
    const seg = (h, m, s, ms) => Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000;
    return {
      indice: Number(linhas[0]),
      inicio: seg(t[1], t[2], t[3], t[4]),
      fim: seg(t[5], t[6], t[7], t[8]),
      texto: linhas.slice(2).join('\n'),
    };
  });
}

// reaplica a abertura de quebra com um teto menor, LINHA POR LINHA, sem juntar
// as linhas de volta. É de propósito: não dá pra distinguir com segurança uma
// quebra que a gente inseriu de uma quebra que já veio no SRT, e juntar errado
// grudaria duas palavras. Reaplicar por linha só pode deixar a legenda mais
// estreita, nunca mais larga, que é exatamente o que o aperto precisa.
export function reapertarSrt(srt, maxToken) {
  return lerSrt(srt).map((c) => {
    const texto = c.texto.split(/\r?\n/).map((l) => abrirQuebrasEmTokens(l, maxToken)).join('\n');
    return `${c.indice}\n${carimbo(c.inicio)} --> ${carimbo(c.fim)}\n${texto}\n`;
  }).join('\n');
}
