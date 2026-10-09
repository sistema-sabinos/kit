---
name: decidir-anuncio
description: >
  Cruza a pesquisa de mercado e os briefings de concorrente de uma categoria e decide o
  que anunciar: quais produtos vão individuais, quais viram kit, posicionamento (premium
  ou popular), palavras-chave do título e plano de fotos. É a etapa 4 da esteira do
  Mercado Livre e o gate principal: a decisão é da pessoa. Use quando o usuário chamar
  /decidir-anuncio, disser "decide o que anunciar de [categoria]", "monta a estratégia
  da [categoria]", "vale kit ou individual?", "quero o plano de anúncios".
---

# /decidir-anuncio, o plano de anúncios de uma categoria

## O que essa skill faz

Recebe uma categoria inteira e produz um plano: o que anunciar individual, o
que virar kit, posicionamento, palavras-chave do título, quantidade e papel de
cada foto. O raciocínio é do assistente, com justificativa por item; a palavra
final é da pessoa. Nada aqui é limiar automático.

## Dependências

- `fornecedores/<f>/pesquisa-tendencia-<categoria>.csv` e `.md` (a
  `/pesquisar-tendencia` rodou)
- `fornecedores/<f>/concorrentes/<categoria>/`: briefings dos finalistas, mais
  `vocabulario.txt` e `atributos.json` (a `/espionar-concorrente` rodou nos
  produtos do topo; não precisa em todos)
- `dados/engenharia-reversa/<termo>/resultado.json` e o relatório
  `relatorios/engenharia-reversa-<termo>-<data>.md`, quando existirem (a
  `/engenharia-reversa` rodou no termo do produto; opcional). Rodada com
  `inconclusivo: true` não entra como evidência.
- `_contexto/mercado-livre.md`: o piso de margem (`margem_minima_rs`,
  `margem_minima_pct`, `margem_minima_kit_rs`), `imposto_pct`, `reputacao` e
  `loja_oficial`
- `_contexto/vereditos-legais.md`: só entra no plano produto com PODE ou PODE
  COM RESSALVA válido do produto ou do tipo dele (Gate 0 da `/mercado-livre`)
- `.claude/skills/mercado-livre/referencias/precificacao.md` e `contratos.md`
- `_contexto/empresa.md`, `_contexto/preferencias.md`, `_contexto/estrategia.md`

Caminhos que começam em `_contexto/`, `fornecedores/` e `dados/` são da raiz do
projeto.

## Fluxo

### 1. Entrada

Fornecedor e categoria, inferidos da conversa ou perguntados. Se algum produto
do topo da pesquisa não tem briefing de concorrente, listar quais e perguntar:
espionar antes, ou decidir só com a pesquisa.

### 2. Filtrar os candidatos

Entra no plano quem tem, ao mesmo tempo:

- `classificacao` `oportunidade forte` ou `vale considerar` (`desafiador` e
  `fora` só entram como componente de kit que compense a margem, e com a pessoa
  sabendo)
- margem projetada dentro do piso da configuração, em reais e em porcentagem,
  os dois juntos (em ticket baixo o valor em reais manda); quem fica abaixo do
  piso só continua como candidato a kit (passo 3A), nunca como individual
- veredito válido do produto ou do tipo dele (Gate 0 da `/mercado-livre`)

A margem projetada se calcula pela `precificacao.md`: preço na mediana, menos a
comissão da categoria (Clássico; Premium é mais 5 pontos), menos o custo de
envio, menos `imposto_pct` sobre o preço, menos o custo. A comissão exata sai
da API que a `precificacao.md` cita: renove o token com
`node .claude/skills/mercado-livre/scripts/lib/tokens.mjs ml` e use o
`ML_ACCESS_TOKEN` do `.env`; sem token, a
pessoa lê a comissão na Central de Vendedores, e a data entra no plano. Nunca
comissão de memória.

### 3. Quatro decisões por candidato

As regras de plataforma citadas abaixo (comissão, 60 caracteres, título que
trava) estão datadas em `.claude/skills/mercado-livre/referencias/regras-ml.md`
e `precificacao.md`; regra de plataforma envelhece, conferir ao vivo antes de
agir.

**A. Individual ou kit.** Padrão individual. Vira kit quando a margem sozinha
fica abaixo de `margem_minima_rs` (e o kit só entra no plano se passar em
`margem_minima_kit_rs`), quando existe produto correlato do
mesmo fornecedor (mesmo público, mesmo tema) ou quando o individual está
saturado (topo com mais de 1.000 vendas) e há pouco kit à venda. Tipos: variação
de tamanho, combo temático, quantidade do mesmo item.

**B. Posicionamento.** Popular: preço perto do primeiro quartil, volume,
Clássico. Premium: preço na mediana ou acima, fotos caprichadas, modalidade
Premium. Guia: margem na mediana folgada dá pra Premium (sobra pra anúncio e
frete grátis); topo dominado por loja oficial torna o popular briga perdida, e
o caminho é Premium com posicionamento diferente; conta com reputação baixa
exige foto e copy acima da média pra sustentar Premium.
Com engenharia reversa válida do termo, a escada do catálogo entra aqui: o
menor preço e o primeiro quartil dizem quanto custa brigar no popular, e
catálogo tomado por Full ou loja oficial pesa contra entrar nele.

