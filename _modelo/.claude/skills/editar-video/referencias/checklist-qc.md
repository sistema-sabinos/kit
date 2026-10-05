# Checklist de qualidade, antes de mandar e antes de publicar

QC quer dizer "controle de qualidade". Roda em duas passadas: uma no roteiro,
antes de gravar e editar, e outra no vídeo final, antes de publicar. Os itens
marcados como "por script" o sistema confere sozinho. Os outros são perguntas
que o Claude responde olhando o vídeo (quadros extraídos com o ffmpeg) e que o
aluno responde ao assistir.

---

## Promessa e regras (trava a publicação)

Só se aplica quando o vídeo fala de suplemento, saúde, emagrecimento, ganho de
massa, energia, sono, beleza, dinheiro fácil ou qualquer coisa que as plataformas
e os órgãos reguladores vigiam. Vale para a fala, a legenda, o texto na tela e
até uma placa que apareça no fundo.

Duas regras de crivo:

1. Não achar a frase proibida numa lista não libera ela.
2. Um ingrediente ou produto ser permitido não permite dizer o que ele faz.

Checagem:

- [ ] O vídeo afirma efeito de um produto? Se sim, a afirmação está na regra
      oficial do órgão e da plataforma, conferida na web, no dia?
- [ ] Tem promessa de resultado, prazo ou quantidade ("perde X quilos em Y dias")?
- [ ] Tem comparação com remédio, ou sugestão de tratar, prevenir ou curar algo?
- [ ] Tem antes e depois usado como prova de efeito de produto?
- [ ] Tem depoimento de terceiro atribuindo resultado ao produto?

Qualquer "sim" a partir do segundo item para a publicação até o texto ser
reescrito. O Claude avisa o aluno e não decide sozinho.

---

## Gancho (primeiros 3 segundos)

- [ ] O primeiro quadro já mostra a coisa mais interessante, sem preparação
      antes?
- [ ] O texto do gancho aparece junto com o primeiro quadro?
- [ ] Existe um motivo claro para um estranho continuar assistindo?
- [ ] Sem apresentação, sem logo, sem contexto e sem silêncio inútil na entrada?

## Clareza

- [ ] A mensagem principal cabe numa frase?
- [ ] Tem informação que dá para tirar sem perder nada? Se tem, tira.
- [ ] Alguém que não conhece o assunto entende?

## Ritmo

- [ ] Tem trecho lento demais? Onde exatamente?
- [ ] Tem trecho rápido demais para absorver?
- [ ] Assistindo até o fim, em que segundo dá vontade de desistir? Se existe um,
      é ali que se mexe.

## Visual

- [ ] Tem variedade de estímulo, ou é o mesmo enquadramento o tempo todo?
- [ ] Tem imagem parada por mais de 2 segundos sem motivo?
- [ ] Tem poluição visual, dois ou mais elementos disputando o olho?
- [ ] Cada efeito presente tem um motivo declarado?

## Legenda e texto na tela

- [ ] Dá para ler no tempo em que fica na tela?
- [ ] **Zona segura conferida por script** (`referencias/zona-segura.md`): o
      `conferir-final.mjs` roda e tem que sair `PASSOU`. Reprovou na base: a legenda
      está por baixo da interface das redes.
- [ ] Tem contraste suficiente contra o fundo, inclusive nos quadros mais claros?
- [ ] Uma ideia por bloco de texto?
- [ ] O destaque de palavra está sendo usado com parcimônia, ou tudo está
      destacado?

## Áudio

- [ ] A voz está clara e acima da música?
- [ ] A música compete com a informação em algum trecho?
- [ ] Cada efeito sonoro tem função, ou tem som em todo movimento?
- [ ] Tem pico de volume desconfortável?
- [ ] **Loudness (volume geral) conferido por script**: o `conferir-final.mjs`
      mede e tem que sair `PASSOU`. Se falhar, ele imprime o conserto.
- [ ] **O vídeo funciona no mudo?** A maioria assiste assim.

## História

- [ ] Existe progressão, ou é uma pilha de informação solta?
- [ ] Todo assunto aberto tem resposta no fim?
- [ ] O final entrega o que o gancho prometeu?

## Valor e compartilhamento

- [ ] O vídeo entrega pelo menos um valor (ensina, ajuda na prática, emociona,
      diverte, dá identidade)?
- [ ] Por que alguém mandaria isso para outra pessoa?
- [ ] Tem uma chamada só, ou três pedidos ao mesmo tempo?

## Técnico (antes de exportar)

- [ ] Vertical, 1080 por 1920, 30 quadros por segundo?
- [ ] Sem marca d'água de aplicativo?
- [ ] Primeiro e último quadro limpos, sem quadro preto nem sobra?
- [ ] A música e os efeitos usados estão liberados para uso comercial? Confira em
      nos `registro.md` da biblioteca e na página do site de onde veio. Música que exige
      crédito entra na descrição do post.

---

## A pergunta final

Assista uma vez inteiro fingindo ser um estranho rolando o feed às 22h, cansado,
com o polegar pronto.

Em que segundo o polegar sobe? É esse trecho que precisa de trabalho, e nenhum
outro.
