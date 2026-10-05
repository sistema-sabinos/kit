// Vídeo com tela em cima (painel de 800 px por padrão) e a pessoa embaixo, tudo guiado por props: cada linha de
// `segmentos` vira um trecho do painel (vídeo ou imagem, com recorte, deslocamento, velocidade e zoom), mais
// palavra-chave, lista que monta, círculo, risco, rótulo, legenda e efeitos sonoros.
// Pra quadro inteiro (sem painel), mande `alturaTela: 0` e `recorteTopoPessoa: 0`.

import { z } from "zod";
import { AbsoluteFill, Easing, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio, Video } from "@remotion/media";
import { noise } from "@remotion/effects/noise";
import { vignette } from "@remotion/effects/vignette";
import { shadowsHighlights } from "@remotion/effects/shadows-highlights";
import { zoomBlur } from "@remotion/effects/zoom-blur";
import { loadFont } from "@remotion/google-fonts/Montserrat";
import { Legendas } from "./Legendas";
import { tema } from "./tema";

const { fontFamily } = loadFont("normal", { weights: ["700", "800", "900"] });

const crop = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
const zoom = z.object({
  de: z.number().default(1),
  ate: z.number().default(1.12),
  origem: z.tuple([z.number(), z.number()]).default([50, 30]),
  duracaoSeg: z.number().default(0.3),
});

export const schemaVideoV1 = z.object({
  pessoa: z.string(),
  voz: z.string(),
  legendas: z.string(),
  duracaoSeg: z.number().positive(),
  alturaTela: z.number().default(800),
  recorteTopoPessoa: z.number().min(0).max(1).default(0.3),
  cortesSeg: z.array(z.number()),
  // A cada corte o enquadramento da pessoa alterna 1,0 / escalaCorte, com origem no topo da cabeça (22%) pra ela
  // não subir até a barra do painel. escalasSeg, se vier, fixa a escala de cada bloco (cortesSeg.length + 1 valores)
  // e vence a alternância: bloco com frase atrás fica em 1,0, porque qualquer escala corta a frase nas laterais.
  escalaCorte: z.number().default(1.25),
  origemPessoa: z.string().default("50% 22%"),
  escalasSeg: z.array(z.number()).nullable().default(null),
  // Cor na pessoa (filtro CSS, ex. "saturate(1.6) contrast(1.15)") e empurrão lento que multiplica a escala do bloco.
  // Nulos por padrão.
  filtroPessoa: z.string().nullish(),
  empurrao: z.object({ deSeg: z.number(), ateSeg: z.number(), ate: z.number() }).nullish(),
  // Acabamento de cinema por shader em cima da PESSOA, nunca da inserção (grão em cima de print de tela
  // fica sujo). É o padrão: sem `acabamento` nos props, entram os valores de ACABAMENTO_PADRAO.
  // `acabamento: null` desliga. Exige `--gl=angle` no render. Detalhe no documento de acabamento.
  acabamento: z
    .object({
      grao: z.number().min(0).max(1).default(0.18),
      vinheta: z.number().min(0).max(1).default(0.22),
      sombras: z.number().min(-1).max(1).default(0.1),
      altas: z.number().min(-1).max(1).default(-0.08),
      // Borrão radial no punch-in. É o que dá peso ao zoom em degraus: sem ele o zoom "pula",
      // com ele a câmera parece se mover. Só entra ENQUANTO a escala está mudando, nunca parado,
      // senão o vídeo inteiro fica borrado. `blurMax` é em pixels, no pico da transição.
      blurMax: z.number().min(0).max(80).default(18),
    })
    .nullish(),
  topoLegenda: z.number().default(tema.topoLegendaPadrao),
  segmentos: z.array(
    z.object({
      deSeg: z.number(),
      ateSeg: z.number(),
      tipo: z.enum(["video", "imagem"]).default("video"),
      arquivo: z.string(),
      tam: z.object({ w: z.number(), h: z.number() }),
      crop: crop.nullable().default(null),
      offsetSeg: z.number().default(0),
      velocidade: z.number().default(1),
      zoom: zoom.nullable().default(null),
      cheia: z.boolean().default(false),
    }),
  ),
  palavras: z
    .array(z.object({ texto: z.string(), deSeg: z.number(), ateSeg: z.number(), topo: z.number().default(820), tamanho: z.number().default(96) }))
    .default([]),
  lista: z
    .object({ topo: z.number(), esquerda: z.number(), ateSeg: z.number(), itens: z.array(z.object({ texto: z.string(), deSeg: z.number() })) })
    .nullable()
    .default(null),
  circulos: z.array(z.object({ deSeg: z.number(), ateSeg: z.number(), x: z.number(), y: z.number(), w: z.number(), h: z.number() })).default([]),
  riscos: z.array(z.object({ deSeg: z.number(), ateSeg: z.number(), x: z.number(), y: z.number(), w: z.number() })).default([]),
  rotulos: z.array(z.object({ texto: z.string(), deSeg: z.number(), ateSeg: z.number(), x: z.number(), y: z.number() })).default([]),
  sfx: z.array(z.object({ arquivo: z.string(), seg: z.number(), volume: z.number().min(0).max(1).default(0.4), offsetSeg: z.number().default(0), duracaoSeg: z.number().nullable().default(null) })).default([]),
});
export type PropsVideoV1 = z.infer<typeof schemaVideoV1>;

