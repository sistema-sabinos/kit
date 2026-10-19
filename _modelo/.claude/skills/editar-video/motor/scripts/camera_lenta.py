"""Camera lenta de palavra: logo depois de a pessoa falar um trecho curto (uma palavra, no maximo duas ou tres), o
mesmo trecho volta mais devagar, com imagem e voz juntas e sem mudar o tom da voz. Imagem: setpts (cada quadro fica
mais tempo na tela). Voz: atempo (estica o tempo e mantem a altura; mudar a taxa de amostra deixaria a voz grossa).
A legenda ganha as palavras repetidas, cada uma numa pagina so dela (pageBreakAfter), no tempo esticado; a pagina
fica na tela ate a palavra lenta acabar (fimDaPaginaMs do src/curtas.ts).

Trechos em segundos da fala ORIGINAL: (ini, fim, fator), fator de 0,25 a 0,9 (0,5 e metade da velocidade). Tudo
que vem a partir do fim de um trecho anda pra frente a duracao do pedaco lento (deslocar).

Uso direto (fundo verde, antes do recortar-verde.py):
  camera_lenta.py VIDEO VOZ ALINHADO SAIDA_VIDEO SAIDA_VOZ SAIDA_ALINHADO --trecho INI:FIM[:FATOR] [--trecho ...]
No cenario proprio quem chama e o preparar-props.py, pelo campo cameraLenta do edicao.json."""
import argparse, json, os, subprocess, sys

FPS = 30

def q(t): return round(t * FPS) / FPS   # no grid de quadro, pra imagem e voz terem o mesmo tamanho

def planejar(trechos):
    """[(ini, fim, fator)] -> [(ini, fim, fator, inicio_no_final, dur)] em ordem, dur em quadros inteiros."""
    plano, soma, ult = [], 0.0, -1.0
    for ini, fim, fator in sorted(trechos):
        ini, fim = q(ini), q(fim)
        if not 0.25 <= fator <= 0.9: sys.exit(f"camera lenta: fator {fator} fora de 0,25 a 0,9")
        if fim - ini < 2 / FPS: sys.exit(f"camera lenta: trecho {ini:.2f} a {fim:.2f} s curto demais")
        if fim - ini > 1.5: sys.exit(f"camera lenta: trecho {ini:.2f} a {fim:.2f} s passa de 1,5 s; use uma palavra ou duas")
        if ini < ult: sys.exit(f"camera lenta: trecho {ini:.2f} s comeca antes do anterior acabar")
        dur = round((fim - ini) / fator * FPS) / FPS
        plano.append((ini, fim, fator, round(fim + soma, 4), dur))
        soma += dur; ult = fim
    return plano

def deslocar(t, plano):
    # o fim do trecho vai pro quadro mais perto: o que comeca ate 1 quadro antes dele ja e "depois" (palavra seguinte
    # que comeca no meio do quadro do corte nao pode ficar antes da repeticao)
    return round(t + sum(p[4] for p in plano if t >= p[1] - 1 / FPS), 4)

def atempo(fator):
    return "atempo=0.5,atempo=%.6f" % (fator / 0.5) if fator < 0.5 else "atempo=%.6f" % fator

def tem_audio(arq):
    o = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", arq],
                       capture_output=True, text=True).stdout.strip()
    return bool(o)

def pedacos(plano):
    """Ordem final: normal ate o fim do trecho, o trecho lento, normal ate o proximo... e o resto."""
    out, de = [], 0.0
    for ini, fim, fator, _, dur in plano:
        out.append((de, fim, 1.0, None)); out.append((ini, fim, fator, dur)); de = fim
    out.append((de, None, 1.0, None))
    return out

def filtro_audio(entrada, k, de, ate, fator, dur):
    corte = f"atrim=start={de:.4f}" + (f":end={ate:.4f}" if ate is not None else "")
    if fator == 1.0: return f"[{entrada}]{corte},asetpts=PTS-STARTPTS[a{k}]"
    return (f"[{entrada}]{corte},asetpts=PTS-STARTPTS,{atempo(fator)},apad,atrim=end={dur:.4f},"
            f"afade=t=in:d=0.006,afade=t=out:st={dur - 0.006:.4f}:d=0.006[a{k}]")

def filtro_video(k, de, ate, fator, dur):
    # corte por numero de quadro (por segundo, 6.5667 > 197/30 perde o quadro 197) e pedaco lento com o numero exato
    # de quadros: o fps sozinho entrega 1 a menos com fator 0,6 e o concat abre buraco pra casar com a voz
    corte = f"trim=start_frame={round(de * FPS)}" + (f":end_frame={round(ate * FPS)}" if ate is not None else "")
    if fator == 1.0: return f"[0:v]{corte},setpts=PTS-STARTPTS[v{k}]"
    m = round(dur * FPS)
    return f"[0:v]{corte},setpts=(PTS-STARTPTS)/{fator:.6f},fps={FPS}:round=down,tpad=stop_mode=clone:stop=3,trim=end_frame={m},setpts=PTS-STARTPTS[v{k}]"

