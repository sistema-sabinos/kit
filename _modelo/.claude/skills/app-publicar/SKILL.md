---
name: app-publicar
description: >
  Coloca o app no ar com o seu nome: checagem que barra (testes, funções obrigatórias,
  marca da referência varrida, ficha de loja, páginas legais), banco e chaves de produção,
  hospedagem (Cloudflare ou Vercel Pro), domínio, cobrança real e, se tiver, App Store e
  Google Play. Tudo que gasta ou publica espera o "pode ir". Use quando o usuário chamar
  /app-publicar, disser "publica o app", "coloca no ar", "sobe o app", "liga meu
  domínio", "manda pra produção", "põe na App Store", ou depois da /app-lancar.
---

# /app-publicar, o app no ar com o seu nome

## O que essa skill faz

Publicar quer dizer colocar o app na internet pra cliente de verdade usar. É a
última etapa do pacote e a que mais gasta e mais expõe, por isso anda em
passos curtos, cada um parado no "pode ir". Primeiro roda a checagem que barra
(qualquer falha para tudo); depois prepara a produção (a versão real do app,
com cliente e dinheiro de verdade), a hospedagem (o serviço que deixa o app
ligado na internet 24 horas), o domínio (o endereço, tipo `seuapp.com.br`), o
monitoramento e, se o plano previu, o app de celular nas lojas.

Lê tudo de `app/` e grava `app/publicacao.md`, que é o `checagem.md` desta
pasta preenchido.

## Dependências

- `app/` com o trabalho das etapas anteriores: `app/funcoes.csv` (a lista de
  funções, da `/app-estudar`, marcada pela `/app-construir` e pela `/app-servidor`),
  `app/defeitos.md` (da `/app-testar`), `app/marca.json` (da
  `/app-marca`), a ficha da loja `app/ficha.json` (da `/app-lancar`) se for pra celular, e o
  código em `app/codigo/`
- `.claude/skills/app-planejar/referencias/fatos.md`: todo preço, taxa,
  limite e regra desta skill sai de lá, pelo id
- `.claude/skills/app-publicar/checagem.md`: o modelo do `app/publicacao.md`

## As regras

- **Nada vai pro ar sem o "pode ir".** Mostrar o resultado da checagem, o que
  vai acontecer e quanto custa, e esperar a resposta naquele momento, mesmo que
  um passo parecido já tenha sido aprovado antes.
- **Quem compra e faz login é o aluno.** O Claude nunca compra domínio, nunca
  digita cartão, senha ou chave real. Ele escreve os registros, os nomes das
  chaves e os comandos; o aluno faz os passos de conta.
- **Sem marca própria, nada sai.** A varredura de restos da referência tem que
  sair limpa. Sem exceção.
- **Valor que muda se confere antes.** Antes de dizer qualquer preço, taxa,
  limite ou regra ao aluno, achar a linha no `fatos.md` pelo id e olhar o
  `conferido_em`. Mais de 60 dias: abrir a fonte da linha hoje, atualizar fato
  e data no `fatos.md` e só então falar.

### Como funciona cada gate

Gate é o ponto em que a skill para e pede autorização. Todo passo marcado
**(gasta)**, **(publica)** ou **(conta)** segue esta ordem:

1. Mostrar o que vai acontecer, o custo pelo id do `fatos.md` e a data em que o
   valor foi conferido.
2. Passar a proposta pela `/segunda-opiniao`.
3. Esperar o "pode ir" do aluno naquele momento.
4. Quando há custo, acrescentar uma linha no fim de `dados/custos.jsonl`
   (criar o arquivo se não existir), uma linha por gasto, sem editar as antigas:
   ```
   {"em":"2026-10-07T14:30:00.000Z","servico":"vercel pro","usd":20,"contexto":"app <nome>, mensal, app-vercel-pro"}
   ```
   `em` é a data e hora em UTC, `usd` é número com ponto (o valor sai do id
   do `fatos.md`, que vai no fim do `contexto`). Gasto cobrado em
   reais vai com `"usd":0` e o valor em `"brl"`, porque converter dependeria do
   câmbio do dia.
5. Conta nova (hospedagem, banco, e-mail, loja) vira linha em
   `_contexto/ferramentas.md`: `| <serviço> | ligado | <AAAA-MM-DD> | app <nome>; <pra quê> |`.

## Fluxo

### 1. Checagem que barra

