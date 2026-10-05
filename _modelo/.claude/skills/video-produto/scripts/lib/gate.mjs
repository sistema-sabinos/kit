// Gate das regras de Clips do Mercado Livre.
// Fonte única das regras: referencias/regras-clips-ml.md. Mudou lá, muda aqui.
//
// REGRA DA CASA (decidida em 2026-08-08, ver seção "REGRA DA CASA" no arquivo acima):
// o vídeo não menciona NADA variável (preço, promoção, parcelamento, frete, garantia, prazo,
// validade, durabilidade em tempo, ou qualquer número que mude com o tempo). O Clips é permanente
// e pode ser reaproveitado em outro anúncio, então valor citado vira mentira na primeira
// reprecificação. Isso significa que o grupo "termo comercial ou variável" abaixo NÃO tenta
// distinguir uso legítimo de proibido, tipo "garantia de 2 anos" (que seria legítimo pra regra do
// ML) contra "sobrinho de 8 anos" (proibido). Aqui os dois são proibidos, um pela regra do ML e
// outro pela regra da casa. Falso positivo em termo comercial não custa nada (não existe frase
// legítima nossa que precise citar preço/prazo/garantia), então o grupo é rígido e direto, sem
// lookaround esperto tentando salvar caso de uso que não existe.

// termo comercial ou variável: dinheiro, porcentagem, parcelamento, construção de preço,
// promoção/urgência, logística/pós-venda e durabilidade contada em tempo, tudo num grupo só,
// porque tudo isso é "vira mentira depois" pro mesmo motivo.
const termoComercialPecas = [
  // dinheiro: símbolo, "reais"/"real" colado a número (dinheiro de verdade, "as cores saem bem
  // reais" não tem número do lado e passa), e número com 2 casas decimais (39,90/29.90), que em
  // texto comercial em português é sempre valor monetário
  /R\$/,
  /\d[\d.,]*\s*reais?\b/,
  // dinheiro por EXTENSO ("são quarenta reais", "sai por dez pila"). O numeral tem que vir colado,
  // senão "as cores saem bem reais no papel" (lista PASSAM do brief) seria reprovada
  /(?<![a-zà-ÿ])(?:um|dois|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|cincoenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|mil)\s+(?:reais|real|conto|contos|pila|paus|prata|mango|mangos)(?![a-zà-ÿ])/,
  /\d+[.,]\d{2}(?!\d)/,
  // porcentagem
  /\d+\s*%/,
  /por\s+cento/,
  // parcelamento em qualquer forma. "parcel" sem lookaround nenhum: nenhuma palavra do português
  // contém "parcel" fora da família parcela/parcelas/parcelado/parcelamento ("imparcial" e
  // "parcialidade" têm "parcial", com i, não "parcel", com e, nunca colidiram, lookaround era
  // remendo desnecessário)
  /parcel/,
  /\d+\s*x\b/, // "12x" ou "12 x"
  /em\s+\d+\s+vezes/,
  /sem\s+juros/,
  /divide\s+no\s+cart[ãa]o/,
  // construções de preço
  /sai\s+por/,
  /fica\s+em/,
  /fica\s+por/,
  /custa/,
  /custo/,
  /valor/,
  /por\s+apenas/,
  /a\s+partir\s+de/,
  /de\s+\d+\s+por\s+\d+/,
  // "preço/preços" com lookaround dos dois lados pra não casar dentro de "precoce"/"apreço"
  /(?<![a-zà-ÿ])pre[çc]os?(?![a-zà-ÿ])/,
  // promoção, cupom, desconto e urgência/condição de venda por tempo limitado
  /desconto/,
  /promo[çc][ãa]o/,
  /oferta/,
  /cupom/,
  /liquida[çc][ãa]o/,
  /queima\s+de\s+estoque/,
  // "leve dois pague um" escrito por extenso passava, porque só dígito casava. O verbo vem nas
  // duas pessoas que aparecem em roteiro (leve/leva/levem, pague/paga/paguem/pagam), porque a
  // flexão única é o defeito recorrente deste arquivo
  /(?<![a-zà-ÿ])lev[ae]m?\s+[\wà-ÿ]+\s+(?:e\s+)?pag(?:ue|a|uem|am)\s+[\wà-ÿ]+/,
  /s[óo]\s+essa\s+semana/,
  /s[óo]\s+hoje/,
  /condi[çc](?:[ãa]o|[õo]es)\s+especia(?:l|is)/,
  // urgência SEM número, que é como ela aparece de verdade em vídeo. Todas estas passavam batido
  // (medido na revisão final de 08/08) e "por tempo limitado" é o texto oficial de urgência do ML
  /tempo\s+limitado/,
  // as flexões todas: perca, percam, percas, perco. Cobrir só "não perca" era o mesmo descuido
  // de grafia única que mordeu o "pé de moleque"
  /n[ãa]o\s+perc(?:a|as|am|amos|o)(?![a-zà-ÿ])/,
  // imperativo é a forma que roteiro usa, e ela tem mais flexão que o infinitivo: corre, corra,
  // corram, correm. O lookbehind é pra não casar dentro de "socorre"/"escorre"
  /(?<![a-zà-ÿ])corr(?:e|a|am|em|as|amos)\s+(?:que|l[áa]|pra|para)/,
  /(?:est[áa]|est[ãa]o|t[áa]|t[ãa]o)\s+acabando/,
  /(?:vai|v[ãa]o)\s+acabar/,
  /acabando\s+o\s+estoque/,
  /estoques?\s+limitad[oa]s?/,
  /enquanto\s+dura(?:r|rem)?/,
  // singular e plural juntos: "é a última unidade que sobrou" passava porque a regra só tinha
  // "últimas unidades"
  /[úu]ltim[ao]s?\s+(?:chances?|dias?|horas?|momentos?|unidades?|pe[çc]as?)/,
  /por\s+pouco\s+tempo/,
  // logística e pós-venda
  /frete/,
  /entrega/,
  /prazo/,
  /brinde/,
  /gr[áa]tis/,
  /gratuito/,
  /garantia/,
  /troca/,
  /devolu[çc][ãa]o/,
  /validade/,
  // durabilidade contada em tempo ("dura 3 anos", "6 meses de uso"), variável, não dá pra provar
  // e muda depois
  /dura\s+(?:mais\s+de\s+)?\d+\s+(?:anos?|meses)/,
  /\d+\s+meses\s+de\s+uso/,
];

