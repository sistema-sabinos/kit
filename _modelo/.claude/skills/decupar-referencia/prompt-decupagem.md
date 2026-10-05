# Prompt de decupagem

> So na rota com Gemini, depois do "pode ir". Passar inteiro no `--pergunta` do `ver-video.mjs` da
> `/assistir-video`. Nao resumir: cada bloco pede uma coisa que a ficha precisa.

```
Voce e um diretor de edicao analisando este video para engenharia reversa. Nao resuma o conteudo.
Descreva as DECISOES DE EDICAO, com tempo, olhando a tela quadro a quadro.

Responda exatamente nestes blocos:

1. FICHA TECNICA
Duracao exata. Proporcao. Quantidade aproximada de cortes. Se aparece pessoa falando na camera, se e
narracao por cima, ou se e mudo com texto.

2. OS PRIMEIROS 3 SEGUNDOS, quadro a quadro
Descreva o PRIMEIRO QUADRO com precisao: o que esta enquadrado, qual o plano, o que a pessoa esta
fazendo, o que ja esta escrito na tela nesse instante. Depois segundo a segundo ate os 3s.
Diga qual palavra ou imagem aparece primeiro e em que milissegundo aproximado, e se o audio ja entra
no primeiro quadro.

3. TEXTO NA TELA, do comeco ao fim
Transcreva TODO texto que aparece, com tempo de entrada e de saida. Para cada um: posicao (terco
superior, meio, inferior), tamanho relativo, cor, contorno ou fundo, animacao de entrada, e quais
palavras estao destacadas.

4. MAPA DE CORTES
Liste os cortes com tempo e o que motivou cada um: mudanca de assunto, de acao, batida da musica,
palavra especifica, ou nada aparente. Diga se o ritmo e constante ou se acelera e desacelera.

5. MOVIMENTO
Zoom, aproximacao, deslize, tremida, camera lenta, aceleracao ou congelamento: tempo, intensidade
(sutil, medio, forte) e o que enfatiza. Diga se ha trecho parado e por quanto tempo.

6. SOM
Musica (energia, virada, se some, se troca), cada efeito sonoro com tempo e funcao, silencio
deliberado com tempo. Diga se o video funciona sem som.

7. ESTRUTURA NARRATIVA
Blocos com tempo e funcao (gancho, contexto, tensao, prova, virada, conclusao, chamada). Diga se ha
pergunta ou promessa no comeco e onde ela e paga.

8. MECANISMOS DE RETENCAO
Cada momento, com tempo, em que o video faz algo para impedir a saida. Depois o trecho MAIS FRACO,
onde alguem desistiria, e por que.

9. POR QUE ALGUEM COMPARTILHARIA
O motivo concreto de mandar para outra pessoa, e o que isso diz sobre quem compartilhou. Se nao
houver, diga que nao ha.

10. CHAMADA PARA ACAO
Qual e, onde aparece e como e feita.

11. O QUE ESTE VIDEO EXIGIU DE GRAVACAO
Quantos angulos, quantas cenas, se precisou de segunda pessoa filmando ou de material de arquivo.
Estime se da para produzir sozinho, com celular apoiado.

12. AFIRMACOES VERIFICAVEIS
Toda afirmacao de fato, numero, alegacao de saude ou promessa de resultado, com tempo, para conferir.

Seja especifico. Nada de "boa edicao" ou "ritmo dinamico". Se nao conseguir ver algo com certeza,
diga que nao conseguiu ver, em vez de supor.
```

## Variante curta (so a abertura)

Usar os blocos 2, 3 e 8 acima, mais esta linha:

```
Foque so nos primeiros 5 segundos. Descreva o primeiro quadro com precisao maxima e explique qual
mecanismo esse comeco usa para impedir que a pessoa deslize a tela.
```
