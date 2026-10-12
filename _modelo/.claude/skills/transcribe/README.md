# transcribe

Skill do Claude Code que transforma em texto o vídeo de qualquer plataforma: YouTube, Instagram, TikTok, X/Twitter, Facebook, Vimeo e mais de 1000 outros sites. Também transcreve um arquivo de vídeo ou áudio que já está no teu computador.

Usa o yt-dlp pra baixar o áudio e o faster-whisper (o Whisper rodando na tua máquina) pra escrever o texto. Tudo roda no teu computador, sem serviço pago e sem chave de API.

## Instalação

Esta skill já vem dentro do SabinOS: entra no projeto quando o negócio lida com vídeo ou redes sociais, ou a pedido. Na primeira vez, ela precisa de alguns programas grátis no computador.

### Dependências

Você não instala nada na mão. Diga no chat do Claude Code:
```
/transcribe install
```

O Claude confere o que já tem, conta o que falta, pede o seu sim e instala sozinho. Se aparecer uma janela pedindo permissão, clique em Sim.

> Na primeira transcrição, o Whisper baixa o modelo (uns 1,5 GB). Isso acontece uma vez só e demora alguns minutos, dependendo da internet.

## Como usar

Cole o link do vídeo no chat:

```
transcreve esse reel: https://www.instagram.com/reel/...
```

```
/transcribe https://www.youtube.com/watch?v=...
```

Ou mande o caminho de um arquivo que está no computador:

```
/transcribe dados/aula.mp4
```

Com arquivo do computador nada é baixado: o texto sai direto do arquivo.

No YouTube, o Claude tenta primeiro pegar a legenda que o vídeo já tem, que sai na hora. Se não tiver legenda, ou se o YouTube bloquear por excesso de pedidos (erro 429), ele baixa o áudio e transcreve.

O Claude pergunta se quer a marcação de tempo de cada trecho e depois mostra a transcrição completa no chat.

## Opções

- **Com marcação de tempo:** cada trecho vem com `[M:SS]` na frente
- **Modelo maior:** mais preciso, só que mais lento. O padrão é `medium`
  - `small`: rápido, erra mais
  - `large-v3`: o mais preciso, e o mais lento

## Plataformas que funcionam

YouTube, Instagram (Reels e posts), TikTok, X/Twitter, Facebook, Vimeo, Twitch, Reddit e qualquer site que o yt-dlp aceite (mais de 1000).

## Licença

MIT
