"""Verificador do video antes de ir pra quem pediu (gate de script).
Nasceu de um caso real: a imagem da pessoa ficou 8,2 s mais curta que a voz, a boca descolou no fim e o template
travou no ultimo quadro, e a folha de frames soltos nao mostrou nada disso. Confere o video INTEIRO, nao amostra.

O detector de rosto e o YuNet (modelos/face_detection_yunet_2023mar.onnx, licenca MIT, em modelos/LICENSE-yunet.txt).

Checa, a partir das props do VideoV2 (JSON) e do render/mix final:
  1. duracoes: pessoa, voz, cada video de insercao, o clipe de cada buraco e o final contra o duracaoSeg (tolerancia
     de 1 quadro). No buraco a pessoa fica parada debaixo do clipe: ele conta como coberto e como video que se mexe
  2. sincronia boca x voz em janelas de 1 s em todo trecho em que a pessoa aparece falando: a imagem (rosto achado
     pelo YuNet) e a voz tem que ter saido do mesmo instante do bruto (--bruto: o video com audio de onde a pessoa
     e a voz foram cortadas; no fluxo normal e a fala montada ou o bruto-pad do recortar-verde.py). Com a fala
     montada como pessoa e o cru como --bruto, a janela que cruza um corte da montagem junta dois instantes distantes
     do cru: ela e pulada e contada num aviso (a imagem da primeira e da segunda metade casadas em separado).
     Furo: bloco da montagem com menos de 1,5 s pode nao ter janela inteira dentro e sai so na contagem do aviso
  3. travada: imagem da pessoa parada por mais de 0,3 s onde ela aparece, e quadro repetido no final inteiro
     fora de imagem e cartao
  4. audio do final do mesmo tamanho do video, e silencio longo no meio
O tempo de cada quadro sai do carimbo real dele (o cru de celular comeca fora do zero e perde quadro: contar o
quadro N como N dividido pela taxa media errava ate 80 ms), na pessoa e no bruto. A pessoa conta do comeco do
proprio arquivo (start_time do formato), como as props; o bruto segue no carimbo absoluto, imagem e voz.

Uso: verificar-video.py <props.json> <final.mp4> --bruto <bruto.mp4> --public-dir <pasta public da peca>
(os nomes de arquivo das props sao relativos ao --public-dir)
Sai PASSOU ou FALHOU (codigo 1) com a lista do que quebrou e em que segundo."""
import argparse, json, subprocess, sys, re
from pathlib import Path
import numpy as np
import cv2, warnings
warnings.filterwarnings("ignore")

def probe(p, sel="v:0", campo="duration"):
    o = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", sel, "-show_entries", f"stream={campo}",
                                 "-of", "csv=p=0", str(p)]).decode().strip().split("\n")[0]
    o = o.strip(",").split(",")[0]
    return float(o) if o and o != "N/A" else None
def carimbos(arquivo):
    """Carimbo real de cada quadro do video, em ordem (pts_time dos pacotes: ja absoluto, o comeco fora do zero vai
    dentro), e o comeco do audio (o audio decodificado perde o carimbo: a amostra 0 vale o start_time; 0 sem audio).
    Pacote marcado pra descartar (D, de video cortado por copia, que comeca antes do ponto de corte) nao vira quadro e fica fora."""
    import subprocess
    o = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time,flags",
                                 "-of", "csv=p=0", str(arquivo)]).decode()
    lin = [l.strip().split(",") for l in o.splitlines() if l.strip()]
    ts = np.sort(np.array([float(c[0]) for c in lin if c[0] != "N/A" and "D" not in "".join(c[1:])]))
    a = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=start_time",
                                 "-of", "csv=p=0", str(arquivo)]).decode().strip().strip(",")
    return ts, (float(a) if a and a != "N/A" else 0.0)
def comeco_arquivo(arquivo):
    """Comeco do arquivo (start_time do formato, o menor comeco entre as trilhas): o zero de onde as props contam.
    So a pessoa desconta dele. O comeco do video nao entra: o cru de celular tem o formato em 0 e o video em 0,06, e
    o primeiro carimbo segue 0,06."""
    import subprocess
    o = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=start_time", "-of", "csv=p=0",
                                 str(arquivo)]).decode().strip().strip(",")
    return float(o) if o and o != "N/A" else 0.0
def duracao_pessoa(tp, fps):
    """Fim da imagem da pessoa: o ultimo carimbo mais um quadro (contar quadros perde o buraco do meio)."""
    return float(tp[-1]) + 1 / fps if len(tp) else 0.0
