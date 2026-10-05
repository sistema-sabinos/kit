"""
Acha os blocos de fala num bruto gravado em blocos (2 s de silencio entre eles) e transcreve cada um com
whisper.cpp pra confirmar o texto. Timestamp por token do whisper nao serve com pausa longa; o que funciona e
envelope RMS (janela 50 ms, limiar 12 dB acima do piso, gap minimo 0,45 s) e transcricao trecho a trecho.

A pasta do whisper vem da variavel WHISPER_DIR (o orquestrador do kit define a partir da pasta de ferramentas
do video; sem ela o script para dizendo o que falta). O nome do programa vem de --whisper-bin (padrao "main",
o nome do whisper.cpp 1.5.5) e e procurado dentro da WHISPER_DIR, sem extensao: o sistema completa.

Uso: blocos.py BRUTO.mp4 SAIDA.md [--modelo medium] [--limiar-db 12] [--gap 0.45] [--min 0.5] [--whisper-bin main]
Sai uma tabela markdown (n, inicio, fim, duracao, texto do whisper) pra virar o cortes.md.
"""
import argparse, os, shutil, subprocess, sys, tempfile

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0: sys.exit(f"falhou: {' '.join(cmd)}\n{r.stderr[-2000:]}")
    return r.stdout

def main():
    p = argparse.ArgumentParser()
    p.add_argument("bruto"); p.add_argument("saida")
    p.add_argument("--modelo", default="medium")
    p.add_argument("--limiar-db", type=float, default=12.0)
    p.add_argument("--gap", type=float, default=0.45)
    p.add_argument("--min", type=float, default=0.5, help="duracao minima do trecho em s")
    p.add_argument("--whisper-bin", default="main", help="nome do programa do whisper.cpp dentro da WHISPER_DIR")
    a = p.parse_args()
    os.makedirs(os.path.dirname(a.saida) or ".", exist_ok=True)
    whisper = os.environ.get("WHISPER_DIR")
    if not whisper or not os.path.isdir(whisper):
        sys.exit("falta a variavel WHISPER_DIR apontando pra pasta do whisper.cpp. Rode a instalacao do whisper do kit e tente de novo.")
    prog = shutil.which(a.whisper_bin, path=whisper)
    modelo = os.path.join(whisper, f"ggml-{a.modelo}.bin")
    if not prog or not os.path.exists(modelo):
        sys.exit(f"nao achei o programa '{a.whisper_bin}' ou o modelo {modelo} dentro da WHISPER_DIR. Rode a instalacao do whisper do kit.")
    import numpy as np
    from scipy.io import wavfile
    tmp = tempfile.mkdtemp(prefix="blocos-")
    try:
        wav = os.path.join(tmp, "a.wav")
        run(["ffmpeg", "-y", "-v", "error", "-i", a.bruto, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav])
        sr, x = wavfile.read(wav)
        x = x.astype(np.float32) / 32768.0
        jan = int(sr * 0.05)
        n = len(x) // jan
        rms = np.sqrt(np.mean(x[: n * jan].reshape(n, jan) ** 2, axis=1) + 1e-12)
        db = 20 * np.log10(rms)
        piso = np.percentile(db, 10)
        ativo = db > piso + a.limiar_db
        # junta janelas ativas com gap menor que a.gap
        trechos, ini, ult = [], None, None
        for i, v in enumerate(ativo):
            t = i * 0.05
            if v:
                if ini is None: ini = t
                ult = t + 0.05
            elif ini is not None and t - ult >= a.gap:
                trechos.append((ini, ult)); ini = None
        if ini is not None: trechos.append((ini, ult))
        trechos = [(i, f) for i, f in trechos if f - i >= a.min]
        print(f"piso {piso:.1f} dB, {len(trechos)} trechos", file=sys.stderr)
        linhas = ["| n | inicio (s) | fim (s) | dur (s) | whisper |", "|---|---|---|---|---|"]
        for k, (i, f) in enumerate(trechos, 1):
            seg = os.path.join(tmp, f"seg{k}.wav")
            run(["ffmpeg", "-y", "-v", "error", "-i", wav, "-ss", f"{max(0, i - 0.2):.2f}", "-to", f"{f + 0.15:.2f}", seg])
            txt = run([prog, "-m", modelo, "-l", "pt", "-nt", "-np", "-f", seg])
            txt = " ".join(txt.split())
            linhas.append(f"| {k} | {i:.2f} | {f:.2f} | {f - i:.2f} | {txt} |")
            print(linhas[-1], file=sys.stderr)
        open(a.saida, "w", encoding="utf-8").write("\n".join(linhas) + "\n")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

if __name__ == "__main__":
    main()
