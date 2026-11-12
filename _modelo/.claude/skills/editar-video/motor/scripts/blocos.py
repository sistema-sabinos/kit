"""
Acha os blocos de fala num bruto e transcreve cada um com whisper.cpp pra confirmar o texto. Timestamp por token
do whisper nao serve com pausa longa; o que funciona e envelope RMS (janela 50 ms, limiar 12 dB acima do piso, gap
minimo 0,45 s) e transcricao trecho a trecho.

Gravacao frase por frase (2 s de silencio entre elas) sai um bloco por frase. Gravacao corrida tambem serve: trecho
mais longo que --max-frase se divide nas pausas curtas de dentro dele (0,15 s ou mais abaixo do limiar), a mais
longa primeiro, ate cada pedaco caber. O divisor so ve volume: uma hesitacao dentro da palavra pode virar ponto de
divisao, entao a decupagem le o texto de cada pedaco e junta o que saiu partido. Com mais de 80% das janelas acima
do limiar, ou nenhuma (quase tudo fala: o percentil 10 cai dentro dela), o piso se recalcula pelo percentil 1.

A pasta do whisper vem da variavel WHISPER_DIR (o orquestrador do kit define a partir da pasta de ferramentas
do video; sem ela o script para dizendo o que falta). O nome do programa vem de --whisper-bin (padrao "main",
o nome do whisper.cpp 1.5.5) e e procurado dentro da WHISPER_DIR, sem extensao: o sistema completa.

Com --nomes (o marca/nomes.md do projeto), os nomes da lista vao pro whisper como prompt ("Nomes: A, B, C."), sem
acento (o whisper.cpp 1.5.5 no Windows pode receber o argumento fora de UTF-8; o conferir-nomes.py devolve o acento
depois). Lista que nao existe ou sem nome segue sem prompt, com aviso.

Uso: blocos.py BRUTO.mp4 SAIDA.md [--modelo medium] [--nomes marca/nomes.md] [--limiar-db 12] [--gap 0.45] [--min 0.5] [--max-frase 7] [--whisper-bin main]
Sai uma tabela markdown (n, inicio, fim, duracao, texto do whisper) pra virar o cortes.md.
"""
import argparse, os, shutil, subprocess, sys, tempfile

def prompt_dos_nomes(linhas, teto=600):
    """Linhas do marca/nomes.md -> (frase pro --prompt do whisper, aviso ou None). So as linhas "- Nome" da secao
    "## Nomes", sem o "(avisa)", sem acento e sem repetir; passando do teto de caracteres, ficam os primeiros."""
    import unicodedata
    nomes, dentro = [], False
    for linha in linhas:
        s = linha.strip()
        if s.startswith("## "):
            dentro = s[3:].strip().lower() == "nomes"
            continue
        if not dentro or not s.startswith("- "): continue
        nome = s[2:].strip()
        if nome.lower().endswith("(avisa)"): nome = nome[:-7].strip()
        nome = "".join(c for c in unicodedata.normalize("NFD", nome) if not unicodedata.combining(c))
        if nome and nome not in nomes: nomes.append(nome)
    cabem = []
    for nome in nomes:
        if len("Nomes: " + ", ".join(cabem + [nome]) + ".") > teto: break
        cabem.append(nome)
    aviso = None
    if len(cabem) < len(nomes):
        aviso = f"a lista de nomes passa de {teto} caracteres: o whisper recebe so os {len(cabem)} primeiros dos {len(nomes)}"
    return ("Nomes: " + ", ".join(cabem) + "." if cabem else ""), aviso

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0: sys.exit(f"falhou: {' '.join(cmd)}\n{r.stderr[-2000:]}")
    return r.stdout

def achar_trechos(db, passo=0.05, limiar_db=12.0, gap=0.45, minimo=0.5, max_frase=7.0, pausa_curta=0.15):
    """db: volume por janela. Devolve (piso, [(ini, fim)]) em segundos."""
    def juntar(ativo, de, ate, folga):
        out, ini, ult = [], None, None
        for i in range(de, ate):
            t = i * passo
            if ativo[i]:
                if ini is None: ini = t
                ult = t + passo
            elif ini is not None and t - ult >= folga:
                out.append((ini, ult)); ini = None
        if ini is not None: out.append((ini, ult))
        return out

    piso = np.percentile(db, 10)
    ativo = db > piso + limiar_db
    if ativo.mean() > 0.8 or not ativo.any():
        piso = np.percentile(db, 1)
        ativo = db > piso + limiar_db
    trechos = []
    for ini, fim in juntar(ativo, 0, len(db), gap):
        if fim - ini <= max_frase:
            trechos.append((ini, fim)); continue
        # trecho longo: limiar local, a fala do proprio trecho (percentil 90) menos 10 dB. Entre palavras a voz nao
        # desce ate o piso, e ruido de fundo alto entre frases passa no limiar global como se fosse fala. Primeiro a
        # regra de sempre (pausa de gap) com o limiar local; o que ainda passar de max_frase se parte na pausa curta
        # mais longa (pausa_curta ou mais), a do meio no empate
        a0, b0 = int(round(ini / passo)), int(round(fim / passo))
        quieto = db <= max(piso + limiar_db, np.percentile(db[a0:b0], 90) - 10)
        # pedaco menor que o minimo gruda no vizinho: sozinho, sumiria no filtro do fim com fala dentro (achado da final)
        fila = []
        for i, f in juntar(~quieto, a0, b0, gap):
            if fila and (f - i < minimo or fila[-1][1] - fila[-1][0] < minimo): fila[-1] = (fila[-1][0], f)
            else: fila.append((i, f))
        # o limiar local so serve pra separar frases: sem separar nada, o trecho fica inteiro, sem aparar a fala
        # baixa das bordas (segunda volta da final). Limite declarado: separando, a beirada baixa da primeira e da
        # ultima frase cai junto com o ruido; a decupagem confere nas folhas
        if len(fila) < 2: fila = [(ini, fim)]
        prontos = []
        while fila:
            i, f = fila.pop()
            if f - i <= max_frase:
                prontos.append((i, f)); continue
            a, b = int(round(i / passo)), int(round(f / passo))
            pausas, k = [], a
            while k < b:
                if quieto[k]:
                    j = k
                    while j < b and quieto[j]: j += 1
                    # pausa que deixaria um lado menor que o minimo nao serve: o pedaco sumiria com fala dentro
                    if (j - k) * passo >= pausa_curta - 1e-9 and min(k - a, b - j) * passo >= minimo - 1e-9: pausas.append((j - k, k, j))
                    k = j
                else:
                    k += 1
            if not pausas:
                prontos.append((i, f)); continue
            _, k, j = max(pausas, key=lambda p: (p[0], -abs(p[1] + p[2] - a - b)))
            fila += [(j * passo, f), (i, k * passo)]
        trechos += sorted(prontos)
    return piso, [(i, f) for i, f in trechos if f - i >= minimo]

