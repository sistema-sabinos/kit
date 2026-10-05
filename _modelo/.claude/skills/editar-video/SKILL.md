---
name: editar-video
description: Edita o vídeo do aluno de ponta a ponta, a partir da fala gravada no celular. Escreve o roteiro com ele, corta as pausas e os erros, limpa a voz, faz a legenda palavra por palavra, põe zoom, palavra-chave, gráficos, música e efeitos sonoros, confere o resultado por medição e entrega o vídeo vertical pronto. Funciona com cenário próprio ou com fundo verde (pano verde trocado por um cenário). Para antes de gastar e espera o "pode ir". Use quando o usuário chamar /editar-video, disser "edita meu vídeo", "legenda esse vídeo", "gravei um vídeo", "fundo verde", "corta as pausas", "tira o silêncio do vídeo", "põe legenda e música", "faz um reels da minha fala".
---

# /editar-video

Você edita um vídeo vertical (formato de Reels, TikTok e Shorts) a partir da fala
que o aluno gravou no celular. Ele só decide quatro coisas: o assunto e o
roteiro, o jeito de gravar (cenário próprio ou fundo verde), a música e o vídeo
pronto. Todo o resto é com você, e o aluno nunca mexe em código.

Nada é publicado por esta skill. O vídeo termina numa pasta do projeto.

## Como funciona, em palavras simples

- **ffmpeg** é um programa gratuito que corta, junta e mede áudio e vídeo.
- **whisper** é um "ouvido" que roda no computador do aluno, sem custo, e escreve
  o que foi falado com o segundo exato de cada palavra. É daí que sai a legenda.
- **Remotion** é o programa que monta o vídeo final a partir de uma receita:
  zoom, legenda, gráficos, tudo desenhado por código. O nome da etapa é
  "render" (gerar o vídeo final, o que leva alguns minutos).
- **Fundo verde** (chroma key) é um pano verde atrás da pessoa. O sistema apaga
  o verde e põe qualquer cenário no lugar.
- **Mix** é juntar voz, música e efeitos num volume equilibrado.

Os scripts moram em `.claude/skills/editar-video/scripts/` e em
`<_video>/motor/scripts/`. A pasta `<_video>` é a pasta `_video` ao lado do
projeto (ou a que estiver em `SABINOS_VIDEO` no `.env`). Os arquivos de cada
vídeo ficam em `producao/<slug>/`, onde `<slug>` é o nome inteiro da pasta, no
formato `AAAA-MM-DD-assunto-curto`.

Os scripts do motor rodam sempre por este comando fino, que escolhe sozinho o
programa certo do sistema:

```
node .claude/skills/editar-video/scripts/py.mjs <nome-do-script> <argumentos>
```

Todos os comandos abaixo que começam assim servem para os dois sistemas
(Windows e Mac). Nunca escreva o comando do programa direto.

## Antes de tudo

1. Rode `node .claude/skills/configurar-video/scripts/conferir.mjs`. Ele diz o que
   falta instalar. Saiu com erro, ou qualquer script desta skill saiu com código 3
   falando em `/configurar-video`: pare e diga ao aluno "Falta preparar o seu
   computador para vídeo. Rode `/configurar-video`, que instala tudo com o seu
   sim, e depois volte aqui".
2. Abra `<_video>/maquina.json` e anote dois campos: `whisper` (o modelo de
   escuta, `small` ou `medium`) e `extras3d` (se o computador aguenta o cenário em
   relevo, `true` ou `false`). O 3D só entra com `extras3d: true`. Nesta versão o
   modelo de profundidade que o relevo usa não vem instalado, então o `extras3d`
   sai `false` (o `nota3d` do arquivo explica) e o cenário fica parado.
3. Veja se há vídeos anteriores: abra o `notas.md` mais recente em `producao/` e
   aplique o que estiver marcado "entra no próximo".

## Passo 1: assunto e roteiro (o aluno aprova antes de gravar)

1. Pergunte: "Sobre o que é o vídeo, e o que a pessoa que assiste leva
   embora?". Resposta vaga ("faz aí") vira uma proposta sua, dita em voz alta.
2. Crie `producao/AAAA-MM-DD-<assunto>/` com as pastas `bruto/`, `trab/`,
   `public/` e `final/` dentro (os comandos dos próximos passos gravam nelas), e
   os arquivos `brief.md` (a ideia) e `roteiro.md` (a fala).
