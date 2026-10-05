import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarRoteiro, validarTecnico, regexDeMarcas } from './gate.mjs';

const roteiroBase = {
  mlb: 'MLB1', slug: 'x', produto: 'Kit de canetas', ehKit: false, itensDoKit: [],
  marcasProprias: [], marcasDeTerceiro: [],
  ator: { quem: 'professora', idade: 32, cenario: 'mesa com luz de janela' },
  voz: 'Aoede',
  blocos: [
    { etapa: 'atencao', tipo: 'pessoa', fala: 'Ó, sabe quando a caneta seca na segunda semana', cena: 'mulher na mesa' },
    { etapa: 'interesse', tipo: 'produto', fala: 'essa aqui tem ponta dupla e tinta que dura', cena: 'macro da ponta' },
    { etapa: 'desejo', tipo: 'produto', fala: 'o traço sai igual do começo ao fim', cena: 'macro do traço' },
    { etapa: 'acao', tipo: 'pessoa', fala: 'olha a ficha completa na descrição, viu', cena: 'mulher segurando' },
  ],
};

test('roteiro limpo passa', () => {
  assert.deepEqual(validarRoteiro(roteiroBase), { ok: true, erros: [] });
});

test('reprova menção a preço ou promoção', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 3 ? { ...b, fala: 'corre que ta em promoção com frete grátis' } : b) });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => /pre[çc]o|promo/i.test(e)), r.erros.join(' | '));
});

test('reprova menor de idade, aparecendo ou citado', () => {
  const r = validarRoteiro({ ...roteiroBase, ator: { quem: 'criança de 9 anos', idade: 9, cenario: 'escola' } });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => /menor|idade/i.test(e)), r.erros.join(' | '));
});

test('reprova ator sem idade declarada ou menor de 18', () => {
  const r = validarRoteiro({ ...roteiroBase, ator: { quem: 'estudante', idade: 16, cenario: 'quarto' } });
  assert.equal(r.ok, false);
});

test('reprova dado de contato', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 3 ? { ...b, fala: 'chama no whatsapp que eu mando' } : b) });
  assert.equal(r.ok, false);
});

test('reprova marca propria e marca de terceiro, vindas do roteiro', () => {
  const comMarcas = { ...roteiroBase, marcasProprias: ['Acme'], marcasDeTerceiro: ['Marca Teste'] };
  const r = validarRoteiro({ ...comMarcas, blocos: comMarcas.blocos.map((b, i) => i === 1 ? { ...b, fala: 'compre Acme' } : b) });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => /marca pr[óo]pria/.test(e) && /Acme/.test(e)), r.erros.join(' | '));
  const t = validarRoteiro({ ...comMarcas, blocos: comMarcas.blocos.map((b, i) => i === 1 ? { ...b, fala: 'igualzinho a Marca Teste mas mais barata' } : b) });
  assert.equal(t.ok, false);
  assert.ok(t.erros.some((e) => /marca de terceiro/.test(e) && /Marca Teste/.test(e)), t.erros.join(' | '));
});

test('marca so vale quando o roteiro declara: lista vazia nao reprova nada, e nenhuma marca vem de fabrica', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 1 ? { ...b, fala: 'compre Acme e Marca Teste' } : b) });
  assert.equal(r.ok, true, r.erros.join(' | '));
});

test('sem marcasProprias ou marcasDeTerceiro no roteiro o gate falha pedindo a lista, e [] vale', () => {
  for (const campo of ['marcasProprias', 'marcasDeTerceiro']) {
    const { [campo]: _fora, ...semCampo } = roteiroBase;
    const r = validarRoteiro(semCampo);
    assert.equal(r.ok, false, campo);
    assert.ok(r.erros.some((e) => e.includes(campo) && e.includes('[]')), r.erros.join(' | '));
  }
  assert.equal(validarRoteiro({ ...roteiroBase, marcasProprias: [], marcasDeTerceiro: [] }).ok, true);
});

test('item de marca vazio ou que nao e texto reprova (regex vazia casaria tudo)', () => {
  const r = validarRoteiro({ ...roteiroBase, marcasDeTerceiro: ['Marca Teste', ' '] });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.includes('marcasDeTerceiro')), r.erros.join(' | '));
});

test('regexDeMarcas escapa caractere especial, ignora caixa e tolera espaco opcional', () => {
  assert.equal(regexDeMarcas([]), null);
  const re = regexDeMarcas(['Acme (Pro)+', 'Marca Teste']);
  assert.ok(re.test('o kit Acme (Pro)+ chegou'));
  assert.ok(!re.test('Acme Pro'), 'parenteses e mais sao literais');
  assert.ok(re.test('MARCATESTE'));
  assert.ok(re.test('marca teste'));
  assert.ok(!regexDeMarcas(['a.c']).test('abc'), 'ponto e literal');
});

