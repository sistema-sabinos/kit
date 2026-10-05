---
name: engenharia-reversa
description: >
  Estuda um nicho do Mercado Livre por dentro: compara os anúncios que mais faturam com
  anúncios fracos do mesmo produto e mostra o que separa os dois, quanto custa entrar no
  catálogo (escada de preço, Full, loja oficial) e as dúvidas de cliente que nenhum
  concorrente responde. Custo zero; a leitura das fotos pelo Gemini é opcional e paga.
  Use quando o usuário chamar /engenharia-reversa, disser "faz a engenharia reversa de
  [produto]", "o que os campeões de [produto] fazem diferente", "vale entrar em
  [nicho]?", "quanto custa brigar no catálogo de [produto]".
---

# /engenharia-reversa, o que separa campeão de anúncio fraco

## O que essa skill faz

Busca um termo no Mercado Livre, separa até 10 campeões (os que mais faturam:
preço vezes vendas) e até 10 anúncios fracos do MESMO produto (mesma faixa de
preço, mesmo número no título, até 200 vendas), abre a página de cada um e
compara os dois grupos. O que todo mundo faz não conta como vantagem; só vira
achado o que o campeão faz bem mais que o fraco. De quebra: a escada de preço
de cada catálogo e as dúvidas de cliente sem resposta.

Serve em dois momentos: antes de escolher produto, pra entender o nicho; e na
`/decidir-anuncio`, que lê o relatório quando ele existe.

## Dependências

- Chrome dedicado aberto e logado, e a autorização do Mercado Livre no `.env`
  (a `/mercado-livre` ensina)
- `.claude/skills/mercado-livre/referencias/navegador.md`, os cuidados com o
  Chrome dedicado: ler antes de rodar
- Pra parte paga, `GEMINI_API_KEY` no `.env` (o `/conectar` ensina) e
  `limite_gasto_usd` em `_contexto/mercado-livre.md`

## Fluxo

### 1. O termo

O que o comprador digita na busca, do jeito que ele digita ("garrafa termica
inox 1 litro"). Termo largo demais mistura produtos; estreito demais não dá
amostra.

### 2. Rodar a parte grátis

```bash
node .claude/skills/mercado-livre/scripts/abrir-chrome.mjs
node .claude/skills/engenharia-reversa/scripts/rx.mjs --termo "<busca>"
```

Leva uns 5 minutos (cada página espera de 2 a 4 segundos, como uma pessoa).
Com `--so-tradicional`, as páginas de catálogo saem da comparação, e os
anúncios patrocinados cujo link esconde se a página é catálogo também:
use quando a primeira rodada avisar que estudou o produto em vez do anúncio.
Essa rodada grava com `-tradicional` no nome, sem apagar a outra, e o `--ver`
dela também leva `--so-tradicional`.

Grava `relatorios/engenharia-reversa-<termo>-<data>.md` e a pasta
`dados/engenharia-reversa/<termo>/` (coleta, fotos e `resultado.json`).
A página pediu login: a sessão do Chrome dedicado caiu, entrar de novo e
rodar outra vez.

### 3. Ler o relatório com a pessoa

- **Atenção no topo, "não permite conclusão"**: poucos campeões ou poucos
  fracos. Nada ali é regra; tentar um termo mais largo.
- **"Esta rodada estuda o PRODUTO"**: a maioria dos campeões é catálogo, onde a
  foto é a mesma pra todos. Vale a escada de preço e as dúvidas; pra aprender a
  montar anúncio, rodar de novo com `--so-tradicional`.
- **O que separa campeão de fraco**: é o único achado que manda fazer, e só
  numa rodada de anúncio. Na rodada de PRODUTO a seção avisa que é diferença
  de produto e não ensina a montar anúncio.
- **O que o fraco faz e o campeão não**: evitar.
- **Obrigação da categoria**: todo mundo faz; fazer, sem esperar vantagem.
- **Testes que não puderam decidir**: faltou amostra, o que é diferente de dar
  negativo.

### 4. Leitura das fotos pelo Gemini (opcional, paga)

Acrescenta 5 testes (rosto, texto grande na capa, quebra de objeção nas
primeiras fotos, prova social, escala) e a montagem do carrossel campeão.
Trabalha só sobre as fotos que a parte grátis já baixou.

```bash
node .claude/skills/engenharia-reversa/scripts/rx.mjs --termo "<busca>" --ver
```

Isso nunca gasta: mostra o modelo, quantas fotos, a estimativa em dólar e em
minutos e a data em que o preço foi conferido, e para (código 3). Mostrar isso
à pessoa e esperar o "pode ir" dela **naquele momento**, mesmo que outra rodada
já tenha sido aprovada. Com o sim:

```bash
node .claude/skills/engenharia-reversa/scripts/rx.mjs --termo "<busca>" --ver --sim
```

Se o script recusar porque o modelo não está na tabela de preço, conferir o
preço na página oficial do Gemini e avisar quem mantém o kit; nunca chutar.
Cada foto paga vira uma linha em `dados/custos.jsonl`, e o gasto real também
para no `limite_gasto_usd`. Se mais de 1 em cada 5 fotos der erro (cota, rede,
chave) ou o limite cortar a leitura, o script sai com código 1, guarda as fichas
lidas e não refaz o relatório: avisar a pessoa e não rodar de novo sem o "pode ir".

### 5. Recibo no chat

Só o que o script imprime: amostra, placar, os achados e os caminhos. Nunca
colar o relatório.

## Regras

- Nunca inventar dado. Campo que a página não mostrou fica sem dado.
- Só "regra" quer dizer "isto separa campeão de fraco". O resto é contexto.
- Rodada inconclusiva não entra como evidência na `/decidir-anuncio`.
- Sem o custo do produto a escada não diz se cabe margem: isso é da
  `/decidir-anuncio`.
- A página do Mercado Livre muda sem aviso. Se todo anúncio vier sem foto ou
  sem vendas, avisar que os seletores precisam de ajuste, com a data.
