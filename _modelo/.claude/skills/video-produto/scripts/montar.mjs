// Emenda os clipes, cola a narração em off nos blocos de produto, queima a
// legenda dentro da zona segura e roda o gate técnico.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { validarTecnico } from './lib/gate.mjs';
import { acharCongelamentos } from './lib/congelado.mjs';
import { ajustarLegendaAteCaber, filtroSubtitles, resumirMargens } from './lib/zona-segura.mjs';
import { gerarSrtDeDuracoes } from './lib/legenda.mjs';
import { ajustarAdvertenciasAteCaber } from './lib/advertencias.mjs';
import { SILENCIO_FINAL } from './lib/wav.mjs';
import { medirFaixasChapadas, planoDeCorte, pareceBorda } from './lib/bordas.mjs';

function rodar(args) {
  const r = spawnSync('ffmpeg', args, { encoding: 'utf8', timeout: 600000 });
  if (r.status !== 0) throw new Error(`ffmpeg falhou: ${(r.stderr || '').slice(-400)}`);
}

export function probe(arquivo) {
  const r = spawnSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', arquivo], { encoding: 'utf8' });
  return JSON.parse(r.stdout);
}

export function duracaoDe(arquivo) {
  const d = Number(probe(arquivo)?.format?.duration);
  if (!Number.isFinite(d) || d <= 0) throw new Error(`nao consegui medir a duracao de ${arquivo} (veio ${d}): sem isso a legenda nao tem como sair alinhada`);
  return Math.round(d * 1000) / 1000;
}

// CRÍTICO 1 da revisão final (08/08): a dublagem usava `-shortest` puro, então
// o bloco passava a durar o MENOR entre vídeo e narração. Medido no ffmpeg
// desta máquina com o comando exato daqui: narração de 6,4s dava bloco de
// 6,400s (o vídeo PAGO encolhia e tudo que vem depois andava pra frente, com a
// legenda mentindo) e narração de 9,4s tinha o áudio cortado em 8,000s (morria
// a última palavra, que é o motivo de existir o silêncio de 0,4s do wav.mjs).
// E a régua da própria skill (30 a 38 sílabas a ~4,3 sílabas/s, mais o
// silêncio) produz de 7,4 a 9,2s, ou seja as duas pontas acontecem na operação
// NORMAL, não em caso raro.
//
// Agora quem manda na duração do bloco é o CLIPE, que é o que foi pago:
//   - narração mais curta: `apad` completa com silêncio e o `-shortest` para no
//     fim do vídeo (com o áudio infinito, o menor passa a ser sempre o vídeo);
//   - narração mais longa: acelera de leve (`atempo`) até a FALA caber, em vez
//     de cortar no meio da palavra. O silêncio do fim não conta como fala, por
//     isso ele é descontado antes de decidir se precisa acelerar.
// Acima do teto de aceleração a voz ficaria ridícula, e aí é erro barulhento
// pedindo pra encurtar a fala, nunca um vídeo entregue com voz de desenho.
export const ACELERACAO_MAXIMA = 1.15;

// Sobra de silêncio no fim do bloco. Mirar na duração cheia do clipe fazia a
// fala terminar colada no último quadro (medido na re-revisão: áudio de 7,979s
// contra vídeo de 8,000s), e é exatamente esse colchão que existe porque o
// modelo de voz come a última palavra. A conta mira um tico antes do fim.
export const COLCHAO_FINAL = 0.15;

// Volume da cama de música por baixo da voz. 12% (~-18 dB) é o que deixa a
// música PRESENTE sem disputar com a narração: acima disso ela começa a comer
// consoante, e o gate de voz (que transcreve o vídeo pronto) passa a reprovar,
// que é o freio automático se alguém subir esse número sem ouvir.
export const VOLUME_MUSICA = 0.12;

export function planejarDublagem(duracaoVideo, duracaoNarracao, { silencioFinal = SILENCIO_FINAL, colchao = COLCHAO_FINAL } = {}) {
  const fala = Math.max(0, duracaoNarracao - silencioFinal);
  const alvo = Math.max(0.01, duracaoVideo - colchao);
  const razao = fala > alvo ? fala / alvo : 1;
  return { razao: Math.round(razao * 10000) / 10000, alvo, cabe: razao <= ACELERACAO_MAXIMA };
}

