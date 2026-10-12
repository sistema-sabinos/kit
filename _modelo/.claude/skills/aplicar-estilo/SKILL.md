---
name: aplicar-estilo
description: >
  Edita o vídeo da pessoa num estilo de edição pronto, de nível profissional (aula, receita,
  antes e depois, notícia, anúncio, tutorial e mais de 70), vertical ou horizontal, com
  cortes, legenda e animação. Mostra os estilos que servem pro nicho dela, roda o escolhido no
  computador e entrega o MP4. Use quando o usuário chamar /aplicar-estilo, disser "edita no
  estilo...", "que estilos de edição tem", "quero meu vídeo editado igual profissional",
  "modelo de edição pro meu nicho". Edição a partir da fala, sem estilo pronto, é a
  /editar-video.
---

# /aplicar-estilo

Você edita um vídeo do aluno num dos estilos prontos do catálogo do SabinOS. Cada estilo é
uma edição completa de profissional, pensada pra um tipo de conteúdo: aula com slide que se
monta na fala, receita com cartão de ingredientes, antes e depois, manchete de notícia,
anúncio de performance e assim por diante. O aluno escolhe o estilo, manda o vídeo e recebe
o MP4. Nada é publicado por esta skill.

## Em palavras simples

- **Estilo:** um molde de edição. Ele já sabe onde entra cada corte, legenda e animação; a
  IA só traduz a fala do aluno pros blocos do estilo.
- **Remotion:** o programa que monta o vídeo por código. "Render" é gerar o vídeo final.
- **Whisper:** o "ouvido" que escreve o que foi falado, palavra por palavra, de graça e no
  computador do aluno.

Tudo roda por um comando só, que acha as pastas certas sozinho:

```
node .claude/skills/aplicar-estilo/scripts/estilos.mjs <comando>
```

Nos passos abaixo, `estilos.mjs` quer dizer esse comando inteiro, rodado da pasta do projeto.

O catálogo mora na pasta `_estilos-video`, na pasta-mãe (ao lado dos projetos). Cada edição
fica em `<_video>/estilos/<AAAA-MM-DD-assunto>`, fora do projeto e do backup.

## Passo 1, conferir

Rode `estilos.mjs conferir`. Saída 3 é que falta algo; diga o quê em uma frase e mande pro
lugar certo:

- **catálogo:** rode a `/atualizar-kit` na pasta-mãe (ela baixa os estilos, uns 150 MB);
- **skill do Remotion:** o passo 5 da `/configurar-video` instala, com o sim do aluno;
- **Node** ou **espaço no caminho:** a `/configurar-video` resolve.

## Passo 2, escolher o estilo

Pergunte numa mensagem só: o assunto e o nicho do vídeo, se é vertical (Reels, TikTok,
Shorts) ou horizontal (YouTube, curso), e que vídeo ele já tem (fala pra câmera, tela
gravada, fotos). Rode:

```
estilos.mjs listar --formato 9:16 --busca "confeitaria receita"
```

(`--formato 16:9` pra horizontal; a busca pede todas as palavras, sem ligar pra acento.)
Mostre no máximo 5, uma linha cada: o nome, como fica e o que precisa mandar. Se o estilo
tiver prévia (`<catálogo>/modelo-<estilo>/references/previa/previa.mp4`), abra pro aluno
ver. Espere a escolha.

## Passo 3, criar a edição e seguir o estilo

1. Combine o nome da pasta (`AAAA-MM-DD-assunto-curto`, minúsculo, sem acento) e rode
   `estilos.mjs criar <estilo> <pasta>`. Ele mostra a pasta da edição e a pasta do estilo.
2. Leia inteiro o `SKILL.md` da pasta do estilo e as `references/` que ele mandar ler. Daqui
   em diante você segue esse `SKILL.md` como editor, com estas trocas:
   - "a pasta desta skill" é a pasta do estilo que o `criar` mostrou;
   - o passo de copiar o `assets/template/` já foi feito pelo `criar`: no lugar do
     `npm install`, rode `estilos.mjs instalar <pasta>`;
   - todo `node <caminho>.mjs ...` do estilo roda como `estilos.mjs rodar <pasta> <caminho>.mjs ...`,
     com o mesmo caminho (`scripts/preparar.mjs` fica `scripts/preparar.mjs`,
     `ferramentas/justar.mjs` fica `ferramentas/justar.mjs`). O comando entra na pasta da
     edição e passa o cache e a chave opcional sozinho. Vale também pro "próximo passo" que os
     próprios scripts imprimem no fim, e o `npm install` que o estilo mandar repetir é o
     `estilos.mjs instalar <pasta>`;
   - o passo "carregue a skill remotion-best-practices": leia o `SKILL.md` dela em
     `.claude/skills/remotion-best-practices/`, no projeto ou na pasta do usuário
     (`~/.claude/skills/`), onde o `conferir` achou. Onde ela e o estilo divergem, vale o estilo:
     sem Studio, e o pedido de edição já é o pedido de render;
   - sem a pasta `references/previa/` no estilo, estude ele pelo `SKILL.md` e pelo
     `references/plano.md`.
3. O vídeo do aluno entra pelo caminho completo do arquivo.

## Antes de gastar

- **Primeira edição na máquina:** o primeiro `preparar` baixa o Whisper e o modelo de voz
  (1,6 GB, uma vez só, guardados em `<_video>/estilos/_cache`), de graça. Avise o tamanho e
  espere o sim. Computador fraco: `--modelo small` (menor e mais rápido).
- **Toda edição nova:** o `instalar` e o primeiro `preparar` baixam as bibliotecas e o
  navegador de render da edição, e a pasta dela fica com uns 750 MB no disco. Avise na
  primeira vez.
- **Ferramenta paga sugerida pelo estilo** (gerador de imagem, IA de vídeo pra troca de
  roupa): é opcional e fica por conta do aluno. Diga o preço conferido na hora e só siga
  com o "pode ir"; sem ele, siga sem a ferramenta.
- **Fotos do Pexels:** a busca de fotos aceita uma chave grátis do Pexels, opcional. Se o
  aluno quiser, ele cria a chave no site e põe `PEXELS_API_KEY=` no `.env` do projeto. Nunca
  peça a chave no chat: o `rodar` lê do `.env`.

## Passo 4, entregar

Quando o render do estilo terminar, rode `estilos.mjs entregar <pasta>`. Ele copia o MP4
pra `producao/<pasta>/` do projeto. Abra o vídeo pro aluno ver e ouvir e pergunte se quer
algum ajuste; ajuste se faz na mesma pasta da edição, seguindo o `SKILL.md` do estilo.

## Regras

- Nunca edite arquivo do catálogo: ele é do kit e a `/atualizar-kit` troca a pasta inteira.
- Estilo marcado como `mac` no catálogo só roda no Mac; no Windows ele nem aparece.
- Cada edição guarda as bibliotecas dela (uns 750 MB). Edição entregue e aprovada pode ser
  apagada da pasta `<_video>/estilos/` pra liberar espaço, com o sim do aluno; o MP4 fica
  em `producao/`. A pasta `_cache` fica, pra não baixar o modelo de voz de novo.
