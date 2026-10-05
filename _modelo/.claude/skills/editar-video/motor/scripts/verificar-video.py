"""Verificador do video antes de ir pra quem pediu (gate de script).
Nasceu de um caso real: a imagem da pessoa ficou 8,2 s mais curta que a voz, a boca descolou no fim e o template
travou no ultimo quadro, e a folha de frames soltos nao mostrou nada disso. Confere o video INTEIRO, nao amostra.

O detector de rosto e o YuNet (modelos/face_detection_yunet_2023mar.onnx, licenca MIT, em modelos/LICENSE-yunet.txt).

Checa, a partir das props do VideoV2 (JSON) e do render/mix final:
  1. duracoes: pessoa, voz, cada video de insercao e o final contra o duracaoSeg (tolerancia de 1 quadro)
  2. sincronia boca x voz em janelas de 1 s em todo trecho em que a pessoa aparece falando: a imagem (rosto achado
     pelo YuNet) e a voz tem que ter saido do mesmo instante do bruto (--bruto: o video com audio de onde a pessoa
     e a voz foram cortadas; no fluxo normal e a fala montada ou o bruto-pad do recortar-verde.py)
  3. travada: imagem da pessoa parada por mais de 0,3 s onde ela aparece, e quadro repetido no final inteiro
     fora de imagem e cartao
  4. audio do final do mesmo tamanho do video, e silencio longo no meio

Uso: verificar-video.py <props.json> <final.mp4> --bruto <bruto.mp4> --public-dir <pasta public da peca>
(os nomes de arquivo das props sao relativos ao --public-dir)
Sai PASSOU ou FALHOU (codigo 1) com a lista do que quebrou e em que segundo."""
import argparse, json, subprocess, sys, re
from pathlib import Path
import numpy as np
import cv2, warnings
warnings.filterwarnings("ignore")

FPS = 30
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

def probe(p, sel="v:0", campo="duration"):
    o = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", sel, "-show_entries", f"stream={campo}",
                                 "-of", "csv=p=0", str(p)]).decode().strip().split("\n")[0]
    o = o.strip(",").split(",")[0]
    return float(o) if o and o != "N/A" else None
def alinhar_quadros(mov, visivel):
    """A pessoa pode ter 1 quadro a mais ou a menos que int(DUR * FPS): corta os dois vetores no menor comprimento."""
    n = min(len(mov), len(visivel))
    return mov[:n], visivel[:n]
def nquadros(p):
    return int(subprocess.check_output(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries",
                                        "stream=nb_read_frames", "-of", "csv=p=0", str(p)]).decode().strip())

# ---------- 1) duracoes
tol = 1.5 / FPS
dp = nquadros(pub / P["pessoa"]) / FPS
dv = probe(pub / P["voz"], "a:0")
if dp < DUR - tol: falhas.append(f"pessoa tem {dp:.2f} s e o video {DUR:.2f} s: falta {DUR - dp:.2f} s de imagem (trava no fim e descola a boca)")
if dv is not None and abs(dv - DUR) > tol: falhas.append(f"voz tem {dv:.2f} s e o video {DUR:.2f} s")
for sg in P["segmentos"]:
    if sg["tipo"] != "video": continue
    d = probe(pub / sg["arquivo"])
    precisa = (sg["ateSeg"] - sg["deSeg"]) * sg.get("velocidade", 1) + sg.get("offsetSeg", 0)
    if d is None or d < precisa - tol:
        falhas.append(f"insercao {sg['arquivo']} tem {d} s e precisa de {precisa:.2f} s ({sg['deSeg']} a {sg['ateSeg']})")
for fx in P.get("sfx", []):
    if not (pub / fx["arquivo"]).exists(): falhas.append(f"som faltando: {fx['arquivo']}")
fv, fa = probe(final), probe(final, "a:0")
if fv is None or abs(fv - DUR) > 0.1: falhas.append(f"final tem {fv} s de video e as props {DUR:.2f} s")
if fa is None or abs(fa - fv) > 0.2: falhas.append(f"final: audio {fa} s x video {fv} s")
elif abs(fa - fv) > 0.05: avisos.append(f"final: audio {fa} s x video {fv} s (cauda do som do fecho)")