// ACHADO NA REVISÃO PÓS-TASK-8 (importante 2): emenda com "-c copy" (cópia de
// stream, sem reencodar) exige que todos os blocos tenham os MESMOS
// parâmetros. O Veo pode variar fps entre gerações (o próprio brief avisa
// disso), e o bloco dublado sai com o áudio da narração (24kHz mono, padrão
// do Gemini TTS em lib/wav.mjs), diferente do áudio ambiente do Veo (AAC
// estéreo 48kHz). Testado ao vivo: 24fps + 30fps deu duração de 20,04s em vez
// de 16s, com 2s de congelamento na transição, e nem o validarTecnico (20s
// cai dentro da faixa aceita) nem o freezedetect (quando pega, dá diagnóstico
// ERRADO, "imagem parada", quando a causa real é a emenda corrompida) pegam
// isso de jeito nenhum. Se o travamento fosse menor que 2s, passava batido.
//
// Perfil canônico = o que o Veo entrega quando está tudo certo (ver
// a skill SKILL.md: "720x1280, 8,00s, h264 24fps, com áudio AAC estéreo 48kHz").
// Cada bloco é comparado direto contra esse alvo, não par a par entre si:
// mais simples, determinístico, e garante que todo mundo bate com todo mundo
// no fim (se A e C batem com o canônico, batem entre si por transitividade).
// Bloco que já bate não é tocado (fica no caminho rápido, -c copy). Bloco
// que diverge é reencodado só ele, não falha, porque a essa altura o clipe
// já foi PAGO ao Veo (~US$ 0,80/clipe), e jogar fora por causa de um reencode
// local que custa segundos de CPU seria burrice econômica.
const PERFIL_CANONICO = { largura: 720, altura: 1280, fps: 24, codecAudio: 'aac', sampleRate: 48000, canais: 2 };

function fracaoParaNumero(fracao) {
  const [n, d] = String(fracao ?? '').split('/').map(Number);
  if (!d) return Number.isFinite(n) ? n : null;
  return Math.round((n / d) * 100) / 100; // 2 casas, evita ruído tipo 23.976 vs 24
}

function parametrosDoBloco(arquivo) {
  const p = probe(arquivo);
  const v = (p.streams ?? []).find((s) => s.codec_type === 'video');
  const a = (p.streams ?? []).find((s) => s.codec_type === 'audio');
  return {
    largura: v?.width ?? null,
    altura: v?.height ?? null,
    fps: v ? fracaoParaNumero(v.avg_frame_rate) : null,
    codecAudio: a?.codec_name ?? null,
    sampleRate: a ? Number(a.sample_rate) : null,
    canais: a?.channels ?? null,
  };
}

function bateComCanonico(params) {
  return params.largura === PERFIL_CANONICO.largura
    && params.altura === PERFIL_CANONICO.altura
    && params.fps === PERFIL_CANONICO.fps
    && params.codecAudio === PERFIL_CANONICO.codecAudio
    && params.sampleRate === PERFIL_CANONICO.sampleRate
    && params.canais === PERFIL_CANONICO.canais;
}

function normalizarParaCanonico(entrada, saida) {
  // eslint-disable-next-line no-console
  console.log(`[montar] bloco fora do perfil canônico (${PERFIL_CANONICO.largura}x${PERFIL_CANONICO.altura}, ${PERFIL_CANONICO.fps}fps, aac ${PERFIL_CANONICO.sampleRate}Hz estéreo), reencodando: ${entrada}`);
  rodar(['-y', '-loglevel', 'error', '-i', entrada,
    '-vf', `scale=${PERFIL_CANONICO.largura}:${PERFIL_CANONICO.altura}:force_original_aspect_ratio=decrease,pad=${PERFIL_CANONICO.largura}:${PERFIL_CANONICO.altura}:(ow-iw)/2:(oh-ih)/2,fps=${PERFIL_CANONICO.fps}`,
    '-ar', String(PERFIL_CANONICO.sampleRate), '-ac', String(PERFIL_CANONICO.canais),
    '-c:v', 'libx264', '-c:a', 'aac', saida]);
}