def alinhar_quadros(mov, visivel):
    """A pessoa pode ter 1 quadro a mais ou a menos que int(DUR * FPS): corta os dois vetores no menor comprimento."""
    n = min(len(mov), len(visivel))
    return mov[:n], visivel[:n]
def janela_na_lenta(t0, lentas):
    """Camera lenta (preparar-props.py grava "lentas"): a janela de 1 s que encosta na repeticao tem imagem e voz esticadas de proposito."""
    return any(t0 < l["ateSeg"] and t0 + 1 > l["deSeg"] for l in lentas)
def trechos_cobertos(P):
    """Onde a pessoa nao aparece: insercao em tela cheia, cartao e buraco (o clipe com o som original por cima da
    pessoa parada, que o preparar-props.py grava em "buracos")."""
    return [(g["deSeg"], g["ateSeg"]) for g in P["segmentos"] if g.get("cheia", True)] + \
           [(c["deSeg"], c["ateSeg"]) for c in P.get("cartoes", [])] + \
           [(b["deSeg"], b["ateSeg"]) for b in P.get("buracos", [])]
def clipes_vivos(P):
    """Trechos com video que se mexe sozinho (insercao de video e clipe do buraco): quadro parado ali e da fonte."""
    return [(g["deSeg"], g["ateSeg"]) for g in P["segmentos"] if g["tipo"] == "video"] + \
           [(b["deSeg"], b["ateSeg"]) for b in P.get("buracos", [])]
def janela_quadros(TP, t0):
    """Quadros da pessoa com carimbo em [t0, t0 + 1), pelo carimbo (o comeco fora do zero e o buraco mudam a conta)."""
    return int(np.searchsorted(TP, t0 - 1e-6)), int(np.searchsorted(TP, t0 + 1 - 1e-6))
def casar_imagem(C, tk, TB, t0):
    """Instante do bruto de onde veio a imagem de uma janela da pessoa que comeca em t0, pelo carimbo real dos dois lados.
    C[k, j]: correlacao do quadro k da janela com o quadro j do bruto; tk: carimbo de cada quadro da janela; TB:
    carimbo de cada quadro do bruto. Pra cada quadro do bruto como par do primeiro, os outros casam com o quadro do
    bruto mais perto do mesmo intervalo de tempo. Devolve (instante do bruto que vale t0, nota): o par do primeiro
    quadro menos a distancia do primeiro quadro ao t0."""
    dt = np.asarray(tk, dtype=float) - tk[0]
    offs = np.arange(0, int(np.searchsorted(TB, TB[-1] - dt[-1], side="right")))
    if len(offs) == 0: return 0.0, -1.0
    alvo = TB[offs][None, :] + dt[:, None]
    j = np.clip(np.searchsorted(TB, alvo), 1, len(TB) - 1)
    j = np.where(np.abs(TB[j - 1] - alvo) < np.abs(TB[j] - alvo), j - 1, j)
    sc = C[np.arange(len(dt))[:, None], j].mean(axis=0)
    b = int(np.argmax(sc))
    return float(TB[offs[b]]) - (float(tk[0]) - t0), float(sc[b])
def janela_cruza_corte(C, tk, TB, t0, fps):
    """Janela de 1 s que cruza um corte da montagem (a pessoa e a fala montada, o --bruto e o cru): junta dois
    instantes distantes do bruto e reprovaria em falso. Casa a imagem da primeira metade dos quadros e da segunda
    separadas; se a segunda saiu de um instante do bruto que nao bate com o intervalo de tempo da pessoa entre elas
    (mais de 3 quadros), cruza corte. Descolamento de verdade desloca as duas metades igual e segue pego. Metade sem
    certeza (nota < 0,6) nao decide."""
    h = len(tk) // 2
    if h < 2: return False
    a, na = casar_imagem(C[:h], tk[:h], TB, t0)
    b, nb = casar_imagem(C[h:], tk[h:], TB, float(tk[h]))
    return bool(na >= 0.6 and nb >= 0.6 and abs((b - a) - (float(tk[h]) - t0)) > 3 / fps)
