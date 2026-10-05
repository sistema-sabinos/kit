"""Fiscal do video: confere o video final quadro a quadro antes de ir pra quem pediu.
Se aprovar, o video pode ir. Se reprovar, cada falha sai com o segundo, o quadro marcado e a ETAPA que corrige.

Roda os gates que ja existiam e acrescenta o que so se ve quadro a quadro:
  1. gates antigos: loudness.py (mix), zona-segura.py (posicao), verificar-video.py (boca na voz, travada, duracao)
  2. respiro: 40 px entre camadas (atras, frente, legenda, interface, moldura), em todo quadro
  3. rosto coberto por cartao, legenda, interface ou moldura (rosto pelo YuNet, a cada quadro)
  4. fala sem legenda: cada palavra dita no video final (whisper local) tem legenda na tela em pelo menos 60% do tempo
  5. grafico sem som: todo grafico que entra tem efeito sonoro a ate 0,17 s (5 quadros)
  6. quadro preto no meio do video
Como enxerga as camadas: renderiza a composicao de novo com a prop `fiscal` = nome da camada (so ela, branca sobre
preto, a meia resolucao), e o efeito sonoro vira um quadrado no canto (`Efeitos` do kit). Tudo local e gratis.
Limite conhecido: dois elementos da MESMA camada encostados nao sao medidos (a camada e uma mascara so).

  7. olho final (Gemini, PAGO): so roda com --roteiro, --preco-usd e --autorizado juntos, e so se 1 a 6 passaram.
     Assiste o video inteiro contra o roteiro e julga o que script nao julga. Sem preco ou sem autorizacao, avisa e
     pula. O custo vai pro dados/custos.jsonl, uma linha, pelo registrar-custo-cli.mjs.

Teste do portao pago: `--so-olho-final` pula render e gates e roda so o passo 7 (os caminhos do render viram opcionais).

Uso: fiscal.py <Composicao> <final.mp4> <bruto.mp4> <pasta-saida> --remotion <remotion-cli.js> --public-dir <public da peca>
             --props-base <props.json> [--props-verificar <props.json>] [--transcrever <transcrever.mjs> [--modelo small|medium]]
             [--roteiro <roteiro.md> --preco-usd <US$ do olho final, preco do dia> --autorizado
              --ver-video <ver-video.mjs> --registrar-custo <registrar-custo-cli.mjs>]

Quem chama e o orquestrador do kit, que escolhe o Python da maquina e passa os caminhos; nenhum caminho de ferramenta
e escrito aqui. Os outros .py (loudness, zona-segura, verificar-video) sao chamados com o mesmo Python que roda este
(sys.executable) e moram na mesma pasta que este arquivo.
  --remotion       remotion-cli.js dentro do node_modules do motor; a pasta do motor sai dele (3 niveis acima)
                   e e de la que roda `src/index.ts`. TEMP e TMP vem do ambiente de quem chamou.
  --props-base     props do video (JSON); o render de cada camada usa estas props mais { "fiscal": <camada> }
  --props-verificar props do VideoV2 que o verificar-video.py le (padrao: o mesmo --props-base)
  --transcrever    script node que transcreve (transcrever.mjs <audio> <saida.json> <modelo>); sem ele a conferencia
                   de fala sem legenda e pulada com aviso
  --registrar-custo CLI que grava o custo; padrao: configurar-video/scripts/lib/registrar-custo-cli.mjs ao lado da
                   pasta desta skill (so existe dentro do kit; o orquestrador passa o caminho certo)
Sai APROVADO ou REPROVADO (codigo 1), com relatorio.md, falhas.json e quadros/ na pasta de saida."""
import argparse, json, re, subprocess, sys
from pathlib import Path
import cv2
import numpy as np

try:
    sys.stdout.reconfigure(encoding="utf-8")   # o console do Windows abre em cp1252 e come os acentos
except (AttributeError, OSError):
    pass
