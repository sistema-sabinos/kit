---
name: cadastrar-bling
description: >
  Cadastra no Bling (ERP) o produto de um anúncio já auditado: monta o payload a partir
  do copy.json e do catálogo, mostra o resumo, e só depois do "pode ir" cria o produto,
  aplica o NCM, lança o estoque e vincula o custo do fornecedor. É a etapa 6 da esteira
  e só vale pra quem usa Bling (erp: bling na configuração). Use quando o usuário chamar
  /cadastrar-bling, disser "cadastra o [produto] no Bling", "joga no Bling", "manda pro
  ERP", ou quando o agente ml-publicador chegar na etapa de cadastro.
---

# /cadastrar-bling, do anúncio auditado ao produto no ERP

## O que essa skill faz

Cria o produto no Bling com tudo o que a esteira já decidiu: título, descrição
no formato que o Bling repassa ao Mercado Livre, preço da modalidade que o
auditor escolheu, GTIN, marca, peso, medidas, NCM, estoque e custo. Não
publica em canal nenhum: a publicação é da `/publicar-marketplace`. Sem ERP
(`erp: nenhum`), esta skill fica instalada e dormente.

## Dependências

- `_contexto/mercado-livre.md` com `erp: bling`, `sku_prefixo` e, pra lançar
  estoque, `deposito_id`
- `dados/pipeline/<slug>/`: `status.json`, `decisao.json`, `copy.json` e
  `auditoria.json` com `veredito: aprovado` (sem auditoria aprovada o script recusa)
- `fornecedores/<f>/catalogo-analisado.csv`: peso, medidas e custo do produto
- `fornecedores/<f>/bling.json`: o CNPJ do fornecedor e o id da categoria do
  Bling pra cada categoria sua (o passo 2 monta)
- Autorização do Bling no `.env` (`/conectar`, seção Mercado Livre e Bling)

## Fluxo

### 1. Qual anúncio

O slug, da conversa ou do `status.json` que está em `auditado`.

### 2. Categoria e fornecedor no Bling (uma vez por fornecedor)

Se `fornecedores/<f>/bling.json` não existe ou não tem a categoria:

```bash
node .claude/skills/cadastrar-bling/scripts/cadastrar.mjs --categorias
```

Mostrar a lista (id e nome), a pessoa escolhe, e gravar:

```json
{ "cnpj": "00.000.000/0001-00", "categorias": { "doces": 1234567 } }
```

O CNPJ do fornecedor é o que faz o custo entrar no Bling (o custo só grava
pelo vínculo com o fornecedor). A pessoa informa uma vez. Se o fornecedor
ainda não é contato no Bling, ela cadastra no painel antes.

### 3. Montar e mostrar

```bash
node .claude/skills/cadastrar-bling/scripts/cadastrar.mjs --montar <slug> --estoque <N>
```

`--estoque` só quando a pessoa tem o produto em mãos (drop sem estoque próprio
não lança). O script grava `anuncios/<slug>/bling-payload.json` e imprime o
resumo com as pendências. Se o Bling já tem produto com o mesmo nome ou GTIN,
o resumo mostra "Possivel duplicado no Bling" e pede confirmar com a pessoa
antes de enviar. Mostrar o resumo inteiro e perguntar: "mando pro Bling?".
Nada foi enviado até aqui.

### 4. Enviar, com o "pode ir"

```bash
node .claude/skills/cadastrar-bling/scripts/cadastrar.mjs --enviar <slug>
```

Cria o produto (SKU `<prefixo>-<3 letras da categoria>-<número>`, o próximo
livre, e anda o número sozinho se colidir), aplica o NCM, confere que o
depósito existe antes de lançar estoque, vincula o custo pelo CNPJ, grava o
bloco `erp` em `dados/pipeline/<slug>/publicacao.json` e marca `cadastrado` no
`status.json`.

### 5. Resumo no chat

Id e SKU no Bling, e as pendências que o script listou, sempre com as imagens
(sobem do computador pela tela do anúncio). Próximo passo: `/publicar-marketplace`.

## Vários produtos de uma vez

```bash
node .claude/skills/cadastrar-bling/scripts/cadastrar.mjs --montar-lote slug1,slug2,slug3
```

Monta cada slug como o `--montar` já faz e mostra um resumo único: uma linha
por produto (nome, SKU a gerar, preço, duplicado possível sim ou não,
pendências) e o total no fim. Produto que não monta entra na lista com o
motivo e não derruba o lote. O gate humano vale pro lote inteiro: mostrar
esse resumo e um único "pode ir" cobre o envio de todos.

O lote vai sem estoque: produto com estoque em mãos usa `--montar <slug> --estoque N` sozinho e fica fora do lote.
No `--enviar-lote` vão só os slugs que montaram no `--montar-lote` mostrado: o que aparece como "não montou" sai da lista (o `bling-payload.json` velho dele já foi apagado).

```bash
node .claude/skills/cadastrar-bling/scripts/cadastrar.mjs --enviar-lote slug1,slug2,slug3
```

Envia na ordem, pula quem `jaCadastrado` já barra (conta como "já estava") e
para no primeiro erro, sem seguir cadastrando no escuro (o aviso ATENCAO de
produto criado sem o id gravado também para). No fim confere cada
id criado nesta rodada direto no Bling e mostra planejados, criados agora,
já estavam e conferidos no Bling, e cada produto criado com id, SKU e
pendências. Rodar de novo depois de uma queda é
seguro: quem já foi cadastrado é pulado. O número final tem que bater
(planejados = criados + já estavam); se não bater, investigar antes de
seguir.

## Regras

- Nunca enviar sem o "pode ir" daquele momento. O `--montar` existe pra isso.
- Marca na ficha: `Genérica` em kit, revenda e dropshipping. O nome do
  fabricante só quando você é a dona da marca ou revendedora autorizada por
  escrito, e aí ele vem de `decisao.json` em `marca_autorizada`. Nunca o nome
  da loja. Marca fora da regra trava o `--montar` (o payload não nasce); marca própria em
  produto de terceiro derruba o anúncio por denúncia de propriedade intelectual.
- Copy, imagens ou decisão mexidos depois da auditoria: o `--montar` recusa até
  o `ml-auditor` rodar de novo (ele carimba a auditoria no fim).
- GTIN nunca inventado. Kit montado por você não tem GTIN, e isso é o certo.
- Condição "Novo" vai marcada: categoria de alimento recusa anúncio sem ela.
- A descrição vai no campo que o Bling manda pro Mercado Livre, com as
  quebras de linha convertidas pra `<br>` (o editor do Bling engole quebra comum).
- Produto que parece já existir no Bling (mesmo nome ou mesmo GTIN): parar e
  perguntar se atualiza ou cria outro. O padrão é nem um nem outro.
- Erro do Bling sobe com a mensagem original dele: repassar como veio, ela diz
  o campo errado.
- Sem Bling (`erp: nenhum`), o script recusa e a rota é a `/publicar-marketplace`
  direto no Mercado Livre, pela API.

## O MCP do Bling (consulta)

`mcp/` traz um servidor MCP só de leitura (produtos, categorias, depósitos,
canais, contatos, saldo de estoque e qualquer GET da API). Serve pra conferir
coisas no chat sem abrir o painel. Escrever no Bling é sempre pelo
`cadastrar.mjs`, que mostra o resumo antes. O `/conectar` instala e registra.
