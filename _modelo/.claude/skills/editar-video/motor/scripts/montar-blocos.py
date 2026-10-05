"""
Monta a fala em blocos (corte seco) a partir da tabela de trechos escolhidos:
cada trecho entra com 0,20 s antes e 0,15 s depois, saida 1080x1920 a 30 fps (o bruto 4K vertical e reduzido),
audio 48 kHz. Depois mede os cortes reais por deteccao de cena (a soma dos tempos chega a atrasar 0,8 s).

Uso: node .claude/skills/editar-video/scripts/py.mjs montar-blocos.py BRUTO.mp4 SAIDA.mp4 INI:FIM [INI:FIM ...] [--antes 0.20] [--depois 0.15]
Ex.: node .claude/skills/editar-video/scripts/py.mjs montar-blocos.py producao/<slug>/bruto/fala.mp4 producao/<slug>/trab/fala-montada.mp4 13.80:18.15 21.25:22.40
Imprime a duracao e os cortes medidos (select=gt(scene,0.004)).
"""
import argparse, os, subprocess, sys, re

def main():
    p = argparse.ArgumentParser()
    p.add_argument("bruto"); p.add_argument("saida"); p.add_argument("trechos", nargs="+")
    p.add_argument("--antes", type=float, default=0.20); p.add_argument("--depois", type=float, default=0.15)
    a = p.parse_args()
    os.makedirs(os.path.dirname(a.saida) or ".", exist_ok=True)
    partes = []
    for t in a.trechos:
        i, f = (float(x) for x in t.split(":"))
        partes.append((max(0.0, i - a.antes), f + a.depois))
    fc = []
    for k, (i, f) in enumerate(partes):
        fc.append(f"[0:v]trim=start={i:.3f}:end={f:.3f},setpts=PTS-STARTPTS,scale=1080:1920:flags=lanczos,fps=30[v{k}];"
                  f"[0:a]atrim=start={i:.3f}:end={f:.3f},asetpts=PTS-STARTPTS[a{k}]")
    fc.append("".join(f"[v{k}][a{k}]" for k in range(len(partes))) + f"concat=n={len(partes)}:v=1:a=1[v][a]")
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", a.bruto, "-filter_complex", ";".join(fc), "-map", "[v]", "-map", "[a]",
           "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", a.saida]
    r = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
    if r.returncode != 0: sys.exit(r.stderr[-2000:])
    dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", a.saida], capture_output=True, text=True).stdout.strip()
    print(f"montagem: {a.saida} ({float(dur):.2f} s), {len(partes)} blocos, fins previstos: " + " ".join(f"{sum(f - i for i, f in partes[:k + 1]):.2f}" for k in range(len(partes))))
    # o limiar 0,004 sozinho inunda (a pessoa se mexe); o corte real e o maior score de cena a +-0,35 s do fim previsto
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", a.saida, "-vf", "select='gt(scene,0.004)',metadata=print", "-f", "null", "-"], capture_output=True, text=True, errors="replace")
    pares = {float(t): float(sc) for t, sc in re.findall(r"pts_time:([0-9.]+)\n.*?lavfi\.scene_score=([0-9.]+)", r.stderr)}
    fins = [sum(f - i for i, f in partes[:k + 1]) for k in range(len(partes) - 1)]
    cortes = []
    for fim in fins:
        cand = [(t, sc) for t, sc in pares.items() if abs(t - fim) <= 0.35]
        cortes.append(max(cand, key=lambda x: x[1])[0] if cand else fim)
    print("cortes medidos por cena: " + " ".join(f"{c:.2f}" for c in cortes))

if __name__ == "__main__":
    main()
