// Legenda central em duas cores: entrada em pop por página, palavra falada em cor de destaque.
// Lê o arquivo alinhado (palavra por palavra) e junta 2 a 3 palavras por página.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useDelayRender,
  useVideoConfig,
} from "remotion";
import { createTikTokStyleCaptions } from "@remotion/captions";
import type { Caption, TikTokPage } from "@remotion/captions";
import { tema } from "./tema";

// quantas palavras por página: ~900 ms junta 2 a 3 palavras
const TROCA_A_CADA_MS = 900;

const Pagina: React.FC<{ page: TikTokPage; fontFamily: string; topo: number }> = ({
  page,
  fontFamily,
  topo,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const agoraMs = page.startMs + (frame / fps) * 1000;

  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center" }}>
      <div
        style={{
          position: "absolute",
          top: topo,
          left: tema.margemLateral,
          right: tema.margemLateral,
          textAlign: "center",
          fontFamily,
          fontWeight: 800,
          fontSize: tema.legendaTamanho,
          lineHeight: 1.1,
          whiteSpace: "pre-wrap",
          textShadow: tema.legendaSombra,
          letterSpacing: -1,
          // pop-in: 90% -> 100% nos primeiros 4 frames da página
          scale: String(
            interpolate(frame, [0, 4], [0.9, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          ),
        }}
      >
        {page.tokens.map((token, i) => {
          const ativa = token.fromMs <= agoraMs && token.toMs > agoraMs;
          return (
            <span
              key={`${token.fromMs}-${i}`}
              style={{ color: ativa ? tema.legendaDestaque : tema.legendaBranco }}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const Legendas: React.FC<{
  arquivo: string; // nome em public/, ex. "clipe.legendas.json"
  fontFamily: string;
  topo: number; // y onde a legenda fica (linha divisória do split-screen)
}> = ({ arquivo, fontFamily, topo }) => {
  const { fps } = useVideoConfig();
  const [captions, setCaptions] = useState<Caption[] | null>(null);
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() => delayRender());

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(staticFile(arquivo));
      setCaptions((await r.json()) as Caption[]);
      continueRender(handle);
    } catch (e) {
      cancelRender(e);
    }
  }, [arquivo, continueRender, cancelRender, handle]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const { pages } = useMemo(() => {
    if (!captions) return { pages: [] as TikTokPage[] };
    return createTikTokStyleCaptions({
      captions,
      combineTokensWithinMilliseconds: TROCA_A_CADA_MS,
    });
  }, [captions]);

  if (!captions) return null;

  return (
    <AbsoluteFill>
      {pages.map((page, i) => {
        const prox = pages[i + 1] ?? null;
        const inicio = (page.startMs / 1000) * fps;
        const fim = Math.min(
          prox ? (prox.startMs / 1000) * fps : Infinity,
          inicio + (TROCA_A_CADA_MS / 1000) * fps + fps * 0.3,
        );
        const dur = fim - inicio;
        if (dur <= 0) return null;
        return (
          <Sequence key={i} from={inicio} durationInFrames={dur}>
            <Pagina page={page} fontFamily={fontFamily} topo={topo} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