test('reprova referencia ao Mercado Livre', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 3 ? { ...b, cena: 'tela do Mercado Livre com o anúncio aberto' } : b) });
  assert.equal(r.ok, false);
});

test('kit exige todos os itens aparecendo no roteiro', () => {
  const r = validarRoteiro({ ...roteiroBase, ehKit: true, itensDoKit: ['168 canetas', 'estojo', 'livro de colorir'] });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => /estojo/i.test(e)), r.erros.join(' | '));
});

test('exige as 4 etapas do AIDA na ordem', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.slice(0, 3) });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => /AIDA/i.test(e)), r.erros.join(' | '));
});

const probeBom = {
  format: { duration: '32.0' },
  streams: [
    { codec_type: 'video', width: 720, height: 1280 },
    { codec_type: 'audio', codec_name: 'aac' },
  ],
};

test('arquivo tecnico correto passa', () => {
  assert.deepEqual(validarTecnico(probeBom, 5_000_000), { ok: true, erros: [] });
});

test('reprova duracao fora de 10 a 60 segundos', () => {
  assert.equal(validarTecnico({ ...probeBom, format: { duration: '8.0' } }, 5e6).ok, false);
  assert.equal(validarTecnico({ ...probeBom, format: { duration: '61.0' } }, 5e6).ok, false);
});

test('reprova proporcao que nao seja 9 por 16', () => {
  const quadrado = { ...probeBom, streams: [{ codec_type: 'video', width: 1080, height: 1080 }, { codec_type: 'audio' }] };
  assert.equal(validarTecnico(quadrado, 5e6).ok, false);
});

test('reprova video sem faixa de audio', () => {
  const mudo = { ...probeBom, streams: [{ codec_type: 'video', width: 720, height: 1280 }] };
  const r = validarTecnico(mudo, 5e6);
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => /[áa]udio/i.test(e)));
});

test('reprova arquivo acima de 280 MB', () => {
  assert.equal(validarTecnico(probeBom, 281 * 1000 * 1000).ok, false);
});

test('reprova urgência e condição de venda por tempo limitado (crítico 1)', () => {
  const testes = [
    { fala: 'leve 2 pague 1 só essa semana' },
    { fala: 'aproveita que é só hoje' },
    { fala: 'corre que são as últimas unidades' },
    { fala: 'condição especial de lançamento' },
  ];
  for (const t of testes) {
    const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 3 ? { ...b, fala: t.fala } : b) });
    assert.equal(r.ok, false, `não reprovou: "${t.fala}"`);
  }
});

test('não reprova "beber" sem fronteira de palavra (crítico 2)', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 0 ? { ...b, fala: 'antes de gravar, vale beber água e relaxar' } : b) });
  assert.equal(r.ok, true, `reprovou "beber" errado: ${r.erros.join(' | ')}`);
});

test('reprova gíria de contato zap e insta (importante 3)', () => {
  const r1 = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 3 ? { ...b, fala: 'chama no meu zap que eu mando' } : b) });
  assert.equal(r1.ok, false, 'não reprovou "zap"');
  const r2 = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 3 ? { ...b, fala: 'segue minha loja no insta' } : b) });
  assert.equal(r2.ok, false, 'não reprovou "insta"');
});

test('reprova endereço com logradouro (importante 4)', () => {
  const testes = [
    { fala: 'moro na Rua das Flores numero 123' },
    { fala: 'fica na Avenida Paulista' },
    { fala: 'passa na Travessa do Carmo' },
    { fala: 'vem pra Alameda Santos' },
  ];
  for (const t of testes) {
    const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 0 ? { ...b, cena: t.fala } : b) });
    assert.equal(r.ok, false, `não reprovou: "${t.fala}"`);
  }
});

test('reprova parentesco de menor com idade (importante 5)', () => {
  const testes = [
    { fala: 'dei de presente pro meu sobrinho de 8 anos' },
    { fala: 'minha neta adora colorir' },
    { fala: 'meu neto tem 7 anos' },
    { fala: 'afilhado de 12 anos adora' },
  ];
  for (const t of testes) {
    const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 0 ? { ...b, fala: t.fala } : b) });
    assert.equal(r.ok, false, `não reprovou: "${t.fala}"`);
  }
});

// ehKit true com itensDoKit vazio: o laço do kit não conferia item nenhum e o
// gate devolvia ok, fingindo que rodou. Não é hipótese, é o que a coleta real
// de um anuncio de kit devolve (título tem "Kit" mas a descrição não lista os itens).
test('kit sem itens declarados reprova em vez de fingir que conferiu', () => {
  const r = validarRoteiro({ ...roteiroBase, ehKit: true, itensDoKit: [] });
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => /itensDoKit/.test(e)), r.erros.join(' | '));

  const semCampo = validarRoteiro({ ...roteiroBase, ehKit: true, itensDoKit: undefined });
  assert.equal(semCampo.ok, false);
});

