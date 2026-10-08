---
name: montar-anuncio
description: >
  Dado um anúncio aprovado no plano, gera o pacote completo de copy pronto pra cadastrar
  no Mercado Livre: título de até 60 caracteres, descrição completa, ficha técnica, preço
  por modalidade com margem provisória, FAQ e mapa de fotos. Traz o simulador oficial de
  custos (simular.mjs) que crava o preço final. É a etapa 5 da esteira. Use quando o
  usuário chamar /montar-anuncio, disser "monta o anúncio do [produto]", "gera o copy",
  "preciso do título e da descrição", "roda o simulador", "quanto sobra a R$ X".
---

# /montar-anuncio, o pacote de copy de um anúncio

## O que essa skill faz

Pega um anúncio ou kit aprovado (`decisao.json`) e escreve tudo que o cadastro
precisa: título, descrição, ficha, preço por modalidade, FAQ e o mapa que diz o
que cada foto mostra. Não cria imagem: quem faz é o `ml-designer`, pela
`/gerar-imagens`. É um anúncio por produto: um título, uma capa.

## Dependências

- `dados/pipeline/<slug>/decisao.json` (contrato 3): a fonte da decisão. O
  `plano-anuncios-<categoria>.md` é leitura de apoio, nunca fonte do JSON
- `fornecedores/<f>/concorrentes/<categoria>/<produto>.md`, com
  `vocabulario.txt` e `atributos.json` da mesma pasta: o briefing do
  `ml-espiao`, com as seções de perguntas e opiniões reais (a mina de ouro)
- `fornecedores/<f>/catalogo-analisado.csv` (contrato 0): EAN, custo, peso,
  dimensões
- `_contexto/mercado-livre.md`: `imposto_pct`, piso de margem, `reputacao`
- `_contexto/vereditos-legais.md`: a ficha de conformidade, em produto regulado
- `referencias/modelo-descricao.md`: os 10 blocos da descrição
- `.claude/skills/mercado-livre/referencias/precificacao.md`, `regras-ml.md`
  e `contratos.md`
- `_contexto/empresa.md` e a voz da marca (Mapa do `AGENTS.md`): o tom, com
  as proibições de escrita do `_contexto/preferencias.md`

Caminhos que começam em `referencias/` e `scripts/` são relativos à pasta desta
skill; `_contexto/`, `dados/`, `fornecedores/` e `anuncios/` são da raiz do
projeto.

## Fluxo

### 1. Entrada

O slug (o `/mercado-livre` despacha com ele; avulso, inferir da conversa).
Conferir que `decisao.json` tem `aprovado: true`; sem isso, parar: decisão é
gate da pessoa.

### 2. O título

- Até 60 caracteres, contando espaço. Estrutura: produto principal,
  característica-chave, diferencial, uso ou público se couber.
- Vocabulário do `vocabulario.txt`: a palavra mais buscada do nicho entra,
  porque o título trava depois da primeira venda e é a única chance.
- Sem marca de terceiro (não sai mais depois que trava) e sem termo proibido
  ("promoção", "grátis", "oferta", "brinde", "melhor", "original", porcentagem
  de desconto; conferido em 2026-09-23, conferir ao
  vivo).
- Gerar 3 ou 4 variações internamente e fechar em uma, dizendo qual busca ela
  pega e por quê. As palavras que ficaram de fora vão pra descrição.

### 3. A descrição

Seguir `referencias/modelo-descricao.md`, os 10 blocos na ordem. Além do
modelo:

- A palavra-chave principal 2 ou 3 vezes ao longo do texto, as secundárias e as
  de cauda longa espalhadas, sem empilhar e sem virar lista.
- Antecipar objeção e calibrar expectativa: cada frustração recorrente das
  avaliações de 1 a 3 estrelas do briefing é respondida antes de o cliente
  perguntar, posicionando o produto pra atrair quem dá 5 estrelas e afastar
  quem devolveria.
- Emprestar a língua das avaliações de 4 e 5 estrelas.
- Original: o texto do concorrente é referência de vocabulário, nunca de frase.
- Kit: a composição exata, com a quantidade de cada item.
- Produto regulado: a frase de regularização e as alegações literais da ficha
  de conformidade, e nada além delas.

### 4. A ficha técnica

Os atributos consensuais do nicho (`atributos.json`), preenchidos com o que o
catálogo e o briefing dizem. Marca: a do fabricante, ou "Sem marca" em kit e
produto revendido sem marca própria, nunca o nome da loja. Peso e dimensões
com o dado real do catálogo; sem dado, `[PREENCHER]` e pendência, porque peso
errado custa dinheiro em toda venda. GTIN: o EAN do catálogo quando confiável;
kit montado por você nunca tem, e código inventado derruba o anúncio. NCM: o
do catálogo do fornecedor quando ele informa; senão `null` no `copy.json` e a
pendência "NCM: pedir à contadora", porque classificação fiscal é assunto dela.

### 5. O preço, provisório

