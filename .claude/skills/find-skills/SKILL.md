---
name: find-skills
description: >
  Descobre skills prontas no ecossistema aberto (npx skills, skills.sh) que já
  resolvem parte de uma tarefa, em vez de criar tudo do zero. Use quando o
  usuário perguntar "como eu faço X", "existe uma skill pra X", "dá pra fazer
  X", quiser estender o que o sistema faz, ou quando outra skill do SabinOS
  precisar descobrir skills prontas antes de criar uma nova (o `/setup` e o
  `/novo-projeto` chamam esta aqui).
---

# find-skills, descobrir skills prontas

Política do SabinOS: skill encontrada não se instala às cegas. Ler o
conteúdo, aproveitar o que serve e gerar skill própria adaptada ao negócio do
usuário. Buscar em português e em inglês: o ecossistema de skills é
majoritariamente em inglês e limitar a busca ao português esconde as
melhores.

## Quando usar

- O usuário pergunta "como eu faço X" e X pode ser uma tarefa comum que já
  tem skill pronta
- O usuário diz "existe uma skill pra X" ou "tem algo pronto pra X"
- O usuário pergunta "dá pra fazer X" sobre uma capacidade especializada
- O usuário quer estender o que o sistema faz
- Outra skill do SabinOS (`/setup`, `/novo-projeto`, `/mapear`) precisa
  descobrir skills prontas antes de criar uma do zero

## O que é a Skills CLI

A Skills CLI (`npx skills`) é o gerenciador de pacotes do ecossistema aberto
de skills de agente. Skills são pacotes modulares que estendem a capacidade
do agente com conhecimento especializado, fluxo de trabalho e ferramentas
prontas.

Comandos principais:

- `npx skills find [termo]` busca skills, interativa ou por palavra-chave
- `npx skills add <pacote>` instala uma skill a partir do GitHub ou outra
  fonte
- `npx skills check` confere se há atualização das skills instaladas
- `npx skills update` atualiza todas as skills instaladas

Catálogo pra navegar: https://skills.sh/

## Mapa de fontes boas (curadoria SabinOS, 2026-09)

Onde procurar, na ordem que costuma render mais:

1. **skills.sh** é o único diretório com ranking de instalação REAL (abas Hot,
   Trending e All-Time). Começar sempre por lá.
2. **Repositórios oficiais no GitHub**, onde a qualidade já vem conferida pela
   dona da casa. Sempre olhar antes de criar algo parecido do zero:
   `anthropics/skills` (documento Word, Excel, PowerPoint e PDF, design de
   interface, criação de skill), `openai/skills`, `huggingface/skills`,
   `NVIDIA/skills` e `vercel-labs/agent-skills` (React, Next.js, design web).
3. **Listas curadas no GitHub:** buscar "awesome claude skills" (as do
   ComposioHQ e do travisvn são as maiores) e o catálogo
   `alirezarezvani/claude-skills` (380 skills de negócio, marketing, produto
   e finanças, funciona em vários agentes).
4. **skillsmp.com** é uma vitrine grande pra explorar por categoria, mas sem
   número de instalação por skill; usar como complemento, não como termômetro.
5. **Agregadores de outros agentes** (ClawHub, LobeHub, e o hub do Hermes
   Agent) juntam várias dessas fontes numa busca só. Servem pra descobrir o
   que existe quando as quatro acima não acharam nada. O formato `SKILL.md` é
   o mesmo padrão aberto, então a skill encontrada lá lê igual aqui.

Aviso de qualidade: número de estrelas ou instalação mostra popularidade, não
adequação ao negócio do usuário. A política de adaptar sempre (acima) vale
dobrado pra skill famosa: ler o conteúdo inteiro antes de aproveitar qualquer
parte.

## Como ajudar a encontrar

### Passo 1, entender a necessidade

Quando alguém pedir ajuda com algo, identificar:

1. O domínio (ex: React, testes, design, publicação de site)
2. A tarefa específica (ex: escrever teste, criar carrossel, revisar
   contrato)
3. Se é uma tarefa comum o bastante pra já existir skill pronta

### Passo 2, checar o ranking primeiro

Antes de rodar uma busca pela CLI, checar o ranking em https://skills.sh/ pra
ver se já existe skill conhecida pro domínio. O ranking ordena por total de
instalações, o que ajuda a achar direto as mais usadas e testadas.

Exemplo: pra desenvolvimento web, as skills mais instaladas hoje vêm de
`vercel-labs/agent-skills` (React, Next.js, design web) e `anthropics/skills`
(design de interface, processamento de documento), cada uma com mais de 100
mil instalações.

### Passo 3, buscar

