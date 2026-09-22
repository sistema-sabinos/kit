# transcribe

Skill para Claude Code que transcreve vídeos de qualquer plataforma: YouTube, Instagram, TikTok, X/Twitter, Facebook, Vimeo e mais de 1000 outros sites.

Usa yt-dlp para baixar o áudio e faster-whisper (Whisper local) para transcrever. Tudo roda na tua máquina, sem API externa.

## Instalação

Esta skill já vem dentro do SabinOS: entra no projeto quando o negócio lida com vídeo ou redes sociais, ou a pedido. Não precisa baixar nada além das dependências abaixo.

### Dependências

**Python e pacotes:**
```bash
pip3 install yt-dlp faster-whisper
```

**ffmpeg:**
```bash
brew install ffmpeg  # macOS
sudo apt install ffmpeg  # Ubuntu/Debian
```

> Na primeira transcrição, o Whisper vai baixar o modelo (~1.5GB). Isso acontece uma vez só e demora alguns minutos dependendo da internet.

### Verificar instalação

Cole no chat do Claude Code:
```
/transcribe install
```

O Claude vai checar cada dependência e avisar se falta alguma coisa.

## Como usar

Cole o link do vídeo no chat:

```
transcreve esse reel: https://www.instagram.com/reel/...
```

```
/transcribe https://www.youtube.com/watch?v=...
```

O Claude vai perguntar se quer timestamps e depois mostra a transcrição completa no chat.

## Opções

- **Com timestamps:** cada trecho vem com `[M:SS]` na frente
- **Modelo maior:** mais preciso, mas mais lento. Padrão é `medium`
  - `small` — rápido, menos preciso
  - `large-v3` — máxima precisão, mais lento

## Plataformas suportadas

YouTube, Instagram (Reels e posts), TikTok, X/Twitter, Facebook, Vimeo, Twitch, Reddit e qualquer site suportado pelo yt-dlp (1000+).

## Licença

MIT
