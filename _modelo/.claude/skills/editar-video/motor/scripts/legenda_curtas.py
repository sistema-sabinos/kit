"""Palavra curta (artigo, preposicao, conjuncao, pronome curto, numero solto, R$) nunca fecha pagina de legenda:
na hora de fechar por contagem ou tamanho, as curtas do fim passam pro comeco da pagina seguinte, e pagina
que so tem curta espera a primeira palavra cheia ("o que e bom"). R$ gruda no numero ("por R$ 89").
Pausa de mais de 0,35 s nao se atravessa. pageBreakAfter na palavra (camera lenta) fecha a pagina ali.
Uso: `from legenda_curtas import paginar`; paginar(palavras, max_palavras, max_chars, pontuacao) devolve os grupos."""

CURTAS = set((
    "a o as os um uma uns umas "                                   # artigos
    "de do da dos das em no na nos nas num numa ao aos à às "      # preposicao e contracao
    "por pelo pela pelos pelas pra pro pras pros para com sem "
    "e ou nem mas que se "                                         # conjuncao
    "eu me te lhe meu minha seu sua é "                            # pronome curto e o "e" de ligacao
    "r$"                                                           # simbolo do real, gruda no numero
).split())
PAUSA_MS = 350
FIM_DE_FRASE = ".,?!:;…"
ALGARISMOS = "0123456789"

def numero(w):
    # 60, 2,5, 10%, R$89: tirando o R$ da frente e o % do fim, sobra so algarismo, ponto ou virgula
    s = w.casefold()
    if s.startswith("r$"): s = s[2:]
    if s.endswith("%"): s = s[:-1]
    return s != "" and all(c in ALGARISMOS + ".," for c in s)

def curta(texto):
    w = texto.strip()
    return bool(w) and w[-1] not in FIM_DE_FRASE and (w.casefold() in CURTAS or numero(w))

def gruda(a, b):
    # "R$" seguido de numero: o preco fica na mesma pagina
    return a["text"].strip().casefold() == "r$" and numero(b["text"].strip())

def paginar(pal, max_palavras, max_chars, pontuacao):
    grupos, atual = [], []
    for w in pal:
        if atual:
            junto = " ".join(x["text"].strip() for x in atual + [w])
            cheia = len(atual) >= max_palavras or len(junto) > max_chars
            pausa = w["startMs"] - atual[-1]["endMs"] > PAUSA_MS
            so_curtas = len(atual) <= max_palavras and all(curta(x["text"]) for x in atual)
            espera = not pausa and so_curtas and (not curta(w["text"]) or gruda(atual[-1], w))
            if (cheia or pausa) and not espera:
                n = len(atual)
                if not pausa:
                    while n > 1 and curta(atual[n - 1]["text"]): n -= 1
                    if n == 1 and curta(atual[0]["text"]): n = min(2, len(atual))
                    if n < len(atual) and gruda(atual[n - 1], atual[n]): n += 1
                grupos.append(atual[:n]); atual = atual[n:]
        atual.append(w)
        if w["text"].strip()[-1] in pontuacao or w.get("pageBreakAfter"):
            grupos.append(atual); atual = []
    if atual: grupos.append(atual)
    # curta sozinha no fim (trecho cortado no meio da frase) volta pra pagina de antes, se couber ali com uma a mais
    if len(grupos) > 1 and len(grupos[-1]) == 1 and curta(grupos[-1][0]["text"]):
        ant, ult = grupos[-2], grupos[-1][0]
        cabe = len(ant) <= max_palavras and len(" ".join(x["text"].strip() for x in ant + [ult])) <= max_chars
        fechada = ant[-1]["text"].strip()[-1] in pontuacao or ant[-1].get("pageBreakAfter")
        if cabe and not fechada and ult["startMs"] - ant[-1]["endMs"] <= PAUSA_MS:
            ant.append(grupos.pop()[0])
    return grupos
