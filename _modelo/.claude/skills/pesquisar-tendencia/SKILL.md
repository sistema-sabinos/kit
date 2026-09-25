---
name: pesquisar-tendencia
description: >
  Pesquisa de mercado no Mercado Livre pros produtos OK e CUIDADO de uma categoria do
  catálogo do fornecedor: faixa de preço praticada, concorrência, catálogo unificado,
  loja oficial disputando e nota de oportunidade de 0 a 100. Coleta pela API do Mercado
  Livre e pela busca aberta no Chrome dedicado, custo zero. É a etapa 2 da esteira. Use
  quando o usuário chamar /pesquisar-tendencia, disser "pesquisa o mercado de
  [categoria]", "quanto está saindo [produto] no Mercado Livre", "vale a pena vender
  isso?", ou quando a /mercado-livre despachar o agente ml-minerador.
---

# /pesquisar-tendencia, o mercado de uma categoria em números

## O que essa skill faz

Pega os produtos que passaram na `/analisar-catalogo` e, pra cada um, mede o
que o Mercado Livre está vendendo: preço mínimo, mediano e máximo, quantos
anúncios disputam, se existe página de catálogo e quem disputa a compra nela,
e a margem bruta na mediana. Sai um `.md` pra ler e um `.csv` que a
`/decidir-anuncio` consome. Na esteira, quem roda é o agente `ml-minerador`.

## Dependências

- `fornecedores/<f>/catalogo-analisado.csv` (a `/analisar-catalogo` rodou)
- `_contexto/vereditos-legais.md`: produto sem veredito válido não entra
- `.env` com a autorização do Mercado Livre (`/conectar`, seção Mercado Livre e Bling)
- Chrome dedicado aberto e logado (`node .claude/skills/mercado-livre/scripts/abrir-chrome.mjs`)
- `.claude/skills/mercado-livre/referencias/navegador.md`, os cuidados com o
  Chrome dedicado: ler antes de clicar ou navegar
- `.claude/skills/mercado-livre/referencias/contratos.md`, seção 0: as colunas que saem daqui

## Fluxo

### 1. Fornecedor e categoria

Perguntar, ou tirar da conversa ou do despacho. Uma categoria por rodada.

### 2. Carregar os produtos

Ler o `catalogo-analisado.csv` e ficar com as linhas da categoria pedida com
`status` `OK` ou `CUIDADO`. Mais de 15 produtos: perguntar se roda tudo ou em
dois lotes. Produto sem `custo` fica de fora, com aviso (sem custo não há margem).

### 3. Escolher o termo de busca de cada produto

O termo é o que um comprador digitaria, e decide a qualidade da pesquisa:

- Partir do nome do catálogo, limpo: sem código de fabricante, sem unidade de
  embalagem quando ela é genérica ("cx 12 un").
- Manter o que muda o produto: tamanho, sabor, quantidade no kit.
- Na dúvida, o termo mais curto que ainda descreve o produto certo.

### 4. Montar a entrada

Gravar `fornecedores/<f>/pesquisa-input-<categoria>.json`, uma lista:

```json
[
  { "nome": "Suspiro Tradicional 1 kg", "custo": 30.0, "termo": "suspiro 1kg", "cuidado": null },
  { "nome": "Bala de Gengibre 500 g", "custo": 12.5, "termo": "bala de gengibre", "cuidado": "descrição sem citar efeito" }
]
```

`nome` igual ao do CSV. `custo` em número com ponto. `cuidado` traz a
observação dos produtos `CUIDADO`, ou `null`.

### 5. Coletar

```bash
node .claude/skills/mercado-livre/scripts/abrir-chrome.mjs
node .claude/skills/pesquisar-tendencia/scripts/coletar-cdp.mjs --fornecedor <f> --categoria <c>
```

