---
name: video-produto
description: Faz o vídeo vertical do produto (Mercado Clips) sem você filmar nada, a partir de um anúncio do Mercado Livre que já vende o mesmo produto. Lê as perguntas e opiniões reais dos compradores, escreve o roteiro, gera os clipes, a voz e a música com IA e monta o vídeo com legenda. Para antes de gastar e pede o seu "pode ir". Use quando o usuário chamar /video-produto, disser "faz um vídeo do produto", "vídeo pro Clips", "vídeo do anúncio sem filmar", "esse anúncio tá sem vídeo", "cria o clipe pro Mercado Livre".
---

# /video-produto

Você faz um vídeo de 32 a 56 segundos do produto, sem filmar nada. A pessoa só
aprova duas coisas: o texto do roteiro (antes de gastar) e o vídeo pronto.

## Como funciona, em palavras simples

O Mercado Livre deixa o vendedor subir um vídeo curto, vertical, chamado Clips.
O gerador do próprio ML pede que você filme o produto na mão. Quem vende sem
estoque em casa não consegue. Aqui o vídeo nasce de IA:

- **Veo** (do Google) cria os clipes de 8 segundos a partir de uma foto do produto.
- **Gemini voz** lê a narração.
- **Lyria** (do Google) cria a música de fundo. A música do vídeo do anúncio no
  Mercado Livre (Clips) é sempre gerada aqui, porque o ML recusa música de
  terceiro no Clips. A biblioteca de músicas do `/editar-video` serve pros vídeos
  de redes sociais.
- **ffmpeg** (programa gratuito) emenda tudo e queima a legenda.

AIDA é a ordem do roteiro: Atenção, Interesse, Desejo, Ação. Cada bloco de 8
segundos serve uma dessas etapas.

## Antes de tudo

1. Rode `node .claude/skills/configurar-video/scripts/conferir.mjs`. Ele diz o
   que falta instalar (ffmpeg e companhia). Faltando algo, mande a pessoa pro
   `/configurar-video` e pare aqui.
2. A chave do Gemini fica no `.env` do projeto. Sem ela, mande a pessoa pro
   `/conectar`, que ensina a pegar.
3. A conta do Gemini costuma ser pré-paga: se o crédito zerar, imagem, vídeo e
   voz param de uma vez.

## Escolher o anúncio

O vídeo se apoia em um anúncio do Mercado Livre que tem perguntas e opiniões de
compradores. O MLB é o código do anúncio, tipo `MLB` seguido de números. Pergunte
de quem é o anúncio:

- **De um concorrente** (o caso comum): o Mercado Livre não deixa ler anúncio de
  outro vendedor pela API (dá erro 403). Então rode primeiro o
  `/espionar-concorrente` do produto, que lê o anúncio pelo navegador (o Chrome
  dedicado) e grava o arquivo `_raw-concorrentes-<produto>.json`. Depois rode o
  `/video-produto` com `--de-espionagem=<esse arquivo>`, o `--mlb` do concorrente
  escolhido dentro dele e `--slug=<nome do seu produto, sem marca>` (o título do
  concorrente traz a marca dele). As perguntas só vêm dos anúncios que mais
  vendem, então escolha um deles. As fotos desse anúncio são do concorrente e
  não entram no vídeo: separe uma foto do fornecedor ou do seu produto.
- **Seu**: vai direto, sem a espionagem, porque a API lê os anúncios da sua conta.

As dúvidas que mais se repetem viram as cenas. "Borra?" vira a mão passando por
cima do desenho. "Cabe na mochila?" vira o produto entrando na mochila.

## Fase 1: coleta e roteiro (grátis)

```bash
node .claude/skills/video-produto/scripts/video-produto.mjs --mlb=<MLB> --fase=1
# anúncio de concorrente, a partir do que a /espionar-concorrente gravou:
node .claude/skills/video-produto/scripts/video-produto.mjs --mlb=<MLB do concorrente> --fase=1 --de-espionagem=<caminho do _raw-concorrentes-...json> --slug=<nome-do-seu-produto>
```

Ela puxa título, se é kit, as dúvidas mais repetidas, queixas, elogios e fotos, e
guarda tudo em `producao/<slug>/coleta.json`. Daí você escreve o roteiro em
`producao/<slug>/roteiro.json` (modelo pronto em `referencias/roteiro-exemplo.json`)
e roda a fase 1 de novo: ela confere o roteiro e escreve o `roteiro.md` pra
pessoa ler.

### O que vai no roteiro