3. Escreva o roteiro assim:
   - **Primeiro, a mensagem em uma frase**: o que a pessoa leva embora. A
     primeira frase do vídeo promete isso e a última entrega. Vídeo com dois ou
     três destinos (piada, aula e recado) confunde.
   - **Uma frase por linha**, nenhuma com mais de 8 palavras. Frase longa o aluno
     não consegue ler e gravar.
   - **Fale com "você"**, de forma solta, como conversa. Termo técnico só se for
     explicado.
   - **A última frase puxa a seguinte**, e o fecho é uma chamada ligada à promessa
     do vídeo ("se você vende pela internet, me segue").
   - O tempo é o que o conteúdo pede. Corte o que dá para tirar sem perder nada.
   - Número, preço e regra de plataforma entram conferidos na fonte, no dia.
   - Se o assunto é saúde, suplemento, emagrecimento ou dinheiro, passe pelo
     "Promessa e regras" de `referencias/checklist-qc.md` antes de mostrar.
   - Escreva `roteiro.md` como tabela com as colunas **Fala**, **Na tela** e
     **Som**. A coluna "Na tela" diz o gráfico ou o recurso de cada frase.
4. **Gate do roteiro.** Mostre o roteiro e pergunte: "É isso que você vai
   falar? Aprova, ou me diz o que mudar". Nada de gravar, nem de editar, antes do sim.

## Passo 2: fundo verde ou cenário próprio

Pergunte, antes de ele gravar:

"Você vai gravar na frente de um cenário seu (sua mesa, sua parede, sua
loja), ou na frente de um pano verde? Com o pano verde eu troco o fundo por
qualquer cenário e ponho gráficos atrás da sua cabeça. Com cenário próprio o vídeo
sai com zoom, palavra grande e cartões. Qual dos dois?"

- **Cenário próprio**: o vídeo é do tipo `videov2`.
- **Fundo verde**: o vídeo é do tipo `camadas`.

Mande o aluno para `referencias/receita-gravacao.md` (leia e resuma em poucas
linhas as regras do jeito escolhido: luz de frente, celular em pé na altura dos
olhos, e para o verde o pano esticado e a distância de 1,5 m).

**No fundo verde, escolha o cenário agora** (a imagem que vai atrás da pessoa):

"Quer usar uma foto sua de cenário (um escritório, uma loja, uma sala) ou
prefere que eu gere três opções com inteligência artificial? Tem também uma
cor lisa ou um degradê, que sai na hora e sem custo."

- **Foto do aluno**: peça o arquivo e copie para `producao/<slug>/cenarios/`.
- **Cor lisa ou degradê** (sem custo, feito pelo ffmpeg, já no tamanho do vídeo,
  1080x1920). Pergunte a cor (ou duas, pro degradê) e troque os códigos `0x1b2a49`
  (cor de cima) e `0x4a6fa5` (cor de baixo):

```
ffmpeg -y -f lavfi -i "gradients=s=1080x1920:c0=0x1b2a49:c1=0x4a6fa5:x0=540:y0=0:x1=540:y1=1920:d=1:n=2" -frames:v 1 producao/<slug>/public/cenario.png
```

  Cor lisa, uma só: `ffmpeg -y -f lavfi -i "color=c=0x1b2a49:s=1080x1920" -frames:v 1 producao/<slug>/public/cenario.png`.
  Abra a imagem, mostre ao aluno e confirme. Nesse caso não há o que copiar depois.