// menor de idade: cobertura generosa (diminutivo, sinônimo, parentesco), o item mais sensível da
// lista do ML. "de N anos" fica sem lookbehind de exclusão: antes tinha que poupar "garantia de 2
// anos"/"validade de 2 anos"/"durabilidade de 3 anos" porque eram legítimos pra regra do ML, mas
// agora esses três já são barrados pelo grupo comercial acima (garantia/validade/dura), então
// pouco importa se o padrão de idade também bate neles, os dois motivos levam ao mesmo lugar,
// roteiro reprovado.
const menorDeIdadePecas = [
  /crian[çc]/, // cobre criança/crianças/criancinha/criancinhas de uma vez (diminutivo troca ç por c)
  /filh[oa]s?\b/,
  /(?<![a-zà-ÿ])beb[êe]s?(?![a-zà-ÿ])/,
  /(?<![a-zà-ÿ])menin[oa]s?(?![a-zà-ÿ])/,
  /adolescente/,
  /menor\s+de\s+idade/,
  /(?<![a-zà-ÿ])sobrinh[oa]s?(?![a-zà-ÿ])/,
  /(?<![a-zà-ÿ])net[oa]s?(?![a-zà-ÿ])/,
  /(?<![a-zà-ÿ])netinh[oa]s?(?![a-zà-ÿ])/,
  /(?<![a-zà-ÿ])afilhad[oa]s?(?![a-zà-ÿ])/,
  /(?<![a-zà-ÿ])garot[oa]s?(?![a-zà-ÿ])/,
  /(?<![a-zà-ÿ])garotinh[oa]s?(?![a-zà-ÿ])/,
  /(?<![a-zà-ÿ])entead[oa]s?(?![a-zà-ÿ])/,
  /molecada/,
  // "pé de moleque" é um doce comum em anúncio de comida (a varredura de colisão contra
  // textos reais de anúncio achou dezenas de ocorrências), então o doce não pode cair aqui.
  // O lookbehind cobre TODAS as grafias que aparecem de verdade: com espaço, com hífen (que é
  // a grafia de nome de arquivo) e no plural ("pés de moleque"). Cobrir uma grafia só é
  // o mesmo descuido de cobrir uma flexão só.
  /(?<!p[ée]s?[\s-]?de[\s-])moleque/,
  /os\s+pequenos/,
  /de\s+\d{1,2}\s+anos\b/,
  // ACRESCENTADO NA REVISÃO FINAL (importante 6): o ator recomendado pela SKILL.md pode ser PROFESSORA,
  // e "meus alunos" é a frase mais natural do mundo pra esse personagem, e é referência a menor
  // de idade, a regra mais sensível do ML. Prefixo sem lookahead cobre o diminutivo de uma vez
  // (alun[oa]s, aluninho; turma, turminha), e nenhuma palavra legítima do nosso vocabulário
  // começa com esses prefixos (conferido na varredura contra textos reais de anúncio).
  /(?<![a-zà-ÿ])alun/,
  // "turm" solto mordia TURMALINA (pedra, cor que a gente cita em papelaria), então as formas
  // são enumeradas em vez de prefixo cru
  /(?<![a-zà-ÿ])turm(?:a|as|inha|inhas)(?![a-zà-ÿ])/,
  /(?<![a-zà-ÿ])priminh/,
  /(?<![a-zà-ÿ])pimpolh/,
  /(?<![a-zà-ÿ])pirralh/,
  // o [oa] opcional é o que faz "irmãzinha" entrar junto de "irmãozinho"
  /(?<![a-zà-ÿ])irm[ãa][oa]?zinh/,
  /(?<![a-zà-ÿ])(?:garotada|meninada|crian[çc]ada)/,
  /(?<![a-zà-ÿ])(?:crech|escolinha|ber[çc][áa]rio)/,
  /jardim\s+d[ae]\s+inf[âa]ncia/,
  /pr[ée][- ]?escola/,
];

