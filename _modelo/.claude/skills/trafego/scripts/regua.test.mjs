// Testes da leitura da régua e do texto do quadro.
// Rodar: node --test _modelo/.claude/skills/trafego/scripts/regua.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerRegua, textoDoQuadro, conferirConta } from './regua.mjs';
import { quadroDe } from './faixas.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const REGUA_MD = [
  '# Régua de tráfego',
  '',
  'Bloco lido pelo /trafego. Edite os valores e mantenha os nomes.',
  '',
  '```regua',
  'objetivo: conversa',
  'perfil: local',
  'ticket: 60',
  'margem_minima: 0',
  'origem_do_resultado: meta',
  'contas: 123456789012345, 987654321098765',
  '```',
  '',
  '## Como cheguei nesse ticket',
  'De cada 10 conversas, 3 viram paciente. Cada paciente paga R$ 800, e 25% pode ir pra anúncio.',
].join('\n');

test('lê o bloco da régua e ignora o texto em volta', () => {
  const r = lerRegua(REGUA_MD);
  assert.equal(r.objetivo, 'conversa');
  assert.equal(r.perfil, 'local');
  assert.equal(r.ticket, 60);
  assert.equal(r.margem_minima, 0);
  assert.deepEqual(r.contas, ['123456789012345', '987654321098765']);
});

test('régua sem bloco avisa o que fazer em vez de devolver vazio', () => {
  assert.throws(() => lerRegua('# só um título\n\nnada aqui'), /bloco .*regua/i);
});

test('régua sem ticket avisa, porque sem ticket não existe corte', () => {
  assert.throws(() => lerRegua('```regua\nobjetivo: conversa\n```'), /ticket/i);
});

test('o texto do quadro abre pelo placar e traz o motivo de cada corte', () => {
  const entrada = { conta: '1', ate: '2026-09-18', hoje: '2026-09-18', resultado_ate: '2026-09-18',
    anuncios: [{ id: 'a', nome: 'dentista-01', gasto: 70, resultados: 0 }] };
  const txt = textoDoQuadro(quadroDe(entrada, lerRegua(REGUA_MD)), lerRegua(REGUA_MD));
  assert.match(txt, /CRITICO/);
  assert.match(txt, /dentista-01/);
  assert.match(txt, /mais de 1 ticket/);
  assert.match(txt, /pode ir/i);
});

// Todo `.md` deste kit é CRLF, e a régua é o único markdown que o código lê em
// produção. Hoje o parse aguenta porque o `\s*$` do regex engole o `\r`, e isso
// é acidente e não garantia: sem este teste, uma refatoração da quebra de linha
// reintroduz em silêncio o bug que já apareceu três vezes no licoes.md.
test('régua com quebra de linha do Windows é lida igual', () => {
  const r = lerRegua(REGUA_MD.split('\n').join('\r\n'));
  assert.equal(r.ticket, 60);
  assert.equal(r.objetivo, 'conversa');
  assert.deepEqual(r.contas, ['123456789012345', '987654321098765']);
});

test('com o teto batido, o texto não entrega lista de corte nenhuma', () => {
  const anuncios = Array.from({ length: 11 }, (_, i) => ({ id: `a${i}`, nome: `an-${i}`, gasto: 70, resultados: 0 }));
  const entrada = { conta: '1', ate: '2026-09-18', hoje: '2026-09-18', resultado_ate: '2026-09-18', anuncios };
  const regua = lerRegua(REGUA_MD);
  const txt = textoDoQuadro(quadroDe(entrada, regua), regua);
  assert.match(txt, /confira o ticket/i);
  assert.doesNotMatch(txt, /Proposta: pausar/);
});

test('sem nada a cortar, o texto diz isso e não inventa proposta', () => {
  const entrada = { conta: '1', ate: '2026-09-18', hoje: '2026-09-18', resultado_ate: '2026-09-18',
    anuncios: [{ id: 'a', nome: 'novinho', gasto: 20, resultados: 0 }] };
  const regua = lerRegua(REGUA_MD);
  const txt = textoDoQuadro(quadroDe(entrada, regua), regua);
  assert.match(txt, /Nada a cortar/i);
  assert.doesNotMatch(txt, /Proposta: pausar/);
});

const REGUA_COMPRA = [
  '```regua',
  'objetivo: compra',
  'perfil: low_ticket',
  'ticket: 40',
  'margem_minima: 0',
  'origem_do_resultado: meta',
  'contas: 123456789012345',
  '```',
].join('\n');

function extratoB(anuncio) {
  return { conta: '123456789012345', de: '2026-09-19', ate: '2026-09-19', hoje: '2026-09-19',
    resultado_ate: '2026-09-19', anuncios: [anuncio] };
}

test('sem o orçamento da campanha o texto avisa da cegueira e larga a frase de tranquilidade', () => {
  const regua = lerRegua(REGUA_COMPRA);
  const txt = textoDoQuadro(quadroDe(extratoB(
    { id: 'b1', nome: 'queimando', gasto: 5000, resultados: 50, receita: 1000, ativo: true },
  ), regua), regua);
  assert.match(txt, /orcamento_dia_campanha/);
  assert.match(txt, /corte por retorno/);
  assert.doesNotMatch(txt, /Nada a cortar/i);
});

test('com o orçamento da campanha o aviso some, e o texto continua entregando o corte', () => {
  const regua = lerRegua(REGUA_COMPRA);
  const txt = textoDoQuadro(quadroDe(extratoB(
    { id: 'b1', nome: 'queimando', gasto: 5000, resultados: 50, receita: 1000, campanha: 'c1', orcamento_dia_campanha: 6000, ativo: true },
  ), regua), regua);
  // Teste negativo: sem conferir que a saída veio cheia, o "não apareceu" passa
  // por verde num texto vazio.
  assert.ok(txt.trim().length > 0);
  assert.match(txt, /queimando/);
  assert.match(txt, /Proposta: pausar/);
  assert.doesNotMatch(txt, /orcamento_dia_campanha/);
});

