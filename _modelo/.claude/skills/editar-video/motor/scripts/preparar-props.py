"""Props do VideoV2 a partir do edicao.json da peca (producao/<slug>/edicao.json). Faz duas coisas que a mao erra:
  1. tempo por palavra: qualquer numero de tempo (deSeg, ateSeg, seg, aSeg...) pode ser um objeto
     { "palavra": "prazo", "depois": 0, "fim": false, "mais": -0.1 } e vira o segundo em que a palavra comeca (ou
     acaba, com "fim": true) na legenda alinhada, a partir de "depois", somado a "mais". Palavra que nao existe
     derruba o script, pra a chave nao entrar no lugar errado em silencio.
  2. efeito sonoro com ganho medido: cada item de "sfx" que traz "dbVoz" (quantos dB abaixo da voz) ganha volume pelo
     RMS da voz, e os importantes ("importante": true) garantem ataque pelo menos 4,5 dB acima da voz no instante em
     que entram. O som tratado vai pra <public>/sfx-mix/ e o item sai com "volume": 1. Item sem "dbVoz" passa como veio.

Todo o resto do edicao.json vai direto pras props (pessoa, voz, legendas, duracaoSeg, cortesSeg, segmentos, chaves,
cartoes, flashes, palavras, ...). Padroes: alturaTela 0 e recorteTopoPessoa 0 (quadro inteiro), cortesSeg [] e
segmentos []; duracaoSeg vem da duracao da voz se faltar. Os nomes de arquivo ficam relativos ao public.

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
    sfx_ed = ed.pop("sfx", [])
    props = {"alturaTela": 0, "recorteTopoPessoa": 0, "cortesSeg": [], "segmentos": [], **ed}
    if "duracaoSeg" not in props:
        d = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(pub / ed["voz"])], text=True)
        props["duracaoSeg"] = round(float(d.strip()), 3)

    voz = ler(pub / ed["voz"]) if any("dbVoz" in s for s in sfx_ed) else None
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
    print(f"props: {a.saida} ({props['duracaoSeg']} s, {len(props.get('chaves', []))} chaves, {len(props.get('cartoes', []))} cartoes, {len(saidas)} sons)")
    for m in medidas: print("  " + m)

if __name__ == "__main__":
    main()