**C. Palavras-chave do título.** As que aparecem em 3 ou mais títulos do topo
(`vocabulario.txt`), garantindo nome do produto, característica-chave e
diferencial. Até 60 caracteres. Sem marca de terceiro (o título trava depois
da primeira venda e a marca não sai mais) e sem termo que o Mercado Livre
proíbe ("promoção", "grátis", "oferta", "brinde", "melhor", "original",
porcentagem de desconto; lista conferida em
2026-09-23, conferir ao vivo).

**D. Plano de fotos.** Quantidade: a mediana de fotos do topo mais 2. Papéis
base: capa limpa (fundo branco, produto inteiro, sem texto), em uso, detalhe,
escala ou comparação, ficha técnica visual, confiança (devolução, garantia).
Direção específica: qual composição de capa domina no nicho, que diferencial
visual o topo não usa, e cada objeção recorrente do briefing (perguntas e
opiniões reais) que dá pra responder com imagem vira um slot. Referência
visual: as URLs das capas dos concorrentes que melhor representam o padrão.
Com engenharia reversa válida: cada dúvida "repetida" sem resposta vira slot
de foto; o que saiu `regra` entra no plano; `custo-de-entrada` é obrigação;
`anti-padrao` se evita. Nenhum outro veredito vira instrução, e rodada que
estudou o PRODUTO (maioria em catálogo) não ensina foto de anúncio.

### 4. Kits prováveis

Cruzar produtos do mesmo fornecedor e categoria. Cada kit candidato leva
composição, justificativa, custo somado, preço sugerido (contra kits parecidos
no Mercado Livre) e margem projetada, com a mesma conta da seção 2.

### 5. Gravar o plano

`fornecedores/<f>/plano-anuncios-<categoria>.md`:

```markdown
# Plano de anúncios: <categoria>, <fornecedor>

> Gerado por /decidir-anuncio em <AAAA-MM-DD>
> Base: pesquisa-tendencia-<categoria> e briefings de concorrente
> Comissão usada: <N>% (<fonte>, <AAAA-MM-DD>) · Imposto: <N>% (configuração)

## Resumo
- <N> anúncios individuais e <M> kits propostos
- Margem média projetada: R$ <X> por venda
- Ordem de execução: <a ordem, com o porquê>

## Anúncios individuais

### 1. <produto> (slug: <slug>)
- **Posicionamento:** premium | popular
- **Custo:** R$ X · **Preço sugerido:** R$ Y · **Margem projetada:** R$ Z (N%)
- **Título proposto:** <até 60 caracteres> (<N> caracteres)
- **Palavras-chave:** <lista>
- **Fotos:** <N>; capa: <composição>; secundárias: <papéis, na ordem>; objeções respondidas em imagem: <quais>
- **Justificativa:** <1 ou 2 frases>
- **Concorrentes-âncora:** <2 ou 3 nomes ou links>
- **Riscos:** <o que pode dar errado>

## Kits propostos

### Kit 1: <nome> (slug: <slug>)
- **Composição:** <produto A> x<qtd> + <produto B> x<qtd>
- **Custo somado:** R$ X · **Preço sugerido:** R$ Y · **Margem projetada:** R$ Z
- **Posicionamento, título, fotos, justificativa e riscos:** como acima

## Descartados, com motivo
- <produto>: <motivo>

## Pendências de fornecedor
- <EAN faltando, peso e dimensão, foto crua...>
```

### 6. Resumo no chat e aprovação

Quantos individuais e kits, margem média, as 3 primeiras prioridades. A pessoa
aprova, ajusta ou corta item por item; sem aprovação explícita nada avança.

Ao aprovar, pra cada anúncio aprovado:

1. Criar `dados/pipeline/<slug>/decisao.json` (contrato 3 do `contratos.md`,
   com `aprovado: true` e a data) e `status.json` (contrato 2, `etapa_atual:
   "decidido"`, etapa `decisao` com `aprovado`), copiando o nome do produto
   letra por letra do `catalogo-analisado.csv` e as variações da coluna
   `variacoes`. Slug: minúsculas, sem acento, hífen no lugar de espaço.
   `marca_autorizada` fica `null`; só quando a pessoa disser que é a dona da
   marca ou revendedora autorizada por escrito, perguntar o nome e gravar ali
   (sem isso, a ficha leva `Genérica`).
2. Ressalva do veredito legal entra em `pendencias` do `status.json`.
3. Atualizar a etapa `decisao` de `dados/pipeline/_categorias/<f>-<categoria>.json`
   (contrato 1) com o caminho do plano e os slugs gerados.

Item ajustado pela pessoa: o plano é reescrito antes de gravar o JSON, pra que
Markdown e JSON contem a mesma coisa.

## Regras

- Margem nunca inventada: custo do catálogo, mediana real da pesquisa, comissão
  com fonte e data, imposto da configuração.
- Cada anúncio ou kit leva justificativa; sem ela, não entra no plano.
- Categoria sem candidato viável: o plano diz isso e para. Não se força.
- Kit com componente `fora` ou `desafiador` só se a composição final passa no
  piso, e com a pessoa avisada.
- A decisão de anúncio e o plano de fotos param na pessoa, sempre, mesmo que
  ela peça "roda tudo".