def fps_de(video):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate", "-of", "csv=p=0", video],
                       capture_output=True, text=True).stdout.strip().strip(",").split("/")
    return round(int(r[0]) / int(r[1])) if len(r) == 2 and int(r[1]) else 0

def rodar(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
    if r.returncode != 0: sys.exit("camera lenta: o ffmpeg falhou\n" + r.stderr[-1500:])

def gravar_video(video, saida, plano):
    if fps_de(video) != FPS: sys.exit(f"camera lenta: o video precisa estar a {FPS} quadros (o montar-blocos.py ja entrega assim): {video}")
    pc = pedacos(plano); com_audio = tem_audio(video)
    fc = [filtro_video(k, de, ate, f, d) for k, (de, ate, f, d) in enumerate(pc)]
    if com_audio: fc += [filtro_audio("0:a", k, de, ate, f, d) for k, (de, ate, f, d) in enumerate(pc)]
    n = len(pc)
    fc.append("".join(f"[v{k}]" + (f"[a{k}]" if com_audio else "") for k in range(n)) + f"concat=n={n}:v=1:a={1 if com_audio else 0}[v]" + ("[a]" if com_audio else ""))
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", video, "-filter_complex", ";".join(fc), "-map", "[v]"]
    if com_audio: cmd += ["-map", "[a]", "-c:a", "aac", "-b:a", "192k", "-ar", "48000"]
    rodar(cmd + ["-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", saida])

def gravar_voz(voz, saida, plano):
    pc = pedacos(plano)
    fc = [filtro_audio("0:a", k, de, ate, f, d) for k, (de, ate, f, d) in enumerate(pc)]
    fc.append("".join(f"[a{k}]" for k in range(len(pc))) + f"concat=n={len(pc)}:v=0:a=1[a]")
    rodar(["ffmpeg", "-y", "-v", "error", "-i", voz, "-filter_complex", ";".join(fc), "-map", "[a]", "-ar", "48000", "-c:a", "pcm_s24le", saida])

def legenda(caps, plano):
    """Palavra original anda pelo deslocamento do proprio inicio; as do trecho entram de novo, esticadas."""
    out = []
    for c in caps:
        s = c["startMs"] / 1000
        d = deslocar(s, plano) - s
        out.append({**c, "startMs": round((s + d) * 1000), "endMs": round((c["endMs"] / 1000 + d) * 1000)})
    for ini, fim, fator, comeco, dur in reversed(plano):
        dentro = [c for c in caps if c["startMs"] / 1000 >= ini - 0.03 and c["endMs"] / 1000 <= fim + 0.03]
        if not dentro: sys.exit(f"camera lenta: nenhuma palavra da legenda entre {ini:.2f} e {fim:.2f} s")
        novas = []
        for c in dentro:
            a = comeco + max(0.0, c["startMs"] / 1000 - ini) / fator
            b = min(comeco + dur, comeco + (c["endMs"] / 1000 - ini) / fator)
            novas.append({**c, "startMs": round(a * 1000), "endMs": round(b * 1000), "pageBreakAfter": True, "lenta": True})
        pos = max(i for i, c in enumerate(out) if c["startMs"] / 1000 < comeco - 1e-6) + 1
        out[pos - 1] = {**out[pos - 1], "pageBreakAfter": True}
        out[pos:pos] = novas
    return out

def aplicar(video, voz, alinhado, saida_video, saida_voz, saida_alinhado, trechos):
    plano = planejar(trechos)
    for p in (saida_video, saida_voz, saida_alinhado): os.makedirs(os.path.dirname(p) or ".", exist_ok=True)
    caps = json.load(open(alinhado, encoding="utf-8"))
    if any(c.get("lenta") for c in caps): sys.exit(f"camera lenta: {alinhado} ja passou pela camera lenta; use a legenda original")
    nova = legenda(caps, plano)
    gravar_video(video, saida_video, plano)
    gravar_voz(voz, saida_voz, plano)
    json.dump(nova, open(saida_alinhado, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return plano

def main():
    ap = argparse.ArgumentParser()
    for n in ("video", "voz", "alinhado", "saida_video", "saida_voz", "saida_alinhado"): ap.add_argument(n)
    ap.add_argument("--trecho", action="append", required=True, help="INI:FIM[:FATOR], em segundos da fala original")
    a = ap.parse_args()
    trechos = []
    for t in a.trecho:
        v = [float(x) for x in t.split(":")]
        trechos.append((v[0], v[1], v[2] if len(v) > 2 else 0.5))
    plano = aplicar(a.video, a.voz, a.alinhado, a.saida_video, a.saida_voz, a.saida_alinhado, trechos)
    for ini, fim, fator, comeco, dur in plano:
        print(f"lenta: {ini:.2f} a {fim:.2f} s da fala volta a {fator} entre {comeco:.2f} e {comeco + dur:.2f} s do video (+{dur:.2f} s)")

if __name__ == "__main__":
    main()
