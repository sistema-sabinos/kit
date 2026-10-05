"""Transcreve videos ja baixados, no computador e de graca.

Usa o mesmo motor da /transcribe (faster-whisper); a /transcribe baixa por URL, e aqui o video ja esta
no disco. Pula o que ja tem transcricao.

Uso (da raiz do projeto):
  python .claude/skills/pauta/scripts/transcrever.py <perfil> [--modelo small]
      todos os videos de inteligencia/base-ideias/<perfil>/videos/ -> .../transcricoes/<codigo>.txt
  python .claude/skills/pauta/scripts/transcrever.py <arquivo.mp4> [--modelo small]
      um video so -> o mesmo nome com .txt, ao lado dele
"""
import sys
from pathlib import Path


def pares(alvo):
    if alvo.lower().endswith((".mp4", ".mov")):
        v = Path(alvo)
        if not v.exists():
            sys.exit(f"nao achei {v}")
        return [(v, v.with_suffix(".txt"))]
    pasta = Path("inteligencia") / "base-ideias" / alvo.lstrip("@")
    videos = sorted((pasta / "videos").glob("*.mp4"))
    if not videos:
        sys.exit(f"nenhum video em {pasta / 'videos'}: rodar a coleta antes")
    return [(v, pasta / "transcricoes" / (v.stem + ".txt")) for v in videos]


def main():
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        return
    modelo = args[args.index("--modelo") + 1] if "--modelo" in args else "small"
    lista = pares(args[0])
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.exit("faster-whisper nao instalado: seguir a instalacao da /transcribe (pip install faster-whisper)")
    whisper = None
    for video, alvo in lista:
        if alvo.exists():
            continue
        alvo.parent.mkdir(parents=True, exist_ok=True)
        whisper = whisper or WhisperModel(modelo, device="auto", compute_type="int8")
        segmentos, _ = whisper.transcribe(str(video), language="pt")
        texto = " ".join(s.text.strip() for s in segmentos).strip()
        alvo.write_text(texto or "sem fala", encoding="utf-8")
        print(f"ok: {alvo}")


if __name__ == "__main__":
    main()
