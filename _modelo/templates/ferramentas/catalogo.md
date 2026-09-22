# Catalogo de Ferramentas

Referencia de APIs, CLIs e conectores que podem ser usados dentro de skills do Claude Code.
Consulte este arquivo antes de criar skills novas pra saber o que ja esta disponivel.

---

## Criar visuais (HTML pra PNG)

### Playwright CLI
**O que faz:** Renderiza qualquer HTML em imagem PNG (carrosseis, slides, propostas, cards)
**Precisa de conta:** Nao, roda local
**Como instalar:**
```bash
npx playwright install chromium
```
**Como usar numa skill:**
```bash
npx playwright screenshot --viewport-size=1080,1350 --full-page "file:///caminho/slide.html" "slide.png"
```
**Tamanhos comuns:**
- Instagram feed: 1080x1350
- Instagram/TikTok story: 1080x1920
- Slide 16:9: 1920x1080
- Card quadrado: 1080x1080

### Remotion
**O que faz:** Gera videos programaticamente a partir de componentes React (animacoes, criativos de ads, intros)
**Precisa de conta:** Nao, roda local
**Como instalar:** `npx create-video@latest`
**Quando usar:** Skills que geram criativos animados, abertura de videos, anuncios em video, motion graphics simples
**Atencao:** mais complexo que Playwright. So usar quando precisar de animacao/video, nao pra imagem estatica

---

## Publicar na web

### Cloudflare Pages API
**O que faz:** Publica arquivos HTML estaticos com link publico (propostas, landing pages, estudos, mini-LPs)
**Precisa de conta:** Sim, Cloudflare (gratis)
**Configurar:** Salvar `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` no `.env`. Comando: `npx wrangler pages deploy .`
**Quando usar:** Sempre que a skill gerar um HTML que precisa ser compartilhado por link

### Cloudflare Workers (Wrangler)
**O que faz:** Codigo serverless rodando na borda da Cloudflare (APIs, webhooks, automacoes, redirects, cron jobs)
**Precisa de conta:** Sim, Cloudflare (gratis ate 100k requests/dia)
**Configurar:** Salvar `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` no `.env`. Comando: `npx wrangler deploy`
**Quando usar:** Skills que precisam de backend leve sem servidor: webhook de pagamento, redirect com UTMs, cron diario, automacao que precisa de URL publica
**Diferenca pro Pages:** Pages e pra HTML estatico. Workers e pra codigo dinamico

### Vercel CLI
**O que faz:** Publica apps Next.js, Vite, React em segundos com CDN global
**Precisa de conta:** Sim, Vercel (gratis pra projetos pessoais)
**Configurar:** `npm i -g vercel` e depois `vercel login`
**Como usar numa skill:** `vercel --yes --prod` dentro da pasta do projeto
**Quando usar:** Skills que constroem ou fazem deploy de apps Next.js, dashboards, plataformas

---

## Publicar em redes sociais

### Post for Me API
**O que faz:** Publica posts no Instagram e TikTok direto do Claude Code
**Precisa de conta:** Sim, postforme.dev
**Configurar:** Salvar `POSTFORME_API_KEY` no `.env`
**Como usar numa skill:**
```bash
node --env-file=.env scripts/publish-postforme.js
```
**Quando usar:** Skills de carrossel, conteudo visual, publicacao automatica

### WhatsApp Cloud API / provedores
**O que faz:** Envia e recebe mensagens de WhatsApp programaticamente (atendimento, notificacao, automacao)
**Precisa de conta:** Sim. Dois caminhos:
- **WhatsApp Cloud API (oficial Meta):** conta Meta Business verificada + numero dedicado. Desde jul/2025 cobra POR MENSAGEM DE TEMPLATE entregue, por categoria (marketing custa mais; utilidade e autenticacao custam centavos; resposta a cliente que iniciou a conversa e gratis na janela de 24h, com cota mensal gratuita de conversas de servico)
- **Provedor intermediario (BSP/API de terceiro):** mais simples de plugar, cobra mensalidade propria (no Brasil, de ~R$ 100 a R$ 500+/mes) alem do custo Meta
**Configurar:** Tokens no `.env` (varia por provedor)
**Atencao:** e a integracao de maior friccao deste catalogo (verificacao de negocio, numero, provedor: leva dias). Enquanto nao sai, a triagem manual assistida (colar conversas pro Claude classificar e rascunhar) resolve boa parte
**Quando usar:** Skills de atendimento automatico, envio de notificacao, follow-up de venda

---

## Buscar conteudo da web

### WebFetch (nativo)
**O que faz:** Le o conteudo de qualquer URL e traz como texto
**Precisa de conta:** Nao, ja vem no Claude Code
**Quando usar:** Pesquisa de referencias, ler artigos, buscar dados de sites

