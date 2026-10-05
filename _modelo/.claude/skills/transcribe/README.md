# transcribe

Skill do Claude Code que transforma em texto o vídeo de qualquer plataforma: YouTube, Instagram, TikTok, X/Twitter, Facebook, Vimeo e mais de 1000 outros sites. Também transcreve um arquivo de vídeo ou áudio que já está no teu computador.

Usa o yt-dlp pra baixar o áudio e o faster-whisper (o Whisper rodando na tua máquina) pra escrever o texto. Tudo roda no teu computador, sem serviço pago e sem chave de API.

## Instalação

Esta skill já vem dentro do SabinOS: entra no projeto quando o negócio lida com vídeo ou redes sociais, ou a pedido. Só precisa instalar as dependências abaixo.

### Dependências

**Python e pacotes:**

Windows:
```bash
python -m pip install yt-dlp faster-whisper
```

Mac e Linux:
```bash
pip3 install yt-dlp faster-whisper
```

No Windows o comando do Python é `python` (e `python -m pip` pra instalar pacote). Lá o `python3` não existe ou abre a Microsoft Store. No Mac e no Linux é `python3` e `pip3`.

**ffmpeg:**
```bash
brew install ffmpeg  # macOS
sudo apt install ffmpeg  # Ubuntu/Debian
```

No Windows, baixar em ffmpeg.org e colocar no PATH (a lista de pastas onde o Windows procura programas).

> Na primeira transcrição, o Whisper baixa o modelo (uns 1,5 GB). Isso acontece uma vez só e demora alguns minutos, dependendo da internet.

### Conferir a instalação

Cole no chat do Claude Code:
```
/transcribe install
```

O Claude confere cada dependência e avisa se falta alguma coisa.

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
