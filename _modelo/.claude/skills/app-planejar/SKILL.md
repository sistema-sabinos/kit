---
name: app-planejar
description: >
  Planeja como o seu app vai ser feito, a partir do mapa da /app-estudar: escolhe as
  ferramentas, a hospedagem e o pagamento com o custo mensal de cada uma conferido e
  datado, desenha o banco de dados e a lista de rotas e põe a construção em ordem,
  começando por um caminho inteiro funcionando. Nada é cobrado aqui; a escolha de
  hospedagem e pagamento fecha só com o "pode ir". Etapa 3 de 11 do pacote criar app. Use
  quando o usuário chamar /app-planejar, disser "planeja o meu app", "que ferramenta eu
  uso pro app", "quanto vai custar manter o app por mês", "Stripe ou Mercado Pago?",
  "onde eu hospedo o app", "monta o banco de dados do app", ou quando a /ler-avaliacoes
  terminar.
---

# /app-planejar, a planta do app antes da obra

## O que essa skill faz

Lê `app/mapa.md` e `app/funcoes.csv`, que a `/app-estudar` montou, e o
`app/consertos.md` da `/ler-avaliacoes` quando ele existir. Grava `app/arquitetura.md`, no molde do
`arquitetura.md` desta pasta. É a planta da obra: com que ferramentas o app vai ser feito,
quanto custa manter por mês, como o banco de dados guarda as coisas, quais rotas existem e em
que ordem construir.

Sem o mapa, parar e rodar a `/app-estudar` antes. Planejar pela lembrança do que um app faz é
o caminho mais curto pra esquecer metade das funções.

O tamanho que a `/app-estudar` deu no mapa (P, M, G ou GG) vale aqui também. Repetir o aviso
quando for G ou GG: app desse tamanho leva muitas sessões do plano Claude, e a ordem do Passo 6
existe pra ter algo funcionando cedo.

## Dependências

- `app/mapa.md` e `app/funcoes.csv` (da `/app-estudar`)
- `referencias/fatos.md` desta pasta: todo preço, limite e regra que aparece nesta skill sai
  de lá, pelo id
- `/segunda-opiniao` antes do "pode ir" do Passo 5

## Como usar os fatos

Preço, taxa, limite de plano grátis e regra de lei mudam sem aviso. Por isso esta skill nunca
escreve um valor de cabeça: cada um aparece pelo id da tabela de `referencias/fatos.md` (por
exemplo `app-vercel-pro`). Antes de mostrar qualquer valor ao aluno, abrir a linha e olhar o
`conferido_em`. Com mais de 60 dias, conferir de novo na fonte da linha (fonte oficial
primeiro, buscando em português e em inglês), atualizar a linha com a data de hoje e só então
mostrar. Valor que mudou também muda a recomendação: refazer a conta antes de seguir.

## Fluxo

### Passo 1. As ferramentas (a pilha)

Pilha é o conjunto de ferramentas com que o app é feito. Se o aluno já sabe usar alguma,
fica a dele. Senão, esta é a recomendação, porque cada parte é gerenciada por outra empresa
(ninguém precisa cuidar de servidor), tem documentação farta e começa sem custo com zero
cliente:

| parte | recomendação | por quê, em uma linha |
|---|---|---|
| site do app | Next.js com TypeScript | Next.js é a ferramenta que monta as telas e o servidor do site juntos; TypeScript é a linguagem, e ela avisa do erro antes de rodar |
| visual | Tailwind, com as cores da `/app-visual` | Tailwind escreve o visual direto na tela, sem arquivo de estilo à parte |
| componentes acessíveis | uma base aberta de botões, campos e janelas que funcione no teclado e no leitor de tela, anotada com o nome e a licença | evita refazer cada peça do zero e já nasce usável por quem não enxerga bem |
| banco de dados | Postgres no Supabase | banco de dados é onde o app guarda as fichas (cliente, pedido, horário); Postgres é o tipo de banco, e o Supabase entrega banco, login e arquivos numa conta só |
| leitura do banco | Drizzle | ORM é o tradutor entre o código e o banco; o Drizzle é leve e o aluno nem precisa escolher |
| login | Supabase Auth | login é a entrada com e-mail e senha ou com o Google; vem na mesma conta do banco |
| e-mail automático | Resend | e-mail transacional é o que o app manda sozinho (confirmação, senha nova) |
| arquivos | Supabase Storage | foto e documento que o cliente envia ficam na mesma conta |
| tarefa agendada | a da própria hospedagem | tarefa agendada (cron) é o que roda sozinho em hora marcada, como o lembrete do dia anterior |
| hospedagem | escolha do aluno no Passo 5 | hospedagem é o computador alugado onde o site fica no ar |
| pagamento | escolha do aluno no Passo 5 | quem cobra o cartão, o Pix e o boleto do cliente |
| celular | Expo, opcional e só depois do site no ar | Expo monta o app de Android e de iPhone a partir do mesmo código |