// As marcas proibidas na fala NÃO moram aqui: vêm do próprio roteiro, que declara
// `marcasProprias` (as da loja, que o vídeo não deve citar) e `marcasDeTerceiro`
// (as de concorrentes e de produtos parecidos). Cada lista é obrigatória e `[]`
// vale. Assim o kit serve a qualquer loja, sem lista fixa de ninguém.
//
// Exportada porque a marca de terceiro precisa ser conferida em mais um lugar
// além do texto do roteiro: o campo `produto`, que não é falado nem encenado mas
// vai LITERALMENTE dentro do prompt do Veo (lib/direcao.mjs), e o filtro de
// conteúdo do Veo barra marca de terceiro. Uma função só, um lugar só pra mexer.
//
// Cada marca vira trecho de regex com o caractere especial escapado (marca com
// ponto, parêntese ou mais não pode virar operador) e o espaço vira `\s?`, pra
// "Marca Teste" casar também "MarcaTeste". Lista vazia devolve null: sem marca
// declarada, nada a barrar.
export function regexDeMarcas(marcas) {
  const lista = (marcas ?? []).map((m) => String(m).trim()).filter(Boolean);
  if (!lista.length) return null;
  const partes = lista.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s?'));
  return new RegExp(partes.join('|'), 'i');
}

