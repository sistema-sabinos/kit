/**
 * O método do /trafego: em que faixa cada anúncio está e o que propor pra ele.
 *
 * Quatro faixas, sempre no NÍVEL DO ANÚNCIO. Campanha é soma, e soma esconde:
 * um anúncio bom paga o ruim e ninguém descobre qual é qual.
 *
 * "Ticket" é quanto vale UM resultado: o preço do produto, ou o valor de um
 * contato. Todo limite aqui é múltiplo do ticket, nunca um valor em reais, pra
 * régua acompanhar sozinha quando o preço mudar.
 *
 * Aritmética pura: este arquivo não lê arquivo, não acessa rede e não escreve
 * em conta nenhuma. Quem faz I/O é o regua.mjs.
 */

export const METODO = Object.freeze({
  corte: Object.freeze({
    tickets_sem_resultado: 1,
    fracao_da_fatia: 0.5,
    resultados_para_condenar_por_retorno: 5,
    janela_de_protecao_dias: 7,
  }),
  aviso: Object.freeze({ queda_de_ctr: 0.2, cpm_estavel: 0.15, frequencia_local: 3 }),
  passe: Object.freeze({ resultados_minimos: 5 }),
  plataforma_como_fonte: Object.freeze({ margem_de_aprovacao: 1.3 }),
  teto_de_acoes: 10,
});

