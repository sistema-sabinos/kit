# Configurar o pacote de midia social

> Cada comando abre so a secao que ele precisa, na primeira vez. Ninguem configura tudo de uma vez.
> Chave e senha nunca vao no chat: vao no arquivo `.env`, na raiz do projeto, uma por linha.
> Todo numero aqui foi conferido na data escrita no topo da secao. Plano e limite de plataforma
> mudam: se a data tiver mais de 90 dias, pedir ao Claude pra conferir de novo antes de confiar.

## Buffer

conferido em 2026-10-04. Fontes: https://support.buffer.com/article/859-does-buffer-have-an-api e
https://marcandrews.com/buffer-free-plan-limits-2026-exactly-what-you-get/

O Buffer e o programa que agenda o post e publica na hora marcada, mesmo com o computador desligado.
O plano gratis serve pra comecar: 3 redes ligadas, 10 posts esperando na fila de cada rede, e a
API (o caminho que o SabinOS usa pra falar com ele) liberada, com 3.000 pedidos a cada 30 dias.

1. Criar a conta em https://buffer.com (plano gratis).
2. Ligar as redes, uma por vez: Instagram (precisa ser conta profissional, ver a secao Instagram),
   TikTok e YouTube.
3. Criar a chave da API: no Buffer, menu da conta, opcao de API (o Claude guia clique a clique se o
   menu tiver mudado de nome).
4. Abrir o arquivo `.env` na raiz do projeto e colar numa linha nova: `BUFFER_API_KEY=sua-chave`
   (trocando `sua-chave` pela chave copiada).
5. Rodar `node .claude/skills/midia-social/scripts/canais.mjs`. Ele mostra as redes que achou.
6. Se estiver certo, rodar de novo com `--gravar`. Pronto: os ids das redes ficam no
   `_contexto/midia-social.md`.

## Deposito do video

conferido em 2026-10-04. Fontes: https://developers.buffer.com/guides/hosting-media.html,
https://cloudinary.com/documentation/developer_onboarding_faq_free_plan,
https://community.cloudflare.com/t/why-using-r2-free-tier-involves-giving-card-info/945179 e
https://developers.cloudflare.com/r2/buckets/public-buckets/

O Buffer nao recebe o arquivo do video: ele precisa de um link pro video, e busca o arquivo nesse
link na hora de postar. Por isso o video mora antes num "deposito" na internet. O proprio Buffer
recomenda dois: o Cloudinary e o R2 da Cloudflare.

### Cloudinary (comece por este)

Gratis e sem cartao de credito. No plano gratis cada video pode ter ate 100 MB (um video de 1 minuto
fica bem abaixo disso).

1. Criar a conta em https://cloudinary.com (plano gratis).
2. No painel, achar o "Cloud name", a "API Key" e o "API Secret".
3. No `.env`, tres linhas novas:
   `CLOUDINARY_CLOUD_NAME=seu-cloud-name`, `CLOUDINARY_API_KEY=sua-chave` e
   `CLOUDINARY_API_SECRET=sua-chave-secreta`.
4. No `_contexto/midia-social.md`, a linha `deposito: cloudinary` (ja vem assim).

### R2 da Cloudflare (se o Cloudinary nao servir)

Use se o Cloudinary recusar o envio ou se o video passar de 100 MB.

O R2 da Cloudflare e gratis ate 10 GB guardados, mas pede cartao de credito pra ativar: a
Cloudflare faz uma checagem de US$ 5 no cartao, que nao vira cobranca. E o deposito que o criador do SabinOS
usa na operacao dele.

1. Criar a conta em https://dash.cloudflare.com e ativar o R2 (pede o cartao).
2. Criar um bucket (um "balde" onde os videos ficam), com um nome so seu.
3. No bucket, em Settings, ligar o acesso publico. A Cloudflare gera um endereco do tipo
   `https://pub-<letras-e-numeros>.r2.dev`. Esse endereco tem limite de uso e a Cloudflare o indica
   pra teste; pra o volume de uma loja (alguns posts por semana) ele serve. Se um dia o post falhar
   por limite, o Claude ajuda a ligar um dominio proprio.