// Trava 6 da spec: a régua só olha conta declarada. O campo `contas` era
// parseado e nunca comparado com nada, então a proteção existia no papel e não
// no código. Julgar a conta de outro negócio com esta régua erra o ticket, o
// piso e o corte de uma vez, e por isso recusar é melhor que responder.
test('conta do extrato fora da lista declarada é recusada, com os dois números na mensagem', () => {
  const c = conferirConta({ conta: '999999999999999' }, lerRegua(REGUA_MD));
  assert.equal(c.ok, false);
  assert.match(c.erro, /999999999999999/);
  assert.match(c.erro, /123456789012345/);
});

test('conta declarada passa sem aviso nenhum', () => {
  const c = conferirConta({ conta: '987654321098765' }, lerRegua(REGUA_MD));
  // Teste negativo: confere que a conferência rodou de verdade antes de
  // celebrar a ausência de aviso.
  assert.equal(c.ok, true);
  assert.equal(c.conferida, true);
  assert.equal(c.aviso, null);
});

test('régua sem contas declaradas aceita e segue, com aviso de uma linha', () => {
  const semContas = lerRegua(REGUA_MD.replace('contas: 123456789012345, 987654321098765', 'perfil: local'));
  assert.deepEqual(semContas.contas, []);
  const c = conferirConta({ conta: '999999999999999' }, semContas);
  assert.equal(c.ok, true);
  assert.equal(c.conferida, false);
  assert.ok(c.aviso && c.aviso.length > 0);
  assert.match(c.aviso, /contas/);
});

test('extrato sem o campo conta segue com aviso, porque não há o que comparar', () => {
  const c = conferirConta({ anuncios: [] }, lerRegua(REGUA_MD));
  assert.equal(c.ok, true);
  assert.equal(c.conferida, false);
  assert.ok(c.aviso && c.aviso.length > 0);
});

test('com dado parado, o aviso vem na primeira linha do texto', () => {
  const entrada = { conta: '1', ate: '2026-09-18', hoje: '2026-09-18', resultado_ate: '2026-09-16',
    anuncios: [{ id: 'a', nome: 'dentista-01', gasto: 70, resultados: 0 }] };
  const txt = textoDoQuadro(quadroDe(entrada, lerRegua(REGUA_MD)), lerRegua(REGUA_MD));
  assert.match(txt.split('\n')[0], /param em 2026-09-16/);
});

// A trava 6 age no bloco de linha de comando, entao ela so se prova rodando o
// script como processo. Testar o modulo direto deixa a ligacao sem cobertura, e
// quando ela cai a regua nao fica calada: ela julga a conta de outro negocio
// com o ticket e o corte errados, e imprime a proposta com confianca total.
const SCRIPT_CLI = fileURLToPath(new URL('./regua.mjs', import.meta.url));

function rodarCLI(reguaTexto, dados) {
  const pasta = mkdtempSync(join(tmpdir(), 'trafego-cli-'));
  try {
    const fRegua = join(pasta, 'regua.md');
    const fDados = join(pasta, 'dados.json');
    writeFileSync(fRegua, reguaTexto, 'utf8');
    writeFileSync(fDados, JSON.stringify(dados), 'utf8');
    const r = spawnSync(process.execPath, [SCRIPT_CLI, '--dados', fDados, '--regua', fRegua], { encoding: 'utf8' });
    return { code: r.status, saida: r.stdout ?? '', erro: r.stderr ?? '' };
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

const ANUNCIOS_CLI = {
  anuncios: [{ id: 'a', nome: 'dentista-01', gasto: 70, resultados: 0, campanha: 'C', orcamento_dia_campanha: 100 }],
};

test('o script recusa extrato de conta que a régua não declara', () => {
  const r = rodarCLI(REGUA_MD, { conta: '999999999999999', ...ANUNCIOS_CLI });
  assert.equal(r.code, 1, 'conta de fora precisa sair com código de erro');
  assert.ok(r.erro.includes('999999999999999'), 'a mensagem precisa dizer qual conta veio no extrato');
  assert.ok(r.erro.includes('nada foi julgado aqui'), 'a mensagem precisa deixar claro que ninguém foi julgado');
  assert.equal(r.saida.trim(), '', 'nenhum quadro pode sair quando o extrato é de outro negócio');
});

test('o script julga normalmente quando a conta está declarada', () => {
  const r = rodarCLI(REGUA_MD, { conta: '123456789012345', ...ANUNCIOS_CLI });
  assert.equal(r.code, 0);
  assert.ok(r.saida.length > 0, 'o quadro não pode sair vazio');
  assert.ok(r.saida.includes('Quadro de'), 'o quadro precisa sair de verdade');
});

test('régua sem contas preenchidas segue, e avisa que não conferiu', () => {
  const semContas = REGUA_MD.replace('contas: 123456789012345, 987654321098765', 'contas: ');
  const r = rodarCLI(semContas, { conta: '999999999999999', ...ANUNCIOS_CLI });
  assert.equal(r.code, 0, 'quem ainda não preencheu contas não pode ficar travado');
  assert.ok(r.saida.length > 0, 'o quadro não pode sair vazio');
  assert.ok(r.saida.includes('sem a linha `contas` preenchida'), 'o aviso precisa aparecer no quadro');
});
