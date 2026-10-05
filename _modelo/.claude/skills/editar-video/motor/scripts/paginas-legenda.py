"""Paginas de legenda do padrao camadas (1 a 3 palavras, quebra na pontuacao) a partir da transcricao por palavra
do whisper (o `.json` do transcrever.mjs, ou o alinhado.json do alinhar.py). Serve pra fala e pra clipe de terceiro.
Grava um JSON: lista de { ini, fim, palavras } em segundos.
Uso: paginas-legenda.py <legendas.json> <saida.json> [--de 0] [--ate 99]
O tempo sai contado a partir de --de (use o ponto de entrada do trecho ou clipe)."""
import argparse, json, os
from pathlib import Path

MAX_PAL, MAX_CHARS = 3, 16

def main():
    p = argparse.ArgumentParser()
    p.add_argument("legendas"); p.add_argument("saida")
    p.add_argument("--de", type=float, default=0.0); p.add_argument("--ate", type=float, default=1e9)
    a = p.parse_args()
    os.makedirs(os.path.dirname(a.saida) or ".", exist_ok=True)
    DE, ATE = a.de, a.ate
    pal = [w for w in json.load(open(a.legendas, encoding="utf-8")) if DE * 1000 <= w["startMs"] < ATE * 1000 and w["text"].strip()]
    paginas, grupo = [], []
    for i, w in enumerate(pal):
        grupo.append(w)
        txt = "".join(g["text"] for g in grupo).strip()
        ultimo = i == len(pal) - 1
        prox = "" if ultimo else pal[i + 1]["text"]
        if ultimo or txt[-1] in ".,?!" or len(grupo) >= MAX_PAL or len(txt + prox) > MAX_CHARS:
            fim = min(ATE, w["endMs"] / 1000) if ultimo else pal[i + 1]["startMs"] / 1000
            paginas.append({"ini": round(grupo[0]["startMs"] / 1000 - DE, 3), "fim": round(fim - DE, 3), "palavras": [g["text"].strip() for g in grupo]})
            grupo = []
    Path(a.saida).write_text(json.dumps(paginas, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(len(paginas), "paginas:", " | ".join(" ".join(g["palavras"]) for g in paginas))

if __name__ == "__main__":
    main()