Copiar o `checagem.md` pra `app/publicacao.md` e rodar cada item, colando o
resultado lá. Os comandos do app rodam de dentro de `app/codigo/`, com o
servidor local ligado como na `/app-testar`:

```bash
npx playwright test     # testes automáticos da /app-testar: todos verdes
npm run build           # monta a versão de produção; tem que passar sem erro
```

Os do kit rodam da raiz do projeto (a pasta que tem o `app/` e o `.claude/`):

```bash
node .claude/skills/app-comparar/scripts/paridade.mjs app/funcoes.csv --exigir-obrigatorias
node .claude/skills/app-marca/scripts/varrer-marca.mjs app/codigo --config app/marca.json
node .claude/skills/app-lancar/scripts/ficha-loja.mjs app/ficha.json   # só se for pras lojas
```

O que cada um prova:

- **Testes:** o app faz o caminho principal sem quebrar.
- **Montagem de produção (build):** o código vira a versão que vai pro ar sem
  erro. Falhou aqui, falha na hospedagem também.
- **Paridade:** paridade é o quanto o seu app já faz das funções da referência.
  Toda função marcada como obrigatória precisa estar feita. Com
  `--exigir-obrigatorias`, o script sai com código 1 quando falta alguma
  obrigatória e com código 0 quando estão todas feitas: o código de saída é o
  que barra. Conferir também no texto a linha `obrigatorias N de N prontas` com
  os dois números iguais e a frase do veredito sem "Ainda nao da pra lancar".
- **Varredura de marca:** sai com código 0 e a palavra "Limpo". Nome, domínio
  ou cor da referência que sobrou no código é risco de marca e de concorrência
  desleal (`app-lpi-195`, `app-trade-dress`).
- **Ficha da loja:** sai com código 0. Só pra quem vai pro celular.

À mão, conferir e marcar:

- nenhum defeito aberto de gravidade 1 ou 2 (trava tudo ou quebra uma função)
  no `app/defeitos.md` da `/app-testar`;
- política de privacidade em português no ar antes do primeiro cadastro real,
  dizendo que dado guarda, pra quê, com qual base legal e com quem divide (cada
  serviço que recebe dado do cliente, como hospedagem, banco, e-mail e
  pagamento), e um canal de contato pro titular (`app-lgpd`,
  `app-anpd-pequeno`);
- termos de uso em português no ar, com o preço, as condições, o direito de
  desistir em 7 dias com o dinheiro de volta e o cancelamento pela internet,
  pela mesma ferramenta usada pra assinar (`app-cdc-49`, `app-decreto-7962`);
- aviso de cookie, se o app usa cookie que não é essencial (contador de visita,
  anúncio): nenhuma opção já marcada e nada de aceite por silêncio
  (`app-anpd-cookies`);
- excluir a conta funciona, de dentro do app;
- o app guarda o registro de acesso (quem entrou, quando, de qual endereço) por
  6 meses (`app-marco-civil-15`); a `/app-servidor` deixou isso pronto ou fica
  como defeito;
- ícone da aba (favicon), títulos das páginas, imagem de compartilhamento,
  e-mails e ícone do app são seus.

Qualquer item que falhou para a publicação. Dizer qual, por quê e qual etapa
conserta (`/app-construir`, `/app-testar`, `/app-marca`). Tudo verde: mostrar o
`app/publicacao.md` ao aluno e seguir pro passo 2.

### 2. Escolher a hospedagem

A `/app-planejar` já comparou; aqui se confirma, com os valores conferidos:

| | Cloudflare | Vercel Pro |
|---|---|---|
| preço | grátis até o limite (`app-cloudflare-free`); plano pago só se o aluno contratar (`app-cloudflare-paid`) | mensal (`app-vercel-pro`) |
| uso comercial | liberado no grátis | o Hobby, grátis, é só pra uso pessoal; app que cobra precisa do Pro (`app-vercel-hobby`) |
| cartão | o plano grátis proíbe o site de receber ou guardar número de cartão (seção 2.2.1(h), `app-cloudflare-free`) | sem essa regra |
| limite | requisições por dia (`app-cloudflare-free`): uma visita faz várias, e passou do limite o site dá erro até o dia seguinte, sem trocar de plano sozinho | o do plano Pro |