AQUI = Path(__file__).resolve().parent
ap = argparse.ArgumentParser(description="Fiscal do video final (ver o cabecalho do arquivo).")
ap.add_argument("composicao"); ap.add_argument("final"); ap.add_argument("bruto"); ap.add_argument("saida")
ap.add_argument("--remotion", default=None); ap.add_argument("--public-dir", default=None)
ap.add_argument("--props-base", default=None); ap.add_argument("--props-verificar", default=None)
ap.add_argument("--transcrever", default=None)
ap.add_argument("--modelo", default="small", choices=["small", "medium"], help="modelo do whisper que o --transcrever usa (o do maquina.json); padrao small")
ap.add_argument("--roteiro", default=None); ap.add_argument("--preco-usd", type=float, default=None)
ap.add_argument("--autorizado", action="store_true")
ap.add_argument("--ver-video", default=None)
ap.add_argument("--raiz-custo", default=None, help="raiz do projeto onde o registrar-custo grava dados/custos.jsonl (padrao: a do kit)")
ap.add_argument("--so-olho-final", action="store_true", help="so o olho final (teste do portao pago): sem render e sem gates")
ap.add_argument("--registrar-custo", default=str(AQUI.parents[2] / "configurar-video" / "scripts" / "lib" / "registrar-custo-cli.mjs"))
ARGS = ap.parse_args()
if not ARGS.so_olho_final and not (ARGS.remotion and ARGS.public_dir and ARGS.props_base):
    ap.error("faltam --remotion, --public-dir e --props-base")

def caminho_abs(p):
    """O subprocess roda dentro da pasta do motor: caminho relativo de quem chamou deixa de existir la."""
    return str(Path(p).resolve()) if p else None


COMP = ARGS.composicao
TRANSCREVER, VER_VIDEO, REGISTRAR_CUSTO = caminho_abs(ARGS.transcrever), caminho_abs(ARGS.ver_video), caminho_abs(ARGS.registrar_custo)
FINAL, BRUTO, SAIDA = Path(ARGS.final).resolve(), Path(ARGS.bruto).resolve(), Path(ARGS.saida).resolve()
REMOTION = Path(ARGS.remotion).resolve() if ARGS.remotion else None
PUBLIC = Path(ARGS.public_dir).resolve() if ARGS.public_dir else None
PROPS_BASE = Path(ARGS.props_base).resolve() if ARGS.props_base else None
PROPS = Path(ARGS.props_verificar).resolve() if ARGS.props_verificar else PROPS_BASE
MOTOR = REMOTION.parents[3] if REMOTION else None
FPS, ESC = 30, 0.5          # camadas renderizadas a meia resolucao
RESPIRO = 40                # px no tamanho real
CAMADAS = ["atras", "pessoa", "frente", "legenda", "interface", "moldura"]
PARES = [("frente", "legenda"), ("interface", "legenda"), ("atras", "legenda"), ("moldura", "legenda"), ("frente", "interface"),
         ("atras", "interface"), ("moldura", "interface"), ("atras", "frente")]
COBRE_ROSTO = ["frente", "legenda", "interface", "moldura"]
ETAPA = {
    "mix": "passo do mix (mix-final.py: volume, pico)",
    "posicao": "passo dos graficos e props (posicao do elemento)",
    "montagem": "passo do recorte e da montagem (sincronia da pessoa e da voz)",
    "respiro": "passo dos graficos e props (afastar os elementos)",
    "rosto": "passo dos graficos e props (tirar de cima do rosto)",
    "legenda": "passo das paginas de legenda (paginas-legenda.py, inclusive dos clipes)",
    "som": "passo dos efeitos sonoros (efeito na entrada do grafico)",
    "render": "passo do render",
    "escondido": "passo dos graficos e props (grafico de tras: subir, encolher, ou tirar o zoom da pessoa naquele trecho)",
    "voz": "voz: gerar de novo o trecho (ou reescrever a linha do roteiro)",
}
SAIDA.mkdir(parents=True, exist_ok=True)
(SAIDA / "quadros").mkdir(exist_ok=True)
falhas = []


def falha(tipo, seg, texto, etapa):
    falhas.append({"tipo": tipo, "seg": round(seg, 2), "texto": texto, "etapa": ETAPA[etapa]})