def main():
    p = argparse.ArgumentParser()
    p.add_argument("bruto"); p.add_argument("saida")
    p.add_argument("--modelo", default="medium")
    p.add_argument("--limiar-db", type=float, default=12.0)
    p.add_argument("--gap", type=float, default=0.45)
    p.add_argument("--min", type=float, default=0.5, help="duracao minima do trecho em s")
    p.add_argument("--max-frase", type=float, default=7.0, help="trecho mais longo que isso se divide nas pausas curtas (gravacao corrida)")
    p.add_argument("--whisper-bin", default="main", help="nome do programa do whisper.cpp dentro da WHISPER_DIR")
    p.add_argument("--nomes", help="lista de nomes proprios da marca (marca/nomes.md), vai pro whisper como prompt")
    a = p.parse_args()
    os.makedirs(os.path.dirname(a.saida) or ".", exist_ok=True)
    whisper = os.environ.get("WHISPER_DIR")
    if not whisper or not os.path.isdir(whisper):
        sys.exit("falta a variavel WHISPER_DIR apontando pra pasta do whisper.cpp. Rode a instalacao do whisper do kit e tente de novo.")
    prog = shutil.which(a.whisper_bin, path=whisper)
    modelo = os.path.join(whisper, f"ggml-{a.modelo}.bin")
    if not prog or not os.path.exists(modelo):
        sys.exit(f"nao achei o programa '{a.whisper_bin}' ou o modelo {modelo} dentro da WHISPER_DIR. Rode a instalacao do whisper do kit.")
    prompt = []
    if a.nomes:
        try:
            frase, aviso = prompt_dos_nomes(open(a.nomes, encoding="utf-8").read().splitlines())
        except (OSError, UnicodeDecodeError) as e:
            frase, aviso = "", f"nao consegui ler a lista de nomes {a.nomes} ({e})"
        if aviso: print(f"aviso: {aviso}", file=sys.stderr)
        if frase: prompt = ["--prompt", frase]
        elif not aviso: print(f"aviso: sem nome na lista {a.nomes}: o whisper roda sem prompt", file=sys.stderr)
    global np
    import numpy as np
    from scipy.io import wavfile
    tmp = tempfile.mkdtemp(prefix="blocos-")
    try:
        wav = os.path.join(tmp, "a.wav")
        run(["ffmpeg", "-y", "-v", "error", "-i", a.bruto, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", wav])
        sr, x = wavfile.read(wav)
        x = x.astype(np.float32) / 32768.0
        jan = int(sr * 0.05)
        n = len(x) // jan
        rms = np.sqrt(np.mean(x[: n * jan].reshape(n, jan) ** 2, axis=1) + 1e-12)
        db = 20 * np.log10(rms)
        piso, trechos = achar_trechos(db, 0.05, a.limiar_db, a.gap, a.min, a.max_frase)
        print(f"piso {piso:.1f} dB, {len(trechos)} trechos", file=sys.stderr)
        linhas = ["| n | inicio (s) | fim (s) | dur (s) | whisper |", "|---|---|---|---|---|"]
        for k, (i, f) in enumerate(trechos, 1):
            seg = os.path.join(tmp, f"seg{k}.wav")
            run(["ffmpeg", "-y", "-v", "error", "-i", wav, "-ss", f"{max(0, i - 0.2):.2f}", "-to", f"{f + 0.15:.2f}", seg])
            txt = run([prog, "-m", modelo, "-l", "pt", "-nt", "-np", *prompt, "-f", seg])
            txt = " ".join(txt.split())
            linhas.append(f"| {k} | {i:.2f} | {f:.2f} | {f - i:.2f} | {txt} |")
            print(linhas[-1], file=sys.stderr)
        open(a.saida, "w", encoding="utf-8").write("\n".join(linhas) + "\n")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

if __name__ == "__main__":
    main()
