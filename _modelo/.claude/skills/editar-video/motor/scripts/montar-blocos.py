"""
Monta a fala em blocos (corte seco) a partir da tabela de trechos escolhidos:
cada trecho entra com 0,20 s antes e 0,15 s depois, saida 1080x1920 a 30 fps (o bruto 4K vertical e reduzido),
audio 48 kHz. Depois mede os cortes reais por deteccao de cena (a soma dos tempos chega a atrasar 0,8 s).
Bruto fora de 9:16 (deitado, quadrado) e cortado no centro, com aviso; a medida ja conta a rotacao do celular.
Bruto HDR (HLG ou PQ, comum em celular) e convertido pra cor normal (bt709); sem o filtro zscale no ffmpeg, so
remarca a cor e avisa.

Uso: node .claude/skills/editar-video/scripts/py.mjs montar-blocos.py BRUTO.mp4 SAIDA.mp4 INI:FIM [INI:FIM ...] [--antes 0.20] [--depois 0.15]
Ex.: node .claude/skills/editar-video/scripts/py.mjs montar-blocos.py producao/<slug>/bruto/fala.mp4 producao/<slug>/trab/fala-montada.mp4 13.80:18.15 21.25:22.40
Imprime a duracao e os cortes medidos (select=gt(scene,0.004)).
"""
import argparse, json, os, subprocess, sys, re

HDR = {"arib-std-b67": "HLG", "smpte2084": "PQ"}
TONEMAP = "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p"
REMARCAR = "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709"

def sondar(bruto):
    o = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height,color_transfer:stream_side_data=rotation", "-of", "json", bruto],
                       capture_output=True, text=True).stdout
    s = (json.loads(o or "{}").get("streams") or [None])[0]
    if not s: sys.exit(f"nao achei video em {bruto}")
    w, h = int(s["width"]), int(s["height"])
    rot = next((int(d["rotation"]) for d in s.get("side_data_list", []) if "rotation" in d), 0)
    if abs(rot) % 180 == 90: w, h = h, w   # o ffmpeg gira o quadro antes do filtro; mede como a tela mostra
    return w, h, s.get("color_transfer", "")

def tem_zscale():
    if os.environ.get("EDITAR_VIDEO_SEM_ZSCALE"): return False   # so pro teste da recaida
    f = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True).stdout
    return re.search(r"^\s*\S+\s+zscale\s", f, re.M) is not None

def preparo(bruto):
    w, h, trc = sondar(bruto)
    pre = []
    if abs(w / h - 9 / 16) > 0.01:
        pre.append("crop=ih*9/16:ih" if w / h > 9 / 16 else "crop=iw:iw*16/9")
        print(f"aviso: o bruto e {w}x{h} (fora de 9:16); cortei o centro pra ficar vertical. Abra um quadro e confira se a pessoa ficou inteira.")
    pre.append("scale=1080:1920:flags=lanczos,setsar=1")
    if trc in HDR:
        if tem_zscale():
            pre.append(TONEMAP)
            print(f"aviso: o bruto e HDR ({HDR[trc]}); convertido pra cor normal (bt709).")
        else:
            pre.append(REMARCAR)
            print(f"aviso: o bruto e HDR ({HDR[trc]}) e este ffmpeg nao tem o filtro zscale; a cor pode sair lavada. Rode /configurar-video ou peca pro aluno desligar o Video HDR (Ajustes > Camera > Gravar Video).")
    return ",".join(pre)

def main():
    p = argparse.ArgumentParser()
    p.add_argument("bruto"); p.add_argument("saida"); p.add_argument("trechos", nargs="+")
    p.add_argument("--antes", type=float, default=0.20); p.add_argument("--depois", type=float, default=0.15)
    a = p.parse_args()
    os.makedirs(os.path.dirname(a.saida) or ".", exist_ok=True)
    pre = preparo(a.bruto)
    partes = []
    for t in a.trechos:
        i, f = (float(x) for x in t.split(":"))
        partes.append((max(0.0, i - a.antes), f + a.depois))
    fc = []
    for k, (i, f) in enumerate(partes):
        fc.append(f"[0:v]trim=start={i:.3f}:end={f:.3f},setpts=PTS-STARTPTS,{pre},fps=30[v{k}];"
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
