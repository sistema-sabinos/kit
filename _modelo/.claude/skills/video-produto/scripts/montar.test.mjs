// Testes do montar.mjs. Gera clipes sintéticos com ffmpeg (lavfi, sem gastar
// Veo) pra provar os três achados da revisão pós-Task-8: (1) emenda com
// clipes de fps diferente corrompendo a duração, (2) narração faltando
// passando calada, (3) mensagem de congelamento sem fim detectado.
// Roda com: node --test .claude/skills/video-produto/scripts/montar.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { montarVideo, probe, detectarCongelamentos, duracaoDe, planejarDublagem, COLCHAO_FINAL } from './montar.mjs';
import { gerarSrt, lerSrt } from './lib/legenda.mjs';
import { lerPng, acharCaixaDestoante, margensDaCaixa } from './lib/medir-png.mjs';
import { ajustarLegendaAteCaber, NIVEIS_LEGENDA } from './lib/zona-segura.mjs';

const run = promisify(execFile);

let dir;
let clipe24fps, clipe30fps, clipeCongelado, clipePreto, clipe6s;

// narração sintética de duração escolhida, no formato que o Gemini TTS entrega
// (24kHz mono) E com o mesmo desenho: fala, mais os 0,4s de silêncio que o
// lib/wav.mjs cola no fim de toda narração porque o modelo come a última
// palavra. Fixture que não tem esse silêncio mente sobre o caso real, que é
// exatamente onde o colchão do fim se perde.
async function narracaoDe(segundos, nome) {
  const wav = path.join(dir, `${nome}.wav`);
  const fala = Math.max(0.1, segundos - 0.4);
  await run('ffmpeg', ['-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `sine=frequency=300:duration=${fala}`,
    '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono:d=0.4',
    '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1',
    '-ar', '24000', '-ac', '1', wav]);
  return wav;
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'montar-video-'));
  clipe24fps = path.join(dir, 'a-24fps.mp4');
  clipe30fps = path.join(dir, 'b-30fps.mp4');
  clipeCongelado = path.join(dir, 'c-congelado.mp4');
  clipePreto = path.join(dir, 'd-preto.mp4');
  clipe6s = path.join(dir, 'e-6s.mp4');
  const imagemParada = path.join(dir, 'imagem-parada.png');

  // clipe PRETO no perfil canônico, só pra medir a legenda em pixel no vídeo
  // final de verdade: com o fundo preto, todo pixel que destoa do preto no
  // quadro queimado É a legenda, então dá pra medir a caixa dela no arquivo
  // que a gente entrega, não numa simulação. 4s pra encodar rápido (o gate de
  // duração não é o que esses testes estão olhando).
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi',
    '-i', 'color=c=black:s=720x1280:rate=24:duration=4',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
    '-ar', '48000', '-ac', '2', '-c:v', 'libx264', '-c:a', 'aac',
    '-pix_fmt', 'yuv420p', '-shortest', clipePreto]);

  // dois clipes de 8s, mesma resolução (720x1280, igual ao Veo). clipe24fps
  // já nasce no perfil canônico inteiro (720x1280/24fps/aac 48kHz estéreo),
  // clipe30fps diverge só no fps: é exatamente a variação entre gerações que
  // o brief avisa que pode acontecer, isolada pra provar que só o bloco
  // divergente é normalizado, não os dois.
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi',
    '-i', 'testsrc2=size=720x1280:rate=24:duration=8',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8',
    '-ar', '48000', '-ac', '2', '-c:v', 'libx264', '-c:a', 'aac',
    '-pix_fmt', 'yuv420p', '-shortest', clipe24fps]);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi',
    '-i', 'testsrc2=size=720x1280:rate=30:duration=8',
    '-f', 'lavfi', '-i', 'sine=frequency=520:duration=8',
    '-vf', 'hue=h=180', '-ar', '48000', '-ac', '2', '-c:v', 'libx264', '-c:a', 'aac',
    '-pix_fmt', 'yuv420p', '-shortest', clipe30fps]);

  // clipe canônico de 6s: existe só pra provar que a legenda sai da duração
  // MEDIDA de cada bloco, não do 8 presumido.
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi',
    '-i', 'testsrc2=size=720x1280:rate=24:duration=6',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
    '-ar', '48000', '-ac', '2', '-c:v', 'libx264', '-c:a', 'aac',
    '-pix_fmt', 'yuv420p', '-shortest', clipe6s]);

  // clipe deliberadamente congelado (imagem parada segurada 8s), pra testar
  // a mensagem quando o freeze vai até o fim do arquivo (sem freeze_end).
  // Já sai no perfil canônico igual clipe24fps: isso isola o teste da
  // mensagem do achado de fps/áudio misto (IMPORTANTE 2), senão os dois
  // bugs se misturam e o freeze não chega limpo até o fim do arquivo.
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=green:s=720x1280', '-frames:v', '1', imagemParada]);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', imagemParada,
    '-f', 'lavfi', '-i', 'sine=frequency=300:duration=8',
    '-t', '8', '-r', '24', '-ar', '48000', '-ac', '2', '-c:v', 'libx264', '-c:a', 'aac',
    '-pix_fmt', 'yuv420p', '-shortest', clipeCongelado]);
});

