---
name: publicar-instagram
description: >
  Publica carrosséis e posts no Instagram e TikTok direto do Claude Code.
  Suporta dois métodos: Post for Me (mais simples, multi-plataforma) ou
  Graph API do Instagram (direto, sem intermediário).
  Inclui setup guiado na primeira vez pra configurar credenciais.
  Use quando o usuário disser "publicar no Instagram", "publicar no TikTok", "postar o carrossel
  no Instagram", ou pedir pra enviar imagens pro Instagram/TikTok.
---

# /publicar-instagram, Publicar no Instagram e TikTok

> Alternativa ao pacote de mídia social (`/publicar-social`, pelo Buffer), só pra quem não quer o
> Buffer. Nunca promover num projeto que já tem o pacote: ficariam duas rotas pro mesmo trabalho.

## Setup (primeira vez)

Na primeira vez, guiar o usuário pra escolher e configurar o método de publicação.

### Perguntar o método

> "Pra publicar direto do Claude Code, tu tem duas opções:
>
> **1. Post for Me** (recomendado)
> - Publica no Instagram, TikTok e LinkedIn com uma API só
> - Setup em 5 minutos, token não expira
> - Gratuito pra uso normal
> - Site: postforme.dev
>
> **2. Graph API do Instagram** (avançado)
> - Publica direto pela API oficial do Meta/Facebook
> - Só Instagram (TikTok e LinkedIn não)
> - Token expira a cada 60 dias (precisa renovar)
> - Setup mais técnico (~15 min)
> - Gratuito
>
> Qual tu prefere?"

---

### Setup Post for Me

Se escolheu Post for Me:

1. **Criar conta:**
   > "Acessa postforme.dev, cria uma conta e conecta teu Instagram (e TikTok se quiser).
   > Depois vai em Settings > API e copia a API Key. Abre o arquivo `.env` na raiz do projeto,
   > acrescenta a linha `POSTFORME_API_KEY=<a chave>` e salva; me avisa quando terminar (não cola a
   > chave aqui no chat)."

2. **Conferir a key:** só pelo teste do passo 3. Ninguém lê o `.env` pelo terminal nem pede a chave
   no chat.

3. **Testar conexão:**
   ```bash
   node --env-file=.env .claude/skills/publicar-instagram/scripts/publish-postforme.js --platform instagram --testar
   ```
   A chave vai do `.env` direto pro script, sem ninguém ler o `.env` pelo terminal.
   Se responder "Chave ok" com a conta conectada, tá pronto. Se não, guiar o usuário pra conectar a conta no dashboard.

4. **Conferir o script de publicação:**
   O `scripts/publish-postforme.js` vem dentro desta skill e roda de lá (`.claude/skills/publicar-instagram/scripts/publish-postforme.js` depois de promovida). Não copiar pra fora: assim a skill viaja inteira quando a pasta for compartilhada.

5. Confirmar:
   > "Pronto! Script de publicação no lugar. Tua conta tá conectada. Pra publicar, é só chamar /publicar-instagram com as imagens."

---

### Setup Graph API

Se escolheu Graph API:

1. **Guiar configuração do Meta Developer:**
   > "Vou te guiar passo a passo. Primeiro:
   > 1. Acessa developers.facebook.com e cria um app tipo 'Empresa'
   > 2. No app, ativa o produto 'Instagram Graph API'
   > 3. Vai no Graph API Explorer (developers.facebook.com/tools/explorer/)
   > 4. Seleciona teu app e gera um token com estes escopos:
   >    - instagram_content_publish
   >    - instagram_basic
   >    - pages_read_engagement
   > 5. Abre o arquivo `.env` na raiz do projeto, acrescenta as linhas `INSTAGRAM_TOKEN_CURTO=<o token>`,
   >    `META_APP_ID=<o App ID>` e `META_APP_SECRET=<o App Secret>` (os dois ficam em Configurações do
   >    app > Básico) e salva; me avisa quando terminar (não cola nada disso aqui no chat)."

2. **Trocar pelo token de 60 dias e achar a conta:**
   ```bash
   node --env-file=.env .claude/skills/publicar-instagram/scripts/publish-graph-api.js --configurar
   ```
   Troca o token curto pelo longo, acha a Página e a conta do Instagram ligada a ela, grava
   `INSTAGRAM_ACCESS_TOKEN` e `INSTAGRAM_USER_ID` no `.env`, apaga o `INSTAGRAM_TOKEN_CURTO` e só
   imprime "ok, conta @x ligada". Se o login tiver mais de uma conta ligada, ele lista as contas e não
   grava nada: a pessoa escreve `INSTAGRAM_CONTA=<a conta que publica>` no `.env` e roda de novo.
   Nenhum segredo vai pra tela nem pra linha de comando. A versão da
   Graph API é a v25.0; outra versão vai no `.env` como `META_GRAPH_VERSAO=v26.0`.

