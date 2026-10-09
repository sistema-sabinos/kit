---
name: app-marca
description: >
  Dá ao app um nome e uma cara que são do aluno: 20 nomes cortados pra 5, busca de cada um
  no INPI, no registro.br, nas lojas de app e nas redes, paleta nova com contraste checado,
  pedido de logo, voz da marca e a varredura que acha no código qualquer resto do app de
  referência. Etapa 9 de 11 do pacote criar app; domínio, taxa do INPI e logo pago só com o
  "pode ir". Use quando o usuário chamar /app-marca, disser "dá um nome pro meu app", "troca
  a marca do app", "quero que o app fique com a minha cara", "escolhe nome e cores", "como
  peço o logo", "qual a voz do app", "sobrou alguma coisa do outro app?", "registra a marca
  no INPI", "compra o domínio do app", ou depois da /app-comparar.
---

# /app-marca, o app com o seu nome

## O que essa skill faz

Até aqui o app foi construído olhando um app de referência. Esta etapa troca tudo que
lembra o outro pelo que é do aluno: o nome, as cores, o logo, o jeito de falar e cada texto
que o cliente vê. No fim, roda uma varredura no código (uma busca automática, arquivo por
arquivo) que acha qualquer nome, endereço ou cor da referência que sobrou. Nada vai pro ar
com a identidade do outro.

Lê o `app/consertos.md` da `/ler-avaliacoes`, quando existe, pra saber o diferencial (o
ângulo: o que o cliente da referência odeia e o seu app resolve). Grava `app/marca.md` (nome com as
buscas, paleta, pedido de logo e voz) e `app/marca.json`, a lista do que a varredura procura:

```json
{
  "evitar": ["Agenda Fácil", "Agenda Fácil Tecnologia"],
  "dominios": ["agendafacil.com.br"],
  "cores": ["#2f5bea", "#0ae8f0"]
}
```

`evitar` são o nome da referência e o da empresa dela; `dominios`, os endereços de site
dela; `cores`, as cores da marca dela, em código hexadecimal (o `#` com 6 letras e números
que identifica uma cor). A `/app-lancar` e a `/app-publicar` usam o mesmo arquivo.

## Dependências

- `app/codigo/` com o app montado (`/app-construir`) e `app/visual/tokens.json`
  (`/app-visual`), o arquivo com as cores e letras que todas as telas usam
- `app/mapa.md` (`/app-estudar`), com o nome e o site da referência, e `app/prints/`, com
  as capturas dela
- `.claude/skills/app-planejar/referencias/fatos.md`: todo preço, taxa, prazo e regra
  desta skill sai de lá, pelo id
- `marca/` do projeto (`design-guide.md` e `tom-de-voz.md`), quando existe

## As regras

- **Nada gasta sem o "pode ir".** Domínio, taxa do INPI, advogado e logo pago passam pelo
  gate abaixo, cada um na hora, mesmo que outro gasto já tenha sido aprovado.
- **Quem compra e cria conta é o aluno.** O Claude nunca digita cartão, senha nem dado
  pessoal num site; ele mostra onde clicar e o que preencher.
- **Busca que ninguém rodou fica "a rodar".** "Livre" só aparece com o resultado e a data da
  busca do lado.
- **Valor que muda se confere antes.** Antes de dizer preço, taxa, prazo ou regra ao aluno,
  achar a linha no `fatos.md` pelo id e olhar o `conferido_em`. Mais de 60 dias: abrir a
  fonte da linha hoje, atualizar fato e data no `fatos.md` e só então falar.
- **Informação pra decidir, sem garantia de resultado jurídico.** As buscas desta skill
  são uma triagem. O registro de verdade passa pelo INPI e, se tiver dinheiro em jogo,
  por um advogado de marcas.

### Como funciona cada gate

Gate é o ponto em que a skill para e pede autorização. Todo passo marcado **(gasta)** ou
**(conta)** segue esta ordem:

1. Mostrar o que vai acontecer, o custo pelo id do `fatos.md` e a data em que o valor foi
   conferido.
