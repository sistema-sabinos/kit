// Tema do motor: medidas do quadro vertical, cores padrão e zona segura. Todo vídeo lê daqui,
// então trocar uma cor ou uma medida aqui muda o motor inteiro.

export const tema = {
  largura: 1080,
  altura: 1920,
  fps: 30,

  // quanto da tela o clipe de cima ocupa (o resto é o painel de baixo)
  alturaClipe: 1180,

  // painel de baixo
  fundoPainel: "#111214",
  textoPainel: "#F4F4F2",
  textoApagado: "#8B8F96",

  // legenda central em duas cores: branco e destaque na palavra falada
  legendaBranco: "#FFFFFF",
  legendaDestaque: "#FFE600",
  legendaTamanho: 72,
  legendaSombra: "0 6px 0 #000, 0 0 24px rgba(0,0,0,0.9)",

  // vermelho de risco e alerta
  vermelho: "#ff3b30",

  // gancho: pergunta com "você" no milissegundo 0
  ganchoTamanho: 78,

  // Zona segura, nível "duro" do documento de zona segura.
  // Margem pequena demais já deixou legenda por baixo da interface das redes.
  // Confira o render com `scripts/zona-segura.py` antes de publicar.
  zonaTopo: 250, // nada legível acima disso
  zonaBase: 484, // reservado embaixo pra legenda, áudio e perfil das três redes
  zonaEsquerda: 60,
  zonaDireita: 140, // coluna de ações do TikTok, a mais alta das três
  margemLateral: 80,
  margemBase: 484,

  // Última linha útil pra texto: 1920 - 484 = 1436. Uma linha de legenda a 72 px ocupa ~77 px.
  // Medido em render: com `topoLegenda` 1290 a legenda de UMA linha termina em 1354 (folga 82 px),
  // mas a de DUAS linhas chega a 1438 e estoura por 2 px. Por isso o padrão é 1240, que deixa
  // 48 px de folga mesmo na legenda de duas linhas, que é o caso comum.
  baseUtil: 1920 - 484,
  topoLegendaPadrao: 1240,
} as const;