// Confere que o roteiro declarou a lista (obrigatória, `[]` vale) e que cada
// item é texto não vazio: um item vazio viraria uma regex que casa tudo.
function erroDeListaDeMarcas(roteiro, campo, oQueE) {
  const lista = roteiro?.[campo];
  if (!Array.isArray(lista)) {
    return `falta "${campo}" no roteiro: lista das ${oQueE} que a fala não pode citar. É obrigatória, e [] vale quando não há nenhuma`;
  }
  if (lista.some((m) => typeof m !== 'string' || !m.trim())) {
    return `"${campo}" tem item vazio ou que não é texto: cada item é o nome de uma marca`;
  }
  return null;
}

function proibidosDoRoteiro(roteiro) {
  return [
    ...PROIBIDO_FIXO,
    { nome: 'marca própria', re: regexDeMarcas(roteiro?.marcasProprias) },
    { nome: 'marca de terceiro', re: regexDeMarcas(roteiro?.marcasDeTerceiro) },
  ].filter((p) => p.re);
}

const PROIBIDO_FIXO = [
  {
    nome: 'termo comercial ou variável',
    explicacao: 'o vídeo é PERMANENTE e pode ser reaproveitado em outro anúncio (REGRA DA CASA, 2026-08-08): qualquer preço, condição de venda, prazo ou promessa de duração vira mentira na primeira reprecificação',
    re: new RegExp(termoComercialPecas.map((r) => r.source).join('|'), 'i'),
  },
  {
    nome: 'menor de idade',
    re: new RegExp(menorDeIdadePecas.map((r) => r.source).join('|'), 'i'),
  },
  // dado de contato: zap, insta, direct, dm e wpp recebem lookaround pra evitar falso positivo em
  // "zapear", "instalar", "instantâneo", "admin", etc. O "zapzap" duplicado precisa entrar no
  // próprio termo: com o lookahead de letra, "zap" sozinho não casa dentro dele.
  { nome: 'dado de contato', re: /whats|(?<![a-zà-ÿ])zap(?:\s?zap)?(?![a-zà-ÿ])|telefone|\(\d{2}\)\s*\d|instagram|(?<![a-zà-ÿ])insta(?![a-zà-ÿ])|tiktok|facebook|www\.|\.com\b|@[a-z0-9_]+|(?<![a-zà-ÿ])direct(?![a-zà-ÿ])|(?<![a-zà-ÿ])dm(?![a-zà-ÿ])|(?<![a-zà-ÿ])wpp(?![a-zà-ÿ])/i },
  // a regra do ML é não MOSTRAR tela/seção do site, não a palavra "carrinho" solta (CTA genérico de
  // e-commerce: "adiciona ao carrinho" tem que passar). "mercado livre"/"meli" seguem proibidos sempre.
  { nome: 'referência ao Mercado Livre', re: /mercado\s?livre|mercadolivre|meli\b|tela\s+(?:do|da|de)\s+(?:carrinho|mercado|site|app|aplicativo)|mostra(?:ndo)?\s+(?:a\s+)?tela|p[áa]gina\s+do\s+produto/i },
  // comparação com CONCORRÊNCIA, não o produto comparado com ele mesmo (ex: traço agora vs no
  // começo). marca de terceiro citada explicitamente cai no grupo "marca de terceiro" (lista do roteiro).
  // A enumeração de frase deixava passar a comparação GENÉRICA ("mais barata que a concorrência
  // toda", "a concorrência não chega perto"), então a palavra concorrência/concorrente barra
  // sozinha: não existe uso legítimo dela num roteiro nosso. "mais barato/barata" entra pelo
  // mesmo motivo, e é comparação de preço, que a REGRA DA CASA já não deixa citar.
  { nome: 'comparação com concorrente', re: /concorr[êe]nci|concorrente|mais\s+barat[oa]|melhor\s+(?:do\s+)?que\s+(?:a\s+)?(?:qualquer outra|outra marca|outras marcas|os outros|as outras)|ganha\s+de\s+(?:qualquer\s+outra|outra\s+marca|outras\s+marcas)|igualzinh[oa] a|mesma coisa que a marca/i },
  { nome: 'sorteio', re: /sorteio|sorteia|sorteamos|sortear|sorteando|sortead[oa]s?|concurso|d[êe] a sorte/i },
  { nome: 'endereço', re: /\b(rua|avenida|av\.|travessa|alameda)\b|(?<![a-zà-ÿ])n[º°]?\s+\d+/i },
];