Base: `preco.alvo_pos_desconto` de `decisao.json` (o que o cliente paga, sobre
o qual a comissão incide); `preco.tabela` é a lista inflada. A conta é a da
`precificacao.md`: preço menos comissão da categoria (Clássico, e Premium com
mais 5 pontos), menos custo de envio (nunca zero abaixo de R$ 79), menos
`imposto_pct` sobre o preço, menos custo. A comissão sai da API que a `precificacao.md` cita ou da Central de
Vendedores, com data. Respeitar o degrau dos R$ 79 e terminar em ,90. O degrau
dos R$ 79 e a comissão estão datados na `precificacao.md`; conferir ao vivo
antes de cravar preço.

Tabela no `copy.md`:

```
| Modalidade  | Preço   | Comissão usada          | Margem provisória |
|-------------|---------|--------------------------|-------------------|
| ML Clássico | R$ X    | N% (fonte, AAAA-MM-DD)  | R$ Y (validar no simulador) |
| ML Premium  | R$ X    | N% + 5 pontos           | R$ Y (validar no simulador) |
```

A margem daqui é provisória e vai marcada assim. Quem crava o número oficial é
o simulador (seção "O simulador oficial", abaixo), rodado pelo `ml-auditor` no gate antes do cadastro ou
pela pessoa no chat.

### 6. O mapa de fotos

Uma capa só (`01-capa`): produto inteiro, fundo branco puro, sem texto e sem
logo. As secundárias na ordem dos slots de `decisao.json`, cada uma com o
papel, o que mostra e a nota do que funciona no nicho. Cada objeção do
briefing que dá pra mostrar vira um slot: quem tira a dúvida na imagem não abre
pergunta e não devolve.

### 7. O FAQ

De 4 a 8 perguntas, nesta ordem de fonte: perguntas reais dos anúncios
concorrentes; objeções das avaliações de 1 a 3 estrelas viradas em pergunta e
resposta honesta; o que os concorrentes já anteciparam nas descrições.
Resposta curta, na língua do cliente, sem prometer o que o produto não entrega.
Nada inventado: cada item leva a fonte.

### 8. Gravar

- `anuncios/<slug>/copy.md`: título (com contagem de caracteres e a busca que
  pega, mais as palavras que foram pra descrição), descrição completa, ficha,
  FAQ, tabela de preços, mapa de fotos, pendências (EAN a confirmar, peso e
  dimensão, alérgenos, fotos cruas). Se já existe, perguntar antes de
  sobrescrever.
- `dados/pipeline/<slug>/copy.json`: contrato 4 do `contratos.md`, os mesmos
  valores do `copy.md` (o `ml-auditor` reprova divergência).
- `dados/pipeline/<slug>/status.json`: etapa `copy` com `ok`, `etapa_atual`
  `copy`, pendências acrescentadas.

### 9. Resumo no chat

Título com a contagem, as palavras plantadas na descrição, preço por modalidade
e margem provisória, quantas fotos no mapa, pendências. Sem colar a descrição.

## O simulador oficial (`scripts/simular.mjs`)

O número final de preço sai do simulador de custos do Mercado Livre, logado na
sua conta, lido pelo Chrome dedicado. Tabela de comissão envelhece; o
simulador não.

```
node .claude/skills/montar-anuncio/scripts/simular.mjs --termo "<produto ou categoria>" --preco 39,90 --tipo classico --frete comprador --custo 15
```

- `--termo`: o que digitar na busca de categoria; o primeiro card sugerido é o
  escolhido (confira no JSON se a categoria faz sentido)
- `--preco`: com vírgula ou ponto
- `--tipo`: `classico` ou `premium`; `--frete`: `gratis` ou `comprador`
- `--custo`: opcional; com ele o script calcula o lucro líquido usando o
  `imposto_pct` de `_contexto/mercado-livre.md` (sem imposto na configuração,
  ele para e manda rodar `/mercado-livre`)

Saída em JSON: `tarifa_venda`, `custo_envio`, `voce_recebe` e, com `--custo`,
`lucro` (imposto, lucro líquido, margem). `custo_envio` (e também
`tarifa_venda`) pode vir `null` quando a tela do simulador não fecha a conta
sozinha: nesse caso olhar a tela do simulador e nunca completar o número de
cabeça. Acima de R$ 79 o frete grátis é obrigatório e o script avisa quando
isso travar a escolha (conferido ao vivo em 2026-09-24; conferir ao vivo de
novo antes de agir, porque o Mercado Livre pode mudar a regra). Rodar nas duas
modalidades e ficar com a de maior lucro líquido. Precisa do Chrome dedicado
aberto
(`node .claude/skills/mercado-livre/scripts/abrir-chrome.mjs`) e do Playwright
da skill `mercado-livre` instalado. Se a página do Mercado Livre mudar e o
script não achar "Você recebe", ele avisa em vez de inventar número: a pessoa
lê o valor na janela e anota com a data.

## Regras

- Nunca inventar especificação: o que não está no catálogo nem no briefing
  fica `[PREENCHER]` e vira pendência.
- Um anúncio por produto. Segundo posicionamento é produto ou kit novo.
- Tom da voz da marca, com as proibições do `_contexto/preferencias.md`; sem travessão; sem cara de IA. Com a /humanizar no projeto, rodar o varredor dela no título, na descrição e no FAQ, como aviso que não trava a etapa, e levar o que ele achar pro resumo final.
- Sem contato externo na descrição, nem do fabricante.
- Preço do Mercado Livre é provisório até o simulador falar.
