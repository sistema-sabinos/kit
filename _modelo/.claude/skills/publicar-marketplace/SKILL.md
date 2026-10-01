---
name: publicar-marketplace
description: >
  Publica um anúncio auditado no Mercado Livre. Sem ERP, cria o anúncio direto
  pela API do Mercado Livre, já pausado, depois do "pode ir" da pessoa, e ela
  confere no painel e ativa; com Bling, ou quando o produto tem variação ou é
  de catálogo, monta o checklist com todos os valores prontos pra colar. É a
  etapa 7 da esteira, e só roda com auditoria aprovada. Use quando o usuário
  chamar /publicar-marketplace, disser "publica o [produto]", "manda pro
  Mercado Livre", "cria o anúncio", "o que eu preencho no painel", "já ativei o
  anúncio", ou voltar com o código do anúncio publicado.
---

# /publicar-marketplace, a etapa que publica

## O que essa skill faz

Leva o anúncio auditado até o Mercado Livre. Sem ERP, o caminho padrão é a
API: o script monta o anúncio, o Mercado Livre confere antes (a validação dele
não cria nada), a pessoa lê o resumo e diz "pode ir", e o anúncio nasce
PAUSADO. Quem põe no ar é a pessoa, no painel, depois de conferir, e ela aplica o
desconto antes de ativar se a Central de Promoções deixar: publicar continua
sendo ação dela. Com Bling, e no plano B da API,
a skill entrega o roteiro completo, cada campo com o valor pronto, na ordem da
tela, com os bloqueios no topo, e elimina a etapa de "pensar o que
preencher".

## Pré-condição dura

`dados/pipeline/<slug>/auditoria.json` com `veredito: "aprovado"`. Sem isso,
parar e dizer o que falta. Não existe exceção.

## Dependências

- `dados/pipeline/<slug>/`: `copy.json` (título, descrição, ficha, preços,
  mapa de fotos), `imagens.json` (`aprovado_pelo_usuario: true`),
  `auditoria.json`, `status.json`, e `publicacao.json` com o bloco `erp` quando
  a `/cadastrar-bling` já rodou
- `anuncios/<slug>/imagens/`: os arquivos, na ordem do mapa
- `_contexto/mercado-livre.md`: `erp`, `deposito_id`, `canal_id`
- `.claude/skills/mercado-livre/referencias/precificacao.md` (preço de lista e
  desconto), `clips.md` (vídeo) e `regras-ml.md`

Caminhos que começam em `_contexto/`, `dados/` e `anuncios/` são da raiz do
projeto.

## As três rotas

**Com Bling (`erp: bling`).** O produto já existe no Bling (etapa 6). O anúncio
nasce no canal do Mercado Livre cadastrado no Bling (`canal_id` da
configuração), em Gestão de Anúncios do Bling, na tela de edição do anúncio, onde
título, descrição, categoria, atributos, garantia e modalidade se preenchem à
mão: o Bling não puxa a descrição do cadastro pro anúncio. Antes de começar,
conferir que a integração do Mercado Livre no Bling está logada; árvore de
categoria que não carrega é token expirado, e a solução é sair e entrar de novo
na integração.

**Sem ERP, pela API (o padrão).** O script `publicar-ml.mjs` cria o anúncio
pausado na conta da pessoa. Passo a passo na seção "Rota API" abaixo. Precisa
da conta do Mercado Livre autorizada com um aplicativo de leitura e escrita
(o `/conectar` guia).

**Sem ERP, pelo painel (plano B).** Quando o script sai com PLANO B (produto
com variação de cor, tamanho ou sabor, ou categoria que exige anúncio de
catálogo) ou a conta não tem permissão de escrita: direto no painel do
Mercado Livre (Vender, anunciar), com o checklist. Mesmos campos, mesma
ordem; as imagens sobem do computador.

## Rota API, passo a passo

Os comandos rodam da raiz do projeto.

1. Perguntar à pessoa, se o despacho não trouxe: quantas unidades anunciar
   (no dropshipping, no máximo o que o fornecedor confirmou) e quantos dias de
   garantia. O kit não guarda esses dois, e inventar estoque vende o que o
   fornecedor não tem.
