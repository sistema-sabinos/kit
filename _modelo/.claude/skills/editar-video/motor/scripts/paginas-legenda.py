"""Paginas de legenda do padrao camadas (ate 3 palavras, 4 quando as 3 primeiras sao curtas, quebra na pontuacao) a partir da transcricao por palavra
do whisper (o `.json` do transcrever.mjs, ou o alinhado.json do alinhar.py). Serve pra fala e pra clipe de terceiro.
Grava um JSON: lista de { ini, fim, palavras } em segundos.
Uso: paginas-legenda.py <legendas.json> <saida.json> [--de 0] [--ate 99]
O tempo sai contado a partir de --de (use o ponto de entrada do trecho ou clipe)."""
import argparse, json, os
from pathlib import Path
from legenda_curtas import paginar

MAX_PAL, MAX_CHARS = 3, 16

def main():
    p = argparse.ArgumentParser()
    p.add_argument("legendas"); p.add_argument("saida")
    p.add_argument("--de", type=float, default=0.0); p.add_argument("--ate", type=float, default=1e9)
    a = p.parse_args()
    os.makedirs(os.path.dirname(a.saida) or ".", exist_ok=True)
    DE, ATE = a.de, a.ate
    pal = [w for w in json.load(open(a.legendas, encoding="utf-8")) if DE * 1000 <= w["startMs"] < ATE * 1000 and w["text"].strip()]
    grupos = paginar(pal, MAX_PAL, MAX_CHARS, ".,?!")
    paginas = []
    for k, grupo in enumerate(grupos):
        fim = min(ATE, grupo[-1]["endMs"] / 1000) if k == len(grupos) - 1 else grupos[k + 1][0]["startMs"] / 1000
        paginas.append({"ini": round(grupo[0]["startMs"] / 1000 - DE, 3), "fim": round(fim - DE, 3), "palavras": [g["text"].strip() for g in grupo]})
    Path(a.saida).write_text(json.dumps(paginas, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(len(paginas), "paginas:", " | ".join(" ".join(g["palavras"]) for g in paginas))

if __name__ == "__main__":
    main()
