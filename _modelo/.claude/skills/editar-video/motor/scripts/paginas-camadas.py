"""Paginas de legenda e tempos pro padrao camadas, num take corrido (sem corte: o tempo do bruto e o tempo final).
A legenda alinhada vira paginas curtas (ate --max-palavras palavras, uma a mais quando as anteriores sao curtas, e --max-chars caracteres), porque a legenda
mora numa coluna estreita. Grava um JSON: { duracaoSeg, paginas: [{ini, fim, palavras}], palavras: [{text, startMs, endMs}] }.
A composicao em producao/<slug>/composicao.tsx importa esse JSON.

Uso: paginas-camadas.py --alinhado voz.alinhado.json --voz voz.wav --saida paginas-camadas.json
                        [--max-palavras 2] [--max-chars 12] [--alinhado-saida voz.alinhado.json]
--alinhado-saida regrava o alinhado com timestampMs (meio de cada palavra), o campo que a legenda do Remotion le.
"""
import argparse, io, json, os, wave
from pathlib import Path
from legenda_curtas import paginar

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--alinhado", required=True); p.add_argument("--voz", required=True); p.add_argument("--saida", required=True)
    p.add_argument("--max-palavras", type=int, default=2); p.add_argument("--max-chars", type=int, default=12)
    p.add_argument("--alinhado-saida", default=None)
    a = p.parse_args()
    os.makedirs(os.path.dirname(a.saida) or ".", exist_ok=True)
    if a.alinhado_saida: os.makedirs(os.path.dirname(a.alinhado_saida) or ".", exist_ok=True)
    ws = json.load(io.open(a.alinhado, encoding="utf-8"))
    with wave.open(a.voz) as w: DUR = round(w.getnframes() / w.getframerate(), 3)
    if a.alinhado_saida:
        for w in ws: w["timestampMs"] = (w["startMs"] + w["endMs"]) // 2
        json.dump(ws, io.open(a.alinhado_saida, "w", encoding="utf-8"), ensure_ascii=False)

    out = []
    grupos = paginar([w for w in ws if w["text"].strip()], a.max_palavras, a.max_chars, ".,?!:")
    for k, grupo in enumerate(grupos):
        fim = min(DUR, grupo[-1]["endMs"] / 1000 + 0.25) if k == len(grupos) - 1 else grupos[k + 1][0]["startMs"] / 1000
        out.append({"ini": round(grupo[0]["startMs"] / 1000, 3), "fim": round(fim, 3), "palavras": [g["text"].strip().rstrip(".,:") for g in grupo]})
    dados = {"duracaoSeg": DUR, "paginas": out, "palavras": [{"text": w["text"], "startMs": w["startMs"], "endMs": w["endMs"]} for w in ws]}
    Path(a.saida).write_text(json.dumps(dados, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(len(out), "paginas;", DUR, "s")

if __name__ == "__main__":
    main()
