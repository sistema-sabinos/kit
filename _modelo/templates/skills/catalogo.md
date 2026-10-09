# Catalogo de Skills

Skills externas prontas pra instalar. Use como referencia ao criar skills com o `/mapear`, que le, adapta e so instala com o seu sim.

> Skills globais ficam em `~/.claude/skills/` e funcionam em qualquer projeto.
> Skills locais ficam em `.claude/skills/` e so funcionam nesse projeto.

---

## Criar interfaces e paginas web

### Frontend Design
**O que faz:** Cria interfaces web completas com design de alta qualidade. Gera codigo HTML/CSS/React pronto pra usar, com visual profissional que foge da estetica generica de IA.
**Bom pra:** Landing pages, dashboards, componentes web, paginas de produto
**Como instalar:** Oficial da Anthropic. Digite / no chat e procure o nome; se nao aparecer, instale pelo /plugin (marketplace oficial). Chamar com `/frontend-design`
**Fonte:** Skill nativa do Claude Code

---

## Criar visuais e arte

### Canvas Design
**O que faz:** Cria arte visual em PNG e PDF usando principios de design. Posters, capas, pecas graficas.
**Bom pra:** Capas de ebook, banners, pecas visuais, thumbnails
**Como instalar:** Oficial da Anthropic. Digite / no chat e procure o nome; se nao aparecer, instale pelo /plugin (marketplace oficial). Chamar com `/canvas-design`
**Fonte:** Skill nativa do Claude Code

---

## Trabalhar com documentos

### PDF
**O que faz:** Manipula PDFs: extrai texto e tabelas, cria novos, junta/separa documentos, preenche formularios.
**Bom pra:** Extrair dados de contratos, criar relatorios em PDF, preencher formularios
**Como instalar:** Oficial da Anthropic. Digite / no chat e procure o nome; se nao aparecer, instale pelo /plugin (marketplace oficial). Chamar com `/pdf`
**Fonte:** Skill nativa do Claude Code

### DOCX
**O que faz:** Cria e edita documentos Word com formatacao, tracked changes e comentarios.
**Bom pra:** Propostas formais, contratos, documentos pra clientes que pedem Word
**Como instalar:** Oficial da Anthropic. Digite / no chat e procure o nome; se nao aparecer, instale pelo /plugin (marketplace oficial). Chamar com `/docx`
**Fonte:** Skill nativa do Claude Code

### PPTX
**O que faz:** Cria e edita apresentacoes PowerPoint com layouts, speaker notes e formatacao.
**Bom pra:** Apresentacoes pra clientes, decks de vendas, materiais de treinamento
**Como instalar:** Oficial da Anthropic. Digite / no chat e procure o nome; se nao aparecer, instale pelo /plugin (marketplace oficial). Chamar com `/pptx`
**Fonte:** Skill nativa do Claude Code

### XLSX
**O que faz:** Cria e edita planilhas com formulas, formatacao e graficos.
**Bom pra:** Relatorios financeiros, dashboards em planilha, analise de dados
**Como instalar:** Oficial da Anthropic. Digite / no chat e procure o nome; se nao aparecer, instale pelo /plugin (marketplace oficial). Chamar com `/xlsx`
**Fonte:** Skill nativa do Claude Code

---

## Escrever documentos e specs

### Doc Co-Authoring
**O que faz:** Fluxo guiado pra coescrever documentos. Te entrevista, itera rascunhos, e valida que o documento funciona pro leitor.
**Bom pra:** Propostas tecnicas, specs, documentos de decisao, SOPs
**Como instalar:** Oficial da Anthropic. Digite / no chat e procure o nome; se nao aparecer, instale pelo /plugin (marketplace oficial). Chamar com `/doc-coauthoring`
**Fonte:** Skill nativa do Claude Code

---

## Extrair transcricao de video

### Transcribe (ja vem no SabinOS)
**O que faz:** Transcreve videos de qualquer plataforma (YouTube, Instagram, TikTok, X/Twitter, Vimeo e 1000+ sites) usando yt-dlp + Whisper local, sem chave de API.
**Bom pra:** Transcrever Reels, TikToks, posts de X/Twitter com video, qualquer URL de video, quando so o audio importa
**Precisa de:** Python 3, yt-dlp, faster-whisper e ffmpeg (o `/transcribe install` confere e guia)
**Como instalar:** Ja vem em todo projeto do SabinOS (copia do molde). Pra ver o que aparece na tela, e nao so ouvir, a irma dela e a `/assistir-video`
**Fonte:** Skill do SabinOS

---

## Trafego pago e analytics

