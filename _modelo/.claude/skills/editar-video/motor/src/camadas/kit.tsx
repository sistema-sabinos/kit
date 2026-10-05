// Kit do padrão "camadas" (vídeo com a pessoa recortada do fundo verde, gráficos atrás e na frente dela).
// Ordem das camadas, de baixo pra cima: cenário, gráfico de trás, pessoa recortada (webm com alfa),
// gráfico da frente, legenda. Cada vídeo escreve os próprios gráficos (um por frase) usando estas peças.
// Regras do padrão: todo gráfico entra com mola curta e sai em corte seco; todo gráfico que entra tem efeito
// sonoro (5 a 6 por 10 s ou mais); zoom da pessoa em degrau; música audível, pelo mix-final.py.
import React, { createContext, useContext } from "react";
import { AbsoluteFill, Easing, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Audio } from "@remotion/media";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { tema } from "../tema";

export const { fontFamily: anton } = loadAnton();
export const { fontFamily: mont } = loadMontserrat("normal", { weights: ["600", "800"] });

// ---------- modo fiscal (scripts/fiscal.py): o vídeo é renderizado uma vez por camada, só com ela, em branco sobre
// preto, pra o fiscal medir distância entre camadas, rosto coberto, fala sem legenda e gráfico sem som.
// Todo elemento visível de um vídeo novo fica dentro de uma <Camada>; o que ficar fora o fiscal não enxerga.
export type NomeCamada = "cena" | "atras" | "pessoa" | "frente" | "legenda" | "interface" | "moldura";
export const CAMADAS_FISCAL: (NomeCamada | "sfx")[] = ["atras", "pessoa", "frente", "legenda", "interface", "moldura", "sfx"];
export const FiscalCtx = createContext<NomeCamada | "sfx" | null>(null);
export const Camada: React.FC<{ nome: NomeCamada; children: React.ReactNode }> = ({ nome, children }) => {
  const fiscal = useContext(FiscalCtx);
  if (fiscal === null) return <>{children}</>;
  if (fiscal !== nome) return null;
  return <AbsoluteFill style={{ filter: "brightness(0) invert(1)" }}>{children}</AbsoluteFill>;
};
export const RaizFiscal: React.FC<{ fiscal?: string; children: React.ReactNode }> = ({ fiscal, children }) => (
  <FiscalCtx.Provider value={(fiscal as NomeCamada | "sfx" | undefined) ?? null}>
    <AbsoluteFill style={{ backgroundColor: fiscal ? "#000" : "#06070D" }}>{children}</AbsoluteFill>
  </FiscalCtx.Provider>
);

export const AMARELO = tema.legendaDestaque;
export const VERMELHO = "#FF4D4D";
export const VIDRO = "rgba(16,20,40,0.82)";
export const BORDA = "1.5px solid rgba(255,255,255,0.16)";
export const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const F = (seg: number) => Math.round(seg * tema.fps);

// entrada com mola curta (0 → 1,06 → 1 em 8 quadros); a saída é corte seco, com `visivel`
export const mola = (frame: number, ini: number) => interpolate(frame, [ini, ini + 5, ini + 8], [0, 1.06, 1], CLAMP);
export const visivel = (frame: number, ini: number, fim: number) => frame >= ini && frame < fim;

// zoom em degrau: [segundo, escala], troca em 4 quadros
export const escalaEmDegrau = (frame: number, degraus: [number, number][]) => {
  let e = degraus[0][1];
  for (let i = 1; i < degraus.length; i++) {
    const ini = F(degraus[i][0]);
    e = interpolate(frame, [ini, ini + 4], [e, degraus[i][1]], { ...CLAMP, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  }
  return e;
};

// cenário: imagem do estúdio com escurecido em cima pra o gráfico de trás ler, e vinheta
export const CenarioImagem: React.FC<{ src: string }> = ({ src }) => (
  <Camada nome="cena">
  <AbsoluteFill>
    <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0) 60%)" }} />
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,0.5) 100%)" }} />
  </AbsoluteFill>
  </Camada>
);

