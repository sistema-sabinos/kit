"""Filtro opcional da pessoa recortada (padrao camadas). Fica desligado: so roda quando o recortar-verde.py recebe
--filtro-pessoa. Os valores abaixo sao NEUTROS (sem correcao de luz de lado nenhum); quem quiser um visual proprio
ajusta as constantes de acordo com o cenario da gravacao e confere o resultado com --preview.
O que o filtro faz, nesta ordem:
  1. olheira: clareia so a pele na sombra em volta dos olhos (o YuNet acha os olhos; olho aberto, pupila e cilio
     ficam protegidos). OLHOS = 0 desliga.
  2. cor: contraste e saturacao (CONTRASTE e SAT, 1,0 = sem mudanca) e teto de alta luz, pra mao e testa nao
     estourarem em branco.
  3. luz de lado: brilho na borda do contorno do lado esquerdo da tela (BRILHO), banho de cor nesse lado (BANHO) e
     contraluz no lado direito (FRIA). Em 0 nao fazem nada; as cores LAMP e FRIO so valem se alguem ligar.
Uso: `from filtro_pessoa import aplicar`; `aplicar(rgb, a)` com rgb float 0..1 (H, W, 3) e alfa (H, W) do recorte,
no quadro do bruto (antes de qualquer deslocamento)."""
from pathlib import Path
import cv2
import numpy as np

CONTRASTE, SAT, BRILHO, BANHO, FRIA, OLHOS = 1.0, 1.0, 0.0, 0.0, 0.0, 0.30
LAMP = np.array([1.0, 0.60, 0.22], np.float32)
FRIO = np.array([0.55, 0.75, 1.0], np.float32)
_yunet = cv2.FaceDetectorYN.create(str(Path(__file__).parent / "modelos/face_detection_yunet_2023mar.onnx"), "", (540, 960), 0.6)
_grade = {}


def _malha(H, W):
    if (H, W) not in _grade: _grade[(H, W)] = np.mgrid[0:H, 0:W].astype(np.float32)
    return _grade[(H, W)]


def aplicar(rgb, a):
    H, W = a.shape
    yy, xx = _malha(H, W)
    r = _yunet.detect(cv2.resize((np.clip(rgb, 0, 1)[..., ::-1] * 255).astype(np.uint8), (540, 960)))[1]
    rosto = r[0] * np.array([W / 540, H / 960] * 7 + [1], np.float32) if r is not None else None

    if rosto is not None and OLHOS:
        w, h = rosto[2], rosto[3]
        m = np.zeros((H, W), np.float32); olho = np.zeros((H, W), np.float32)
        for ex, ey in ((rosto[4], rosto[5]), (rosto[6], rosto[7])):
            cv2.ellipse(m, (int(ex), int(ey + 0.035 * h)), (int(0.15 * w), int(0.09 * h)), 0, 0, 360, 1.0, -1)
            cv2.ellipse(olho, (int(ex), int(ey)), (int(0.085 * w), int(0.04 * h)), 0, 0, 360, 1.0, -1)
        m = cv2.GaussianBlur(m, (0, 0), 0.04 * w) * (1 - cv2.GaussianBlur(olho, (0, 0), 0.015 * w))
        lum0 = (rgb * np.array([0.299, 0.587, 0.114], np.float32)).sum(-1)
        escuro = np.clip((lum0 - 0.16) / 0.10, 0, 1) * np.clip((0.62 - lum0) / 0.25, 0, 1)
        rgb = rgb + (OLHOS * m * escuro * (0.62 - lum0).clip(0) * 0.8)[..., None] * np.array([1.0, 0.93, 0.85], np.float32)

    x = np.clip(0.5 + (rgb - 0.5) * CONTRASTE, 0, 1.2)
    x = np.where(x > 0.78, 0.78 + (x - 0.78) * 0.45, x)          # segura a alta luz: mao e testa nao estouram em branco
    lum = (x * np.array([0.299, 0.587, 0.114], np.float32)).sum(-1, keepdims=True)
    x = lum + (x - lum) * SAT
    if BANHO or BRILHO or FRIA:
        cx = float(rosto[0] + rosto[2] / 2) if rosto is not None else W / 2
        esq = np.clip((cx - xx) / 260, 0, 1)
        dir_ = np.clip((xx - cx) / 260, 0, 1)
        borda = np.clip(a - cv2.GaussianBlur(a, (0, 0), 28), 0, 1) * 2.2
        x = x * (1 + BANHO * esq[..., None] * (LAMP * 1.6 - 0.6))
        x = x + (BRILHO * borda * esq)[..., None] * LAMP * x.mean(-1, keepdims=True) * 1.8
        x = x + (FRIA * borda * dir_ * (yy < 0.6 * H))[..., None] * FRIO * 0.5
    return np.clip(np.where(x > 0.86, 0.86 + (x - 0.86) * 0.4, x), 0, 1)