const brl = (n) => `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;

/**
 * O ponto de empate. Não existe campo pra digitar, de propósito: se desse pra
 * digitar, alguém digitaria 1,00 e a régua perderia o sentido.
 *
 * Com export do checkout, o piso é a cobertura medida, ou seja, quanto da
 * receita paga aponta pra um anúncio. O resto da receita existe (orgânico,
 * cliente antigo, indicação, link sem rastreio) e nunca vai aparecer no painel.
 *
 * Sem checkout, o resultado vem da própria plataforma, que conta na data do
 * clique e credita quem só viu. Aí não há fonte externa pra medir, e a régua
 * compensa pro lado caro: piso 1,00 e aprovação 30% acima dele.
 *
 * O 1,30 é multiplicador do piso, e nunca um número absoluto. Com número
 * absoluto, qualquer margem declarada a partir de 1,30 fazia piso e aprovação
 * virarem o mesmo valor, e a régua mandava botar verba num anúncio parado no
 * ponto de empate, ou seja, de lucro zero. A margem mínima é 1 dividido pela
 * margem de contribuição, então margem de 50% já empata em 2,00: quem preenche
 * o campo direito cai nesse caso, e não numa borda rara.
 */
export function empateDe({ origem = 'meta', cobertura = null, margem_declarada = 0 } = {}) {
  const base = origem === 'checkout' && cobertura > 0 ? Math.min(1, cobertura) : 1;
  const piso = Math.max(base, Number(margem_declarada) || 0);
  // Com cobertura medida e piso abaixo de 1, a aprovação fica no meio do
  // caminho entre a cobertura e 1,00, que é o racional daquela rota. Quando o
  // piso desse ramo chega a 1 ou passa, a média cairia em cima do piso, então
  // vale o mesmo multiplicador de todo o resto.
  const naMedia = origem === 'checkout' && cobertura > 0 && piso < 1;
  const aprova = naMedia
    ? (piso + 1) / 2
    : piso * METODO.plataforma_como_fonte.margem_de_aprovacao;
  return { piso, aprova, origem, cobertura };
}

export function faixaDoAnuncio(anuncio, ctx) {
  const { ticket, empate, metodo, nome_resultado: nome, fatia = 0 } = ctx;
  const gasto = Number(anuncio.gasto || 0);
  const res = Number(anuncio.resultados || 0);
  const receita = Number(anuncio.receita || 0);
  const roas = gasto > 0 ? receita / gasto : null;
  const limite = ticket * metodo.corte.tickets_sem_resultado;

  if (res === 0 && gasto > limite) {
    return { faixa: 'CRITICO', acao: 'pausar', protegido_por: null,
      motivo: `gastou ${brl(gasto)}, mais de 1 ticket (${brl(ticket)}), sem nenhuma ${nome}` };
  }
  // Quem gastou menos que o valor de um resultado ainda não falou, e nenhuma
  // regra de corte encosta nele. É esta ordem que segura o anúncio sufocado
  // pela distribuição da campanha, sem precisar de piso separado por nicho.
  if (gasto < ticket) {
    return { faixa: 'RONDA', acao: 'deixar rodar', protegido_por: null,
      motivo: `gastou ${brl(gasto)}, menos de 1 ticket (${brl(ticket)})` };
  }

  // Segunda regra de corte: já queimou metade do que era dele hoje e o que
  // voltou não paga o que custou.
  if (fatia > 0 && gasto > fatia * metodo.corte.fracao_da_fatia && roas !== null && roas < empate.piso) {
    // Condenar por retorno exige o mesmo volume que aprovar. Com menos que isso
    // o retorno é variância: uma venda a mais ou a menos move o número em um
    // terço. Quem não trouxe nada continua caindo pela regra acima.
    if (res < metodo.corte.resultados_para_condenar_por_retorno) {
      return { faixa: 'RONDA', acao: 'deixar rodar, vigiado', protegido_por: 'volume',
        motivo: `retorno ${roas.toFixed(2)} abaixo do piso ${empate.piso.toFixed(2)}, com só ${res} ${nome}(s): pouco volume pra condenar` };
    }
    // Janela curta não apaga resultado acumulado. Quem já se pagou na semana
    // não morre por um dia magro.
    const s = anuncio.semana;
    const roasSemana = s && Number(s.gasto) > 0 ? Number(s.receita) / Number(s.gasto) : null;
    if (roasSemana !== null && Number(s.resultados) > 0 && roasSemana >= empate.piso) {
      return { faixa: 'RONDA', acao: 'deixar rodar, vigiado', protegido_por: 'janela',
        motivo: `hoje o retorno é ${roas.toFixed(2)}, e em ${metodo.corte.janela_de_protecao_dias} dias é ${roasSemana.toFixed(2)} com ${s.resultados} ${nome}(s): janela curta não apaga resultado acumulado` };
    }
    return { faixa: 'CRITICO', acao: 'pausar', protegido_por: null,
      motivo: `retorno ${roas.toFixed(2)} abaixo do piso ${empate.piso.toFixed(2)}, com ${brl(gasto)} gastos e ${res} ${nome}(s)` };
  }

  if (res >= metodo.passe.resultados_minimos && roas !== null && roas >= empate.aprova) {
    return { faixa: 'PASSE', acao: 'liberar verba', protegido_por: null,
      motivo: `${res} ${nome}(s) com retorno ${roas.toFixed(2)}, acima de ${empate.aprova.toFixed(2)}` };
  }

  // Criativo cansando e criativo queimando pedem coisas opostas: um pede ângulo
  // novo, o outro pede tesoura. Por isso o Aviso é faixa própria, e não um
  // amarelo genérico onde tudo se mistura.
  if (anuncio.ctr != null && anuncio.ctr_base > 0 && anuncio.cpm_base > 0) {
    // A régua compara o CTR que sobrou contra o teto, em vez de comparar a queda
    // calculada contra o limite. Em ponto flutuante `1 - 0.8/1.0` dá
    // 0.19999999999999996, e uma queda de exatos 20% escaparia da faixa justo no
    // valor mais provável de aparecer em dado arredondado.
    const tetoDoCtr = anuncio.ctr_base * (1 - metodo.aviso.queda_de_ctr);
    const quedaCtr = 1 - anuncio.ctr / anuncio.ctr_base;
    const varCpm = Math.abs(anuncio.cpm / anuncio.cpm_base - 1);
    if (anuncio.ctr <= tetoDoCtr && varCpm < metodo.aviso.cpm_estavel) {
      return { faixa: 'AVISO', acao: 'preparar ângulo novo, sem mexer na verba', protegido_por: null,
        motivo: `as pessoas continuam vendo e pararam de clicar: CTR caiu ${(quedaCtr * 100).toFixed(0)}% com o custo de exibição estável` };
    }
  }
  // Público de bairro satura rápido, e aí a mesma pessoa já viu demais. Vale só
  // no negócio local, onde o limite é geográfico.
  if (ctx.perfil === 'local' && Number(anuncio.frequencia || 0) > metodo.aviso.frequencia_local) {
    return { faixa: 'AVISO', acao: 'preparar ângulo novo, sem mexer na verba', protegido_por: null,
      motivo: `frequência ${Number(anuncio.frequencia).toFixed(1)}: a mesma pessoa já viu demais. Troque o criativo, não aumente a verba` };
  }

  return { faixa: 'RONDA', acao: 'deixar rodar', protegido_por: null,
    motivo: roas === null ? 'sem gasto no período'
      : `retorno ${roas.toFixed(2)} com ${res} ${nome}(s): ainda não provou nem reprovou` };
}

/**
 * Os quatro perfis de nicho. O método é um só; o que muda é o tamanho do que
 * se vende. Quem não cabe em nenhum usa a rota "monte o seu", com as três
 * perguntas do referencias/metodo.md.
 *
 * O perfil governa a estrutura de teste, quantos dias esperar e as regras
 * próprias de leitura (frequência no local, evento raso nos leads). Ele não
 * mexe nos limiares de corte, que são os mesmos em qualquer nicho.
 */
export const PERFIS = Object.freeze({
  alto_ticket: Object.freeze({ estrutura: '1-5-1', dias_ate_passe: 9 }),
  low_ticket: Object.freeze({ estrutura: '1-3-1', dias_ate_passe: 3 }),
  leads: Object.freeze({ estrutura: '1-3-1', dias_ate_passe: 10 }),
  local: Object.freeze({ estrutura: '1-1-2', dias_ate_passe: 14 }),
});

/** Quanto vale um contato: taxa de fechamento × valor do cliente × fatia que pode ir pra anúncio. */
export function ticketDeContato({ fecham_em_10, valor_do_cliente, fatia_pro_anuncio }) {
  return (Number(fecham_em_10) / 10) * Number(valor_do_cliente) * Number(fatia_pro_anuncio);
}

/**
 * Receita do anúncio. Em compra, o valor da venda manda. Em lead e conversa a
 * plataforma não dá valor nenhum, então a receita é quantidade × quanto vale um.
 * É isso que faz o dentista e o infoprodutor caberem na mesma régua.
 */
export function receitaDoAnuncio(anuncio, { objetivo, ticket }) {
  const receita = Number(anuncio.receita || 0);
  if (objetivo === 'compra' && receita > 0) return receita;
  return Number(anuncio.resultados || 0) * Number(ticket || 0);
}

const NOMES = { compra: ['venda', 'vendas'], lead: ['lead', 'leads'], conversa: ['conversa', 'conversas'] };
export function nomeDoResultado(objetivo, n = 1) {
  const par = NOMES[objetivo] ?? NOMES.compra;
  return n === 1 ? par[0] : par[1];
}

/**
 * O quadro: classifica o extrato inteiro e devolve o que a skill vai ler em voz
 * alta. Nenhuma ação é aplicada aqui, e este arquivo não sabe escrever em conta
 * nenhuma. Ele calcula e propõe.
 */
export function quadroDe(entrada, regua) {
  const metodo = METODO;
  const objetivo = regua.objetivo ?? 'compra';
  const ticket = Number(regua.ticket || 0);
  const empate = empateDe({
    origem: regua.origem_do_resultado ?? 'meta',
    cobertura: regua.cobertura ?? null,
    margem_declarada: regua.margem_minima ?? 0,
  });
  const alertas = [];

  // A fatia é o orçamento diário da campanha dividido pelos anúncios ativos
  // dela. Se apura agrupando o extrato por campanha, sem exigir campo novo de
  // quem preencheu o JSON.
  const ativosPorCampanha = new Map();
  for (const a of entrada.anuncios ?? []) {
    if (a.ativo === false) continue;
    const c = a.campanha ?? a.id;
    ativosPorCampanha.set(c, (ativosPorCampanha.get(c) ?? 0) + 1);
  }

  // Dado velho não decide. Um anúncio que converteu hoje apareceria com zero, e
  // o corte estaria julgando o atraso do arquivo em vez do anúncio.
  const hoje = entrada.hoje ?? entrada.ate;
  const parado = Boolean(entrada.resultado_ate && hoje && entrada.resultado_ate < hoje);
  if (parado) {
    alertas.push(`os resultados param em ${entrada.resultado_ate} e hoje é ${hoje}. Os zeros abaixo podem ser dado parado, e nenhum corte é proposto nesta rodada.`);
  }

  // Sem `orcamento_dia_campanha` a fatia vira zero, e o guarda `fatia > 0`
  // desliga o único corte por retorno que existe. A regra pode desligar; o que
  // não pode é desligar calada, porque o texto sai tranquilizador em cima de um
  // anúncio que está queimando dinheiro.
  const limiteSemResultado = ticket * metodo.corte.tickets_sem_resultado;
  let cegos = 0;

  const quadro = (entrada.anuncios ?? []).map((a) => {
    const ativos = ativosPorCampanha.get(a.campanha ?? a.id) ?? 1;
    const fatia = Number(a.orcamento_dia_campanha || 0) / ativos;
    // Só perde alguma coisa quem chegaria até a regra da fatia: anúncio pausado
    // nunca recebe corte, quem gastou menos de um ticket ainda não foi julgado,
    // e quem gastou mais de um ticket sem resultado já caiu antes dela.
    const gastoA = Number(a.gasto || 0);
    const decididoAntes = a.ativo === false || gastoA < ticket
      || (Number(a.resultados || 0) === 0 && gastoA > limiteSemResultado);
    if (fatia <= 0 && !decididoAntes) cegos += 1;
    const receita = receitaDoAnuncio(a, { objetivo, ticket });
    const semana = a.semana
      ? { ...a.semana, receita: receitaDoAnuncio(a.semana, { objetivo, ticket }) }
      : undefined;
    const v = faixaDoAnuncio({ ...a, receita, semana }, {
      ticket, empate, metodo, perfil: regua.perfil, fatia,
      nome_resultado: nomeDoResultado(objetivo, 1),
    });

    // Duas razões pra rebaixar um CRITICO, e as duas são honestidade e não
    // covardia: anúncio já pausado não se pausa de novo, e dado parado julgaria
    // o atraso do arquivo em vez do anúncio.
    let { faixa, acao, motivo, protegido_por } = v;
    if (faixa === 'CRITICO' && a.ativo === false) {
      faixa = 'RONDA'; acao = 'nada a fazer'; protegido_por = 'ja_pausado';
      motivo = `${v.motivo}, e este anúncio já está pausado`;
    } else if (faixa === 'CRITICO' && parado) {
      faixa = 'RONDA'; acao = 'deixar rodar, vigiado'; protegido_por = 'dado_parado';
      motivo = `${v.motivo}, e o dado está parado: nenhum corte proposto`;
    }

    return {
      id: a.id, nome: a.nome ?? a.id, faixa, acao, motivo, protegido_por,
      gasto: Number(a.gasto || 0), resultados: Number(a.resultados || 0),
      roas: Number(a.gasto || 0) > 0 ? receita / Number(a.gasto) : null,
    };
  });

  if (cegos > 0) {
    alertas.push(`${cegos} anúncio(s) estão sem orcamento_dia_campanha, então neles a regra de corte por retorno ficou desligada e nenhum pode ser condenado por retorno ruim nesta rodada. Pra destravar, traga o orçamento diário da campanha e o campo campanha de cada anúncio.`);
  }

  // Teto de dez. Bater no teto é sinal de régua errada, e não de dia ruim: uma
  // lista de quinze cortes quer dizer que o ticket está errado.
  const cortes = quadro.filter((x) => x.faixa === 'CRITICO').length;
  const teto_batido = cortes > metodo.teto_de_acoes;
  if (teto_batido) {
    alertas.push(`${cortes} anúncios caíram em CRITICO nesta rodada, acima do teto de ${metodo.teto_de_acoes}. Antes de pausar qualquer coisa, confira o ticket: régua errada derruba a conta inteira.`);
  }

  return {
    quadro, empate,
    frescor: { resultado_ate: entrada.resultado_ate ?? null, gasto_lido_em: entrada.gasto_lido_em ?? null, parado },
    alertas, teto_batido, cego_por_orcamento: cegos > 0,
  };
}