2. Montar, sem mexer na conta:
   `node .claude/skills/publicar-marketplace/scripts/publicar-ml.mjs --montar <slug> --estoque N --garantia-dias N`.
   Ele acha a categoria pelo título, cruza a ficha com os campos que a
   categoria exige, pede a validação do Mercado Livre e mostra o resumo.
   - Saiu com código 0: mostrar o resumo inteiro à pessoa e esperar o "pode
     ir". Categoria errada: montar de novo com `--categoria MLB123`.
   - Código 1: o resumo lista o que falta resolver (campo da ficha,
     medidas da embalagem com `--embalagem CxLxA --peso-g N`, título longo).
     Resolver e montar de novo. Nada foi enviado.
   - Código 2: PLANO B. Seguir pelo checklist do painel (seção "Fluxo").
3. Com o "pode ir":
   `node .claude/skills/publicar-marketplace/scripts/publicar-ml.mjs --enviar <slug>`.
   Ele sobe as imagens, cria o anúncio pausado, grava a descrição, lê de
   volta pra conferir, grava `publicacao.json` e `status.json` e imprime o
   link. Repassar à pessoa o link e cada aviso. Aviso com ATENCAO quer dizer
   anúncio ATIVO que ela ainda não conferiu: pedir que pause no painel agora.
   Se o `--enviar` disser que o Mercado Livre recusou na validação e nada foi
   criado, resolver o que ele lista, montar de novo e pedir outro "pode ir".
   Primeira vez nessa conta: se o anúncio sair "em revisao", "inativo" ou
   "ainda nao ativo", não ativar nada e mostrar o recibo.
4. Se o `--enviar` disser que a copy ou as imagens mudaram depois do resumo,
   montar de novo e pedir outro "pode ir": o anterior valeu pro que ela leu.
5. Se a resposta do Mercado Livre não chegar (queda de internet, ou erro 5xx
   do lado dele), nunca criar o anúncio no painel nem mandar a pessoa criar:
   rodar o `--enviar` de novo, que ele procura na conta se o anúncio chegou
   antes de tentar outra vez. Enquanto o envio não confirma, o script guarda
   `anuncios/<slug>/ml-tentativa.json` pra saber o que procurar. Se o envio
   anterior foi há menos de 10 minutos, o script pede pra esperar e rodar de
   novo depois, porque a busca do Mercado Livre demora pra mostrar o anúncio
   novo.
6. A pessoa abre o link no painel, confere título, fotos, ficha e descrição,
   tenta aplicar o desconto na Central de Promoções antes de ativar; se a
   Central não deixar com o anúncio pausado, ativa e aplica o desconto na
   mesma hora, senão ele vende no preço de lista, que é inflado. Quando ela
   disser que ativou:
   `node .claude/skills/publicar-marketplace/scripts/publicar-ml.mjs --conferir <slug>`.
   Ativo: a etapa fecha e o produto fica `publicado`. Acrescentar a linha em
   `_contexto/estrategia.md`, como no passo 4 do fluxo.

## Fluxo

As regras de plataforma deste checklist (frete grátis acima de R$ 79, Clips,
campos do Bling) estão datadas em `regras-ml.md`, `precificacao.md` e
`clips.md`; conferir ao vivo antes de publicar.

### 1. Conferir o que já existe

Com Bling: ler o produto por API (`GET /produtos/{id}`, com o token que se
renova sozinho) e validar nome, SKU, preço maior que zero, custo, NCM, peso e
dimensões, condição "Novo", estoque maior que zero no depósito da
configuração, fornecedor vinculado. Faltou algo: parar e listar, com o
caminho pra resolver. Produto incompleto não se publica.

Sem ERP, no plano B: conferir `copy.json` sem `[PREENCHER]` e `imagens.json` aprovado.

Dropshipping: estoque anunciado igual ou menor que o que o fornecedor
confirmou; prazo de disponibilidade vazio quando o fornecedor despacha no
mesmo dia (o prazo extra derruba a exposição do anúncio); `fornecedor.md` com
`prazo_despacho` e `emite_nota: sim`. Faltou: bloqueio no topo do checklist.

### 2. Montar o anúncio

Título e capa vêm prontos do `copy.json` e do `imagens.json`; aqui não se
inventa título novo. A modalidade (Clássico ou Premium) é a de
`modalidade_escolhida` em `auditoria.json`. Preço de
lista inflado e desconto vêm da `precificacao.md`: a lista é o alvo dividido
por (1 menos o desconto), e o desconto se aplica na Central de Promoções logo
depois de publicar, senão o anúncio fica no preço cheio.

