import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUES_POR_BLOCO, fatiarFala, gerarSrt, gerarSrtDeDuracoes, abrirQuebrasEmTokens, lerSrt, reapertarSrt, MAX_TOKEN_PADRAO } from './legenda.mjs';

const blocos = [
  { etapa: 'atencao', fala: 'primeira fala' },
  { etapa: 'interesse', fala: 'segunda fala' },
];

test('gera SRT com um bloco por clipe, na ordem', () => {
  const srt = gerarSrt(blocos, 8);
  assert.match(srt, /^1\r?\n00:00:00,000 --> 00:00:08,000\r?\nprimeira fala/m);
  assert.match(srt, /^2\r?\n00:00:08,000 --> 00:00:16,000\r?\nsegunda fala/m);
});

// A legenda combinava com o vídeo por CONVENÇÃO (8,00s por bloco) e ninguém
// conferia a convenção. Agora a duração de cada bloco é medida no arquivo
// montado e a legenda sai dela, então esta função tem que aceitar duração
// fracionária e ainda emendar um cue no outro sem buraco.
test('monta o SRT a partir das duracoes medidas de cada bloco, emendando um cue no outro', () => {
  const srt = gerarSrtDeDuracoes(blocos, [7.96, 8.12]);
  const cues = lerSrt(srt);
  assert.deepEqual(cues.map((c) => [c.inicio, c.fim]), [[0, 7.96], [7.96, 16.08]]);
});

test('exige uma duracao por bloco, em vez de inventar o que faltou', () => {
  assert.throws(() => gerarSrtDeDuracoes(blocos, [8]), /dura/i);
});

// carimbo() arredondava só os milissegundos, então fração perto de 1 gerava 4
// dígitos ("00:00:07,1000"), que o próprio lerSrt não lê. Era inofensivo
// enquanto a duração era o inteiro 8; com duração medida, morde na primeira
// rodada real.
test('carimba milissegundo com 3 digitos mesmo quando a fracao arredonda pra cima', () => {
  const srt = gerarSrtDeDuracoes([{ fala: 'a' }, { fala: 'b' }], [7.9996, 8]);
  assert.match(srt, /00:00:08,000 --> 00:00:16,000/);
  assert.doesNotMatch(srt, /,\d{4}/);
  assert.equal(lerSrt(srt).length, 2); // o lerSrt tem que continuar lendo o que a gente escreve
});

// A garantia é a mesma de sempre (a legenda sai do ROTEIRO, sem inventar
// palavra), só que agora a fala do bloco se espalha por mais de um cue, então a
// conferência é sobre a junção deles.
const textoDoBloco = (srt) => lerSrt(srt).map((c) => c.texto.split('\n').join(' ')).join(' ');

test('a legenda sai igual a fala do roteiro, sem inventar', () => {
  const fala = 'Ó, sabe quando seca?';
  assert.equal(textoDoBloco(gerarSrt([{ etapa: 'atencao', fala }], 8)), fala);
});

// Divisão de trabalho fixada depois de duas tentativas erradas: a quebra ENTRE
// palavras é do libass (é ele quem conhece a largura real de cada glifo, e o
// resultado dele já foi medido certo em pixel). Aqui a gente não encosta.
test('nao quebra entre palavras: texto normal sai inteiro, numa linha so, pro libass quebrar', () => {
  const fala = 'Ó, sabe quando você compra cafezinho barata e ela seca na segunda semana';
  const cues = lerSrt(gerarSrt([{ etapa: 'atencao', fala }], 8));
  // nenhum cue traz quebra de linha NOSSA: cada um sai numa linha só, e quem
  // decide onde quebrar em tela continua sendo o libass
  cues.forEach((c) => assert.ok(!c.texto.includes('\n'), `cue ${c.indice} veio quebrado por nós: ${JSON.stringify(c.texto)}`));
  // e a junção devolve a fala inteira, sem palavra perdida nem inventada
  assert.equal(cues.map((c) => c.texto).join(' '), fala);
});