// O ML reprova imagem estática, e quem acusa é o freezedetect do ffmpeg. O
// spawnSync rodava sem conferir status: com o processo falhando (timeout,
// memória, caminho que o ffmpeg recusa), o stderr vinha nulo, o
// acharCongelamentos devolvia [] e o gate dizia "nenhum congelamento, ok". É o
// padrão que este projeto proibiu por escrito, gate que devolve valor neutro
// quando falha é pior que gate nenhum. Falhou o detector, falha alto.
export function detectarCongelamentos(arquivo) {
  const det = spawnSync('ffmpeg', ['-i', arquivo, '-vf', 'freezedetect=n=-60dB:d=2', '-map', '0:v:0', '-f', 'null', '-'], { encoding: 'utf8', timeout: 300000 });
  if (det.status !== 0 || det.error) {
    throw new Error(`o detector de imagem parada (freezedetect) nao rodou em ${arquivo}, entao NAO da pra dizer que o video esta ok: ${(det.stderr || det.error?.message || 'ffmpeg sem saida').slice(-300)}`);
  }
  return acharCongelamentos(det.stderr);
}

export async function montarVideo({ blocos, narracoes, saida, musica = null, advertencias = [], trabalho }) {
  if (typeof trabalho !== 'string' || !trabalho.trim()) {
    throw new Error('trabalho e obrigatorio: passe a pasta temporaria da peca (producao/<slug>/_tmp), pra a montagem nunca escrever fora dela');
  }
  // ACHADO NA REVISÃO PÓS-TASK-8 (importante 3): narracoes[i] vazio é o sinal
  // legítimo de "bloco sem narração, usa som ambiente" para blocos que não
  // são de produto, mas se a geração de narração falhar lá atrás (ver
  // narrar.mjs) e mandar a lista curta ou faltando posição, a montagem
  // seguia calada, sem erro e sem sinal, produzindo vídeo sem voz onde
  // deveria ter. Tamanho da lista tem que bater com o de blocos sempre.
  if (!Array.isArray(narracoes) || narracoes.length !== blocos.length) {
    throw new Error(`narracoes (${Array.isArray(narracoes) ? narracoes.length : typeof narracoes}) tem tamanho diferente de blocos (${blocos.length}): a geração de narração pode ter falhado silenciosamente lá atrás, conferir antes de montar`);
  }
  // CRÍTICO 2 da revisão final: conferir só o TAMANHO da lista não bastava. A
  // fase 3 montava a lista completa com `null` dentro quando a narração falhava
  // depois do clipe já pago, e o bloco de produto entrava MUDO (o prompt de
  // produto pede "no dialogue") com a legenda por cima dizendo o texto que
  // ninguém falou. Bloco marcado como produto sem narração agora é erro.
  blocos.forEach((b, i) => {
    if (b?.tipo === 'produto' && !narracoes[i]) {
      throw new Error(`bloco ${i + 1} é de produto (macro sem rosto, a voz é a NOSSA narração) mas veio sem narração: montar assim entrega o bloco mudo com a legenda mentindo por cima. Gerar a narração que faltou na fase 2 antes de montar`);
    }
    if (typeof b?.fala !== 'string' || !b.fala.trim()) {
      throw new Error(`bloco ${i + 1} sem "fala": a legenda sai do roteiro, então sem o texto não tem o que queimar`);
    }
  });

  fs.mkdirSync(trabalho, { recursive: true });

  // 0.5. tira faixa chapada de dentro do quadro. O Veo devolve o vídeo com o
  // preenchimento da imagem de referência intacto quando ela não era 9:16, e o
  // ML recusa vídeo com borda. O arquivo tem a resolução certa, então só a
  // medição em PIXEL pega isso (ver lib/bordas.mjs). Recorta e volta a encher o
  // quadro em vez de falhar: o clipe já foi PAGO e reencode local é barato.
  const semBorda = blocos.map((b, i) => {
    const faixas = medirFaixasChapadas(b.arquivo, { trabalho });
    const corte = planoDeCorte(faixas);
    if (!corte) return b.arquivo;
    const alvo = `${trabalho}/bloco-${i}-sem-borda.mp4`;
    // eslint-disable-next-line no-console
    console.log(`[montar] bloco ${i + 1}: faixa chapada de ${faixas.topoPct.toFixed(1)}% em cima e ${faixas.basePct.toFixed(1)}% embaixo (o ML recusa vídeo com borda). Recortando e reenchendo o quadro.`);
    rodar(['-y', '-loglevel', 'error', '-i', b.arquivo,
      '-vf', `crop=${corte.largura}:${corte.altura}:${corte.x}:${corte.y},scale=${faixas.largura}:${faixas.altura}:flags=lanczos`,
      '-c:a', 'copy', alvo]);
    return alvo;
  });

  // 1. blocos de produto recebem a narração em off no lugar do áudio ambiente.
  // A duração do bloco continua sendo a do CLIPE (ver planejarDublagem).
  const dublados = blocos.map((_, i) => Boolean(narracoes[i]));
  const prontos = blocos.map((b, i) => {
    if (!dublados[i]) return semBorda[i];
    const alvo = `${trabalho}/bloco-${i}-dub.mp4`;
    const dVideo = duracaoDe(semBorda[i]);
    const dNarracao = duracaoDe(narracoes[i]);
    const plano = planejarDublagem(dVideo, dNarracao);
    if (!plano.cabe) {
      throw new Error(`a narração do bloco ${i + 1} tem ${dNarracao.toFixed(2)}s e o clipe tem ${dVideo.toFixed(2)}s: caber isso exigiria acelerar a voz ${plano.razao.toFixed(2)}x, acima do teto de ${ACELERACAO_MAXIMA}x, e ficaria voz de desenho. Encurtar a fala desse bloco no roteiro (30 a 38 sílabas) e regerar só a narração`);
    }
    if (plano.razao > 1) {
      // eslint-disable-next-line no-console
      console.log(`[montar] narração do bloco ${i + 1} (${dNarracao.toFixed(2)}s) é mais longa que o clipe (${dVideo.toFixed(2)}s): acelerando ${plano.razao.toFixed(2)}x pra fechar em ${plano.alvo.toFixed(2)}s, com ${COLCHAO_FINAL}s de silêncio sobrando no fim`);
    }
    // apad deixa o áudio infinito, então o -shortest passa a parar SEMPRE no
    // fim do vídeo: o clipe pago manda na duração e o silêncio completa o resto.
    const filtro = plano.razao > 1 ? `atempo=${plano.razao},apad` : 'apad';
    rodar(['-y', '-loglevel', 'error', '-i', semBorda[i], '-i', narracoes[i],
      '-c:v', 'copy', '-map', '0:v:0', '-map', '1:a:0', '-af', filtro, '-shortest', alvo]);
    return alvo;
  });

  // 1.5. confere se todos os blocos batem com o perfil canônico antes de
  // emendar. Quem bate segue rápido (-c copy); quem diverge é reencodado só
  // ele, na hora, pra emenda não corromper (ver nota do PERFIL_CANONICO acima).
  const normalizados = prontos.map((p, i) => {
    const params = parametrosDoBloco(p);
    if (bateComCanonico(params)) return p;
    const alvo = `${trabalho}/bloco-${i}-norm.mp4`;
    normalizarParaCanonico(p, alvo);
    return alvo;
  });

  // 1.6. a legenda sai daqui, das durações MEDIDAS de cada bloco pronto, nunca
  // de 8s presumidos (CRÍTICO 1). É medido depois da normalização de propósito:
  // reencodar pode mexer na duração por fração de quadro, e o que vale é o que
  // entra no concat.
  const duracoes = normalizados.map((p) => duracaoDe(p));
  const srt = gerarSrtDeDuracoes(blocos, duracoes);

  // 2. concat
  const lista = `${trabalho}/lista.txt`;
  fs.writeFileSync(lista, normalizados.map((p) => `file '${fs.realpathSync(p).replace(/\\/g, '/')}'`).join('\n'));
  const emendado = `${trabalho}/emendado.mp4`;
  rodar(['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lista, '-c', 'copy', emendado]);

  // 3. legenda queimada, com a MEDIÇÃO EM PIXEL mandando (ver lib/zona-segura.mjs).
  // Antes de queimar, a legenda é desenhada com o mesmo filtro/estilo/resolução
  // que vai pro vídeo e a caixa dela é medida em pixel; se invadir a zona segura
  // do Mercado Clips, o corpo da fonte e a quebra apertam e mede de novo. Só
  // depois de esgotar o aperto é que vira erro barulhento com o número medido,
  // nunca passa calado.
  const videoEmendado = (probe(emendado).streams ?? []).find((s) => s.codec_type === 'video');
  const largura = videoEmendado?.width;
  const altura = videoEmendado?.height;
  if (!largura || !altura) throw new Error('nao consegui ler a resolucao do video emendado, sem isso a medicao da legenda em pixel nao vale nada');

  const legenda = ajustarLegendaAteCaber({ srt, largura, altura, trabalho });

  // 3.1. advertência obrigatória da categoria, no TOPO (ver lib/advertencias.mjs).
  // Ela existe porque o ML recusa Clips com o motivo "não informa as regras de
  // publicidade e marketing aplicáveis à categoria".
  // Medida em pixel igual à legenda, e pelo mesmo motivo: o arquivo sair na
  // resolução certa não prova nada sobre onde o texto foi desenhado.
  const advertencia = ajustarAdvertenciasAteCaber({
    advertencias, duracaoTotal: duracaoDe(emendado), largura, altura, trabalho,
  });
  if (advertencia) {
    // eslint-disable-next-line no-console
    console.log(`[montar] queimando ${advertencia.medicoes.length} advertência(s) obrigatória(s) no topo, corpo ${advertencia.nivel.corpo} (desce até ${advertencia.pior.descidaPct.toFixed(1)}% do quadro).`);
  }

  // ACHADO NA REVISÃO PÓS-TASK-8 (menor): queimar aqui era um .srt NOVO
  // (mesmo conteúdo, arquivo diferente) do que o ajustarLegendaAteCaber já
  // escreveu e mediu (`legenda.caminhoSrt`, um dos `medicao-corpo*.srt` em
  // `trabalho`). Conteúdo idêntico hoje, mas duas escritas do mesmo texto é
  // fresta pra divergir amanhã. Queima exatamente o arquivo que a medição
  // aprovou, sem reescrever.
  // 3.5. cama de música por baixo da narração, quando existir.
  //
  // Por que ela entra AQUI, antes do gate: o gate de voz da fase 3 transcreve o
  // áudio do arquivo final, então com a música dentro ele deixa de provar só que
  // a legenda bate com a fala e passa a provar também que a voz continua
  // inteligível POR CIMA da música. Se a cama abafar a narração, o gate reprova
  // sozinho, que é exatamente o que a gente quer que aconteça.
  //
  // Direitos: a música é gerada por nós (Lyria), nunca de terceiro. O ML proíbe
  // "música de propriedade de terceiros" e é o erro que mais derruba quem põe
  // trilha de rede social.
  const comAudio = musica ? `${trabalho}/emendado-com-musica.mp4` : emendado;
  if (musica) {
    const dur = duracaoDe(emendado);
    // eslint-disable-next-line no-console
    console.log(`[montar] misturando a cama de música a ${Math.round(VOLUME_MUSICA * 100)}% por baixo da narração.`);
    rodar(['-y', '-loglevel', 'error', '-i', emendado, '-i', musica,
      '-filter_complex',
      // a música é cortada no tamanho do vídeo, entra e sai em fade e é somada
      // SEM normalizar (o amix normaliza por padrão e derrubaria a voz junto)
      `[1:a]atrim=0:${dur.toFixed(3)},asetpts=N/SR/TB,volume=${VOLUME_MUSICA},afade=t=in:st=0:d=1.5,afade=t=out:st=${Math.max(0, dur - 2).toFixed(3)}:d=2[cama];`
      + '[0:a][cama]amix=inputs=2:duration=first:normalize=0[mix]',
      '-map', '0:v:0', '-map', '[mix]', '-c:v', 'copy', '-c:a', 'aac', '-shortest', comAudio]);
  }

  // As duas camadas de texto entram na MESMA passada de ffmpeg: a narração no
  // rodapé e a advertência no topo. Encadear é de graça e evita um segundo
  // reencode, que degradaria a imagem sem necessidade.
  const filtros = [filtroSubtitles(legenda.caminhoSrt, legenda.estilo)];
  if (advertencia) {
    filtros.push(filtroSubtitles(advertencia.caminhoSrt, advertencia.estilo));
  }
  rodar(['-y', '-loglevel', 'error', '-i', comAudio,
    '-vf', filtros.join(','),
    '-c:a', 'copy', saida]);

  // 4. gate técnico: metadado (ffprobe) + imagem estática (ffmpeg freezedetect)
  const p = probe(saida);

  // a medição foi feita contra <largura>x<altura>; se a queima entregou outra
  // resolução, a medição não vale pro arquivo final e isso tem que doer.
  const videoSaida = (p.streams ?? []).find((s) => s.codec_type === 'video');
  if (videoSaida?.width !== largura || videoSaida?.height !== altura) {
    throw new Error(`a legenda foi medida em ${largura}x${altura} mas o video final saiu ${videoSaida?.width}x${videoSaida?.height}: a medicao da zona segura nao vale pra esse arquivo`);
  }

  // REGRA DA CASA (2026-08-14): o quadro tem que estar 100% preenchido.
  // O recorte da etapa 0.5 já tira a faixa chapada bloco a bloco, e esta é a
  // conferência de fora, no arquivo que vai pro ar: se sobrou faixa (crop que
  // não deu conta, bloco que entrou por outro caminho, clipe futuro com borda de
  // outro formato), o vídeo NÃO sai daqui aprovado. O ML recusa vídeo com borda,
  // e é o tipo de defeito que só o pixel acusa, porque o arquivo continua
  // 720x1280 certinho.
  const faixasFinais = medirFaixasChapadas(saida, { trabalho });
  if (pareceBorda(faixasFinais)) {
    throw new Error(`o vídeo final ficou com faixa chapada de ${faixasFinais.topoPct.toFixed(1)}% em cima e ${faixasFinais.basePct.toFixed(1)}% embaixo. O ML exige o quadro preenchido de ponta a ponta, sem borda. Conferir se algum clipe entrou com proporção diferente e se o recorte automático rodou nele`);
  }

  const { ok, erros } = validarTecnico(p, fs.statSync(saida).size);

  const congelados = detectarCongelamentos(saida);
  for (const c of congelados) {
    // achado (menor): quando o congelamento vai até o fim do arquivo, o
    // ffmpeg nunca emite freeze_end/freeze_duration (não "descongela" antes
    // do vídeo acabar), e c.duracao vem null. Sem tratar, virava "por nulls".
    const trecho = c.duracao != null
      ? `por ${c.duracao}s a partir de ${c.inicio}s`
      : `a partir de ${c.inicio}s até o fim do arquivo`;
    erros.push(`imagem parada ${trecho}: o ML reprova vídeo com imagem estática, esse bloco precisa de movimento`);
  }

  return {
    arquivo: saida,
    probe: p,
    ok: ok && congelados.length === 0,
    erros,
    dublados,
    // durações medidas de cada bloco e a legenda que saiu delas: quem chamou
    // consegue conferir o alinhamento sem ter que remedir nada
    duracoes,
    srt,
    // prova em pixel de onde a legenda ficou no quadro, pra quem chamar poder
    // conferir/registrar sem ter que remedir
    legenda: {
      corpo: legenda.nivel.corpo,
      maxToken: legenda.nivel.maxToken,
      apertos: legenda.tentativas.length - 1,
      margens: legenda.pior.margens,
      resumo: resumirMargens(legenda.pior.margens),
    },
  };
}