test('não quebra com caracteres especiais no kit (importante 6)', () => {
  const r = validarRoteiro({ ...roteiroBase, ehKit: true, itensDoKit: ['3+1 estojo brinde'] });
  // não deve dar SyntaxError, deve reprovar porque o item não aparece
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => /estojo/i.test(e)), r.erros.join(' | '));
});

test('round 2: "bebê" com acento TEM que ser barrado', () => {
  const testes = [
    { fala: 'tem um bebê no vídeo', desc: 'com acento e espaço depois' },
    { fala: 'tem um bebê, que fofo', desc: 'com acento e vírgula depois' },
    { fala: 'os bebês adoram', desc: 'plural com acento' },
  ];
  for (const t of testes) {
    const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 0 ? { ...b, fala: t.fala } : b) });
    assert.equal(r.ok, false, `${t.desc}: não barrou "${t.fala}" (${r.erros.join(' | ')})`);
  }
});

test('round 2: "bebe" sem acento TEM que ser barrado', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 0 ? { ...b, fala: 'tem um bebe no video' } : b) });
  assert.equal(r.ok, false, `não barrou "bebe" sem acento (${r.erros.join(' | ')})`);
});

test('round 2: "beber" NUNCA deve ser barrado', () => {
  const testes = [
    'vale beber água antes de gravar',
    'sempre beber muita água',
    'beber faz bem',
  ];
  for (const fala of testes) {
    const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 0 ? { ...b, fala } : b) });
    assert.equal(r.ok, true, `barrou "beber" errado em: "${fala}" (${r.erros.join(' | ')})`);
  }
});

test('correção: "caneta" NÃO deve ser barrada como menor de idade', () => {
  const testes = [
    'essa caneta não seca',
    'as canetas vêm numa caixa',
    'a cornetinha colorida é ótima',
    'cornetinhas de ponta dupla',
  ];
  for (const fala of testes) {
    const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 0 ? { ...b, fala } : b) });
    assert.equal(r.ok, true, `barrou palavra legítima: "${fala}" (${r.erros.join(' | ')})`);
  }
});

test('correção: "neta" continua sendo barrada (mas com lookaround)', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 0 ? { ...b, fala: 'minha neta adora colorir' } : b) });
  assert.equal(r.ok, false, 'não barrou "neta" isolado');
});

test('correção: "neto" continua sendo barrado (mas com lookaround)', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 0 ? { ...b, fala: 'meu neto ganhou de presente' } : b) });
  assert.equal(r.ok, false, 'não barrou "neto" isolado');
});

test('correção: "sobrinho" não faz falso positivo, mas continua barrado isolado', () => {
  // Sobrinho é 8 letras e improvável de estar em palavra comum
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 0 ? { ...b, fala: 'meu sobrinho de 5 anos' } : b) });
  assert.equal(r.ok, false, 'não barrou "sobrinho" isolado');
});

test('correção: "afilhado" não faz falso positivo, mas continua barrado isolado', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 0 ? { ...b, fala: 'minha afilhada adora este produto' } : b) });
  assert.equal(r.ok, false, 'não barrou "afilhada" isolado');
});

test('varredura: "instalação" NÃO pode barrar', () => {
  const testes = [
    'a instalação é simples',
    'luminária com instalação super fácil',
  ];
  for (const fala of testes) {
    const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 0 ? { ...b, fala } : b) });
    assert.equal(r.ok, true, `barrou palavra legítima: "${fala}" (${r.erros.join(' | ')})`);
  }
});

test('varredura: "instantâneo" NÃO pode barrar', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 3 ? { ...b, fala: 'efeito instantâneo na secagem' } : b) });
  assert.equal(r.ok, true, `barrou palavra legítima: ${r.erros.join(' | ')}`);
});

test('varredura: "instante" NÃO pode barrar', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 0 ? { ...b, fala: 'nesse instante você vai notar' } : b) });
  assert.equal(r.ok, true, `barrou palavra legítima: ${r.erros.join(' | ')}`);
});

test('varredura: "insta" continua barrado isolado', () => {
  const testes = [
    'segue minha loja no insta',
    'meu insta é @canetas',
  ];
  for (const fala of testes) {
    const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 3 ? { ...b, fala } : b) });
    assert.equal(r.ok, false, `não barrou "insta" isolado em: "${fala}"`);
  }
});

test('varredura: "instagram" continua barrado', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 3 ? { ...b, fala: 'meu instagram é esse' } : b) });
  assert.equal(r.ok, false, `não barrou "instagram"`);
});

