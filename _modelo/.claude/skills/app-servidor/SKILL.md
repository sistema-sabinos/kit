---
name: app-servidor
description: >
  Liga a parte de trás do app: login, banco de dados com regra de acesso, pagamento
  em modo de teste (Stripe ou Mercado Pago, com o comparativo de taxa e a data),
  e-mail automático, tarefas que rodam sozinhas e integrações por API oficial, com a
  lista de segurança e a política de privacidade da LGPD. O aluno cria cada conta e
  cola cada chave; a IA nunca digita senha, cartão nem chave. É a etapa 6 do pacote
  criar app. Use quando o usuário chamar /app-servidor, disser "põe login no app",
  "liga o banco de dados", "quero cobrar assinatura", "liga o pagamento", "conecta o
  Stripe", "conecta o Mercado Pago", "o app tem que mandar e-mail", "liga com o Google
  Agenda", ou quando a /app-construir terminou com dado de mentira.
---

# /app-servidor, login, banco, pagamento e e-mail de verdade

## O que essa skill faz

Até aqui o app mostra telas com dado de mentira. Esta etapa liga o servidor, a parte
do app que roda longe da tela do cliente, guarda as informações e faz o trabalho
pesado: quem entrou, o que cada um pode ver, quem pagou, que e-mail sai. Lê o plano
da `/app-planejar`, escreve o código dentro de `app/codigo/` e mantém
`app/servidor.md` com a lista de conferência do fim desta página.

Todo preço, taxa, limite e regra citados aqui moram em
`.claude/skills/app-planejar/referencias/fatos.md`, um id por fato, com a data em que
foi conferido. Antes de afirmar qualquer um deles ao aluno, abrir a linha do id. Se a
data tiver mais de 60 dias, conferir na fonte da linha (e na web, em português e
inglês) antes de falar, e atualizar a linha com a data nova.

## Dependências

- `app/arquitetura.md`, o plano da `/app-planejar`: ferramentas escolhidas, as fichas
  que o sistema guarda, hospedagem e provedor de pagamento escolhidos.
- `app/codigo/` com as telas da `/app-construir` funcionando com dado de mentira.
- `app/funcoes.csv`, a lista de funções da `/app-estudar` (coluna `minha` é a do app
  do aluno).
- `.claude/skills/app-planejar/referencias/fatos.md`, os fatos datados.

Faltou o plano: rodar a `/app-planejar` primeiro. Faltou o código: `/app-construir`.

## As regras

- **Só API oficial e pública, com a conta e a chave do próprio aluno.** API é a porta
  que um serviço abre pra outro programa conversar com ele. Ficam proibidos: chamar
  endereço interno do app de referência, usar o login de desenvolvedor dele, passar
  qualquer coisa por dentro dele.
- **Quem cria conta e chave é o aluno.** Chave de API é a senha que um programa usa
  pra falar com o serviço em nome do aluno. A IA guia clique a clique e espera; quem
  se cadastra, digita senha, põe cartão e copia chave é a pessoa. A IA escreve o
  `app/codigo/.env.example` com o nome de cada variável e nenhum valor; o aluno cola
  os valores no `app/codigo/.env.local`, o arquivo de chaves que fica só neste
  computador (o backup barra todo arquivo `.env`, menos o `.env.example`). Chave
  colada no chat: avisar que ela vazou pro histórico e pedir pra gerar outra no
  painel do serviço.
- **Modo de teste primeiro.** Modo de teste é o ambiente do provedor de pagamento em
  que nada é cobrado de verdade: cartão de mentira, dinheiro de mentira. Tudo desta
  etapa roda nele. Cobrança real só na `/app-publicar`.
- **Gate em toda conta nova, todo gasto e todo envio pra fora.** Antes de pedir o
  "pode ir": mostrar o que vai acontecer, o custo com o id do fato e a data,
  passar pela `/segunda-opiniao` (dose rápida), esperar o "pode ir" naquele
  momento. Houve custo: uma linha no fim de `dados/custos.jsonl`, no formato
  `{"em":"<data e hora em UTC>","servico":"<serviço>","usd":<valor ou 0>,"brl":<valor em reais, se for em reais>,"contexto":"app <nome>, <pra quê>"}`.

## Fluxo

### 1. Ler o plano e montar a lista de contas