// pessoa recortada do fundo verde, em webm VP9 com alfa; escala ancorada no pé do quadro
export const Pessoa: React.FC<{ src: string; escala: number; trimBeforeSeg?: number }> = ({ src, escala, trimBeforeSeg = 0 }) => (
  <Camada nome="pessoa">
  <OffthreadVideo
    src={staticFile(src)} transparent muted trimBefore={F(trimBeforeSeg)}
    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transformOrigin: "50% 100%", scale: escala }}
  />
  </Camada>
);

// título grande (Anton), costuma ir atrás da cabeça
export const Titulo: React.FC<{ texto: string; ini: number; tamanho: number; topo: number; cor?: string }> = ({ texto, ini, tamanho, topo, cor = AMARELO }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute", left: 0, right: 0, top: topo, textAlign: "center", fontFamily: anton, fontSize: tamanho, lineHeight: 1,
        color: cor, letterSpacing: 2, scale: mola(frame, ini), textShadow: "0 0 60px rgba(0,0,0,0.6)",
      }}
    >
      {texto}
    </div>
  );
};

// cartão de vidro (frente ou trás)
export const Cartao: React.FC<{ ini: number; style: React.CSSProperties; children: React.ReactNode }> = ({ ini, style, children }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", borderRadius: 22, background: VIDRO, border: BORDA, padding: "18px 24px", fontFamily: mont, color: "#fff", boxShadow: "0 18px 50px rgba(0,0,0,0.5)", scale: mola(frame, ini), ...style }}>
      {children}
    </div>
  );
};
export const rotulo: React.CSSProperties = { fontWeight: 600, fontSize: 24, letterSpacing: 3, color: "rgba(255,255,255,0.6)" };
export const valor: React.CSSProperties = { fontWeight: 800, fontSize: 44, lineHeight: 1.15 };

// legenda de 1 a 3 palavras no peito, última palavra em amarelo
export type Pagina = { ini: number; fim: number; palavras: string[] };
export const LegendaPeito: React.FC<{ paginas: Pagina[] }> = ({ paginas }) => {
  const frame = useCurrentFrame();
  const seg = frame / tema.fps;
  const pagina = paginas.find((p) => seg >= p.ini && seg < p.fim);
  if (!pagina) return null;
  return (
    <Camada nome="legenda">
    <div
      style={{
        position: "absolute", left: tema.zonaEsquerda, right: tema.zonaDireita, top: tema.topoLegendaPadrao, textAlign: "center",
        fontFamily: mont, fontWeight: 800, fontSize: 68, color: "#fff", textShadow: "0 4px 0 rgba(0,0,0,0.85), 0 0 26px rgba(0,0,0,0.9)",
        scale: interpolate(frame, [F(pagina.ini), F(pagina.ini) + 3], [0.92, 1], CLAMP),
      }}
    >
      {pagina.palavras.map((palavra, i) => (
        <span key={i} style={{ color: i === pagina.palavras.length - 1 ? AMARELO : "#fff" }}>{palavra}{" "}</span>
      ))}
    </div>
    </Camada>
  );
};

// efeitos sonoros: um por gráfico que entra (arquivos em public/sfx/)
// duracaoSeg corta o arquivo (som longo, tipo teclado de 19 s, tocava até o fim do vídeo)
export type Efeito = { seg: number; arquivo: string; volume: number; duracaoSeg?: number };
// no modo fiscal "sfx", cada efeito vira um quadrado branco de 2 quadros no canto, pra o fiscal saber quando ele toca
export const Efeitos: React.FC<{ lista: Efeito[] }> = ({ lista }) => {
  const fiscal = useContext(FiscalCtx);
  if (fiscal !== null && fiscal !== "sfx") return null;
  return (
    <>
      {lista.map((s, i) => (
        <Sequence key={i} from={F(s.seg)} layout="none" durationInFrames={fiscal === "sfx" ? 2 : s.duracaoSeg ? F(s.duracaoSeg) : undefined}>
          {fiscal === "sfx" ? <div style={{ position: "absolute", left: 0, top: 0, width: 60, height: 60, background: "#fff" }} /> : <Audio src={staticFile(s.arquivo)} volume={s.volume} />}
        </Sequence>
      ))}
    </>
  );
};
