// Testes do método do /trafego. Aritmética pura, sem rede e sem arquivo.
// Rodar: node --test _modelo/.claude/skills/trafego/scripts/faixas.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { faixaDoAnuncio, METODO, empateDe, PERFIS, ticketDeContato, receitaDoAnuncio, nomeDoResultado, quadroDe } from './faixas.mjs';

const ctxBase = {
  ticket: 40,
  empate: { piso: 1, aprova: 1.3 },
  metodo: METODO,
  nome_resultado: 'venda',
  fatia: 120,
};

test('gastou 1 ticket sem nenhum resultado, cai na hora', () => {
  const v = faixaDoAnuncio({ id: 'a', gasto: 44.12, resultados: 0, receita: 0 }, ctxBase);
  assert.equal(v.faixa, 'CRITICO');
  assert.equal(v.acao, 'pausar');
  assert.match(v.motivo, /sem nenhuma venda/);
});

test('gastou menos de 1 ticket, ninguém julga quem ainda não falou', () => {
  const v = faixaDoAnuncio({ id: 'a', gasto: 12, resultados: 0, receita: 0 }, ctxBase);
  assert.equal(v.faixa, 'RONDA');
  assert.equal(v.acao, 'deixar rodar');
});

test('5 resultados acima do meio da faixa viram PASSE', () => {
  const v = faixaDoAnuncio({ id: 'a', gasto: 100, resultados: 5, receita: 200 }, ctxBase);
  assert.equal(v.faixa, 'PASSE');
  assert.equal(v.acao, 'liberar verba');
});

test('retorno 0,7948 sobre 3 resultados não condena: pouco volume é variância', () => {
  const ctx = { ...ctxBase, fatia: 120, empate: { piso: 1, aprova: 1.3 } };
  const v = faixaDoAnuncio({ id: 'a', gasto: 100, resultados: 3, receita: 79.48 }, ctx);
  assert.equal(v.faixa, 'RONDA');
  assert.equal(v.protegido_por, 'volume');
  assert.match(v.motivo, /pouco volume/);
});

test('retorno de 7 dias acima do piso segura o corte de um dia magro', () => {
  const ctx = { ...ctxBase, fatia: 120 };
  const anuncio = { id: 'a', gasto: 100, resultados: 5, receita: 50,
    semana: { gasto: 400, resultados: 20, receita: 1004 } };
  const v = faixaDoAnuncio(anuncio, ctx);
  assert.equal(v.faixa, 'RONDA');
  assert.equal(v.protegido_por, 'janela');
  assert.match(v.motivo, /2,51|2\.51/);
});

// A semana precisa estar ACIMA do piso pra que o teste prove alguma coisa: com
// receita 150 sobre gasto 100 o retorno da semana é 1,5, e o que segura o corte
// é só a checagem de resultados maiores que zero. Com receita zero o teste
// passaria mesmo se essa checagem fosse deletada, e provaria nada.
test('sem resultado nenhum na semana, a proteção da janela não salva', () => {
  const ctx = { ...ctxBase, fatia: 120 };
  const anuncio = { id: 'a', gasto: 100, resultados: 5, receita: 50,
    semana: { gasto: 100, resultados: 0, receita: 150 } };
  const v = faixaDoAnuncio(anuncio, ctx);
  assert.equal(v.faixa, 'CRITICO');
});

// Caso real da operação de referência: três anúncios pausados com R$ 62, R$ 59 e
// R$ 56 num negócio onde uma venda custa R$ 319. Nenhum tinha sido reprovado pelo
// mercado; todos foram sufocados por uma campanha que concentrou verba em outro
// conjunto. A ordem das regras precisa segurar isso sozinha.
test('R$ 62 gastos num ticket de R$ 319 não caem: ainda não gastou o que vale um resultado', () => {
  const ctx = { ...ctxBase, ticket: 319, fatia: 120 };
  const v = faixaDoAnuncio({ id: 'a', gasto: 62, resultados: 0, receita: 0 }, ctx);
  assert.equal(v.faixa, 'RONDA');
  assert.match(v.motivo, /menos de 1 ticket/);
});