test('round 3 (achado 1, regressão crítica): família parcela/parcelado/parcelamento continua barrada', () => {
  // essa é a regressão real: o round anterior blindou "parcel" com lookaround dos DOIS lados,
  // e como nenhuma palavra de verdade termina em "parcel" puro (é sempre parcela/parcelado/
  // parcelamento), o lookahead à direita liberou o grupo inteiro. condição de venda tem que
  // continuar proibida, testado com frase que uma pessoa real escreveria.
  const testes = [
    'parcela em 12 vezes sem juros',
    'parcelamento em até 12x sem juros',
    'compra parcelada sem juros',
    'aceita cartão parcelado',
    'valor de cada parcela é pequeno',
  ];
  for (const fala of testes) {
    const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 3 ? { ...b, fala } : b) });
    assert.equal(r.ok, false, `não barrou "${fala}" (regressão do achado 1 voltou)`);
  }
});

test('round 3 (achado 1): "imparcial" e "parcialidade" não devem barrar', () => {
  const testes = [
    'o juiz foi imparcial na decisão',
    'não houve parcialidade no julgamento',
  ];
  for (const fala of testes) {
    const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 0 ? { ...b, fala } : b) });
    assert.equal(r.ok, true, `barrou palavra legítima: "${fala}" (${r.erros.join(' | ')})`);
  }
});

test('adendo: reprova tag de áudio em fala', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 0 ? { ...b, fala: 'oi gente [sighs] tudo bem' } : b) });
  assert.equal(r.ok, false, 'não reprovou tag [sighs] em fala');
  assert.ok(r.erros.some((e) => /tag|áudio|colchete/i.test(e)), r.erros.join(' | '));
});

test('adendo: reprova tag de áudio em cena', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 0 ? { ...b, cena: 'mulher sorrindo [pausa longa]' } : b) });
  assert.equal(r.ok, false, 'não reprovou tag [pausa longa] em cena');
  assert.ok(r.erros.some((e) => /tag|áudio|colchete/i.test(e)), r.erros.join(' | '));
});

test('adendo: reprova tag inventada de áudio', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 2 ? { ...b, fala: 'isso é muito [warmly] falado' } : b) });
  assert.equal(r.ok, false, 'não reprovou tag [warmly] inventada');
});

test('adendo: roteiro sem tag de áudio continua aprovando', () => {
  const r = validarRoteiro(roteiroBase);
  assert.equal(r.ok, true, `reprovou roteiro limpo: ${r.erros.join(' | ')}`);
});

// --- Round 3: achado 2, 5 falsos positivos confirmados ao vivo + achado 3, gap achado na varredura ---

test('round 3 (achado 2.1): "reais" sem número perto tem que passar', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 1 ? { ...b, fala: 'as cores saem bem reais no papel' } : b) });
  assert.equal(r.ok, true, `barrou "reais" sem dinheiro por perto: ${r.erros.join(' | ')}`);
});

test('round 3 (achado 2.1): "reais" com número continua barrando (é dinheiro)', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 3 ? { ...b, fala: 'custa 50 reais e vale muito a pena' } : b) });
  assert.equal(r.ok, false, 'não barrou "50 reais"');
});

test('round 3 (achado 2.2): "precoce" não pode barrar como preço', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 2 ? { ...b, fala: 'o efeito parece meio precoce ainda' } : b) });
  assert.equal(r.ok, true, `barrou "precoce" achando que era preço: ${r.erros.join(' | ')}`);
});

test('round 3 (achado 2.2): "preço" isolado continua barrando', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 3 ? { ...b, fala: 'qual é o preço desse kit' } : b) });
  assert.equal(r.ok, false, 'não barrou "preço"');
});

test('round 3 (achado 2.3): comparar o produto com ele mesmo no tempo tem que passar', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 2 ? { ...b, fala: 'com a prática o traço fica melhor que no começo' } : b) });
  assert.equal(r.ok, true, `barrou comparação do produto com ele mesmo: ${r.erros.join(' | ')}`);
});

test('round 3 (achado 2.3): comparar com a concorrência continua barrando', () => {
  const r1 = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 2 ? { ...b, fala: 'essa aqui é melhor que a concorrência' } : b) });
  assert.equal(r1.ok, false, 'não barrou "melhor que a concorrência"');
  const r2 = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 2 ? { ...b, fala: 'somos melhor que qualquer outra marca do mercado' } : b) });
  assert.equal(r2.ok, false, 'não barrou "melhor que qualquer outra marca"');
});

test('round 3 (achado 2.4): CTA genérico de carrinho tem que passar', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 3 ? { ...b, fala: 'adiciona ao carrinho e garante o seu' } : b) });
  assert.equal(r.ok, true, `barrou CTA genérico de carrinho: ${r.erros.join(' | ')}`);
});

test('round 3 (achado 2.4): mostrar a tela do carrinho continua barrando', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 3 ? { ...b, cena: 'mostra a tela do carrinho lotado de produtos' } : b) });
  assert.equal(r.ok, false, 'não barrou tela do carrinho');
});

