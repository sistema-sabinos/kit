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
   página com dado de pessoa. Página que não abre no navegador automático (o
   Mercado Livre devolve "Hubo un error") fica sem print: peça ao aluno o print
   da tela dele, que entra como material próprio.
3. **Imagem feita pela IA**, pela `/gerar-imagens` no degrau `codex`, só com o ok
   do aluno, e só em ilustração (um produto genérico, uma ideia). Nunca em fato
   de notícia nem em pessoa real: imagem inventada ali passa ideia errada do que
   aconteceu. Imagem paga por imagem não entra.

Sem nenhuma das três, a frase fica no rosto, com palavra-chave ou cartão.

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
