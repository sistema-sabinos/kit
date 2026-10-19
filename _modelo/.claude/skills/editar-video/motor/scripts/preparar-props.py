"""Props do VideoV2 a partir do edicao.json da peca (producao/<slug>/edicao.json). Faz quatro coisas que a mao erra:
  1. tempo por palavra: qualquer numero de tempo (deSeg, ateSeg, seg, aSeg...) pode ser um objeto
     { "palavra": "prazo", "depois": 0, "fim": false, "mais": -0.1 } e vira o segundo em que a palavra comeca (ou
     acaba, com "fim": true) na legenda alinhada, a partir de "depois", somado a "mais". Palavra que nao existe
     derruba o script, pra a chave nao entrar no lugar errado em silencio.
  2. efeito sonoro com ganho medido: cada item de "sfx" que traz "dbVoz" (quantos dB abaixo da voz) ganha volume pelo
     RMS da voz, e os importantes ("importante": true) garantem ataque pelo menos 4,5 dB acima da voz no instante em
     que entram. O som tratado vai pra <public>/sfx-mix/ e o item sai com "volume": 1. Item sem "dbVoz" passa como veio.
  3. camera lenta: cada item de "cameraLenta" ({ "deSeg", "ateSeg", "fator": 0.5, "escala" }) repete o trecho mais
     devagar logo depois de ele ser falado (camera_lenta.py). Pessoa, voz e legenda novas vao pra <public>/lenta/, todo
     tempo de depois anda a duracao lenta (os do edicao.json sao da fala original), os cortesSeg ganham os cortes da
     repeticao e as props levam "lentas" (onde fica cada repeticao, pro verificar-video.py).
  4. onda medida: cada item de "ondas" ({ "deSeg", "ateSeg", "topo", "altura", "largura" }) ganha "valores", o volume
     da voz quadro a quadro (30 por segundo, de 0 a 1). Onda com menos de 0,5 s, fora da zona segura ou em cima da
     legenda (topoLegenda, 1240 quando falta) derruba o script com a mensagem.

Todo o resto do edicao.json vai direto pras props (pessoa, voz, legendas, duracaoSeg, cortesSeg, segmentos, chaves,
cartoes, flashes, palavras, ...). Padroes: alturaTela 0 e recorteTopoPessoa 0 (quadro inteiro), cortesSeg [],
segmentos [] e chaves []; duracaoSeg vem da duracao da voz se faltar. Os nomes de arquivo ficam relativos ao public.

Uso: preparar-props.py <edicao.json> <saida-props.json> --public-dir <pasta public da peca> [--midia <pasta de midia>]
--midia: onde procurar o som quando ele nao esta no public (a pasta que tem biblioteca/sfx/...)."""
import argparse, json, os, re, subprocess, sys, unicodedata
from pathlib import Path
import numpy as np

SR = 48000

def norm(w): return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFD", w.lower()))
def r2(x): return round(x, 2)
def sh(cmd): subprocess.run(cmd, check=True)
def ler(p): return np.frombuffer(subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(p), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]), np.float32).copy()
def rms(x): return float(np.sqrt(np.mean(x * x) + 1e-12))
def db(v): return float(20 * np.log10(max(v, 1e-9)))

FPS = 30  # repete tema.ts:7, como o verificar-video.py

# volume da voz quadro a quadro: o RMS de cada janela de 1/fps segundo entre deSeg e ateSeg (trecho alem do fim da voz vale 0)
def volumes(x, sr, de, ate, fps=FPS):
    n, passo = max(1, round((ate - de) * fps)), sr / fps
    out = []
    for i in range(n):
        j = x[round(de * sr + i * passo): round(de * sr + (i + 1) * passo)]
        out.append(float(np.sqrt(np.mean(j * j))) if len(j) else 0.0)
    return out

# onda: volume dividido pelo da voz cheia (percentil 95 dos quadros com som), de 0 a 1, 3 casas
def onda(x, sr, de, ate, fps=FPS):
    tudo = np.array(volumes(x, sr, 0, len(x) / sr, fps))
    ref = float(np.percentile(tudo[tudo > 1e-4], 95)) if np.any(tudo > 1e-4) else 1.0
    return [round(min(1.0, v / ref), 3) for v in volumes(x, sr, de, ate, fps)]

TEMPOS = ("deSeg", "ateSeg", "seg")   # tempos absolutos; aSeg, offsetSeg e duracaoSeg de item sao relativos