- `produto`: descrição genérica, sem marca. Esse texto vai inteiro pro Veo, que
  barra marca de terceiro.
- `voz`: nome de uma voz do Gemini, escolhida por esta lista (lista e jeito de
  cada voz conferidos em 2026-10-04 em
  https://ai.google.dev/gemini-api/docs/speech-generation): Zephyr (clara),
  Puck (animada), Charon (informativa), Kore (firme), Fenrir (empolgada), Leda
  (jovem), Orus (firme), Aoede (leve), Callirrhoe (tranquila), Autonoe (clara),
  Enceladus (com sopro), Iapetus (limpa), Umbriel (tranquila), Algieba (suave),
  Despina (suave), Erinome (limpa), Algenib (rouca), Rasalgethi (informativa),
  Laomedeia (animada), Achernar (macia), Alnilam (firme), Schedar (equilibrada),
  Gacrux (madura), Pulcherrima (direta), Achird (amigável), Zubenelgenubi
  (descontraída), Vindemiatrix (gentil), Sadachbia (viva), Sadaltager
  (entendida) e Sulafat (calorosa). Combine com o produto: casa e cuidado pedem
  voz calorosa ou amigável, ferramenta e eletrônico pedem voz firme ou
  informativa, presente e moda pedem voz animada. A voz muda a duração da fala.
- `foto`: caminho da imagem que vai pro Veo, a partir da pasta do projeto.
  Obrigatório quando a coleta veio de um concorrente (`--de-espionagem`): foto do
  fornecedor ou do seu produto, sem logo e sem texto. Fora desse caso, sem
  `foto` o script usa a primeira foto do anúncio.
- `vozUnica`: com `true`, a narração cobre o vídeo todo e a pessoa em cena fica
  de boca fechada (senão a boca dela fica fora de sincronia com a voz).
- `musica.estilo`: `calma`, `animada`, `moderna` ou `elegante`. Cada um diz pra
  que produto serve (a lista completa aparece no erro se você errar). Escolher o
  estilo é decisão de produto: não existe padrão.
- `advertencias`: a legenda legal da categoria, literal do rótulo. Lista vazia
  (`[]`) quando a categoria não tem. Veja `referencias/advertencias-categoria.md`.
- `marcasProprias` e `marcasDeTerceiro`: listas de marcas que a fala não pode
  citar (as da sua loja e as de concorrentes e produtos parecidos). `[]` vale.
- `ehKit` e `itensDoKit`: se é kit, liste todos os itens (a coleta nem sempre acha, e a fase 1 avisa quando falta). O ML manda mostrar
  todos, e sem a lista o gate não tem o que conferir.
- `ator`: quem aparece (`quem`, `idade` em número, sempre 18 ou mais, `cenario`),
  e opcionalmente `genero` e `sotaque`.
- `blocos`: de 4 a 7, com `etapa` (as quatro etapas do AIDA, na ordem), `tipo`
  (`pessoa` ou `produto`), `cena` e `fala`.

### Como escrever a fala

- De 30 a 38 sílabas por bloco (cabem nos 8 segundos). O roteiro.md mostra a
  contagem. O que manda na duração é a pausa: vírgula antes de tirar palavra.
- Sem preço, desconto, parcelamento, frete, garantia, prazo ou número que mude
  com o tempo. O vídeo é permanente e ainda pode aparecer em outros anúncios.
- A chamada pra ação é sem oferta: "olha a ficha completa na descrição", "salva
  nos favoritos".
- Zero colchete, tipo `[suspira]`. A voz às vezes lê o colchete em voz alta.
- Pessoa adulta. Criança não aparece nem é citada.
- Um vício de fala escrito no texto ("ó", "tipo", "viu") humaniza.
- Na cena do bloco `pessoa`, deixe de fora objeto que costuma ter rótulo (pote,
  caixa, lata). O Veo desenha texto inventado neles.

Todas as regras do ML estão em `referencias/regras-clips-ml.md`. O gate de
conteúdo roda sozinho e reprova o que fura essas regras: reprovou, conserte o
roteiro e mantenha o gate como está.

### Gate 1: o texto e o dinheiro

Mostre o `roteiro.md` pra pessoa e diga quanto vai custar, em dólar e em real.
O número sai de um comando: o `--dry-run` da fase 2 recebendo os
preços do dia imprime a `estimativa_usd` completa, com a mesma conta da fase 2
real. Ele funciona antes do carimbo e roda sem gerar nem chamar nada pago:

```bash
node .claude/skills/video-produto/scripts/video-produto.mjs --mlb=<MLB> --fase=2 --dry-run \
  --preco-usd=<US$ por segundo do Veo> --preco-musica-usd=<US$ por música>
```

Os preços vêm da página https://ai.google.dev/gemini-api/docs/pricing (preço
muda, confira no dia). O dry-run imprime, junto da estimativa, os modelos que a
rodada vai usar (Veo, voz, transcrição e música): cada um tem a sua linha na
tabela de preços, e é o preço dessa linha que você passa. A cotação do dólar do dia você confere na web e mostra o total em dólar e em real. Exemplo datado de como a conta
fica: em 2026-10-04, 4 blocos custavam cerca de US$ 1,70 e 7 blocos cerca de
US$ 2,95, somando clipes e música.