Regra do cartão na Cloudflare grátis: a cobrança acontece na página de
pagamento do Stripe ou do Mercado Pago, e o cliente sai do seu site pra digitar
o cartão. App que precisa de campo de cartão dentro dele vai pro plano pago. Na
dúvida, ler a seção 2.2.1(h) dos termos na fonte do id.

Netlify e Render ficam de fora pra app que cobra: o Netlify grátis pausa todos
os projetos quando os créditos acabam (`app-netlify-free`) e o Render grátis
dorme sem acesso e a própria documentação pede pra não usar em produção
(`app-render-free`).

Vercel Pro é **(gasta)**: gate com o valor mensal. Criar a conta na hospedagem
é **(conta)**: o aluno cria, o Claude guia clique a clique.

### 3. Serviços de produção

- **Banco de dados** (onde o app guarda cadastro, pedido e tudo mais): um
  projeto só pra produção, separado do que serviu aos testes. No Supabase
  grátis, o projeto pausa depois de 1 semana sem uso e fica sem backup
  automático (`app-supabase-free`): pra cliente pagando, mostrar o plano pago
  com o preço da página do Supabase conferido no dia. Criar o projeto é
  **(conta)**; plano pago é **(gasta)**. A mudança de estrutura do banco
  (migração) roda pelo comando de publicação, registrada no código, pra
  produção e teste ficarem iguais.
- **Chaves de produção** (variáveis de ambiente, os valores secretos que o app
  lê pra falar com banco, e-mail e pagamento): o aluno digita no painel da
  hospedagem, com os mesmos nomes do `app/codigo/.env.example`. A chave real
  mora só lá; o `.env` do computador continua com as de teste e fica fora do
  backup.
- **Pagamento no modo real** **(conta)** (até aqui tudo rodou no modo de teste, com cartão
  de mentira): trocar pelas chaves reais, recriar produtos e preços no modo
  real e cadastrar o endereço do webhook de produção. Webhook é o aviso
  automático que o Stripe ou o Mercado Pago manda pro app quando um pagamento
  acontece; ele vem com uma assinatura secreta que o app confere.
- **Compra real de teste** **(gasta)**: uma compra com o cartão do próprio
  aluno, depois devolvida. Antes do "pode ir", dizer quanto não volta:
  - Stripe: a tarifa da cobrança fica com o Stripe no reembolso
    (`app-stripe-reembolso`). Fazer a conta com o preço do plano mais barato e
    a taxa de `app-stripe-taxas`.
  - Mercado Pago: devolvendo pelo painel, a tarifa não é cobrada
    (`app-mp-reembolso`). Devolver sempre pelo painel.
- **Login com Google** **(conta)** (se o app usa): incluir o domínio de produção nos
  endereços de retorno do login (redirect URI, a página pra onde o Google
  devolve a pessoa depois de entrar). Se o app pede dado sensível da conta
  Google, a verificação do Google precisa estar aprovada, senão só usuário de
  teste entra; planejar o prazo de `app-google-oauth`. Mandar o pedido de
  verificação pro Google é **(publica)**.
- **E-mail automático** **(conta)** (confirmação de cadastro, recibo, troca de senha):
  domínio de envio verificado no provedor. No Resend grátis, o limite por mês
  e por dia está em `app-resend-free`.

### 4. Publicar e ligar o domínio

**Publicar o site** **(publica)**. O código vai pra hospedagem pela linha de
comando dela, de dentro de `app/codigo/`, sem ligar o repositório do negócio à
hospedagem (ele guarda o resto da empresa). O aluno faz o login da linha de
comando no navegador; o comando de publicar é o que a documentação da
hospedagem manda hoje (Cloudflare: `wrangler`; Vercel: `vercel --prod`),
conferido lá antes de rodar. Next.js na Cloudflare segue o caminho de
`app-cloudflare-nextjs`, o mesmo que o `app/arquitetura.md` registrou. A primeira publicação sai num endereço provisório
da hospedagem: fazer o caminho principal nele antes de ligar o domínio.

**Domínio** **(gasta)**. O aluno compra num registrador (a empresa que vende o
endereço). `.com.br` no registro.br: `app-registro-br`. Antes de comprar, a
`/app-marca` já conferiu o nome no INPI. Depois da compra, apontar o domínio
pra hospedagem pelo DNS (a lista que diz pra internet onde o seu endereço
mora) **(conta)**. Os valores saem sempre do painel da hospedagem:

| tipo | nome | valor |
|---|---|---|
| A (aponta pra um número de servidor) | @ (o endereço raiz, `seuapp.com.br`) | o que o painel da hospedagem mostrar |
| CNAME (aponta pra outro nome) | www | o alvo que o painel da hospedagem mostrar |
| TXT (texto de verificação) | @ ou o que o painel pedir | o valor de verificação, se pedir |

**DNS do e-mail** **(conta)**, com os valores que o provedor de e-mail mostrar:
SPF (TXT que diz quem pode mandar e-mail pelo seu domínio), DKIM (a assinatura
que prova que o e-mail é seu) e DMARC (a regra pro que falha), começando em
`v=DMARC1; p=none; rua=mailto:voce@seuapp.com.br` e apertando pra
`p=quarantine` quando os relatórios vierem limpos (`p=none` só observa e manda
o relatório pro endereço do `rua`; `p=quarantine` pede pra mandar pro spam o
e-mail que falhar). Sem os três, o e-mail de confirmação tende a cair no spam.

Escolher um endereço oficial (com ou sem `www`) e fazer o outro redirecionar
pra ele. Conferir que o cadeado (HTTPS, a conexão protegida) aparece nos dois.

### 5. Vigiar

- Monitor de erro (o da hospedagem ou o Sentry, um serviço que junta os erros
  do app num painel): avisa quando o app quebra
  na mão de um cliente.
- Monitor de queda (uptime): abre a página inicial e o caminho principal de
  tempos em tempos e avisa se sair do ar. Na Cloudflare grátis, ele também
  mostra quando o limite do dia estoura.
- Registros do servidor (logs) guardados e alerta indo pro e-mail ou celular
  do aluno.
- Conta nova num serviço desses (Sentry, monitor de queda) é **(conta)**.
  Plano pago de qualquer um, acima da cota grátis, é **(gasta)**, com o preço
  da página oficial conferido no dia.

Depois o aluno faz o caminho principal no site real, no computador e no
celular dele, e marca no `app/publicacao.md`.

### 6. Celular (opcional, depois do site no ar)

Só quando a `/app-planejar` previu app de celular e a `/app-construir` montou a
versão pelo Expo (a ferramenta que transforma o app em instalável de Android e
iPhone).

- **Contas de desenvolvedor** **(gasta)** **(conta)**, no nome do aluno:
  Apple (`app-apple-conta`, cobrada em reais na inscrição, com o valor que
  aparecer na tela) e Google Play (`app-google-conta`).
- **Montar e enviar** **(publica)**: o comando de montar do Expo (`eas build`)
  e o de enviar (`eas submit`), conferidos na documentação do Expo. O plano
  grátis tem limite de montagens por mês (`app-expo-free`). Primeiro pro teste
  fechado: TestFlight na Apple e teste interno no Google Play.
- **Revisão da loja** **(publica)**: com a ficha da `/app-lancar` aprovada pelo
  `ficha-loja.mjs`. A Apple recusa cópia de outro app ou uso do nome e do ícone
  dele e exige excluir a conta dentro do app (`app-apple-regras`); o Google
  recusa app que se passa por outro app ou empresa (`app-google-imitacao`) e
  barra título, ícone e nome do desenvolvedor fora da regra de texto dele
  (`app-google-metadados`).

## Saída

`app/publicacao.md` com cada item da checagem e o resultado, o endereço no ar,
os registros de DNS feitos, os gastos aprovados com data e o que vigiar na
primeira semana: erros, quedas, limite da hospedagem, e-mail caindo no spam e
os primeiros pedidos de cancelamento.

No chat, só o resumo: no ar ou não, o endereço, o que falta e quanto foi gasto.

## Depois

Esta é a última etapa do pacote: o app está no ar com o seu nome. Mudança nova
volta pela `/app-construir` e pela `/app-testar` e passa de novo pela checagem
do passo 1 antes de cada publicação. Com os primeiros clientes, a
`/ler-avaliacoes` lê o que eles dizem do seu app.

## Regras

- Checagem com falha para tudo. Nada de "publica e conserta depois".
- O Claude nunca compra, nunca digita cartão, senha ou chave real.
- Todo gate passa pela `/segunda-opiniao` e espera o "pode ir" na hora.
- Valor sempre pelo id do `fatos.md`, conferido se passou de 60 dias.
- A régua legal aqui é informação pra decidir, sem garantia de resultado
  jurídico. Caso com dinheiro alto ou briga com outra empresa vai pra um
  advogado.
