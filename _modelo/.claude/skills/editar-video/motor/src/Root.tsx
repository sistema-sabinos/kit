import "./index.css";
import { Composition } from "remotion";
import { VideoV2, schemaVideoV2 } from "./VideoV2";
import { tema } from "./tema";
import { lista } from "./videos";
import exemplo from "../exemplos/videov2-exemplo.json";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="VideoV2"
      component={VideoV2}
      schema={schemaVideoV2}
      defaultProps={schemaVideoV2.parse(exemplo)}
      fps={tema.fps}
      width={tema.largura}
      height={tema.altura}
      durationInFrames={1}
      calculateMetadata={({ props }) => {
        const p = schemaVideoV2.parse(props)
        return { durationInFrames: Math.ceil(p.duracaoSeg * tema.fps), props: p }
      }}
    />
    {lista.map(v => (
      <Composition key={v.id} id={v.id} component={v.Componente} fps={tema.fps} width={tema.largura} height={tema.altura} durationInFrames={Math.ceil(v.DURACAO_SEG * tema.fps)} />
    ))}
  </>
)
