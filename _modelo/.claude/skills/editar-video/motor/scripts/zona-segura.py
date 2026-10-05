"""Confere se o texto queimado de um vídeo 9:16 cai na interface das plataformas.

Uso:
    zona-segura.py video.mp4
    zona-segura.py video.mp4 --nivel consenso --amostras 24 --salvar-mapa
(quem chama e o orquestrador do kit, que escolhe o Python da maquina)

A régua vem de `referencias/zona-segura.md` da skill editar-video (medições cruzadas de 2026, conferidas em 22/09/2026).
Só a Meta publica número oficial, e é de anúncio; o resto é medição de terceiro. Por isso
há dois níveis, e o script imprime os dois quando encontra violação.

O que ele detecta: pixel quase branco formando corrida horizontal, que é a assinatura da
legenda e do cartão do nosso template (branco com contorno preto). Não detecta texto escuro
sobre fundo claro, nem elemento colorido sem branco. Ausência de alarme não é prova de que
está tudo certo, então o olho no still continua valendo.

Limite conhecido: ele não sabe distinguir texto NOSSO de texto que já vinha no clipe de
terceiro. Marca d'água de emissora, crédito e legenda de matéria disparam alarme de lateral e
não são defeito nosso. O alarme que importa é o de BASE, que é onde a nossa legenda mora.

Saída: código 0 quando passa, 1 quando alguma banda é invadida.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

# Régua em pixels reservados por borda, sobre 1080x1920.
# Fonte e data de cada número em referencias/zona-segura.md da skill editar-video.
REGUAS = {
    # pior caso de todas as medições que achei: TikTok pela EzUGC (jun/2026, mod. ago/2026)
    "duro": {"topo": 250, "base": 484, "esquerda": 60, "direita": 140},
    # consenso do agrupamento das fontes de 2026 (TikTok ~370, Reels ~450, Shorts ~390)
    "consenso": {"topo": 220, "base": 450, "esquerda": 60, "direita": 120},
    # Meta Ads Guide, único número oficial, para quando a peça virar anúncio
    "anuncio-meta": {"topo": 269, "base": 672, "esquerda": 65, "direita": 65},
}

LIMIAR_BRANCO = 245   # 0 a 255
LIMIAR_PRETO = 60     # o contorno da nossa legenda é preto puro
RAIO_CONTORNO = 6     # distância em px onde o preto do contorno tem que aparecer
MIN_PIXELS_LINHA = 8  # pixels de texto numa linha pra ela contar
MIN_PIXELS_COLUNA = 8
MIN_TRACOS_LINHA = 4  # quantos blocos separados a linha precisa ter pra ser texto
# Quando o texto ocupa mais que isso da largura, ele não é um bloco de texto perto da borda:
# é elemento de sangria (cartão de inserção em tela cheia, print de página, clipe de terceiro
# com marca d'água). Aí a invasão lateral vira aviso, e não reprovação.
FRACAO_SANGRIA = 0.75


def dimensoes(video: Path) -> tuple[int, int, float]:
    saida = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,duration", "-of", "json", str(video)],
        capture_output=True, text=True, check=True,
    ).stdout
    fluxo = json.loads(saida)["streams"][0]
    dur = float(fluxo.get("duration") or 0)
    if dur <= 0:  # alguns mp4 só trazem duração no container
        saida = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", str(video)],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
        dur = float(saida or 0)
    return int(fluxo["width"]), int(fluxo["height"]), dur


def extrair(video: Path, instantes: list[float], destino: Path) -> list[Path]:
    arquivos = []
    for i, t in enumerate(instantes):
        alvo = destino / f"q{i:03d}.png"
        subprocess.run(
            ["ffmpeg", "-nostdin", "-v", "error", "-ss", f"{t:.3f}",
             "-i", str(video), "-frames:v", "1", str(alvo), "-y"],
            check=True,
        )
        if alvo.exists():
            arquivos.append(alvo)
    return arquivos


def mascara_de_texto(cinza: np.ndarray) -> np.ndarray:
    """Pixel quase branco que tem preto perto, que é a assinatura do contorno da legenda.

    Imagem clara de vídeo (parede, tela acesa, céu) também é quase branca, mas não tem
    preto puro colado. Sem este segundo teste o detector acusa o vídeo inteiro.
    """
    branco = cinza >= LIMIAR_BRANCO
    if not branco.any():
        return branco
    preto = cinza <= LIMIAR_PRETO
    # dilata o preto por RAIO_CONTORNO com máximo móvel separável, sem depender de scipy
    d = preto
    for eixo in (0, 1):
        acc = d
        for passo in range(1, RAIO_CONTORNO + 1):
            acc = acc | np.roll(d, passo, axis=eixo) | np.roll(d, -passo, axis=eixo)
        d = acc
    return branco & d


def linhas_de_texto(mascara: np.ndarray) -> np.ndarray:
    """Índices das linhas que parecem texto, e não objeto claro do cenário.

    Uma linha de texto cruza várias letras, então ela liga e desliga muitas vezes.
    A luz de anel do cenário de gravação também é branca com preto em volta, mas é um
    arco contínuo: liga e desliga uma ou duas vezes. Contar as viradas separa os dois.
    """
    tem_px = mascara.sum(axis=1) >= MIN_PIXELS_LINHA
    viradas = np.diff(mascara.astype(np.int8), axis=1)
    tracos = (viradas == 1).sum(axis=1)
    return np.where(tem_px & (tracos >= MIN_TRACOS_LINHA))[0]


def caixa_do_texto(png: Path) -> tuple[int, int, int, int] | None:
    """Menor retângulo que contém o texto do frame, ou None se não houver."""
    cinza = np.array(Image.open(png).convert("L"))
    mascara = mascara_de_texto(cinza)
    linhas = linhas_de_texto(mascara)
    if len(linhas) == 0:
        return None
    # as colunas saem só das linhas que já passaram no teste de texto
    so_texto = np.zeros_like(mascara)
    so_texto[linhas] = mascara[linhas]
    colunas = np.where(so_texto.sum(axis=0) >= MIN_PIXELS_COLUNA)[0]
    if len(colunas) == 0:
        return None
    return int(linhas[0]), int(linhas[-1]), int(colunas[0]), int(colunas[-1])


def main() -> int:
    # o console do Windows abre em cp1252 e come os acentos; força UTF-8 na saída
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, OSError):
        pass
    ap = argparse.ArgumentParser(description="Confere zona segura de vídeo vertical.")
    ap.add_argument("video", type=Path)
    ap.add_argument("--nivel", choices=sorted(REGUAS), default="duro")
    ap.add_argument("--amostras", type=int, default=20)
    ap.add_argument("--salvar-mapa", action="store_true",
                    help="grava <video>.zona-segura.png com as bandas desenhadas sobre o pior frame")
    args = ap.parse_args()

    if not args.video.exists():
        print(f"não achei {args.video}")
        return 2

    largura, altura, duracao = dimensoes(args.video)
    if (largura, altura) != (1080, 1920):
        print(f"aviso: régua é pra 1080x1920 e este vídeo é {largura}x{altura}; "
              f"os números saem proporcionais mesmo assim")

    regua = REGUAS[args.nivel]
    lim_topo = round(altura * regua["topo"] / 1920)
    lim_base = altura - round(altura * regua["base"] / 1920)
    lim_esq = round(largura * regua["esquerda"] / 1080)
    lim_dir = largura - round(largura * regua["direita"] / 1080)

    instantes = [duracao * (i + 0.5) / args.amostras for i in range(args.amostras)]
    with tempfile.TemporaryDirectory() as tmp:
        frames = extrair(args.video, instantes, Path(tmp))
        piores = {"topo": None, "base": None, "esquerda": None, "direita": None}
        pior_frame = None
        com_texto = 0
        largura_texto = None  # maior largura de caixa de texto vista, pra detectar sangria
        for png, t in zip(frames, instantes):
            caixa = caixa_do_texto(png)
            if caixa is None:
                continue
            com_texto += 1
            cima, baixo, esq, dir_ = caixa
            larg = dir_ - esq
            if largura_texto is None or larg > largura_texto:
                largura_texto = larg
            if cima < lim_topo and (piores["topo"] is None or cima < piores["topo"][0]):
                piores["topo"] = (cima, t)
            if baixo > lim_base and (piores["base"] is None or baixo > piores["base"][0]):
                piores["base"] = (baixo, t)
                pior_frame = (Image.open(png).copy(), t)
            if esq < lim_esq and (piores["esquerda"] is None or esq < piores["esquerda"][0]):
                piores["esquerda"] = (esq, t)
            if dir_ > lim_dir and (piores["direita"] is None or dir_ > piores["direita"][0]):
                piores["direita"] = (dir_, t)

        print(f"arquivo   {args.video.name}")
        print(f"régua     {args.nivel}  topo {regua['topo']}  base {regua['base']}  "
              f"lados {regua['esquerda']}/{regua['direita']}")
        print(f"amostras  {len(frames)} frames, {com_texto} com texto claro")
        print()

        problemas = []
        lateral = []
        sangria = largura_texto is not None and largura_texto >= FRACAO_SANGRIA * largura
        if piores["topo"]:
            y, t = piores["topo"]
            problemas.append(f"TOPO    texto sobe até y={y}, limite {lim_topo}, "
                             f"invade {lim_topo - y} px (em {t:.1f} s)")
        if piores["base"]:
            y, t = piores["base"]
            problemas.append(f"BASE    texto desce até y={y}, limite {lim_base}, "
                             f"invade {y - lim_base} px (em {t:.1f} s)")
        destino = lateral if sangria else problemas
        if piores["esquerda"]:
            x, t = piores["esquerda"]
            destino.append(f"ESQ     texto começa em x={x}, limite {lim_esq}, "
                           f"invade {lim_esq - x} px (em {t:.1f} s)")
        if piores["direita"]:
            x, t = piores["direita"]
            destino.append(f"DIR     texto vai até x={x}, limite {lim_dir}, "
                           f"invade {x - lim_dir} px (em {t:.1f} s)")

        if not problemas and not lateral:
            print("PASSOU. Nenhum texto claro dentro das bandas reservadas.")
            return 0

        if not problemas:
            print("PASSOU na base e no topo, que é o que trava.")
            print("  Aviso de lateral, em elemento que ocupa a largura toda:")
            for l in lateral:
                print("    " + l)
            print("  Isso costuma ser cartão de inserção em tela cheia ou marca d'água de clipe")
            print("  de terceiro. Confira no still antes de mexer: se for texto NOSSO perto da")
            print("  borda, corrija; se for sangria, siga.")
            return 0

        print("REPROVOU")
        for p in problemas:
            print("  " + p)
        for l in lateral:
            print("  aviso (elemento de sangria): " + l)
        print("  Se for a legenda do sistema: encurte a palavra mais longa da página no alinhado")
        print("  (voz.alinhado.json), por exemplo 'gramas.' vira 'g.', e renderize de novo. A fonte")
        print("  e o tamanho da legenda são fixos, então o conserto é no texto.")

        if piores["base"] and args.nivel != "consenso":
            folga = altura - round(altura * REGUAS["consenso"]["base"] / 1920)
            y = piores["base"][0]
            estado = "também estoura" if y > folga else "passaria"
            print(f"\n  na régua 'consenso' (base {REGUAS['consenso']['base']} px) isso {estado}")

        if args.salvar_mapa and pior_frame is not None:
            img, t = pior_frame
            px = img.load()
            for y in range(altura):
                dentro = y < lim_topo or y > lim_base
                for x in range(largura):
                    if dentro or x < lim_esq or x > lim_dir:
                        r, g, b = px[x, y][:3]
                        px[x, y] = (min(255, r + 70), g // 2, b // 2)
            destino = args.video.with_suffix(".zona-segura.png")
            img.save(destino)
            print(f"\n  mapa do pior frame ({t:.1f} s) em {destino}")

        return 1


if __name__ == "__main__":
    sys.exit(main())