4. Criar a chave da API do R2 (permissao de leitura e escrita no bucket).
5. No `.env`, cinco linhas novas: `R2_ACCESS_KEY_ID=`, `R2_SECRET_ACCESS_KEY=`,
   `CLOUDFLARE_ACCOUNT_ID=`, `R2_BUCKET=` (o nome do bucket) e `R2_URL_PUBLICA=` (o endereco do
   passo 3), cada uma com o seu valor depois do sinal de igual.
6. No `_contexto/midia-social.md`, trocar a linha pra `deposito: r2`.

## Instagram

conferido em 2026-10-04. Fontes: https://developers.facebook.com/docs/instagram-platform/overview/ e
https://developers.facebook.com/docs/instagram-platform/reference/access_token/

Serve pro /auditar-instagram ler os numeros da conta (alcance, salvamentos, quem segue). Postar e
pelo Buffer, que tem a propria ligacao.

1. Virar conta profissional, se ainda nao for: no app do Instagram, Configuracoes, Tipo de conta,
   mudar pra conta comercial ou de criador de conteudo. E gratis.
2. Criar um app em https://developers.facebook.com, com o produto "Instagram" e a opcao de login
   pelo Instagram (Instagram Login). Pra ler so a sua propria conta, o acesso padrao basta: nao
   precisa de analise da Meta.
3. No painel do app, gerar o token da sua conta. Ele vale 60 dias.
4. No `.env`, duas linhas novas: `IG_ACCESS_TOKEN=seu-token` e `IG_TOKEN_VENCE_EM=AAAA-MM-DD`
   (a data de hoje mais 60 dias).
5. A cada 60 dias, antes de vencer, rodar `/auditar-instagram --renovar`. O proprio comando avisa
   quando faltarem 7 dias. Se vencer, voltar ao passo 3.

## YouTube

conferido em 2026-10-04. Fontes: https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits,
https://www.getphyllo.com/post/youtube-api-limits-how-to-calculate-api-usage-cost-and-fix-exceeded-api-quota e
https://dev.to/ko-hi/googles-oauth-testing-mode-expires-refresh-tokens-in-7-days-publish-the-consent-screen-before-24hm

Serve pro /gerenciar-youtube ler o canal e trocar titulo e descricao. Postar o Short e pelo Buffer.
E gratis: o Google da 10.000 "unidades" por dia, e uma consulta comum gasta 1 (uma busca gasta 100).

1. Entrar em https://console.cloud.google.com com a conta do canal e criar um projeto.
2. Em "APIs e servicos", ligar a "YouTube Data API v3" e a "YouTube Analytics API".
3. Configurar a tela de consentimento (tipo externo) e, no fim, clicar em "Publicar app" pra ela ficar
   "Em producao". Nao precisa de analise do Google pra usar so na sua conta: na hora do login aparece um
   aviso de app nao verificado, e e so seguir. Se ficar "Em teste", o Google derruba o login a cada 7 dias.
4. Criar uma credencial do tipo "ID do cliente OAuth", aplicativo de computador (desktop), depois de
   publicar o app (credencial criada ainda em teste continua caindo a cada 7 dias).
5. Baixar o arquivo JSON (fica na pasta Downloads; nao precisa trazer pro projeto).
6. Rodar uma vez `node .claude/skills/gerenciar-youtube/scripts/yt.mjs auth --cliente <caminho do arquivo baixado>`:
   ele grava a credencial no `.env`, abre o login no navegador, voce autoriza, e o login tambem fica no
   `.env`. Depois disso, o arquivo baixado pode ser apagado.

## Gemini (opcional)

E a unica parte paga do pacote, e e opcional: a /pauta e a /decupar-referencia funcionam sem ele,
lendo a transcricao do video. Com ele, a IA ve a imagem do video tambem, e a analise fica melhor.
Antes de cada uso o comando diz quanto vai custar e espera o seu "pode ir".

A chave se configura pela secao "Gemini" do `/conectar`.
