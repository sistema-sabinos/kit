// Extras do padrão camadas: moldura 3D, barra de capítulos, chamada Seguir animada, clipe com J-cut (com legenda
// da fala do clipe) e cenário 3D que se reconstrói. Render com `--gl=angle` (o 3D não sai no renderizador padrão).
// Convenção: prop `ini` é em QUADROS (como no kit); prop que termina em `Seg` é em segundos.
import React, { useEffect, useMemo, useState } from "react";
import { AbsoluteFill, Easing, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useDelayRender, useVideoConfig } from "remotion";
import { Audio } from "@remotion/media";
import { ThreeCanvas } from "@remotion/three";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { AMARELO, BORDA, CLAMP, Camada, F, LegendaPeito, VIDRO, mola, mont, type Pagina } from "./kit";
import { tema } from "../tema";

// ---------- dados em public/ (rastreio, etc.)
export const useJson = <T,>(arquivo: string): T | null => {
  const [dado, setDado] = useState<T | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender(`carregando ${arquivo}`));
  useEffect(() => {
    fetch(staticFile(arquivo)).then((r) => r.json()).then((j) => { setDado(j); continueRender(handle); }).catch((e) => cancelRender(e));
  }, [arquivo, continueRender, cancelRender, handle]);
  return dado;
};

// ---------- 1) moldura 3D: o conteúdo entra numa tela inclinada que gira pra frente
export const Moldura3D: React.FC<{ ini: number; largura?: number; topo?: number; proporcao?: string; children: React.ReactNode }> = ({ ini, largura = 860, topo = 330, proporcao = "9 / 16", children }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [ini, ini + 14], [0, 1], { ...CLAMP, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const deriva = interpolate(frame, [ini + 14, ini + 240], [0, 5], CLAMP);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: topo, display: "flex", justifyContent: "center", perspective: 1600 }}>
      <div
        style={{
          width: largura, aspectRatio: proporcao, position: "relative", borderRadius: 30, overflow: "hidden", border: "2px solid rgba(255,255,255,0.35)",
          boxShadow: "0 40px 90px rgba(0,0,0,0.7), 0 0 0 10px rgba(255,255,255,0.04)", background: "#000",
          rotate: `y ${interpolate(t, [0, 1], [42, -7]) + deriva}deg`, scale: interpolate(t, [0, 0.7, 1], [0.6, 1.04, 1]),
          translate: `0px ${interpolate(t, [0, 1], [120, 0])}px`,
        }}
      >
        {children}
      </div>
    </div>
  );
};