Mostre também, sempre, a foto que vai pro Veo: a do campo `foto` do roteiro (ou
a do `--foto=<imagem>`), e, sem nenhuma das duas, a primeira foto do anúncio, que
está em `coleta.json`. É ela que alimenta o Veo. Na coleta de concorrente a foto
é a do campo `foto`, do fornecedor ou do seu produto: foto de terceiro fere a
regra do ML. O carimbo guarda essa foto, e trocar a imagem depois do sim derruba
a aprovação.

Só depois do sim da pessoa, carimbe:

```bash
node .claude/skills/video-produto/scripts/video-produto.mjs --mlb=<MLB> --fase=1 --aprovar
```

Nunca carimbe por conta própria pra destravar o script. O carimbo guarda a
impressão digital do que foi aprovado (fala, cena, ator, produto, voz, música,
advertências, marcas e foto). Mexeu em qualquer um depois do sim, o carimbo cai: mostre
de novo e peça nova aprovação.

## Fase 2: clipes, voz e música (aqui gasta)

Antes de rodar, veja o que seria feito sem gastar:

```bash
node .claude/skills/video-produto/scripts/video-produto.mjs --mlb=<MLB> --fase=2 --dry-run
```

Depois, com os preços do dia conferidos na página de preços do Gemini, e só
depois do "pode ir" da pessoa:

```bash
node .claude/skills/video-produto/scripts/video-produto.mjs --mlb=<MLB> --fase=2 \
  --preco-usd=<US$ por segundo do Veo> --preco-musica-usd=<US$ por música> \
  --preco-tts-entrada=<US$ por milhão de tokens> --preco-tts-saida=<US$ por milhão de tokens> \
  --preco-transcricao-entrada=<US$ por milhão de tokens> --preco-transcricao-saida=<US$ por milhão de tokens> \
  --autorizado
```

Sem `--autorizado` o script para e mostra a estimativa, sempre que qualquer
chamada paga for rodar (clipe, voz ou música). Passando do teto
`limite_gasto_usd` (configurado em `_contexto/mercado-livre.md`, padrão US$ 4),
ele também para. Sem esse arquivo (projeto novo, sem a `/mercado-livre` rodada), o script avisa que usa o padrão de US$ 4 e que a configuração vem da `/mercado-livre`. A estimativa soma os clipes que faltam, a música se faltar e uma
folga de US$ 0,01 por bloco com algo faltando (a voz custa frações de centavo).

O que ele faz sozinho:

1. baixa a foto principal do anúncio (ou usa `--foto=<imagem>`) e ajusta pra
   vertical, completando com branco. Por isso a foto de referência tem que ter
   fundo claro. Na coleta de concorrente, `--foto` é obrigatório e tem que ser a
   mesma imagem do campo `foto` aprovado no gate 1;
2. gera um clipe por bloco;
3. mantém a mesma pessoa: o último quadro do primeiro bloco com pessoa vira a
   imagem de partida dos blocos de pessoa seguintes;
4. gera a narração e transcreve de volta. Se a voz leu algo além da fala (a
   direção, por exemplo) ou deixou fala de fora, apaga aquela narração e para
   ali, sem gerar mais nada: é só rodar a fase 2 de novo;
5. gera a música.

Cada cobrança vira uma linha em `dados/custos.jsonl`.

**O que já está pago não se refaz.** Se o `bloco-N.mp4` existe, ele não é
gerado de novo. Se a narração de um bloco falhou depois do clipe pago, rodar a
fase 2 de novo gera só a narração. Nunca apague um clipe pra "destravar" outra
coisa: isso custa o clipe de novo.