test('round 4 (REGRA DA CASA, 2026-08-08): garantia/validade/durabilidade em anos NÃO passam mais', () => {
  // mudou de comportamento no round 4: antes eram legítimas pra regra do ML (que permite garantia),
  // agora a REGRA DA CASA proíbe qualquer valor variável, garantia inclusa, porque o vídeo é
  // permanente e a garantia pode mudar
  const testes = [
    'vem com garantia de 2 anos',
    'prazo de validade de 2 anos',
    'produto com durabilidade de 3 anos',
  ];
  for (const fala of testes) {
    const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 3 ? { ...b, fala } : b) });
    assert.equal(r.ok, false, `não barrou "${fala}" (REGRA DA CASA: valor variável tem que barrar)`);
  }
});

test('round 3 (achado 2.5): idade de criança fora do contexto de garantia continua barrando', () => {
  const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 0 ? { ...b, fala: 'tem uma irmã de 8 anos que adora desenhar' } : b) });
  assert.equal(r.ok, false, 'não barrou "de 8 anos" fora de garantia/validade/durabilidade');
});

test('round 3 (achado 3, gap da varredura anterior): "sortear" tem que barrar igual "sorteio"', () => {
  // a varredura anterior só tinha teste pra "sorteio" no texto do relatório, nunca um teste real;
  // "sortear"/"sorteando"/"sorteado" não batiam em nenhum padrão do grupo sorteio
  const testes = ['vamos sortear um kit', 'estamos sorteando um kit hoje', 'kit já sorteado pro ganhador'];
  for (const fala of testes) {
    const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 3 ? { ...b, fala } : b) });
    assert.equal(r.ok, false, `não barrou "${fala}"`);
  }
});

test('round 3 (achado 3): vocabulário normal da loja (papelaria, doces, casa, suplemento) não pode barrar', () => {
  // "suplemento com validade de 2 anos" saiu daqui no round 4: validade é termo comercial e a
  // REGRA DA CASA passou a proibir mesmo sendo legítimo pra regra do ML (ver teste da REGRA DA CASA)
  const testes = [
    'vem com 36 cores diferentes no estojo',
    'a ponta é fininha, ótima pra detalhes',
    'luminária com instalação super fácil na parede',
    'vem com 12 unidades no pacote',
  ];
  for (const fala of testes) {
    const r = validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, i) => i === 1 ? { ...b, fala } : b) });
    assert.equal(r.ok, true, `barrou vocabulário legítimo: "${fala}" (${r.erros.join(' | ')})`);
  }
});

// --- Round 4 (dono novo, 2026-08-08): REGRA DA CASA, vídeo não fala de nada variável ---
// A regra foi simplificada: preço, promoção, parcelamento, frete, garantia, prazo, validade e
// durabilidade em tempo NÃO podem aparecer NUNCA, mesmo quando seriam legítimos pra regra do ML
// (ex: "garantia de 2 anos"). Isso destrava o gate porque não precisa mais distinguir "legítimo" de
// "proibido" nesses termos: os dois são proibidos agora, um pela regra do ML e outro pela regra da
// casa. Ver testes específicos abaixo pra cada peça nova do grupo comercial, mais os 3 buracos que a
// revisão achou (diminutivo/sinônimo de menor, contato, sorteio, comparação com concorrente).

function comFala(fala, i = 3) {
  return validarRoteiro({ ...roteiroBase, blocos: roteiroBase.blocos.map((b, idx) => idx === i ? { ...b, fala } : b) });
}

test('round 4: número com 2 casas decimais é sempre dinheiro e barra', () => {
  for (const fala of ['sai por 39,90', 'sai por 29.90 hoje']) {
    assert.equal(comFala(fala).ok, false, `não barrou "${fala}"`);
  }
});

test('round 4: número inteiro de especificação (sem 2 casas decimais) não barra por causa do valor', () => {
  // "0,4" só tem 1 casa decimal (é medida, não dinheiro): "ponta dupla de 0,4 e 2 milímetros"
  const r = comFala('ponta dupla de 0,4 e 2 milímetros');
  assert.equal(r.ok, true, `barrou spec legítima: ${r.erros.join(' | ')}`);
});

test('round 4: porcentagem barra (símbolo e por extenso)', () => {
  assert.equal(comFala('50% de desconto').ok, false, 'não barrou "50%"');
  assert.equal(comFala('vinte por cento a mais de pigmento').ok, false, 'não barrou "por cento"');
});

test('round 4: parcelamento em qualquer forma barra ("12x", "12 x", "em N vezes", "sem juros", "divide no cartão")', () => {
  const testes = ['12x sem juros', '12 x sem juros', 'divide no cartão em 10 vezes', 'compra em 3 vezes'];
  for (const fala of testes) {
    assert.equal(comFala(fala).ok, false, `não barrou "${fala}"`);
  }
});

test('round 4: construções de preço barram ("custa", "custo", "valor", "fica em/por", "a partir de", "de X por Y")', () => {
  const testes = [
    'custa quarenta reais',
    'o custo vale muito a pena',
    'o valor cabe no bolso',
    'fica em conta pra qualquer um',
    'fica por menos que isso',
    'a partir de hoje já pode usar',
    'de 80 por 49,90',
  ];
  for (const fala of testes) {
    assert.equal(comFala(fala).ok, false, `não barrou "${fala}"`);
  }
});