def roda(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=MOTOR, **kw)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def olho_final(falhas, avisos):
    """Olho final (Gemini, PAGO): so roda com --roteiro, --preco-usd, --autorizado e --ver-video, e so se a conferencia por
    script passou, pra nao pagar por video que ja ia voltar. So problema GRAVE reprova; o leve vai como aviso."""
    ROTEIRO = Path(ARGS.roteiro).resolve() if ARGS.roteiro else None
    if ROTEIRO and (ARGS.preco_usd is None or not ARGS.autorizado or not ARGS.ver_video):
        faltou = [n for n, ok in (("--preco-usd (preco do dia)", ARGS.preco_usd is not None), ("--autorizado (o sim da pessoa)", ARGS.autorizado), ("--ver-video", bool(ARGS.ver_video))) if not ok]
        avisos.append({"tipo": "olho final", "seg": 0, "texto": "olho final pulado (e pago): falta " + ", ".join(faltou), "etapa": ETAPA["render"]})
    elif ROTEIRO and not falhas:
        pergunta = (
            "Voce e o revisor final de um Reel vertical em portugues antes de ir pra quem pediu. Assista e ouca o video "
            "inteiro e compare com o roteiro abaixo (colunas Fala, Na tela, Som). Aponte so o que um espectador perceberia: "
            "grafico que nao aparece ou nao explica a frase, texto cortado, errado ou ilegivel, legenda com palavra diferente "
            "da fala, texto em cima do rosto, musica alta demais sobre a voz, som estourado, corte estranho, voz que soa "
            "robotica num trecho, piada ou pergunta que nao funciona, e clipe de terceiro ou imagem dentro da moldura com a cena "
            "cortada (cabeca ou rosto de quem aparece fora do quadro, cena sem as bordas): isso e sempre grave. Responda SO neste formato, uma linha por item:\n"
            "VEREDITO: APROVADO ou VEREDITO: REPROVADO\n"
            "PROBLEMA | mm:ss | grave ou leve | o que acontece | etapa (roteiro, graficos, legenda, som, voz, montagem ou mix)\n"
            "Grave e o que faria a pessoa recusar o video, e so e grave o que voce confirma em mais de um quadro seguido (animacao de "
            "entrada, giro ou transicao de 0,3 s nao conta). Sem problema grave, o veredito e APROVADO.\n\nROTEIRO:\n"
            + ROTEIRO.read_text(encoding="utf-8"))
        r = subprocess.run(["node", VER_VIDEO, str(FINAL), "--pergunta", pergunta],
                           capture_output=True, text=True, errors="replace", encoding="utf-8")
        (SAIDA / "olho-final.md").write_text(r.stdout, encoding="utf-8")
        if r.returncode != 0:
            avisos.append({"tipo": "custo", "seg": 0, "texto": "o ver-video falhou: pode ter sido cobrado mesmo assim, confira no painel do Gemini e anote a mao em dados/custos.jsonl se tiver cobrado", "etapa": ETAPA["render"]})
        if r.returncode == 0:   # respondeu: a cobranca aconteceu, uma linha so
            custo = Path(REGISTRAR_CUSTO)
            if custo.exists():
                subprocess.run(["node", str(custo), "--servico", "gemini-fiscal-olho-final", "--usd", str(ARGS.preco_usd),
                                "--contexto", f"olho final do fiscal: {FINAL.name}"] + (["--raiz", ARGS.raiz_custo] if ARGS.raiz_custo else []))
            else:
                avisos.append({"tipo": "custo", "seg": 0, "texto": f"o olho final custou US$ {ARGS.preco_usd} e a linha NAO foi gravada (nao achei {custo}); anote a mao em dados/custos.jsonl", "etapa": ETAPA["render"]})
        etapa_olho = {"roteiro": "roteiro (reescrever a linha) e depois a voz de novo", "graficos": ETAPA["posicao"],
                      "legenda": ETAPA["legenda"], "som": ETAPA["som"], "montagem": ETAPA["montagem"], "mix": ETAPA["mix"], "voz": ETAPA["voz"]}
        for l in r.stdout.splitlines():
            p = [x.strip() for x in l.split("|")]
            if len(p) >= 5 and p[0].upper().startswith("PROBLEMA"):
                mm = re.match(r"(\d+):(\d+)", p[1])
                seg = int(mm.group(1)) * 60 + int(mm.group(2)) if mm else 0
                etapa = next((v for k, v in etapa_olho.items() if k in p[4].lower()), ETAPA["render"])
                item = {"tipo": "olho final", "seg": seg, "texto": p[3][:300], "etapa": etapa}
                (falhas if "grave" in p[2].lower() else avisos).append(item)
        if r.returncode != 0 or "VEREDITO" not in r.stdout:
            avisos.append({"tipo": "olho final", "seg": 0, "texto": "o Gemini nao respondeu no formato; ver olho-final.md", "etapa": ETAPA["render"]})



if ARGS.so_olho_final:   # modo de teste do portao pago: pula render e gates, so decide se o olho final roda
    avisos = []
    olho_final(falhas, avisos)
    for a in falhas + avisos: print(f"{a['tipo']}: {a['texto']}")
    sys.exit(1 if falhas else 0)