Ler `app/arquitetura.md` e listar o que o app precisa, na ordem: banco de dados e
login, pagamento, e-mail, armazenamento de arquivo (se o app recebe foto ou
documento), integrações (Google Agenda, WhatsApp, Bling, o que o plano tiver).
Mostrar ao aluno a lista de contas que ele vai criar, com o plano grátis de cada uma
e o que faz começar a cobrar, pelos ids do fatos.md (por exemplo
`app-supabase-free` pro banco e `app-resend-free` pro e-mail). Serviço sem linha no
fatos.md: conferir o preço na página oficial na hora, com a data, e acrescentar a
linha no fatos.md.

### 2. Criar cada conta (gate de conta)

Uma conta por vez. Pra cada uma:

1. Dizer pra que serve, o que é grátis e o que cobra (id do fato e data).
2. `/segunda-opiniao`, depois o "pode ir".
3. Guiar o cadastro clique a clique. O aluno cria, confirma o e-mail, copia a chave
   de teste e cola no `app/codigo/.env.local`. A IA confere só que a variável existe;
   o valor fica no arquivo.
4. Registrar na hora: linha em `_contexto/ferramentas.md`
   (`| <serviço> | ligado | <AAAA-MM-DD> | <pra quê>; chave no .env.local do app como <NOME_DA_VARIAVEL> |`)
   e o endereço do painel e a conta usada em `_contexto/infra.md`, seção "Servidor e
   banco". Conta que ficou pela metade entra como `pendente`.

### 3. Login

Login (ou autenticação) é o jeito de o app saber quem é quem.

- Cadastro com e-mail e confirmação, troca de senha esquecida. Link mágico (entrar
  por um link que chega no e-mail) e login com Google só se o estudo da
  `/app-estudar` mostrou que a referência tem. Login com Google usa o projeto de
  desenvolvedor do próprio aluno no Google Cloud (conta nova, passo 2).
- Sessão, o tempo em que a pessoa fica logada, guardada em cookie protegido (cookie
  é um bilhetinho que o navegador guarda; o protegido o código da página não
  consegue ler). Botão de sair de todos os aparelhos.
- Papéis (dono, administrador, membro) só se o estudo achou equipe na referência,
  com uma única função no código que responde "essa pessoa pode fazer isso com essa
  ficha?".
- Excluir conta apaga de verdade. É o caminho simples pra quando o cliente pede pra
  apagar os dados dele, e a App Store exige isso de app com cadastro
  (`app-apple-regras`, regra 5.1.1(v)) se um dia o app for pro celular.

### 4. Banco de dados

Banco de dados é o arquivo organizado onde o app guarda as fichas: clientes,
agendamentos, pedidos, pagamentos.

- Montar as tabelas pelas fichas do `app/arquitetura.md` com migrações. Migração é
  um arquivo que descreve uma mudança no banco (criar tabela, criar coluna) e roda
  por comando, de dentro de `app/codigo/`, pela ferramenta que o plano escolheu.
  Assim o banco de produção (o de verdade, que os clientes usam) nasce igual ao de
  teste. Depois da primeira migração,
  rodar `git status --short app/codigo` na raiz do projeto e conferir que o arquivo
  dela aparece; se não aparecer, o backup está deixando a migração de fora, e a
  pessoa precisa saber antes de seguir.
- Regra de acesso em toda tabela: um cliente só enxerga as próprias fichas. No
  Supabase isso se chama regra por linha (RLS); em outro banco, a função de
  permissão do passo 3 chamada em toda leitura e gravação. Testar com um segundo
  usuário de mentira: logado como ele, as fichas do primeiro voltam vazias.
- Dados de mentira realistas pra testar, com nome e telefone inventados.
- Backup do banco: conferir se o plano escolhido faz cópia sozinho. O grátis do
  Supabase fica sem backup automático e pausa depois de um tempo sem uso
  (`app-supabase-free`); dizer isso ao aluno e anotar em `app/servidor.md`.
- Horário guardado em UTC, o horário padrão do mundo, e mostrado no fuso do cliente.
  Dinheiro guardado em centavos, número inteiro, pra conta nunca arredondar errado.
- Mudança que apaga coluna ou tabela com dado dentro: gate. Mostrar o que some,
  `/segunda-opiniao`, "pode ir".

### 5. Pagamento em modo de teste

**Escolha do provedor.** Se o `app/arquitetura.md` ainda não tem o provedor, mostrar
as duas opções lado a lado, com a data de cada fato, e o aluno escolhe:

