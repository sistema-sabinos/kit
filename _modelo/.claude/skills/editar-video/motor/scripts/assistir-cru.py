"""
Prepara o cru pra IA assistir antes de cortar (passo 3.2b do /editar-video). Grava em SAIDA/:
  folha-01.jpg ...  folhas de contato, um quadro a cada --passo s (padrao 2), 4 por linha e 3 linhas, com o tempo
                    escrito em cada quadro: e por elas que a IA ve o video inteiro (assunto, arco, take repetido)
  tira-01.jpg ...   uma por trecho da tabela do blocos.py: 3 quadros em volta do inicio e 3 em volta do fim do
                    corte sugerido, com o tempo e a marca do rosto
  bordas.md         a tabela dos trechos com o corte sugerido e as marcas de borda
O corte sugerido e o de sempre (0,20 s antes e 0,15 s depois do trecho), mas nunca passa do meio da pausa ate o
trecho vizinho, pra montagem nao repetir fala. O YuNet do kit marca em cada quadro de borda "sem rosto" e
"virado" (nariz fora do meio dos olhos em mais de 0,3 da distancia entre eles: cabeca virando pra ler).
Tudo local, sem rede e sem custo.

Uso: assistir-cru.py BRUTO.mp4 BLOCOS.md SAIDA/ [--passo 2]
"""
import argparse, os, re, subprocess, sys, tempfile, shutil
from pathlib import Path
import cv2
import numpy as np

LARG, ALT = 216, 384
MODELO = Path(__file__).parent / "modelos/face_detection_yunet_2023mar.onnx"


def ler_blocos(texto):
    trechos = []
    for l in texto.splitlines():
        c = [x.strip() for x in l.strip().strip("|").split("|")]
        if len(c) >= 5 and c[0].isdigit():
            trechos.append((int(c[0]), float(c[1]), float(c[2]), c[4]))
    return trechos


def cortes_sugeridos(trechos, antes=0.20, depois=0.15):
    """(ini, fim) de cada trecho com a folga, sem passar do meio da pausa ate o vizinho."""
    out = []
    for k, (_, i, f, _) in enumerate(trechos):
        ini, fim = max(0.0, i - antes), f + depois
        if k > 0: ini = max(ini, (trechos[k - 1][2] + i) / 2)
        if k + 1 < len(trechos): fim = min(fim, (f + trechos[k + 1][1]) / 2)
        out.append((round(ini, 2), round(fim, 2)))
    return out


def marca_rosto(rostos):
    """rostos: saida do YuNet (ou None). Devolve '' (rosto de frente), 'sem rosto' ou 'virado'."""
    if rostos is None or len(rostos) == 0: return "sem rosto"
    r = max(rostos, key=lambda x: x[2] * x[3])
    olho_d, olho_e, nariz = np.array(r[4:6]), np.array(r[6:8]), np.array(r[8:10])
    dist = np.linalg.norm(olho_e - olho_d)
    if dist < 1: return "sem rosto"
    return "virado" if abs(nariz[0] - (olho_d[0] + olho_e[0]) / 2) / dist > 0.3 else ""


