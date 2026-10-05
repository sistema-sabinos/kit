---
name: gerenciar-youtube
description: >
  Le e gerencia o canal do YouTube direto pela API: numeros do canal, lista de videos, relatorio do
  periodo (visualizacoes, tempo assistido, retencao media, inscritos), comentarios e troca de titulo,
  descricao e tags de video publicado. Use quando o usuario chamar /gerenciar-youtube, disser "como
  esta o canal", "puxa o relatorio do youtube", "le os comentarios", "troca o titulo do video X".
---

# /gerenciar-youtube, o canal pela API

Script: `node .claude/skills/gerenciar-youtube/scripts/yt.mjs`. O login fica so neste computador,
no arquivo `.env`, como toda chave do kit.

## Primeira vez

Sem `YOUTUBE_CLIENT_ID` no `.env`, guiar pela secao "YouTube" de
`.claude/skills/midia-social/referencias/configurar.md` (projeto no Google Cloud, as duas APIs
ligadas, credencial de app de computador). Depois, uma vez:

```
node .claude/skills/gerenciar-youtube/scripts/yt.mjs auth --cliente <arquivo .json baixado do Google>
```

Ele mostra um endereco: abrir no navegador, entrar com a conta do canal e autorizar.

## Comandos

```
node .claude/skills/gerenciar-youtube/scripts/yt.mjs canal                 # inscritos, visualizacoes, videos
node .claude/skills/gerenciar-youtube/scripts/yt.mjs videos 10             # ultimos videos com numeros e privacidade
node .claude/skills/gerenciar-youtube/scripts/yt.mjs relatorio 28          # periodo do canal e os 10 videos de mais visualizacao
node .claude/skills/gerenciar-youtube/scripts/yt.mjs comentarios <VIDEO_ID> 50
node .claude/skills/gerenciar-youtube/scripts/yt.mjs atualizar <VIDEO_ID> --titulo "..." --tags "a,b" --descricao desc.txt
```

## Regras

1. **Leitura e livre** (canal, videos, relatorio, comentarios): usar sempre que precisar de numero real.
2. **Escrita so com o "pode ir".** O `atualizar` sem `--confirmar` so mostra o antes e o depois.
   Mostrar isso, esperar a aprovacao, e so entao repetir com `--confirmar`. Trocar titulo de video
   no ar mexe na distribuicao: a decisao e da pessoa.
3. **Postar o Short e pelo /publicar-social**, que agenda pelo Buffer.
4. **Impressoes e taxa de clique nao saem nesta API**: ver no YouTube Studio.
5. Cota do Google: 10.000 unidades por dia, e cada comando daqui gasta poucas. Se acabar, esperar a
   virada do dia (meia-noite no horario do Pacifico).
6. Relatorio longo vai pra `inteligencia/youtube-<AAAA-MM-DD>.md`; no chat, so o resumo.