2. Passar a proposta pela `/segunda-opiniao`.
3. Esperar o "pode ir" do aluno naquele momento.
4. Quando há custo, acrescentar uma linha no fim de `dados/custos.jsonl` (criar o arquivo
   se não existir), uma linha por gasto, sem editar as antigas:
   ```
   {"em":"2026-10-07T14:30:00.000Z","servico":"registro.br","usd":0,"brl":40,"contexto":"app <nome>, dominio .com.br, 1 ano"}
   ```
   `em` é a data e hora em UTC (o horário universal, 3 horas à frente de Brasília); gasto em reais vai com `"usd":0` e o valor em `"brl"`,
   porque converter dependeria do câmbio do dia.

## Fluxo

### Passo 0. Marca nova ou a do negócio

Se o projeto já tem `marca/design-guide.md` ou `marca/tom-de-voz.md`, perguntar: "O app vai
usar a mesma marca do seu negócio ou ganha nome próprio?"

- **Mesma marca:** pular o Passo 1 e o 2 se o nome já foi buscado no INPI (perguntar), usar
  as cores e a voz de `marca/`, e seguir pro Passo 3 só pra checar o contraste.
- **Nome próprio:** seguir todos os passos. A voz e a paleta do app ficam em
  `app/marca.md`; os arquivos de `marca/` do negócio continuam como estão. Projeto sem
  `marca/` nenhuma: perguntar se a marca do app vira a marca do projeto e, com o sim,
  escrever `marca/design-guide.md` e `marca/tom-de-voz.md` também.

### Passo 1. O nome

Ler o diferencial no ângulo do `app/consertos.md`. Gerar 20 nomes em 5 estilos, 4 de
cada: descritivo (diz o que faz, tipo AgendaSalão), composto (duas palavras coladas, tipo
HoraCerta), inventado (palavra nova, tipo Zuvi), imagem (uma coisa que lembra a ideia, tipo
Farol) e verbo (Agende). Cortar pra 5 com três filtros:

1. **Distância da referência.** Nada que lembre o nome do app de referência no som, na
   escrita ou no sentido, e nada parecido com outro app da mesma área. Sem trocadilho com
   o nome dele e sem a versão com uma letra trocada. Nome parecido com marca de
   outro corre risco de ser negado no INPI, e reproduzir ou imitar marca registrada tem pena na lei (`app-lpi-189-190`).
2. **Fácil.** Curto, que a pessoa escreve certo depois de ouvir uma vez, e sem sentido feio
   em português, inglês ou espanhol.
3. **Ligado ao diferencial.** O nome diz alguma coisa do que o app resolve, ou pelo menos
   combina com isso.

Mostrar os 5 ao aluno com uma linha de motivo cada.

### Passo 2. As buscas de cada nome

Pra cada um dos 5, uma tabela com uma linha por busca. Cada linha fica **a rodar** ou com o
resultado e a data em que rodou.

| busca | onde |
|---|---|
| marca no Brasil | INPI, pela busca pePI (`app-inpi-busca`), nas classes do app (`app-inpi-classes`) |
| marca no mundo | WIPO Global Brand Database, a base mundial de marcas |
| domínio `.com.br` | busca do registro.br |
| domínio `.com` | busca de qualquer registrador (a empresa que vende o endereço) |
| lojas de app | o nome exato na App Store e no Google Play |
| perfis nas redes | o @ no Instagram, TikTok, YouTube e X |
| internet | "nome + o que o app faz" no Google |

Marca é o nome registrado no INPI, que dá ao dono o direito de usar aquele nome naquele ramo.
Classe é o ramo em que a marca vale: o INPI separa por número, e o `app-inpi-classes` diz
quais servem pra app. A busca no pePI é feita pelo aluno, no navegador, com o Claude dizendo
o que digitar e lendo o resultado com ele. Marca igual ou parecida na mesma classe tira o
nome da lista. USPTO (Estados Unidos) e EUIPO (Europa) só entram se o aluno for vender fora
do Brasil.

O registro, quando o INPI concede, protege o nome naquela classe; a ideia do app, o método e o plano de negócio ficam
livres pra qualquer um usar, com ou sem registro (`app-lei-ideia`).

O aluno escolhe 1 dos 5. Grava no `app/marca.md` o nome, as 7 buscas com data e o motivo.