test('round 4: logística e pós-venda barram (frete, entrega, prazo, brinde, garantia, troca, devolução, validade)', () => {
  const testes = [
    'entrega rápida pra todo Brasil',
    'chega no prazo combinado',
    'vem com brinde surpresa',
    'aceita troca sem problema',
    'devolução garantida se não gostar',
  ];
  for (const fala of testes) {
    assert.equal(comFala(fala).ok, false, `não barrou "${fala}"`);
  }
});

test('round 4: durabilidade contada em tempo barra ("dura N anos", "N meses de uso")', () => {
  assert.equal(comFala('dura mais de 3 anos sem desbotar').ok, false, 'não barrou "dura mais de 3 anos"');
  assert.equal(comFala('depois de 6 meses de uso continua igual').ok, false, 'não barrou "6 meses de uso"');
});

test('round 4 (buraco 1): diminutivo e sinônimo de menor de idade barram', () => {
  const testes = [
    { fala: 'minha netinha adorou', i: 0 },
    { fala: 'meu netinho não larga', i: 0 },
    { fala: 'a criancinha não larga', i: 0 },
    { fala: 'aquele garoto ali gostou', i: 0 },
    { fala: 'aquela garota ali gostou', i: 0 },
    { fala: 'minha garotinha adora colorir', i: 0 },
    { fala: 'pra molecada da sala', i: 0 },
    { fala: 'meu enteado adora desenhar', i: 0 },
    { fala: 'é ótimo pra os pequenos da casa', i: 0 },
  ];
  for (const t of testes) {
    const r = comFala(t.fala, t.i);
    assert.equal(r.ok, false, `não barrou "${t.fala}" (${r.erros.join(' | ')})`);
  }
});

test('round 4 (buraco 2): gíria de contato "direct", "dm" e "wpp" barram', () => {
  assert.equal(comFala('chama no direct').ok, false, 'não barrou "direct"');
  assert.equal(comFala('me chama no wpp').ok, false, 'não barrou "wpp"');
  assert.equal(comFala('manda um dm que eu respondo').ok, false, 'não barrou "dm"');
});

test('round 4 (buraco 2): "dm" isolado não faz falso positivo em "admin"', () => {
  const r = comFala('o admin da loja confirma o pedido');
  assert.equal(r.ok, true, `barrou palavra legítima: ${r.erros.join(' | ')}`);
});

test('round 4 (buraco 3): "sorteia" e "sorteamos" barram igual "sorteio"', () => {
  assert.equal(comFala('sorteia um kit toda semana').ok, false, 'não barrou "sorteia"');
  assert.equal(comFala('sorteamos entre quem comentar').ok, false, 'não barrou "sorteamos"');
});

test('round 4 (buraco 4): comparação com concorrente cobre "do que", "ganha de", "deixa no chão" e "superior aos"', () => {
  const testes = [
    'melhor do que a concorrência',
    'ganha de qualquer outra marca',
    'deixa a concorrência no chão',
    'é superior aos concorrentes',
  ];
  for (const fala of testes) {
    assert.equal(comFala(fala).ok, false, `não barrou "${fala}"`);
  }
});

test('round 4: mensagem de erro do grupo comercial cita a REGRA DA CASA, não a regra do ML', () => {
  const r = comFala('vem com garantia de 2 anos');
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => /permanente|reprecifica[çc][ãa]o/i.test(e)), r.erros.join(' | '));
});

test('round 4: prova ao vivo, lista BARRAM do brief (20 frases, todas têm que reprovar)', () => {
  const barram = [
    'sai por 39,90', 'custa 39,90', 'por apenas 29,90 você leva', 'de 80 por 49,90',
    'custa quarenta reais', '12x sem juros', 'divide no cartão em 10 vezes', 'parcela em 12 vezes',
    '50% de desconto', 'frete grátis pra todo Brasil', 'a garantia é de 2 anos', 'dura mais de 3 anos',
    'minha netinha adorou', 'a criancinha não larga', 'pra molecada da sala', 'chama no direct',
    'me chama no wpp', 'sorteia um kit', 'melhor do que a concorrência', 'deixa a concorrência no chão',
  ];
  for (const fala of barram) {
    const r = comFala(fala, 3);
    assert.equal(r.ok, false, `não barrou "${fala}" (${r.erros.join(' | ')})`);
  }
});

