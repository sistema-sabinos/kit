// Direção de voz e de cena. Os textos aqui não são chute: saíram de 8 amostras
// geradas e avaliadas. Resumo do que ficou provado:
//   - PT-BR sai nativo, sem sotaque estrangeiro
//   - o defeito recorrente é "cadência de locutor de propaganda"
//   - proibir explicitamente o tom de locutor derruba o defeito
//   - vício de fala escrito no TEXTO é o que mais humaniza
//   - audio tag é roleta: numa amostra deu 9/10, na seguinte foi lida em voz alta (2/10)

// O roteiro pode trazer ator.genero ('feminino' padrão ou 'masculino') e
// ator.sotaque (padrão 'brasileiro neutro'). O padrão vale quando faltam.
const SOTAQUE_PADRAO = 'brasileiro neutro'
function pronome(ator) {
  return ator.genero === 'masculino' ? 'He' : 'She'
}
function sotaqueDe(ator) {
  return ator.sotaque || SOTAQUE_PADRAO
}

function validarAtor(ator) {
  if (!ator) {
    throw new Error('ator é obrigatório, não pode ser undefined ou null');
  }
  if (!ator.quem) {
    throw new Error('ator.quem é obrigatório');
  }
  if (ator.idade === undefined || ator.idade === null) {
    throw new Error('ator.idade é obrigatório');
  }
  if (!ator.cenario) {
    throw new Error('ator.cenario é obrigatório');
  }
}

// A direção vai no campo speech_metadata.style do pedido, NUNCA no texto. Desde
// o Gemini 3.8 TTS o campo text é transcrição literal: no teste pago da 3.13 a
// direção que ia no texto, terminando em "Fale:", foi lida em voz alta inteira.
// Por isso aqui não tem "Fale:" nem nada que só faça sentido antes da fala.
export function direcaoDeVoz(ator) {
  validarAtor(ator);
  return [
    `Voz ${ator.genero === 'masculino' ? 'masculina' : 'feminina'}, português brasileiro, sotaque ${sotaqueDe(ator)}.`,
    `Você NÃO é locutor de propaganda. É ${ator.quem}, ${ator.idade} anos, gravando um áudio de WhatsApp pra uma amiga.`,
    'NÃO projete a voz, não faça entonação de comercial, não suba o tom no fim das frases pra vender.',
    'Fale no volume de quem está em casa. Deixe uma frase atropelar um pouquinho a outra.',
    'Termine a última palavra inteira, sem cortar.',
  ].join(' ');
}

// A tecnica anti cara de IA se divide por tipo de bloco. Pele, piscar e mao fora
// de quadro so fazem sentido com pessoa em cena: no bloco de produto eles
// mandavam o Veo procurar um rosto que a cena nao tem. E cena de mao nao pode
// pedir pra esconder a mao (o prompt se contradiz e o clipe pago sai ruim).
const CAMERA = [
  'shot on a phone camera, handheld with subtle natural shake',
  'natural window light, no studio lighting',
];
const PELE = [
  'realistic skin texture with visible pores and small imperfections, no beauty retouching',
  'micro-movements: blinking, small head shifts, breathing',
];
const MAOS_FORA = 'keep hands out of frame or barely visible';
// "no camera UI" entrou em 01/09/2026: mesmo sem pedir, o Veo desenhou um
// visor de câmera (números de proporção nos cantos e marcas de enquadramento).
const SEM_TEXTO = 'no on-screen text, no subtitles, no captions, no logos, no watermarks, no camera UI overlay, no framing marks or viewfinder guides';

const CENA_DE_MAOS = /\b(m[ãa]os?|hands?)\b/i;

function tecnica(bloco) {
  const partes = [...CAMERA];
  if (bloco.tipo === 'pessoa') {
    partes.push(...PELE);
    if (!CENA_DE_MAOS.test(bloco.cena ?? '')) partes.push(MAOS_FORA);
  }
  partes.push(SEM_TEXTO);
  return partes.join(', ');
}

export function promptDeClipe(bloco, { ator, produto, vozUnica = false }) {
  validarAtor(ator);
  // NUNCA escrever a proporção como TEXTO no prompt (achado de 01/09/2026): o
  // prompt começava com "Vertical 9:16 video." e o Veo entendeu isso como parte
  // da CENA, desenhando um HUD de visor de câmera no clipe, com "9:16" no canto
  // superior esquerdo, "916" no direito e marcas de enquadramento embaixo. A
  // proporção já vai como PARÂMETRO da API (aspectRatio: '9:16' no clipe.mjs),
  // então dizer isso em texto era redundante e só criava risco. Regra geral:
  // parâmetro técnico se manda no campo do parâmetro, nunca na descrição da cena.
  const comum = `Vertical smartphone video. ${bloco.cena}. Product: ${produto}, must look exactly like the reference image. ${tecnica(bloco)}. The image must fill the entire vertical frame edge to edge, no borders, no letterbox, no flat empty margins at the top or bottom.`;

  if (bloco.tipo === 'pessoa') {
    // Com vozUnica, quem fala é a NOSSA narração em cima do clipe. Se o Veo
    // ainda gerar a pessoa FALANDO, o lábio dela vai contra um áudio que não é
    // o dela e o vídeo fica dublado. Medido no primeiro vídeo real: a boca dela
    // começava a mexer 1,4s depois do início da nossa fala em dois blocos, e
    // 3,8s depois no terceiro. Então aqui ela aparece, existe e reage, mas não
    // fala pra câmera.
    if (vozUnica) {
      return [
        comum,
        `Person on camera: ${ator.quem}, ${ator.idade} years old, in ${ator.cenario}.`,
        `${pronome(ator)} does NOT speak and does NOT move ${pronome(ator) === 'He' ? 'his' : 'her'} lips as if talking: mouth closed and relaxed, calm and natural expression.`,
        `${pronome(ator)} is simply present in the scene, with small natural movements, a slight smile and unhurried gestures.`,
        // Áudio se pede pelo POSITIVO. "no voice at all" pede ao gerador de
        // áudio do Veo que não produza nada, e ele devolve a geração inteira
        // vazia com "issue with the audio for your prompt" (medido em
        // 01/09/2026: 8 tentativas seguidas de bloco de pessoa, 0 sucesso, com
        // os blocos de produto passando na mesma rodada). Dar a ele um som
        // concreto pra gerar resolve.
        'Audio: soft natural room tone of the location, no spoken words.',
      ].join(' ');
    }
    return [
      comum,
      `Person on camera: ${ator.quem}, ${ator.idade} years old, in ${ator.cenario}, speaking Brazilian Portuguese (${sotaqueDe(ator)} accent) in a casual home tone, not an advertising voice.`,
      `${pronome(ator)} says: "${bloco.fala}" (no subtitles).`,
      'Ambient sound low under the voice.',
    ].join(' ');
  }

  return [
    comum,
    'Macro shot of the product being used, no person speaking on camera, no face.',
    'Only ambient sound, no dialogue.',
  ].join(' ');
}
