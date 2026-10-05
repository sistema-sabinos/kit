import { test } from 'node:test';
import assert from 'node:assert/strict';
import { direcaoDeVoz, promptDeClipe } from './direcao.mjs';

const ator = { quem: 'professora de artes', idade: 32, cenario: 'mesa de casa com luz de janela' };

test('a direcao de voz declara o idioma e proibe o tom de locutor', () => {
  const d = direcaoDeVoz(ator);
  assert.match(d, /portugu[êe]s brasileiro/i);
  assert.match(d, /n[ãa]o.*locutor/i);
  assert.match(d, /n[ãa]o projete/i);
});

// A direcao vai em speech_metadata.style: nada de "Fale:" puxando a fala, que
// so fazia sentido quando direcao e fala iam juntas no mesmo texto.
test('a direcao de voz descreve a entrega sem chamar a fala e segue o genero', () => {
  assert.doesNotMatch(direcaoDeVoz(ator), /Fale:/);
  assert.match(direcaoDeVoz(ator), /feminina/);
  assert.match(direcaoDeVoz({ ...ator, genero: 'masculino' }), /masculina/);
  assert.match(direcaoDeVoz(ator), /WhatsApp/);
});

test('a direcao de voz nunca usa audio tag', () => {
  const d = direcaoDeVoz(ator);
  assert.ok(!/\[(sighs?|tired|excited|laughs?)\]/i.test(d), 'tag de áudio é roleta: numa amostra o modelo leu em voz alta');
});

test('prompt de clipe de pessoa pede lip sync e proibe legenda queimada pelo Veo', () => {
  const p = promptDeClipe({ etapa: 'atencao', tipo: 'pessoa', fala: 'oi', cena: 'mulher na mesa' }, { ator, produto: 'kit de canetas' });
  assert.match(p, /no subtitles/i);
  assert.match(p, /says:/i);
});

test('prompt de clipe de pessoa traz a tecnica anti cara de IA', () => {
  const p = promptDeClipe({ etapa: 'atencao', tipo: 'pessoa', fala: 'x', cena: 'ela abre a caixa' }, { ator, produto: 'kit' });
  assert.match(p, /skin texture/i);
  assert.match(p, /blinking/i);
  assert.match(p, /hands out of frame/i);
  assert.match(p, /handheld/i);
});

test('prompt de clipe de produto nao leva pele, piscar nem instrucao de rosto', () => {
  const p = promptDeClipe({ etapa: 'interesse', tipo: 'produto', fala: 'x', cena: 'macro da ponta' }, { ator, produto: 'kit' });
  assert.doesNotMatch(p, /skin/i);
  assert.doesNotMatch(p, /blinking/i);
  assert.doesNotMatch(p, /head shifts/i);
  assert.doesNotMatch(p, /hands out of frame/i);
  // o resto da tecnica de celular continua valendo pro produto
  assert.match(p, /handheld/i);
  assert.match(p, /no on-screen text/i);
});

test('cena de maos nao manda esconder as maos, nem no bloco de pessoa', () => {
  for (const tipo of ['pessoa', 'produto']) {
    for (const cena of ['macro das maos guardando as pecas', 'close nas mãos dela abrindo a caixa', 'her hands holding the box']) {
      const p = promptDeClipe({ tipo, cena, fala: 'x' }, { ator, produto: 'kit' });
      assert.doesNotMatch(p, /hands out of frame/i, `${tipo} / ${cena}`);
    }
  }
});

test('o prompt do ator nao mistura artigo em portugues no texto em ingles', () => {
  const quem = 'mulher que gosta de desenhar';
  for (const vozUnica of [false, true]) {
    const p = promptDeClipe({ tipo: 'pessoa', cena: 'na mesa', fala: 'oi' }, { ator: { ...ator, quem }, produto: 'kit', vozUnica });
    assert.match(p, new RegExp(quem));
    assert.doesNotMatch(p, /\bA mulher\b/);
    assert.match(p, /Person on camera: mulher que gosta de desenhar, 32 years old/);
  }
});

test('clipe de produto nao pede pessoa falando', () => {
  const p = promptDeClipe({ etapa: 'desejo', tipo: 'produto', fala: 'x', cena: 'macro' }, { ator, produto: 'kit' });
  assert.ok(!/says:/i.test(p));
});

test('direcaoDeVoz estoura erro se ator.quem faltar', () => {
  assert.throws(
    () => direcaoDeVoz({ idade: 32, cenario: 'mesa' }),
    /ator\.quem/,
    'deve nomear qual campo faltou'
  );
});

test('direcaoDeVoz estoura erro se ator.idade faltar', () => {
  assert.throws(
    () => direcaoDeVoz({ quem: 'professora', cenario: 'mesa' }),
    /ator\.idade/,
    'deve nomear qual campo faltou'
  );
});

test('direcaoDeVoz estoura erro se ator.cenario faltar', () => {
  assert.throws(
    () => direcaoDeVoz({ quem: 'professora', idade: 32 }),
    /ator\.cenario/,
    'deve nomear qual campo faltou'
  );
});