- **Imagem por IA**: use a `/gerar-imagens` no mesmo padrão dela. Rode
  `node .claude/skills/gerar-imagens/scripts/motor.mjs` para ver o degrau
  disponível. No degrau `zero-ia` não há como gerar: peça uma foto.
  **Avise antes de gerar:** "A imagem sai quadrada e o vídeo é vertical, então as
  laterais vão ser cortadas. Eu peço o assunto principal no centro."
  - Degrau `gemini` custa dinheiro por imagem: confira na web, hoje, o preço por
    imagem na página oficial de preços do Google AI, conte 3 imagens, mostre a
    conta ("3 imagens a US$ X cada, total US$ Y") e espere o "pode ir".
  - Degrau `codex`: ele cobra pela cota do plano, e passando dela gasta créditos
    avulsos. Diga isso e espere o "pode ir" do aluno antes de gerar, como nos
    outros gastos.

  Escreva `producao/<slug>/cenarios/cenas.json` com três cenas, cada uma com
  `out` e uma `descricao` do lugar, fotorrealista, sem pessoa e sem texto, com o
  assunto principal no centro. Depois do sim, rode:
  - codex: `node .claude/skills/gerar-imagens/scripts/gerar-cenario.mjs --degrau codex --cenas producao/<slug>/cenarios/cenas.json`
  - gemini, com o preço do dia já na primeira chamada e o `--autorizado` só
    depois do sim: `node .claude/skills/gerar-imagens/scripts/gerar-cenario.mjs --degrau gemini --cenas producao/<slug>/cenarios/cenas.json --preco-usd <preço do dia> --contexto "cenario <slug>" --autorizado`

  Abra as três (leitura de imagem), mostre ao aluno e pergunte qual.
- Copie a escolhida para `producao/<slug>/public/cenario.png`.

Combine a entrega: o arquivo vai para `producao/<slug>/bruto/`. "Quando gravar,
me manda o arquivo, e eu continuo daqui."

## Passo 3: preparo (tudo grátis, tudo no computador)

Use `<modelo>` igual ao campo `whisper` do `maquina.json`. Os caminhos são
relativos à raiz do projeto.

**3.1 Sincronia.** Celular que perde quadro deixa o áudio escorregar da boca. Meça:

```
ffprobe -v error -select_streams v:0 -show_entries stream=duration -of csv=p=0 producao/<slug>/bruto/<arquivo>.mp4
ffprobe -v error -select_streams a:0 -show_entries stream=duration -of csv=p=0 producao/<slug>/bruto/<arquivo>.mp4
```

Diferença maior que 0,1 s: rode

```
node .claude/skills/editar-video/scripts/py.mjs sincronizar-bruto.py producao/<slug>/bruto/<arquivo>.mp4 producao/<slug>/trab/bruto-sincronizado.mp4
```

Mova o original para `producao/<slug>/original/` e ponha o sincronizado em
`producao/<slug>/bruto/`. O verificador usa o que estiver em `bruto/`.

**3.2 Achar as frases.** O script acha os blocos de fala pelo volume e confirma o
texto com o whisper:

```
node .claude/skills/editar-video/scripts/py.mjs blocos.py producao/<slug>/bruto/<arquivo>.mp4 producao/<slug>/trab/blocos.md --modelo <modelo>
```