test('round 4: prova ao vivo, lista PASSAM do brief (12 frases, todas têm que aprovar)', () => {
  const passam = [
    'vem com 168 canetas', 'são 80 cores diferentes', 'a garrafa tem 1600 ml', 'o kit tem 5 unidades',
    '36 cores vibrantes', 'essa caneta não seca', 'a instalação é simples', 'efeito instantâneo na secagem',
    'as cores saem bem reais no papel', 'o traço sai igual do começo ao fim', 'cabe na mochila sem pesar',
    'a tinta não borra no papel',
  ];
  for (const fala of passam) {
    const r = comFala(fala, 1);
    assert.equal(r.ok, true, `barrou frase legítima: "${fala}" (${r.erros.join(' | ')})`);
  }
});

// ---------------------------------------------------------------------------
// REVISÃO FINAL (importante 6): o gate era enumeração de frase e tinha buraco
// de CLASSE. Todas as frases abaixo foram rodadas contra o gate anterior e
// APROVARAM, uma a uma. A primeira dupla é a que mais dói: o ator recomendado
// pela própria SKILL.md é professora, e "meus alunos" é referência a menor de
// idade, a regra mais sensível do ML.
test('revisão final: menor de idade cobre a classe, não só a lista velha', () => {
  const barram = [
    'meus alunos adoram usar essas canetas',
    'a minha turma do quinto ano usa toda semana',
    'meu priminho usa direto lá em casa',
    'o pimpolho lá de casa vive pintando',
    'a garotada da rua vive pedindo emprestado',
    'levei pra creche e foi sucesso',
  ];
  for (const fala of barram) assert.equal(comFala(fala).ok, false, `não barrou "${fala}"`);
});

test('revisão final: urgência e condição de venda barram mesmo sem número', () => {
  const barram = [
    'aproveita por tempo limitado',
    'corre que tá acabando o estoque',
    'não perca essa chance',
    'leve dois pague um',
    'é só enquanto dura',
    'últimos dias pra garantir',
  ];
  for (const fala of barram) assert.equal(comFala(fala).ok, false, `não barrou "${fala}"`);
});

test('revisão final: dinheiro por extenso barra, mas exige numeral colado', () => {
  assert.equal(comFala('são quarenta reais bem gastos').ok, false, 'não barrou dinheiro por extenso');
  assert.equal(comFala('sai por dez pila').ok, false, 'não barrou gíria de dinheiro');
  // a armadilha: "reais" sem numeral do lado é adjetivo e está na lista PASSAM do brief
  assert.equal(comFala('as cores saem bem reais no papel', 1).ok, true, 'barrou frase legítima com "reais"');
});

test('revisão final: comparação genérica com concorrente barra mesmo sem citar marca', () => {
  for (const fala of ['mais barata que a concorrência toda', 'a concorrência não chega perto']) {
    assert.equal(comFala(fala).ok, false, `não barrou "${fala}"`);
  }
});

test('revisão final: "zapzap" barra igual "zap"', () => {
  assert.equal(comFala('zapzap comigo se tiver dúvida').ok, false, 'não barrou "zapzap"');
});

// Varredura de colisão contra o vocabulário REAL da loja (rodada nos 17
// copy.md de anuncios/): fronteira de palavra em português já mordeu 5 vezes
// neste projeto, porque o \b do JavaScript não trata acento como letra e termo
// curto casa dentro de palavra comum. "pé de moleque" é produto do catálogo
// (kit-mix-festa-caseiros, 36 ocorrências) e batia no termo "moleque".
test('revisão final: varredura de colisão com o vocabulário real da loja', () => {
  const passam = [
    'o pé de moleque vem bem sequinho na embalagem',      // moleque
    'a bala de coco tem gosto de festa junina',           // festa/criança por perto
    'a caneta não seca nem depois de semanas abertas',    // acabando
    'a instalação da luminária é simples',                // insta
    'o traço sai igual do começo ao fim',                 // barat/mais
    'as cores saem bem reais no papel',                   // reais
    'cabe na mochila sem pesar nada',
    'a paleta tem 80 cores diferentes',
  ];
  for (const fala of passam) {
    const r = comFala(fala, 1);
    assert.equal(r.ok, true, `barrou vocabulário legítimo da loja: "${fala}" (${r.erros.join(' | ')})`);
  }
});

// RE-REVISÃO: descuido de cobrir só UMA grafia. O lookbehind do "pé de moleque"
// (produto do catálogo) pegava só a forma com espaço, e o prefixo novo "turm"
// mordia "turmalina".
test('re-revisão: "pé de moleque" passa em todas as grafias, e "turmalina" não é turma', () => {
  const passam = [
    'o pé de moleque vem bem sequinho',
    'o pé-de-moleque vem bem sequinho',
    'os pés de moleque vêm bem sequinhos',
    'a cor lembra turmalina rosa',
  ];
  for (const fala of passam) {
    const r = comFala(fala, 1);
    assert.equal(r.ok, true, `barrou vocabulário legítimo: "${fala}" (${r.erros.join(' | ')})`);
  }
  // e o moleque de verdade continua barrado
  assert.equal(comFala('o moleque adorou pintar').ok, false, 'não barrou "moleque" sozinho');
  assert.equal(comFala('a molecada da sala vive pedindo').ok, false, 'não barrou "molecada"');
});

