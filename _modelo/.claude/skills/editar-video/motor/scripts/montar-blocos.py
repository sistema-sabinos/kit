"""
Monta a fala em blocos (corte seco) a partir dos trechos escolhidos na decupagem (trab/decupagem.md, passo 3.2b):
cada INI:FIM e o corte final, sem folga somada (a decupagem ja traz a folga, acertada pela borda que a IA viu),
levado ao quadro mais perto (1/30 s, imagem e voz no mesmo ponto), saida 1080x1920 a 30 fps (o bruto 4K vertical e reduzido), audio 48 kHz. Depois mede os cortes reais por deteccao
de cena (a soma dos tempos chega a atrasar 0,8 s).
Recusa sem a decupagem, com trecho que falta nela ou sobra nela, com motivo vazio ou faltando assunto, gancho e
arco, e com trechos que se sobrepoem (repetiriam fala).
Bruto fora de 9:16 (deitado, quadrado) e cortado no centro, com aviso; a medida ja conta a rotacao do celular.
Bruto HDR (HLG ou PQ, comum em celular) e convertido pra cor normal (bt709); sem o filtro zscale no ffmpeg, so
remarca a cor e avisa.
Cada bloco de audio entra e sai com rampa de 10 ms (sem a rampa a emenda estala). Depois de montar, confere cada
emenda no bruto (emendas.py: pulo do rosto, degrau de ruido e voz na borda) e grava emendas.md ao lado da saida.

Uso: node .claude/skills/editar-video/scripts/py.mjs montar-blocos.py BRUTO.mp4 SAIDA.mp4 INI:FIM [INI:FIM ...] --decupagem DECUPAGEM.md
Ex.: node .claude/skills/editar-video/scripts/py.mjs montar-blocos.py producao/<slug>/bruto/fala.mp4 producao/<slug>/trab/fala-montada.mp4 13.60:18.30 21.05:22.55 --decupagem producao/<slug>/trab/decupagem.md
Imprime a duracao e os cortes medidos (select=gt(scene,0.004)).
"""
import argparse, json, os, subprocess, sys, re

HDR = {"arib-std-b67": "HLG", "smpte2084": "PQ"}
TONEMAP = "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p"
REMARCAR = "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709"
RAMPA = 0.01

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

def conferir_decupagem(texto, trechos):
    """Lista de erros: secoes de assunto, gancho e arco com texto, e a tabela de cortes com uma linha "sim" por
    trecho passado (mesmo INI:FIM, motivo com texto) e nenhum "sim" a mais."""
    erros = []
    secoes = {m.group(1).strip().lower(): m.group(2).strip() for m in re.finditer(r"^## +([^\n]+)\n(.*?)(?=^## |\Z)", texto, re.M | re.S)}
    for s in ("assunto", "gancho", "arco"):
        if not secoes.get(s): erros.append(f"falta a secao '## {s.capitalize()}' com texto")
    sim = {}
    for l in texto.splitlines():
        c = [x.strip() for x in l.strip().strip("|").split("|")]
        if len(c) >= 3 and re.fullmatch(r"[0-9.]+:[0-9.]+", c[0]) and c[1].lower() == "sim": sim[c[0]] = c[2]
    for t in trechos:
        if t not in sim: erros.append(f"o trecho {t} nao esta na tabela de cortes como 'sim'")
        elif len(sim[t].split()) < 2: erros.append(f"o trecho {t} esta sem motivo na tabela de cortes")
    for t in sim:
        if t not in trechos: erros.append(f"a tabela de cortes marca {t} como 'sim', mas ele nao foi passado")
    return erros

def main():
    p = argparse.ArgumentParser()
    p.add_argument("bruto"); p.add_argument("saida"); p.add_argument("trechos", nargs="+")
    p.add_argument("--decupagem", required=True, help="trab/decupagem.md do passo 3.2b")
    a = p.parse_args()
    if not os.path.isfile(a.decupagem): sys.exit(f"nao achei a decupagem {a.decupagem}: assista o cru (passo 3.2b) antes de montar.")
    erros = conferir_decupagem(open(a.decupagem, encoding="utf-8").read(), a.trechos)
    partes = []
    for t in a.trechos:
        i, f = (float(x) for x in t.split(":"))
        if f <= i: erros.append(f"o trecho {t} termina antes de comecar")
        partes.append((max(0.0, i), f))
    ordem = sorted(partes)
    for (i1, f1), (i2, f2) in zip(ordem, ordem[1:]):
        if i2 < f1: erros.append(f"os trechos {i1:.2f}:{f1:.2f} e {i2:.2f}:{f2:.2f} se sobrepoem e repetiriam fala")
    if erros: sys.exit("decupagem recusada:\n- " + "\n- ".join(erros))
    os.makedirs(os.path.dirname(a.saida) or ".", exist_ok=True)
    pre = preparo(a.bruto)
    # corte na grade de 30 quadros por segundo do cru, video e audio no mesmo limite: cortar o video por segundo zera
    # no primeiro quadro depois do corte e o audio no corte exato, e no cru de taxa variavel do celular (comeco fora
    # do zero, quadro perdido) a imagem saia ate um quadro mais tarde que a voz e a montagem nascia com buraco
    partes = [(round(i * 30) / 30, round(f * 30) / 30) for i, f in partes]
    fc = []
    for k, (i, f) in enumerate(partes):
        fc.append(f"[0:v]fps=30:start_time=0,trim=start_frame={round(i * 30)}:end_frame={round(f * 30)},setpts=PTS-STARTPTS,{pre}[v{k}];"
                  f"[0:a]atrim=start={i:.6f}:end={f:.6f},asetpts=PTS-STARTPTS,"
                  f"afade=t=in:d={RAMPA}:curve=tri,afade=t=out:st={max(0.0, f - i - RAMPA):.3f}:d={RAMPA}:curve=tri[a{k}]")
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
    if len(partes) > 1:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import emendas
        linhas = emendas.medir(a.bruto, partes)
        destino = os.path.join(os.path.dirname(os.path.abspath(a.saida)), "emendas.md")
        open(destino, "w", encoding="utf-8").write("# Emendas da fala montada\n\n" + emendas.tabela(linhas) + "\n")
        com = [l for l in linhas if emendas.avisos(l)]
        print(f"emendas: {len(linhas)} conferidas, {len(com)} com aviso, em {destino}")

if __name__ == "__main__":
    main()