Saiu uma tabela (número, início, fim, duração e texto de cada bloco). Escolha os
blocos que ficam. Fala fora do roteiro que completa a frase fica ("olha isso
aqui", "e o mais importante"). Só sai erro de fala: tropeço, palavra trocada,
frase cortada no meio.

**3.3 Montar a fala.** Junte os blocos escolhidos (cada um com 0,20 s antes e
0,15 s depois):

```
node .claude/skills/editar-video/scripts/py.mjs montar-blocos.py producao/<slug>/bruto/<arquivo>.mp4 producao/<slug>/trab/fala-montada.mp4 <ini>:<fim> <ini>:<fim>
```

Ele imprime a duração e os cortes medidos de verdade. Guarde esses números: são os
`cortesSeg` do estilo cenário próprio. Corte onde a pessoa já está falando e
termine antes de ela virar o rosto para ler: aumente `--antes` ou `--depois` se
preciso, e abra um quadro de cada borda para conferir.

**3.4 Voz limpa.** Tira ruído e nivela o volume:

```
node .claude/skills/editar-video/scripts/py.mjs tratar-voz.py producao/<slug>/trab/fala-montada.mp4 producao/<slug>/public/voz.wav
```

Se ele avisar que usou o filtro simples no lugar do limpador de ruído, siga: o
limpador de ruído só não foi instalado, e o resultado ainda fica bom.

**3.5 Legenda palavra por palavra.** Transcreva e depois acerte o texto contra o
que foi falado de verdade (o whisper erra nome próprio):

```
node .claude/skills/editar-video/scripts/py.mjs transcrever.mjs producao/<slug>/public/voz.wav producao/<slug>/public/voz.legendas.json <modelo>
node .claude/skills/editar-video/scripts/py.mjs alinhar.py producao/<slug>/public/voz.legendas.json producao/<slug>/fala.txt producao/<slug>/public/voz.alinhado.json
```

O `fala.txt` é o roteiro como o aluno falou, bloco a bloco (use o texto da
tabela do passo 3.2). Antes de alinhar, releia o `fala.txt` atrás de nome próprio
(marca, pessoa, loja) e de maiúscula no começo da frase: o `alinhar.py` mantém
exatamente o que está no arquivo, e o whisper escreve nome próprio em minúscula,
então o erro vai direto pra legenda. Confira por amostra que as palavras estão certas.

## Passo 4A: montagem em cenário próprio (`videov2`)

1. Copie `producao/<slug>/trab/fala-montada.mp4` para
   `producao/<slug>/public/pessoa.mp4`.
2. Abra um quadro de cada bloco (com o ffmpeg) e meça onde fica o topo da cabeça.
   Isso decide onde cabe a palavra-chave.
3. Escreva `producao/<slug>/edicao.json` seguindo `referencias/videov2.md`: os
   `cortesSeg` do passo 3.3, `escalasSeg` (1,0 no bloco com frase atrás da
   cabeça), `chaves`, `cartoes`, `flashes` e `sfx`. O zoom segue
   `referencias/movimento.md`. Todo tempo sai da palavra na fala alinhada.
4. Gere as props:

```
node .claude/skills/editar-video/scripts/py.mjs preparar-props.py producao/<slug>/edicao.json producao/<slug>/props.json --public-dir producao/<slug>/public --midia <_video>/midia
```

   Palavra que não existe na fala derruba o comando com o nome dela: corrija o
   `edicao.json`.

## Passo 4B: montagem com fundo verde (`camadas`)

O guia completo está em `referencias/camadas.md`. Os comandos:

1. **Recorte da pessoa.** Primeiro uma prévia de um quadro (grava `recorte.jpg`):

```
node .claude/skills/editar-video/scripts/py.mjs recortar-verde.py --bruto producao/<slug>/trab/fala-montada.mp4 --saida-dir producao/<slug>/trab --preview <segundo>
```

   Abra `producao/<slug>/trab/recorte.jpg` e confira (franja verde, buraco no
   corpo, aura no contorno). Ajuste `--lo` e `--hi` se precisar. Quando estiver
   bom, rode sem `--preview`:

```
node .claude/skills/editar-video/scripts/py.mjs recortar-verde.py --bruto producao/<slug>/trab/fala-montada.mp4 --saida-dir producao/<slug>/trab
```

   Ele grava `pessoa.webm` e `bruto-pad.mp4` (o bruto a 30 quadros, que o
   verificador usa). Copie o `pessoa.webm` para `producao/<slug>/public/`. A voz
   que vale é a do passo 3.4. O filtro de cor `--filtro-pessoa` vem desligado: só
   ligue se o aluno pedir ou o vídeo saiu apagado, mostrando antes e depois.
2. **Dados da peça** (duração, palavras e páginas de legenda):

```
node .claude/skills/editar-video/scripts/py.mjs paginas-camadas.py --alinhado producao/<slug>/public/voz.alinhado.json --voz producao/<slug>/public/voz.wav --saida producao/<slug>/dados.json --alinhado-saida producao/<slug>/public/voz.alinhado.json
```

3. **Cenário em relevo (3D), só com `extras3d: true`:**

```
node .claude/skills/editar-video/scripts/py.mjs profundidade.py producao/<slug>/public/cenario.png producao/<slug>/public/cenario-prof.png
```

   Se ele disser que falta o modelo, ou o `extras3d` for `false`, siga sem 3D
   (o cenário fica parado, como `referencias/camadas.md` explica) e diga ao
   aluno: "Esta versão faz o cenário parado, que também fica bom. O relevo 3D
   ainda não vem instalado". Se for 3D, avise: o render fica bem mais lento.
4. **A composição.** Copie
   `.claude/skills/editar-video/motor/exemplos/camadas-exemplo.tsx` para
   `producao/<slug>/composicao.tsx` e troque o que os comentários `TROQUE`
   mandam, seguindo `referencias/camadas.md`. Só você edita esse arquivo.
   Peça ao aluno a foto de perfil (`perfil.jpg` em `public/`) se a chamada
   "Seguir" ficar; sem foto, tire a chamada.
5. **Arquivo para o fiscal** (a conferência quadro a quadro).
   Escreva `producao/<slug>/verificar-props.json`:

```json
{ "pessoa": "pessoa.webm", "voz": "voz.wav", "duracaoSeg": <duracaoSeg do dados.json>, "segmentos": [], "sfx": [] }
```

## Passo 5: música e efeitos (o aluno escolhe a música)

Siga `referencias/som.md`. A biblioteca é do aluno (o kit não traz música nem
efeito, por licença): sem arquivo em `<_video>/midia/biblioteca/`, pule os itens 1 e
2, deixe a lista de efeitos vazia, avise uma vez como montar a biblioteca (texto em
`som.md`) e siga sem som extra.

1. Efeitos: escolha pela coluna "Uso" de `<_video>/midia/biblioteca/sfx/registro.md`.
   Cada gráfico que entra tem um. No cenário próprio vão no `sfx` do
   `edicao.json`; no verde, na lista `SFX` da composição.
2. Música: 3 a 5 candidatas de `<_video>/midia/biblioteca/musica/registro.md`
   pelo clima do assunto, uma amostra de 12 segundos de cada uma, e a pergunta
   "Qual número você escolhe?". Sem escolha, o vídeo sai sem música.
3. Sobre licença: se a faixa exigir crédito, guarde o texto para entregar junto.

## Passo 6: render e mix

```
node .claude/skills/editar-video/scripts/render.mjs --slug <slug> --tipo <videov2|camadas> --musica biblioteca/musica/<pasta>/<arquivo>.mp3
```

Sem música, tire o `--musica`. O volume padrão (`--musica-db -3 --duck-ratio 2`) fica,
a menos que o aluno peça outro. Antes de rodar, avise: "Agora o computador vai
montar o vídeo. Leva alguns minutos e ele pode ficar lento enquanto isso".

- Saiu com **código 3**: o motor não está pronto. Mande para `/configurar-video`.
- Saiu com **código 1**: leia a mensagem. Ela diz o que fazer (mídia faltando,
  composição com erro, render que falhou). Corrija e rode de novo.
- Deu certo: o vídeo está em `producao/<slug>/final/<slug>.mp4`.

O render só mixa se o vídeo for novo (nunca mixa o arquivo velho de outra rodada).

## Passo 7: conferir por medição

```
node .claude/skills/editar-video/scripts/conferir-final.mjs --slug <slug> --tipo <videov2|camadas>
```

Ele mede a zona segura da legenda (`referencias/zona-segura.md`), o volume geral
(-14 LUFS) e, no `videov2`, a sincronia da boca com a voz, a duração e se a
imagem travou. Reprovou: o próprio gate diz o conserto. Corrija, renderize de novo
e confira de novo. Depois olhe quadros do vídeo com o
`referencias/checklist-qc.md`.

**No fundo verde, o fiscal** (confere quadro a quadro: respiro de 40 px entre as
camadas, rosto coberto, fala sem legenda, gráfico sem som, quadro preto):

```
node .claude/skills/editar-video/scripts/py.mjs fiscal.py <Composicao> producao/<slug>/final/<slug>.mp4 producao/<slug>/trab/bruto-pad.mp4 producao/<slug>/fiscal --remotion <_video>/motor/node_modules/@remotion/cli/remotion-cli.js --public-dir producao/<slug>/public --props-base producao/<slug>/verificar-props.json --transcrever <_video>/motor/scripts/transcrever.mjs --modelo <modelo>
```

`<Composicao>` é `Camadas-` seguido do `<slug>` só com as letras, os números e os
hífens dele (a pasta `2026-10-04-fornecedor` vira `Camadas-2026-10-04-fornecedor`). O
resultado sai `APROVADO` ou `REPROVADO`, com `producao/<slug>/fiscal/relatorio.md`
(o segundo, o que houve, o quadro marcado e a etapa que corrige). Reprovou: volte
à etapa que o relatório manda, corrija, renderize e rode o fiscal de novo.
**Até 3 voltas.** Na terceira reprovação, mostre o relatório ao aluno e pergunte
o que fazer. O vídeo só vai ao aluno como pronto depois de aprovado.

O fiscal transcreve o final com o mesmo modelo de escuta do computador: passe
`--modelo <modelo>` (o campo `whisper` do `maquina.json`). Escreva o `<_video>` com o
caminho completo da pasta (o mesmo que o `conferir.mjs` mostra); o fiscal também
transforma caminho relativo em completo antes de rodar o transcritor. Se a
transcrição não sair, o `relatorio.md` traz a mensagem de erro dela: leia antes de
rodar de novo, que o fiscal leva uns 5 minutos.

### Olho final (desligado por padrão)

Um revisor de inteligência artificial (Gemini) assiste o vídeo contra o roteiro e
aponta o que o script não vê. **Custa dinheiro.** Só liga se o aluno pedir, e só
nas camadas:

1. Confira na web, hoje, o preço do Gemini para vídeo (página oficial de preços do
   Google AI) e faça a conta de um vídeo desta duração.
2. Compare com o teto de gasto: o campo `limite_gasto_usd` do bloco
   `mercado-livre` em `_contexto/mercado-livre.md` (sem o campo, o teto é US$ 4).
   Passou do teto: diga quanto passa e pergunte se ele quer subir o teto ou seguir
   sem o olho final. Dentro do teto, mostre: "O olho final custa cerca de US$ X
   neste vídeo. Posso ir?".
3. Só com o sim, rode o fiscal de novo com mais estes itens:
   `--roteiro producao/<slug>/roteiro.md --preco-usd <valor em dólar do olho final> --autorizado --ver-video .claude/skills/assistir-video/ver-video.mjs --registrar-custo .claude/skills/configurar-video/scripts/lib/registrar-custo-cli.mjs`
4. O custo vira uma linha em `dados/custos.jsonl`, sozinho. Se o relatório disser
   que o `ver-video` falhou, pode ter havido cobrança: diga ao aluno para
   conferir no painel do Gemini.
5. Problema "grave" apontado pelo olho final se confere no quadro antes de
   corrigir: tire o quadro do segundo apontado e olhe. O que não procede vai ao
   aluno no status, sem mexer no vídeo.

## Passo 8: o aluno assiste

Guarde a versão: copie `producao/<slug>/final/<slug>.mp4` para
`producao/<slug>/final/<slug>-v1.mp4` antes de qualquer novo render (o render
apaga o anterior). Abra o vídeo para o aluno (no Windows
`cmd /c start "" "<caminho>"`, no Mac `open "<caminho>"`) e diga:

"Pronto, abri o vídeo. Assiste inteiro, até o fim, e me responde: aprova, ou
me diz o que mudar e em que segundo."

Cada pedido de mudança vira uma nova rodada: ajuste, render, conferir, fiscal,
`-v2`. Aprovado, diga onde está o arquivo. Se pedir, escreva a legenda do post.
Esta skill nunca publica.

## Passo 9: aprendizado da peça (obrigatório)

Antes de fechar, escreva em `producao/<slug>/notas.md` uma entrada datada com
três blocos: o que atrasou ou deu retrabalho, o que o aluno pediu para mudar, e o
que entra no próximo vídeo (com o arquivo ou o passo desta skill que muda). Se a
mesma lição aparecer pela segunda vez, registre também no `_contexto/licoes.md` do
projeto e avise o aluno do que mudou.

## Regras que não se negociam

- **Gate humano:** o roteiro se aprova antes de gravar, a música é escolha do
  aluno, o vídeo se aprova no fim, e gasto (imagem por IA, olho final) só com o
  "pode ir" daquele momento, com o preço do dia conferido na web antes.
- **Custo avisado antes.** Todo gasto vira uma linha em `dados/custos.jsonl`.
- **Nada de dado de memória:** preço, regra de plataforma e número do roteiro se
  conferem na fonte, no dia.
- **Pesquisa em qualquer idioma**, principalmente inglês, quando o assunto do
  vídeo pedir pesquisa. A entrega sai em português.
- O aluno não edita código nem roda comando, e o motor fica fechado pra ele.

## Referências

- `referencias/receita-gravacao.md`: como gravar (cenário próprio e fundo verde).
- `referencias/camadas.md`: o estilo do fundo verde, passo a passo.
- `referencias/videov2.md`: o `edicao.json` do cenário próprio, campo por campo.
- `referencias/movimento.md`: zoom, corte e abertura.
- `referencias/som.md`: efeitos, música e volume.
- `referencias/acabamento.md`: grão, vinheta e luz.
- `referencias/zona-segura.md`: onde pode haver texto na tela.
- `referencias/checklist-qc.md`: a conferência de qualidade.