// Monta a pilha de shaders do acabamento. Ordem importa: primeiro a densidade (sombras e altas),
// depois a vinheta que escurece a borda, e o grão por último pra ele cair por cima de tudo.
// Efeito com valor 0 nem entra na pilha, pra não pagar shader à toa no render.
// Quanto de borrão o punch-in pede neste instante, de 0 a 1. O zoom aqui é degrau instantâneo no
// corte (ver escalaNoCorte), então o borrão é um pulso curto logo depois da troca, decaindo. Sem
// isso o zoom "pula"; com isso a câmera parece se mover. Parado, é sempre 0.
const PULSO_BLUR_SEG = 0.18;
export const forcaDoBlur = (seg: number, cortes: number[]) => {
  let melhor = 0;
  for (const c of cortes) {
    const d = seg - c;
    if (d >= 0 && d < PULSO_BLUR_SEG) {
      melhor = Math.max(melhor, 1 - d / PULSO_BLUR_SEG);
    }
  }
  return melhor;
};

// Props que não declaram `acabamento` recebem estes valores; `acabamento: null` desliga o acabamento.
export const ACABAMENTO_PADRAO = { grao: 0.18, vinheta: 0.22, sombras: 0.1, altas: -0.08, blurMax: 18 } as const;

export const efeitosAcabamento = (a: PropsVideoV1["acabamento"], blur = 0) => {
  if (a === null) return undefined; // desligado de propósito
  const cfg = a ?? ACABAMENTO_PADRAO;
  const pilha = [];
  // borrão primeiro: ele simula o movimento da lente, então vem antes da cor e do grão
  if (cfg.blurMax > 0 && blur > 0.01) {
    pilha.push(zoomBlur({ amount: cfg.blurMax * blur, center: [0.5, 0.35], samples: 16 }));
  }
  if (cfg.sombras !== 0 || cfg.altas !== 0) {
    pilha.push(shadowsHighlights({ shadows: cfg.sombras, highlights: cfg.altas }));
  }
  if (cfg.vinheta > 0) {
    pilha.push(vignette({ amount: cfg.vinheta }));
  }
  if (cfg.grao > 0) {
    // premultiply: o grão é multiplicado pela cor de entrada antes de misturar, então ele
    // escala com a luz. Em cenário escuro isso importa: sem premultiply o grão vira chuvisco
    // no fundo vazio, que a compressão da rede preserva. Com ele, o grão vive na pele e no
    // meio-tom, que é onde grão serve pra alguma coisa.
    pilha.push(noise({ amount: cfg.grao, premultiply: true }));
  }
  return pilha.length > 0 ? pilha : undefined;
};

const escalaNoCorte = (seg: number, cortes: number[], escala: number, fixas: number[] | null) => {
  const bloco = cortes.filter((c) => seg >= c).length;
  if (fixas && fixas[bloco] !== undefined) return fixas[bloco];
  return bloco % 2 === 1 ? escala : 1.0;
};
const sombraDura = "0 7px 0 #000, 4px 4px 0 #000, -4px 4px 0 #000, 0 0 28px rgba(0,0,0,0.95)";

const Palavra: React.FC<{ texto: string; topo: number; tamanho: number; duracao: number }> = ({ texto, topo, tamanho, duracao }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 12, stiffness: 300, mass: 0.8 } });
  const sai = interpolate(frame, [duracao - 5, duracao], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        // margem lateral da zona segura (documento de zona segura): sem ela, palavra-chave comprida
        // corria por baixo da coluna de ações do TikTok, que reserva 140 px à direita.
        position: "absolute", top: topo, left: tema.zonaEsquerda, right: tema.zonaDireita,
        textAlign: "center", fontFamily, fontWeight: 900,
        fontSize: tamanho, letterSpacing: -2, textTransform: "uppercase", color: tema.legendaDestaque, textShadow: sombraDura,
        transform: `scale(${s})`, opacity: sai,
      }}
    >
      {texto}
    </div>
  );
};

