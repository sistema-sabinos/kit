---
name: conectar
description: >
  Guia o usuário a ligar as contas e ferramentas do negócio no sistema (navegador,
  plugins, email, Drive, IA de mídia, anúncios, WhatsApp, Mercado Livre e Bling, e o
  Hermes Agent pra tarefa que roda sozinha e avisa por app de mensagem), explicando pra
  cada uma o que destrava, se é grátis ou paga, o que precisa pra ligar e se dá pra usar
  hoje.
  Use quando o usuário chamar /conectar, disser "liga o WhatsApp", "conecta meu email",
  "liga o Mercado Livre", "conecta o Bling", "instala tal ferramenta", "o que dá pra
  conectar aqui", "quero que isso rode sozinho", "quero receber isso no meu Telegram"
  ou "dá pra me avisar no celular".
---

# /conectar, Ligando o negócio no sistema

## Antes de tudo: verificação ao vivo

Preço, comando de instalação e regra de plataforma mudam. **Antes de apresentar qualquer conector, conferir por busca real o estado atual** (comando, custo, pré-requisito). O texto abaixo diz o que verificar e a ordem; os números citados são a referência de quando este kit foi escrito (agosto/2026) e servem de ordem de grandeza, não de tabela.

## Abertura

Não perguntar "qual ferramenta quer ligar" (a pessoa não sabe os nomes). Perguntar pelo resultado:

> "O que você quer que eu passe a fazer sozinho? Me diz em termos de resultado, que eu te digo o que precisa ligar.
>
> Pergunto porque cada conexão destrava um grupo de tarefas, e a ordem certa depende do que te ajuda mais.
>
> Tipo: 'quero que você olhe meus emails e me diga o que importa', ou 'quero ajuda pra responder os clientes', ou 'quero que você acompanhe meus anúncios'."

Cruzar a resposta com as ferramentas citadas no `_contexto/empresa.md` e com as linhas `não ligada` do `_contexto/ferramentas.md` (o mapa do que falta) e propor a sequência. Na dúvida, seguir a ordem abaixo, que vai da conexão sem atrito pra com atrito.

## Os conectores, na ordem

Pra cada um, responder sempre as mesmas 4 coisas: **o que te deixa fazer**, **é grátis ou pago**, **precisa de quê pra ligar**, **dá pra usar hoje ou fica pra depois**.

### 1. Navegador (Playwright), comece por este

- **O que te deixa fazer:** eu passo a enxergar e operar um navegador de verdade: abrir sites, ler páginas, preencher formulários, tirar prints, conferir preços de concorrentes. É a base de meia dúzia de automações futuras.
- **Grátis ou pago:** grátis.
- **Precisa de quê:** nada de conta. Um comando no terminal (`claude mcp add playwright npx @playwright/mcp@latest`) e o download dos navegadores (`npx playwright install chromium`, uns 700 MB). Eu rodo os dois, você só aprova.
- **Hoje ou depois:** hoje, em 2 minutos. Confirmar com `/mcp` (deve aparecer "playwright" conectado) e fazer uma demonstração na hora: abrir um site que o usuário conhece e ler algo dele.

### 2. Plugins (pacotes de habilidade prontos)

- **O que te deixa fazer:** instalar de uma vez coleções de habilidades feitas pela comunidade: metodologia de trabalho pra projetos (superpowers), auditoria de anúncios, SEO. Ver o que existe com o comando `/plugin`.
- **Grátis ou pago:** grátis (os plugins em si; alguns conectam em serviços que têm custo próprio).
- **Precisa de quê:** só o comando `/plugin` e escolher no menu.
- **Hoje ou depois:** hoje. Recomendação inicial: superpowers. Os de anúncios e SEO, quando a frente de tráfego estiver ativa.

### 3. Gmail e Google Drive

- **O que te deixa fazer:** eu leio e busco seus emails, resumo o que importa, rascunho respostas; busco e leio arquivos do Drive. (Os conectores oficiais focam em ler, buscar e criar; mover e apagar continua com você.)
- **Grátis ou pago:** grátis.
- **Precisa de quê:** conectar uma vez no site claude.ai (Configurações > Conectores > Google Drive / Gmail, login com sua conta Google). O Claude Code carrega sozinho o que você ligou lá.
- **Hoje ou depois:** hoje, se tiver a conta Google na mão. 5 minutos.