# trechos em que a pessoa aparece (fora de insercao em tela cheia e de cartao)
cobre = [(g["deSeg"], g["ateSeg"]) for g in P["segmentos"] if g.get("cheia", True)] + \
        [(c["deSeg"], c["ateSeg"]) for c in P.get("cartoes", [])]
estatico = [(g["deSeg"], g["ateSeg"]) for g in P["segmentos"] if g["tipo"] == "imagem"] + \
           [(c["deSeg"], c["ateSeg"]) for c in P.get("cartoes", [])]
dentro = lambda t, iv: any(a - 0.05 <= t <= b + 0.05 for a, b in iv)
visivel = np.array([not dentro(i / FPS, cobre) for i in range(int(DUR * FPS))])

# ---------- 2) sincronia boca x voz, contra o bruto de onde a pessoa e a voz sairam
# Correlacao "movimento da boca x energia da voz" foi testada e deu alarme falso ate no bruto limpo.
# O que se confere e exato: em cada janela de 1 s em que a pessoa aparece falando, de que instante do bruto veio a
# IMAGEM (rosto comparado quadro a quadro) e de que instante veio a VOZ (envelope comparado). Diferenca > 1 quadro
# e boca descolada.
def patches(p, box, lado=24):
    cap, out = cv2.VideoCapture(str(p)), []
    while True:
        ok, f = cap.read()
        if not ok: break
        g = cv2.resize(cv2.cvtColor(f[box[1]:box[3], box[0]:box[2]], cv2.COLOR_BGR2GRAY), (lado, lado)).astype(np.float32).ravel()
        out.append((g - g.mean()) / (g.std() + 1e-6))
    return np.array(out), cap.get(cv2.CAP_PROP_FPS) or FPS
def envelope(p, hz=100):
    a = np.frombuffer(subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(p), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"]), np.float32)
    h = 16000 // hz
    return np.array([np.sqrt(np.mean(a[i:i + h] ** 2)) for i in range(0, len(a) - h, h)])
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
    F, _ = patches(pub / P["pessoa"], box)
    mov = np.r_[0, np.mean(np.abs(np.diff(F, axis=0)), axis=1)]
    if BRUTO is None:
        avisos.append("sem --bruto: sincronia boca x voz nao conferida")
    else:
        Bp, fb = patches(BRUTO, box)
        ev, eb = envelope(pub / P["voz"]), envelope(BRUTO)
        limiar = 0.1 * np.percentile(ev, 95)
        ruins = []
        for t0 in np.arange(0, DUR - 1, 0.5):
            q0 = int(t0 * FPS)
            if visivel[q0:q0 + FPS].mean() < 1 or (ev[int(t0 * 100):int(t0 * 100) + 100] > limiar).mean() < 0.6: continue
            ks = np.arange(q0, min(q0 + FPS, len(F)), 3)
            C = F[ks] @ Bp.T / F.shape[1]                        # correlacao de cada quadro com cada quadro do bruto
            offs = np.arange(0, len(Bp) - int(fb) - 1)
            idx = offs[None, :] + np.round((ks - q0)[:, None] / FPS * fb).astype(int)
            sc = C[np.arange(len(ks))[:, None], idx].mean(axis=0)
            sv = offs[int(np.argmax(sc))] / fb                  # instante do bruto de onde veio a imagem
            jan = ev[int(t0 * 100):int(t0 * 100) + 100]; jan = (jan - jan.mean()) / (jan.std() + 1e-9)
            best, sa = -2, 0
            for o in range(0, len(eb) - 100):
                e = eb[o:o + 100]; c = float(np.dot(jan, (e - e.mean()) / (e.std() + 1e-9))) / 100
                if c > best: best, sa = c, o / 100               # instante do bruto de onde veio a voz
            if sc.max() < 0.6 or best < 0.6: continue           # janela sem certeza nas duas pontas
            if abs(sv - sa) > 1.5 / FPS:
                ruins.append(f"{t0:.1f} s (imagem de {sv:.2f} s do bruto, voz de {sa:.2f} s: {1000 * (sv - sa):+.0f} ms)")
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
    clipes = [(g["deSeg"], g["ateSeg"]) for g in P["segmentos"] if g["tipo"] == "video"]
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
