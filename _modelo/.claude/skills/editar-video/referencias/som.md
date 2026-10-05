# Som: efeitos e música

O som tem duas partes. Os **efeitos** (um "pop" quando um cartão entra, um
"whoosh" na troca de assunto) e a **música de fundo**. Os dois saem da biblioteca
do próprio aluno, em `<_video>/midia/biblioteca/`. Nada de som novo vem da internet
sem passar pelo aluno: música de fora tem licença própria, e licença errada
derruba vídeo.

## A biblioteca é do aluno

O SabinOS não traz música nem efeito: a licença dos sites grátis deixa usar o som
dentro do vídeo, mas não deixa repassar o arquivo. Então cada aluno baixa os seus.

- **Pasta vazia ou sem a pasta:** o vídeo sai sem efeito e sem música, e funciona.
  Avise uma vez: "Se quiser música e efeito, baixe grátis no Mixkit (mixkit.co) ou
  no Pixabay (pixabay.com), na parte de música e de efeitos sonoros, e salve aqui:
  efeitos em `<_video>/midia/biblioteca/sfx/`, músicas em
  `<_video>/midia/biblioteca/musica/`. Antes, leia a licença na página do site."
- **Arquivo novo na pasta:** acrescente uma linha no `registro.md` da pasta (crie se
  não existir), com as colunas abaixo, perguntando ao aluno de onde veio. Sem
  registro, ninguém sabe depois se o som pode ir num post.
  - `sfx/registro.md`: Arquivo, Nome, Duração, Uso, Fonte.
  - `musica/registro.md`: Data, Faixa, Artista, Fonte (com o nome do arquivo), Licença.

## Escolher efeito sonoro

1. Abra `biblioteca/sfx/registro.md`, dentro da pasta de mídia do vídeo
   (`<_video>/midia/`). É uma tabela com as colunas Arquivo, Nome, Duração e **Uso**.
2. Escolha pela coluna **Uso**, que diz para que o som serve ("corte seco",
   "número ou dado", "revelação"). O nome do arquivo ajuda, mas o Uso manda.
3. Cite o arquivo no vídeo como `biblioteca/sfx/<nome>.wav`. O `render.mjs` copia
   para a peça só o que está citado, então nada de citar um som que não vai usar.

Combinações que funcionam (confira no registro, que é a fonte):

| Momento | Tipo de som |
|---|---|
| Cartão, número ou palavra-chave entrando | som curto de interface (pop, click, ding) |
| Troca de assunto ou entrada de tela cheia | whoosh |
| Título grande entrando | impacto grave |
| Riscar ou cortar algo | glitch |
| Revelação, antes do número que importa | riser, depois um hit |

Regras de dosagem:

- **Todo gráfico que entra ganha um efeito**, no segundo em que aparece. No estilo
  camadas, 5 a 6 efeitos a cada 10 segundos é o mínimo, e mais é permitido.
- **No estilo cenário próprio**, uma batida a cada 1,5 a 3 segundos, de 3 a 5
  efeitos "grandes" a cada 30 segundos, no máximo 2 impactos (hits) por vídeo.
- **O "ding" no máximo 2 vezes por vídeo.** Repetido, perde o efeito.
- **Cada efeito tem função.** Whoosh em todo movimento vira barulho.
- **Ataque no segundo certo.** O pico do som tem que cair no momento da
  imagem. O `preparar-props.py` faz essa conta no estilo cenário próprio; no
  estilo camadas, o campo `seg` do efeito é o segundo em que o gráfico aparece.

No estilo cenário próprio, o volume do efeito pode ser medido contra a voz: no
`edicao.json`, `dbVoz` diz quantos dB abaixo da voz o efeito toca (comece em -12
para som curto e ajuste de ouvido) e `importante: true` garante que o ataque fique
pelo menos 4,5 dB acima da voz. Use `importante` só em 3 ou 4 efeitos por vídeo.
Os campos estão em `referencias/videov2.md`.

## Escolher música

1. Abra `biblioteca/musica/registro.md`. As colunas são Data, Faixa, Artista,
   Fonte (com o nome do arquivo) e Licença.
2. Escolha **3 a 5 candidatas** pelo clima do assunto: calmo para explicação,
   animado para dica rápida, tecnologia para ferramenta, notícia para novidade.
   Não repita a faixa do vídeo anterior por padrão.
3. Gere uma amostra de 12 segundos de cada uma, para o aluno ouvir sem abrir
   arquivo grande. Crie antes a pasta `producao/<slug>/amostras/`, porque o
   ffmpeg não cria pasta:

   ```
   ffmpeg -y -ss 20 -t 12 -i <_video>/midia/biblioteca/musica/<pasta>/<arquivo>.mp3 producao/<slug>/amostras/<n>.mp3
   ```

4. Pergunte: "Qual número você escolhe?". A escolha é do aluno, sempre.
   **Sem escolha, a prévia sai sem música.** Nunca vai música provisória.
5. Confira a licença da faixa escolhida. Algumas exigem crédito na descrição do
   post (a coluna Licença diz). Se exigir, entregue o texto do crédito junto com o
   vídeo.

## Volume da música

A música fica **bem audível, cerca de 10 dB abaixo da voz**. O `render.mjs` já usa
`--musica-db -3 --duck-ratio 2` por padrão, e é isso que deve ficar. "Ducking" é a
música baixar sozinha quando a voz fala e voltar nas pausas. O número `2` é a
força desse abaixamento.

Não baixe esses valores por conta própria. Com `--musica-db -15` e `--duck-ratio 6`
a música fica 17 a 23 dB abaixo da voz e o aluno não escuta. Só mude se o aluno
pedir ("tá alta", "quase não ouço"), e diga o que mudou.

O mix final mira -14 LUFS (volume médio que as redes usam) e pico de -1 dBTP. O
`conferir-final.mjs` mede os dois depois do render e imprime o conserto se falhar.
