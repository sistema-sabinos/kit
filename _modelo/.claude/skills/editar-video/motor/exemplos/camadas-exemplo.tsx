// MOLDE do vídeo em camadas. A /editar-video copia este arquivo pra `producao/<slug>/composicao.tsx` e troca o que
// está marcado com TROQUE. Exemplo: "como escolher fornecedor", 9 s, com a pessoa recortada do fundo verde.
//
// Ordem das camadas, de baixo pra cima: cenário, gráfico de trás, pessoa (webm com alfa), gráfico da frente,
// chamada Seguir, barra de capítulos, legenda, voz e efeitos sonoros. Todo elemento visível fica dentro de uma
// <Camada>, senão o fiscal (scripts/fiscal.py) não enxerga.
//
// Os imports são relativos a `src/videos/`, que é onde este arquivo roda. Por isso o tsc só confere este arquivo
// depois da cópia: dentro de `exemplos/` os caminhos não resolvem, e está certo.
//
// Na peça real, o render.mjs copia `producao/<slug>/composicao.tsx` pra `src/videos/<slug>.tsx` e, se existir,
// `producao/<slug>/dados.json` pra `src/videos/<slug>.dados.json`. Por isso, na peça, o import dos dados vira
// `./<slug>.dados.json` (no lugar do `../../exemplos/camadas-exemplo-dados.json` daqui) e os imports do kit
// continuam `../camadas/kit` e `../camadas/extras`, que de `src/videos/` apontam pra `src/camadas/`.
//
// Mídia (em public/, montada pelo preparar-public.mjs): pessoa.webm, voz.wav, cenario.png,
// perfil.jpg e os efeitos de biblioteca/sfx/. Clipe de terceiro com J-cut (ClipeJCut, em camadas/extras.tsx) entra
// do mesmo jeito: um <ClipeJCut> por clipe, com `proporcao` igual à do arquivo original.
import React from "react";
import { AbsoluteFill, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Audio } from "@remotion/media";
import {
  AMARELO, BORDA, CLAMP, Camada, Cartao, CenarioImagem, Efeitos, F, LegendaPeito, Pessoa, RaizFiscal, Titulo, VERMELHO, VIDRO,
  anton, escalaEmDegrau, mola, mont, rotulo, valor, visivel, type Efeito,
} from "../camadas/kit";
import { BarraCapitulo, ChamadaSeguir } from "../camadas/extras";
import { criarQuando } from "../quando";
// TROQUE: os dados da peça (duração, palavras alinhadas, páginas da legenda). Saem do alinhado.json pelo
// scripts/paginas-camadas.py; o formato está em exemplos/camadas-exemplo-dados.json.
import dados from "../../exemplos/camadas-exemplo-dados.json";

// O render lê a duração daqui pra registrar a composição.
export const DURACAO_SEG: number = dados.duracaoSeg;

const q = criarQuando(dados.palavras);

// TROQUE: momentos (segundos no vídeo final) medidos na fala alinhada. q("frase") é onde a frase começa,
// q.fim("frase") onde termina. Frase que não existe na fala derruba o render, de propósito.
const T = {
  vai: q("vai escolher"), olha: q("olha"), primeiro: q("primeiro"), prazo: q("prazo"),
  segundo: q("segundo"), preco: q("preço"), terceiro: q("terceiro"), quem: q("quem já comprou"),
  segue: q("me segue"),
};

// TROQUE: zoom da pessoa em degrau, [segundo, escala]. Em 1,0 sempre que houver título atrás da cabeça.
const DEGRAUS: [number, number][] = [
  [0, 1.0], [T.olha, 1.08], [T.primeiro, 1.0], [T.segundo, 1.08], [T.terceiro, 1.0], [T.segue, 1.06],
];

// TROQUE: um efeito sonoro por gráfico que entra, no segundo em que ele aparece. O arquivo é citado como
// "biblioteca/sfx/<nome>.wav"; o preparar-public.mjs copia pro public só o que está citado aqui.
const SFX: Efeito[] = [
  { seg: 0, arquivo: "biblioteca/sfx/pop.wav", volume: 0.6 },
  { seg: T.olha, arquivo: "biblioteca/sfx/pop.wav", volume: 0.6 },
  { seg: T.primeiro, arquivo: "biblioteca/sfx/pop.wav", volume: 0.6 },
  { seg: T.prazo, arquivo: "biblioteca/sfx/pop.wav", volume: 0.6 },
  { seg: T.segundo, arquivo: "biblioteca/sfx/pop.wav", volume: 0.6 },
  { seg: T.preco, arquivo: "biblioteca/sfx/pop.wav", volume: 0.6 },
  { seg: T.terceiro, arquivo: "biblioteca/sfx/pop.wav", volume: 0.6 },
  { seg: T.segue, arquivo: "biblioteca/sfx/pop.wav", volume: 0.6 },
];

// título que fica do lado da cabeça (palavra curta no meio sumiria atrás dela)
const TituloLado: React.FC<{ texto: string; ini: number; tamanho: number; topo: number; esquerda: number; cor?: string }> = ({ texto, ini, tamanho, topo, esquerda, cor = AMARELO }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", left: esquerda, top: topo, fontFamily: anton, fontSize: tamanho, lineHeight: 1, color: cor, scale: mola(frame, ini), textShadow: "0 0 60px rgba(0,0,0,0.6)" }}>
      {texto}
    </div>
  );
};

