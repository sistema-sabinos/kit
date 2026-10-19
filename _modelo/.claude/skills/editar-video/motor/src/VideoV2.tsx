// VideoV2: o VideoV1 inteiro por dentro, mais abertura que assenta, flash de 2 quadros com a cena assentando do
// desfoque, palavra-chave em duas camadas com revelação por bloco e cartão tipográfico em tela cheia.
// Zoom em degraus usa o escalasSeg do V1; cor e empurrão usam filtroPessoa e empurrao do V1.

import { z } from "zod";
import { AbsoluteFill, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { VideoV1, schemaVideoV1 } from "./VideoV1";
import { tema } from "./tema";

const { fontFamily: anton } = loadAnton();
const { fontFamily: montserrat } = loadMontserrat("normal", { weights: ["800", "900"] });

export const schemaVideoV2 = schemaVideoV1.extend({
  abertura: z.object({ de: z.number(), frames: z.number() }).nullable().default({ de: 1.4, frames: 12 }),
  flashes: z.array(z.object({ seg: z.number(), cor: z.string().default(tema.legendaDestaque) })).default([]),
  chaves: z
    .array(z.object({ apoio: z.string().default(""), chave: z.string(), deSeg: z.number(), ateSeg: z.number(), topo: z.number(), cor: z.string().default(tema.legendaDestaque), tamanho: z.number().default(170) }))
    .default([]),
  cartoes: z
    .array(
      z.object({
        deSeg: z.number(),
        ateSeg: z.number(),
        linhas: z.array(z.object({ texto: z.string(), cor: z.string().default("#FFFFFF"), tamanho: z.number().default(170), aSeg: z.number().default(0) })),
      }),
    )
    .default([]),
  // onda que mexe com a voz: valores (0 a 1, um por quadro) vem do preparar-props; a caixa fica na zona segura
  ondas: z
    .array(
      z.object({
        deSeg: z.number(), ateSeg: z.number(), valores: z.array(z.number().min(0).max(1)).min(1),
        topo: z.number().default(1060), altura: z.number().positive().default(150), largura: z.number().positive().max(800).default(720),
        barras: z.number().int().min(4).max(64).default(28), cor: z.string().default(tema.legendaDestaque),
      }).refine((o) => o.topo >= tema.zonaTopo && o.topo + o.altura <= tema.baseUtil && o.ateSeg - o.deSeg >= 0.5, { message: "onda fora da zona segura: topo >= 250 e topo + altura <= 1436" }),
    )
    .default([]),
});
export type PropsVideoV2 = z.infer<typeof schemaVideoV2>;

const sombra = "drop-shadow(0 6px 0 #000) drop-shadow(0 0 22px rgba(0,0,0,0.9))";

// Bloco de destaque varre o lugar em 3 frames e revela a palavra, que entra com escala 1,15 -> 1 e desfoque 8 -> 0
const Chave: React.FC<{ apoio: string; chave: string; topo: number; cor: string; tamanho: number; duracao: number }> = ({ apoio, chave, topo, cor, tamanho, duracao }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const sApoio = spring({ frame, fps, config: { damping: 14, stiffness: 320, mass: 0.6 } });
  const f0 = apoio ? 4 : 0; // a chave entra depois do apoio
  const barra = interpolate(frame, [f0, f0 + 2, f0 + 3, f0 + 5], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const esc = interpolate(frame, [f0 + 2, f0 + 7], [1.15, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const blur = interpolate(frame, [f0 + 2, f0 + 7], [8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const vis = frame >= f0 + 2 ? 1 : 0;
  const sai = interpolate(frame, [duracao - 4, duracao], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", top: topo, left: 0, width: tema.largura, display: "flex", flexDirection: "column", alignItems: "center", opacity: sai }}>
      {apoio ? (
        <div style={{ fontFamily: montserrat, fontWeight: 800, fontSize: 58, color: "#fff", transform: `scale(${sApoio})`, filter: sombra, marginBottom: -8 }}>{apoio}</div>
      ) : null}
      <div style={{ position: "relative", display: "inline-block" }}>
        <div
          style={{
            fontFamily: anton, fontSize: tamanho, lineHeight: 1.02, textTransform: "uppercase", letterSpacing: 1, whiteSpace: "nowrap",
            // o degradê recortado no texto não pintava o que passa acima da linha (til de maiúscula saía só sombra)
            paddingTop: "0.14em", marginTop: "-0.14em",
            backgroundImage: `linear-gradient(180deg, ${cor} 0%, ${cor} 55%, #ffffff 125%)`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent",
            transform: `scale(${esc})`, filter: `blur(${blur}px) ${sombra}`, opacity: vis,
          }}
        >
          {chave}
        </div>
        <div style={{ position: "absolute", left: 0, top: "12%", height: "76%", width: "100%", backgroundColor: tema.legendaDestaque, transform: `scaleX(${barra})`, transformOrigin: "0% 50%" }} />
      </div>
    </div>
  );
};

// cartão tipográfico em tela cheia: fundo grafite com luz suave, cada linha desliza da direita no seu tempo
const Cartao: React.FC<{ linhas: PropsVideoV2["cartoes"][number]["linhas"]; duracao: number }> = ({ linhas, duracao }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const luz = interpolate(frame, [0, duracao], [35, 65]);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at ${luz}% 40%, #2b2b33 0%, #1a1a16 45%, #0b0b0d 100%)`,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
      }}
    >
      {linhas.map((l, i) => {
        const f0 = Math.round(l.aSeg * fps);
        const p = interpolate(frame, [f0, f0 + 7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
        return (
          <div
            key={i}
            style={{
              fontFamily: anton, fontSize: l.tamanho, lineHeight: 1.0, textTransform: "uppercase", color: l.cor, whiteSpace: "nowrap",
              transform: `translateX(${(1 - p) * 160}px)`, opacity: p, filter: `blur(${(1 - p) * 10}px) drop-shadow(0 6px 0 #000)`,
            }}
          >
            {l.texto}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// barras simetricas a partir do centro: a do meio le o volume de agora, as das pontas leem quadros anteriores,
// entao o som "anda" do centro pras bordas; minimo de 6% pra onda nao sumir na pausa
const Onda: React.FC<{ o: PropsVideoV2["ondas"][number]; duracao: number }> = ({ o, duracao }) => {
  const frame = useCurrentFrame();
  const v = (k: number) => o.valores[Math.min(o.valores.length - 1, Math.max(0, frame - k))];
  const meio = (o.barras - 1) / 2;
  const passo = o.largura / o.barras;
  const entra = interpolate(frame, [0, 6, duracao - 6, duracao], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", top: o.topo, left: (tema.largura - o.largura) / 2, width: o.largura, height: o.altura, display: "flex", alignItems: "center", opacity: entra }}>
      {Array.from({ length: o.barras }, (_, i) => {
        const dist = Math.abs(i - meio) / Math.max(meio, 1);
        const nivel = (v(Math.round(dist * 6)) + v(Math.round(dist * 6) + 1)) / 2;
        const h = o.altura * Math.max(0.06, nivel * (1 - 0.55 * dist * dist));
        return <div key={i} style={{ width: passo * 0.6, marginLeft: passo * 0.2, marginRight: passo * 0.2, height: h, borderRadius: passo * 0.3, backgroundColor: o.cor, filter: "drop-shadow(0 4px 0 #000)" }} />;
      })}
    </div>
  );
};

export const VideoV2: React.FC<PropsVideoV2> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = (s: number) => Math.round(s * fps);
  const dseg = (a: number, b: number) => Math.max(1, f(b) - f(a));

  // abertura e assentamento depois de cada flash: escala e desfoque no quadro inteiro
  let escala = 1;
  let blur = 0;
  if (p.abertura && frame < p.abertura.frames) {
    const t = interpolate(frame, [0, p.abertura.frames], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
    escala = p.abertura.de + (1 - p.abertura.de) * t;
    blur = 10 * (1 - t);
  }
  for (const fl of p.flashes) {
    const k = frame - (f(fl.seg) + 2);
    if (k >= 0 && k < 6) {
      const t = Easing.out(Easing.cubic)(k / 6);
      escala = 1.08 + (1 - 1.08) * t;
      blur = 12 * (1 - t);
    }
  }
  const flashAgora = p.flashes.find((fl) => frame >= f(fl.seg) && frame < f(fl.seg) + 2);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0b0b0d" }}>
      <AbsoluteFill style={{ transform: `scale(${escala})`, filter: blur > 0.05 ? `blur(${blur}px)` : undefined, transformOrigin: "50% 45%" }}>
        <VideoV1 {...p} />
        {p.cartoes.map((c, i) => (
          <Sequence key={`k${i}`} from={f(c.deSeg)} durationInFrames={dseg(c.deSeg, c.ateSeg)} layout="none">
            <Cartao linhas={c.linhas} duracao={dseg(c.deSeg, c.ateSeg)} />
          </Sequence>
        ))}
        {p.chaves.map((c, i) => (
          <Sequence key={`c${i}`} from={f(c.deSeg)} durationInFrames={dseg(c.deSeg, c.ateSeg)} layout="none">
            <Chave apoio={c.apoio} chave={c.chave} topo={c.topo} cor={c.cor} tamanho={c.tamanho} duracao={dseg(c.deSeg, c.ateSeg)} />
          </Sequence>
        ))}
        {p.ondas.map((o, i) => (
          <Sequence key={`o${i}`} from={f(o.deSeg)} durationInFrames={dseg(o.deSeg, o.ateSeg)} layout="none">
            <Onda o={o} duracao={dseg(o.deSeg, o.ateSeg)} />
          </Sequence>
        ))}
      </AbsoluteFill>
      {flashAgora ? <AbsoluteFill style={{ backgroundColor: flashAgora.cor }} /> : null}
    </AbsoluteFill>
  );
};
