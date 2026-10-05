"""
Recorte de fundo verde + relighting do rosto, em Python/OpenCV, frame a frame via ffmpeg.

Uso:
  node .claude/skills/editar-video/scripts/py.mjs chroma.py ENTRADA.mp4 FUNDO.jpg|FUNDO.mp4 SAIDA.mp4 [--cena NOME] [--luz] [--sem-casar-cor] [--preview N]

PADRAO (o fundo vai NITIDO, sem desfoque, escurecimento nem vinheta;
--desfocar liga o desfoque): recorte + despill + fundo desfocado +
casamento automatico de cor e exposicao do sujeito com o fundo + grao fino. NENHUMA luz pintada
(a versao com contraluz deixou "aura branca" e foi reprovada). --luz liga o relighting antigo se um dia precisar.

Cenas (definem cor da luz principal, preenchimento, contraluz e grade do fundo):
  led      luz principal fria, contraluz azul/verde (estilo estúdio com LED)
  quente   luz principal quente (abajur), contraluz âmbar
  dia      luz principal neutra de janela, contraluz branca suave

Como funciona:
  1. alpha = 1 - clip((G - max(R,B) - lo) / (hi - lo))   (screen difference, robusto a verde desigual)
  2. despill: G = min(G, mix(R,B)) onde havia verde refletido (pele, ombro)
  3. relighting no sujeito: gradiente direcional (principal a 45 graus, um pouco acima dos olhos),
     preenchimento fraco do lado oposto, contraluz (rim) na borda da máscara do lado da luz de fundo
  4. fundo: desfoque leve (profundidade), leve vinheta, mesma temperatura de cor do sujeito
  5. composite alpha premultiplicado, grão fino pra colar as duas camadas
"""
import argparse, os, subprocess, sys
import numpy as np, cv2

CENAS = {
    # (cor da principal em RGB 0..1, força principal, força preenchimento, cor do rim RGB, força rim, tinta das sombras RGB, blur do fundo)
    "led":    dict(key=(1.00, 0.97, 0.92), key_gain=0.34, fill_gain=0.08, dark=0.22, rim=(0.30, 0.70, 1.00), rim_gain=1.10, shadow=(0.86, 0.93, 1.12), sat=1.12, desk_dim=0.40, bg_blur=9,  bg_gain=0.80),
    "quente": dict(key=(1.00, 0.92, 0.80), key_gain=0.32, fill_gain=0.10, dark=0.20, rim=(1.00, 0.72, 0.38), rim_gain=0.85, shadow=(1.05, 0.98, 0.90), sat=1.10, desk_dim=0.28, bg_blur=11, bg_gain=0.85),
    "estante": dict(key=(1.00, 0.95, 0.88), key_gain=0.14, fill_gain=0.06, dark=0.10, rim=(0, 0, 0), rim_gain=0.0, shadow=(1.03, 0.99, 0.94), sat=1.06, desk_dim=0.22, bg_blur=6,  bg_gain=0.80, wrap=0.55),
    "dia":    dict(key=(1.00, 0.99, 0.96), key_gain=0.30, fill_gain=0.16, dark=0.12, rim=(1.00, 1.00, 1.00), rim_gain=0.70, shadow=(0.99, 0.99, 1.02), sat=1.06, desk_dim=0.00, bg_blur=7,  bg_gain=1.00),
}

def probe(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate,nb_frames", "-of", "csv=p=0", path]).decode().strip().split(",")
    w, h = int(out[0]), int(out[1]); num, den = out[2].split("/"); fps = int(num) / int(den)
    return w, h, fps

VIDEO_EXT = (".mp4", ".mov", ".webm", ".mkv")

def vinheta(w, h):
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2)
    return np.clip(1.0 - 0.35 * np.clip(r - 0.55, 0, 1) ** 1.5, 0, 1)

def tratar_fundo(bg8, cena, vin):
    """frame de fundo ja no tamanho w x h (uint8 BGR) -> float 0..1 com blur, ganho e vinheta"""
    bg = bg8.astype(np.float32) / 255.0
    k = cena["bg_blur"]
    if k > 0: bg = cv2.GaussianBlur(bg, (0, 0), k)
    bg *= cena["bg_gain"]
    return np.clip(bg * vin[..., None], 0, 1)

