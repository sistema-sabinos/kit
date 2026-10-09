---
name: transcribe
description: >
  Transcreve o vídeo de qualquer link (YouTube, Instagram, X/Twitter, TikTok, Facebook, Vimeo etc.) ou arquivo do computador em texto, de graça e sem chave de API. É a rota padrão pra vídeo: use quando o usuário pedir pra transcrever, pedir o texto ou a legenda, perguntar o que o vídeo fala, ou colar um link de vídeo querendo saber do que se trata. Quando a pessoa quer o que aparece na tela, é com o /assistir-video; quando quer saber por que o vídeo funciona, com o /decupar-referencia. Também dispara com "transcribe install" ou "transcribe setup" pra rodar o assistente de instalação.
---

# Transcrever vídeo

Transforma em texto o vídeo de qualquer link, ou um arquivo de vídeo ou áudio que já está no computador. Usa o yt-dlp (baixa o áudio do link) e o faster-whisper (escuta o áudio e escreve o texto). Tudo roda na máquina da pessoa, sem pagar nada.

O pacote de vídeo tem outro programa de transcrição (o whisper.cpp, que o `/configurar-video` instala), porque o Remotion precisa dele pra legenda palavra por palavra. Os dois convivem de propósito: esta skill e a `/pauta` usam o faster-whisper, que roda em qualquer projeto, com ou sem o pacote de vídeo, e só é instalado quando a pessoa usa uma delas.

Respostas pro usuário saem em português.

**Python no Windows e no Mac/Linux:** no Windows o comando é `python` e o instalador de pacotes é `python -m pip`; lá `python3` não existe ou abre a Microsoft Store. No Mac e no Linux o comando é `python3` e o instalador é `pip3`. Cada comando abaixo aparece nos dois jeitos.

## Instalação

Se o usuário disser `/transcribe install` ou `/transcribe setup`, rodar este assistente de instalação no lugar do fluxo normal. Ir passo a passo, conversando: conferir, contar o resultado, consertar o que faltar e seguir pro próximo.

### Passo 1: conferir o Python 3

Windows:
```bash
python --version
```

Mac e Linux:
```bash
python3 --version
```

Precisa do Python 3.8 ou mais novo. Se não tiver, ou se for mais antigo, orientar:
- **Mac:** `brew install python3`
- **Linux:** `sudo apt install python3 python3-pip`
- **Windows:** `winget install --id Python.Python.3.12 -e --source winget --accept-source-agreements --accept-package-agreements --disable-interactivity`, depois feche todas as janelas do VS Code e abra de novo

### Passo 2: conferir os pacotes do Python

Windows:
```bash
python -m pip show faster-whisper 2>/dev/null && echo "OK: faster-whisper" || echo "MISSING: faster-whisper"
python -m pip show yt-dlp 2>/dev/null && echo "OK: yt-dlp" || echo "MISSING: yt-dlp"
```

Mac e Linux:
```bash
pip3 show faster-whisper 2>/dev/null && echo "OK: faster-whisper" || echo "MISSING: faster-whisper"
pip3 show yt-dlp 2>/dev/null && echo "OK: yt-dlp" || echo "MISSING: yt-dlp"
```

Se faltar algum pacote, instalar. O yt-dlp daqui é a biblioteca de Python que o script importa, por isso vem pelo pip; o programa `yt-dlp` que a `/assistir-video` e a `/aprender-curso` chamam vem pelo winget no Windows. Os dois convivem.

Windows:
```bash
python -m pip install faster-whisper yt-dlp
```

Mac e Linux:
```bash
pip3 install faster-whisper yt-dlp
```

**Aviso:** na primeira transcrição o faster-whisper baixa um modelo do Whisper de uns 1,5 GB. É normal e só acontece uma vez.

### Passo 3: conferir o ffmpeg

```bash
which ffmpeg && ffmpeg -version | head -1 || echo "MISSING: ffmpeg"
```

Se não tiver:
- **Mac:** `brew install ffmpeg`
- **Linux:** `sudo apt install ffmpeg`
- **Windows:** `winget install --id Gyan.FFmpeg -e --source winget --accept-source-agreements --accept-package-agreements --disable-interactivity`, depois feche todas as janelas do VS Code e abra de novo

### Passo 4: conferir o script

Windows:
```bash
python -c "import faster_whisper; import yt_dlp; print('All Python dependencies OK')"
```

Mac e Linux:
```bash
python3 -c "import faster_whisper; import yt_dlp; print('All Python dependencies OK')"
```

### Passo 5: mostrar o resultado

Mostrar um resumo assim:

```
Transcrever vídeo: resumo da instalação

  Python:         [OK/FALTANDO] (versão)
  faster-whisper: [OK/FALTANDO]
  yt-dlp:         [OK/FALTANDO]
  ffmpeg:         [OK/FALTANDO]
  Script:         [OK/FALTANDO]
  Situação:       [Pronto pra usar / X itens precisam de atenção]

Teste: /transcribe https://youtube.com/watch?v=example
```

Se alguma coisa falhou, explicar em poucas palavras o que ainda falta consertar pra skill funcionar.

---

## Como chamar

`/transcribe <link>`: o link vai como argumento da skill.

No lugar do link também vale o caminho de um arquivo de vídeo ou áudio que está no computador (por exemplo `dados/aula.mp4`, a partir da pasta do projeto). Nesse caso o script não baixa nada: transcreve o arquivo direto.

Se não veio link nem arquivo, pedir pro usuário.

## Fluxo

1. **Se for link do YouTube**, tentar antes a legenda pronta, que sai na hora e de graça:

```bash
yt-dlp --skip-download --write-auto-subs --write-subs --sub-langs "pt.*" --sub-format vtt "<url>"
```

Se o vídeo tiver legenda, entregar o texto dela e parar aqui. Se não tiver legenda, ou se o YouTube responder com erro `429` (bloqueio por excesso de pedidos), seguir pros passos abaixo.

2. Perguntar ao usuário: "Quer com a marcação de tempo de cada trecho?" (Sim / Não)
3. Rodar o script de transcrição.

Windows:
```bash
python <skill_path>/scripts/transcribe_url.py "<url>" [--timestamps]
```

Mac e Linux:
```bash
python3 <skill_path>/scripts/transcribe_url.py "<url>" [--timestamps]
```

No lugar de `"<url>"` pode ir o caminho do arquivo no computador, também entre aspas. Acrescentar `--timestamps` se o usuário disse sim.

4. Mostrar a transcrição pro usuário. O script escreve o texto direto na saída do terminal.

## Erro de dependência faltando

Se o script parar dizendo que falta alguma dependência, passar pro usuário as instruções de instalação que ele mostra. O script sempre escreve o jeito do Mac e Linux; no Windows, trocar `pip3 install` por `python -m pip install`.

Windows:
```bash
python -m pip install yt-dlp faster-whisper
```

Mac e Linux:
```bash
pip3 install yt-dlp faster-whisper
brew install ffmpeg  # macOS
```

## Opções

- `--model <tamanho>`: tamanho do modelo do Whisper (padrão: `medium`). `small` é mais rápido e erra mais; `large-v3` é o mais preciso e o mais lento.
- `--timestamps`: põe a marcação de tempo `[M:SS]` na frente de cada trecho.
