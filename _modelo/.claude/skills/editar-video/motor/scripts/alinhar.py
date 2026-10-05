"""
Alinha a legenda do whisper ao texto do roteiro: mantem o tempo do whisper e troca o texto pelo que foi
escrito/falado de verdade (whisper erra nome proprio: "Claudio" por "Claude").

Uso: node .claude/skills/editar-video/scripts/py.mjs alinhar.py public/clipe.legendas.json roteiro.txt [saida.json]
Regras: palavra igual (sem acento/caixa) fica; troca N por M redistribui o tempo; palavra extra do whisper
que nao esta no roteiro e mantida (ele pode ter falado mesmo); palavra do roteiro que o whisper nao ouviu e inserida
dividindo o tempo da vizinha.
"""
import json, os, re, sys, unicodedata
from difflib import SequenceMatcher

def norm(w):
    w = unicodedata.normalize("NFD", w.lower())
    return re.sub(r"[^a-z0-9]", "", w)

src, rot = sys.argv[1], sys.argv[2]
out = sys.argv[3] if len(sys.argv) > 3 else src
os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
caps = json.load(open(src, encoding="utf-8"))
texto = open(rot, encoding="utf-8").read()
roteiro = texto.split()
a = [norm(c["text"]) for c in caps]
b = [norm(w) for w in roteiro]
sm = SequenceMatcher(a=a, b=b, autojunk=False)
res = []
for op, i1, i2, j1, j2 in sm.get_opcodes():
    if op == "equal":
        for k in range(i2 - i1):
            c = dict(caps[i1 + k]); c["text"] = " " + roteiro[j1 + k]; res.append(c)
    elif op == "delete":
        for k in range(i1, i2):   # whisper ouviu algo a mais: mantem se for palavra de verdade; 1 ou 2 letras ("a", "E") e ruido
            if len(norm(caps[k]["text"])) > 2 or not res: res.append(dict(caps[k]))
            else: res[-1]["endMs"] = max(res[-1]["endMs"], caps[k]["endMs"])
    else:  # replace ou insert: redistribui o tempo do trecho do whisper (ou da vizinha) entre as palavras do roteiro
        if i2 > i1:
            t0, t1 = caps[i1]["startMs"], caps[i2 - 1]["endMs"]
        elif res:
            t0, t1 = res[-1]["startMs"], res[-1]["endMs"]; res[-1]["endMs"] = t0 + (t1 - t0) // 2; t0 = res[-1]["endMs"]
        else:
            t0, t1 = 0, caps[0]["startMs"]
        n = j2 - j1
        for k in range(n):
            res.append({"text": " " + roteiro[j1 + k], "startMs": t0 + (t1 - t0) * k // n, "endMs": t0 + (t1 - t0) * (k + 1) // n,
                        "timestampMs": None, "confidence": None})
json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{len(caps)} palavras do whisper -> {len(res)} alinhadas; trocas: {sum(1 for o in sm.get_opcodes() if o[0] != 'equal')}")
print(" ".join(c["text"].strip() for c in res))