test('metade da fatia abaixo do piso com 5 resultados cai', () => {
  const ctx = { ...ctxBase, fatia: 120 };
  const v = faixaDoAnuncio({ id: 'a', gasto: 100, resultados: 5, receita: 50 }, ctx);
  assert.equal(v.faixa, 'CRITICO');
  assert.match(v.motivo, /abaixo do piso/);
});

test('sem checkout o piso é 1,00 e a aprovação sobe pra 1,30', () => {
  const e = empateDe({ origem: 'meta' });
  assert.equal(e.piso, 1);
  assert.equal(e.aprova, 1.3);
});

test('cobertura de 35% derruba o piso e o mesmo anúncio deixa de ser CRITICO', () => {
  const e = empateDe({ origem: 'checkout', cobertura: 0.35 });
  assert.equal(e.piso, 0.35);
  assert.ok(Math.abs(e.aprova - 0.675) < 1e-9);
  const ctx = { ...ctxBase, fatia: 120, empate: e };
  const v = faixaDoAnuncio({ id: 'a', gasto: 100, resultados: 5, receita: 50 }, ctx);
  assert.equal(v.faixa, 'RONDA');
});

test('margem declarada acima da cobertura vira o piso, e a aprovação nunca fica abaixo do piso', () => {
  const e = empateDe({ origem: 'checkout', cobertura: 0.35, margem_declarada: 1.3 });
  assert.equal(e.piso, 1.3);
  assert.ok(e.aprova >= e.piso);
});

// A margem mínima é o empate do negócio, e a fórmula de mercado é 1 dividido
// pela margem de contribuição: margem de 50% empata em 2,00 e margem de 30%
// empata em 3,33. Quem preenche o campo direito passa de 1,30 quase sempre, e
// com o 1,30 como número absoluto o piso alcançava a aprovação e a régua mandava
// botar verba num anúncio de lucro zero.
test('margem declarada de 1,30 não aprova anúncio no empate: a aprovação é múltiplo do piso', () => {
  const e = empateDe({ origem: 'meta', margem_declarada: 1.3 });
  assert.equal(e.piso, 1.3);
  assert.ok(e.aprova > e.piso, `aprova ${e.aprova} precisa ficar acima do piso ${e.piso}`);
  assert.ok(Math.abs(e.aprova - 1.69) < 1e-9, `aprova deu ${e.aprova}`);
});

test('margem declarada de 2,00 leva o piso a 2,00 e a aprovação a 2,60', () => {
  const e = empateDe({ origem: 'meta', margem_declarada: 2.0 });
  assert.equal(e.piso, 2);
  assert.ok(Math.abs(e.aprova - 2.6) < 1e-9, `aprova deu ${e.aprova}`);
});

// A invariante que impede o defeito de voltar por outra porta. Varre a margem de
// 0 a 5 de 0,1 em 0,1 nos quatro caminhos que o empate tem.
test('a aprovação fica estritamente acima do piso em toda margem de 0 a 5', () => {
  const caminhos = [
    { origem: 'meta', cobertura: null },
    { origem: 'meta', cobertura: 0.87 },
    { origem: 'checkout', cobertura: null },
    { origem: 'checkout', cobertura: 0 },
    { origem: 'checkout', cobertura: 0.35 },
    { origem: 'checkout', cobertura: 0.87 },
    { origem: 'checkout', cobertura: 0.999 },
    { origem: 'checkout', cobertura: 1 },
  ];
  let conferidos = 0;
  for (let i = 0; i <= 50; i += 1) {
    const margem_declarada = i / 10;
    for (const c of caminhos) {
      const e = empateDe({ ...c, margem_declarada });
      assert.ok(e.aprova > e.piso,
        `${c.origem} cobertura ${c.cobertura} margem ${margem_declarada}: aprova ${e.aprova} não ficou acima do piso ${e.piso}`);
      conferidos += 1;
    }
  }
  // A varredura precisa ter rodado de verdade: um laço que não entra passa calado.
  assert.equal(conferidos, 51 * caminhos.length);
});

test('anúncio exatamente no empate declarado não vira PASSE', () => {
  const e = empateDe({ origem: 'meta', margem_declarada: 1.3 });
  const v = faixaDoAnuncio({ id: 'a', gasto: 600, resultados: 13, receita: 780 },
    { ...ctxBase, empate: e, fatia: 800 });
  assert.notEqual(v.faixa, 'PASSE');
  assert.notEqual(v.acao, 'liberar verba');
});