> A rota do SabinOS pra anuncios e em duas camadas: a skill `/trafego` (regua do negocio, ponto de empate e auditoria com metodo, gate humano em tudo que gasta), condicional, instalada no projeto pelo `/setup` quando o negocio anuncia, por cima, e um plugin ou conector oficial por baixo, fazendo a leitura e a alteracao nas contas. Nome e comando de plugin mudam: VERIFICAR AO VIVO no `/plugin` antes de instalar.

### Plugin de anuncios do marketplace oficial
**O que faz:** Auditoria e criacao de campanha em Meta, Google, YouTube, TikTok e outras plataformas, com agentes especialistas (rastreamento, criativo, orcamento, compliance).
**Bom pra:** Raio-x de conta de anuncio, achar verba desperdicada, montar briefing e copy de campanha
**Como instalar:** `/plugin`, procurar na categoria de ads/marketing e instalar pelo marketplace oficial da Anthropic
**Fonte:** Marketplace oficial do Claude Code

### Conector MCP de Google Ads e Meta Ads (ex: NotFair)
**O que faz:** Liga o Claude direto nas contas de anuncio: le campanhas, roda consultas (GAQL no Google), pesquisa palavra-chave, cria e pausa campanha, audita.
**Bom pra:** Quem toca anuncio toda semana e quer o Claude operando a conta com aprovacao a cada mudanca
**Precisa de:** Conta de anuncio ativa e autorizacao OAuth da plataforma (o `/conectar` guia)
**Como instalar:** Pelo `/plugin` (se estiver no marketplace) ou pela documentacao do conector; conferir ao vivo
**Fonte:** Terceiro, conector MCP

### Google Analytics 4
**O que faz:** Le trafego do site: sessoes, fontes, landing pages, conversoes, tempo real.
**Bom pra:** Relatorio semanal de trafego, analise de campanha por UTM
**Como instalar:** Conector oficial via claude.ai (Configuracoes > Conectores) quando disponivel pra conta; senao, service account + Data API numa skill propria criada pelo `/mapear` (o catalogo de ferramentas explica)
**Fonte:** Google, via conector ou API oficial

---

## Descobrir e fazer fetch de docs

### Find Skills
**O que faz:** Ajuda a descobrir e instalar skills quando voce nao sabe se existe alguma pra resolver o que precisa. Funciona como um buscador de skills.
**Bom pra:** Quando o `/mapear` nao acha template e voce quer pesquisar antes de criar do zero
**Como instalar:** ja vem em todo projeto do SabinOS. So busca e le; o `/mapear` decide o que entra. Chamar com `/find-skills`
**Fonte:** skill do SabinOS

### Context7 MCP
**O que faz:** Busca documentacao atualizada de bibliotecas, frameworks e APIs (React, Next.js, Prisma, Tailwind, etc). Evita que o Claude use info desatualizada do treinamento.
**Bom pra:** Qualquer skill que envolva codigo com biblioteca/framework. Setup, debug, geracao de codigo
**Como instalar:** `claude mcp add context7 -- npx -y @upstash/context7-mcp`. Depois roda automatico
**Fonte:** Skill que embrulha o MCP context7

---

## Testar sites e apps

### Webapp Testing
**O que faz:** Testa aplicacoes web locais usando Playwright. Captura screenshots, verifica funcionalidade, le logs do browser.
**Bom pra:** Testar landing pages antes de publicar, verificar se tudo funciona em diferentes tamanhos
**Como instalar:** Oficial da Anthropic. Digite / no chat e procure o nome; se nao aparecer, instale pelo /plugin (marketplace oficial). Chamar com `/webapp-testing`
**Fonte:** Skill nativa do Claude Code

---

## Criar skills novas

### Skill Creator
**O que faz:** Guia pra criar skills novas do zero. Ajuda a estruturar, definir triggers, e testar.
**Bom pra:** Quando o `/mapear` nao cobre o que voce precisa e quer criar algo mais complexo
**Como instalar:** Oficial da Anthropic. Digite / no chat e procure o nome; se nao aparecer, instale pelo /plugin (marketplace oficial). Chamar com `/skill-creator`
**Fonte:** Skill nativa do Claude Code

---

## Como adicionar skills novas a este catalogo

Se voce testou uma skill e quer adicionar aqui pra referencia futura:

```markdown
### Nome da Skill
**O que faz:** [descricao em uma frase]
**Bom pra:** [casos de uso praticos]
**Como instalar:** [comando ou instrucao]
**Fonte:** [de onde veio: skill nativa, criada por voce, ou de terceiros]
```