### 4. Gemini (IA de mídia do Google: ver vídeo, gerar imagem, transcrever)

- **O que te deixa fazer:** destrava o `/assistir-video` (eu assisto vídeo de YouTube, Instagram, TikTok vendo a tela e ouvindo, e te conto o que tem) e, mais pra frente, geração de imagem pra anúncio e post.
- **Grátis ou pago:** **pago, pré-pago.** Compra mínima de US$ 10 em crédito, que expira em 12 meses. Vídeo curto custa centavos; o custo aproximado eu aviso antes de cada uso (regra da casa).
- **Precisa de quê:** criar uma chave no Google AI Studio (aistudio.google.com), comprar o crédito inicial e colar a chave no arquivo `.env` como `GEMINI_API_KEY`. Eu te guio clique a clique.
- **Hoje ou depois:** hoje se topar o gasto. **Aviso importante:** quando o crédito zera, tudo que usa essa chave para de uma vez, sem aviso. Vale ligar a recarga automática com um teto mensal baixo.

### 5. Meta Ads e Google Ads (anúncios)

- **O que te deixa fazer:** eu leio suas campanhas, aponto o que está gastando sem retornar, monto relatório e proponho ajustes. Alteração em campanha real só com sua aprovação, sempre.
- **Grátis ou pago:** a conexão é grátis; o que se gasta é o próprio orçamento de anúncio.
- **Precisa de quê:** conta de anúncio ativa e uma autorização (OAuth) que depende da plataforma; em geral se liga por um plugin de anúncios (ver `/plugin`) ou conector. É a fricção do meio: não é difícil, mas tem burocracia de autorização da Meta/Google.
- **Hoje ou depois:** depois, com calma. Anotar em `tarefas.md` e marcar um momento pra fazer junto.

### 6. WhatsApp (o mais desejado e o mais chato, na real)

- **O que te deixa fazer:** na versão completa (API oficial), eu leio as mensagens recebidas, classifico por urgência, rascunho respostas e mando com sua aprovação.
- **Grátis ou pago:** o modelo oficial cobra **por mensagem de template** enviada (marketing custa mais, utilidade custa centavos; resposta a cliente que te chamou primeiro é grátis dentro da janela de 24h, com cota mensal gratuita). E quase sempre tem a mensalidade de um provedor intermediário (BSP), que no Brasil vai de uns R$ 100 a mais de R$ 500 por mês.
- **Precisa de quê:** conta Meta Business verificada, um número dedicado e um provedor. É a maior fricção desta lista, leva dias, não minutos.
- **Hoje ou depois:** **depois, e sem frustração.** Enquanto a API não sai, existe o caminho manual que já funciona hoje: você cola aqui os prints ou o texto das conversas, e eu classifico, priorizo e rascunho as respostas no seu tom (skill de triagem de atendimento, ativável pelo `/mapear`). Resolve 80% da dor sem custo nenhum.

### 7. Hermes Agent (pra quando você quiser que o sistema trabalhe sozinho)

Quem só quer receber aviso de um robô no Telegram não precisa de nada deste item: o `/agendar` monta isso sem custo.

- **O que te deixa fazer:** é outro programa de agente, alternativo a este aqui, que lê a mesma pasta e os mesmos comandos que já montamos. Ele traz duas coisas que este não tem: agendar tarefa pra rodar sozinha no horário marcado (o relatório da semana toda segunda, a checagem dos anúncios todo dia) e te encontrar por app de mensagem, como Telegram, Discord, Slack ou WhatsApp. Na prática: o resultado chega no seu celular sem você abrir o computador.
- **Grátis ou pago:** o programa é grátis e de código aberto (licença MIT), mas **o uso é pago, por token**. Preste atenção nesta parte, porque ela surpreende: ele **não usa a sua assinatura do Claude**. Mesmo quem assina o Pro ou o Max precisa criar e bancar uma chave de API à parte. A assinatura tem valor fixo no mês; aqui a conta sobe conforme o uso, e um robô que dispara sozinho todo dia usa mais do que parece.
- **Precisa de quê:** instalar o programa (um comando só, pelo site oficial hermes-agent.nousresearch.com), criar uma chave de API num provedor de modelo e colar no `.env` dele, e autorizar o canal de mensagem escolhido. No Telegram é criar um bot, uns 5 minutos. No WhatsApp é a mesma burocracia do item 6.
- **Hoje ou depois:** **depois, e a ordem importa.** O caminho barato vem primeiro: um robô agendado pelo próprio Windows ou Mac, montado pelo `/agendar` e avisando no Telegram, custa zero e resolve a maior parte. Quando ele já estiver rodando há semanas e o incômodo virar "preciso estar no computador pra ver o resultado", aí o canal de mensagem compensa o custo. O desenho completo está em `docs/roadmap-avancado.md` na pasta-mãe, seção "Rota Hermes Agent".

