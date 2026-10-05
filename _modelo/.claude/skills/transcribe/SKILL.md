---
name: transcribe
description: >
  Transcreve o vídeo de qualquer link (YouTube, Instagram, X/Twitter, TikTok, Facebook, Vimeo etc.) ou arquivo do computador em texto, de graça e sem chave de API. É a rota padrão pra vídeo: use quando o usuário pedir pra transcrever, pedir o texto ou a legenda, perguntar o que o vídeo fala, ou colar um link de vídeo querendo saber do que se trata. Quando a pessoa quer o que aparece na tela, é com o /assistir-video; quando quer saber por que o vídeo funciona, com o /decupar-referencia. Também dispara com "transcribe install" ou "transcribe setup" pra rodar o assistente de instalação.
---

# Video Transcriber

Transcribe any video URL into text using yt-dlp (download) + faster-whisper (transcription).

**Windows:** o comando é `python` (e `python -m pip` no lugar de `pip3`); `python3` no Windows não existe ou abre a Microsoft Store. Onde abaixo aparecer `python3`/`pip3`, usar `python`/`python -m pip` no Windows. Respostas pro usuário saem em português.

**YouTube:** antes de baixar e transcrever, tentar a legenda pronta (sai na hora e de graça): `yt-dlp --skip-download --write-auto-subs --write-subs --sub-langs "pt.*" --sub-format vtt "<url>"`. Sem legenda, ou com erro `429`, seguir o fluxo abaixo.

## Install

If the user says `/transcribe install` or `/transcribe setup`, run this install wizard instead of the normal workflow. Walk through each step conversationally — check, report, fix, move on.

### Step 1: Check Python 3

```bash
python3 --version
```

Need Python 3.8+. If missing or too old, guide the user:
- **macOS:** `brew install python3`
- **Linux:** `sudo apt install python3 python3-pip`
- **Windows:** Download from python.org

### Step 2: Check pip packages

```bash
pip3 show faster-whisper 2>/dev/null && echo "OK: faster-whisper" || echo "MISSING: faster-whisper"
pip3 show yt-dlp 2>/dev/null && echo "OK: yt-dlp" || echo "MISSING: yt-dlp"
```

For any missing packages:
```bash
pip3 install faster-whisper yt-dlp
```

**Note:** faster-whisper will download a ~1.5GB Whisper model on first use. This is normal and only happens once.

### Step 3: Check ffmpeg

```bash
which ffmpeg && ffmpeg -version | head -1 || echo "MISSING: ffmpeg"
```

If missing:
- **macOS:** `brew install ffmpeg`
- **Linux:** `sudo apt install ffmpeg`
- **Windows:** Download from ffmpeg.org and add to PATH

### Step 4: Verify the script

```bash
python3 -c "import faster_whisper; import yt_dlp; print('All Python dependencies OK')"
```

### Step 5: Report status

Print a summary like this:

```
Transcribe — Install Summary

  Python:         [OK/MISSING] (version)
  faster-whisper: [OK/MISSING]
  yt-dlp:         [OK/MISSING]
  ffmpeg:         [OK/MISSING]
  Script:         [OK/MISSING]
  Status:         [Ready to use / X items need attention]

Try it: /transcribe https://youtube.com/watch?v=example
```

If anything failed, summarize what still needs fixing before the skill will work.

---

## Invocation

`/transcribe <url>` — the URL is passed as the skill argument.

If no URL is provided in the argument, ask the user for it.

## Workflow

1. Ask the user: "Include timestamps?" (Yes / No)
2. Run the transcription script:

```bash
python3 <skill_path>/scripts/transcribe_url.py "<url>" [--timestamps]
```

Add `--timestamps` if the user chose yes.

3. Present the transcript output to the user — the script prints the transcript directly to stdout.

## Dependency Errors

If the script exits with missing dependency errors, relay the install instructions it prints:

```bash
pip3 install yt-dlp faster-whisper
brew install ffmpeg  # macOS
```

## Options

- `--model <size>` — Whisper model size (default: `medium`). Use `small` for faster but less accurate results, `large-v3` for maximum accuracy.
- `--timestamps` — Prefix each segment with `[M:SS]` timestamp.