3. **Configurar imgbb (host de imagens):**
   > "A Graph API precisa de URL pública pra cada imagem. O imgbb faz isso de graça:
   > 1. Acessa api.imgbb.com
   > 2. Cria conta e copia a API Key
   > 3. Abre o `.env`, acrescenta a linha `IMGBB_API_KEY=<a chave>` e salva; me avisa quando
   >    terminar (não cola a chave aqui no chat)"

4. **Conferir o script:**
   O `scripts/publish-graph-api.js` vem dentro desta skill e roda de lá (`.claude/skills/publicar-instagram/scripts/publish-graph-api.js` depois de promovida). Não copiar pra fora.

5. **Avisar sobre renovação:**
   > "Importante: teu token do Instagram expira em 60 dias. Quando parar de funcionar, roda /publicar-instagram de novo que eu te guio pra renovar (token curto novo no `.env` e o `--configurar` de novo)."

---

## Workflow de publicação (após setup)

### 1. Detectar o que publicar

Se o usuário chamou `/publicar-instagram` sem argumentos, olhar `producao/*/final/` (fora `_molde` e `_pauta`) com `slide-NN.png` e sem `publicacao.md`; oferecer o mais recente. A legenda é a seção `## Legenda` do `post.md` da mesma pasta. Sem nenhuma, perguntar: "O que tu quer publicar? Me passa o caminho das imagens."

Se chamou com caminho (ex: `/publicar-instagram producao/2026-10-08-moedor/`):
- Usar os PNGs de `final/` e a seção `## Legenda` do `post.md` daquela pasta

### 2. Detectar o método configurado

Verificar `.env`:
- Se tem `POSTFORME_API_KEY` -> usar Post for Me
- Se tem `INSTAGRAM_ACCESS_TOKEN` -> usar Graph API
- Se tem os dois -> perguntar qual usar
- Se não tem nenhum -> rodar setup

### 3. Preview antes de publicar

Antes de qualquer publicação, mostrar preview:

> "Vou publicar no Instagram:
> - Imagens: slide-01.png, slide-02.png, ... slide-08.png
> - Legenda: [primeiros 200 chars]...
> - Método: Post for Me / Graph API
>
> Quer que eu faça um dry-run primeiro pra testar, ou manda direto?"

### 4. Dry-run (recomendado na primeira vez)

Os comandos rodam da raiz do projeto (onde está o `.env`), chamando o script dentro da skill.

```bash
# Post for Me
node --env-file=.env .claude/skills/publicar-instagram/scripts/publish-postforme.js \
  --platform "instagram" \
  --images "producao/<slug>/final/slide-01.png,producao/<slug>/final/slide-02.png,..." \
  --caption "legenda" \
  --dry-run

# Graph API
node --env-file=.env .claude/skills/publicar-instagram/scripts/publish-graph-api.js \
  --images "producao/<slug>/final/slide-01.png,producao/<slug>/final/slide-02.png,..." \
  --caption "legenda" \
  --dry-run
```

Mostrar resultado do dry-run. Se OK, perguntar:
> "Dry-run passou. Quer publicar de verdade?"

### 5. Publicar

```bash
# Post for Me, Instagram
node --env-file=.env .claude/skills/publicar-instagram/scripts/publish-postforme.js \
  --platform "instagram" \
  --images "producao/<slug>/final/slide-01.png,producao/<slug>/final/slide-02.png,..." \
  --caption "legenda"

# Post for Me, TikTok (SEMPRE como draft pro usuario escolher musica no app)
node --env-file=.env .claude/skills/publicar-instagram/scripts/publish-postforme.js \
  --platform "tiktok" \
  --images "producao/<slug>/final/slide-01.png,producao/<slug>/final/slide-02.png,..." \
  --caption "legenda tiktok" \
  --draft

# Graph API, Instagram
node --env-file=.env .claude/skills/publicar-instagram/scripts/publish-graph-api.js \
  --images "producao/<slug>/final/slide-01.png,producao/<slug>/final/slide-02.png,..." \
  --caption "legenda"
```

### 6. Confirmar

Após publicação:
> "Publicado no Instagram! [link se disponível]"

Se o usuário quiser publicar no TikTok também (e usar Post for Me), perguntar:
> "Quer publicar no TikTok também? Vai como rascunho pra tu escolher a música no app."

---

## Regras

- NUNCA publicar sem confirmação explícita do usuário
- Dry-run recomendado na primeira publicação (não obrigatório depois)
- TikTok via Post for Me: SEMPRE como draft (flag --draft)
- Se o token da Graph API expirou, guiar renovação em vez de dar erro genérico
- Legenda max: 2200 caracteres (Instagram/TikTok), 3000 (LinkedIn)
- Imagens: 2-10 (Instagram), 4-35 (TikTok)
- Nunca commitar `.env` no git (já tá no .gitignore)
