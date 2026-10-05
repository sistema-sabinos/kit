"""Estica (ou encolhe) o audio de um bruto de celular ate fechar no tamanho do video. Celular que perde quadro deixa
o audio mais curto ou mais longo que a imagem, e a boca escorrega da voz ao longo da gravacao.
atempo = duracao do audio / duracao do video. Video copiado sem recodificar.
Uso: sincronizar-bruto.py ENTRADA.mp4 SAIDA.mp4"""
import os, subprocess, sys

def dur(arq, sel):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", sel, "-show_entries",
                                   "stream=start_time,duration", "-of", "csv=p=0", arq], text=True).strip().splitlines()[0].split(",")
    return float(out[0]), float(out[1])

def main():
    if len(sys.argv) != 3: sys.exit("uso: sincronizar-bruto.py ENTRADA.mp4 SAIDA.mp4")
    ent, sai = sys.argv[1], sys.argv[2]
    os.makedirs(os.path.dirname(sai) or ".", exist_ok=True)
    v0, vd = dur(ent, "v:0")
    a0, ad = dur(ent, "a:0")
    tempo = ad / (v0 + vd - a0)
    print(f"video {v0:.3f}+{vd:.3f}  audio {a0:.3f}+{ad:.3f}  atempo {tempo:.6f}")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", ent, "-map", "0:v", "-map", "0:a", "-c:v", "copy",
                    "-af", f"atempo={tempo:.6f}", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", sai], check=True)
    print(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,start_time,duration",
                                   "-of", "compact", sai], text=True))

if __name__ == "__main__":
    main()
