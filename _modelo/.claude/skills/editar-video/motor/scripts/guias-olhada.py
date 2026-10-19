"""Desenha guias num quadro de olhada (PNG 1080x1920 tirado do render antes de renderizar o video inteiro):
faixa da zona segura (regua 'consenso' do zona-segura.py), linha do topo da legenda, caixa do rosto (YuNet, o mesmo
modelo do verificar-video.py) e caixa de cada chave visivel. Imprime um aviso quando a chave cai em cima do rosto ou o
rosto sai do quadro. Saida 0 sempre: e olhada, quem decide e quem olha.

Uso: guias-olhada.py <entrada.png> <saida.png> --modelo <yunet.onnx> --zona-segura <zona-segura.py> --topo-legenda 1240
     [--chave "topo,altura"]..."""
import argparse, importlib.util, os, sys
from pathlib import Path
import cv2
import numpy as np

def reguas(caminho):
    # sem isto o importlib grava __pycache__ no motor do kit, o hash do motor muda e o render seguinte sai com codigo 3
    sys.dont_write_bytecode = True
    spec =importlib.util.spec_from_file_location("zona_segura", caminho)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m.REGUAS["consenso"]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("entrada"); ap.add_argument("saida")
    ap.add_argument("--modelo", required=True); ap.add_argument("--zona-segura", required=True)
    ap.add_argument("--topo-legenda", type=int, default=1240)
    ap.add_argument("--chave", action="append", default=[])
    a = ap.parse_args()
    img = cv2.imread(a.entrada)
    if img is None: sys.exit(f"nao abri {a.entrada}")
    h, w = img.shape[:2]
    original = img.copy()
    r = reguas(a.zona_segura)
    camada = img.copy()
    vermelho, amarelo, verde, azul = (40, 40, 230), (0, 220, 255), (60, 200, 60), (230, 140, 40)
    for x0, y0, x1, y1 in [(0, 0, w, r["topo"]), (0, h - r["base"], w, h), (0, 0, r["esquerda"], h), (w - r["direita"], 0, w, h)]:
        cv2.rectangle(camada, (x0, y0), (x1, y1), vermelho, -1)
    img = cv2.addWeighted(camada, 0.25, img, 0.75, 0)
    cv2.line(img, (0, a.topo_legenda), (w, a.topo_legenda), amarelo, 3)
    # mesma meia resolucao do fiscal.py:215 e do filtro_pessoa.py:20; detecta no quadro limpo, antes das guias
    det = cv2.FaceDetectorYN.create(a.modelo, "", (w // 2, h // 2), 0.7)
    _, rostos = det.detect(cv2.resize(original, (w // 2, h // 2)))
    if rostos is not None: rostos = rostos[:, :14] * 2   # caixa e os 5 pontos (olhos, nariz, cantos da boca)
    avisos = []
    caixa_rosto = None
    if rostos is None or len(rostos) == 0:
        avisos.append("rosto nao achado no quadro (cortado pelo zoom ou coberto)")
    else:
        x, y, rw, rh = [int(v) for v in rostos[0][:4]]
        # o que nao pode ser coberto vai do olho a boca; a caixa do YuNet desce ate o queixo, onde a chave no peito encosta
        pontos_y = [int(v) for v in rostos[0][5:14:2]]
        caixa_rosto = (x, min(pontos_y), x + rw, max(pontos_y))
        cv2.rectangle(img, (x, y), (x + rw, y + rh), verde, 2)
        cv2.rectangle(img, caixa_rosto[:2], caixa_rosto[2:], verde, 5)
        if y < r["topo"]: avisos.append(f"topo do rosto em {y} px, dentro da faixa de cima ({r['topo']} px)")
    for c in a.chave:
        topo, alt = [int(v) for v in c.split(",")]
        cv2.rectangle(img, (0, topo), (w, topo + alt), azul, 3)
        if caixa_rosto and topo < caixa_rosto[3] and topo + alt > caixa_rosto[1]:
            avisos.append(f"chave de {topo} a {topo + alt} px passa por cima do rosto ({caixa_rosto[1]} a {caixa_rosto[3]} px)")
        if topo + alt > a.topo_legenda:
            avisos.append(f"chave desce ate {topo + alt} px e encosta na legenda ({a.topo_legenda} px)")
    os.makedirs(os.path.dirname(os.path.abspath(a.saida)), exist_ok=True)
    cv2.imwrite(a.saida, img)
    print(f"{Path(a.saida).name}: " + ("; ".join(avisos) if avisos else "sem aviso"))

if __name__ == "__main__":
    main()