def camera_lenta(ed, lentas, pub):
    """cameraLenta: grava pessoa, voz e legenda com os trechos repetidos em lenta/ e anda os tempos de depois."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import camera_lenta as cl
    plano = cl.aplicar(str(pub / ed["pessoa"]), str(pub / ed["voz"]), str(pub / ed["legendas"]),
                       str(pub / "lenta" / "pessoa.mp4"), str(pub / "lenta" / "voz.wav"), str(pub / "lenta" / "legendas.json"),
                       [(x["deSeg"], x["ateSeg"], x.get("fator", 0.5)) for x in lentas])
    def mover(x):
        if isinstance(x, dict): return {k: (cl.deslocar(v, plano) if k in TEMPOS and isinstance(v, (int, float)) else mover(v)) for k, v in x.items()}
        if isinstance(x, list): return [mover(v) for v in x]
        return x
    ed = {k: (v if k in ("cortesSeg", "duracaoSeg") else mover(v)) for k, v in ed.items()}
    cortes = [cl.deslocar(c, plano) for c in ed.get("cortesSeg", [])]
    fixas = ed.get("escalasSeg")
    if fixas is None and any("escala" in x for x in lentas):
        fixas = [1.0 if k % 2 == 0 else ed.get("escalaCorte", 1.25) for k in range(len(cortes) + 1)]
    for x, (_, _, _, comeco, dur) in zip(lentas, plano):
        i, fim = sum(1 for c in cortes if c <= comeco), round(comeco + dur, 4)
        # corte da montagem logo depois da palavra (o normal) ja caiu no fim da repeticao: nao duplica
        colado = any(abs(c - fim) < 1 / 30 for c in cortes)
        cortes[i:i] = [comeco] if colado else [comeco, fim]
        if fixas is not None:
            bloco = fixas[i]
            esc = x.get("escala", ed.get("escalaCorte", 1.25) if bloco == 1.0 else 1.0)
            fixas[i + 1:i + 1] = [esc] if colado else [esc, bloco]
            if colado and fixas[i + 2:i + 3] == [esc]:
                print(f"  aviso: a repeticao de {comeco:.2f} s e o bloco seguinte ficam na escala {esc}: o corte sai sem zoom; mude o \"escala\" da cameraLenta")
    ed["cortesSeg"] = cortes
    if fixas is not None: ed["escalasSeg"] = fixas
    if "duracaoSeg" in ed: ed["duracaoSeg"] = round(ed["duracaoSeg"] + sum(p[4] for p in plano), 3)
    ed.update(pessoa="lenta/pessoa.mp4", voz="lenta/voz.wav", legendas="lenta/legendas.json",
              lentas=[{"deSeg": p[3], "ateSeg": round(p[3] + p[4], 4)} for p in plano])
    for ini, fim, fator, comeco, dur in plano:
        print(f"camera lenta: {ini:.2f} a {fim:.2f} s volta a {fator} de {comeco:.2f} a {comeco + dur:.2f} s (+{dur:.2f} s)")
    return ed

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("edicao"); ap.add_argument("saida")
    ap.add_argument("--public-dir", required=True); ap.add_argument("--midia", default=None)
    a = ap.parse_args()
    os.makedirs(os.path.dirname(a.saida) or ".", exist_ok=True)
    pub = Path(a.public_dir)
    ed = json.loads(Path(a.edicao).read_text(encoding="utf-8"))
    for campo in ("pessoa", "voz", "legendas"):
        if campo not in ed: sys.exit(f"o edicao.json precisa do campo '{campo}'")

    caps = json.loads((pub / ed["legendas"]).read_text(encoding="utf-8"))
    pal = [(norm(c["text"]), c["startMs"] / 1000, c["endMs"] / 1000) for c in caps]

    def tempo(ref):
        alvo, depois = norm(ref["palavra"]), ref.get("depois", 0)
        for w, ini, fim in pal:
            if ini >= depois - 0.05 and w == alvo:
                return r2((fim if ref.get("fim") else ini) + ref.get("mais", 0))
        sys.exit(f"palavra nao achada na legenda: {ref['palavra']!r} depois de {depois}")

    def resolver(x):
        if isinstance(x, dict):
            return tempo(x) if "palavra" in x else {k: resolver(v) for k, v in x.items()}
        if isinstance(x, list): return [resolver(v) for v in x]
        return x

    ed = resolver(ed)
    lentas = sorted(ed.pop("cameraLenta", []), key=lambda x: x["deSeg"])
    if lentas: ed = camera_lenta(ed, lentas, pub)
    sfx_ed = ed.pop("sfx", [])
    # o Remotion mistura estas props com as do exemplo do Studio (Root.tsx): todo campo que o exemplo preenche
    # tem padrao aqui, senao o video do aluno herda o do exemplo (a chave PRAZO, achado C1 da 5.17)
    props = {"alturaTela": 0, "recorteTopoPessoa": 0, "cortesSeg": [], "segmentos": [], "chaves": [], **ed}
    if "duracaoSeg" not in props:
        d = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(pub / ed["voz"])], text=True)
        props["duracaoSeg"] = round(float(d.strip()), 3)

    voz = ler(pub / ed["voz"]) if any("dbVoz" in s for s in sfx_ed) or props.get("ondas") else None
    for o in props.get("ondas", []):
        o.setdefault("topo", 1060); o.setdefault("altura", 150); o.setdefault("largura", 720)
        if o["ateSeg"] - o["deSeg"] < 0.5:
            sys.exit(f"onda curta demais ({o['deSeg']} a {o['ateSeg']} s): no minimo 0,5 s, senao a entrada e a saida nao cabem e o render quebra")
        # 1240 repete o topoLegendaPadrao do tema.ts (um teste do cadeia confere os dois)
        leg = props.get("topoLegenda", 1240)
        if o["topo"] + o["altura"] > leg:
            sys.exit(f"onda em cima da legenda (topo + altura {o['topo'] + o['altura']}, legenda em {leg}): suba a onda ou baixe a altura")
        if o["topo"] < 250 or o["topo"] + o["altura"] > 1436 or o["largura"] > 800:
            sys.exit(f"onda fora da zona segura (topo {o['topo']}, altura {o['altura']}, largura {o['largura']}): topo de 250 pra baixo, topo + altura ate 1436, largura ate 800")
        o["valores"] = onda(voz, SR, o["deSeg"], o["ateSeg"])
    vr = rms(voz[voz != 0]) if voz is not None and np.any(voz != 0) else 1e-6
    saidas, medidas = [], []
    (pub / "sfx-mix").mkdir(parents=True, exist_ok=True)
    for i, s in enumerate(sfx_ed):
        if "dbVoz" not in s:
            saidas.append(s); continue
        fonte = pub / s["arquivo"]
        if not fonte.exists() and a.midia: fonte = Path(a.midia) / s["arquivo"]
        if not fonte.exists(): sys.exit(f"som nao achado: {s['arquivo']} (procurei no public e em --midia)")
        d, alvo, imp = s.get("duracaoSeg", 1.0), s["seg"], bool(s.get("importante"))
        x = ler(fonte)[: round(d * SR)]
        pot = np.convolve(x * x, np.ones(4800) / 4800, "valid")[::480]
        pico = int(np.argmax(pot)) * 480 / SR
        ini = max(0.0, round((alvo - pico) * 30) / 30)
        jan = voz[round((ini + pico) * SR): round((ini + pico + 0.1) * SR)]
        g = vr * 10 ** (s["dbVoz"] / 20) / rms(x)
        if imp and len(jan) and rms(jan) > 1e-4:
            g = max(g, np.sqrt((10 ** 0.45 - 1) * rms(jan) ** 2 / max(float(np.max(pot)), 1e-12)))
        arq = f"sfx-mix/{i:02d}-{fonte.stem}.wav"
        sh(["ffmpeg", "-y", "-v", "error", "-i", str(fonte), "-t", str(d),
            "-af", f"volume={g:.7f},alimiter=limit=0.89:level=false:latency=true,afade=t=out:st={max(0, d - .08):.3f}:d=0.08",
            "-ar", str(SR), "-c:a", "pcm_s24le", str(pub / arq)])
        saidas.append({"arquivo": arq, "seg": round(ini, 4), "volume": 1, "offsetSeg": 0, "duracaoSeg": d})
        medidas.append(f"{arq}: inicio {ini:.2f} s, ganho {db(g):+.1f} dB")
    props["sfx"] = saidas

    Path(a.saida).write_text(json.dumps(props, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"props: {a.saida} ({props['duracaoSeg']} s, {len(props.get('chaves', []))} chaves, {len(props.get('cartoes', []))} cartoes, {len(props.get('ondas', []))} ondas, {len(saidas)} sons)")
    for m in medidas: print("  " + m)

if __name__ == "__main__":
    main()