**Domínio** **(gasta)**. Domínio é o endereço do app na internet, tipo `seuapp.com.br`.
`.com.br` no registro.br: `app-registro-br`. `.com` ou outro final não tem linha no
`fatos.md`: o custo é o que o registrador mostrar no carrinho, conferido no dia. O aluno compra no site do registrador, no nome
dele. Comprar agora segura o endereço; a `/app-publicar` liga ele ao app depois. Depois da
compra aprovada, gravar no `app/marca.md` a linha `Domínio: <endereço>, comprado em
<AAAA-MM-DD> no <registrador>`, que a `/app-publicar` lê pra não comprar de novo.

**Perfis nas redes** **(conta)**. Criar o @ nas redes que o aluno vai usar, pra ninguém pegar
antes. O aluno cria; o Claude sugere o @ e a bio curta.

**Pedido no INPI** **(gasta)**, opcional e recomendado antes de gastar em divulgação. Taxa
por classe em `app-inpi-taxa` (MEI e ME pagam menos, a mesma linha diz quanto) e o prazo
pra decisão em `app-inpi-prazo`. O aluno faz o pedido no site do INPI, com o cadastro
dele. Advogado de marcas **(gasta)** entra quando tem dinheiro em jogo ou quando a busca
achou nome parecido.

### Passo 3. A paleta

Paleta é o conjunto de cores do app. A nova entra nos mesmos papéis que a `/app-visual`
criou no `app/visual/tokens.json` (fundo, texto, destaque e os outros): os nomes ficam, os
valores mudam.

A cor principal sai de outra família: referência azul pede verde, laranja, roxo ou outra
longe do azul, e um azul vizinho conta como a mesma família. Cor e visual do conjunto
parecidos a ponto de confundir o cliente podem ser concorrência desleal, mesmo sem marca
registrada (`app-lpi-195`, `app-trade-dress`). Depois de trocar:

```bash
node .claude/skills/app-visual/scripts/contraste.mjs app/visual/tokens.json
```

O script confere se cada texto dá pra ler sobre o fundo dele, pela conta da regra
internacional de acessibilidade (`app-wcag`). Tem que sair com código 0 (o número que o script devolve no fim; 0 quer dizer
que passou), sem nenhum par
reprovado no nível AA (o mínimo da regra). Reprovou: escurecer o texto ou clarear o fundo
e rodar de novo.

Copiar as cores da marca da referência pro `cores` do `app/marca.json`, pra varredura achar
alguma que sobrou.

### Passo 4. O pedido de logo

Esta etapa escreve o pedido (o briefing): quem desenha é o aluno, um designer ou uma IA de
imagem. O pedido tem:

- a ideia em uma linha, ligada ao nome e ao diferencial;
- o tipo: logotipo (só o nome escrito com uma letra própria), símbolo com o nome, ou
  monograma (as iniciais);
- funcionar pequeno, a 16 pixels, como favicon (o ícone que aparece na aba do navegador), e
  grande, como ícone do app de 1024 por 1024 pixels;
- os arquivos: SVG (o formato que aumenta sem borrar), ícone do app 1024x1024 (o tamanho e o
  fundo exatos que a Apple e o Google pedem se conferem na documentação deles quando for
  pra loja), conjunto de favicon e imagem de compartilhamento de
  1200x630 (a que aparece quando alguém manda o link no WhatsApp);
- **nada parecido com o logo da referência**: nenhuma forma, par de cores ou truque de letra
  em comum (a App Store barra app que usa o nome ou o ícone de outro, `app-apple-regras`).
  Pôr o logo da referência do lado dos rascunhos e conferir.

Letra e ícone usados no logo precisam de licença que permita uso comercial; a nota no fim
do `fatos.md` diz a licença das mais comuns, conferida na página oficial de cada uma.

Logo por designer pago ou por IA de imagem paga é **(gasta)**: gate com o preço que o
designer ou o serviço passar, conferido no dia.

### Passo 5. A voz

Voz é o jeito de o app falar com o cliente. Três palavras, cada uma no formato "palavra:
quer dizer ..., e o limite é ...". Exemplo pra um app de agenda de salão:

- **Próximo:** quer dizer falar de você pra você, como a recepcionista do salão, e o limite
  é a gíria que nem toda cliente entende.