### WebSearch (nativo)
**O que faz:** Pesquisa no Google e traz resultados
**Precisa de conta:** Nao, ja vem no Claude Code
**Quando usar:** Quando o usuario precisa pesquisar antes de criar conteudo

### Jina Reader
**O que faz:** Converte qualquer URL em markdown limpo (melhor que WebFetch pra artigos longos)
**Precisa de conta:** Nao
**Como usar:** Acessar `https://r.jina.ai/{URL}` via WebFetch
**Quando usar:** Extrair texto de artigos, blog posts, paginas com muito HTML

### DataForSEO
**O que faz:** Da acesso a dados de SEO/SEM em escala: volume de busca, SERP do Google e YouTube, palavras-chave, dificuldade
**Precisa de conta:** Sim, dataforseo.com (pago, mas barato por consulta)
**Configurar:** Salvar `DATAFORSEO_LOGIN` e `DATAFORSEO_PASSWORD` no `.env`
**Quando usar:** Skills de pesquisa de pauta, triagem de tema pra video, analise de oportunidade SEO, validacao de nicho

---

## Extrair conteudo de video

### yt-dlp (CLI)
**O que faz:** Baixa transcricoes/legendas de videos do YouTube e mais de 1000 sites (Instagram, TikTok, X, Vimeo, etc)
**Precisa de conta:** Nao, roda local
**Como instalar:**
```bash
brew install yt-dlp        # Mac
winget install yt-dlp      # Windows
```
**Quando usar:** Skills que partem de um video pra criar conteudo (carrossel, newsletter, roteiro)

---

## Transcrever audio

### OpenAI Whisper API
**O que faz:** Transcreve audio em texto com alta qualidade, suporta varios idiomas
**Precisa de conta:** Sim, OpenAI (pago, ~$0.006/min)
**Configurar:** Salvar `OPENAI_API_KEY` no `.env`
**Quando usar:** Transcrever audio de reuniao, podcast, audio de WhatsApp, qualquer arquivo de audio que nao seja video do YouTube
**Dica:** Tem versao open-source (whisper.cpp) pra rodar local sem custo, mais lenta

### AssemblyAI
**O que faz:** Transcricao de audio com features extras: identificacao de quem falou (diarization), timestamps por palavra, sentimento, resumo automatico
**Precisa de conta:** Sim, assemblyai.com (free tier generoso)
**Configurar:** Salvar `ASSEMBLYAI_API_KEY` no `.env`
**Quando usar:** Quando precisar saber QUEM falou cada parte (entrevista, reuniao multi-pessoa), ou quiser features alem da transcricao crua

---

## Gerar imagens com IA

### Gemini (Google AI)
**O que faz:** Gera imagens a partir de texto; a mesma chave tambem serve pra assistir video (/assistir-video) e transcrever
**Precisa de conta:** Sim, Google AI Studio. **Pre-pago:** compra minima de US$ 10 em credito, que expira em 12 meses. Quando o credito zera, TUDO que usa a chave para de uma vez; vale ligar recarga automatica com teto
**Configurar:** Salvar `GEMINI_API_KEY` no `.env`
**Atencao:** nunca fixar nome de modelo no codigo; listar os modelos pela API e escolher em runtime (modelo em preview some sem aviso)
**Quando usar:** Capas, ilustracoes, imagens pra posts, analise de video

### DALL-E (OpenAI)
**O que faz:** Gera imagens a partir de texto
**Precisa de conta:** Sim, OpenAI (pago)
**Configurar:** Salvar `OPENAI_API_KEY` no `.env`
**Quando usar:** Alternativa ao Gemini pra geracao de imagens

### FAL API
**O que faz:** Plataforma de inferencia de modelos de imagem premium: gpt-image-2, Flux, Recraft, Stable Diffusion 3, Nano Banana 2 (Gemini), entre outros
**Precisa de conta:** Sim, fal.ai (pago por imagem, varia por modelo)
**Configurar:** Salvar `FAL_KEY` no `.env`
**Quando usar:** Quando Gemini/DALL-E nao dao a qualidade necessaria. FAL roda os modelos mais novos e tem o melhor pra cada caso de uso (photorealismo, ilustracao, mockup, ad creative)

---

## Trabalhar com planilhas e dados

### Google Sheets API (gspread)
**O que faz:** Le e escreve em planilhas do Google Sheets via Python
**Precisa de conta:** Sim, conta Google + service account no Google Cloud
**Configurar:**
1. Criar service account no console.cloud.google.com
2. Habilitar Google Sheets API e Google Drive API
3. Baixar JSON da service account
4. Compartilhar a planilha com o email da service account como editor
5. Salvar caminho do JSON no `.env`
**Como usar numa skill:**
```python
import gspread
gc = gspread.service_account(filename='credenciais.json')
sheet = gc.open('Nome da Planilha').sheet1
```
**Quando usar:** Skills que leem planilha de controle, atualizam dados, geram relatorio em planilha, sincronizam dados entre sistemas