### 3. Gravar o checklist

`anuncios/<slug>/publicacao-ml.md`:

```markdown
# Publicação no Mercado Livre: <produto>

> Gerado por /publicar-marketplace em <AAAA-MM-DD>. Rota: <Bling | painel do Mercado Livre>

## Bloqueios antes de clicar
- [ ] <estoque zero, validade não confirmada, ressalva do veredito pendente, foto crua faltando, fornecedor de drop sem prazo de despacho por escrito...>

## Cabeçalho
- Produto: <nome> (SKU <sku>) · Estoque: <N> no depósito <nome ou id>
- Modalidade: <Clássico | Premium> (pelo simulador em <AAAA-MM-DD>)

## Dados básicos
- Título: `<título>` (<N> caracteres)
- Categoria: digitar "<nome da categoria>" na busca e escolher a sugerida
- Descrição: copiar o bloco abaixo inteiro

<descrição completa do copy.json; na rota Bling, com <p> nos parágrafos e <br> nas quebras, sem negrito>

## Preço e promoção
- Preço de lista: R$ <lista inflada>
- Depois de publicar, na Central de Promoções: desconto de <N>% pra chegar em R$ <alvo>

## Imagens, nesta ordem (a primeira é a capa)
1. anuncios/<slug>/imagens/01-capa.jpg
2. anuncios/<slug>/imagens/02-<papel>.jpg

## Atributos da categoria
- Marca: <fabricante ou "Sem marca">
- <cada atributo da ficha, com o valor>
- Registro no órgão: <número, ou em branco; nunca "não se aplica">

## Envio e garantia
- Mercado Envios: ativo · Frete grátis: <sim | não> (preço acima de R$ 79 obriga)
- Garantia: do vendedor, <prazo>

## Depois de publicar
- [ ] Aplicar o desconto na Central de Promoções
- [ ] Me mandar o código do anúncio (as letras MLB seguidas de números)
- [ ] Vídeo do anúncio (Clips), 9:16, de 10 s a 1 min: pendente (regras em clips.md)
- [ ] Conferir campanha cofinanciada disponível (regras-ml.md); entrar é decisão sua
```

### 4. Registrar a publicação

Quando a pessoa voltar com o código do anúncio: gravar em
`dados/pipeline/<slug>/publicacao.json` (contrato 7, bloco `canais`, com
modalidade e preço), marcar `status.json` com etapa `publicacao` `ok` e
`etapa_atual` `publicado`, e acrescentar uma linha em
`_contexto/estrategia.md`. Conferir por API que o anúncio existe
(`GET /items/<código>`), e que a promoção pegou.

## O que já derrubou anúncio (conferido em conta real, 2026-06 a 2026-08)

- Categoria de alimento rejeita produto sem condição "Novo".
- Na rota Bling, a descrição vai no campo de descrição principal (curta), que
  é o que o Mercado Livre puxa; texto puro com quebra de linha colapsa no
  editor, por isso `<p>` e `<br>`; negrito não renderiza.
- Marca "Sem marca" em kit e produto revendido; nome do fabricante em anúncio
  seu pode virar denúncia, e o nome da loja conflita com catálogo.
- Anúncio duplicado (Clássico e Premium do mesmo produto) divide esforço e faz
  as campanhas de anúncio darem lance uma contra a outra. Um por produto.
- Chamada da API com 401: token vencido; renove o token com
  `node .claude/skills/mercado-livre/scripts/lib/tokens.mjs ml` e use o
  `ML_ACCESS_TOKEN` do `.env`.

## Regras

- Auditoria aprovada ou nada.
- Um anúncio por produto; segundo posicionamento é produto ou kit novo.
- Publicar, aplicar promoção e entrar em campanha são ações da pessoa, com o
  "pode ir" daquele momento. Na rota API, o `--enviar` só roda depois do
  "pode ir" sobre o resumo, e o anúncio nasce pausado: quem ativa é ela.
- Escrita na API nunca se repete no escuro: resposta que não chegou se
  resolve rodando o `--enviar` de novo, que procura antes de criar.
- Toda regra de plataforma citada aqui leva data e se confere ao vivo antes
  de agir.