Duas coisas a dizer ao usuário quando este item entrar na conversa:

1. **A ponte já está pronta.** As skills deste projeto moram em `.claude/skills/`, e a junction `.agents/skills`, criada no setup, é um dos lugares onde o Hermes procura por skill de projeto. Pela documentação dele, os comandos do usuário aparecem lá sem nenhuma conversão. Ressalva honesta, que se diz em voz alta: isso ainda não foi testado de ponta a ponta. Quem testar primeiro registra o resultado no `_contexto/licoes.md`.
2. **O gate humano não muda de lugar.** Robô agendado pra LER e avisar, sim. Robô respondendo cliente sozinho ou gastando dinheiro sozinho, não, até existir freio testado. Trocar de programa não troca essa regra.

### 8. Mercado Livre e Bling (pra quem instalou o pacote de marketplace)

Só aparece se o projeto tem `.claude/skills/mercado-livre/`. Sem o pacote, pular.

- **O que te deixa fazer:** eu leio seus anúncios, vendas, reputação e campanhas do Mercado Livre pra auditar a conta e o Mercado Ads, crio anúncio novo já pausado (você confere e ativa), e, se você usa Bling, cadastro produto novo por lá (sempre mostrando antes e esperando seu "pode ir").
- **Grátis ou pago:** grátis. As duas APIs não cobram.
- **Precisa de quê:** um aplicativo em cada portal de desenvolvedor, criado por você com o seu login, e o `.env` do projeto com as chaves. Eu guio clique a clique e confiro com você o que o portal pede na tela, porque isso muda.
- **Hoje ou depois:** hoje, uns 15 minutos cada. O Bling só se o `_contexto/mercado-livre.md` diz `erp: bling`.

**Mercado Livre, passo a passo:**

1. No portal de desenvolvedor do Mercado Livre, criar um aplicativo. A URL de retorno precisa começar com `https` (o portal recusa `http`, conferido por busca em 2026-09-24; fonte secundária, não conferido com o portal aberto). Cadastrar `https://127.0.0.1:8765/callback`; se o portal recusar, `https://localhost:8765/callback`; e se recusar as duas, qualquer endereço `https` que o portal aceitar serve, porque a página de retorno nunca precisa abrir de verdade (a pessoa cola a URL inteira da barra do navegador de qualquer jeito, no passo 4). O que importa é ser exatamente a mesma URL no portal e no `ML_REDIRECT_URI`. Se o portal perguntar a permissão do aplicativo, escolher leitura e escrita: só leitura audita, mas não cria anúncio. O nome e o lugar dessa opção mudam; conferir na tela com a pessoa.
2. Colar no `.env` do projeto: `ML_CLIENT_ID`, `ML_CLIENT_SECRET` e `ML_REDIRECT_URI` (a mesma URL do passo 1, letra por letra).
3. Rodar `node .claude/skills/mercado-livre/scripts/autorizar.mjs --ml --url`, abrir o link e autorizar.
4. Depois de autorizar, o navegador tenta abrir a URL de retorno e mostra erro de página. Isso é esperado: nada roda ali. Copiar a URL inteira da barra do navegador e rodar `node .claude/skills/mercado-livre/scripts/autorizar.mjs --ml "<url colada>"`. Os tokens vão pro `.env` e se renovam sozinhos.
5. Testar: `node .claude/skills/auditar-conta/scripts/rodar.mjs --dias 7 --sem-keywords` gera um relatório em `relatorios/`.

**Bling, passo a passo:**