| ponto | Stripe | Mercado Pago |
|---|---|---|
| taxa por venda (cartão, Pix, boleto) | `app-stripe-taxas` | `app-mp-checkout` |
| assinatura todo mês | ver a página de preços do Stripe na hora | `app-mp-assinatura` |
| tarifa no reembolso | `app-stripe-reembolso` | `app-mp-reembolso` |
| cartões de teste | `app-stripe-teste` | `app-mp-teste` |

A célula sem id se confere na página oficial na hora, com a data, e vira linha nova
no fatos.md, como no passo 1. Pontos que mudam a escolha e que vale dizer: o Pix no Stripe depende de convite
(`app-stripe-taxas`); no Mercado Pago a assinatura que cobra sozinha todo mês só
funciona no cartão (`app-mp-assinatura`). A escolha vira linha em
`_memoria/decisoes.md` (`- AAAA-MM-DD, <origem>: pagamento pelo <provedor>. Por quê: <motivo>.`)
e também no `app/arquitetura.md`, na linha `Pagamento:` da seção Decisão do aluno, com a
data.

**Como liga.**

- O cliente paga na página de pagamento do próprio provedor (checkout hospedado) e
  troca ou cancela o plano no portal do cliente do provedor, quando ele tiver. O
  número do cartão fica só com o provedor, e o app guarda apenas a situação do
  pagamento. Se a
  hospedagem escolhida é a Cloudflare no plano grátis, ler antes com o aluno a regra
  de dado de cartão de `app-cloudflare-free`.
- Webhook é o aviso que o provedor manda pro servidor do app quando algo acontece:
  pagamento aprovado, assinatura mudou, assinatura cancelada, cobrança recusada. Os
  nomes exatos desses avisos mudam de provedor pra provedor e se conferem na
  documentação oficial dele na hora. Todo webhook:
  - confere a assinatura do aviso (prova de que veio mesmo do provedor);
  - guarda o número do aviso e ignora o repetido. O provedor reenvia quando acha que
    não chegou, e o mesmo aviso duas vezes dá o mesmo resultado de uma vez só (o
    nome técnico disso é idempotente): libera o acesso uma vez e registra o
    pagamento uma vez.
- Situação da assinatura (ativa, atrasada, cancelada) guardada no banco do app,
  atualizada só pelo webhook e lida pelo app. Quem decide se o cliente pagou é
  sempre esse registro do banco.
- Pra o aviso chegar no computador do aluno durante o teste, seguir o caminho que a
  documentação do provedor indica pra teste local, conferido na hora. Se esse caminho
  pede programa ou conta nova (um túnel que abre o computador pra internet, por
  exemplo), é conta nova: passo 2.
- Testar com os cartões de teste do provedor (`app-stripe-teste`, `app-mp-teste`):
  um que aprova, um que recusa, e
  conferir no banco que a situação mudou certo nos dois casos.

**Cancelar e se arrepender.** Cancelar fica a um clique, dentro do app. Pela lei: o site deixa cancelar pelo atendimento na internet
(`app-decreto-7962`, art. 4º, V) e deixa o cliente se arrepender pela mesma
ferramenta em que comprou (`app-decreto-7962`, art. 5º); na compra pela internet
ele tem 7 dias pra desistir com o dinheiro de volta (`app-cdc-49`). Dizer ao aluno
quanto da tarifa fica com o provedor quando ele devolve
(`app-stripe-reembolso`, `app-mp-reembolso`). A regra do SAC do Decreto 11.034 fica
de fora pra app comum (`app-decreto-11034`). Isto é informação pra decidir, sem
garantia de resultado jurídico; caso com dinheiro alto ou briga com outra empresa
vai pra um advogado.

### 6. E-mail automático e tarefas que rodam sozinhas

- E-mail transacional é o e-mail que o app manda sozinho: confirmação de cadastro,
  recibo, lembrete. Sai por um serviço próprio pra isso (o plano costuma indicar o
  Resend; limites em `app-resend-free`) e do domínio do aluno, o endereço do site
  dele (`seunegocio.com.br`). Ligar o domínio pede registros no DNS, a lista de
  endereços do domínio; se o aluno ainda não tem domínio, o e-mail de teste sai pelo
  endereço de teste do serviço e o domínio fica pra `/app-marca` e `/app-publicar`.
- Textos dos e-mails escritos do zero, na voz da marca do aluno.
- Enquanto testa, e-mail só pro próprio e-mail do aluno. Mandar pra qualquer outro
  endereço é envio pra fora: gate.
- SMS e WhatsApp automático cobram por mensagem: gate de gasto e de envio, com o
  preço conferido na página oficial na hora e a data.
