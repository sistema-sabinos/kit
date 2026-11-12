"""
Confere os nomes proprios do fala.txt contra a lista da marca (marca/nomes.md) antes do alinhar.py, que copia o
texto do arquivo direto pra legenda. O whisper erra nome proprio: escreve em minuscula, tira ou poe acento, ou parte
o nome em duas palavras ("1 metro" no lugar de um nome de 7 letras).

Corrige sozinho so caixa e acento: o trecho tem o mesmo numero de palavras do nome e fica igual a ele sem acento e
sem caixa (a mesma conta do alinhar.py). Nome marcado com "(avisa)" na lista (nome que tambem e palavra comum) nunca
se troca, so avisa. Trecho parecido (distancia de edicao sem acento e sem caixa, em janelas do tamanho do nome e de
uma palavra a mais) so avisa, com a linha: nome de ate 3 letras so o exato, de 4 letras distancia 1, de 5 ou mais
ate 2 e ate 34% do tamanho. A pontuacao colada e o final de linha ficam como estavam.

Uso: conferir-nomes.py FALA.txt --nomes marca/nomes.md [--saida ARQ]
Sem --saida, grava a correcao no proprio FALA.txt. Sem a lista (ou com ela vazia) nao ha o que conferir.
Saida: 0 limpo ou corrigido (e sem a lista), 4 com aviso pra conferir, 1 arquivo que nao abriu.
"""
import argparse, os, re, sys, unicodedata

def norm(w):
    w = unicodedata.normalize("NFD", w.lower())
    return re.sub(r"[^a-z0-9]", "", w)

def ler_nomes(texto):
    """Linhas "- Nome" da secao "## Nomes"; devolve [(nome, so_avisa)]."""
    nomes, dentro = [], False
    for linha in texto.splitlines():
        s = linha.strip()
        if s.startswith("## "):
            dentro = s[3:].strip().lower() == "nomes"
            continue
        if not dentro or not s.startswith("- "): continue
        nome, avisa = s[2:].strip(), False
        if nome.lower().endswith("(avisa)"): nome, avisa = nome[:-7].strip(), True
        if norm(nome): nomes.append((nome, avisa))
    return nomes

def distancia(a, b):
    ant = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (ca != cb)))
        ant = cur
    return ant[-1]

def limite(n):
    if n <= 3: return 0
    if n == 4: return 1
    return min(2, int(0.34 * n + 1e-9))

def separar(w):
    """(simbolo da frente, miolo, simbolo de tras) de uma palavra."""
    return re.match(r"^(\W*)(.*?)(\W*)$", w).groups()

def partes_do(nome):
    """Miolo de cada palavra do nome, do mesmo jeito que o texto se corta: palavra so de simbolo (o "&" de
    "Lumora & Vexto") fica fora e o simbolo colado ("C++", ".NET") fica no texto, pra troca nao dobrar o simbolo."""
    return [m for m in (separar(p)[1] for p in nome.split()) if norm(m)]

def com_troca(linha, toks, j, k, partes, nome):
    """True quando o trecho das palavras j a j+k, com a troca feita e o simbolo da propria fala, contem o nome inteiro
    e o que sobra em volta e so pontuacao."""
    pos, s = toks[j][3], ""
    for q in range(k):
        a, b = toks[j + q][0], toks[j + q][1]
        s += linha[pos:a] + partes[q]
        pos = b
    s = " ".join((s + linha[pos:toks[j + k - 1][4]]).split())
    alvo = " ".join(nome.split())
    i = s.find(alvo)
    return i >= 0 and not any(c.isalnum() for c in s[:i] + s[i + len(alvo):])

