"""Gate de loudness: passa ou falha contra o alvo das plataformas, com o conserto pronto.

Uso:
    loudness.py producao/<slug>/final/<arquivo>.mp4
    loudness.py video.mp4 --alvo -14 --pico -1
(quem chama e o orquestrador do kit, que escolhe o Python da maquina)

Por que existe: o `mix-final.py` já mira -14 LUFS e -1 dBTP em 2 passes, mas nada conferia o
arquivo depois. Quando o SFX entra alto ou a música sobe, o master sai fora e ninguém vê.
Este script mede o arquivo final e diz o que fazer.

As três redes normalizam na reprodução perto de -14 LUFS com teto -1 dBTP, e só o YouTube
publica o número. Master mais quente que isso não fica mais alto, só é atenuado e perde
dinâmica.

Saída: código 0 quando passa, 1 quando falha.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ALVO_LUFS = -14.0
ALVO_TP = -1.0
TOLERANCIA_LUFS = 1.0   # ±1 LU é inaudível e não vale rerender
TOLERANCIA_TP = 0.1     # o loudnorm entrega -0,97 mirando -1,0; isso é arredondamento, não erro
LRA_MIN, LRA_MAX = 4.0, 9.0  # faixa sugerida pra vídeo curto falado


def medir(video: Path) -> dict:
    """Roda o loudnorm em modo de análise e devolve o JSON dele."""
    proc = subprocess.run(
        ["ffmpeg", "-nostdin", "-hide_banner", "-i", str(video),
         "-af", "loudnorm=I=-14:TP=-1:LRA=11:print_format=json",
         "-f", "null", "-"],
        capture_output=True, text=True,
    )
    bruto = proc.stderr
    achado = re.findall(r"\{[^{}]*\"input_i\"[^{}]*\}", bruto, re.S)
    if not achado:
        raise SystemExit("o ffmpeg não devolveu medida de loudness:\n" + bruto[-1200:])
    return json.loads(achado[-1])


def tem_audio(video: Path) -> bool:
    saida = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries",
         "stream=codec_type", "-of", "csv=p=0", str(video)],
        capture_output=True, text=True,
    ).stdout.strip()
    return bool(saida)


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass
    ap = argparse.ArgumentParser(description="Confere o loudness do arquivo final.")
    ap.add_argument("video", type=Path)
    ap.add_argument("--alvo", type=float, default=ALVO_LUFS)
    ap.add_argument("--pico", type=float, default=ALVO_TP)
    ap.add_argument("--tolerancia", type=float, default=TOLERANCIA_LUFS)
    args = ap.parse_args()

    if not args.video.exists():
        print(f"não achei {args.video}")
        return 2
    if not tem_audio(args.video):
        print(f"{args.video.name} não tem faixa de áudio")
        return 2

    m = medir(args.video)
    i = float(m["input_i"])
    tp = float(m["input_tp"])
    lra = float(m["input_lra"])
    limiar = float(m["input_thresh"])

    print(f"arquivo   {args.video.name}")
    print(f"alvo      {args.alvo:g} LUFS, pico {args.pico:g} dBTP, LRA entre {LRA_MIN:g} e {LRA_MAX:g}\n")
    print(f"  integrado   {i:>7.1f} LUFS")
    print(f"  pico real   {tp:>7.2f} dBTP")
    print(f"  faixa (LRA) {lra:>7.1f} LU")
    print(f"  limiar      {limiar:>7.1f} LUFS\n")

    problemas = []
    if abs(i - args.alvo) > args.tolerancia:
        lado = "alto" if i > args.alvo else "baixo"
        problemas.append(f"LOUDNESS  {i:.1f} LUFS está {abs(i - args.alvo):.1f} LU {lado} demais")
    if tp > args.pico + TOLERANCIA_TP:
        problemas.append(f"PICO      {tp:.2f} dBTP passa do teto de {args.pico:g}. "
                         f"A plataforma vai recomprimir e distorcer")
    avisos = []
    if lra < LRA_MIN:
        avisos.append(f"LRA {lra:.1f} LU, abaixo da faixa sugerida de {LRA_MIN:g} a {LRA_MAX:g}. "
                      f"A cadeia está comprimindo forte. Isso ajuda no alto-falante de celular, "
                      f"mas apaga a diferença entre a palavra marcada e o resto")
    elif lra > LRA_MAX:
        avisos.append(f"LRA {lra:.1f} LU é largo pra vídeo curto. Trecho baixo some no celular")

    if not problemas:
        print("PASSOU." + (" Com aviso:" if avisos else ""))
        for a in avisos:
            print("  " + a)
        return 0

    print("REPROVOU")
    for p in problemas:
        print("  " + p)
    for a in avisos:
        print("  aviso: " + a)

    print("\n  conserto em 1 passe, sem mexer no vídeo:")
    print(f"    ffmpeg -i \"{args.video.name}\" -af \"loudnorm=I={args.alvo:g}:TP={args.pico:g}:LRA=11:"
          f"measured_I={i}:measured_TP={tp}:measured_LRA={lra}:measured_thresh={limiar}:linear=true\" \\")
    print(f"      -c:v copy -c:a aac -b:a 192k -ar 48000 \"{args.video.stem}-loud.mp4\"")
    print("\n  se o pico for o problema, olhe antes se um SFX entrou alto demais:")
    print("  a régua do catalogo-sfx é 6 a 9 dB abaixo da voz, e o mix-final já mira isso.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