# ---------- 1) gates antigos
cod, out = roda([sys.executable, str(AQUI / "loudness.py"), str(FINAL)])
if cod != 0:
    falha("loudness", 0, " ".join(l.strip() for l in out.splitlines() if "LOUD" in l or "PICO" in l or "baixo" in l or "alto" in l)[:300] or "loudness reprovado", "mix")
cod, out = roda([sys.executable, str(AQUI / "zona-segura.py"), str(FINAL)])
if cod != 0:
    falha("zona segura", 0, " ".join(l.strip() for l in out.splitlines() if "invade" in l or "BASE" in l or "TOPO" in l)[:300] or "zona segura reprovada", "posicao")
cod, out = roda([sys.executable, str(AQUI / "verificar-video.py"), str(PROPS), str(FINAL), "--bruto", str(BRUTO), "--public-dir", str(PUBLIC)])
if "PASSOU" not in out:
    for l in out.splitlines():
        if l.strip().startswith("-"):
            m = re.search(r"([\d.]+) s", l)
            falha("verificador", float(m.group(1)) if m else 0, l.strip("- ").strip()[:300], "montagem")
    if not any(l.strip().startswith("-") for l in out.splitlines()):
        falha("verificador", 0, ("o verificar-video.py nao terminou: " + (out.strip().splitlines() or ["sem saida"])[-1])[:300], "montagem")

# ---------- 2) render das camadas
print("[fiscal] renderizando as camadas (meia resolução, sem som)")
for c in CAMADAS + ["sfx"]:
    alvo = SAIDA / f"camada-{c}.mp4"
    pj = SAIDA / f"props-{c}.json"
    pj.write_text(json.dumps({**json.loads(PROPS_BASE.read_text(encoding="utf-8")), "fiscal": c}), encoding="utf-8")
    cod, out = roda(["node", str(REMOTION), "render", "src/index.ts", COMP, str(alvo), f"--props={pj}", f"--public-dir={PUBLIC}",
                     f"--scale={ESC}", "--muted", "--gl=angle", "--crf=18", "--log=error"])
    if cod != 0 or not alvo.exists():
        print(out[-2000:])
        sys.exit(f"render da camada {c} falhou")


def quadros(p):
    cap = cv2.VideoCapture(str(p))
    while True:
        ok, f = cap.read()
        if not ok:
            return
        yield f


# ---------- 3) palavras ditas no vídeo final (whisper local, pelo transcrever.mjs do motor, que o orquestrador passa)
leg = SAIDA / "fala-do-final.json"
palavras = []
if TRANSCREVER:
    cod, out = roda(["node", TRANSCREVER, str(FINAL), str(leg), ARGS.modelo])
    if leg.exists():
        palavras = [p for p in json.loads(leg.read_text(encoding="utf-8")) if re.search(r"\w", p["text"])]
    else:
        falha("transcrição", 0, "whisper não gerou a transcrição do final: fala sem legenda não foi conferida. Saída do transcritor: " + (out.strip()[-600:] or "(vazia)"), "render")
else:
    print("[fiscal] aviso: sem --transcrever, a conferência de fala sem legenda foi pulada")

