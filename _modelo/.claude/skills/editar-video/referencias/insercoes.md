# Inserções: a imagem por cima da fala

Leia este arquivo só no passo 4A do `/editar-video`, antes de escrever o
`edicao.json`. Ele diz onde entra imagem por cima da pessoa (print, foto,
clipe), de onde ela vem e como vira `segmentos`. Inserção é a prova do que a
pessoa diz: quem assiste vê a página, o número, o produto.

## Onde entra

Leia o roteiro aprovado bloco a bloco. Entra inserção na frase que:

- afirma um **fato com fonte** ("o blog do Mercado Pago diz que..."): o print da
  página, com a frase marcada;
- dá um **número** que alguém pode duvidar (preço, prazo, quanto vendeu): a tela
  onde o número aparece;
- fala de um **produto** ou de uma **tela** ("ele abriu a página de tendências"):
  a foto do produto, a gravação da tela;
- conta o que **aconteceu na tela** ("pedi pro Claude..."): a gravação da sessão.

## Onde não entra

- No **gancho** (a primeira frase): o rosto segura quem chegou.
- Na **punchline** e na frase seca de efeito ("Geralmente é."): o rosto é a
  piada.
- Na **pergunta pro público** e na **chamada pra seguir**: a pessoa fala com
  quem assiste, olho no olho.
- Em cima de frase que pede a reação da pessoa (espanto, deboche).

## Quanto

Entre 18% e 38% do vídeo coberto por inserção. Menos que isso, o vídeo vira só
rosto falando; mais, a pessoa some. Uma inserção dura a frase inteira dela (do
começo da primeira palavra ao fim da última), nunca menos de 1,5 s. Sem
material pra chegar nos 18%, fica abaixo: nunca invente inserção pra bater a
conta.

## De onde vem, nesta ordem

1. **Material do próprio aluno**: gravação de tela, foto do produto, clipe que ele
   mandou na pasta `bruto/`. Pergunte no passo 1 se ele tem.
2. **Print de página real**, com a frase dita marcada:

```
node .claude/skills/editar-video/scripts/print-pagina.mjs <endereço da página> producao/<slug>/public/print-<n>.png --marcar "<a frase como está escrita na página>"
```

   Sai em pé, 1080 por 1920, a frase em marca-texto no meio da tela. Copie a frase
   da página exatamente (sem resumir): frase que não está lá derruba o comando.
   Só página pública e oficial (a do próprio site, do órgão, da loja). Nunca
   página com dado de pessoa.
   O comando tenta em degraus e sobe quando o site barra o navegador automático
   (erro 400 ou mais, conexão cortada, página que não termina de carregar ou página que chega em
   branco, sem texto na tela): primeiro sem janela;
   depois pelo Chrome dedicado do projeto, se ele já está aberto com a sessão do
   site e o `.env` tem `ALUNO_NOME` ou `ALUNO_EMAIL`, com o cabeçalho borrado e
   conferindo que o nome e o email do aluno não aparecem na tela; por último com
   janela. No Mercado Livre o degrau do Chrome dedicado fica de fora. A última
   linha diz qual degrau gravou. Saída 2 quer dizer que o site barrou todos: peça
   ao aluno o print da tela dele, que entra como material próprio.
   Olhe o PNG antes de usar: página de bloqueio que responde como normal passa,
   e nome escrito dentro de imagem o comando não enxerga.
3. **Imagem feita pela IA**, pela `/gerar-imagens` no degrau `codex`, só com o ok
   do aluno, e só em ilustração (um produto genérico, uma ideia). Nunca em fato
   de notícia nem em pessoa real: imagem inventada ali passa ideia errada do que
   aconteceu. Imagem paga por imagem não entra.

Sem nenhuma das três, a frase fica no rosto, com palavra-chave ou cartão.

## Clipe com o som original

Quando a prova é a fala de outra pessoa (o anúncio de um lançamento, a frase de
uma entrevista), o clipe entra com o som dele no meio da fala: a fala para, o
clipe toca e a fala volta. Vira um item de `buracos` (`referencias/videov2.md`).
Só o trecho que a frase precisa, com o aluno comentando antes ou depois.

Antes de montar, confira na internet a regra de hoje das redes onde o vídeo vai
sair sobre conteúdo reaproveitado (as redes cortam alcance e monetização de vídeo
que só repete o dos outros) e conte ao aluno o que achou, com o link. Depois
pergunte, uma pergunta por vez, e anote as respostas em `trab/insercoes.md`:

1. O clipe é seu, você tem licença ou o autor autorizou por escrito?
2. Se não tem: o trecho é curto e está ali pra você comentar, criticar ou
   explicar, sem que o post exista só por causa dele?
3. Você fala em volta dele com opinião ou informação nova? Legenda, marca d'água
   e crédito sozinhos ficam de fora dessa conta.
4. Quem assistir o seu vídeo ainda tem motivo pra ver o original? E o crédito
   vai na tela?

A lei de direito autoral protege citação curta, com crítica e com o crédito. Com
qualquer resposta "não" ou "não sei", o clipe fica de fora e a sugestão é gravar a
cena, usar material próprio ou pedir a autorização. Em dúvida, quem decide é o
aluno, de preferência com um advogado. A resposta vai no campo `direito` do
buraco.

## O plano de inserções

Antes do `edicao.json`, grave `producao/<slug>/trab/insercoes.md`:

```
| bloco | fala | inserção | fonte |
|---|---|---|---|
| 5 | Pedi pro Claude ler as letrinhas | sessão do Claude rodando | gravação do aluno |
| 7 | Dinheiro parado na conta não tem | blog do MP, "não possui a cobertura direta do FGC" | print-pagina |
| 14 | Geralmente é. | nenhuma (punchline) | |
```

Uma linha por bloco, com "nenhuma" e o motivo quando não entra. Mostre ao aluno
junto com o resto do plano e espere o ok. Cada linha com inserção vira um item
de `segmentos` (`referencias/videov2.md`), com `deSeg` e `ateSeg` tirados da fala
alinhada, `cheia: true` e o `tam` do arquivo. Print e foto entram com `zoom` lento
(`de 1` a `1.08`) pra não ficar parado.