def conferir_linha(linha, nomes):
    """Devolve (linha corrigida, [(de, para)], [(trecho, nome)])."""
    toks = []
    for m in re.finditer(r"\S+", linha):
        pre, miolo, pos = separar(m.group())
        if norm(miolo): toks.append((m.start() + len(pre), m.end() - len(pos), miolo, m.start(), m.end()))
    ns = [norm(t[2]) for t in toks]
    # bloqueado: posicao -> maior numero de palavras de um nome exato que a cobre; o exato de um nome curto nao
    # esconde o parecido de um nome maior ("Google" exato dentro de "google adz" ainda avisa "Google Ads")
    trocas, correcoes, bloqueado = {}, [], {}
    candidatos, sem_simbolo, fechados = [], [], set()
    for nome, avisa in nomes:
        partes = partes_do(nome)
        alvo = [norm(p) for p in partes]
        k = len(partes)
        for j in range(len(ns) - k + 1):
            if ns[j:j + k] != alvo: continue
            for p in range(j, j + k): bloqueado[p] = max(bloqueado.get(p, 0), k)
            # o trecho ja trocado tem de dar o nome inteiro, simbolo junto ("c" nao vira "C++", "casa vexto" nao vira
            # "Casa & Vexto"); sem o simbolo na fala a troca nao fecha e vira aviso
            fecha = com_troca(linha, toks, j, k, partes, nome)
            if not fecha:
                sem_simbolo.append((j, k, nome))
                continue
            fechados.add((j, k))
            if [toks[j + q][2] for q in range(k)] == partes: continue
            if avisa: candidatos.append((-1, -k, j, k, nome))
            else:
                for q in range(k): trocas[j + q] = partes[q]
                correcoes.append((linha[toks[j][0]:toks[j + k - 1][1]], nome))
    # sem o simbolo vira aviso, a nao ser que outro nome da lista feche o mesmo trecho ("C#" na fala com C++ e C#)
    candidatos += [(-1, -k, j, k, nome) for j, k, nome in sem_simbolo if (j, k) not in fechados]
    for nome, avisa in nomes:
        partes = partes_do(nome)
        alvo = "".join(norm(p) for p in partes)
        k, lim = len(partes), limite(len(alvo))
        for tam in (k, k + 1):
            for j in range(len(ns) - tam + 1):
                if any(bloqueado.get(p, 0) >= k for p in range(j, j + tam)): continue
                d = distancia("".join(ns[j:j + tam]), alvo)
                if d <= lim: candidatos.append((d, -tam, j, tam, nome))
    avisos, usados = [], set()
    for _, _, j, tam, nome in sorted(candidatos):
        if any(p in usados for p in range(j, j + tam)): continue
        usados.update(range(j, j + tam))
        avisos.append((j, linha[toks[j][0]:toks[j + tam - 1][1]], nome))
    nova = linha
    for i in sorted(trocas, reverse=True):
        a, b = toks[i][0], toks[i][1]
        nova = nova[:a] + trocas[i] + nova[b:]
    return nova, correcoes, [(t, n) for _, t, n in sorted(avisos)]

def main():
    p = argparse.ArgumentParser()
    p.add_argument("fala")
    p.add_argument("--nomes", required=True, help="a lista da marca (marca/nomes.md)")
    p.add_argument("--saida", help="grava aqui em vez de no proprio fala")
    a = p.parse_args()
    try:
        texto = open(a.fala, encoding="utf-8", newline="").read()
    except (OSError, UnicodeDecodeError) as e:
        sys.exit(f"nao consegui ler {a.fala}: {e}")
    nomes = []
    if os.path.exists(a.nomes):
        try:
            nomes = ler_nomes(open(a.nomes, encoding="utf-8").read())
        except (OSError, UnicodeDecodeError) as e:
            sys.exit(f"nao consegui ler {a.nomes}: {e}")
    if not nomes: print(f"sem nome na lista {a.nomes}: nada a conferir")
    pedacos = re.split(r"(\r\n|\n|\r)", texto)
    avisou = False
    for i in range(0, len(pedacos), 2):
        nova, correcoes, avisos = conferir_linha(pedacos[i], nomes)
        for de, para in correcoes: print(f'corrigi: linha {i // 2 + 1} "{de}" -> "{para}"')
        for trecho, nome in avisos: print(f'confira: linha {i // 2 + 1} "{trecho}" parece "{nome}"')
        avisou = avisou or bool(avisos)
        pedacos[i] = nova
    novo = "".join(pedacos)
    if a.saida or novo != texto:
        alvo = a.saida or a.fala
        os.makedirs(os.path.dirname(alvo) or ".", exist_ok=True)
        with open(alvo, "w", encoding="utf-8", newline="") as f: f.write(novo)
    sys.exit(4 if avisou else 0)

if __name__ == "__main__":
    main()