Se a rodada anterior morreu no meio, o script avisa no começo qual operação do
Veo ficou aberta. Ela pode ter sido cobrada: confira no painel do Google antes
de refazer.

Se o Veo devolver um clipe sem vídeo (bloqueio de conteúdo), a operação é
cobrada mesmo assim. O script mostra o que conferir. A imagem de entrada precisa
ser do produto, sem texto de venda, sem logo e sem marca de terceiro, com fundo
claro. Prefira as fotos cruas do fornecedor às imagens da `/gerar-imagens`, que
levam texto de venda. O teto é de 3 tentativas por vídeo, e quem conta é você
(Claude): o script não guarda esse número. Anote cada tentativa e pare na terceira.

## Fase 3: montar e conferir

```bash
node .claude/skills/video-produto/scripts/video-produto.mjs --mlb=<MLB> --fase=3 \
  --preco-transcricao-entrada=<US$ por milhão de tokens> --preco-transcricao-saida=<US$ por milhão de tokens> \
  --autorizado
```

Ela emenda os clipes, queima a legenda (que sai do roteiro),
queima as advertências no topo, confere o tamanho, a proporção, o áudio e se não
tem imagem parada (gate técnico), e depois transcreve o vídeo pronto e compara
bloco a bloco com o roteiro (gate de voz). A transcrição é a única parte paga e
custa centavos.

A montagem sai em `producao/<slug>/_tmp/<slug>.mp4`. Só depois de passar no gate
técnico e no gate de voz ela vai pra `producao/<slug>/final/<slug>.mp4`: o que
está em `final/` está liberado pra publicar.

Com `--dry-run`, ela monta o vídeo e pula o gate de voz, saindo com código 3: o
arquivo fica em `_tmp/` e ainda não está liberado pra publicar.

### Gate 2: o vídeo

Mostre `producao/<slug>/final/<slug>.mp4` pra pessoa. Ela aprova ou pede
ajuste. Ajuste de bloco: apague só aquele `bloco-N.mp4` (e a narração dele) e
rode a fase 2 de novo. Se o bloco refeito é o primeiro com pessoa, apague também
`ultimo-frame-b1.jpg`: é a imagem que mantém a mesma pessoa nos blocos seguintes,
e ficaria velha.

## Publicar

Publicar e divulgar é com a skill de mídia social. O Clips do Mercado Livre sobe
à mão, pelo painel (não existe API de Clips):

1. Abra a Central de Vendedores, menu **Marketing**, depois **Clips**, e clique
   em **Enviar um vídeo** (ou vá direto em
   https://vendedores.mercadolivre.com.br/video/creator/upload).
2. Escolha o arquivo `final/<slug>.mp4` (máximo 280 MB).
3. Cole o link do anúncio e envie.

O estado aparece no painel de Clips. Se for recusado, os motivos aparecem em
texto. A moderação entrega um problema por vez: antes de reenviar, confira a
lista inteira em `referencias/regras-clips-ml.md`. Teto de 3 tentativas, contadas
por você (Claude); o script não guarda esse número.

## Códigos de saída

| Código | Quer dizer | O que fazer |
|---|---|---|
| 0 | deu certo | seguir pro próximo passo |
| 1 | reprovou ou falhou (roteiro reprovado nos gates, clipe faltando, montagem ou gate de voz falhou) | ler o recado, consertar e rodar de novo. Clipes pagos ficam salvos |
| 2 | uso errado (flag que não existe, preço faltando ou inválido) | corrigir o comando. Nada foi gasto |
| 3 | parou antes de gastar (roteiro sem carimbo de aprovação ou alterado depois dele, sem `--autorizado`, acima do teto) ou, na fase 3 com `--dry-run`, montou sem o gate de voz | mostrar o roteiro e carimbar com `--aprovar` depois do sim, ou pedir o "pode ir" e rodar com `--autorizado`, ou subir o teto, ou rodar a fase 3 sem `--dry-run` |

Flag que o script não conhece aborta com código 2 e o recado diz quais existem.

## Regras que não mudam

- Nunca gastar sem o sim da pessoa, naquele momento, e sem avisar o custo antes.
- Preço se confere no dia na página de preços do Gemini. Nunca de memória.
- Zero marca no vídeo: nem a da loja, nem de terceiro.
- Legenda é permitida, mas fora da zona segura do Clips (longe dos botões de
  compartilhar e favoritar).
- Modelo de IA nunca é fixo no código: o script descobre pelos modelos que a sua
  chave enxerga.
- Erro de fase paga sai com recado do que fazer, em linguagem simples.