Uma base de dados só, um site só. O que se copia da referência é a lista de funções; a
montagem por dentro é escolha nossa, e a mais simples ganha.

Cada escolha vai pro `app/arquitetura.md` com a linha do porquê.

### Passo 2. O banco de dados (as fichas)

Transformar o modelo de dados do mapa (que fichas a referência guarda e como uma liga na
outra) em tabelas. Pra cada tabela:

- `id uuid primary key default gen_random_uuid()`: uuid é um código único sorteado pra cada
  ficha, que ninguém adivinha
- `criado_em` e `atualizado_em`
- uma coluna de dono (`usuario_id` ou `empresa_id`) em tudo que pertence a alguém
- ligação com outra tabela (chave estrangeira) com a regra do que acontece ao apagar decidida
  de propósito: apagar o salão apaga os horários dele, ou bloqueia a exclusão enquanto houver
  horário marcado
- índice (o sumário que deixa a busca rápida) em toda ligação e em toda coluna usada pra
  filtrar ou ordenar
- situação com lista fechada de valores (`check`), como `confirmado`, `cancelado`, `remarcado`
- hora sempre como `timestamptz` (o tipo de coluna que guarda data e hora com o fuso), guardada em UTC (o relógio de referência do mundo), e
  mostrada no fuso de quem vê
- dinheiro em centavos, número inteiro, com uma coluna de moeda (`BRL`)
- regra de acesso: no Supabase, a regra por linha (RLS, a trava que impede um cliente de ver o
  dado de outro); fora dele, uma checagem de permissão em cada leitura. Escrever qual.

Exemplo, pra uma agenda de salão:

```sql
create table agendamentos (
  id uuid primary key default gen_random_uuid(),
  servico_id uuid not null references servicos(id) on delete cascade,
  salao_id uuid not null references usuarios(id) on delete cascade,
  inicio_em timestamptz not null,
  fim_em timestamptz not null,
  cliente_nome text not null,
  cliente_email text not null,
  cliente_fuso text not null,
  situacao text not null default 'confirmado'
    check (situacao in ('confirmado','cancelado','remarcado')),
  respostas jsonb not null default '{}',
  criado_em timestamptz not null default now(),
  constraint duracao_positiva check (fim_em > inicio_em)
);
create index on agendamentos (salao_id, inicio_em);
```

Depois, as travas que o mapa achou. Dois clientes marcando o mesmo horário se resolve no
banco, com uma trava que recusa o segundo (índice único ou restrição de exclusão), porque a
tela sozinha deixa os dois passarem quando clicam juntos.

O SQL (a linguagem do banco) fica dentro do `app/arquitetura.md`, num bloco de código. A
`/app-construir` transforma ele no primeiro passo do banco dentro de `app/codigo/`.

### Passo 3. As rotas