---

## Trabalhar com codigo e Git

### gh CLI / GitHub API
**O que faz:** Interage com GitHub direto do terminal: criar PRs, releases, issues, ver checks de CI, gerenciar repos
**Precisa de conta:** Sim, GitHub (gratis)
**Como instalar:**
```bash
brew install gh             # Mac
winget install GitHub.cli   # Windows
gh auth login
```
**Como usar numa skill:**
```bash
gh pr create --title "..." --body "..."
gh pr list
gh release create v1.0.0
```
**Quando usar:** Skills que automatizam fluxo de Git: abrir PR depois de uma feature, criar release, comentar em issue, listar PRs pendentes

---

## Trafego pago e analytics

> Pra Meta Ads, Google Ads e GA4, nao programar contra a API na mao: a rota e a skill `/trafego` do SabinOS (regua do negocio, ponto de empate e auditoria por script testado), que e condicional e entra no projeto pelo `/setup` quando o negocio anuncia, mais um plugin de anuncios do marketplace oficial do Claude Code (`/plugin`, categoria de ads: auditoria e criacao de campanha Meta, Google, YouTube e TikTok) ou um conector MCP de anuncios (ex: NotFair, Google e Meta Ads). Nome e comando mudam com o tempo: VERIFICAR AO VIVO no `/plugin` antes de instalar. Listados tambem em `../skills/catalogo.md` (o catalogo de skills, nesta mesma biblioteca).

### Google Analytics 4 (Data API)
**O que faz:** Le dados de propriedades GA4: sessoes, usuarios, pageviews, conversoes, fontes de trafego, landing pages, dados em tempo real
**Precisa de conta:** Sim, propriedade GA4 + service account com acesso de leitura
**Recomendacao:** Conector oficial do Google Analytics via claude.ai (Configuracoes > Conectores), se disponivel pra conta; senao, plugin de ads do marketplace oficial que leia GA4, ou service account + Data API dentro de uma skill propria criada pelo `/mapear`
**Quando usar:** Skills que precisam ler trafego, performance de landing pages, conversoes, dados de comportamento do site

### Meta Ads (Marketing API)
**O que faz:** Gerencia campanhas no Facebook/Instagram Ads: criar, editar, pausar, duplicar, ler insights, configurar publicos
**Precisa de conta:** Sim, conta de anuncios Meta + token de longa duracao
**Recomendacao:** Plugin de ads do marketplace oficial (`/plugin`) ou conector MCP de Meta Ads (ex: NotFair), com a skill `/trafego` por cima pra regua e auditoria. Alteracao em campanha real so com aprovacao explicita (gate humano)
**Quando usar:** Skills de gestao de midia paga Meta, relatorios de performance, criacao de campanhas, ajuste de orcamento

### Google Ads API
**O que faz:** Le e edita campanhas Google Ads (Search, Performance Max, Shopping), busca keywords, le quality score, gera relatorios via GAQL
**Precisa de conta:** Sim, conta Google Ads + developer token
**Recomendacao:** Plugin de ads do marketplace oficial (`/plugin`) ou conector MCP de Google Ads (ex: NotFair, que roda GAQL, keyword planner e auditoria), com a skill `/trafego` por cima. Alteracao em campanha real so com aprovacao explicita (gate humano)
**Quando usar:** Skills de gestao Google Ads, pesquisa de keywords, relatorios de quality score, monitoramento de campanhas

---

## Conectar com plataformas (MCPs)

MCPs sao conectores que dao acesso direto a plataformas dentro do Claude Code.
O Claude passa a usar esses conectores automaticamente quando fizer sentido.

Pra verificar quais MCPs ja estao instalados: `claude mcp list`
Pra remover um MCP: `claude mcp remove nome-do-mcp`

> **Rota oficial primeiro:** Gmail, Google Drive e Google Calendar tem conectores OFICIAIS
> hospedados pela Anthropic. Voce liga uma vez no site claude.ai (Configuracoes > Conectores,
> login Google) e o Claude Code carrega sozinho, sem instalar nada. Prefira essa rota; os MCPs
> de terceiros abaixo sao alternativa pra quando o conector oficial nao cobrir o caso.

### Playwright (navegador)
**O que faz:** O Claude passa a enxergar e operar um navegador de verdade: abrir sites, ler paginas, preencher formularios, tirar prints
**Precisa de conta:** Nao, roda local e gratis
**Como instalar:**
```bash
claude mcp add playwright npx @playwright/mcp@latest
npx playwright install chromium
```
**Quando usar:** Pesquisa de concorrentes, conferencia de precos, qualquer automacao de site sem API. Confirmar com /mcp (deve listar "playwright")