1. No Bling, criar o aplicativo (em 2026-09-24: Configurações, Central de extensões, Área do integrador, Criar aplicativo, tipo API, uso Privado). Link de redirecionamento: `http://127.0.0.1:8765/callback`.
2. Colar no `.env`: `BLING_CLIENT_ID` e `BLING_CLIENT_SECRET`.
3. Primeiro ligar o receptor: `node .claude/skills/mercado-livre/scripts/autorizar.mjs --bling --ouvir`. Ele fica esperando.
4. Em outro terminal, `node .claude/skills/mercado-livre/scripts/autorizar.mjs --bling --url`, abrir o link e autorizar. O código do Bling vale 1 minuto, e o receptor troca na hora. Se o receptor não pegar (porta ocupada, antivírus), copiar a URL da barra e rodar `--bling "<url colada>"` em menos de 1 minuto.
5. Testar: `node .claude/skills/cadastrar-bling/scripts/cadastrar.mjs --categorias` lista as categorias da conta.

**MCP do Bling (uma ponte que deixa o Claude consultar o seu Bling direto na conversa, só leitura):**

1. Instalar as dependências dele, da raiz do projeto: `npm install --prefix .claude/skills/cadastrar-bling/mcp`.
2. No `.mcp.json` da raiz do projeto (criar se não existir; se existir, juntar sem apagar o que já tem), acrescentar dentro de `mcpServers`: `"bling": { "command": "node", "args": [".claude/skills/cadastrar-bling/mcp/servidor.mjs"] }`. Conferir que o arquivo continua JSON válido.
3. Fechar e abrir a conversa; aprovar o servidor `bling` quando o Claude Code perguntar. Testar com `/mcp` (deve aparecer `bling` conectado) e pedindo "quantos produtos tenho no Bling?".

O MCP só lê. Cadastro continua pela `/cadastrar-bling`, que mostra antes e espera o "pode ir".

### 9. Redes sociais (pra quem instalou o pacote de mídia social)

Só aparece se o projeto tem `.claude/skills/midia-social/`. Sem o pacote, pular.

- **O que te deixa fazer:** agendar post no Instagram, TikTok e YouTube de uma vez pelo Buffer, medir o resultado de cada post e ler o canal do YouTube.
- **Grátis ou pago:** grátis (Buffer, Cloudinary e as APIs do Instagram e do YouTube no plano grátis). O R2, se for preciso, pede cartão pra ativar, sem cobrar até 10 GB.
- **Precisa de quê:** conta no Buffer com as redes ligadas, um depósito pro vídeo, e, pra medir, o Instagram profissional e um projeto no Google Cloud.
- **Hoje ou depois:** o Buffer e o depósito antes do primeiro post; Instagram e YouTube quando for medir.

O passo a passo, uma conta por vez, está em `.claude/skills/midia-social/referencias/configurar.md`: abrir a seção da conta que a pessoa quer ligar e seguir com ela, clique a clique.

## Orçamento (no fim, não no começo)

Depois de apresentar o que interessou:

> "Pra eu recomendar direito: quanto por mês o negócio topa gastar com ferramenta e crédito de IA? Pode ser zero, e aí eu monto tudo só com o que é grátis.
>
> Pergunto porque a diferença entre o plano grátis e uns R$ 50 por mês muda o que eu consigo automatizar, e não quero te empurrar custo que não se paga."

Filtrar as recomendações pela resposta.

## Ao concluir cada conexão

1. Testar na hora com um caso real (abrir um site, ler um email, assistir um vídeo curto)
2. Registrar em `_contexto/ferramentas.md`: linha `| <ferramenta> | ligado | <AAAA-MM-DD> | <pra quê; como o sistema alcança: MCP, API com o nome da variável, programa> |`. Se o assunto já tem linha `não ligada` ou `só você` (ela começa com o nome do assunto, "Agenda: ..."), atualizar essa linha, mantendo o assunto na frente, em vez de criar outra
3. Se ficou pra depois: registrar como `| <ferramenta> | pendente | | <o que falta> |` e anotar em `tarefas.md`

## Regras

- Nunca pedir senha na conversa. Login é sempre o usuário digitando na tela dele; chave de API vai no `.env`
- Custo se avisa antes, em reais quando possível
- Uma conexão por vez, testada, antes de partir pra próxima