// ...mas o libass NÃO quebra DENTRO de palavra em WrapStyle nenhum. Medido ao
// vivo: um token de 60 caracteres sem espaço saiu de x=0 a x=719 num quadro de
// 720 (0% de margem lateral). Então quem abre a oportunidade de quebra dentro
// do token é a geração do SRT, senão não existe onde quebrar.
test('abre quebra DENTRO de token comprido demais, porque o libass nao quebra dentro de palavra', () => {
  const token = 'a'.repeat(60);
  const corpo = gerarSrt([{ etapa: 'atencao', fala: token }], 8).split(/\r?\n\r?\n/)[0].split(/\r?\n/).slice(2);
  assert.ok(corpo.length > 1, `esperava o token de 60 quebrado em varias linhas, veio ${corpo.length}`);
  assert.ok(corpo.every((l) => l.length <= MAX_TOKEN_PADRAO), corpo.join(' | '));
  assert.equal(corpo.join(''), token, 'a quebra nao pode perder nem inventar caractere');
});

test('token comprido no meio de palavras normais: so o token e quebrado, o resto sai igual ao roteiro', () => {
  const fala = `olha esse ${'W'.repeat(46)} aqui`;
  const texto = abrirQuebrasEmTokens(fala, MAX_TOKEN_PADRAO);
  assert.ok(texto.includes('\n'), 'esperava quebra dentro do token gigante');
  assert.equal(texto.replace(/\n/g, ''), fala, 'espaco e ordem das palavras tem que sair identicos ao roteiro');
});

test('nao corta acento nem emoji no meio (conta por code point, nao por byte)', () => {
  const fala = 'ç'.repeat(20);
  assert.equal(abrirQuebrasEmTokens(fala, 15).split('\n').join(''), fala);
  const emoji = '🎨'.repeat(20);
  const partes = abrirQuebrasEmTokens(emoji, 5).split('\n');
  assert.equal(partes.join(''), emoji);
  assert.ok(partes.every((p) => [...p].length <= 5), partes.join(' | '));
});

// achado ao vivo: a fala vem do roteiro e pode trazer linha em branco (ou
// tab, ou espaço duplo). Sem normalizar, isso vira um separador de cue no
// meio do bloco e o lerSrt estoura em vez de ler a legenda.
test('normaliza espaco/quebra de linha da fala antes de montar a legenda, senao quebra o SRT', () => {
  const fala = 'primeira parte\n\nsegunda parte';
  const srt = gerarSrt([{ etapa: 'atencao', fala }], 8);
  const cues = lerSrt(srt); // lancaria "bloco de SRT sem linha de tempo valida" se a linha em branco sobrevivesse
  assert.ok(cues.length >= 1);
  assert.equal(cues.map((c) => c.texto).join(' '), 'primeira parte segunda parte');
});

test('le o SRT de volta com tempo e texto de cada legenda', () => {
  const cues = lerSrt(gerarSrt(blocos, 8));
  assert.equal(cues.length, 2);
  assert.deepEqual(cues.map((c) => [c.inicio, c.fim, c.texto]), [
    [0, 8, 'primeira fala'],
    [8, 16, 'segunda fala'],
  ]);
});

// o aperto reaplica a quebra com teto menor SEM juntar as linhas de volta:
// juntar erraria e grudaria duas palavras. Reaplicar por linha só pode deixar
// mais estreito, nunca mais largo.
test('reapertar deixa a legenda mais estreita e nunca gruda palavra', () => {
  const srt = gerarSrt([{ etapa: 'atencao', fala: `venda ${'a'.repeat(60)} hoje` }], 8);
  const apertado = reapertarSrt(srt, 6);
  const corpo = apertado.split(/\r?\n/).slice(2).filter(Boolean);
  assert.ok(corpo.every((l) => !/\S{7,}/.test(l)), `nenhuma linha podia ter mais de 6 caracteres seguidos: ${corpo.join(' | ')}`);
  assert.equal(corpo.join(''), `venda ${'a'.repeat(60)} hoje`, 'o aperto nao pode perder caractere nem grudar palavra');
  assert.match(apertado, /^1\r?\n00:00:00,000 --> 00:00:08,000/m, 'os tempos tem que sobreviver ao aperto');
});

