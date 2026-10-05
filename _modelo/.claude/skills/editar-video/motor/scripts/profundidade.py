"""Mapa de profundidade de uma imagem (cenario) com o Depth Anything V2 Small (Apache 2.0, ONNX, local e gratis).
Saida: PNG em tons de cinza do tamanho pedido, branco = perto, preto = longe. Usado pelo cenario 3D do kit camadas.
Uso: profundidade.py <imagem> <saida.png> [--largura 540]
O arquivo do modelo (model.onnx de onnx-community/depth-anything-v2-small) vem da variavel DEPTH_MODELO, que o
orquestrador do kit define a partir da pasta de ferramentas do video. E um recurso opcional (so o 3D usa) e esta versao do kit ainda nao traz instalador dele: sem o arquivo, o 3D fica de fora.
Os tamanhos Base e Large do mesmo modelo sao CC-BY-NC: nao trocar sem checar a licenca."""
import os, sys
import numpy as np
from PIL import Image, ImageFilter

MODELO = os.environ.get("DEPTH_MODELO", "")
if not MODELO or not os.path.exists(MODELO):
    sys.exit("o modelo de profundidade (DEPTH_MODELO, o model.onnx do Depth Anything V2 Small) nao esta instalado nesta versao do kit, entao o 3D com relevo fica de fora. Siga com o cenario parado.")
import onnxruntime as ort

ent, sai = sys.argv[1], sys.argv[2]
os.makedirs(os.path.dirname(sai) or ".", exist_ok=True)
larg = int(sys.argv[sys.argv.index("--largura") + 1]) if "--largura" in sys.argv else 540

im = Image.open(ent).convert("RGB")
W, H = im.size
# lado multiplo de 14, mantendo a proporcao (518 no lado curto, como no treino)
w = 518
h = int(round(H / W * w / 14)) * 14
x = np.asarray(im.resize((w, h), Image.BICUBIC), dtype=np.float32) / 255.0
x = (x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
x = x.transpose(2, 0, 1)[None].astype(np.float32)

s = ort.InferenceSession(MODELO, providers=["CPUExecutionProvider"])
d = s.run(None, {s.get_inputs()[0].name: x})[0].squeeze()
d = (d - d.min()) / (d.max() - d.min() + 1e-9)
out = Image.fromarray((d * 255).astype(np.uint8)).resize((larg, int(round(H / W * larg))), Image.BICUBIC)
out = out.filter(ImageFilter.GaussianBlur(1.5))  # suaviza degrau na borda dos objetos (menos rasgo na malha)
out.save(sai)
print("ok", sai, out.size, "entrada", (w, h))