- **Rápido:** quer dizer frase curta e o botão dizendo a ação, e o limite é cortar a
  informação que a cliente precisa pra decidir.
- **Seguro:** quer dizer confirmar tudo que mexe com horário e dinheiro, e o limite é o
  aviso repetido que cansa.

Depois, 5 pares de exemplo: uma frase na voz e uma que fugiu dela, lado a lado. Com isso,
reescrever os 10 textos que o cliente mais vê no app: o cadastro, a tela vazia (a que
aparece antes de ter qualquer dado), o botão principal, a confirmação, a mensagem de erro e
os outros que o `app/mapa.md` mostrou. Tudo escrito do zero, sem eco das frases da
referência.

Se o projeto tem `marca/tom-de-voz.md` e o app usa a marca do negócio, a voz sai de lá.

### Passo 6. A varredura

Trocar no `app/codigo/` todo nome, cor e texto que ainda é da referência ou de exemplo.
Depois, da raiz do projeto (a pasta que tem o `app/` e o `.claude/`):

```bash
node .claude/skills/app-marca/scripts/varrer-marca.mjs --config app/marca.json
```

Sem pasta, ela varre `app/codigo/`. Procura o nome da referência em todo arquivo e em todo
nome de arquivo e pasta, sem ligar pra maiúscula nem pra acento, inclusive colado em nome
de código (AgendaFacilBotao, agenda-facil); procura também os domínios e as cores. Pula as
pastas de dependência e de montagem (`node_modules`, `.next` e parecidas), os arquivos de
trava de versão (lockfile) e os binários (imagem, fonte, vídeo).

- **Código 0** e a palavra "Limpo": nada da referência no código.
- **Código 1**: achou alguma coisa. Cada linha mostra o tipo, o que achou e o arquivo com
  a linha. Trocar cada um e rodar de novo, até dar limpo.
- **Código 2**: faltou o que procurar ou a pasta não existe. Conferir o `app/marca.json` e
  rodar da raiz do projeto. Também sai 2 quando alguma pasta ou arquivo não deu pra ler
  (sem permissão, sumiu no meio): o aviso lista cada um, e a varredura ficou incompleta,
  então não vale como limpa. Liberar a leitura e rodar de novo.

A varredura lê texto. Ficam pra conferir no olho, abrindo o app: o favicon, o título de
cada página, os e-mails automáticos, a imagem de compartilhamento e o ícone do app.

**Testes.** Texto novo quebra o teste que procura o texto antigo. Trocar em
`app/codigo/e2e/` cada nome dos `getByRole`/`getByText` e o `AVISO_DE_FICHA_ALHEIA` pelos
textos novos, e rodar `npx playwright test` de dentro de `app/codigo/`, com o servidor
local ligado, até ficar tudo verde.

## Saída

- `app/marca.md`: nome com as 7 buscas e as datas, paleta, pedido de logo, voz, os 10
  textos reescritos e, se comprou, a linha `Domínio: <endereço>, comprado em <data> no
  <registrador>`
- `app/marca.json`: o que a varredura procura
- `app/visual/tokens.json` com a paleta nova e o contraste aprovado
- `app/codigo/` com os textos novos e a varredura limpa
- testes da `/app-testar` verdes com os textos novos
- linha em `dados/custos.jsonl` pra cada gasto aprovado

No chat, só o resumo: o nome escolhido, o que ficou a rodar, a varredura limpa ou não e
quanto foi gasto.

## Depois

Próxima etapa: `/app-lancar`, a página de venda, o preço e a ficha das lojas, já com o nome
novo.

## Regras

- Nada sai com nome, domínio, cor ou logo da referência. A varredura limpa é condição pra
  `/app-lancar` e `/app-publicar`.
- Busca sem resultado e data fica "a rodar".
- Todo gasto passa pela `/segunda-opiniao` e espera o "pode ir" na hora, com linha em
  `dados/custos.jsonl`.
- O Claude nunca compra, nunca digita cartão, senha ou dado pessoal do aluno.
- Valor sempre pelo id do `fatos.md`, conferido se passou de 60 dias.
- As buscas são triagem, sem garantia de resultado jurídico; caso com dinheiro alto ou
  briga com outra empresa vai pra um advogado de marcas.
