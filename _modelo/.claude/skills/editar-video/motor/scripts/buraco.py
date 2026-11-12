"""Buraco na fala: no meio do video entra um clipe de outra pessoa com o som original dele. A fala para no ponto e
volta depois do clipe. A pessoa fica parada no ultimo quadro antes do ponto (o clipe a cobre), a voz ganha silencio
do tamanho do clipe e tudo que vem a partir do ponto anda pra frente esse tamanho.

Cada item de "buracos" do edicao.json:
  { "seg": ponto (segundo da fala ou palavra), "arquivo": "clipes/x.mp4", "tam": {"w", "h"},
    "entradaSeg", "saidaSeg": de onde a onde do arquivo do clipe (nome fora dos tempos que o preparar-props.py anda),
    "selo": o credito na tela, "direito": de onde vem a permissao de usar,
    "legenda": paginas da fala do clipe, arquivo .json ou lista [{ini, fim, palavras}], contadas do comeco do trecho }

Deslocar por ponta: o que comeca no ponto ou depois (meio quadro de folga) anda; o que acaba ate o ponto fica. Item
que comeca antes e acaba depois do ponto ficaria por baixo do clipe: derruba o script.
Quem chama e o preparar-props.py, pelo campo buracos do edicao.json."""
import json, subprocess, sys
from pathlib import Path

FPS = 30
SR = 48000
MEIO = 0.5 / FPS

def q(t): return round(t * FPS) / FPS   # no grid de quadro, pra imagem e voz terem o mesmo tamanho

def sair(msg): sys.exit("buraco: " + msg)

def anda(t, plano, fim=False):
    """Quanto o tempo t anda: comeco no ponto ou depois anda, fim ate o ponto fica (meio quadro de folga)."""
    return sum(b["D"] for b in plano if (t > b["P"] + MEIO if fim else t >= b["P"] - MEIO))

def deslocar(t, plano, fim=False): return round(t + anda(t, plano, fim), 4)

def paginas_de(leg, pub):
    """Legenda do clipe: lista de paginas ou o arquivo de paginas (relativo ao public)."""
    if isinstance(leg, str):
        arq = Path(pub) / leg
        if not arq.exists(): sair(f"legenda do clipe nao achada: {leg}")
        leg = json.loads(arq.read_text(encoding="utf-8"))
    if not isinstance(leg, list): sair("a legenda do clipe falta (todo clipe falado leva legenda; clipe sem fala leva lista vazia)")
    return leg

def planejar(itens, caps, fim_video=None):
    """itens com a legenda ja lida -> plano em ordem do ponto, cada um com P (no quadro), D (quadros inteiros) e
    de (onde o clipe entra no video final). fim_video: a menor duracao entre pessoa e voz; ponto depois dela recusa."""
    if any(c.get("buraco") for c in caps): sair("a legenda ja passou por um buraco; use a legenda de antes")
    plano, soma = [], 0.0
    for x in sorted(itens, key=lambda x: x["seg"]):
        nome = x.get("arquivo", "?")
        if not str(x.get("selo") or "").strip(): sair(f"{nome}: falta o selo (o credito de quem e o clipe, na tela)")
        if not x.get("direito"): sair(f"{nome}: falta o direito (de onde vem a permissao de usar o clipe)")
        ent, fim = x.get("entradaSeg", 0), x.get("saidaSeg")
        if fim is None or ent < 0 or fim - ent < 1 / FPS: sair(f"{nome}: entradaSeg e saidaSeg do clipe fora de ordem ou faltando")
        P, D = q(x["seg"]), round((fim - ent) * FPS) / FPS
        # o volume integrado so se mede com 0,4 s ou mais (o loudnorm devolve -inf); abaixo disso o som tocaria sem medida
        if D < 0.5: sair(f"{nome}: o trecho do clipe tem {D:.2f} s; o buraco pede pelo menos 0,5 s, pra medir o volume do som")
        if P < 1 / FPS: sair(f"{nome}: o ponto {P:.2f} s fica no comeco do video; o buraco vai no meio da fala")
        if fim_video is not None and P > q(fim_video) - 1 / FPS:
            sair(f"{nome}: o ponto {P:.2f} s fica no fim ou depois do video ({fim_video:.2f} s); o buraco vai no meio da fala")
        if plano and P == plano[-1]["P"]:
            sair(f"{nome}: dois buracos no mesmo quadro ({P:.2f} s); junte os dois num clipe so ou afaste os pontos")
        for c in caps:
            a, b = c["startMs"] / 1000, c["endMs"] / 1000
            if a < P - 1 / FPS and b > P + 1 / FPS:
                sair(f"{nome}: o ponto {P:.2f} s cai no meio da palavra {c['text'].strip()!r} ({a:.2f} a {b:.2f} s); ponha no comeco ou no fim dela")
        for pg in x["legenda"]:
            if pg["ini"] < 0 or pg["fim"] > D + MEIO or pg["fim"] <= pg["ini"]:
                sair(f"{nome}: pagina da legenda de {pg['ini']} a {pg['fim']} s fora do clipe (0 a {D:.2f} s)")
            if len(pg["palavras"]) > 4: sair(f"{nome}: pagina da legenda com {len(pg['palavras'])} palavras (no maximo 4)")
        plano.append({**x, "P": round(P, 4), "D": round(D, 4), "de": round(P + soma, 4)})
        soma += D
    return plano