def quadros(bruto, tempos, pasta):
    """{tempo: quadro} numa passada so do ffmpeg: buscar quadro a quadro no 4K HEVC do celular levava 6 min num cru
    de 3 min. Seleciona os quadros a meio quadro de cada tempo e le o tempo de cada um no showinfo; o filtro vai por
    arquivo (-/vf), que a linha de comando do Windows nao cabe num video longo. Tempo sem quadro sai preto."""
    alvos = sorted({round(max(0.0, t), 3) for t in tempos})
    filtro = os.path.join(pasta, "filtro.txt")
    # soma em arvore balanceada: a soma em fila com centenas de termos estoura o leitor de expressao do ffmpeg.
    # Janela de 0,034 s pra cada lado: meio quadro a 15 fps (celular que perde quadro); a 25 fps os vizinhos de um
    # tempo entre dois quadros ficavam fora de 0,017 s e a borda saia preta (achado da comum). Sobra quadro a 30 fps,
    # e fica o mais perto
    def soma(ts):
        if len(ts) == 1: return f"between(t,{ts[0] - 0.034:.3f},{ts[0] + 0.034:.3f})"
        return f"({soma(ts[:len(ts) // 2])}+{soma(ts[len(ts) // 2:])})"
    expr = soma(alvos)
    open(filtro, "w", encoding="utf-8").write(f"select='{expr}',showinfo,scale={LARG}:{ALT}")
    r = subprocess.run(["ffmpeg", "-v", "info", "-hwaccel", "auto", "-i", bruto, "-/vf", filtro, "-fps_mode", "passthrough",
                        "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], capture_output=True, stdin=subprocess.DEVNULL)
    if r.returncode != 0: sys.exit(r.stderr.decode("utf-8", "replace")[-2000:])
    ts = [float(m) for m in re.findall(r"Parsed_showinfo.*?pts_time:\s*([0-9.]+)", r.stderr.decode("utf-8", "replace"))]
    tam = LARG * ALT * 3
    imgs = [np.frombuffer(r.stdout[k * tam:(k + 1) * tam], np.uint8).reshape(ALT, LARG, 3).copy() for k in range(min(len(ts), len(r.stdout) // tam))]
    saida = {}
    for t in tempos:
        perto = min(range(len(imgs)), key=lambda k: abs(ts[k] - t), default=None)
        saida[t] = imgs[perto] if perto is not None and abs(ts[perto] - t) <= 0.05 else np.zeros((ALT, LARG, 3), np.uint8)
    return saida


def rotulo(img, texto, cor=(255, 255, 255)):
    cv2.rectangle(img, (0, ALT - 26), (LARG, ALT), (0, 0, 0), -1)
    cv2.putText(img, texto, (4, ALT - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.5, cor, 1, cv2.LINE_AA)
    return img


def main():
    p = argparse.ArgumentParser()
    p.add_argument("bruto"); p.add_argument("blocos"); p.add_argument("saida")
    p.add_argument("--passo", type=float, default=2.0)
    a = p.parse_args()
    trechos = ler_blocos(open(a.blocos, encoding="utf-8").read())
    if not trechos: sys.exit(f"nenhum trecho na tabela {a.blocos}: rode o blocos.py antes (passo 3.2).")
    os.makedirs(a.saida, exist_ok=True)
    # folha e tira de uma rodada anterior na mesma pasta se misturariam com as novas (achado da final)
    for nome in os.listdir(a.saida):
        if re.fullmatch(r"(folha|tira)-[0-9]+[.]jpg", nome): os.remove(os.path.join(a.saida, nome))
    dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", a.bruto],
                               capture_output=True, text=True).stdout.strip() or 0)

    cortes = cortes_sugeridos(trechos)
    folha_t = [round(k * a.passo, 3) for k in range(int(dur // a.passo) + 1)]
    tira_t = [[round(max(0.0, t), 3) for t in (ci - 0.2, ci, ci + 0.2, cf - 0.2, cf, min(cf + 0.2, dur))] for ci, cf in cortes]
    tmp = tempfile.mkdtemp(prefix="cru-")
    try:
        q = quadros(a.bruto, folha_t + [t for ts in tira_t for t in ts], tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    folhas = 0
    for n0 in range(0, len(folha_t), 12):
        imgs = [rotulo(q[t].copy(), f"{t:.0f} s") for t in folha_t[n0:n0 + 12]]
        imgs += [np.zeros((ALT, LARG, 3), np.uint8)] * (12 - len(imgs))
        folhas += 1
        cv2.imwrite(os.path.join(a.saida, f"folha-{folhas:02d}.jpg"), np.vstack([np.hstack(imgs[r * 4:r * 4 + 4]) for r in range(3)]), [cv2.IMWRITE_JPEG_QUALITY, 80])

    yunet = cv2.FaceDetectorYN.create(str(MODELO), "", (LARG, ALT), 0.6)
    linhas = ["| n | trecho | corte sugerido | inicio | fim | whisper |", "|---|---|---|---|---|---|"]
    for k, ((n, i, f, txt), (ci, cf), tempos) in enumerate(zip(trechos, cortes, tira_t), 1):
        imgs, marcas = [], []
        for t in tempos:
            img = q[t].copy()
            m = marca_rosto(yunet.detect(img)[1])
            marcas.append(m)
            imgs.append(rotulo(img, f"{t:.2f} s {m}", (80, 80, 255) if m else (255, 255, 255)))
        cv2.imwrite(os.path.join(a.saida, f"tira-{k:02d}.jpg"), np.hstack(imgs), [cv2.IMWRITE_JPEG_QUALITY, 80])
        borda = lambda ts, ms: ", ".join(f"{m} em {t:.2f}" for t, m in zip(ts, ms) if m) or "ok"
        linhas.append(f"| {n} | {i:.2f}:{f:.2f} | {ci:.2f}:{cf:.2f} | {borda(tempos[:3], marcas[:3])} | {borda(tempos[3:], marcas[3:])} | {txt} |")
    open(os.path.join(a.saida, "bordas.md"), "w", encoding="utf-8").write(
        f"# Bordas do cru\n\n{len(trechos)} trechos, {folhas} folhas de contato (um quadro a cada {a.passo:g} s) e uma tira por trecho.\n\n" + "\n".join(linhas) + "\n")
    print(f"assistir-cru: {folhas} folhas e {len(trechos)} tiras em {a.saida}")


if __name__ == "__main__":
    main()