const ETAPAS = ['atencao', 'interesse', 'desejo', 'acao'];

// De 4 a 7 blocos de 8s, ou seja 32s a 56s. O teto é 7 porque o ML corta em 60s
// e 8 blocos dariam 64s; o piso é 4 porque menos que isso não fecha o AIDA.
//
// Por que passou a aceitar mais de 4 (2026-08-14): com 4 blocos o vídeo responde
// 2 ou 3 dúvidas do cliente, e a mineração das perguntas REAIS do nicho de
// articulação (83 perguntas colhidas nos campeões) mostrou 6 dúvidas distintas
// que decidem a compra. Amarrar em 4 era jogar fora metade do minuto que o ML
// dá de graça. Mais de um bloco pode servir a MESMA etapa do AIDA (dois blocos
// de "interesse" seguidos, por exemplo), desde que a sequência ande sempre pra
// frente e passe pelas quatro etapas.
export const MIN_BLOCOS = 4;
export const MAX_BLOCOS = 7;

export function validarAida(blocos) {
  if (blocos.length < MIN_BLOCOS || blocos.length > MAX_BLOCOS) {
    return `AIDA não fecha em ${blocos.length} bloco(s): o roteiro tem que ter de ${MIN_BLOCOS} a ${MAX_BLOCOS} blocos (${MIN_BLOCOS * 8}s a ${MAX_BLOCOS * 8}s, e o ML corta em 60s)`;
  }

  const posicoes = blocos.map((b) => ETAPAS.indexOf(b?.etapa));
  const i = posicoes.indexOf(-1);
  if (i !== -1) {
    return `AIDA com etapa desconhecida no bloco ${i + 1} (${JSON.stringify(blocos[i]?.etapa)}): as etapas são ${ETAPAS.join(' > ')}`;
  }

  // anda sempre pra frente: repetir a etapa anterior pode, voltar não
  const volta = posicoes.findIndex((n, k) => k > 0 && n < posicoes[k - 1]);
  if (volta !== -1) {
    return `AIDA fora de ordem no bloco ${volta + 1}: as etapas só andam pra frente (${ETAPAS.join(' > ')}), veio ${blocos.map((b) => b?.etapa).join(' > ')}`;
  }

  const faltando = ETAPAS.filter((e) => !blocos.some((b) => b?.etapa === e));
  if (faltando.length) {
    return `AIDA incompleto: falta ${faltando.join(' e ')} (as 4 etapas têm que aparecer, na ordem ${ETAPAS.join(' > ')})`;
  }

  return null;
}