test('CTR caindo 20% com CPM estável é criativo cansando', () => {
  const a = { id: 'a', gasto: 100, resultados: 3, receita: 400,
    ctr: 0.8, ctr_base: 1.0, cpm: 30, cpm_base: 31 };
  const v = faixaDoAnuncio(a, { ...ctxBase, fatia: 400 });
  assert.equal(v.faixa, 'AVISO');
  assert.match(v.acao, /ângulo novo/);
});

test('CTR caindo menos que o limite não vira Aviso', () => {
  const a = { id: 'a', gasto: 100, resultados: 3, receita: 400,
    ctr: 0.9, ctr_base: 1.0, cpm: 30, cpm_base: 31 };
  const v = faixaDoAnuncio(a, { ...ctxBase, fatia: 400 });
  assert.notEqual(v.faixa, 'AVISO');
});

test('frequência acima de 3 em negócio local é saturação', () => {
  const a = { id: 'a', gasto: 100, resultados: 3, receita: 400, frequencia: 3.4 };
  const v = faixaDoAnuncio(a, { ...ctxBase, fatia: 400, perfil: 'local' });
  assert.equal(v.faixa, 'AVISO');
  assert.match(v.motivo, /frequência/);
});

test('frequência alta fora do negócio local não vira Aviso', () => {
  const a = { id: 'a', gasto: 100, resultados: 3, receita: 400, frequencia: 3.4 };
  const v = faixaDoAnuncio(a, { ...ctxBase, fatia: 400, perfil: 'low_ticket' });
  assert.notEqual(v.faixa, 'AVISO');
});

test('um contato vale o que ele traz, e isso é conta e não chute', () => {
  // De cada 10 contatos, 2 viram cliente. Cada um paga 5000. 20% pode ir pra anúncio.
  assert.equal(ticketDeContato({ fecham_em_10: 2, valor_do_cliente: 5000, fatia_pro_anuncio: 0.2 }), 200);
});

test('consultório: 3 de 10 fecham, paciente paga 800, 25% pro anúncio', () => {
  assert.equal(ticketDeContato({ fecham_em_10: 3, valor_do_cliente: 800, fatia_pro_anuncio: 0.25 }), 60);
});

test('10 conversas com ticket 60 viram receita de 600', () => {
  const r = receitaDoAnuncio({ resultados: 10, receita: 0 }, { objetivo: 'conversa', ticket: 60 });
  assert.equal(r, 600);
});

test('em compra, a receita informada manda, e o ticket só entra quando ela falta', () => {
  assert.equal(receitaDoAnuncio({ resultados: 2, receita: 700 }, { objetivo: 'compra', ticket: 319 }), 700);
  assert.equal(receitaDoAnuncio({ resultados: 2, receita: 0 }, { objetivo: 'compra', ticket: 319 }), 638);
});

// Sem este caso, a regra mais importante do método fica sem prova: os outros
// testes passariam igual se a checagem de objetivo sumisse da função, porque
// nenhum deles tem receita informada FORA de compra.
test('fora de compra, a receita informada é ignorada e vale o sintético', () => {
  assert.equal(receitaDoAnuncio({ resultados: 5, receita: 900 }, { objetivo: 'lead', ticket: 60 }), 300);
  assert.equal(receitaDoAnuncio({ resultados: 5, receita: 900 }, { objetivo: 'conversa', ticket: 60 }), 300);
});

test('cada perfil traz a estrutura de teste e quanto esperar até o Passe', () => {
  assert.equal(PERFIS.alto_ticket.estrutura, '1-5-1');
  assert.equal(PERFIS.low_ticket.dias_ate_passe, 3);
  assert.equal(PERFIS.leads.estrutura, '1-3-1');
  assert.equal(PERFIS.leads.dias_ate_passe, 10);
  assert.equal(PERFIS.local.estrutura, '1-1-2');
  // Nenhum perfil declara piso de gasto: a ordem das regras já segura quem
  // gastou menos de um ticket.
  for (const p of Object.values(PERFIS)) assert.equal('piso_de_gasto_tickets' in p, false);
});

