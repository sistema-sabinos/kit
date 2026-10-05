# Zona segura do vídeo vertical

Zona segura é a parte da tela que as redes não cobrem com a própria interface
(nome do perfil, botões de curtir e comentar, legenda do post, barra de
progresso). Texto fora dessa zona fica escondido atrás desses elementos. Este
documento é a régua que o sistema usa, e o script `zona-segura.py` confere por
medição.

Medições conferidas em 2026-09-22. Regra de plataforma muda: reconfira em
dezembro de 2026, nas páginas oficiais listadas no fim.

## O que é oficial e o que é medição de terceiros

Só a Meta publica número, e é de anúncio. Para post comum não existe número oficial. O TikTok e o
YouTube não publicam nada.

| Plataforma | Fonte oficial | O que diz | Visto em |
|---|---|---|---|
| Instagram Reels (anúncio) | Meta Ads Guide, vídeo de Reels | 14 % do topo, 35 % da base e 6 % de cada lado livres. Em 1080x1920: 269 px no topo, 672 na base, 65 nos lados | 22/09/2026 |
| TikTok (anúncio) | Especificações de vídeo do TikTok Ads | "Depende da dimensão, do tamanho da legenda e dos formatos extras". Nenhum número publicado | 22/09/2026 |
| YouTube Shorts | Ajuda oficial do YouTube | Nada sobre zona segura. Só duração e 1080p | 22/09/2026 |

Para post comum existe só medição de terceiros, e elas divergem entre si:

| Rede | Topo | Base | Esquerda | Direita |
|---|---|---|---|---|
| TikTok | 108 a 130 | 320 a 484 | 44 a 60 | 120 a 140 |
| Instagram Reels | 210 a 250 | 310 a 450 | 0 a 60 | 84 a 120 |
| YouTube Shorts | 120 a 180 | 300 a 390 | 48 a 60 | 96 a 120 |

Os números são em pixels, num vídeo de 1080 de largura por 1920 de altura. A
base é a que mais pesa: é onde ficam a legenda do post e os botões.

## A régua do sistema

São três níveis, porque errar para um lado custa diferente de errar para o
outro. O script aceita `--nivel`.

| Nível | Topo | Base | Esquerda | Direita | Quando usar |
|---|---|---|---|---|---|
| duro (padrão) | 250 | 484 | 60 | 140 | O pior caso de todas as medições. É o que vale sempre |
| consenso | 220 | 450 | 60 | 120 | Média das fontes. Use só quando a peça não couber no duro |
| anuncio-meta | 269 | 672 | 65 | 65 | Se o vídeo for virar anúncio no Instagram. É o único número oficial |

No nível duro, sobre 1080x1920:

- Texto legível começa em y = 250 ou mais abaixo.
- Texto legível termina em y = 1436 ou mais acima.
- Faixa horizontal: de x = 60 a x = 940.
- Área segura de verdade: 880 x 1186 px.

## O que isso muda na montagem

- **A legenda mora em y = 1240** (o `topoLegenda` padrão do sistema). Com fonte
  grande e duas linhas, ela termina perto de 1430 e ainda cabe. Mais embaixo que
  isso ela fica atrás da interface das três redes.
- **Regra de bolso:** todo texto que precisa ser lido fica nos dois terços de
  cima da tela. Dois terços de 1920 são 1280.
- **Cartão em tela cheia** (um print de página que ocupa quase toda a largura)
  passa por baixo da coluna de botões da direita. Se o número dentro dele
  importa, encolha para 940 px de largura.
- **Palavra-chave grande** respeita a margem lateral: largura estimada igual a
  0,62 vezes o tamanho da fonte vezes o número de letras, com alvo abaixo de 1000
  px dos 1080.

## Como conferir

```
node .claude/skills/editar-video/scripts/py.mjs zona-segura.py producao/<slug>/final/<slug>.mp4
node .claude/skills/editar-video/scripts/py.mjs zona-segura.py producao/<slug>/final/<slug>.mp4 --nivel consenso --salvar-mapa
```

Sai `PASSOU` (código 0) ou `REPROVOU` (código 1), listando quanto invade em cada
borda e em que segundo. Com `--salvar-mapa` ele grava uma imagem do pior quadro
com as faixas proibidas pintadas. O `conferir-final.mjs` já roda esse script junto
com os outros dois.

**O que o script detecta:** pixel quase branco com contorno preto colado (o
contorno da legenda do sistema), em linha que liga e desliga pelo menos 4 vezes,
que é a marca de uma fileira de letras. Esse segundo teste existe porque luz
branca de anel no cenário também parece "branco com preto" e dava alarme falso
nas laterais.

**O que ele não detecta:** texto escuro sobre fundo claro, elemento colorido sem
branco e gráfico sem contorno. Ausência de alarme prova pouco: olhe também um quadro.

**O que ele não separa:** texto seu de texto que já vinha dentro de um clipe de
terceiro (uma marca d'água, por exemplo). Regra de leitura: o alarme da BASE é
o que trava, porque é onde a legenda mora. Alarme de lateral, em vídeo com clipe
de terceiro, se confere olhando o quadro antes de mexer em qualquer coisa.

## Quando a legenda passa da zona

O alarme da legenda do sistema costuma ser de poucos pixels (por exemplo,
`DIR texto vai até x=948, limite 940`) numa página com uma palavra comprida. A
fonte e o tamanho da legenda são fixos, então o conserto é no texto: abra o
`voz.alinhado.json`, ache a palavra da página que o gate citou (o segundo vem na
mensagem) e encurte, por exemplo `gramas.` vira `g.`. Só a escrita muda; o tempo
da palavra continua o mesmo. Depois renderize e rode o `conferir-final.mjs` de novo.
O próprio gate repete essa dica quando reprova.

## Fontes

- Meta Ads Guide, Instagram Reels: https://www.facebook.com/business/ads-guide/update/video/instagram-reels
- TikTok, especificações de vídeo de anúncio: https://ads.tiktok.com/help/article/video-ads-specifications
- YouTube Shorts, ajuda oficial: https://support.google.com/youtube/answer/10059070
- Medições de terceiros (EzUGC, Ignite Social Media, AdaptlyPost, Screensnap, Hopper HQ, PostPlanify), de março a setembro de 2026.