Rota é cada endereço ou ação que o servidor do app atende ("salvar horário", "cancelar
agendamento"). Uma tabela por caminho do mapa (C01, C02...), com uma linha por rota:

`método e endereço | o que faz | quem pode chamar | o que recebe | o que devolve | caminho do mapa`

Mais os webhooks, que são os avisos que outro sistema manda pro app sozinho (o pagamento
aprovado chega assim), os que o app manda pra fora, e as tarefas agendadas com o horário de
cada uma.

Só API oficial e pública (API é a porta que um sistema abre pra outro conversar com ele), com
a chave da conta do próprio aluno. Chave é a senha que um sistema usa pra falar com outro; ela
mora no `.env` (o arquivo de senhas do projeto, que nunca vai pro backup). Endereço interno da
referência que aparece no navegador fica proibido, mesmo visível.

### Passo 4. As partes que mordem

Uma linha no `app/arquitetura.md` pra cada uma que valer pro app:

- **Fuso horário**: cliente em Manaus ou em Portugal vê outro horário; guardar em UTC e mostrar
  no fuso de quem vê.
- **Aviso repetido** (idempotência): o mesmo webhook pode chegar duas vezes e precisa cobrar uma
  vez só.
- **Corrida**: dois cliques ao mesmo tempo no mesmo horário; a trava do Passo 2 resolve.
- **Limite de chamadas**: todo serviço limita quantas vezes por minuto ou por dia o app pode
  chamar. Os da pilha estão em `app-resend-free`, `app-supabase-free` e `app-cloudflare-free`.
- **Banco que pausa**: ver `app-supabase-free` sobre pausa sem uso e backup.
- **Tamanho de arquivo**, busca, atualização ao vivo e uso sem internet, quando o app tiver.
- **Várias empresas no mesmo app** (multi-cliente): cada salão vê só os próprios dados; a regra
  de acesso do Passo 2 garante.
- **Dado pessoal** (LGPD, `app-lgpd`): o motivo legal de cada dado guardado, a política de
  privacidade dizendo o uso, e um encarregado de dados; empresa de pequeno porte que não trata
  dado de alto risco troca o encarregado por um canal de contato pro dono do dado
  (`app-anpd-pequeno`). O
  cliente que pede pra apagar a conta precisa de um caminho pra isso no app; no iPhone a Apple
  exige excluir a conta dentro do próprio app (`app-apple-regras`).
- **Registro de acesso** (`app-marco-civil-15`): uma tabela que guarda os acessos pelo prazo da
  lei, separada dos dados que o cliente pode mandar apagar.
- **Cancelar e se arrepender**: quem vende assinatura pela internet deixa o cliente cancelar
  pela internet e se arrepender pela mesma ferramenta da compra (`app-decreto-7962`), com o
  prazo e a devolução do `app-cdc-49`. As regras de SAC (o atendimento ao consumidor) do `app-decreto-11034` ficam fora pra app
  comum.
- **Aviso de cookie** (`app-anpd-cookies`), quando o site usar cookie que não é essencial.
- **Login com Google pedindo dado sensível** (agenda, Drive, e-mail): a verificação do Google
  demora (`app-google-oauth`); pôr no calendário desde já.

Isto é informação pra planejar, sem garantia de resultado jurídico. Caso com dinheiro alto ou
briga com outra empresa vai pra um advogado.

### Passo 5. Custo por mês, hospedagem e pagamento (decisão do aluno)

Aqui o aluno se compromete com gasto futuro. Nada é cobrado nesta etapa, e mesmo assim a
escolha só fecha com o "pode ir".

**Hospedagem.** Montar o comparativo das duas opções com o valor e a data de cada linha:

- **Cloudflare**: começa grátis com uso comercial liberado, com o limite diário e o erro de
  quando passa em `app-cloudflare-free`. Uma visita ao site faz várias requisições (cada pedido que o navegador manda ao servidor), então o
  limite chega antes do que parece. A mesma linha traz a regra do dado de cartão no plano
  grátis: mostrar ao aluno, e o pagamento deste pacote acontece na página do próprio Stripe ou
  Mercado Pago. O plano pago (`app-cloudflare-paid`) só entra se o aluno contratar. O
  caminho que a Cloudflare indica hoje pra rodar Next.js lá está em `app-cloudflare-nextjs`:
  escrever no `app/arquitetura.md` qual vale pro app.
- **Vercel Pro** (`app-vercel-pro`): a Vercel tem plano grátis, e a regra dele em
  `app-vercel-hobby` barra app que cobra do cliente; pra vender, é o Pro desde o primeiro
  cliente.
- Uma linha de "por que não" pros outros dois: Netlify (`app-netlify-free`) e Render
  (`app-render-free`) pausam ou fazem dormir o site no plano grátis.

**Pagamento.** O mesmo comparativo, Stripe contra Mercado Pago:

- Stripe: taxas em `app-stripe-taxas` (o Pix de lá depende de convite), e no reembolso a tarifa
  fica com eles (`app-stripe-reembolso`).
- Mercado Pago: taxas em `app-mp-checkout` (o cartão muda de taxa conforme o prazo pra receber),
  assinatura em `app-mp-assinatura` (cobrança automática só no cartão; Pix e boleto por link a
  cada parcela) e devolução pelo painel em `app-mp-reembolso`.
- Fazer a conta com o preço que o aluno pensa cobrar: quanto sobra de uma assinatura no cartão
  e no Pix em cada um. Se o cliente dele paga mais no Pix, isso pesa.

**A tabela de custo mensal.** Uma linha por serviço da pilha: plano grátis, o que faz começar a
cobrar, o preço quando cobra, o id e a data do fato. No fim, o total do mês com zero cliente e o
total quando passar dos limites grátis. Valor em dólar fica em dólar, com o aviso de que a
conversão segue o dólar do dia. Entra também o domínio próprio (`app-registro-br`), que a
`/app-marca` compra.

**Celular (opcional).** Só entra depois do site no ar. Deixar escrito o que vai custar quando
chegar a hora: conta da Apple (`app-apple-conta`), conta do Google (`app-google-conta`) e o
limite grátis do Expo (`app-expo-free`). Ninguém paga nada disso agora.

**O gate.** Com as tabelas prontas:

1. Passar a escolha pela `/segunda-opiniao` (dose completa, porque fecha gasto).
2. Mostrar ao aluno a pilha, o comparativo e o total do mês com as datas dos fatos, e
   perguntar: "Esta pilha custa isso com zero cliente e isso depois dos limites grátis. Fecho
   com <hospedagem> e <pagamento>, pode ir?"
3. Esperar o "pode ir" naquele momento. Sem ele, a escolha fica 'em aberto' na seção Decisão
   do aluno do `app/arquitetura.md`; visual e construção seguem com dado de mentira, a
   `/app-servidor` fecha o pagamento e a `/app-publicar` fecha a hospedagem.
4. Com o sim, gravar a escolha e a data no `app/arquitetura.md`.

Esta etapa não grava nada em `dados/custos.jsonl`, porque ninguém pagou nada. A linha nasce
na etapa que contrata ou paga de fato (`/app-servidor`, `/app-marca`, `/app-publicar`), no
momento do gasto.

### Passo 6. Ordem de construção

1. **Um caminho inteiro funcionando** (a fatia vertical): o essencial de ponta a ponta, feio
   mesmo. Criar conta, fazer a coisa principal, ver o resultado. Prova que a pilha funciona.
2. **As funções `obrigatoria`** do `funcoes.csv`, por área.
3. **As `importante`**, depois as `desejavel`.
4. **Os consertos** que a `/ler-avaliacoes` achou, do `app/consertos.md` (o que o cliente da
   referência odeia e pede).

Cada etapa lista as telas (T01, T02...) e os caminhos (C01, C02...) pelo código do mapa, as
tabelas e as rotas.

## Saída

`app/arquitetura.md` com tudo acima. No chat, só o resumo: a pilha em uma linha, a hospedagem e o
pagamento escolhidos (ou "em aberto"), o total do mês, o número de tabelas e de rotas contado no
arquivo, as três partes mais arriscadas e a próxima etapa: `/app-visual`.

## Regras

- Valor que muda (preço, taxa, limite, regra) só pelo id do `referencias/fatos.md`, com a data
  olhada antes.
- Código da referência fica fora: a Lei do Software (`app-lei-software`) protege o código escrito
  e libera refazer uma função parecida. Código com licença aberta (MIT, por exemplo) pode entrar
  cumprindo a condição da licença, como manter o aviso de autor.
- A ideia e o jeito de funcionar podem ser estudados livremente (`app-lei-ideia`).
- Uma base de dados, um site, sem dividir em vários serviços pequenos.
- Escolha de hospedagem e pagamento só com o "pode ir" do aluno naquele momento.

Próxima etapa: `/app-visual`, as cores, as letras e os componentes do app.