### Notion
**O que faz:** Acessa projetos, bases de dados, briefings e tarefas do Notion
**Precisa de conta:** Sim, API key em notion.so/my-integrations
**Como instalar:**
```bash
claude mcp add notion -- npx -y @notionhq/notion-mcp-server
```
**Quando usar:** Skills que precisam ler/escrever tarefas, bases de clientes, documentos

### Gmail
**O que faz:** Le, busca e rascunha emails sem sair do Claude Code
**Precisa de conta:** Sim, conta Google
**Como instalar:** Conector oficial: claude.ai > Configuracoes > Conectores > Gmail (login Google). O Claude Code carrega sozinho. Alternativa por MCP de terceiro: `claude mcp add gmail -- npx -y @gongrzhe/server-gmail-autoauth-mcp`
**Quando usar:** Skills de email, follow-up, comunicacao com clientes

### Google Calendar
**O que faz:** Ve agenda, cria eventos e encontra horarios disponiveis
**Precisa de conta:** Sim, conta Google
**Como instalar:** Conector oficial: claude.ai > Configuracoes > Conectores > Google Calendar. Alternativa por MCP de terceiro: `claude mcp add google-calendar -- npx -y @gongrzhe/server-google-calendar-autoauth-mcp`
**Quando usar:** Skills de agendamento, planejamento, organizacao de reunioes

### Canva
**O que faz:** Acessa designs, cria novos assets visuais direto pelo Claude
**Precisa de conta:** Sim, Canva Pro
**Como instalar:** A rota de conexao do Canva muda com frequencia; VERIFICAR AO VIVO antes de instalar (buscar "Canva MCP Claude" e seguir a doc oficial do Canva)
**Quando usar:** Skills de design, criacao visual, materiais de marca

### Google Drive
**O que faz:** Le e busca arquivos do Google Drive direto do Claude (docs, planilhas, PDFs, imagens)
**Precisa de conta:** Sim, conta Google
**Como instalar:** Conector oficial: claude.ai > Configuracoes > Conectores > Google Drive. Carrega sozinho no Claude Code
**Quando usar:** Skills que precisam ler material que mora no Drive (briefings de cliente, base de conhecimento, decks antigos)
**Dica:** Mais simples que Google Sheets API pra leituras pontuais. Pra escrever em planilha, usar gspread

### context7
**O que faz:** Busca documentacao atualizada de bibliotecas, frameworks, SDKs e APIs (React, Next.js, Prisma, Tailwind, etc)
**Precisa de conta:** Nao
**Como instalar:**
```bash
claude mcp add context7 -- npx -y @upstash/context7-mcp
```
**Quando usar:** Sempre que a skill envolver codigo com biblioteca ou framework. Evita que o Claude use info desatualizada do treinamento

### GitHub
**O que faz:** Acessa repos, PRs, issues, codigo e historico de commits direto do Claude
**Precisa de conta:** Sim, GitHub Personal Access Token
**Quando usar:** Skills que leem ou comentam em PRs, buscam codigo em repos, automatizam fluxo de Git. Complementa o `gh CLI`

### Trello
**O que faz:** Le e atualiza boards, listas e cards do Trello via API
**Precisa de conta:** Sim, Trello API key + token
**Configurar:** Salvar `TRELLO_KEY` e `TRELLO_TOKEN` no `.env`
**Quando usar:** Skills que leem briefing de card, atualizam status, criam card a partir de uma demanda. Comum em fluxo de agencia onde o board do Trello e o backlog

### N8N
**O que faz:** Dispara automacoes e workflows do N8N
**Precisa de conta:** Sim, instancia N8N + API key
**Como instalar:**
```bash
claude mcp add n8n -- npx -y n8n-mcp
```
**Quando usar:** Skills que precisam disparar automacoes externas

### Supabase
**O que faz:** Banco de dados e backend completo
**Precisa de conta:** Sim, projeto Supabase
**Quando usar:** Skills que precisam guardar dados, autenticacao, backend

### Telegram
**O que faz:** Envia e recebe mensagens via bot do Telegram
**Precisa de conta:** Sim, bot token do BotFather
**Quando usar:** Skills de notificacao, comunicacao automatica

---

## Como adicionar ferramentas novas

Se voce usa uma API ou ferramenta que nao esta nessa lista, adicione aqui seguindo o formato:

```markdown
### Nome da Ferramenta
**O que faz:** [descricao em uma frase]
**Precisa de conta:** [Sim/Nao]
**Configurar:** [o que salvar no .env, se aplicavel]
**Como usar numa skill:** [comando ou instrucao]
**Quando usar:** [em que tipo de skill faz sentido]
```