def preparar_fundo(path, w, h, cena):
    bg = cv2.imread(path, cv2.IMREAD_COLOR)
    if bg is None: sys.exit(f"fundo nao abriu: {path}")
    # cover: escala pra preencher e corta no centro
    s = max(w / bg.shape[1], h / bg.shape[0])
    bg = cv2.resize(bg, (int(bg.shape[1] * s + 0.5), int(bg.shape[0] * s + 0.5)), interpolation=cv2.INTER_AREA)
    x0 = (bg.shape[1] - w) // 2; y0 = (bg.shape[0] - h) // 2
    return tratar_fundo(bg[y0:y0 + h, x0:x0 + w], cena, vinheta(w, h))

def abrir_fundo_video(path, w, h):
    """fundo em video (camada de tras renderizada no Remotion: cenario + texto animado). Decodifica em
    cover w x h, um frame por frame do sujeito, pro texto atras da pessoa."""
    return subprocess.Popen(["ffmpeg", "-v", "error", "-i", path, "-vf",
        f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"],
        stdout=subprocess.PIPE)

def cor_do_fundo(bg):
    """Mede o fundo e devolve o ajuste pro sujeito: balanco de branco parcial (50% do desvio do fundo
    em relacao ao neutro) e exposicao proporcional a luminancia do fundo (fundo escuro, sujeito um pouco
    mais escuro). E o que faz rosto e corpo ficarem no mesmo tom do cenario, sem pintar luz."""
    m = bg.reshape(-1, 3).mean(0) + 1e-6            # BGR
    g = m[1]
    bal = np.array([(m[0] / g) ** 0.5, 1.0, (m[2] / g) ** 0.5], np.float32)
    bal = np.clip(bal, 0.78, 1.22)   # fundo muito saturado (LED azul) nao pode tingir a pele
    bal = bal / (0.114 * bal[0] + 0.587 * bal[1] + 0.299 * bal[2])   # mantem a luminancia
    lum = float(0.114 * m[0] + 0.587 * m[1] + 0.299 * m[2])
    exp = float(np.clip(0.80 + 0.5 * lum, 0.85, 1.0))
    return dict(bal=tuple(bal.tolist()), exp=exp, gamma=1.05)

def mapas_de_luz(w, h, lado_key):
    """Mapas fixos (o sujeito fica no mesmo lugar): principal, preenchimento, direção do rim."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    nx = (xx / w) * 2 - 1; ny = (yy / h) * 2 - 1
    # principal a 45 graus do lado `lado_key` (+1 direita da tela, -1 esquerda), um pouco acima dos olhos (y ~ -0.6)
    kx, ky = 0.8 * lado_key, -0.6
    d = np.sqrt((nx - kx) ** 2 + ((ny - ky) * 0.7) ** 2)
    key = np.clip(1.0 - d / 1.9, 0, 1) ** 1.6
    d2 = np.sqrt((nx + kx) ** 2 + ((ny - 0.1) * 0.7) ** 2)
    fill = np.clip(1.0 - d2 / 2.2, 0, 1) ** 1.2
    # rim só na metade de cima (cabeça e ombros), mesa escurece nas cenas escuras
    rim_v = np.clip((0.62 - yy / h) / 0.25, 0, 1)
    desk = np.clip((yy / h - 0.70) / 0.30, 0, 1) ** 1.5
    return key, fill, rim_v, desk

def processar(entrada, fundo, saida, cena_nome, lado_key, lo, hi, preview_frame, sem_luz=False, casar_cor=False, fundo_nitido=False):
    cena = dict(CENAS[cena_nome])
    if fundo_nitido: cena.update(bg_blur=0, bg_gain=1.0)   # cenario como veio, sem desfoque nem escurecer
    w, h, fps = probe(entrada)
    fundo_video = fundo.lower().endswith(VIDEO_EXT)
    vin = np.ones((h, w), np.float32) if fundo_nitido else vinheta(w, h)
    dec_bg = abrir_fundo_video(fundo, w, h) if fundo_video else None
    ultimo_bg8 = None
    def proximo_fundo():
        # video: le o frame seguinte (se acabar antes do sujeito, congela no ultimo); imagem: fixo
        nonlocal ultimo_bg8
        raw_bg = dec_bg.stdout.read(w * h * 3)
        if len(raw_bg) == w * h * 3: ultimo_bg8 = np.frombuffer(raw_bg, np.uint8).reshape(h, w, 3)
        # video vem pronto do Remotion (cenario ja desfocado la, texto nitido): sem blur, ganho ou vinheta aqui
        return np.clip(ultimo_bg8.astype(np.float32) / 255.0, 0, 1)
    bg = proximo_fundo() if fundo_video else preparar_fundo(fundo, w, h, cena)
    bg_wrap = cv2.GaussianBlur(bg, (0, 0), 30)   # fundo bem desfocado, fonte do light wrap
    cor_auto = cor_do_fundo(bg)   # medido no primeiro frame do fundo (texto animado nao deve mudar a cor do sujeito)
    if casar_cor: print("casar cor: bal BGR", np.round(cor_auto["bal"], 3), "exp", round(cor_auto["exp"], 3))
    key_map, fill_map, rim_v, desk = mapas_de_luz(w, h, lado_key)
    key_col = np.array(cena["key"][::-1], np.float32); rim_col = np.array(cena["rim"][::-1], np.float32)
    shadow = np.array(cena["shadow"][::-1], np.float32)
    rng = np.random.default_rng(7)

    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", entrada, "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], stdout=subprocess.PIPE)
    enc = None
    if preview_frame is None:
        enc = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", str(fps), "-i", "-",
            "-i", entrada, "-map", "0:v", "-map", "1:a?", "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p",
            "-c:a", "copy", "-shortest", saida], stdin=subprocess.PIPE)
    n = 0
    while True:
        raw = dec.stdout.read(w * h * 3)
        if len(raw) < w * h * 3: break
        if preview_frame is not None and n < preview_frame:
            n += 1
            if fundo_video: dec_bg.stdout.read(w * h * 3)   # mantem os dois decodificadores em sincronia
            continue
        if fundo_video and n > 0:
            bg = proximo_fundo()
            if cena.get("wrap", 0) > 0 and not sem_luz: bg_wrap = cv2.GaussianBlur(bg, (0, 0), 30)
        fr = np.frombuffer(raw, np.uint8).reshape(h, w, 3).astype(np.float32) / 255.0
        b, g, r = fr[..., 0], fr[..., 1], fr[..., 2]
        # 1. matte
        diff = g - np.maximum(r, b)
        alpha = 1.0 - np.clip((diff - lo) / (hi - lo), 0, 1)
        alpha = cv2.GaussianBlur(alpha, (0, 0), 0.8)
        alpha = np.clip((alpha - 0.05) / 0.9, 0, 1)   # tira a franja quase transparente
        # 2. despill
        spill = np.clip(g - (r * 0.55 + b * 0.45), 0, 1)
        g_ds = g - spill
        fg = np.stack([b, g_ds, r], -1)
        if casar_cor:
            # casar cor e exposicao do sujeito com o fundo (sem pintar luz): balanco de branco parcial,
            # exposicao um pouco abaixo (fundo escuro), leve gamma pra contraste, grao fino em tudo
            cc = cor_auto
            fg = fg * np.array(cc["bal"], np.float32)[None, None, :] * cc["exp"]
            fg = np.clip(fg, 0, 1) ** cc["gamma"]
        if sem_luz:
            fg = np.clip(fg, 0, 1)
            out = fg * alpha[..., None] + bg * (1 - alpha[..., None])
            if casar_cor: out += rng.normal(0, 0.006, (h, w, 1)).astype(np.float32)
            out8 = (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)
            if preview_frame is not None:
                cv2.imwrite(saida, out8, [cv2.IMWRITE_JPEG_QUALITY, 92]); break
            enc.stdin.write(out8.tobytes()); n += 1
            if n % 60 == 0: print(f"  {n} frames", flush=True)
            continue
        # sombra fica com a tinta da cena (a pele perde o verde e ganha a cor do ambiente)
        lum = 0.114 * b + 0.587 * g_ds + 0.299 * r
        tint = shadow[None, None, :] * (1 - lum[..., None]) + 1.0 * lum[..., None]
        fg = fg * tint
        # 3. relighting
        fg = fg * (1 + cena["key_gain"] * key_map[..., None] * key_col) * (1 + cena["fill_gain"] * fill_map[..., None])
        fg = fg * (1 - cena["dark"] * (1 - key_map[..., None]))   # lado oposto à principal cai (sombra suave, profundidade)
        # um pouco de saturação de volta na pele (o despill deixa a pele cinza)
        lum2 = (0.114 * fg[..., 0] + 0.587 * fg[..., 1] + 0.299 * fg[..., 2])[..., None]
        fg = lum2 + (fg - lum2) * cena["sat"]
        # rim: borda da máscara do lado oposto à principal (contraluz separa do fundo)
        a8 = (alpha * 255).astype(np.uint8)
        er = cv2.erode(a8, np.ones((15, 15), np.uint8)).astype(np.float32) / 255.0
        borda = np.clip(alpha - er, 0, 1)
        borda = cv2.GaussianBlur(borda, (0, 0), 4.0)
        lado = np.clip((-lado_key) * ((np.arange(w, dtype=np.float32) / w) * 2 - 1) + 0.35, 0, 1)[None, :]
        fg = fg + (borda * alpha * rim_v)[..., None] * lado[..., None] * cena["rim_gain"] * rim_col
        fg = fg * (1 - cena["desk_dim"] * desk[..., None])
        if cena.get("wrap", 0) > 0:
            # máscara de borda interna: quanto do fundo "vaza" pra dentro do sujeito (blur do inverso da alpha)
            wm = cv2.GaussianBlur(1.0 - alpha, (0, 0), 10) * alpha
            wm = np.clip(wm * 2.2, 0, 1) * cena["wrap"]
            fg = 1 - (1 - fg) * (1 - bg_wrap * wm[..., None])   # screen com o fundo desfocado
        fg = np.clip(fg, 0, 1)
        # 4/5. composite + grão
        out = fg * alpha[..., None] + bg * (1 - alpha[..., None])
        out += rng.normal(0, 0.006, (h, w, 1)).astype(np.float32)
        out8 = (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)
        if preview_frame is not None:
            cv2.imwrite(saida, out8, [cv2.IMWRITE_JPEG_QUALITY, 92]); break
        enc.stdin.write(out8.tobytes()); n += 1
        if n % 60 == 0: print(f"  {n} frames", flush=True)
    dec.stdout.close()
    if dec_bg: dec_bg.stdout.close(); dec_bg.terminate()
    if enc: enc.stdin.close(); enc.wait()
    print("ok:", saida)

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("entrada"); p.add_argument("fundo"); p.add_argument("saida")
    p.add_argument("--cena", default="led", choices=CENAS.keys())
    p.add_argument("--lado", type=int, default=1, help="+1 principal vindo da direita da tela, -1 da esquerda")
    p.add_argument("--lo", type=float, default=0.03); p.add_argument("--hi", type=float, default=0.16)
    p.add_argument("--preview", type=int, default=None, help="so salva o frame N como JPG")
    p.add_argument("--luz", action="store_true", help="liga o relighting pintado (principal, sombra, light wrap). Padrao: desligado, testado e descartado: deixava aura branca")
    p.add_argument("--desfocar", action="store_true", help="desfoca, escurece 20%% e poe vinheta no cenario (era o padrao antigo; agora o cenario vai nitido)")
    p.add_argument("--sem-casar-cor", action="store_true", help="desliga o casamento automatico de cor e exposicao com o fundo (padrao: ligado)")
    a = p.parse_args()
    os.makedirs(os.path.dirname(a.saida) or ".", exist_ok=True)
    processar(a.entrada, a.fundo, a.saida, a.cena, a.lado, a.lo, a.hi, a.preview, sem_luz=not a.luz, casar_cor=not a.sem_casar_cor, fundo_nitido=not a.desfocar)