// painel: fonte (vídeo ou imagem) em cover da área útil, com zoom opcional
const Painel: React.FC<{ seg: PropsVideoV1["segmentos"][number]; boxW: number; boxH: number; dur: number; t: number }> = ({ seg, boxW, boxH, dur, t }) => {
  const { fps } = useVideoConfig();
  const c = seg.crop ?? { x: 0, y: 0, w: seg.tam.w, h: seg.tam.h };
  const s = Math.max(boxW / c.w, boxH / c.h);
  const vw = seg.tam.w * s;
  const vh = seg.tam.h * s;
  const left = -c.x * s - (c.w * s - boxW) / 2;
  const top = -c.y * s;
  const z = seg.zoom;
  const escala = z
    ? interpolate(t, [0, z.duracaoSeg], [z.de, z.ate], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) })
    : 1;
  const origem = z ? `${z.origem[0]}% ${z.origem[1]}%` : "50% 30%";
  // maxWidth none: o preflight do Tailwind põe max-width 100% em img/video e travava a largura em 1080, esticando só a altura (causa comum de imagem esticada)
  const estilo = { position: "absolute" as const, left, top, width: vw, height: vh, maxWidth: "none", maxHeight: "none" };
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: boxW, height: boxH, overflow: "hidden", transform: `scale(${escala})`, transformOrigin: origem, backgroundColor: "#0b0b0d" }}>
      {seg.tipo === "imagem" ? (
        <Img src={staticFile(seg.arquivo)} style={estilo} />
      ) : (
        <Video src={staticFile(seg.arquivo)} durationInFrames={dur} muted trimBefore={Math.round(seg.offsetSeg * fps)} playbackRate={seg.velocidade} style={estilo} />
      )}
    </div>
  );
};

const Circulo: React.FC<{ x: number; y: number; w: number; h: number; duracao: number }> = ({ x, y, w, h, duracao }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const sai = interpolate(frame, [duracao - 4, duracao], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rx = w / 2;
  const ry = h / 2;
  const per = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  return (
    <svg style={{ position: "absolute", left: x - 12, top: y - 12, opacity: sai }} width={w + 24} height={h + 24}>
      <ellipse cx={rx + 12} cy={ry + 12} rx={rx} ry={ry} fill="none" stroke={tema.legendaDestaque} strokeWidth={10} strokeLinecap="round" strokeDasharray={per} strokeDashoffset={per * (1 - p)} transform={`rotate(-8 ${rx + 12} ${ry + 12})`} />
    </svg>
  );
};

const Risco: React.FC<{ x: number; y: number; w: number; duracao: number }> = ({ x, y, w, duracao }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const sai = interpolate(frame, [duracao - 4, duracao], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <div style={{ position: "absolute", left: x, top: y, width: w * p, height: 10, backgroundColor: tema.vermelho, borderRadius: 5, opacity: sai, boxShadow: "0 0 12px rgba(0,0,0,0.6)" }} />;
};

const Rotulo: React.FC<{ texto: string; x: number; y: number; duracao: number }> = ({ texto, x, y, duracao }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 20, stiffness: 200, mass: 0.5 } });
  const sai = interpolate(frame, [duracao - 5, duracao], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute", left: x, top: y, padding: "14px 26px", borderRadius: 40, backgroundColor: tema.legendaDestaque, color: "#111",
        fontFamily, fontWeight: 800, fontSize: 40, transform: `scale(${s})`, transformOrigin: "0% 50%", opacity: sai, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        whiteSpace: "nowrap",
      }}
    >
      {texto}
    </div>
  );
};

const ItemLista: React.FC<{ texto: string }> = ({ texto }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 12, stiffness: 300, mass: 0.8 } });
  return (
    <div
      style={{
        fontFamily, fontWeight: 900, fontSize: 60, letterSpacing: -1, textTransform: "uppercase", color: tema.legendaBranco,
        textShadow: "0 5px 0 #000, 3px 3px 0 #000, -3px 3px 0 #000, 0 0 22px rgba(0,0,0,0.95)", transform: `scale(${s})`, transformOrigin: "0% 50%", lineHeight: 1.25,
      }}
    >
      {texto}
    </div>
  );
};