test('re-revisão: as flexões que ficaram de fora na primeira passada barram', () => {
  const barram = [
    'a minha irmãzinha vive desenhando',   // só irmãozinho estava coberto
    'não percam essa chance',              // só "não perca" estava coberto
    'as cores estão acabando rápido',      // só "está/tá acabando" estava coberto
    'a turminha lá de casa vive usando',   // turminha
    'leve dois e pague um',                // com o "e" no meio
    'sai por seiscentos reais',            // numeral que faltava na lista
  ];
  for (const fala of barram) assert.equal(comFala(fala).ok, false, `não barrou "${fala}"`);
});

// RE-REVISÃO, resíduo: mesmo defeito de flexão única no grupo de urgência, duas
// linhas acima da regex que acabou de ser consertada. Imperativo e número são
// as duas dobras que escapam: quem escreve roteiro escreve "corra", "corram",
// "leva dois paga um" e "a última unidade", não a forma do dicionário.
test('re-revisão: urgência barra em todas as flexões de imperativo e de número', () => {
  const barram = [
    'corra que vai acabar',
    'corram que vai acabar',
    'correm pra garantir o seu',
    'é a última unidade que sobrou',
    'leva dois paga um',
    'levem três paguem dois',
    'é só enquanto durar',
    'condições especiais pra você',
    'as cores vão acabar rapidinho',
  ];
  for (const fala of barram) assert.equal(comFala(fala).ok, false, `não barrou "${fala}"`);
});

test('re-revisão: o aperto na urgência não morde o vocabulário da loja', () => {
  const passam = [
    'o traço corre solto no papel',
    'a tinta escorre menos que a das outras cornetinhas',
    'a última camada de cor fica bem viva',
    'cada unidade vem lacrada de fábrica',
  ];
  for (const fala of passam) {
    const r = comFala(fala, 1);
    assert.equal(r.ok, true, `barrou frase legítima: "${fala}" (${r.erros.join(' | ')})`);
  }
});

// ---------------------------------------------------------------------------
// AIDA em 4 a 7 blocos (2026-08-14). Antes o gate exigia exatamente 4 blocos com
// uma etapa cada. A mineração das perguntas reais do nicho de articulação achou
// 6 dúvidas que decidem a compra, e em 4 blocos só cabem 2 ou 3, então mais de
// um bloco passou a poder servir a mesma etapa. O que NÃO pode afrouxar: a
// sequência anda só pra frente e as 4 etapas continuam obrigatórias.
// ---------------------------------------------------------------------------

// monta um roteiro com as etapas pedidas, reusando falas que já passam no gate
const comEtapas = (etapas) => ({
  ...roteiroBase,
  blocos: etapas.map((etapa, i) => ({
    etapa,
    tipo: i % 2 === 0 ? 'pessoa' : 'produto',
    fala: roteiroBase.blocos[i % 4].fala,
    cena: roteiroBase.blocos[i % 4].cena,
  })),
});

test('aceita 7 blocos com etapa repetida, desde que ande pra frente', () => {
  const r = validarRoteiro(comEtapas([
    'atencao', 'interesse', 'interesse', 'desejo', 'desejo', 'desejo', 'acao',
  ]));
  assert.deepEqual(r, { ok: true, erros: [] });
});

test('aceita 5 e 6 blocos', () => {
  for (const etapas of [
    ['atencao', 'interesse', 'desejo', 'desejo', 'acao'],
    ['atencao', 'atencao', 'interesse', 'desejo', 'desejo', 'acao'],
  ]) {
    const r = validarRoteiro(comEtapas(etapas));
    assert.equal(r.ok, true, `${etapas.length} blocos reprovaram: ${r.erros.join(' | ')}`);
  }
});

test('reprova 8 blocos, que estouram os 60s do ML', () => {
  const r = validarRoteiro(comEtapas([
    'atencao', 'interesse', 'interesse', 'desejo', 'desejo', 'desejo', 'acao', 'acao',
  ]));
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => /AIDA/i.test(e) && /60s/.test(e)), r.erros.join(' | '));
});

test('reprova AIDA que volta pra trás', () => {
  const r = validarRoteiro(comEtapas(['atencao', 'desejo', 'interesse', 'acao']));
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => /fora de ordem/i.test(e)), r.erros.join(' | '));
});

test('reprova quando falta uma etapa, mesmo com bloco sobrando', () => {
  const r = validarRoteiro(comEtapas(['atencao', 'interesse', 'interesse', 'interesse', 'acao']));
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => /falta desejo/i.test(e)), r.erros.join(' | '));
});

test('reprova etapa que não existe no AIDA', () => {
  const r = validarRoteiro(comEtapas(['atencao', 'interesse', 'conversao', 'acao']));
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => /desconhecida/i.test(e)), r.erros.join(' | '));
});