// rede de segurança, não a regra: protege contra roteiro absurdamente longo
// (bug em outra etapa, texto duplicado, etc.), não define quebra normal.
test('protege com reticencias um roteiro absurdamente longo, mas nao mexe em fala normal', () => {
  const normal = 'fala de tamanho normal, bem dentro do que cabe em 8 segundos de narracao';
  assert.equal(textoDoBloco(gerarSrt([{ etapa: 'atencao', fala: normal }], 8)), normal);

  const absurda = 'x'.repeat(500);
  // texto absurdo é cortado e AINDA ganha quebra dentro do token, então o
  // corpo sai em várias linhas: junta de volta pra conferir o corte.
  const corpo = lerSrt(gerarSrt([{ etapa: 'atencao', fala: absurda }], 8))[0].texto.split('\n').join('');
  assert.ok(corpo.length <= 300, `esperava <= 300 chars, veio ${corpo.length}`);
  assert.ok(corpo.endsWith('…'), 'esperava reticencias no final do corte de seguranca');
});

// ---------------------------------------------------------------------------
// Legenda partida em duas por bloco (2026-08-14). No primeiro vídeo real a fala
// inteira virava 6 e 7 linhas empilhadas no meio do quadro, cobrindo o produto.
// Partir corta a altura pela metade sem tirar palavra nenhuma do roteiro.
// ---------------------------------------------------------------------------

test('fatiarFala parte em dois sem perder nem trocar palavra', () => {
  const fala = 'São só duas cápsulas por dia com água. E o pote inteiro dá trinta dias de uso sem complicação nenhuma.';
  const partes = fatiarFala(fala, 2);
  assert.equal(partes.length, 2);
  assert.equal(partes.join(' '), fala.trim().replace(/\s+/g, ' '));
});

test('fatiarFala prefere cortar depois da pontuação', () => {
  const partes = fatiarFala('São só duas cápsulas por dia com água. E o pote inteiro dá trinta dias.', 2);
  assert.match(partes[0], /água\.$/);
  assert.match(partes[1], /^E o pote/);
});

test('fatiarFala não parte fala curta demais, que viraria legenda piscando', () => {
  assert.deepEqual(fatiarFala('Olha lá', 2), ['Olha lá']);
  assert.deepEqual(fatiarFala('', 2), ['']);
});

test('o SRT sai com várias legendas por bloco, em sequência e sem buraco', () => {
  const blocos = [
    { fala: 'São só duas cápsulas por dia com água. E o pote dá trinta dias.' },
    { fala: 'Hidrolisado é o de pele e cabelo. O tipo dois é outro, é pra cartilagem.' },
  ];
  const cues = lerSrt(gerarSrtDeDuracoes(blocos, [8, 8]));
  assert.equal(cues.length, 2 * CUES_POR_BLOCO);
  assert.deepEqual(cues.map((c) => c.indice), cues.map((_, i) => i + 1));
  // a última legenda do bloco 1 termina exatamente onde o bloco 2 começa
  assert.equal(Math.round(cues[CUES_POR_BLOCO - 1].fim * 100), 800);
  assert.equal(Math.round(cues[CUES_POR_BLOCO].inicio * 100), 800);
  // nenhuma legenda começa antes da anterior acabar
  cues.slice(1).forEach((c, i) => assert.ok(c.inicio >= cues[i].fim - 0.001, `legenda ${c.indice} volta no tempo`));
  // o último cue fecha no fim do vídeo, sem sobra de arredondamento
  assert.equal(Math.round(cues.at(-1).fim * 100), 1600);
});

test('dá pra pedir uma legenda por bloco de novo, se um dia precisar', () => {
  const cues = lerSrt(gerarSrtDeDuracoes([{ fala: 'uma fala qualquer com várias palavras aqui' }], [8], { cuesPorBloco: 1 }));
  assert.equal(cues.length, 1);
});