// Clipe de terceiro aparece inteiro, nunca cortado (a cabeça de quem fala sumia com `cover` sobre um arquivo já
// recortado em vertical). Use o arquivo original na proporção da moldura; `contain` garante.
// ---------- 5) clipe com J-cut: o som do clipe começa em `audioDeSeg`, a imagem entra em `imagemDeSeg` (dentro da moldura)
// Todo clipe falado leva legenda: `legenda` são as páginas da fala do clipe, com o tempo contado
// do começo do áudio do clipe (transcrever o clipe no whisper local e gerar as páginas como as da fala).
export const ClipeJCut: React.FC<{
  src: string; audioDeSeg: number; imagemDeSeg: number; ateSeg: number; selo: string; legenda: Pagina[]; largura?: number; topo?: number; proporcao?: string;
}> = ({ src, audioDeSeg, imagemDeSeg, ateSeg, selo, legenda, largura = 760, topo = 300, proporcao = "9 / 16" }) => (
  <>
    <Sequence from={F(audioDeSeg)} durationInFrames={F(ateSeg - audioDeSeg)}>
      <Audio src={staticFile(src)} />
      <LegendaPeito paginas={legenda} />
    </Sequence>
    <Sequence from={F(imagemDeSeg)} durationInFrames={F(ateSeg - imagemDeSeg)}>
      <Camada nome="moldura">
      <Moldura3D ini={0} largura={largura} topo={topo} proporcao={proporcao}>
        <OffthreadVideo src={staticFile(src)} muted trimBefore={F(imagemDeSeg - audioDeSeg)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        <div style={{ position: "absolute", left: 20, top: 20, padding: "8px 14px", borderRadius: 12, background: "rgba(0,0,0,0.65)", fontFamily: mont, fontWeight: 800, fontSize: 26, color: "#fff" }}>
          {selo}
        </div>
      </Moldura3D>
      </Camada>
    </Sequence>
  </>
);

// ---------- 2) barra de capítulos no topo, com progresso do capítulo (o gráfico de trás desce 70 px pra dar lugar)
export type Capitulo = { deSeg: number; ateSeg: number; numero: string; nome: string };
export const BarraCapitulo: React.FC<{ capitulos: Capitulo[] }> = ({ capitulos }) => {
  const frame = useCurrentFrame();
  const seg = frame / tema.fps;
  const c = capitulos.find((k) => seg >= k.deSeg && seg < k.ateSeg);
  if (!c) return null;
  return (
    <Camada nome="interface">
    <div style={{ position: "absolute", left: 60, top: 252, scale: mola(frame, F(c.deSeg)), transformOrigin: "0% 50%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 22px", borderRadius: 16, background: VIDRO, border: BORDA, fontFamily: mont, fontWeight: 800, fontSize: 32, letterSpacing: 3, color: "#fff" }}>
        <span style={{ width: 16, height: 16, borderRadius: 8, background: "#FF3B3B", boxShadow: "0 0 14px #FF3B3B", opacity: Math.floor(frame / 12) % 2 ? 1 : 0.35 }} />
        <span style={{ color: AMARELO }}>{c.numero}</span>
        <span>· {c.nome}</span>
      </div>
      <div style={{ marginTop: 8, height: 6, width: 340, borderRadius: 3, background: "rgba(255,255,255,0.18)" }}>
        <div style={{ height: 6, borderRadius: 3, background: AMARELO, width: interpolate(frame, [F(c.deSeg), F(c.ateSeg)], [0, 340], CLAMP) }} />
      </div>
    </div>
    </Camada>
  );
};

// ---------- 4) chamada Seguir: cartão do perfil, toque no botão, vira "Seguindo"
export const ChamadaSeguir: React.FC<{ iniSeg: number; toqueSeg: number; foto: string; usuario: string; descricao: string; topo?: number }> = ({ iniSeg, toqueSeg, foto, usuario, descricao, topo = 1000 }) => {
  const frame = useCurrentFrame();
  const toque = F(toqueSeg);
  const seguiu = frame >= toque;
  const dedo = interpolate(frame, [toque - 12, toque - 2], [80, 0], CLAMP);
  return (
    <Camada nome="interface">
    <div style={{ position: "absolute", left: 90, right: 150, top: topo, scale: mola(frame, F(iniSeg)) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 22, padding: 24, borderRadius: 30, background: "rgba(255,255,255,0.96)", boxShadow: "0 24px 60px rgba(0,0,0,0.55)", fontFamily: mont }}>
        <Img src={staticFile(foto)} style={{ width: 104, height: 104, borderRadius: 52, objectFit: "cover" }} />
        <div style={{ flex: 1, color: "#111" }}>
          <div style={{ fontWeight: 800, fontSize: 34 }}>{usuario}</div>
          <div style={{ fontWeight: 600, fontSize: 22, color: "#666" }}>{descricao}</div>
        </div>
        <div
          style={{
            padding: "16px 28px", borderRadius: 16, fontWeight: 800, fontSize: 30, background: seguiu ? "#EFEFEF" : "#0095F6", color: seguiu ? "#111" : "#fff",
            scale: interpolate(frame, [toque, toque + 3, toque + 8], [0.9, 1.08, 1], CLAMP),
          }}
        >
          {seguiu ? "Seguindo" : "Seguir"}
        </div>
      </div>
      {/* seta de mouse que vem até o botão e clica */}
      <svg
        width={64} height={84} viewBox="0 0 16 21"
        style={{
          position: "absolute", right: 46, top: 74, translate: `${dedo}px ${dedo}px`, overflow: "visible",
          scale: interpolate(frame, [toque - 2, toque, toque + 4], [1, 0.82, 1], CLAMP), transformOrigin: "0% 0%",
          opacity: interpolate(frame, [toque - 14, toque - 10], [0, 1], CLAMP), filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.5))",
        }}
      >
        <path d="M1 1 L1 16 L5 12.5 L8 19.5 L10.6 18.4 L7.7 11.6 L13 11.6 Z" fill="#111" stroke="#fff" strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
    </div>
    </Camada>
  );
};