export const VideoV1: React.FC<PropsVideoV1> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seg = frame / fps;
  const dur = Math.round(p.duracaoSeg * fps);
  const boxH = p.alturaTela;
  const f = (s: number) => Math.round(s * fps);
  const dseg = (a: number, b: number) => Math.max(1, f(b) - f(a));

  return (
    <AbsoluteFill style={{ backgroundColor: tema.fundoPainel }}>
      {/* painel da tela em cima */}
      <div style={{ position: "absolute", top: 0, left: 0, width: tema.largura, height: boxH, overflow: "hidden", backgroundColor: "#0b0b0d" }}>
        {p.segmentos.filter((s) => !s.cheia).map((s, i) => (
          <Sequence key={i} from={f(s.deSeg)} durationInFrames={dseg(s.deSeg, s.ateSeg)} layout="none">
            <Painel seg={s} boxW={tema.largura} boxH={boxH} dur={dur} t={seg - s.deSeg} />
          </Sequence>
        ))}
        {p.circulos.map((c, i) => (
          <Sequence key={`c${i}`} from={f(c.deSeg)} durationInFrames={dseg(c.deSeg, c.ateSeg)} layout="none">
            <Circulo x={c.x} y={c.y} w={c.w} h={c.h} duracao={dseg(c.deSeg, c.ateSeg)} />
          </Sequence>
        ))}
        {p.riscos.map((r, i) => (
          <Sequence key={`r${i}`} from={f(r.deSeg)} durationInFrames={dseg(r.deSeg, r.ateSeg)} layout="none">
            <Risco x={r.x} y={r.y} w={r.w} duracao={dseg(r.deSeg, r.ateSeg)} />
          </Sequence>
        ))}
        {p.rotulos.map((r, i) => (
          <Sequence key={`t${i}`} from={f(r.deSeg)} durationInFrames={dseg(r.deSeg, r.ateSeg)} layout="none">
            <Rotulo texto={r.texto} x={r.x} y={r.y} duracao={dseg(r.deSeg, r.ateSeg)} />
          </Sequence>
        ))}
        {p.lista && seg < p.lista.ateSeg ? (
          <div style={{ position: "absolute", left: p.lista.esquerda, top: p.lista.topo, padding: "18px 36px 18px 28px", borderRadius: 24, backgroundColor: "rgba(0,0,0,0.62)" }}>
            {p.lista.itens.map((it, i) => (
              <Sequence key={`l${i}`} from={f(it.deSeg)} layout="none">
                <ItemLista texto={it.texto} />
              </Sequence>
            ))}
          </div>
        ) : null}
      </div>

      {boxH > 0 ? <div style={{ position: "absolute", top: boxH, left: 0, width: tema.largura, height: 4, backgroundColor: tema.legendaDestaque, opacity: 0.9 }} /> : null}

      {/* pessoa embaixo, cover sem barra (corta a base), punch-in alternado nos cortes */}
      <div style={{ position: "absolute", top: boxH > 0 ? boxH + 4 : 0, left: 0, width: tema.largura, height: tema.altura - (boxH > 0 ? boxH + 4 : 0), overflow: "hidden" }}>
        <Video
          src={staticFile(p.pessoa)}
          durationInFrames={dur}
          muted
          effects={efeitosAcabamento(p.acabamento, forcaDoBlur(seg, p.cortesSeg))}
          style={{
            position: "absolute", left: 0, width: tema.largura, height: tema.altura, top: -Math.round(boxH * p.recorteTopoPessoa),
            transform: `scale(${escalaNoCorte(seg, p.cortesSeg, p.escalaCorte, p.escalasSeg) * (p.empurrao ? interpolate(seg, [p.empurrao.deSeg, p.empurrao.ateSeg], [1, p.empurrao.ate], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) }) : 1)})`,
            transformOrigin: p.origemPessoa, filter: p.filtroPessoa ?? undefined,
          }}
        />
      </div>

      {/* inserção em tela cheia */}
      {p.segmentos.filter((s) => s.cheia).map((s, i) => (
        <Sequence key={`f${i}`} from={f(s.deSeg)} durationInFrames={dseg(s.deSeg, s.ateSeg)} layout="none">
          <AbsoluteFill style={{ backgroundColor: "#0b0b0d" }}>
            <Painel seg={s} boxW={tema.largura} boxH={tema.altura} dur={dur} t={seg - s.deSeg} />
          </AbsoluteFill>
        </Sequence>
      ))}

      {p.palavras.map((w, i) => (
        <Sequence key={`p${i}`} from={f(w.deSeg)} durationInFrames={dseg(w.deSeg, w.ateSeg)} layout="none">
          <Palavra texto={w.texto} topo={w.topo} tamanho={w.tamanho} duracao={dseg(w.deSeg, w.ateSeg)} />
        </Sequence>
      ))}

      <Legendas arquivo={p.legendas} fontFamily={fontFamily} topo={p.topoLegenda} />

      <Audio src={staticFile(p.voz)} />
      {p.sfx.map((s, i) => (
        <Sequence key={`s${i}`} from={f(s.seg)} durationInFrames={s.duracaoSeg ? f(s.duracaoSeg) : undefined} layout="none">
          <Audio src={staticFile(s.arquivo)} volume={s.volume} trimBefore={Math.round(s.offsetSeg * fps)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
