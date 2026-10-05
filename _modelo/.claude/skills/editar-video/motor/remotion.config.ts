/**
 * Configuração do Remotion. Vale pro comando `remotion render` (CLI);
 * a API em Node ignora este arquivo e recebe as opções direto.
 * Todas as opções: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";
import { enableTailwind } from '@remotion/tailwind-v4';

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// exportação: H.264, CRF 18 fica na faixa de 8 a 12 Mbps em 1080x1920
Config.setCodec("h264");
Config.setCrf(18);
Config.setPixelFormat("yuv420p");
// o acabamento por shader e o 3D exigem o renderizador ANGLE (o render também passa --gl=angle)
Config.setChromiumOpenGlRenderer("angle");
Config.overrideBundlerConfig(enableTailwind);
