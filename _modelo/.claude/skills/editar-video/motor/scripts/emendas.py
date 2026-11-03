"""
Confere cada emenda da fala montada (passo 3.3 do /editar-video), lendo o bruto dos dois lados do corte:
  pulo do rosto  o YuNet no ultimo quadro do bloco e no primeiro do seguinte: deslocamento do centro do rosto mais a
                 mudanca de largura, divididos pela largura (0 e o mesmo enquadramento; a cabeca pulando de lugar e
                 o "jump cut" que a troca de escala do MOV-01 esconde)
  degrau de som  o piso de ruido (a janela de 50 ms mais baixa) nos 0,3 s antes do fim contra os 0,3 s depois do
                 comeco, em dB: ruido que muda de nivel na emenda se ouve ("-" quando um lado e todo fala)
  voz na borda   volume dos ultimos e dos primeiros 30 ms acima do piso do bruto mais o limiar do blocos.py: o corte
                 caiu no meio da voz (palavra comida ou respiracao cortada)
Chamado pelo montar-blocos.py; grava a tabela em emendas.md. Tudo local, sem rede e sem custo.
"""
import importlib.util, os, subprocess, tempfile, shutil
from pathlib import Path
import numpy as np

AQUI = Path(__file__).parent
# acima disso vira aviso (afinados em 6 crus da regua da 5.48: pulo 0,19 ja se ve com a mesma escala, mas a troca
# de escala esconde ate uns 0,25; o degrau passa de 8 dB em 1 de cada 15 emendas)
PULO, DEGRAU_DB, LIMIAR_DB = 0.25, 8.0, 12.0


def _cru():
    spec = importlib.util.spec_from_file_location("assistir_cru", AQUI / "assistir-cru.py")
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


def caixa_rosto(rostos):
    """(centro x, centro y, largura) do maior rosto do YuNet, ou None."""
    if rostos is None or len(rostos) == 0: return None
    r = max(rostos, key=lambda x: x[2] * x[3])
    return (float(r[0] + r[2] / 2), float(r[1] + r[3] / 2), float(r[2])) if r[2] >= 1 else None


def pulo(a, b):
    """Quanto o rosto pula de a pra b, em larguras de rosto; None se faltar rosto num dos lados."""
    if a is None or b is None: return None
    larg = (a[2] + b[2]) / 2
    return round((float(np.hypot(b[0] - a[0], b[1] - a[1])) + abs(b[2] - a[2])) / larg, 3)


def volume_db(x, sr, passo=0.05):
    jan = int(sr * passo); n = len(x) // jan
    return 20 * np.log10(np.sqrt(np.mean(x[: n * jan].reshape(n, jan) ** 2, axis=1) + 1e-12))


def piso_do_bruto(db):
    """O mesmo piso do blocos.py: percentil 10, ou 1 quando quase tudo e fala."""
    piso = np.percentile(db, 10)
    ativo = db > piso + LIMIAR_DB
    return np.percentile(db, 1) if ativo.mean() > 0.8 or not ativo.any() else piso


def som_na_emenda(x, sr, fim, ini, piso):
    """(degrau em dB, voz no fim do bloco, voz no comeco do seguinte) entre o fim de um bloco e o comeco do outro."""
    def rms(a, b):
        s = x[max(0, int(a * sr)):max(0, int(b * sr))]
        return 20 * np.log10(np.sqrt(np.mean(s ** 2)) + 1e-12) if len(s) else -120.0
    def chao(a, b):
        db = volume_db(x[max(0, int(a * sr)):max(0, int(b * sr))], sr)
        return float(db.min()) if len(db) else -120.0
    # so ha degrau de ruido quando os dois lados tem um pedaco sem fala: lado todo de voz mediria a voz
    antes, depois = chao(fim - 0.3, fim), chao(ini, ini + 0.3)
    fala = piso + LIMIAR_DB
    degrau = round(float(abs(antes - depois)), 1) if antes <= fala and depois <= fala else None
    return degrau, bool(rms(fim - 0.03, fim) > piso + LIMIAR_DB), bool(rms(ini, ini + 0.03) > piso + LIMIAR_DB)


def medir(bruto, partes):
    """Uma linha por emenda entre partes [(ini, fim)] na ordem da montagem."""
    import cv2
    from scipy.io import wavfile
    cru = _cru()
    tmp = tempfile.mkdtemp(prefix="emendas-")
    try:
        wav = os.path.join(tmp, "a.wav")
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", bruto, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav], check=True)
        sr, x = wavfile.read(wav)
        x = x.astype(np.float32) / 32768.0
        piso = piso_do_bruto(volume_db(x, sr))
        tempos = [t for (_, f), (i, _) in zip(partes, partes[1:]) for t in (max(0.0, f - 1 / 30), i)]
        q = cru.quadros(bruto, tempos, tmp) if tempos else {}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    yunet = cv2.FaceDetectorYN.create(str(cru.MODELO), "", (cru.LARG, cru.ALT), 0.6)
    linhas, acum = [], 0.0
    for k, ((i1, f1), (i2, f2)) in enumerate(zip(partes, partes[1:]), 1):
        acum += f1 - i1
        p = pulo(caixa_rosto(yunet.detect(q[max(0.0, f1 - 1 / 30)])[1]), caixa_rosto(yunet.detect(q[i2])[1]))
        degrau, voz_fim, voz_ini = som_na_emenda(x, sr, f1, i2, piso)
        linhas.append({"n": k, "seg": round(acum, 2), "de": f1, "para": i2, "pulo": p, "degrau": degrau, "voz_fim": voz_fim, "voz_ini": voz_ini})
    return linhas


def avisos(l):
    a = []
    if l["voz_fim"]: a.append("voz no fim do bloco")
    if l["voz_ini"]: a.append("voz no comeco do seguinte")
    if l["pulo"] is not None and l["pulo"] > PULO: a.append("rosto pula")
    if l["degrau"] is not None and l["degrau"] > DEGRAU_DB: a.append("degrau de ruido")
    return a


def tabela(linhas):
    out = ["| emenda | na fala (s) | bruto | pulo do rosto | degrau (dB) | aviso |", "|---|---|---|---|---|---|"]
    for l in linhas:
        p = "sem rosto" if l["pulo"] is None else f"{l['pulo']:.2f}"
        g = "-" if l["degrau"] is None else f"{l['degrau']:.1f}"
        out.append(f"| {l['n']} | {l['seg']:.2f} | {l['de']:.2f} > {l['para']:.2f} | {p} | {g} | {', '.join(avisos(l)) or 'ok'} |")
    return "\n".join(out)
