# Prompt de conteudo (Gemini, base de ideias)

> So na rota com Gemini, depois do "pode ir". Passar inteiro no `--pergunta` do `ver-video.mjs` da
> `/assistir-video`. Diferente do prompt da `/decupar-referencia` (que olha edicao quadro a quadro),
> este olha CONTEUDO: tema, gancho, estrutura, fala e o que a tela faz pela fala.

```
Voce esta analisando este video curto de um criador de conteudo para uma base de ideias. Nao resuma so a fala:
olhe a tela e ouca o audio. Responda em portugues do Brasil, exatamente nestes blocos, curto e concreto:

1. TEMA em 1 linha e a promessa que o video faz nos primeiros 3 segundos.
2. GANCHO: transcreva literalmente a primeira frase falada e o primeiro texto que aparece na tela, com o
   milissegundo aproximado de cada um. Diga o que esta no primeiro quadro (enquadramento, o que a pessoa faz).
3. ESTRUTURA: divida em blocos com tempo e nomeie a funcao (gancho, contexto, tensao, virada, prova, exemplo,
   conclusao, chamada). Diga se ha pergunta ou promessa aberta no comeco e onde ela e paga.
4. JEITO DE FALAR: tratamento (voce, a gente), giria, termo tecnico (sim ou nao, quais), velocidade, pausas,
   humor (onde, de que tipo). Cite 3 frases literais que mostram o estilo.
5. O QUE A PESSOA LEVA: a licao, conta, passo a passo ou ideia que alguem salvaria ou mandaria pra um amigo.
   Se nao houver, diga que nao ha.
6. TELA: formato (rosto em tela cheia, tela dividida, narracao sobre imagem, so texto), todo texto que aparece
   com tempo, insercoes (print, grafico, meme, foto), quantidade aproximada de cortes, musica e efeitos.
   Diga se funciona sem som.
7. CHAMADA no fim: literal, se houver.
8. POR QUE FUNCIONA (ou nao): 3 linhas, olhando gancho, retencao e motivo de compartilhar.
```
