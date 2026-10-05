---
name: configurar-video
description: >
  Instala e testa tudo que o vídeo precisa neste computador (Node, Python, ffmpeg, o
  motor de edição, o programa que escuta a voz e escreve a legenda e o limpador de
  ruído), pergunta antes de baixar cada coisa e fecha com um
  teste curtinho de uns 8 segundos. Use quando o usuário chamar /configurar-video, disser "configurar
  video", "instalar o video", "preparar o computador pra editar video", ou quando outra
  skill de vídeo (editar-video, video-produto) mandar rodar a configuração porque o motor
  não está pronto ou foi atualizado.
---

# /configurar-video: deixando o computador pronto pra fazer vídeo

Esta skill instala as ferramentas do vídeo uma vez só e prova que funcionam. Depois dela,
as outras skills de vídeo rodam sem pedir nada. Cada download só acontece depois do "sim"
do aluno, com o tamanho e o comando na frente dele.

Todos os comandos rodam da pasta do projeto (onde fica a pasta `.claude`).

## Antes de falar do peso

A instalação precisa de uns 4 GB livres no disco (os programas e a folga pra gerar o
vídeo). Depois de pronta, ela ocupa uns 3 GB. Música e efeito sonoro não vêm no kit: a
licença dos sites de música grátis não deixa o SabinOS repassar os arquivos, então cada
pessoa baixa os seus, de graça, e o `/editar-video` mostra onde colocar. O primeiro vídeo
gerado ainda baixa sozinho um navegador sem tela, que o Remotion usa pra desenhar cada
quadro (uns 270 MB no disco).

Tudo mora numa pasta chamada `_video`, ao lado da pasta do projeto, e serve a todos os
seus projetos. Se você tiver projetos em versões diferentes do SabinOS, rode
`/configurar-video` ao trocar de um pro outro (o motor muda de versão). Pra evitar isso,
atualize todos com `/atualizar-sabinos`.

## Passos (nesta ordem)

### 1. Medir o computador

Rode `node .claude/skills/configurar-video/scripts/medir-maquina.mjs`. Explique o resultado
em 3 linhas, em linguagem de gente: quanta memória e disco livre tem, se tem placa de vídeo
dedicada, e qual tamanho de "cérebro de escuta" vai ser usado (small é mais rápido, medium
escuta melhor e pesa mais). Se o resultado trouxer algo em `falta` (por exemplo pouco disco),
pergunte ao aluno como quer seguir antes de continuar.

O cenário em relevo (3D) precisa de um modelo de profundidade que esta versão do kit ainda
não instala. Por isso o resultado traz `extras3d: false` e uma `nota3d`: diga ao aluno que
o cenário fica parado, que também fica bom, e não prometa nenhum passo de instalação.

### 2. Conferir o que já está instalado

Rode `node .claude/skills/configurar-video/scripts/conferir.mjs`. Ele só olha e não instala
nada, e devolve cada item com `ok` ou não, o tamanho e o comando. Rode antes o passo 1: sem
o `maquina.json` o item whisper vem `ok: false` com "rode o medir-maquina antes".

Se vier `pastaComEspaco: true`, explique: o caminho da pasta do vídeo tem espaço no nome (por
exemplo "Maria Silva") e o programa que escuta a voz não aceita isso. Mostre a pasta
sugerida (`sugestaoPasta`) e, com o sim do aluno, grave a linha `SABINOS_VIDEO=<pasta>` no
arquivo `.env` usando `gravarEnv` de `.claude/skills/mercado-livre/scripts/lib/env.mjs`.
Rode o conferir de novo antes de seguir.

### 3. Instalar o que falta, um item por vez

Use sempre o campo `instalar` que o `conferir.mjs` imprime: ele já vem com o caminho certo da pasta do vídeo. O `sincronizar-motor.mjs` roda sempre (ver o item motor). Os outros itens só se estiverem com `ok: false`. Na ordem **brew (só no Mac), node, python, python-libs, ffmpeg, motor, whisper,
deep-filter**: diga em uma frase o que é, mostre o tamanho (`mb`) e o comando
(`instalar`), peça o sim e só então rode.

- **brew** (só no Mac): o Homebrew, o instalador de programas do Mac, que os outros
  itens usam. O comando é o oficial do site brew.sh. Avise antes: ele pede a senha do
  Mac e, se faltar, baixa as ferramentas de compilar da Apple (uns 2 GB), que o whisper
  usa. Pode abrir uma janela pedindo pra instalar essas ferramentas: é pra aceitar.
- **node, python, ffmpeg**: são programas do computador, instalados pelo `winget` no Windows
  e pelo `brew` no Mac. Se o instalador pedir permissão do computador, avise o aluno. Depois
  de instalar, feche e abra o terminal pro computador achar o programa novo.
- **python-libs**: as bibliotecas de imagem e som do Python (no Mac, dentro de um ambiente
  próprio em `_video/py`, porque o Python do brew não deixa instalar fora dele).