test('o nome do resultado acompanha o objetivo, no singular e no plural', () => {
  assert.equal(nomeDoResultado('conversa', 1), 'conversa');
  assert.equal(nomeDoResultado('lead', 3), 'leads');
  assert.equal(nomeDoResultado('compra', 1), 'venda');
});

const reguaLocal = { objetivo: 'conversa', perfil: 'local', ticket: 60, margem_minima: 0, origem_do_resultado: 'meta' };

function extrato(anuncios, extras = {}) {
  return { conta: '1', de: '2026-09-18', ate: '2026-09-18', resultado_ate: '2026-09-18',
    gasto_lido_em: '2026-09-18T09:00:00-03:00', hoje: '2026-09-18', anuncios, ...extras };
}

test('o quadro classifica cada anúncio e devolve o empate usado', () => {
  const r = quadroDe(extrato([
    { id: 'a', nome: 'dentista-01', gasto: 70, resultados: 0, campanha: 'c1', orcamento_dia_campanha: 90, ativo: true },
    { id: 'b', nome: 'dentista-02', gasto: 20, resultados: 0, campanha: 'c1', orcamento_dia_campanha: 90, ativo: true },
  ]), reguaLocal);
  assert.equal(r.quadro.length, 2);
  assert.equal(r.quadro[0].faixa, 'CRITICO');
  assert.equal(r.quadro[1].faixa, 'RONDA');
  assert.equal(r.empate.piso, 1);
  assert.equal(r.teto_batido, false);
});

test('resultado que para em ontem não propõe corte nenhum', () => {
  const r = quadroDe(extrato([{ id: 'a', gasto: 70, resultados: 0 }], { resultado_ate: '2026-09-17' }), reguaLocal);
  assert.equal(r.frescor.parado, true);
  assert.equal(r.quadro.filter((x) => x.faixa === 'CRITICO').length, 0);
  assert.match(r.alertas.join(' '), /param em 2026-09-17/);
});

test('onze cortes numa rodada viram alerta de régua errada, e não lista', () => {
  const muitos = Array.from({ length: 11 }, (_, i) => ({ id: `a${i}`, gasto: 70, resultados: 0 }));
  const r = quadroDe(extrato(muitos), reguaLocal);
  assert.equal(r.teto_batido, true);
  assert.match(r.alertas.join(' '), /régua/);
});

// O fixture precisa CHEGAR no bloco de frequência pra provar alguma coisa. Um
// anúncio que já caiu no corte por ticket sem resultado sai da função muito
// antes, e o teste passaria igual se a leitura de frequência sumisse do quadro.
test('frequência alta vira Aviso pelo quadro, e a ausência do campo não vira', () => {
  const r = quadroDe(extrato([
    { id: 'a', nome: 'saturado', gasto: 100, resultados: 3, frequencia: 3.4 },
    { id: 'b', nome: 'sem-o-campo', gasto: 100, resultados: 3 },
  ]), reguaLocal);
  assert.equal(r.quadro[0].faixa, 'AVISO');
  assert.equal(r.quadro[1].faixa, 'RONDA');
});

// Campanha de R$ 360 com 3 anúncios ativos e 1 pausado. A fatia de cada ativo é
// 120, e metade dela é 60: quem gastou 55 ainda não chegou lá. Se o pausado
// entrasse na conta, a fatia cairia pra 90, metade 45, e o anúncio seria cortado
// por engano. É esse engano que o teste existe pra pegar.
test('anúncio pausado não entra na conta da fatia', () => {
  const r = quadroDe(extrato([
    { id: 'a', nome: 'no-limite', gasto: 55, resultados: 5, campanha: 'c1', orcamento_dia_campanha: 360, ativo: true },
    { id: 'b', gasto: 5, resultados: 0, campanha: 'c1', orcamento_dia_campanha: 360, ativo: true },
    { id: 'c', gasto: 5, resultados: 0, campanha: 'c1', orcamento_dia_campanha: 360, ativo: true },
    { id: 'd', gasto: 5, resultados: 0, campanha: 'c1', orcamento_dia_campanha: 360, ativo: false },
  ]), { ...reguaLocal, ticket: 10 });
  assert.equal(r.quadro[0].faixa, 'RONDA');
});