O primeiro reaproveita o Chrome se já estiver aberto. Se ele falhar, é
bloqueio: parar e dizer o que aconteceu, porque o pacote não tem rota paga de
coleta. O segundo abre a busca de cada termo (até duas páginas, 120 anúncios),
consulta o catálogo unificado pela API, grava
`_raw-pesquisa-<categoria>.json` e no fim gera o `.md`, o `.csv` e a etapa
`pesquisa` em `dados/pipeline/_categorias/<f>-<categoria>.json`. Leva mais de
10 segundos por produto, de propósito: navegação com ritmo de gente. A cada
produto coletado o arquivo bruto já é salvo: caiu no meio (energia, fechou o
Chrome), rodar de novo com `--retomar`, que pula quem já foi coletado hoje e
avisa quantos pulou.

Pra só refazer os arquivos a partir da coleta que já existe:
`node .claude/skills/pesquisar-tendencia/scripts/pesquisar.mjs --fornecedor <f> --categoria <c>`.

### 6. Revisar o que veio sem dado

Produto `sem dado` (a busca pediu login, veio vazia ou a página mudou) merece
uma segunda tentativa com outro termo: rodar de novo com um `pesquisa-input`
só com o produto do termo novo; a coleta junta com o que já estava. Pediu login: a sessão do
Chrome dedicado caiu, entrar na conta de novo nessa janela. Persistiu, vira
pendência no resumo, nunca preço inventado.

Confira também a mediana: kit e unidade na mesma busca distorcem a faixa
(um "kit 10" no meio de unidades puxa a mediana pra cima). Se aconteceu, dizer
no resumo e sugerir termo mais preciso.

### 7. Recomendação de imagens

Pros produtos com nota 50 ou mais, acrescentar no `.md`, dentro da seção do
produto, um bloco "Recomendação de imagens (dado de mercado)", lido dos
títulos e dos cinco primeiros anúncios: o que a maioria mostra na capa, se usa
texto, se mostra o produto em uso, e o que quase ninguém faz (a lacuna). O
`ml-designer` parte daqui, e o plano de fotos final sai com a pessoa.
Escrever esse bloco só depois do último processamento, porque reprocessar
refaz o `.md` e apaga o que foi acrescentado.

### 8. Resumo no chat

Sem despejar tabela. Total de produtos e quantos em cada classificação, os
três melhores e os três piores (nome e nota), alertas (sem dado, mediana
distorcida, loja oficial dominando) e os caminhos dos arquivos. Perguntar se
roda a próxima categoria.

## A nota de oportunidade

Começa em 50 e vai de 0 a 100:

| Sinal | Pontos |
|---|---|
| mediana de preço pelo menos 2 vezes o custo | +10 |
| mediana pelo menos 3 vezes o custo | +10 |
| menos de 20 anúncios na busca | +10 |
| tem catálogo unificado e nenhuma loja oficial entre os 5 que disputam | +5 |
| mediana abaixo de 1,5 vez o custo | -10 |
| o mais barato mais de 25% abaixo da mediana (guerra de preço) | -5 |
| mais de 50 anúncios com preço colado (faixa menor que 20% da mediana) | -15 |

70 ou mais é `oportunidade forte`; 50 a 69, `vale considerar`; 30 a 49,
`desafiador`; abaixo de 30, `fora`. Sem preço lido, `sem dado`. Preço fora de
30% a 500% da mediana é descartado antes da conta (erro de leitura ou anúncio
de outra coisa).

A nota é heurística: ordena a conversa, e quem decide é a pessoa, na
`/decidir-anuncio`. Se ela discordar da nota de algum produto, perguntar se
quer registrar o porquê em `_contexto/empresa.md`, pra calibrar a próxima vez.

## Regras

- Custo zero. A coleta é pelo Chrome dedicado e pela API gratuita do Mercado
  Livre; não existe rota paga neste pacote.
- Nunca inventar dado. Busca vazia é `sem dado`, com o motivo.
- Um produto que falha não para a rodada: vira erro na linha dele e a coleta segue.
- Rodar de novo quando o catálogo mudar, e antes de decidir anúncio pago de um produto.
- O layout da busca muda sem aviso. Se todo produto vier `sem dado` com
  "nenhum anúncio lido", a página mudou: olhar a janela do Chrome dedicado e
  avisar que o `coletar-cdp.mjs` precisa de ajuste, com a data.
