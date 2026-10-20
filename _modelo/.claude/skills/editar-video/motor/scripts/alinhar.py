"""
Alinha a legenda do whisper ao texto do roteiro: mantem o tempo do whisper e troca o texto pelo que foi
escrito/falado de verdade (whisper erra nome proprio: "Claudio" por "Claude").

Uso: node .claude/skills/editar-video/scripts/py.mjs alinhar.py public/clipe.legendas.json roteiro.txt [saida.json]
Regras: palavra igual (sem acento/caixa) fica; troca N por M redistribui o tempo; palavra extra do whisper
que nao esta no roteiro e mantida (ele pode ter falado mesmo); palavra do roteiro que o whisper nao ouviu e inserida
dividindo o tempo da vizinha. Preco: "R$" + numero do roteiro dividem o mesmo tempo (acendem juntos no
comeco do numero falado, achado pela palavra do whisper que fala o valor; se o whisper ja escreveu "R$" e o
numero, no comeco do "R$") e o "reais"/"real" do whisper logo depois deles vai pro numero.
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
def preco(j):  # "R$" do roteiro seguido de numero: o R$ nao e falado antes do numero, os dois acendem juntos
    return roteiro[j].upper() == "R$" and j + 1 < len(b) and b[j + 1][:1].isdigit()
def reais_do_preco(c):  # "reais" do whisper logo depois de R$ + numero ja alinhados: e o R$ falado
    return norm(c["text"]) in ("real", "reais") and len(res) > 1 and res[-2]["text"].strip().upper() == "R$" and norm(res[-1]["text"])[:1].isdigit()
NUM = set("um uma dois duas tres quatro cinco seis sete oito nove dez onze doze treze quatorze catorze quinze dezesseis dezessete "
          "dezoito dezenove vinte trinta quarenta cinquenta sessenta setenta oitenta noventa cem cento duzentos duzentas trezentos "
          "trezentas quatrocentos quinhentos seiscentos setecentos oitocentos novecentos mil".split())
def numero(w):  # palavra do whisper que fala valor: algarismo ou numero por extenso
    return w[:1].isdigit() or w in NUM
def valor_falado(i, i2):  # comeco do numero que e o preco: o seguido de "reais"/"real"; sem ele, o primeiro ("dois itens por 89" sem reais fica no 1o)
    primeiro, k = i2, i
    while k < i2:
        if not numero(a[k]): k += 1; continue
        ini = k
        while k < i2 and (numero(a[k]) or a[k] == "e"): k += 1
        if primeiro == i2: primeiro = ini
        if k < i2 and a[k] in ("reais", "real"): return ini
    return primeiro
def ancorar(i1, i2, j1, j2):  # replace com preco: [(palavras do roteiro, startMs)], o preco comecando na palavra do whisper que fala o valor
    pedacos, i, js, j = [], i1, [], j1
    while j < j2:
        if preco(j) and j + 1 < j2:
            k = valor_falado(i, i2)
            if k == i2 or (js and k == i): return None  # sem valor falado, ou palavra do roteiro sem whisper antes do preco
            if js: pedacos.append((js, caps[i]["startMs"]))
            pedacos.append(([j, j + 1], caps[k]["startMs"]))
            while k < i2 and (numero(a[k]) or a[k] in ("e", "reais", "real")): k += 1
            i, js, j = k, [], j + 2
        else:
            js.append(j); j += 1
    if js:
        if i == i2: return None
        pedacos.append((js, caps[i]["startMs"]))
    return pedacos if any(preco(p[0][0]) for p in pedacos) else None
res = []
for op, i1, i2, j1, j2 in sm.get_opcodes():
    if op == "equal":
        for k in range(i2 - i1):
            c = dict(caps[i1 + k]); c["text"] = " " + roteiro[j1 + k]
            if k > 0 and preco(j1 + k - 1):  # whisper ja deu R$ e numero: acendem juntos no comeco do R$
                c["startMs"] = res[-1]["startMs"]; res[-1]["endMs"] = c["endMs"]
            elif k == 0 and j1 > 0 and preco(j1 - 1) and res and res[-1]["timestampMs"] is None and res[-1]["text"].strip().upper() == "R$":
                # R$ que o whisper nao escreveu (insert) antes do numero que ele ouviu: acende com o numero e devolve o tempo da vizinha
                if len(res) > 1 and res[-2]["endMs"] == res[-1]["startMs"]: res[-2]["endMs"] = c["startMs"]
                res[-1]["startMs"], res[-1]["endMs"] = c["startMs"], c["endMs"]
            res.append(c)
    elif op == "delete":
        for k in range(i1, i2):   # whisper ouviu algo a mais: mantem se for palavra de verdade; 1 ou 2 letras ("a", "E") e ruido
            if (len(norm(caps[k]["text"])) > 2 or not res) and not reais_do_preco(caps[k]): res.append(dict(caps[k]))
            else:
                if reais_do_preco(caps[k]) and res[-2]["startMs"] == res[-1]["startMs"]: res[-2]["endMs"] = max(res[-2]["endMs"], caps[k]["endMs"])
                res[-1]["endMs"] = max(res[-1]["endMs"], caps[k]["endMs"])
    else:  # replace ou insert: redistribui o tempo do trecho do whisper (ou da vizinha) entre as palavras do roteiro
        pedacos = ancorar(i1, i2, j1, j2) if i2 > i1 else None
        if pedacos:
            for p, (js, ini) in enumerate(pedacos):
                fim = pedacos[p + 1][1] if p + 1 < len(pedacos) else caps[i2 - 1]["endMs"]
                n = 1 if preco(js[0]) else len(js)
                for k, j in enumerate(js):
                    kk = 0 if n == 1 else k
                    res.append({"text": " " + roteiro[j], "startMs": ini + (fim - ini) * kk // n, "endMs": ini + (fim - ini) * (kk + 1) // n,
                                "timestampMs": None, "confidence": None})
            continue
        if i2 > i1:
            t0, t1 = caps[i1]["startMs"], caps[i2 - 1]["endMs"]
        elif res:
            t0, t1 = res[-1]["startMs"], res[-1]["endMs"]; res[-1]["endMs"] = t0 + (t1 - t0) // 2; t0 = res[-1]["endMs"]
        else:
            t0, t1 = 0, caps[0]["startMs"]
        uni = []  # R$ + numero contam como uma unidade so de tempo
        for j in range(j1, j2):
            if j > j1 and preco(j - 1): uni[-1].append(j)
            else: uni.append([j])
        n = len(uni)
        for k, js in enumerate(uni):
            for j in js:
                res.append({"text": " " + roteiro[j], "startMs": t0 + (t1 - t0) * k // n, "endMs": t0 + (t1 - t0) * (k + 1) // n,
                            "timestampMs": None, "confidence": None})
json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"{len(caps)} palavras do whisper -> {len(res)} alinhadas; trocas: {sum(1 for o in sm.get_opcodes() if o[0] != 'equal')}")
print(" ".join(c["text"].strip() for c in res))
