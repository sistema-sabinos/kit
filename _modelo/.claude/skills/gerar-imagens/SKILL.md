---
name: gerar-imagens
description: Faz as imagens do anúncio sozinha (capa, fotos de clima e peças com texto) a partir das fotos reais do produto e do mapa de fotos, pelo melhor motor que você tiver (Codex, Gemini ou nenhum), e junta tudo numa prancha pra você só aprovar ou pedir pra refazer. É a etapa 5.5 da esteira do Mercado Livre, usada pelo agente ml-designer. Use quando o usuário chamar /gerar-imagens, disser "faz as fotos do anúncio", "gera as imagens do [produto]", "refaz a foto 3", ou quando a /mercado-livre chegar nas imagens.
---

# /gerar-imagens

Você faz as imagens do anúncio. A pessoa só olha a prancha e responde
"aprova tudo" ou "refaz a 3: mais clara".

## A regra que manda em tudo

A IA nunca desenha o produto e nunca escreve texto. Ela come acento, troca
letra e já inventou código de barras de produto real. Por isso:

| A imagem tem | Quem faz | Script |
|---|---|---|
| O produto | a foto real, recortada | `recortar-fundo.mjs` e `compor-cena.mjs` |
| Fundo de clima (cozinha, bancada, estúdio) | a IA, com o centro vazio, ou uma cor lisa | `gerar-cenario.mjs` |
| Qualquer texto (medida, dose, ficha, chamada) | HTML virando imagem | `montar-peca.mjs` |

Nunca usar imagem de anúncio de concorrente, nem modificada: é direito
autoral e dá ao dono o botão de derrubar o seu anúncio.

## Antes de começar

1. Ler `dados/pipeline/<slug>/copy.json` (o `mapa_fotos`), o guia de marca
   (`guia_de_marca` em `_contexto/mercado-livre.md`, padrão
   `marca/design-guide.md`, seção "Estilo por categoria") e
   `referencias/estilos.md` desta skill. Guia sem a seção "Estilo por
   categoria": usar o estilo Limpo.
2. Listar `anuncios/<slug>/fotos-cruas/`. Vazia: parar e explicar como
   fotografar (produto inteiro, fundo branco ou bem claro, luz de janela, de
   frente e um pouco de cima, celular na horizontal da mesa). No dropshipping, a
   foto do fornecedor serve se a autorização está no `fornecedor.md`.
3. Rodar `node .claude/skills/gerar-imagens/scripts/motor.mjs`. Ele diz o
   degrau: `codex`, `gemini` ou `zero-ia`. Se disser que falta o Playwright,
   rodar o comando que ele mostra e tentar de novo.
4. Degrau `gemini` custa dinheiro por imagem. O preço, a estimativa e o "pode
   ir" acontecem na conversa principal: na `/mercado-livre`, ou nesta mesma
   conversa quando a pessoa chamou a `/gerar-imagens` direto. Ali: conferir na
   web, hoje, o preço por imagem do modelo de imagem do Gemini (página oficial
   de preços do Google AI), contar as fotos de clima do `mapa_fotos`, mostrar a
   estimativa (preço vezes número de cenários) e esperar o "pode ir". O
   `ml-designer` não pergunta nada à pessoa: ele só passa
   `--preco-usd <preço> --autorizado` quando o despacho traz "gasto
   autorizado: US$ X, preço por imagem Y". Sem isso, segue no `zero-ia` e diz
   isso no recibo.

## Fazer

Arquivos de trabalho em `anuncios/<slug>/cenarios/` e `anuncios/<slug>/pecas/`;
as imagens finais em `anuncios/<slug>/imagens/NN-papel.jpg`, na ordem do mapa.

1. **Recorte**, uma vez por foto crua:
   `node .claude/skills/gerar-imagens/scripts/recortar-fundo.mjs --in anuncios/<slug>/fotos-cruas/<foto> --out anuncios/<slug>/cenarios/<foto>-recorte.png`
   Veio `aviso`: embalagem branca pede `--limiar 248`; fundo que não sai pede
   foto nova. Abrir o recorte (Read) e conferir que nada do produto sumiu.
2. **Capa `01-capa`**, sempre sem IA:
   `node .claude/skills/gerar-imagens/scripts/compor-cena.mjs --fundo "#ffffff" --produto <recorte.png> --out anuncios/<slug>/imagens/01-capa.jpg --escala 0.85 --linha 0.95`
   Fundo branco puro, produto ocupando quase tudo, sem texto, sem logo, sem selo.
