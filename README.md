# SabinOS

Versão 5.8 (2026-10-08)

Um sistema de trabalho com IA pro seu negócio, rodando dentro do VS Code com o Claude Code.

A ideia é simples: em vez de conversar com uma IA que esquece tudo a cada conversa, você monta uma pasta que é a memória permanente do seu negócio. O Claude lê essa pasta no começo de toda sessão, então ele sempre sabe quem você é, o que você vende, como você escreve e o que está pegando agora. Esta pasta aqui é a sala de controle: é onde você cria e organiza os projetos. O trabalho do dia a dia acontece dentro da pasta de cada projeto.

## Como instalar

**1. Instale o VS Code**, em [code.visualstudio.com](https://code.visualstudio.com/).

**2. Garanta o Git**, de um jeito ou de outro:
- **Windows:** abra o Terminal (ou PowerShell) e rode `winget install --id Git.Git -e --source winget`. Se preferir sem linha de comando, baixe em [git-scm.com/downloads](https://git-scm.com/downloads) e siga as opções padrão.
- **Mac:** abra o Terminal e digite `git --version`. Se não tiver instalado, o próprio macOS oferece a instalação (`xcode-select --install`), aceite. Quem já usa Homebrew também pode rodar `brew install git`.

**3. Instale o Node.js** em [nodejs.org](https://nodejs.org/) (botão verde, versão LTS, opções padrão). É o motor das ferramentas internas do kit, como a de assistir vídeo; sem ele essas partes travam na primeira vez que você for usar.

**4. Assine o Claude** em [claude.com](https://claude.com/). Depois, no VS Code, abra a aba de extensões (ícone de blocos na lateral), busque "Claude Code", instale e faça login.

**5. Descompacte este kit** e deixe a pasta `SabinOS-Sistema` dentro de `Documentos`. No Windows, no Extrair Tudo, não mude o caminho que ele sugere (já termina em `SabinOS-Sistema`); mudando pra terminar só em `Documentos`, os arquivos caem soltos lá. No Mac, o duplo clique no `SabinOS-Sistema.zip` cria a pasta. Nos dois, arraste a pasta `SabinOS-Sistema` pra `Documentos`. Não deixe em Downloads, nem dentro de uma pasta que já é repositório git. Abrindo a pasta, o `COMECE-AQUI.md` aparece logo de cara.

**6. Abra a pasta no VS Code** (`Arquivo > Abrir Pasta`) e siga o [COMECE-AQUI.md](COMECE-AQUI.md).

Quando sair versão nova, `/atualizar-kit` aqui na pasta-mãe traz as melhorias sem mexer nos seus projetos, e dentro de cada projeto `/atualizar-sabinos` puxa a versão nova direto do GitHub.

## O fluxo em 3 passos

Todo o passo a passo de leigo está no [COMECE-AQUI.md](COMECE-AQUI.md): abrir a pasta no VS Code, dizer oi ao Claude e responder as perguntas no chat, e depois trabalhar dentro da pasta do projeto que ele cria pra você.

## O que vem dentro

- `COMECE-AQUI.md`, os 3 passos de leigo pra começar
- `RESPONDA-AQUI.txt`, as perguntas da entrevista, onde o Claude grava as suas respostas (dá pra preencher à mão, se preferir)
- `AGENTS.md`, o cérebro desta sala de controle (como ela conduz o onboarding); `CLAUDE.md` é só o ponteiro pro Claude Code ler o mesmo arquivo
- `_modelo/`, o molde completo de um projeto (skills, contexto, estrutura de pastas), de onde cada projeto novo nasce. Não é pasta de trabalho
- `_ferramentas/`, o verificador do kit e uma biblioteca pronta contra automação que trava
- `docs/`, o guia avançado (Codex e Hermes Agent) e o roteiro de próximos passos. Os dois guias em PDF, de instalação (`Guia-SabinOS-Instalacao`) e de comandos (`Guia-SabinOS-Comandos`), vêm junto com o zip, fora desta pasta
- `<projeto>/`, uma pasta por projeto que você criar, cada uma vira um workspace próprio no VS Code

**Comandos desta pasta-mãe** (digite `/` na conversa pra ver):

- `/setup`, monta o seu primeiro projeto pela entrevista no chat (começa sozinho na primeira mensagem)
- `/novo-projeto`, cria uma pasta irmã nova pra outro negócio ou outra frente
- `/find-skills`, descobre e adapta skills prontas pro seu ramo em vez de criar tudo do zero
- `/syncar`, salva o estado da pasta-mãe no GitHub
- `/atualizar-kit`, traz uma versão nova do SabinOS (do GitHub ou de um zip) sem tocar nos seus projetos

Dentro de cada projeto criado, outro conjunto de comandos entra em ação (`/iniciar`, `/conectar`, `/mapear`, `/atualizar`, `/checar` e mais), explicados no PDF `Guia-SabinOS-Comandos`, que veio junto com este zip (ele fica fora da pasta); dentro do projeto, digite `/` pra ver a lista.

O projeto guarda o que foi feito e por quê em `_memoria/` (diário, decisões e recados dos robôs), e vem com `/faxina` (confere uma vez por mês se a memória envelheceu e só mexe com o seu sim), `/compartilhar` (manda a pasta de um cliente ou sócio pro GitHub dela, sem senha e sem o resto do projeto) e `/segunda-opiniao` (um revisor que não viu a conversa confere a proposta antes de você aprovar gasto, publicação, envio pra fora ou mudança de pasta, ou quando você pede).

A marca tem duas metades em `marca/`: o visual e a voz com que o sistema escreve pro seu cliente, separada do jeito que ele fala com você. O backup automático segura arquivo com cara de senha ou grande demais, manda o resto e deixa um recado dizendo o que ficou.

Quem vende em marketplace ganha, se quiser, o pacote `/mercado-livre`: do "posso vender esse produto?" ao anúncio publicado e à conta auditada, sem custo (as partes pagas são opcionais e sempre avisadas antes de rodar: gerar imagem por IA e a leitura das fotos dos concorrentes na `/engenharia-reversa`). O `/setup` oferece quando suas respostas falam em marketplace.

Junto com ele vem mais um pacote opcional. O de vídeo faz o vídeo do produto sem você filmar (`/video-produto`, a partir das dúvidas dos compradores nos concorrentes; rode antes a `/espionar-concorrente`) e edita o vídeo que você gravou (`/editar-video`). A instalação, pela `/configurar-video`, pede uns 4 GB livres na hora e uns 3 GB depois (música e efeito sonoro você baixa grátis, o kit mostra onde); gerar vídeo por IA é pago, com o valor mostrado antes, e o teto padrão de gasto é US$ 4 por rodada.

Quem posta em rede social ganha, se quiser, o pacote de redes sociais (`/midia-social`), com ou sem marketplace: faz a pauta da semana, agenda no Instagram, TikTok e YouTube pelo Buffer e mede o resultado, grátis (análise pelo Gemini opcional). O `/setup` oferece quando suas respostas falam em Instagram, TikTok, YouTube, post ou vídeo.

Quem vende direto pro cliente (encomenda, WhatsApp, Instagram, Pix) ganha, se quiser, o pacote de loja: `/atendimento` responde as mensagens com o preço e o prazo da sua tabela, conferidos antes de chegar em você (o Claude rascunha, você manda); `/caixa` anota pedido e sinal, mostra quem está devendo e fecha o mês; `/cobrar` rascunha a cobrança no seu tom. Pra quem é MEI, o `/mei` avisa do DAS de todo dia 20, da declaração anual até 31 de maio e do faturamento perto do teto, somando o total que você anota das vendas de fora do `/caixa` (Mercado Livre, Shopee), com os valores conferidos em fonte oficial. Tudo grátis. O `/setup` oferece quando suas respostas falam em venda direta, e pergunta se o negócio tem CNPJ antes de instalar o `/mei`. Ao MEI que vende só em marketplace, ele oferece o `/mei` também, que traz junto os scripts do caixa.

Todo projeto vem com a `/ler-avaliacoes`, que lê as avaliações reais dos clientes de um concorrente e ranqueia o que eles mais reclamam e pedem, com a frase de cada um. E quem quer criar um app ou sistema próprio pra vender ganha, se quiser, o pacote criar app: dez comandos, de `/app-estudar` a `/app-publicar`, mais a `/ler-avaliacoes` como etapa 2: onze etapas, do estudo de um app que já existe até o seu no ar com marca própria. Montar é grátis, mas gasta bastante do seu plano Claude; domínio, hospedagem paga, conta nas lojas de celular e taxa do INPI aparecem antes, com o valor, e só andam com o seu ok. O `/setup` oferece quando suas respostas falam em app, sistema ou SaaS.

Todo projeto também vem com a `/humanizar`: ela aponta o que soa robô num anúncio, post ou resposta de cliente e, quando você pede, reescreve sem mexer em preço, prazo, medida e marca, com um conferidor que reprova se algum número sumiu ou mudou. Grátis.

E com a `/pedir`, a porta de entrada de quem ainda não sabe pedir: pergunte "dá pra...?" ou "a IA consegue...?" e ela responde o que dá, o que falta ligar e se custa; escreva o pedido do seu jeito e ela devolve o pedido completo, com o antes e o depois. Grátis.

O kit também funciona com o Codex (CLI da OpenAI, login pela sua conta ChatGPT), e a estrutura de skills que ele monta segue o padrão aberto que outros agentes leem, como o Hermes Agent. O guia avançado em `docs/roadmap-avancado.md` explica as rotas.

## Uma regra de ouro

Chave de API e senha vão sempre num arquivo chamado `.env` na raiz da pasta certa. Ele já vem protegido e nunca sobe pro GitHub. Nunca cole chave dentro de outro arquivo ou na conversa.

---

Feito com a estrutura real de operação do criador do SabinOS.

## Direitos

© SabinOS. Todos os direitos reservados. Uso pessoal; proibida a revenda ou a
redistribuição, no todo ou em parte.