Se o ranking não cobrir a necessidade, rodar a busca:

```bash
npx skills find [termo]
```

Exemplos:

- "como deixo meu app React mais rápido?" → `npx skills find react
  performance`
- "me ajuda a revisar pull request?" → `npx skills find pr review`
- "preciso criar um changelog" → `npx skills find changelog`

Buscar sempre nos dois idiomas quando o termo em português não trouxer nada
bom: o ecossistema é majoritariamente em inglês, então "revisão de anúncio" e
"ad review" podem trazer resultados bem diferentes.

### Passo 4, verificar qualidade antes de recomendar

Nunca recomendar uma skill só pelo resultado da busca. Sempre conferir:

1. **Número de instalações**, preferir skill com mais de 1.000 instalações,
   ter cautela com qualquer coisa abaixo de 100
2. **Reputação da fonte**, fontes oficiais (`vercel-labs`, `anthropics`,
   `microsoft`) são mais confiáveis que autor desconhecido
3. **Estrelas no GitHub**, conferir o repositório de origem: skill de
   repositório com menos de 100 estrelas merece desconfiança
4. **O que ela executa**, ler o `SKILL.md` inteiro e todo arquivo dentro de
   `scripts/` antes de aproveitar qualquer linha. Bandeira vermelha: comando
   que baixa e executa direto (`curl ... | bash`), chave de API escrita dentro
   do arquivo, leitura de `~/.ssh`, `~/.aws` ou `.env`, escrita fora da pasta
   do projeto, e endereço de rede que não dá pra explicar. Achando qualquer
   uma, contar ao usuário o que apareceu e não aproveitar aquele pedaço.
   Skill popular não é skill auditada: o ecossistema aberto não tem curadoria
   de segurança, e o que vem de lá roda com as mesmas permissões que você

### Passo 5, apresentar as opções

Ao achar skills relevantes, mostrar pro usuário:

1. Nome da skill e o que ela faz
2. Número de instalações e a fonte
3. O comando de instalação
4. Um link pra saber mais em skills.sh

Exemplo de resposta:

```
Achei uma skill que pode ajudar. A "react-best-practices" traz boas práticas
de performance de React e Next.js direto da equipe da Vercel (185 mil
instalações).

Pra instalar:
npx skills add vercel-labs/agent-skills@react-best-practices

Mais detalhes: https://skills.sh/vercel-labs/agent-skills/react-best-practices
```

### Passo 6, buscar o conteúdo pra ler e adaptar (nunca instalar crua)

No SabinOS a skill de terceiro nunca é ativada do jeito que veio: o comando
abaixo serve só como fonte pra LER o conteúdo do pacote, não como passo final.
Ele é o mesmo comando de instalação de verdade, deixado aqui pra quem já
manja e prefere buscar sozinho:

```bash
npx skills add <dono/repo@skill> -g -y
```

A flag `-g` traz pro nível global (do usuário) e `-y` pula a confirmação.
Depois disso, aplicar a política do topo desta skill: ler o conteúdo baixado,
aproveitar só o que serve e gerar uma skill própria adaptada ao negócio do
usuário, dentro do projeto dele.

## Categorias comuns de busca

| Categoria       | Exemplos de termo                         |
| --------------- | ------------------------------------------ |
| Desenvolvimento | react, nextjs, typescript, css, tailwind    |
| Testes          | testing, jest, playwright, e2e              |
| Infraestrutura  | deploy, docker, kubernetes, ci-cd           |
| Documentação    | docs, readme, changelog, api-docs           |
| Qualidade       | review, lint, refactor, best-practices      |
| Design          | ui, ux, design-system, accessibility        |
| Produtividade   | workflow, automation, git                   |

## Dicas de busca

1. Usar palavra-chave específica: "react testing" funciona melhor que só
   "testing"
2. Tentar termo alternativo: se "deploy" não achar nada, tentar "deployment"
   ou "ci-cd"
3. Prestar atenção nas fontes populares: muita skill boa vem de
   `vercel-labs/agent-skills` ou `ComposioHQ/awesome-claude-skills`

## Quando não achar nada

Se não existir skill relevante:

1. Falar claramente que a busca não achou nada
2. Oferecer ajudar com a tarefa direto, usando a capacidade geral do agente
3. Sugerir criar uma skill própria com `npx skills init` ou pela skill
   `/mapear`, que existe dentro da pasta de cada projeto do SabinOS

Exemplo:

```
Busquei skill pronta pra isso e não achei nada. Posso te ajudar com a tarefa
direto agora mesmo. Quer que eu siga?

Se isso for algo que você vai repetir, dá pra criar uma skill sua:
npx skills init minha-skill
```