test('direcaoDeVoz estoura erro se ator for undefined', () => {
  assert.throws(
    () => direcaoDeVoz(undefined),
    /ator/,
    'deve validar que ator existe'
  );
});

test('promptDeClipe estoura erro se ator.quem faltar', () => {
  assert.throws(
    () => promptDeClipe({ etapa: 'teste', tipo: 'pessoa', fala: 'oi', cena: 'mesa' }, { ator: { idade: 32, cenario: 'mesa' }, produto: 'kit' }),
    /ator\.quem/
  );
});

test('promptDeClipe estoura erro se ator.idade faltar', () => {
  assert.throws(
    () => promptDeClipe({ etapa: 'teste', tipo: 'pessoa', fala: 'oi', cena: 'mesa' }, { ator: { quem: 'prof', cenario: 'mesa' }, produto: 'kit' }),
    /ator\.idade/
  );
});

test('promptDeClipe estoura erro se ator.cenario faltar', () => {
  assert.throws(
    () => promptDeClipe({ etapa: 'teste', tipo: 'pessoa', fala: 'oi', cena: 'mesa' }, { ator: { quem: 'prof', idade: 32 }, produto: 'kit' }),
    /ator\.cenario/
  );
});

test('promptDeClipe estoura erro se ator for undefined', () => {
  assert.throws(
    () => promptDeClipe({ etapa: 'teste', tipo: 'pessoa', fala: 'oi', cena: 'mesa' }, { ator: undefined, produto: 'kit' }),
    /ator/
  );
});

test('direcaoDeVoz rejeita qualquer audio tag em colchetes', () => {
  const d = direcaoDeVoz(ator);
  assert.ok(!/\[.+?\]/i.test(d), 'nenhuma tag de áudio tipo [xxx], o modelo às vezes lê em voz alta');
});

// Com vozUnica a fala é a NOSSA narração por cima do clipe. Se o Veo ainda
// gerar a pessoa falando, o lábio dela corre contra um áudio que não é o dela.
// Medido no primeiro vídeo real (2026-08-14): a boca começava a mexer 1,4s
// depois do início da nossa fala em dois blocos, e 3,8s depois no terceiro.
test('com vozUnica, o bloco de pessoa manda ela NAO falar', () => {
  const bloco = { tipo: 'pessoa', cena: 'ela na cozinha', fala: 'qualquer coisa dita' };
  const p = promptDeClipe(bloco, { ator, produto: 'cápsulas brancas', vozUnica: true });
  assert.match(p, /does NOT speak/i);
  // "no dialogue" até 01/09/2026. A direção de áudio virou pedido POSITIVO
  // naquele dia (pedir ao gerador que não produzisse NADA derrubava a geração
  // inteira: 8 tentativas de bloco de pessoa, 0 sucesso), e este assert ficou
  // cobrando a redação velha, vermelho desde então.
  assert.match(p, /no spoken words/i);
  // a fala não pode ir pro prompt: ela seria encenada com a boca
  assert.doesNotMatch(p, /qualquer coisa dita/);
});

test('sem vozUnica, o bloco de pessoa continua falando pro lip sync', () => {
  const bloco = { tipo: 'pessoa', cena: 'ela na cozinha', fala: 'qualquer coisa dita' };
  const p = promptDeClipe(bloco, { ator, produto: 'cápsulas brancas' });
  assert.match(p, /qualquer coisa dita/);
});

test('todo prompt pede quadro cheio, porque foto quadrada voltou com faixa branca', () => {
  const p = promptDeClipe({ tipo: 'produto', cena: 'macro', fala: 'x' }, { ator, produto: 'cápsulas' });
  assert.match(p, /fill the entire vertical frame/i);
});

test('ator com genero e sotaque muda o pronome e o sotaque do prompt', () => {
  const bloco = { tipo: 'pessoa', cena: 'na cozinha', fala: 'oi' };
  const p = promptDeClipe(bloco, { ator: { ...ator, genero: 'masculino', sotaque: 'carioca' }, produto: 'kit' });
  assert.match(p, /\bHe\b/);
  assert.doesNotMatch(p, /\bShe\b/);
  assert.match(p, /carioca/);
  assert.match(direcaoDeVoz({ ...ator, sotaque: 'carioca' }), /carioca/);
});

test('sem genero e sem sotaque, o padrao e feminino e brasileiro neutro', () => {
  const bloco = { tipo: 'pessoa', cena: 'na cozinha', fala: 'oi' };
  const p = promptDeClipe(bloco, { ator, produto: 'kit' });
  assert.match(p, /\bShe\b/);
  assert.match(p, /brasileiro neutro/);
  assert.match(direcaoDeVoz(ator), /brasileiro neutro/);
});

test('com vozUnica o pronome tambem segue o genero', () => {
  const bloco = { tipo: 'pessoa', cena: 'na cozinha', fala: 'oi' };
  const p = promptDeClipe(bloco, { ator: { ...ator, genero: 'masculino' }, produto: 'kit', vozUnica: true });
  assert.match(p, /He does NOT speak/);
});