3. **Cenários** (só degrau `codex` ou `gemini`): um `anuncios/<slug>/cenarios/cenas.json`
   com todas as fotos de clima do mapa, cada uma com a descrição do lugar nas
   cores do estilo, e UMA chamada só (em lote gasta menos cota).
   Codex: antes do lote, a pessoa ouve uma vez "o Codex não cobra por imagem
   dentro da cota do seu plano; se você comprou créditos avulsos do Codex,
   passar do limite do plano gasta esses créditos" (na `/mercado-livre`, quem
   diz é a conversa principal, antes do despacho).
   `node .claude/skills/gerar-imagens/scripts/gerar-cenario.mjs --degrau codex --cenas anuncios/<slug>/cenarios/cenas.json`
   Gemini, só depois do "pode ir" desta rodada (sem ele, nunca `--autorizado`):
   `--degrau gemini --preco-usd <preço do dia> --contexto "designer <slug>" --autorizado`.
   Quando dá errado:
   - Codex, saída 1 com `cota_estourada: true`: com gasto no Gemini já
     autorizado nesta rodada, repetir as que faltaram no Gemini; sem, seguir as
     que faltaram no `zero-ia` e avisar no recibo.
   - Codex, saída 1 sem `cota_estourada`: tentar de novo uma vez. Falhou de
     novo: fazer essas cenas no `zero-ia` e dizer isso.
   - Saída 3 falando de `limite_gasto_usd`: o lote passou do teto. Dividir em
     lotes menores, dentro do que a pessoa autorizou, ou combinar com ela subir
     o `limite_gasto_usd` em `_contexto/mercado-livre.md`.
   - Saída 3 falando de "pode ir": faltou a autorização. Parar e pedir; no
     `ml-designer`, seguir no `zero-ia` e dizer no recibo.
4. **Foto de clima**: `compor-cena.mjs --cena <cenario.png>` (ou `--fundo` com a
   cor do estilo no `zero-ia`), produto em `--escala 0.55` e `--linha 0.85` como
   ponto de partida. Cenario escuro e borda clara em volta do produto: refazer o
   recorte com `--feather 0` e `--limiar 248`.
5. **Peça com texto** (infográfico, medidas, modo de uso): escrever
   `anuncios/<slug>/pecas/NN-papel.html` no estilo da categoria, com a foto
   composta ou o recorte como `<img>` relativo, e rodar
   `node .claude/skills/gerar-imagens/scripts/montar-peca.mjs --html anuncios/<slug>/pecas/NN-papel.html --out anuncios/<slug>/imagens/NN-papel.jpg`.
   Texto curto, grande, no máximo 3 cores. Todo número vem da ficha do
   `copy.json`, nunca de cabeça.

## Revisar antes de mostrar

Abrir cada imagem (Read) e conferir, refazendo sozinho o que falhar:
- Capa: fundo branco puro, sem texto, produto inteiro e sem pedaço comido.
- Cada palavra escrita: acento, cedilha, til, crase ("à noite"), ordinal com
  º ("1º", nunca "1o"), apóstrofo ("d'água"), número igual ao da ficha.
- Escala: um objeto de 18 cm não pode parecer gigante perto de uma porta.
- Cenário: nenhum produto, pote, texto ou pessoa em lugar nenhum da imagem,
  inclusive desfocado no fundo. Achou: gerar de novo esse cenário.
- Cores dentro do estilo, no máximo 3 por peça.

## Prancha e aprovação

1. Gravar `dados/pipeline/<slug>/imagens.json` (contrato 5, com `motor` em cada
   imagem e `aprovado_pelo_usuario: false`). Peça com texto herda o motor da
   foto de base.
2. `node .claude/skills/gerar-imagens/scripts/prancha.mjs --imagens dados/pipeline/<slug>/imagens.json`
3. Abrir a prancha pra pessoa: no Windows `cmd /c start "" "<caminho>"`, no Mac
   `open "<caminho>"`. Dizer: "Abri as fotos no navegador. Responde aqui:
   aprova tudo, ou refaz a 3 e diz o que mudar."
4. Refazer só as citadas, com o mesmo nome de arquivo, e gerar a prancha de
   novo. Nunca refazer o conjunto por causa de uma. Refazer no Gemini é gasto
   novo: estimativa e "pode ir" de novo antes (no `ml-designer`, vindos no
   despacho).
5. Aprovou: `aprovado_pelo_usuario: true`, cada imagem `aprovada: true`, e a
   esteira segue pra auditoria.

## Custo

Codex: sem cobrança por imagem dentro da cota do plano; se você comprou
créditos avulsos do Codex, passar do limite do plano gasta esses créditos. O
recibo diz quantos cenários foram pelo Codex. Gemini: cada imagem vira
uma linha em `dados/custos.jsonl` (o script grava sozinho) e o total aparece na
prancha. Recorte, composição, peça e prancha: sempre zero.
