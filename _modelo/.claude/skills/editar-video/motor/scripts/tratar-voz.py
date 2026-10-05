"""
Voz crua -> voz tratada (roda antes do Remotion). Cadeia: corte de grave -> DeepFilterNet 3 (tira ruido, local e
gratis) -> gate (corta a cauda do eco do comodo) -> EQ subtrativo -> compressor -> de-esser -> EQ de presenca ->
limiter. Valores medidos em teste A/B/C de voz.

O DeepFilterNet e opcional. O caminho do programa vem da variavel DEEP_FILTER (o orquestrador do kit define a
partir da pasta de ferramentas do video). Sem a variavel, ou com o arquivo ausente, cai no afftdn do ffmpeg e avisa.

Uso: tratar-voz.py ENTRADA.(mp4|wav) SAIDA.wav [--sem-gate] [--gate-db -32] [--sem-dfn]
"""
import argparse, os, shutil, subprocess, sys, tempfile

DF = os.environ.get("DEEP_FILTER", "")

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0: sys.exit(f"falhou: {' '.join(cmd)}\n{r.stderr[-2000:]}")
    return r

def main():
    p = argparse.ArgumentParser()
    p.add_argument("entrada"); p.add_argument("saida")
    p.add_argument("--sem-gate", action="store_true")
    p.add_argument("--gate-db", type=float, default=-32.0, help="limiar do gate em dBFS (rms)")
    p.add_argument("--sem-dfn", action="store_true", help="usa afftdn no lugar do DeepFilterNet")
    a = p.parse_args()
    os.makedirs(os.path.dirname(a.saida) or ".", exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="voz-")
    try:
        bruto = os.path.join(tmp, "bruto.wav")
        # 1. mono 48 kHz + corte de grave (ruido de ventilador/PC abaixo de 90 Hz) antes do denoise
        run(["ffmpeg", "-y", "-v", "error", "-i", a.entrada, "-vn", "-ac", "1", "-ar", "48000",
             "-af", "highpass=f=90:p=2", "-c:a", "pcm_s16le", bruto])
        # 2. denoise
        if a.sem_dfn or not (DF and os.path.exists(DF)):
            if not a.sem_dfn: print("aviso: DEEP_FILTER nao definido ou arquivo ausente, usando afftdn")
            limpo = os.path.join(tmp, "limpo.wav")
            run(["ffmpeg", "-y", "-v", "error", "-i", bruto, "-af", "afftdn=nr=14:nf=-42:tn=1", limpo])
        else:
            run([DF, "-o", os.path.join(tmp, "df"), "-D", bruto])
            limpo = os.path.join(tmp, "df", "bruto.wav")
        # 3. gate (cauda do eco) + EQ + compressor + de-esser + presenca + limiter
        thr = 10 ** (a.gate_db / 20)
        gate = "" if a.sem_gate else f"agate=threshold={thr:.5f}:ratio=4:attack=4:release=140:range=0.025:knee=3:detection=rms,"
        cadeia = (gate +
            "equalizer=f=250:t=q:w=1.5:g=-3,equalizer=f=500:t=q:w=2:g=-2,"
            "acompressor=threshold=0.1:ratio=3:attack=10:release=150:makeup=2:knee=4,"
            "deesser=i=0.3:m=0.5:f=0.5,"
            "equalizer=f=3500:t=q:w=1:g=2.5,equalizer=f=9000:t=q:w=0.7:g=1.5,"
            "alimiter=limit=0.891:attack=5:release=50:level=false")
        run(["ffmpeg", "-y", "-v", "error", "-i", limpo, "-af", cadeia, "-ar", "48000", "-c:a", "pcm_s24le", a.saida])
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print("ok:", a.saida)

if __name__ == "__main__":
    main()