# ---------- 4) análise quadro a quadro
yunet = cv2.FaceDetectorYN.create(str(AQUI / "modelos/face_detection_yunet_2023mar.onnx"), "", (540, 960), 0.7)
gens = {c: quadros(SAIDA / f"camada-{c}.mp4") for c in CAMADAS + ["sfx"]}
gfin = quadros(FINAL)
r = int(RESPIRO * ESC)
tem_legenda, sfx, entradas, pretos = [], [], [], []
anterior = {c: None for c in CAMADAS}
exemplos = {}
i = 0
while True:
    try:
        m = {c: cv2.cvtColor(next(gens[c]), cv2.COLOR_BGR2GRAY) > 128 for c in CAMADAS}
        s = cv2.cvtColor(next(gens["sfx"]), cv2.COLOR_BGR2GRAY)
        fin = cv2.resize(next(gfin), (540, 960))
    except StopIteration:
        break
    seg = i / FPS
    tem_legenda.append(bool(m["legenda"].any()))
    sfx.append(s[:25, :25].mean() > 128)
    if fin.mean() < 4:
        pretos.append(seg)
    # respiro entre camadas
    for a, b in PARES:
        if m[a].any() and m[b].any():
            dt = cv2.distanceTransform((~m[a]).astype(np.uint8), cv2.DIST_L2, 3)
            d = float(dt[m[b]].min())
            if d < r:
                chave = f"respiro {a} x {b}"
                exemplos.setdefault(chave, []).append((i, seg, d / ESC, m[a], m[b]))
    # rosto coberto
    rostos = yunet.detect(fin)[1]
    if rostos is not None:
        x, y, w, h = max(rostos[:, :4], key=lambda q: q[2] * q[3]).astype(int)
        x0, y0, x1, y1 = max(0, x + w // 10), max(0, y + h // 10), min(540, x + w - w // 10), min(960, y + h - h // 10)
        area = max(1, (x1 - x0) * (y1 - y0))
        cx, cy = min(539, x + w // 2), min(959, y + h // 2)
        # rosto dentro da moldura é o rosto do clipe de terceiro, não o da pessoa gravada: não conta
        for c in ([] if m["moldura"][cy, cx] else COBRE_ROSTO):
            cob = m[c][y0:y1, x0:x1].sum() / area
            if cob > 0.03:
                exemplos.setdefault(f"rosto coberto por {c}", []).append((i, seg, cob * 100, m[c], None))
    # gráfico de trás escondido pela pessoa: cada bloco (letras juntas por dilatação) pode ter no máximo 35% coberto.
    # Título atrás da cabeça é o estilo, mas a palavra tem que continuar legível (o olho final leu "PEGO" em "PRAZO").
    if m["atras"].any() and m["pessoa"].any():
        n, lab, st, _ = cv2.connectedComponentsWithStats(cv2.dilate(m["atras"].astype(np.uint8), np.ones((15, 15), np.uint8)))
        for k in range(1, n):
            bloco_m = (lab == k) & m["atras"]
            tot = bloco_m.sum()
            if tot > 400:
                cob = (bloco_m & m["pessoa"]).sum() / tot
                if cob > 0.35:
                    exemplos.setdefault("gráfico de trás escondido pela pessoa", []).append((i, seg, cob * 100, bloco_m, m["pessoa"]))
    # entradas de gráfico: bolha nova que não existia no quadro anterior
    for c in ["atras", "frente", "interface", "moldura"]:
        atual = cv2.resize(m[c].astype(np.uint8), (270, 480), interpolation=cv2.INTER_NEAREST)
        if anterior[c] is not None and atual.any():
            n, lab, st, _ = cv2.connectedComponentsWithStats(cv2.dilate(atual, np.ones((9, 9), np.uint8)))
            for k in range(1, n):
                bolha = lab == k
                if st[k, cv2.CC_STAT_AREA] > 30 and (anterior[c][bolha].sum() / bolha.sum()) < 0.05:
                    entradas.append((i, seg, c))
        anterior[c] = atual
    i += 1
N = i

# junta entradas próximas da mesma camada (escala crescendo, blocos em cascata)
# (cascata: cada bloco entra até 6 quadros depois do anterior, então a comparação é com o último da fila)
ent, ultimo = [], {}
for q, seg, c in sorted(entradas):
    if c not in ultimo or q - ultimo[c] > 6:
        ent.append((q, seg, c))
    ultimo[c] = q
onsets = [k for k in range(N) if sfx[k] and (k == 0 or not sfx[k - 1])]
for q, seg, c in ent:
    if not any(abs(o - q) <= 5 for o in onsets):
        falha("gráfico sem som", seg, f"gráfico entrou na camada '{c}' sem efeito sonoro a até 0,17 s", "som")

# fala sem legenda, palavra por palavra
ruins = []
# a legenda pode entrar até 0,15 s depois do começo da palavra (o whisper adianta o início da primeira palavra)
for p in palavras:
    a = int((p["startMs"] / 1000 + 0.15) * FPS)          # palavra curta: confere o quadro de 0,15 s depois do início
    b = max(a + 1, int(p["endMs"] / 1000 * FPS))
    trecho = tem_legenda[a:min(b, N)]
    if trecho and sum(trecho) / len(trecho) < 0.6:
        ruins.append((p["startMs"] / 1000, p["text"].strip()))
bloco = []
for seg, t in ruins + [(1e9, "")]:
    if bloco and seg - bloco[-1][0] > 0.6:
        falha("fala sem legenda", bloco[0][0], f"de {bloco[0][0]:.2f} a {bloco[-1][0]:.2f} s: \"{' '.join(x[1] for x in bloco)}\"", "legenda")
        bloco = []
    bloco.append((seg, t))

# quadro preto no meio (0,5 s nas pontas passa)
meio = [s for s in pretos if 0.5 < s < N / FPS - 0.5]
if meio:
    falha("quadro preto", meio[0], f"{len(meio)} quadro(s) preto(s) entre {meio[0]:.2f} e {meio[-1]:.2f} s", "render")

# respiro e rosto: uma falha por trecho contínuo, com quadro marcado
cap = cv2.VideoCapture(str(FINAL))
for chave, lista in exemplos.items():
    trechos, atual = [], [lista[0]]
    for e in lista[1:]:
        if e[0] - atual[-1][0] <= 2:
            atual.append(e)
        else:
            trechos.append(atual); atual = [e]
    trechos.append(atual)
    for t in trechos:
        if len(t) < 3:          # menos de 0,1 s (entrada com mola passando rente) não conta
            continue
        if chave.startswith("gráfico de trás") and len(t) < 9:   # palavra ainda crescendo na entrada (mola de 8 quadros)
            continue
        if chave.startswith("respiro"):
            pior = min(t, key=lambda e: e[2])
        elif chave.startswith("gráfico de trás"):
            pior = sorted(t, key=lambda e: e[2])[len(t) // 2]   # quadro mediano, não o da entrada
        else:
            pior = max(t, key=lambda e: e[2])
        q, seg = pior[0], pior[1]
        cap.set(cv2.CAP_PROP_POS_FRAMES, q)
        ok, f = cap.read()
        if ok:
            f = cv2.resize(f, (540, 960))
            for mask, cor in ((pior[3], (0, 0, 255)), (pior[4], (255, 128, 0))):
                if mask is not None:
                    cs, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    cv2.drawContours(f, cs, -1, cor, 2)
            nome = f"{re.sub(r'[^a-z]+', '-', chave)}-{seg:05.2f}s.jpg"
            cv2.imwrite(str(SAIDA / "quadros" / nome), f)
        if chave.startswith("gráfico de trás"):
            med = float(np.median([e[2] for e in t]))
            falha(chave, t[0][1], f"de {t[0][1]:.2f} a {t[-1][1]:.2f} s, {med:.0f}% do bloco atrás da pessoa na mediana (máximo 35%); quadro em quadros/", "escondido")
        elif chave.startswith("respiro"):
            falha(chave, t[0][1], f"de {t[0][1]:.2f} a {t[-1][1]:.2f} s, menor distância {pior[2]:.0f} px (mínimo {RESPIRO}); quadro em quadros/", "respiro")
        else:
            falha(chave, t[0][1], f"de {t[0][1]:.2f} a {t[-1][1]:.2f} s, até {pior[2]:.0f}% do rosto coberto; quadro em quadros/", "rosto")


# ---------- 5) olho final (Gemini, PAGO): so roda com --roteiro, --preco-usd e --autorizado, e so se a conferencia por
# script passou, pra nao pagar por video que ja ia voltar. Ve e ouve o video inteiro contra o roteiro e julga o que
# script nao julga. So problema GRAVE reprova; o leve vai como aviso.
avisos = []
olho_final(falhas, avisos)

# ---------- 6) relatório
falhas.sort(key=lambda f: f["seg"])
(SAIDA / "falhas.json").write_text(json.dumps(falhas, ensure_ascii=False, indent=2), encoding="utf-8")
lin = [f"# Fiscal: {FINAL.name}", "", f"{N} quadros conferidos ({N / FPS:.2f} s), {len(ent)} entradas de gráfico, {len(onsets)} efeitos sonoros, "
       f"{len(palavras)} palavras faladas.", ""]
if falhas:
    lin += ["**REPROVADO.** Cada falha volta pra etapa indicada, que corrige, renderiza de novo e passa aqui outra vez.", "",
            "| Segundo | Falha | O que aconteceu | Quem corrige |", "|---|---|---|---|"]
    lin += [f"| {f['seg']:.2f} | {f['tipo']} | {f['texto']} | {f['etapa']} |" for f in falhas]
else:
    lin += ["**APROVADO.** Pode seguir pra revisão final."]
if avisos:
    lin += ["", "Avisos (não reprovam, vale olhar junto):", ""] + [f"- {a['seg']:.0f} s: {a['texto']}" for a in avisos]
(SAIDA / "relatorio.md").write_text("\n".join(lin) + "\n", encoding="utf-8")
print("\n".join(lin))
sys.exit(1 if falhas else 0)