after(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

test('rejeita quando o tamanho de narracoes nao bate com o de blocos, em vez de montar calado', async () => {
  await assert.rejects(
    () => montarVideo({
      blocos: [{ arquivo: clipe24fps, fala: 'a' }, { arquivo: clipe24fps, fala: 'b' }],
      narracoes: [null], // só 1 narração pra 2 blocos
      saida: path.join(dir, 'nao-deve-existir.mp4'),
      trabalho: path.join(dir, 'wk-narracoes'),
    }),
    /narra/i,
  );
});

// CRÍTICO 2 da revisão final: a guarda antiga só conferia o TAMANHO da lista, e
// a fase 3 mandava a lista completa com `null` dentro quando a narração falhava
// depois do clipe pago. O bloco entrava mudo (o prompt de produto pede "no
// dialogue") com a legenda por cima dizendo o texto que ninguém falou.
test('recusa bloco de produto sem narracao, em vez de montar mudo com legenda por cima', async () => {
  await assert.rejects(
    () => montarVideo({
      blocos: [
        { arquivo: clipe24fps, fala: 'bloco de pessoa', tipo: 'pessoa' },
        { arquivo: clipe24fps, fala: 'bloco de produto', tipo: 'produto' },
      ],
      narracoes: [null, null], // tamanho certo, conteúdo faltando
      saida: path.join(dir, 'nao-deve-existir-2.mp4'),
      trabalho: path.join(dir, 'wk-narracao-nula'),
    }),
    (e) => /narra/i.test(e.message) && /bloco 2/i.test(e.message),
  );
});

test('normaliza blocos com fps diferente antes de emendar: duracao final bate com a soma, sem congelar na transicao', async () => {
  const saida = path.join(dir, 'final-fps-misto.mp4');
  const r = await montarVideo({
    blocos: [{ arquivo: clipe24fps, fala: 'bloco a vinte e quatro fps' }, { arquivo: clipe30fps, fala: 'bloco b trinta fps' }],
    narracoes: [null, null],
    saida,
    trabalho: path.join(dir, 'wk-fps'),
  });

  // 2 blocos de 8s cada = 16s. Sem a normalização, -c copy com fps diferente
  // corrompia a emenda e a duração media 20,04s (medido na revisão), com 2s
  // de congelamento na transição.
  assert.ok(Math.abs(r.probe.format.duration - 16) < 1, `duração ${r.probe.format.duration} deveria ficar perto de 16s`);
  assert.ok(!r.erros.some((e) => e.includes('imagem parada')), `não devia ter congelamento espúrio na transição: ${JSON.stringify(r.erros)}`);
});

test('devolve no retorno quais blocos foram dublados', async () => {
  // não temos wav de narração de verdade aqui (isso é o narrar.mjs), mas o
  // contrato é: bloco com narracoes[i] truthy = dublado, senão não.
  const narracaoFake = await narracaoDe(8, 'narracao-fake');

  const r = await montarVideo({
    blocos: [{ arquivo: clipe24fps, fala: 'sem narracao' }, { arquivo: clipe24fps, fala: 'com narracao' }],
    narracoes: [null, narracaoFake],
    saida: path.join(dir, 'final-dublados.mp4'),
    trabalho: path.join(dir, 'wk-dublados'),
  });

  assert.deepEqual(r.dublados, [false, true]);
});

// ---------------------------------------------------------------------------
// CRÍTICO 1 da revisão final: com `-shortest`, o bloco dublado passava a durar o
// MENOR entre vídeo e narração. Medido no ffmpeg desta máquina: narração de
// 6,4s virava bloco de 6,400s (o vídeo encolhia e tudo que vem depois andava
// pra frente, com a legenda mentindo) e narração de 9,4s tinha o áudio cortado
// em 8,000s (morria a última palavra, que é o motivo de existir o silêncio de
// 0,4s do lib/wav.mjs). A régua da própria skill (30 a 38 sílabas a ~4,3
// sílabas/s + 0,4s) produz de 7,4 a 9,2s, então as duas pontas acontecem na
// operação normal. Agora quem manda na duração do bloco é o CLIPE PAGO.

test('narracao mais CURTA que o clipe nao encolhe o bloco: o silencio completa', async () => {
  const curta = await narracaoDe(6.4, 'narracao-curta');
  const r = await montarVideo({
    blocos: [{ arquivo: clipe24fps, fala: 'primeiro bloco' }, { arquivo: clipe24fps, fala: 'segundo bloco' }],
    narracoes: [null, curta],
    saida: path.join(dir, 'final-narracao-curta.mp4'),
    trabalho: path.join(dir, 'wk-narracao-curta'),
  });
  assert.ok(Math.abs(r.duracoes[1] - 8) < 0.1, `bloco dublado devia manter os 8s do clipe, veio ${r.duracoes[1]}`);
  assert.ok(Math.abs(r.probe.format.duration - 16) < 0.2, `duracao final ${r.probe.format.duration} deveria ficar perto de 16s`);
});

// mede onde a parte AUDÍVEL do bloco termina (a narração sintética é tom puro
// seguido do silêncio de 0,4s, igual à de verdade), pra dar pra dizer quanta
// fala entrou no bloco em vez de só olhar o comprimento do stream.
function fimDaParteAudivel(arquivo) {
  const r = spawnSync('ffmpeg', ['-i', arquivo, '-af', 'silencedetect=n=-50dB:d=0.05', '-f', 'null', '-'], { encoding: 'utf8' });
  const inicios = [...(r.stderr ?? '').matchAll(/silence_start:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  // sem silêncio nenhum detectado, o audível vai até o fim do arquivo
  return inicios.at(-1) ?? duracaoDe(arquivo);
}

// RE-REVISÃO, resíduo: a asserção antiga aqui era `audio.duration >= 7.9`, que é
// VERDADE INCONDICIONAL (apad + -shortest sempre esticam o áudio até o fim do
// vídeo) e passava até num bloco com a fala deliberadamente cortada. O teste
// tinha o título certo e media outra coisa. Agora ele mede o que promete: a
// fala que entrou no bloco, devolvida à velocidade original, tem que bater com
// a fala inteira da narração. E o controle negativo (o bloco montado do jeito
// velho, cortando em vez de acelerar) tem que REPROVAR nessa mesma medida,
// senão a asserção não tem dente nenhum.
test('narracao mais LONGA que o clipe entra INTEIRA no bloco (acelerada, nunca cortada)', async () => {
  const FALA = 9.0; // a narração tem 9,0s de fala + 0,4s de silêncio = 9,4s
  const longa = await narracaoDe(FALA + 0.4, 'narracao-longa');
  const r = await montarVideo({
    blocos: [{ arquivo: clipe24fps, fala: 'primeiro bloco' }, { arquivo: clipe24fps, fala: 'segundo bloco' }],
    narracoes: [null, longa],
    saida: path.join(dir, 'final-narracao-longa.mp4'),
    trabalho: path.join(dir, 'wk-narracao-longa'),
  });
  assert.ok(Math.abs(r.duracoes[1] - 8) < 0.1, `bloco dublado devia manter os 8s do clipe, veio ${r.duracoes[1]}`);

  const dub = path.join(dir, 'wk-narracao-longa', 'bloco-1-dub.mp4');
  assert.ok(fs.existsSync(dub), 'esperava o bloco dublado no diretorio de trabalho');
  const razao = planejarDublagem(8, FALA + 0.4).razao;
  const falaNoBloco = fimDaParteAudivel(dub) * razao;
  assert.ok(
    Math.abs(falaNoBloco - FALA) < 0.2,
    `entrou ${falaNoBloco.toFixed(2)}s de fala no bloco, e a narração tinha ${FALA}s: sobrou palavra de fora`,
  );

  // controle negativo: o jeito velho (áudio mandando na duração, sem apad nem
  // atempo) perde 1s de fala, e a medida acima tem que acusar isso
  const cortado = path.join(dir, 'bloco-cortado.mp4');
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', clipe24fps, '-i', longa,
    '-c:v', 'copy', '-map', '0:v:0', '-map', '1:a:0', '-shortest', cortado], { encoding: 'utf8' });
  const falaNoCortado = fimDaParteAudivel(cortado); // sem aceleração, razão 1
  assert.ok(
    Math.abs(falaNoCortado - FALA) >= 0.2,
    `a medida nao tem dente: o bloco cortado tambem deu ${falaNoCortado.toFixed(2)}s de fala`,
  );
});

// RE-REVISÃO: no teto de aceleração a fala terminava colada no fim do vídeo
// (medido: áudio de 7,979s contra vídeo de 8,000s), justamente o colchão que
// existe porque o modelo de voz come a última palavra. A conta agora mira uma
// duração alvo um tico menor que a do clipe.
test('sobra colchao de silencio no fim do bloco mesmo quando a narracao vai no limite', async () => {
  const plano = planejarDublagem(8, 9.4);
  assert.ok(plano.cabe, 'narração de 9,4s pra clipe de 8s ainda tem que caber');
  const fimDaFala = (9.4 - 0.4) / plano.razao;
  assert.ok(8 - fimDaFala >= COLCHAO_FINAL - 0.01, `a fala termina em ${fimDaFala.toFixed(3)}s, sem colchao antes dos 8s`);

  // e no arquivo de verdade: o fim do bloco dublado tem que ser silêncio
  const longa = await narracaoDe(9.4, 'narracao-limite');
  await montarVideo({
    blocos: [{ arquivo: clipe24fps, fala: 'bloco no limite' }],
    narracoes: [longa],
    saida: path.join(dir, 'final-colchao.mp4'),
    trabalho: path.join(dir, 'wk-colchao'),
  });
  const dub = path.join(dir, 'wk-colchao', 'bloco-0-dub.mp4');
  const r = spawnSync('ffmpeg', ['-i', dub, '-af', 'silencedetect=n=-50dB:d=0.05', '-f', 'null', '-'], { encoding: 'utf8' });
  const inicios = [...(r.stderr ?? '').matchAll(/silence_start:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const ultimo = inicios.at(-1);
  assert.ok(ultimo != null, `esperava silencio no fim do bloco dublado: ${(r.stderr ?? '').slice(-300)}`);
  assert.ok(ultimo <= 8 - COLCHAO_FINAL + 0.05 && ultimo > 7, `o silencio final comeca em ${ultimo}s, colado no fim do clipe de 8s`);
});

test('narracao absurdamente mais longa que o clipe estoura com recado, em vez de acelerar a voz ate ficar ridicula', async () => {
  const absurda = await narracaoDe(14, 'narracao-absurda');
  await assert.rejects(
    () => montarVideo({
      blocos: [{ arquivo: clipe24fps, fala: 'primeiro bloco' }],
      narracoes: [absurda],
      saida: path.join(dir, 'nao-deve-existir-3.mp4'),
      trabalho: path.join(dir, 'wk-narracao-absurda'),
    }),
    (e) => /narra/i.test(e.message) && /encurtar/i.test(e.message),
  );
});

test('a legenda sai da duracao MEDIDA de cada bloco, nao dos 8s presumidos', async () => {
  const r = await montarVideo({
    blocos: [{ arquivo: clipe6s, fala: 'bloco de seis segundos' }, { arquivo: clipe24fps, fala: 'bloco de oito segundos' }],
    narracoes: [null, null],
    saida: path.join(dir, 'final-duracao-medida.mp4'),
    trabalho: path.join(dir, 'wk-duracao-medida'),
  });
  // desde 2026-08-14 cada bloco vira DUAS legendas (a fala inteira de uma vez
  // empilhava 6 e 7 linhas no meio do quadro, cobrindo o produto). A garantia
  // deste teste não mudou: a fronteira entre os blocos tem que cair na duração
  // MEDIDA do clipe, não nos 8s presumidos. Quem responde por ela agora é a
  // última legenda do bloco 1 e a primeira do bloco 2.
  const cues = lerSrt(r.srt);
  assert.equal(cues.length, 4);
  assert.ok(Math.abs(cues[1].fim - 6) < 0.1, `o bloco 1 devia terminar com o clipe de 6s, veio ${cues[1].fim}`);
  assert.ok(Math.abs(cues[2].inicio - 6) < 0.1, `o bloco 2 devia comecar aos 6s, veio ${cues[2].inicio}`);
  assert.ok(Math.abs(cues.at(-1).fim - 14) < 0.1, `o bloco 2 devia terminar aos 14s, veio ${cues.at(-1).fim}`);
});

// gate que devolve valor neutro quando falha é pior que gate nenhum: o
// freezedetect rodava sem conferir status, e com stderr nulo o "nenhum
// congelamento" saía de graça, com o gate dizendo ok.
test('o detector de imagem parada estoura quando o ffmpeg falha, em vez de dizer que esta tudo certo', () => {
  assert.throws(
    () => detectarCongelamentos(path.join(dir, 'arquivo-que-nao-existe.mp4')),
    /freeze|congelamento/i,
  );
});

test('duracaoDe le a duracao real do arquivo', () => {
  assert.ok(Math.abs(duracaoDe(clipe6s) - 6) < 0.1, `esperava 6s, veio ${duracaoDe(clipe6s)}`);
});

// ---------------------------------------------------------------------------
// ZONA SEGURA DO MERCADO CLIPS, MEDIDA EM PIXEL NO ARQUIVO FINAL
//
// O requisito é em PIXEL, não em caractere: pelo menos ~15% de margem lateral
// (onde ficam os botões de compartilhar/favoritar) e fora dos ~20% de baixo.
// Duas tentativas anteriores falharam por medir a coisa errada, contar
// caractere (não diz largura) e delegar 100% ao libass (que não quebra dentro
// de palavra, então token comprido atravessava a tela de x=0 a x=719).
//
// Aqui o vídeo montado é preto, então todo pixel que destoa do preto no quadro
// queimado é a legenda: a medição é do arquivo entregue, não de simulação.
const EXIGIDO = { lateralPct: 15, baixoPct: 20 };

async function medirLegendaNoVideoFinal(fala, nome) {
  const saida = path.join(dir, `zona-${nome}.mp4`);
  await montarVideo({
    blocos: [{ arquivo: clipePreto, fala }],
    narracoes: [null],
    saida,
    trabalho: path.join(dir, `wk-zona-${nome}`),
  });
  const png = path.join(dir, `zona-${nome}.png`);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '2', '-i', saida,
    '-frames:v', '1', '-pix_fmt', 'rgb24', png]);
  const caixa = acharCaixaDestoante(lerPng(png), [0, 0, 0], 40);
  assert.ok(caixa, `a legenda "${nome}" nao apareceu no quadro final: medicao que nao roda e erro, nao "ok"`);
  return { caixa, margens: margensDaCaixa(caixa) };
}

const CASOS_ZONA = [
  ['normal', 'Ó, sabe quando você compra caneta barata e ela seca na segunda semana'],
  ['curto', 'Compra agora'],
  ['palavra-longa-acentuada', 'impermeabilização extraordinariamente responsabilidade'],
  ['token-60-sem-espaco', 'a'.repeat(60)],
  ['token-misto-46', `olha esse ${'W'.repeat(46)} aqui`],
];

for (const [nome, fala] of CASOS_ZONA) {
  test(`legenda "${nome}" fica dentro da zona segura do Clips (medido em pixel no video final)`, async () => {
    const { caixa, margens } = await medirLegendaNoVideoFinal(fala, nome);
    const onde = `x=[${caixa.minX},${caixa.maxX}] y=[${caixa.minY},${caixa.maxY}] `
      + `esq ${margens.esquerdaPct.toFixed(1)}% dir ${margens.direitaPct.toFixed(1)}% `
      + `baixo ${margens.baixoPct.toFixed(1)}% topo ${margens.topoPct.toFixed(1)}%`;
    assert.ok(margens.esquerdaPct >= EXIGIDO.lateralPct, `margem esquerda abaixo de ${EXIGIDO.lateralPct}%: ${onde}`);
    assert.ok(margens.direitaPct >= EXIGIDO.lateralPct, `margem direita abaixo de ${EXIGIDO.lateralPct}%: ${onde}`);
    assert.ok(margens.baixoPct >= EXIGIDO.baixoPct, `margem de baixo abaixo de ${EXIGIDO.baixoPct}%: ${onde}`);
    assert.ok(caixa.minY > 0, `legenda encostou no topo do quadro (texto cortado): ${onde}`);
  });
}

test('o retorno traz a prova em pixel de onde a legenda ficou', async () => {
  const r = await montarVideo({
    blocos: [{ arquivo: clipePreto, fala: 'Ó, sabe quando você compra caneta barata e ela seca' }],
    narracoes: [null],
    saida: path.join(dir, 'zona-retorno.mp4'),
    trabalho: path.join(dir, 'wk-zona-retorno'),
  });
  assert.ok(r.legenda, 'esperava o campo legenda no retorno, com a medicao');
  assert.ok(r.legenda.margens.esquerdaPct >= EXIGIDO.lateralPct, r.legenda.resumo);
  assert.ok(r.legenda.margens.direitaPct >= EXIGIDO.lateralPct, r.legenda.resumo);
  assert.ok(r.legenda.margens.baixoPct >= EXIGIDO.baixoPct, r.legenda.resumo);
  assert.equal(r.legenda.apertos, 0, 'fala normal nao devia precisar de aperto nenhum');
});

// Montserrat Bold e mais estreita no W do que a Arial era (o FontSize do ASS e a
// altura da celula, e a Montserrat tem celula alta: o W de 15 letras mede 445px
// no corpo 40 e cabe num 720 com 19% de margem). Por isso o aperto deixou de ser
// alcancavel com token de 15 no quadro de 720 e o teste passou a usar um quadro
// mais estreito (520), onde o mesmo token invade a zona e a escada tem que descer.
test('quando aperta, aperta de verdade: token largo demais sai com corpo menor que o primeiro nivel', () => {
  const r = ajustarLegendaAteCaber({
    srt: gerarSrt([{ fala: `olha esse ${'W'.repeat(46)} aqui` }], 8),
    largura: 520,
    altura: 1280,
    trabalho: path.join(dir, 'wk-zona-aperto'),
  });
  assert.ok(r.tentativas.length > 1, `esperava pelo menos um aperto, veio ${r.tentativas.length - 1}`);
  assert.ok(r.nivel.corpo < NIVEIS_LEGENDA[0].corpo, `esperava corpo menor que ${NIVEIS_LEGENDA[0].corpo}, veio ${r.nivel.corpo}`);
  assert.equal(r.tentativas[0].cabe, false, 'o primeiro nivel tinha que ter reprovado, senao o teste nao prova aperto');
});

// gate que devolve valor neutro quando falha é pior que gate nenhum, porque
// parece que está funcionando. Quando o aperto se esgota, tem que explodir com
// o número medido em cada tentativa.
test('quando nem o nivel mais apertado cabe, o gate explode com o numero medido, nao passa calado', () => {
  assert.throws(
    () => ajustarLegendaAteCaber({
      srt: gerarSrt([{ fala: 'W'.repeat(46) }], 8),
      // quadro estreito de propósito: não cabe em nível nenhum. Foi de 200 pra
      // 90 em 2026-08-14, quando a escada de aperto passou a começar em 40 (e
      // não 64) e a terminar em 24 (e não 36): com letra menor, 200px de largura
      // passou a CABER e o teste parou de exercitar o que ele existe pra provar.
      largura: 90,
      altura: 1280,
      trabalho: path.join(dir, 'wk-zona-impossivel'),
    }),
    (e) => /invade a zona segura/.test(e.message)
      && /corpo 40\/token 15/.test(e.message)
      && /corpo 24\/token 6/.test(e.message)
      && /esq 0\.0%/.test(e.message),
  );
});

test('legenda que nao aparece no quadro medido e erro, nao "ok"', () => {
  assert.throws(
    () => ajustarLegendaAteCaber({
      srt: '1\n00:00:00,000 --> 00:00:08,000\n \n',
      largura: 720,
      altura: 1280,
      trabalho: path.join(dir, 'wk-zona-vazia'),
    }),
    /nao apareceu no quadro medido/,
  );
});

test('a queima usa o filtroSubtitles (fonte embutida), sem montar o subtitles na mao', () => {
  const fonte = fs.readFileSync(fileURLToPath(new URL('./montar.mjs', import.meta.url)), 'utf8');
  assert.ok(fonte.includes('filtroSubtitles('), 'montar.mjs nao chama filtroSubtitles');
  assert.ok(!fonte.includes("subtitles='"), 'montar.mjs ainda monta um subtitles= proprio, sem fontsdir');
});

test('trabalho e obrigatorio: sem ele a montagem nao escreve em pasta nenhuma', async () => {
  await assert.rejects(
    () => montarVideo({ blocos: [{ arquivo: clipePreto, fala: 'oi' }], narracoes: [null], saida: path.join(dir, 'sem-trabalho.mp4') }),
    /trabalho e obrigatorio/,
  );
});

test('mensagem de congelamento sem freeze_end (vai ate o fim do arquivo) nao fica com "nulls"', async () => {
  const r = await montarVideo({
    blocos: [{ arquivo: clipe24fps, fala: 'esse bloco tem movimento' }, { arquivo: clipeCongelado, fala: 'esse bloco esta parado' }],
    narracoes: [null, null],
    saida: path.join(dir, 'final-congelado.mp4'),
    trabalho: path.join(dir, 'wk-congelado'),
  });

  assert.equal(r.ok, false);
  const msg = r.erros.find((e) => e.includes('imagem parada'));
  assert.ok(msg, `esperava erro de imagem parada: ${JSON.stringify(r.erros)}`);
  assert.ok(!msg.includes('nulls'), `mensagem não devia conter "nulls": ${msg}`);
});