- Tarefa que roda sozinha (lembrete do agendamento, resumo da semana, limpeza): com
  nova tentativa quando falha e registro do que falhou de vez, pra ninguém ficar sem
  lembrete calado.

### 7. Integrações

Pra cada integração da `app/funcoes.csv` (Google Agenda, WhatsApp, Bling, Mercado
Livre), anotar em `app/servidor.md`: a API oficial, a menor permissão que resolve (o
Google chama de escopo), o processo de aprovação do provedor e o limite de uso.
Login com Google que pede dado sensível, como a agenda, passa pela verificação do
Google antes de abrir pro público (`app-google-oauth`): começar cedo e escrever o
prazo em `app/servidor.md`. Cada integração é conta nova: passo 2.

### 8. Segurança e privacidade

Lista de conferência, copiada em `app/servidor.md` e marcada item a item:

- [ ] chave só no `.env.local`; o backup barra `.env`; nenhuma chave no código que
      vai pro navegador
- [ ] todo dado que chega no servidor é conferido lá (tamanho, formato, campo
      obrigatório), com uma biblioteca de validação como o zod
- [ ] permissão conferida em toda leitura e gravação, testada com o segundo usuário
- [ ] limite de tentativas (quantas vezes por minuto alguém pode tentar) no login,
      no cadastro e em tudo que manda e-mail ou SMS, pra robô não sair testando senha
      nem disparando mensagem
- [ ] webhook confere a assinatura
- [ ] envio de arquivo com limite de tamanho e de tipo, guardado num espaço separado
      do app (o armazenamento cobra acima da cota grátis: preço conferido na página
      oficial, com a data, e anotado na tabela de custo do `app/arquitetura.md`)
- [ ] nenhum dado de cliente em endereço de página nem em registro de erro
- [ ] `npm audit` rodado de dentro de `app/codigo/` (lista falha conhecida nas
      bibliotecas usadas) e o resultado anotado
- [ ] política de privacidade escrita, na régua da LGPD abaixo
- [ ] termos de uso escritos, com o preço, as condições da assinatura, os 7 dias pra
      desistir (`app-cdc-49`) e o cancelamento pela internet, pela mesma ferramenta da
      compra (`app-decreto-7962`)

**Régua da LGPD.** A política de privacidade diz pra que cada dado é usado e com
qual base legal, o motivo que a lei aceita pra usar aquele dado, como o
consentimento do cliente ou a entrega do que ele comprou (`app-lgpd`, arts. 7º e
9º), e lista cada operador, a empresa que
trata dado em nome do app: provedor de pagamento, serviço de e-mail, banco de dados,
hospedagem, ferramenta de medição de visita. Tem um canal de contato pro cliente;
negócio pequeno com esse canal fica dispensado de indicar encarregado (a pessoa
responsável por falar com o cliente e com o governo sobre dado pessoal), fora quando
o dado é de alto risco (`app-anpd-pequeno`). Aviso de cookie sem opção já marcada,
com o cliente escolhendo (`app-anpd-cookies`). O registro de acesso (data, hora e
endereço de internet de quem entrou) fica guardado pelo prazo de `app-marco-civil-15`.
A multa da LGPD está em `app-lgpd` (art. 52). Mesma ressalva do passo 5: informação
pra decidir, e caso grande vai pra um advogado.

### 9. Registrar e fechar

- `app/servidor.md`: contas criadas (sem chave), provedor de pagamento e por quê,
  integrações com permissão e prazo, situação do backup do banco, lista de
  segurança marcada, onde ficaram a política de privacidade e os termos de uso, o que
  ficou pendente.
- `app/codigo/.env.example` com todas as variáveis e nenhum valor.
- `app/funcoes.csv`: coluna `minha` atualizada nas funções que passaram a funcionar
  de verdade (`sim` ou `parcial`).
- `app/diario-construcao.md`: uma linha quando a etapa fecha (`servidor` na coluna
  da tela).

## Resumo no chat

Contas ligadas, provedor de pagamento escolhido, o que já funciona em modo de teste
(cadastro, login, pagamento aprovado e recusado, e-mail), itens da lista de
segurança ainda abertos, prazo de aprovação de integração se houver, e o custo
mensal que começa a contar quando o app passar do plano grátis (ids do fatos.md).
Esse processo fechou: pra economizar, a próxima etapa começa numa conversa nova.

Próxima etapa: `/app-testar`, que monta o plano de teste e os testes automáticos do
app.