test('dez cortes ainda não batem o teto, e onze batem', () => {
  const dez = Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, gasto: 70, resultados: 0 }));
  assert.equal(quadroDe(extrato(dez), reguaLocal).teto_batido, false);
});

test('a fatia sai do orçamento da campanha dividido pelos anúncios ativos dela', () => {
  // Três anúncios ativos na mesma campanha de R$ 360 por dia: a fatia de cada um
  // é R$ 120, e metade dela é R$ 60. O primeiro já gastou R$ 100 e trouxe 5
  // conversas, que a ticket 10 valem R$ 50: retorno 0,5, abaixo do piso 1.
  const r = quadroDe(extrato([
    { id: 'a', gasto: 100, resultados: 5, campanha: 'c1', orcamento_dia_campanha: 360, ativo: true },
    { id: 'b', gasto: 10, resultados: 1, campanha: 'c1', orcamento_dia_campanha: 360, ativo: true },
    { id: 'c', gasto: 10, resultados: 1, campanha: 'c1', orcamento_dia_campanha: 360, ativo: true },
  ]), { ...reguaLocal, ticket: 10 });
  assert.equal(r.quadro[0].faixa, 'CRITICO');
  assert.match(r.quadro[0].motivo, /abaixo do piso/);
});

// Sem `orcamento_dia_campanha` a fatia vira zero e o guarda `fatia > 0` desliga
// o único corte por retorno que existe. R$ 5.000 gastos, R$ 1.000 de volta e 50
// vendas caíam em RONDA com o motivo "ainda não provou nem reprovou". A régua
// continua sem julgar por retorno nesse caso, e passa a dizer isso em voz alta.
const reguaCompra = { objetivo: 'compra', perfil: 'low_ticket', ticket: 40, margem_minima: 0, origem_do_resultado: 'meta' };

test('anúncio sem orçamento da campanha perde a regra de corte por retorno, e o quadro avisa', () => {
  const r = quadroDe(extrato([
    { id: 'b1', nome: 'queimando', gasto: 5000, resultados: 50, receita: 1000, ativo: true },
  ]), reguaCompra);
  assert.equal(r.cego_por_orcamento, true);
  assert.match(r.alertas.join(' '), /orcamento_dia_campanha/);
  assert.match(r.alertas.join(' '), /corte por retorno/);
});

test('com o orçamento presente o mesmo anúncio cai, e o aviso de cegueira não aparece', () => {
  const r = quadroDe(extrato([
    { id: 'b1', nome: 'queimando', gasto: 5000, resultados: 50, receita: 1000, campanha: 'c1', orcamento_dia_campanha: 6000, ativo: true },
  ]), reguaCompra);
  // Teste negativo: a saída precisa vir cheia, senão o "não apareceu" não prova nada.
  assert.equal(r.quadro.length, 1);
  assert.equal(r.quadro[0].faixa, 'CRITICO');
  assert.equal(r.cego_por_orcamento, false);
  assert.doesNotMatch(r.alertas.join(' '), /orcamento_dia_campanha/);
});

// Quem já foi decidido pelas duas primeiras regras não perdeu nada com a fatia
// zerada: o corte por 1 ticket sem resultado e a RONDA de quem gastou menos de
// um ticket não olham a fatia. Contar esses no alerta seria alarme falso.
test('anúncio decidido antes da fatia não conta como cego', () => {
  const r = quadroDe(extrato([
    { id: 'x', nome: 'sem-resultado', gasto: 500, resultados: 0, ativo: true },
    { id: 'y', nome: 'novinho', gasto: 10, resultados: 0, ativo: true },
  ]), reguaCompra);
  assert.equal(r.quadro[0].faixa, 'CRITICO');
  assert.equal(r.quadro[1].faixa, 'RONDA');
  assert.equal(r.cego_por_orcamento, false);
});

test('anúncio já pausado aparece no quadro e nunca recebe proposta de pausa', () => {
  const r = quadroDe(extrato([
    { id: 'a', nome: 'antigo', gasto: 70, resultados: 0, ativo: false },
  ]), reguaLocal);
  assert.equal(r.quadro[0].faixa, 'RONDA');
  assert.equal(r.quadro[0].protegido_por, 'ja_pausado');
  assert.equal(r.teto_batido, false);
});