// TROQUE: gráficos de trás (atrás da cabeça), um por frase. `v(a, b)` liga o gráfico entre os segundos a e b;
// a saída é corte seco. Título de trás cabe entre a barra de capítulos (até y 330) e a cabeça (y ~540).
const Atras: React.FC = () => {
  const frame = useCurrentFrame();
  const v = (a: number, b: number) => visivel(frame, F(a), F(b));
  return (
    <AbsoluteFill>
      {v(T.vai, T.olha) && <Titulo texto="FORNECEDOR" ini={F(T.vai)} tamanho={140} topo={380} />}
      {v(T.olha, T.primeiro) && (
        <>
          <Titulo texto="3 CRITÉRIOS" ini={F(T.olha)} tamanho={130} topo={380} cor="#fff" />
          <div
            style={{
              position: "absolute", left: 160, top: 441, height: 14, borderRadius: 7, background: VERMELHO, boxShadow: "0 0 30px rgba(255,77,77,0.8)",
              width: interpolate(frame, [F(T.olha) + 6, F(T.olha) + 14], [0, 760], CLAMP),
            }}
          />
        </>
      )}
      {v(T.terceiro, T.segue) && (
        <>
          <TituloLado texto="?" ini={F(T.terceiro)} tamanho={330} topo={390} esquerda={95} />
          <TituloLado texto="?" ini={F(T.terceiro)} tamanho={330} topo={390} esquerda={850} />
        </>
      )}
    </AbsoluteFill>
  );
};

// TROQUE: gráficos da frente (na frente da pessoa, abaixo do rosto, fora da zona do peito onde fica a legenda).
// Cartao é o cartão de vidro; `rotulo` e `valor` são os dois estilos de texto dele.
const Frente: React.FC = () => {
  const frame = useCurrentFrame();
  const v = (a: number, b: number) => visivel(frame, F(a), F(b));
  return (
    <AbsoluteFill>
      {v(T.prazo, T.segundo) && (
        <Cartao ini={F(T.prazo)} style={{ left: 60, top: 1040, width: 470 }}>
          <div style={rotulo}>PRAZO</div>
          <div style={valor}>entrega em até <span style={{ color: AMARELO }}>7 dias</span></div>
        </Cartao>
      )}
      {v(T.preco, T.terceiro) && (
        <Cartao ini={F(T.preco)} style={{ left: 60, top: 1040, width: 470 }}>
          <div style={rotulo}>PREÇO</div>
          <div style={valor}>compare <span style={{ color: AMARELO }}>3 orçamentos</span></div>
        </Cartao>
      )}
      {v(T.quem, T.segue) && (
        <div style={{ position: "absolute", left: 60, top: 1040, padding: "18px 24px", borderRadius: 22, background: VIDRO, border: BORDA, fontFamily: mont, color: "#fff", scale: mola(frame, F(T.quem)) }}>
          <div style={rotulo}>PROVA</div>
          <div style={valor}>veja as <span style={{ color: AMARELO }}>avaliações</span></div>
        </div>
      )}
    </AbsoluteFill>
  );
};

// O componente que o Root registra como `Camadas-<slug>`. `fiscal` só é usado pelo scripts/fiscal.py.
export const Componente: React.FC<{ fiscal?: string }> = ({ fiscal }) => {
  const frame = useCurrentFrame();
  return (
    <RaizFiscal fiscal={fiscal}>
      {/* TROQUE: cenario.png (foto do cenário, parada atrás da pessoa). O cenário em relevo 3D fica fora nesta versão
          do kit (falta o modelo de profundidade); quando vier, ele entra no lugar desta linha assim, com Cenario3D no
          import de ../camadas/extras:
          <Cenario3D src="cenario.png" prof="cenario-prof.png" reconstroiEmSeg={[T.olha]} /> */}
      <CenarioImagem src="cenario.png" />
      <Camada nome="atras"><Atras /></Camada>
      {/* a pessoa desce 120 px pra caber o título de trás entre a barra de capítulos e a cabeça; tire o translate se o
          enquadramento do bruto não pedir */}
      <AbsoluteFill style={{ translate: "0px 120px" }}>
        <Pessoa src="pessoa.webm" escala={escalaEmDegrau(frame, DEGRAUS)} />
      </AbsoluteFill>
      <Camada nome="frente"><Frente /></Camada>
      {/* TROQUE: foto, usuário e descrição do perfil da chamada Seguir; o toque no botão cai no "me segue" */}
      <ChamadaSeguir iniSeg={T.segue} toqueSeg={T.segue + 0.5} foto="perfil.jpg" usuario="sualoja" descricao="Sua Loja | O que voce vende" />
      {/* TROQUE: capítulos, um por bloco do roteiro */}
      <BarraCapitulo
        capitulos={[
          { deSeg: T.primeiro, ateSeg: T.segundo, numero: "01", nome: "O PRAZO" },
          { deSeg: T.segundo, ateSeg: T.terceiro, numero: "02", nome: "O PREÇO" },
          { deSeg: T.terceiro, ateSeg: T.segue, numero: "03", nome: "A PROVA" },
        ]}
      />
      <LegendaPeito paginas={dados.paginas} />
      <Audio src={staticFile("voz.wav")} />
      <Efeitos lista={SFX} />
    </RaizFiscal>
  );
};