def mover(x, plano):
    """Anda os tempos absolutos do edicao.json: deSeg e seg pela ponta de comeco, ateSeg pela de fim."""
    if isinstance(x, list): return [mover(v, plano) for v in x]
    if not isinstance(x, dict): return x
    num = lambda k: isinstance(x.get(k), (int, float)) and not isinstance(x.get(k), bool)
    if num("deSeg") and num("ateSeg") and anda(x["deSeg"], plano) != anda(x["ateSeg"], plano, fim=True):
        pontos = ", ".join(f"{b['P']:.2f}" for b in plano)
        sair(f"item de {x['deSeg']:.2f} a {x['ateSeg']:.2f} s atravessa o ponto de um buraco ({pontos} s) e ficaria por baixo do clipe: "
             f"acabe no ponto ou comece depois dele ({json.dumps(x, ensure_ascii=False)[:90]})")
    out = {k: mover(v, plano) for k, v in x.items()}
    if num("deSeg"): out["deSeg"] = deslocar(x["deSeg"], plano)
    if num("ateSeg"): out["ateSeg"] = deslocar(x["ateSeg"], plano, fim=True)
    if num("seg"): out["seg"] = deslocar(x["seg"], plano)
    return out

def legenda(caps, plano):
    """Palavra anda pelo proprio comeco (a que comeca no ponto anda, a que acaba no ponto fica). A palavra de antes
    de cada buraco fecha a pagina (pageBreakAfter), acaba no ponto e leva a marca buraco (a segunda passada recusa)."""
    out = [{**c} for c in caps]
    for b in plano:
        antes = [i for i, c in enumerate(caps) if c["startMs"] / 1000 < b["P"] - MEIO]
        if not antes: continue
        i = max(antes)
        out[i].update(pageBreakAfter=True, buraco=True, endMs=min(caps[i]["endMs"], round(b["P"] * 1000)))
    for c, o in zip(caps, out):
        d = anda(c["startMs"] / 1000, plano)
        o.update(startMs=round(c["startMs"] + d * 1000), endMs=round(o["endMs"] + d * 1000))
    return out

def rodar(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
    if r.returncode != 0: sair("o ffmpeg falhou\n" + r.stderr[-1500:])
    return r

def duracao(arq):
    o = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(arq)], capture_output=True, text=True).stdout.strip()
    return float(o) if o and o != "N/A" else 0.0

def conferir_clipe(arq, b):
    if not Path(arq).exists(): sair(f"clipe nao achado: {b['arquivo']}")
    d = duracao(arq)
    if d < b["saidaSeg"] - 1.5 / FPS: sair(f"{b['arquivo']}: clipe curto, tem {d:.2f} s e a saidaSeg pede {b['saidaSeg']:.2f} s")
    import camera_lenta as cl
    if not cl.tem_audio(str(arq)): sair(f"{b['arquivo']}: o clipe nao tem som (o buraco e pra clipe com o som original)")

