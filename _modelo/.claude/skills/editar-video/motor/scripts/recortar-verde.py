"""Recorte da pessoa de um bruto em fundo verde (take corrido, a pessoa ja vem no enquadramento final): o video
inteiro vira pessoa.webm com alfa (diferenca de verde: G menos o maior entre R e B, a conta do chroma.py).
Saidas na pasta --saida-dir: pessoa.webm (VP9 com alfa), voz.wav (48 kHz mono, nivelada, so se o bruto tem audio) e
bruto-pad.mp4 (bruto a 30 fps, pro verificar-video.py). Com --filtro-pessoa passa o filtro_pessoa.py em cada quadro.

Uso: recortar-verde.py --bruto BRUTO.mp4 --saida-dir PASTA [--lo 0.10] [--hi 0.30] [--filtro-pessoa] [--preview SEG]
--lo e --hi: limites da diferenca de verde (abaixo de lo e pessoa, acima de hi e fundo). Verde muito saturado aceita
valores maiores. --preview SEG nao renderiza: grava so o quadro desse segundo, sobre cinza escuro, em PASTA/recorte.jpg.
"""
import argparse, subprocess, sys
from pathlib import Path
import numpy as np
import cv2

FPS = 30
LUFS_VOZ = -15.7   # nivel da voz que vai pro render; o mix-final.py e o loudness.py cuidam do master

def sonda(arq, sel, campos):
    o = subprocess.run(["ffprobe", "-v", "error", "-select_streams", sel, "-show_entries", f"stream={campos}", "-of", "csv=p=0", arq],
                       capture_output=True, text=True).stdout.strip()
    return o.splitlines()[0].strip(",").split(",") if o else None

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--bruto", required=True); p.add_argument("--saida-dir", required=True)
    p.add_argument("--lo", type=float, default=0.10); p.add_argument("--hi", type=float, default=0.30)
    p.add_argument("--filtro-pessoa", action="store_true", help="aplica o filtro_pessoa.py (valores neutros, ajustaveis)")
    p.add_argument("--preview", type=float, default=None, help="so grava o quadro desse segundo")
    a = p.parse_args()
    LO, HI = a.lo, a.hi
    saida = Path(a.saida_dir); saida.mkdir(parents=True, exist_ok=True)
    dim = sonda(a.bruto, "v:0", "width,height")
    if not dim: sys.exit(f"nao achei video em {a.bruto}")
    W, H = int(dim[0]), int(dim[1])
    filtro = None
    if a.filtro_pessoa:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from filtro_pessoa import aplicar as filtro

    def alfa(rgb):
        f = rgb.astype(np.float32) / 255
        r, g, b = f[..., 0], f[..., 1], f[..., 2]
        al = 1 - np.clip((g - np.maximum(r, b) - LO) / (HI - LO), 0, 1)
        al = cv2.GaussianBlur(al, (0, 0), 0.8)
        al = np.clip((al - 0.05) / 0.9, 0, 1)
        g2 = np.minimum(g, np.maximum(r, b) * 1.02)          # despill
        cor = np.dstack([r, g2, b])
        if filtro: cor = filtro(cor, al)
        return (np.dstack([cor, al]) * 255).astype(np.uint8)

    if a.preview is not None:
        raw = subprocess.check_output(["ffmpeg", "-v", "error", "-ss", str(a.preview), "-i", a.bruto, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"])
        rgba = alfa(np.frombuffer(raw, np.uint8).reshape(H, W, 3)).astype(np.float32) / 255
        comp = rgba[..., :3] * rgba[..., 3:] + np.array([0.12, 0.13, 0.19]) * (1 - rgba[..., 3:])
        cv2.imwrite(str(saida / "recorte.jpg"), (comp[..., ::-1] * 255).astype(np.uint8))
        print("previa:", saida / "recorte.jpg")
        return

    src = subprocess.Popen(["ffmpeg", "-v", "error", "-i", a.bruto, "-vf", f"fps={FPS}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
    enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "24", "-row-mt", "1", "-cpu-used", "4",
                            "-auto-alt-ref", "0", str(saida / "pessoa.webm")], stdin=subprocess.PIPE)
    n = 0
    while True:
        b = src.stdout.read(W * H * 3)
        if len(b) < W * H * 3: break
        enc.stdin.write(alfa(np.frombuffer(b, np.uint8).reshape(H, W, 3)).tobytes()); n += 1
    enc.stdin.close(); enc.wait(); src.wait()
    if enc.returncode != 0 or n == 0: sys.exit("o recorte nao gerou quadros; confira o bruto")

    dur = n / FPS
    if sonda(a.bruto, "a:0", "codec_type"):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.bruto, "-vn", "-af", f"loudnorm=I={LUFS_VOZ}:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "1",
                        "-t", f"{dur:.4f}", "-c:a", "pcm_s16le", str(saida / "voz.wav")], check=True)
    else:
        print("aviso: o bruto nao tem audio, voz.wav nao foi gerado")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.bruto, "-vf", f"fps={FPS}", "-t", f"{dur:.4f}", "-c:v", "libx264", "-crf", "18",
                    "-preset", "fast", "-c:a", "aac", "-b:a", "192k", str(saida / "bruto-pad.mp4")], check=True)
    print(f"{n} quadros = {dur:.3f} s")

if __name__ == "__main__":
    main()