def casar_voz(jan, eb, inicio, de=0, ate=None):
    """Instante do bruto de onde veio a voz de uma janela de 1 s (envelopes a 100 por segundo). inicio: o comeco do
    audio do bruto, que a amostra 0 do audio decodificado vale. de/ate: limita a busca a esses indices do envelope
    (sem eles, o bruto inteiro). Devolve (instante, nota)."""
    jan = (jan - jan.mean()) / (jan.std() + 1e-9)
    best, o_ = -2, 0
    fim = len(eb) - 100 if ate is None else min(len(eb) - 100, ate)
    for o in range(max(0, de), fim):
        e = eb[o:o + 100]; c = float(np.dot(jan, (e - e.mean()) / (e.std() + 1e-9))) / 100
        if c > best: best, o_ = c, o
    return o_ / 100 + inicio, best
def voz_da_janela(jan, eb, inicio, sv, fps, margem=0.05):
    """Decide a voz de uma janela contra a imagem, que veio de sv no bruto. A busca no bruto inteiro decide; se ela cai
    longe da imagem e a voz tem, no proprio lugar da imagem, um pico de casamento quase tao alto, o audio sozinho nao
    diz qual dos dois e a janela e ambigua (fala que se repete, frase dita duas vezes). Devolve (estado, instante,
    nota), estado "ok", "ambigua" ou "descolada"."""
    tol = 1.5 / fps
    sa, best = casar_voz(jan, eb, inicio)
    if abs(sv - sa) <= tol: return "ok", sa, best
    # so as posicoes que o proprio teste de cima aceitaria: arredondar pra fora reencontraria o casamento descolado
    lo, hi = int(np.floor((sv - inicio - tol) * 100)), int(np.ceil((sv - inicio + tol) * 100))
    while lo <= hi and abs(sv - (lo / 100 + inicio)) > tol: lo += 1
    while hi >= lo and abs(sv - (hi / 100 + inicio)) > tol: hi -= 1
    nota = lambda o: casar_voz(jan, eb, inicio, o, o + 1)[1] if 0 <= o < len(eb) - 100 else -2
    c = {o: nota(o) for o in range(lo - 1, hi + 2)}
    # so pico conta: a encosta do pico descolado (envelope de voz e suave) tira nota alta e nao e outra fala
    picos = [c[o] for o in range(lo, hi + 1) if c[o] >= c[o - 1] and c[o] >= c[o + 1]]
    if picos and max(picos) >= best - margem: return "ambigua", sa, best
    return "descolada", sa, best
def patches(p, box, lado=24):
    """Boca e queixo de cada quadro, normalizados, com o carimbo de cada quadro e o comeco do audio."""
    cap, out = cv2.VideoCapture(str(p)), []
    while True:
        ok, f = cap.read()
        if not ok: break
        g = cv2.resize(cv2.cvtColor(f[box[1]:box[3], box[0]:box[2]], cv2.COLOR_BGR2GRAY), (lado, lado)).astype(np.float32).ravel()
        out.append((g - g.mean()) / (g.std() + 1e-6))
    ts, ia = carimbos(p)
    n = min(len(out), len(ts))
    return np.array(out[:n]), ts[:n], ia