def gravar_pessoa(video, saida, plano):
    """Corte por numero de quadro e a pessoa parada no quadro de antes do ponto (tpad clona o ultimo quadro N vezes)."""
    import camera_lenta as cl
    if cl.fps_de(video) != FPS or not cl.quadros_batem(video): sair(f"o video precisa estar a {FPS} quadros (o montar-blocos.py ja entrega assim): {video}")
    com_audio = cl.tem_audio(video)
    cortes = [round(b["P"] * FPS) for b in plano]
    fc = []
    for k, (a, z) in enumerate(zip([0] + cortes, cortes + [None])):
        n = round(plano[k]["D"] * FPS) if k < len(plano) else 0
        corte = f"trim=start_frame={a}" + (f":end_frame={z}" if z is not None else "")
        fc.append(f"[0:v]{corte},setpts=PTS-STARTPTS" + (f",tpad=stop_mode=clone:stop={n}" if n else "") + f"[v{k}]")
        if com_audio:
            ac = f"atrim=start={a / FPS:.6f}" + (f":end={z / FPS:.6f}" if z is not None else "")
            fc.append(f"[0:a]{ac},asetpts=PTS-STARTPTS" + (f",apad=pad_dur={n / FPS:.6f}" if n else "") + f"[a{k}]")
    m = len(cortes) + 1
    fc.append("".join(f"[v{k}]" + (f"[a{k}]" if com_audio else "") for k in range(m)) + f"concat=n={m}:v=1:a={1 if com_audio else 0}[v]" + ("[a]" if com_audio else ""))
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", video, "-filter_complex", ";".join(fc), "-map", "[v]"]
    if com_audio: cmd += ["-map", "[a]", "-c:a", "aac", "-b:a", "192k", "-ar", str(SR)]
    rodar(cmd + ["-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", saida])

def gravar_voz(voz, saida, plano):
    """Corte por amostra a 48 kHz e silencio do tamanho do clipe em cada ponto."""
    cortes = [round(b["P"] * SR) for b in plano]
    fc = []
    for k, (a, z) in enumerate(zip([0] + cortes, cortes + [None])):
        corte = f"atrim=start_sample={a}" + (f":end_sample={z}" if z is not None else "")
        pad = f",apad=pad_len={round(plano[k]['D'] * SR)}" if k < len(plano) else ""
        fc.append(f"[0:a]aresample={SR},{corte},asetpts=PTS-STARTPTS{pad}[a{k}]")
    fc.append("".join(f"[a{k}]" for k in range(len(cortes) + 1)) + f"concat=n={len(cortes) + 1}:v=0:a=1[a]")
    rodar(["ffmpeg", "-y", "-v", "error", "-i", voz, "-filter_complex", ";".join(fc), "-map", "[a]", "-ar", str(SR), "-c:a", "pcm_s24le", saida])

def medir(arq, filtro=""):
    """Medida do loudnorm (integrado, pico, faixa e limiar) do arquivo inteiro ou do trecho do filtro."""
    o = rodar(["ffmpeg", "-hide_banner", "-nostats", "-i", str(arq), "-vn", "-af", filtro + "loudnorm=print_format=json", "-f", "null", "-"]).stderr
    j = json.loads(o[o.rindex("{"):o.rindex("}") + 1])
    return {k: float(j[k]) for k in ("input_i", "input_tp", "input_lra", "input_thresh")}

def gravar_audio(clipe, ent, D, alvo, saida):
    """Som do clipe no volume integrado medido da voz: loudnorm em 2 passos, pico em -1,5 dBTP. Devolve o ganho."""
    trecho = f"atrim=start={ent:.4f}:end={ent + D:.4f},asetpts=PTS-STARTPTS,"
    alvo = max(-70.0, min(-5.0, alvo))   # faixa que o loudnorm aceita
    m = medir(clipe, trecho)
    if m["input_i"] < -70: sair(f"{clipe}: o trecho do clipe esta mudo")
    ln = (f"loudnorm=I={alvo:.2f}:TP=-1.5:LRA=50:measured_I={m['input_i']:.2f}:measured_TP={m['input_tp']:.2f}:"
          f"measured_LRA={m['input_lra']:.2f}:measured_thresh={m['input_thresh']:.2f}:linear=true")
    n = round(D * SR)
    rodar(["ffmpeg", "-y", "-v", "error", "-i", str(clipe), "-vn", "-af",
           f"{trecho}{ln},aresample={SR},apad,atrim=end_sample={n},afade=t=in:d=0.006,afade=t=out:st={D - 0.006:.4f}:d=0.006",
           "-ar", str(SR), "-c:a", "pcm_s24le", str(saida)])
    return alvo - m["input_i"]