- **motor**: duas partes, e a primeira roda **sempre**, mesmo com o motor aparecendo como ok (o conferir só vê se a biblioteca existe, e nunca checa se o motor está na versão do SabinOS atual; o script é barato e só copia o que mudou). Primeiro `node .claude/skills/configurar-video/scripts/sincronizar-motor.mjs`
  copia o motor de edição pra `_video/motor`. Se ele disser que precisa instalar as
  bibliotecas, rode `node .claude/skills/configurar-video/scripts/instalar-motor.mjs`
  (depois do sim; leva uns minutos e pesa uns 750 MB). Ele roda o `npm ci` dentro de
  `_video/motor` e só marca como instalado se terminar sem erro. Se a internet cair no
  meio, rode o mesmo comando de novo.
- **whisper**: o comando do campo `instalar`, do jeito que vem (já traz o `--modelo` que o
  passo 1 escolheu, e a pasta do whisper é a `ferramentas/whisper.cpp` do `_video`). É o programa que escuta a voz e escreve a legenda, e roda no
  seu computador, de graça. A `/transcribe` e a `/pauta` usam outro programa (o faster-whisper), de propósito: o do vídeo é o que o Remotion sabe usar pra legenda palavra por palavra, e o outro roda em projeto sem vídeo.
- **deep-filter**: `node .claude/skills/configurar-video/scripts/baixar-deep-filter.mjs`.
  Limpa o ruído da voz (ventilador, eco). Se o seu computador não tiver versão pronta, o
  script avisa e a voz passa por outro filtro, que limpa um pouco menos e funciona igual.

No Windows os comandos são os que o `conferir.mjs` mostra. No Mac, o `ffmpeg` precisa ser a
versão completa, com suporte a legenda: `brew install ffmpeg-full && brew link --overwrite --force ffmpeg-full`
(o `ffmpeg` comum do brew não traz isso).

### 4. Chave do Gemini

Veja se o `.env` tem `GEMINI_API_KEY`. Se não tem, explique em duas frases o que fica
travado sem ela: a conferência de vídeo por IA (o "olho final"), a geração de imagem e a
voz gerada. Dá pra editar vídeo sem ela. Ofereça rodar o `/conectar` pra pôr a chave.
Qualquer uso pago da chave só acontece com preço e autorização avisados na hora.

### 5. Skills do Remotion

O Remotion é a biblioteca que monta o vídeo. Existe um pacote de skills dele que ensina o
Claude a usá-lo melhor. Explique que o `/find-skills` mostra o que são skills e como se
instalam, e, com o sim do aluno, rode `npx skills add remotion-dev/skills -a claude-code -y`
na pasta do projeto. O `-a claude-code` instala só pro Claude Code e o `-y` responde sim
aos avisos. Ele põe umas 12 skills do Remotion em `.claude/skills/` deste projeto e um
arquivo `skills-lock.json` na pasta do projeto, sem mexer nos outros projetos.

Esta é a exceção escrita à regra de nunca instalar skill de terceiro do jeito que veio: o
pacote é o oficial dos próprios autores do Remotion e ensina a biblioteca deles, então entra
sem adaptar (decisão de 2026-10-05). Qualquer outra skill de fora segue a regra.

### 6. Teste curtinho de uns 8 segundos

Antes, rode `sincronizar-motor.mjs` de novo (e `instalar-motor.mjs` se ele pedir). O teste se recusa a carimbar se o motor de `_video` estiver diferente do kit. Rode `node .claude/skills/configurar-video/scripts/teste-rapido.mjs`. Ele monta um vídeo de
uns 8 segundos com uma fala do kit, limpa a voz, escreve a legenda, renderiza e confere se a
legenda acertou e se o vídeo tem a duração certa. Passando, grava o `pronto.json` em
`_video` e mostra onde ficou o mp4: abra o arquivo pro aluno ver e ouvir.

Se falhar, leia a mensagem, diga ao aluno o que faltou em linguagem simples e volte ao
passo 3 pro item certo. Se a mensagem disser "falta referencias/teste-voz.wav", o kit está
incompleto: peça pra atualizar o SabinOS.

### 7. Rodar de novo depois de atualizar o SabinOS

Quando o SabinOS atualiza, o motor pode mudar, e as skills de vídeo vão mandar rodar esta de
novo. Nesse caso basta: `sincronizar-motor.mjs` (só copia o que mudou, e `instalar-motor.mjs`
só se ele pedir) e `teste-rapido.mjs`.
O resto continua como estava.

### 8. Mac

No Mac, avise o aluno com estas palavras: "Este caminho foi conferido por teste de código,
sem máquina real. Se algo falhar, me conta a mensagem que aparecer que a gente acha o ajuste."
Um Mac com chip Intel ou M tem o limpador de voz pronto; o resto segue os comandos de `brew`
mostrados pelo `conferir.mjs`, começando pelo próprio Homebrew se ele faltar.

## Regras

- Nada baixa sem o sim do aluno naquele momento, com tamanho e comando mostrados antes.
- Nunca rodar `npm install` dentro da pasta do SabinOS. As bibliotecas do motor entram só
  pelo `instalar-motor.mjs`, dentro de `_video/motor`.
- Pasta com espaço no nome resolve no passo 2, antes de instalar qualquer coisa.