def envelope(p, hz=100):
    a = np.frombuffer(subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(p), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"]), np.float32)
    h = 16000 // hz
    return np.array([np.sqrt(np.mean(a[i:i + h] ** 2)) for i in range(0, len(a) - h, h)])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("props"); ap.add_argument("final")
    ap.add_argument("--bruto", default=None); ap.add_argument("--public-dir", required=True)
    args = ap.parse_args()
    final = Path(args.final)
    BRUTO = Path(args.bruto) if args.bruto else None
    pub = Path(args.public_dir)
    P = json.loads(Path(args.props).read_text(encoding="utf-8"))
    DUR = P["duracaoSeg"]
    _r = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate",
                                 "-of", "csv=p=0", str(pub / P["pessoa"])]).decode().strip().strip(",").split("/")
    FPS = round(int(_r[0]) / int(_r[1]))   # taxa real da pessoa (o template e 30; um bruto pode vir a 25)
    falhas, avisos = [], []

    # ---------- 1) duracoes
    tol = 1.5 / FPS
    ORIG = comeco_arquivo(pub / P["pessoa"])   # a pessoa conta do zero do arquivo, como as props; o bruto segue absoluto
    TP, _ = carimbos(pub / P["pessoa"])
    TP = TP - ORIG
    dp = duracao_pessoa(TP, FPS)
    dv = probe(pub / P["voz"], "a:0")
    if dp < DUR - tol: falhas.append(f"pessoa tem {dp:.2f} s e o video {DUR:.2f} s: falta {DUR - dp:.2f} s de imagem (trava no fim e descola a boca)")
    if dv is not None and abs(dv - DUR) > tol: falhas.append(f"voz tem {dv:.2f} s e o video {DUR:.2f} s")
    for sg in P["segmentos"]:
        if sg["tipo"] != "video": continue
        d = probe(pub / sg["arquivo"])
        precisa = (sg["ateSeg"] - sg["deSeg"]) * sg.get("velocidade", 1) + sg.get("offsetSeg", 0)
        if d is None or d < precisa - tol:
            falhas.append(f"insercao {sg['arquivo']} tem {d} s e precisa de {precisa:.2f} s ({sg['deSeg']} a {sg['ateSeg']})")
    for b in P.get("buracos", []):
        d = probe(pub / b["arquivo"])
        precisa = b.get("entradaSeg", 0) + b["ateSeg"] - b["deSeg"]
        if d is None or d < precisa - tol:
            falhas.append(f"clipe do buraco {b['arquivo']} tem {d} s e precisa de {precisa:.2f} s ({b['deSeg']} a {b['ateSeg']})")
        if not (pub / b["audio"]).exists(): falhas.append(f"som do buraco faltando: {b['audio']}")
    for fx in P.get("sfx", []):
        if not (pub / fx["arquivo"]).exists(): falhas.append(f"som faltando: {fx['arquivo']}")
    fv, fa = probe(final), probe(final, "a:0")
    if fv is None or abs(fv - DUR) > 0.1: falhas.append(f"final tem {fv} s de video e as props {DUR:.2f} s")
    if fa is None or abs(fa - fv) > 0.2: falhas.append(f"final: audio {fa} s x video {fv} s")
    elif abs(fa - fv) > 0.05: avisos.append(f"final: audio {fa} s x video {fv} s (cauda do som do fecho)")

    # trechos em que a pessoa aparece (fora de insercao em tela cheia, cartao e buraco), quadro a quadro pelo carimbo
    cobre = trechos_cobertos(P)
    estatico = [(g["deSeg"], g["ateSeg"]) for g in P["segmentos"] if g["tipo"] == "imagem"] + \
               [(c["deSeg"], c["ateSeg"]) for c in P.get("cartoes", [])]
    dentro = lambda t, iv: any(a - 0.05 <= t <= b + 0.05 for a, b in iv)
    visivel = np.array([t < DUR and not dentro(t, cobre) for t in TP], dtype=bool)

    # ---------- 2) sincronia boca x voz, contra o bruto de onde a pessoa e a voz sairam
    # Correlacao "movimento da boca x energia da voz" foi testada e deu alarme falso ate no bruto limpo.
    # O que se confere e exato: em cada janela de 1 s em que a pessoa aparece falando, de que instante do bruto veio a
    # IMAGEM (rosto comparado quadro a quadro) e de que instante veio a VOZ (envelope comparado). Diferenca > 1 quadro
    # e boca descolada.
    cap = cv2.VideoCapture(str(pub / P["pessoa"])); rostos = []
    # rosto pelo YuNet (detector oficial do OpenCV, modelo em scripts/modelos/, opencv_zoo, MIT)
    w0, h0 = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    det = cv2.FaceDetectorYN.create(str(Path(__file__).parent / "modelos/face_detection_yunet_2023mar.onnx"), "", (w0, h0), 0.7)
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    for i in np.linspace(0, n - 1, 25).astype(int):
        if not visivel[min(i, len(visivel) - 1)]: continue
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(i)); ok, f = cap.read()
        if not ok: continue
        fs = det.detect(f)[1]
        if fs is not None: rostos.append(max(fs[:, :4], key=lambda r: r[2] * r[3]))
    if not rostos:
        falhas.append("nao achei rosto na pessoa: sincronia nao medida")
    else:
        x, y, w, h = np.median(np.array(rostos), axis=0).astype(int)
        box = (x + w // 5, y + int(h * 0.62), x + w - w // 5, y + int(h * 1.12))   # boca e queixo
        F, TP, _ = patches(pub / P["pessoa"], box)
        TP = TP - ORIG
        mov = np.r_[0, np.mean(np.abs(np.diff(F, axis=0)), axis=1)]
        if BRUTO is None:
            avisos.append("sem --bruto: sincronia boca x voz nao conferida")
        else:
            Bp, TB, ia = patches(BRUTO, box)
            ev, eb = envelope(pub / P["voz"]), envelope(BRUTO)
            limiar = 0.1 * np.percentile(ev, 95)
            ruins, pulou, ambiguas, conferidas = [], 0, 0, 0
            for t0 in np.arange(0, DUR - 1, 0.5):
                q0, q1 = janela_quadros(TP, t0)
                if q1 <= q0 or visivel[q0:q1].mean() < 1 or (ev[int(t0 * 100):int(t0 * 100) + 100] > limiar).mean() < 0.6: continue
                if janela_na_lenta(t0, P.get("lentas", [])): continue
                ks = np.arange(q0, min(q1, len(F)), 3)
                if len(ks) == 0: continue
                C = F[ks] @ Bp.T / F.shape[1]                    # correlacao de cada quadro com cada quadro do bruto
                sv, nota = casar_imagem(C, TP[ks], TB, t0)       # instante do bruto de onde veio a imagem em t0
                estado, sa, best = voz_da_janela(ev[int(t0 * 100):int(t0 * 100) + 100], eb, ia, sv, FPS)   # e a voz
                if nota < 0.6 or best < 0.6: continue            # janela sem certeza nas duas pontas
                if janela_cruza_corte(C, TP[ks], TB, t0, FPS): pulou += 1; continue
                if estado == "ambigua": ambiguas += 1; continue
                conferidas += 1
                if estado == "descolada":
                    ruins.append(f"{t0:.1f} s (imagem de {sv:.2f} s do bruto, voz de {sa:.2f} s: {1000 * (sv - sa):+.0f} ms)")
            if pulou: avisos.append(f"{pulou} janelas puladas por cruzar corte da montagem")
            if ambiguas and not conferidas:
                avisos.append(f"sincronia boca x voz nao conferida: voz ambigua em {ambiguas} janelas (o audio casa igual em dois lugares do bruto)")
            elif ambiguas:
                avisos.append(f"{ambiguas} janelas com voz ambigua puladas (o audio casa igual em dois lugares do bruto)")
            if ruins: falhas.append("boca fora da voz em: " + "; ".join(ruins))

        # ---------- 3a) pessoa parada onde aparece
        mov_a, vis_a = alinhar_quadros(mov, visivel)
        parado = (mov_a < 0.01) & vis_a   # quadro identico ao anterior (25->30 fps repete 1 em 6, isolado)
        i = 0
        while i < len(parado):
            if parado[i]:
                j = i
                while j < len(parado) and parado[j]: j += 1
                if j - i > 0.3 * FPS: falhas.append(f"pessoa travada de {i / FPS:.2f} a {j / FPS:.2f} s")
                i = j
            else: i += 1

    # ---------- 3b) quadro repetido no final inteiro, fora de imagem e cartao
    o = subprocess.run(["ffmpeg", "-v", "info", "-i", str(final), "-vf", "freezedetect=n=0.001:d=0.4", "-an", "-f", "null", "-"],
                       capture_output=True, text=True, errors="replace").stderr
    ini = [float(x) for x in re.findall(r"freeze_start: ([\d.]+)", o)]
    fim = [float(x) for x in re.findall(r"freeze_end: ([\d.]+)", o)] + [fv or DUR] * 3
    for a_, b_ in zip(ini, fim):
        meio = [t for t in np.arange(a_, b_, 0.1) if not dentro(t, estatico)]
        if len(meio) < 4: continue
        clipes = clipes_vivos(P)
        if all(dentro(t, clipes) for t in meio):   # cena parada da propria fonte (ex.: cena parada da propria fonte)
            avisos.append(f"insercao de video parada de {a_:.2f} a {b_:.2f} s (conferir se e da fonte)")
        else: falhas.append(f"final parado de {a_:.2f} a {b_:.2f} s")

    # ---------- 4) silencio longo no final
    o = subprocess.run(["ffmpeg", "-v", "info", "-i", str(final), "-af", "silencedetect=n=-45dB:d=1.2", "-f", "null", "-"],
                       capture_output=True, text=True, errors="replace").stderr
    for t in re.findall(r"silence_start: ([\d.]+)", o): avisos.append(f"silencio de mais de 1,2 s a partir de {float(t):.2f} s")

    print(f"verificado: {final.name}, {DUR:.2f} s")
    for a_ in avisos: print("  aviso:", a_)
    if falhas:
        print("FALHOU:"); [print("  -", f) for f in falhas]; sys.exit(1)
    print("PASSOU: duracoes batem, boca na voz, sem travada.")

if __name__ == "__main__":
    main()