export function validarRoteiro(roteiro) {
  const erros = [];
  const blocos = roteiro?.blocos ?? [];

  const problemaAida = validarAida(blocos);
  if (problemaAida) erros.push(problemaAida);

  const idade = roteiro?.ator?.idade;
  if (typeof idade !== 'number' || idade < 18) {
    erros.push(`ator com idade inválida (${idade}): o ML proíbe menor de idade, declare 18 ou mais`);
  }

  const textoTodo = [
    roteiro?.ator?.quem, roteiro?.ator?.cenario,
    ...blocos.flatMap((b) => [b?.fala, b?.cena]),
  ].filter(Boolean).join(' \n ');

  const faltaLista = [
    erroDeListaDeMarcas(roteiro, 'marcasProprias', 'marcas próprias'),
    erroDeListaDeMarcas(roteiro, 'marcasDeTerceiro', 'marcas de terceiros'),
  ].filter(Boolean);
  erros.push(...faltaLista);

  for (const p of proibidosDoRoteiro(roteiro)) {
    const achou = textoTodo.match(p.re);
    if (achou) {
      const motivo = p.explicacao ?? 'o ML proíbe isso em Clips';
      erros.push(`${p.nome}: o roteiro diz "${achou[0]}", e ${motivo}`);
    }
  }

  // validação de tag de áudio [qualquer coisa] em fala ou cena
  // flag 's' faz '.' pegar quebra de linha também ([sighs\ndeeply] é capturado)
  const reTag = /\[.+?\]/s;
  for (const bloco of blocos) {
    if (bloco?.fala?.match(reTag)) {
      const tag = bloco.fala.match(reTag)[0];
      erros.push(`tag de áudio em fala: "${tag}" encontrado, e o modelo de voz às vezes lê o conteúdo do colchete em voz alta em vez de interpretar`);
      break; // reporta só o primeiro pra não poluir
    }
    if (bloco?.cena?.match(reTag)) {
      const tag = bloco.cena.match(reTag)[0];
      erros.push(`tag de áudio em cena: "${tag}" encontrado, e o modelo de voz às vezes lê o conteúdo do colchete em voz alta em vez de interpretar`);
      break; // reporta só o primeiro pra não poluir
    }
  }

  if (roteiro?.ehKit) {
    // ehKit true com a lista vazia fazia o laço abaixo não conferir NADA e o
    // gate devolver ok, fingindo que checou. Não é hipótese: a coleta real de
    // um anuncio de kit volta assim (o título tem "Kit", a descrição não lista os
    // itens no formato que o normalizar reconhece). Gate que finge que rodou é
    // pior que gate que não existe, porque quem aprova confia nele.
    if (!(roteiro.itensDoKit ?? []).length) {
      erros.push('roteiro marcado como kit (ehKit) mas "itensDoKit" está vazio: o ML exige mostrar TODOS os itens do kit, e sem a lista o gate não tem como conferir isso. Preencher itensDoKit na mão a partir da PDP, ou marcar ehKit false se não for kit');
    }
    for (const item of roteiro.itensDoKit ?? []) {
      // extrai a primeira palavra alfabética, removendo números e caracteres especiais do prefixo
      const palavras = item.replace(/^\d+[\s+\-*]*/, '').trim().split(/\s+/);
      const chave = palavras.find((p) => /^[a-záéíóúãõç]/i.test(p));
      if (!chave) continue; // item inválido, pula
      // escapa caracteres especiais antes de fazer regexp
      const chaveSafe = chave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!new RegExp(chaveSafe, 'i').test(textoTodo)) {
        erros.push(`kit incompleto: o item "${item}" não aparece em nenhum bloco, e o ML exige mostrar todos os itens do kit`);
      }
    }
  }

  return { ok: erros.length === 0, erros };
}

export function validarTecnico(probe, tamanhoBytes) {
  const erros = [];
  const dur = Number(probe?.format?.duration ?? 0);
  if (dur < 10 || dur > 60) erros.push(`duração ${dur.toFixed(1)}s fora da faixa de 10 a 60 segundos`);

  const video = (probe?.streams ?? []).find((s) => s.codec_type === 'video');
  if (!video) erros.push('não tem faixa de vídeo');
  else if (video.width * 16 !== video.height * 9) {
    erros.push(`proporção ${video.width}x${video.height} não é 9:16 (o ML exige vertical sem borda)`);
  }

  if (!(probe?.streams ?? []).some((s) => s.codec_type === 'audio')) {
    erros.push('não tem faixa de áudio, e o ML exige voz ou música');
  }

  const MAX = 280 * 1000 * 1000; // base decimal (padrão do painel do ML)
  if (tamanhoBytes > MAX) erros.push(`arquivo de ${(tamanhoBytes / 1024 / 1024).toFixed(0)} MB passa do limite de 280 MB do upload`);

  return { ok: erros.length === 0, erros };
}