// ---------- 6) cenário 3D: foto do estúdio em malha com relevo tirado do mapa de profundidade
// (scripts/profundidade.py); giro pequeno de câmera e, em cada `reconstroiEmSeg`, o estúdio vira linhas e se monta de novo.
// O relevo é aplicado na CPU (vértice a vértice) com material sem luz: sai com a cor exata da foto.
const SEG_X = 144, SEG_Y = 256;
// Durante o render o ThreeCanvas só redesenha quando o quadro muda. Textura que chega depois precisa de um
// `advance()` depois de entrar na cena, e só então o `continueRender` (doc do @remotion/three), senão o quadro sai sem ela.
const Malha: React.FC<{ src: string; prof: string; reconstroiEmSeg: number[] }> = ({ src, prof, reconstroiEmSeg }) => {
  const frame = useCurrentFrame();
  const { advance } = useThree();
  const [cor, setCor] = useState<THREE.Texture | null>(null);
  const [alt, setAlt] = useState<Float32Array | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender(`cenário 3D ${src}`));
  useEffect(() => {
    new THREE.TextureLoader().load(staticFile(src), (tx) => { tx.colorSpace = THREE.SRGBColorSpace; setCor(tx); }, undefined, (e) => cancelRender(e));
    const im = new Image();
    im.onload = () => {
      const c = document.createElement("canvas");
      c.width = SEG_X + 1; c.height = SEG_Y + 1;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(im, 0, 0, c.width, c.height);
      const px = ctx.getImageData(0, 0, c.width, c.height).data;
      const a = new Float32Array(c.width * c.height);
      for (let i = 0; i < a.length; i++) a[i] = px[i * 4] / 255;
      setAlt(a);
    };
    im.onerror = (e) => cancelRender(e);
    im.src = staticFile(prof);
  }, [src, prof, cancelRender]);
  useEffect(() => {
    if (cor && alt) { advance(performance.now()); continueRender(handle); }
  }, [cor, alt, advance, continueRender, handle]);
  const geo = useMemo(() => new THREE.PlaneGeometry(9 * 1.14, 16 * 1.14, SEG_X, SEG_Y), []);
  let fase = 0, relevo = 1.1;
  for (const s of reconstroiEmSeg) {
    const a = F(s);
    fase = Math.max(fase, interpolate(frame, [a, a + 8, a + 16, a + 34], [0, 1, 1, 0], CLAMP));
    relevo += interpolate(frame, [a, a + 10, a + 34], [0, 1.8, 0], { ...CLAMP, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  }
  // malha das linhas mais aberta que a da foto (48 x 86), pra ler como linha e não como trama
  const linhas = useMemo(() => new THREE.PlaneGeometry(9 * 1.14, 16 * 1.14, 48, 86), []);
  if (!cor) return null;
  if (alt) {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, alt[i] * relevo);
    pos.needsUpdate = true;
    if (fase > 0.01) {
      const pl = linhas.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pl.count; i++) {
        const ix = Math.round(((i % 49) * SEG_X) / 48), iy = Math.round((Math.floor(i / 49) * SEG_Y) / 86);
        pl.setZ(i, alt[iy * (SEG_X + 1) + ix] * relevo + 0.02);
      }
      pl.needsUpdate = true;
    }
  }
  return (
    <>
      <mesh geometry={geo}>
        <meshBasicMaterial map={cor} transparent opacity={1 - fase} />
      </mesh>
      {fase > 0.01 && (
        <mesh geometry={linhas}>
          <meshBasicMaterial color={AMARELO} wireframe transparent opacity={fase * 0.8} />
        </mesh>
      )}
    </>
  );
};
// câmera em órbita curta em volta do centro do cenário, sempre olhando pra ele
const CameraGiro: React.FC<{ ang: number; dist: number }> = ({ ang, dist }) => {
  const { camera } = useThree();
  camera.position.set(Math.sin(ang) * dist, 0, Math.cos(ang) * dist);
  camera.lookAt(0, 0, 0);
  return null;
};
export const Cenario3D: React.FC<{ src: string; prof: string; reconstroiEmSeg?: number[]; giroGraus?: number }> = ({ src, prof, reconstroiEmSeg = [], giroGraus = 2.5 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  let extra = 0;
  for (const s of reconstroiEmSeg) extra += interpolate(frame, [F(s), F(s) + 12, F(s) + 34], [0, 6, 0], { ...CLAMP, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const ang = ((Math.sin(frame / 90) * giroGraus + extra) * Math.PI) / 180;
  const dist = 8 / Math.tan((30 / 2) * (Math.PI / 180));
  return (
    <Camada nome="cena">
    <AbsoluteFill style={{ backgroundColor: "#06070D" }}>
      <ThreeCanvas width={width} height={height} camera={{ position: [0, 0, dist], fov: 30 }} flat>
        <CameraGiro ang={ang} dist={dist} />
        <Malha src={src} prof={prof} reconstroiEmSeg={reconstroiEmSeg} />
      </ThreeCanvas>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0) 60%)" }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,0.5) 100%)" }} />
    </AbsoluteFill>
    </Camada>
  );
};
