---
name: app-testar
description: >
  Testa o seu app de ponta a ponta antes de mostrar pra alguém: monta o plano de teste
  a partir dos caminhos que a /app-estudar mapeou (o caminho normal, os casos esquisitos e
  os casos de erro), escreve testes automáticos que clicam sozinhos no app, faz a passada
  à mão no que não dá pra automatizar e registra cada defeito com gravidade, passos e
  prova. Etapa 7 de 11 do pacote criar app, custo zero. Use quando o usuário chamar
  /app-testar, disser "testa meu app", "acha os defeitos", "clica em tudo pra ver se
  quebra", "tá funcionando?", "escreve os testes", ou depois da /app-construir e da
  /app-servidor.
---

# /app-testar, achar o que quebra antes do cliente achar

## O que essa skill faz

Pega cada caminho do app (um caminho é a sequência de telas que a pessoa percorre pra
fazer uma coisa, como "cliente marca horário no salão") e testa de três jeitos: o caminho
normal, os casos esquisitos (campo vazio, clique duplo, celular) e os casos de erro (senha
errada, cartão recusado). O que dá pra automatizar vira teste automático, um arquivo que
abre o navegador, clica nos botões sozinho e confere se apareceu o que devia. O resto
vira uma passada à mão. Todo defeito (qualquer coisa que o app faz diferente do que devia)
entra numa lista com gravidade e prova.

## Dependências

- `app/mapa.md`, feito pela `/app-estudar`, com as telas T01, T02... e os caminhos C01, C02...
- O app rodando no seu computador (o servidor local, que é o app ligado só na sua máquina,
  num endereço como `http://localhost:3000`), montado pela `/app-construir` e pela
  `/app-servidor`, com dados de mentira carregados pra as telas não nascerem vazias
- Modelos desta pasta: `plano-teste.md`, `relatorio-defeito.md`, `e2e-exemplo.spec.ts`,
  `larguras.spec.ts` e `isolamento.spec.ts`

Grava `app/plano-teste.md`, `app/defeitos.md`, os prints em `app/defeitos/` e os testes
automáticos em `app/codigo/e2e/`.

## A regra

Os testes rodam só no seu app. O app de referência (o que você estudou) você usa como
cliente comum, com a mão, pra ver como ele se comporta. Nunca rodar teste automático,
robô, teste de carga (milhares de acessos de uma vez pra ver se aguenta) ou qualquer
script contra o servidor dele.

## Fluxo

### 1. O plano

Pra cada caminho C01, C02... do `app/mapa.md`, escrever em `app/plano-teste.md` (molde
em `plano-teste.md`):

- **Caminho feliz:** os passos e o que a pessoa tem que ver no fim.
- **Casos de borda** (as situações esquisitas que o cliente cria sem querer). Passar
  esta lista em todo caminho e ficar com as que fazem sentido: campo vazio; texto muito
  comprido; emoji e acento; duas abas abertas ao mesmo tempo; clique duplo no botão de
  enviar; botão de voltar no meio; recarregar a página no meio; internet lenta; sem
  internet; sessão vencida (a pessoa ficou tanto tempo parada que o login caiu); dado de
  outro cliente (tem que ficar invisível); fuso horário diferente (cliente em outro estado
  ou fora do país); tela de celular; só teclado, sem mouse; leitor de tela (o programa
  que lê a tela em voz alta pra quem não enxerga) achando o nome de cada botão.
- **Casos de erro:** senha errada; cartão recusado; sem permissão; ficha apagada.

O caso "dado de outro cliente" já tem teste pronto em
`.claude/skills/app-testar/isolamento.spec.ts`: o `cliente-a@exemplo.test` cria uma ficha e o
`cliente-b@exemplo.test`, em outro navegador, não pode vê-la na lista nem abrindo o endereço
dela direto. Os dois são os clientes de mentira do seed da `/app-servidor` (o arquivo que
enche o banco de teste com dado inventado). O teste confere
também que cada um vê a própria ficha, senão um app que esconde tudo de todo mundo passaria.

Cartão de teste: no Stripe, o número que aprova e o que recusa estão no id
`app-stripe-teste` de `.claude/skills/app-planejar/referencias/fatos.md`; no Mercado Pago,
os cartões e o nome do titular que aprova ou recusa estão no id `app-mp-teste`. Antes de
dizer qualquer valor desse arquivo ao usuário, olhar a coluna `conferido_em`: passou de 60
dias, conferir na fonte da linha antes e atualizar a data.

Numerar cada caso pelo código do caminho: `C01-F1` (feliz), `C01-B3` (borda), `C01-E2`
(erro).

### 2. Automatizar o que der

A ferramenta é o Playwright, que abre um navegador de verdade e clica no app sozinho.
Um arquivo de teste por caminho, rodando contra o servidor local com os dados de mentira.
O teste acha cada botão pelo papel e pelo nome que a pessoa lê na tela
(`getByRole('button', { name: 'Agendar' })`). Assim o teste sobrevive quando a cor ou o
visual mudam na `/app-marca`; quando o texto muda, o nome no teste muda junto (a
`/app-marca` faz isso). Modelo pronto em `e2e-exemplo.spec.ts`.

Pra tela que estoura pro lado, o modelo `.claude/skills/app-testar/larguras.spec.ts` abre
cada tela em 320, 390 e 1440 px de largura (celular pequeno, celular comum e computador) e
reprova se a página rolar pro lado. Copiar pra `app/codigo/e2e/` e trocar a lista `ROTAS`
pelas telas do `app/mapa.md`: cada uma com o endereço (`caminho`) e um texto que só chega
junto com os dados (`pronto`), como o nome de um serviço cadastrado ou um horário livre.
Nunca o título nem item de menu, que já aparecem antes dos dados e liberam a medida cedo. O
teste espera esse texto antes de medir, porque tela que busca os dados depois de abrir
começa vazia e só estoura quando eles chegam. O `isolamento.spec.ts` vai pra mesma pasta,
com o login, os endereços e o aviso de ficha alheia adaptados. O aviso é o título da página
que o app mostra quando alguém abre a ficha de outro (não encontrada, sem permissão ou a
tela de login), sem palavra que também aparece em menu ou botão, como "entrar".

O kit não vem com o Playwright dentro do projeto. Instalar baixa o pacote e um navegador
inteiro, que é pesado, só dentro de `app/codigo/` (a pasta `node_modules/` que nasce ali
fica fora do backup pelo `.gitignore`). É de graça, mas ocupa disco: mostrar isso ao
usuário e esperar o "pode ir" dele antes de rodar, de dentro de `app/codigo/`:

```bash
npm install -D @playwright/test @axe-core/playwright
npx playwright install chromium
npx playwright test
```

Antes do `npx playwright test`, criar `app/codigo/playwright.config.ts` com `testDir: 'e2e'`
e, em `use`, o `baseURL` com o endereço do servidor local (`http://localhost:3000` ou o que
a `/app-servidor` usou). Sem isso o `page.goto('/agenda/corte')` do modelo não sabe pra
onde ir. O servidor local precisa estar ligado enquanto os testes rodam.

Versão e licença do `@axe-core/playwright` no id `app-axe-core` do `fatos.md`.

Todo arquivo de teste ganha três travas, como no modelo:

- reprova se aparecer erro no console (o painel escondido do navegador onde o app avisa
  que algo deu errado);
- reprova se o servidor responder com erro do tipo 500 (código que quer dizer "o servidor
  quebrou");
- passa o axe em cada tela, uma checagem de acessibilidade (se pessoa com deficiência
  visual ou motora consegue usar), que acusa botão sem nome, contraste fraco e campo sem
  rótulo. A régua de contraste está no id `app-wcag`.

### 3. A passada à mão

O que o teste automático não alcança passa à mão: e-mail chegando, login com conta do
Google ou de outra empresa, pagamento de ponta a ponta, defeito visual. Se o navegador do
`/conectar` estiver ligado, eu clico no seu app local e tiro print de cada passo. Senão,
entrego a lista de conferência e espero as suas respostas.

Nesta etapa tudo roda em modo de teste (o modo do Stripe e do Mercado Pago em que a
cobrança é de mentira e nenhum dinheiro se move). E-mail de teste vai só pro seu próprio
endereço: mandar pra outra pessoa é mensagem pra fora e espera o lançamento. Teste que
gaste dinheiro, como SMS (cobrado por mensagem), fica fora desta etapa; se precisar
mesmo, segue a regra de gasto do kit: mostrar o custo com a data em que o preço foi
conferido, passar pela `/segunda-opiniao`, esperar o "pode ir" naquele momento e gravar a
linha em `dados/custos.jsonl`, no mesmo formato da `/app-servidor`.

### 4. Registrar os defeitos

Cada defeito vai em `app/defeitos.md` no formato do `relatorio-defeito.md`: um número
(DEF-001), a gravidade, os passos exatos, o que devia acontecer, o que aconteceu e a prova
(print, texto do erro, nome do teste que reprovou). Gravidade:

| nível | quer dizer |
| --- | --- |
| 1, trava tudo | perde dado, abre brecha de segurança, cobra errado ou bloqueia o caminho principal |
| 2, quebra uma função | uma função não funciona e não tem jeito de contornar |
| 3, tem contorno | quebrada com um jeito de contornar, ou visivelmente errada |
| 4, só visual | detalhe de aparência |

Só entra na lista o que eu reproduzi. Suspeita fica numa lista separada, "a conferir".

### 5. Consertar

Primeiro os de nível 1 e 2. Pra cada conserto: escrever antes o teste que reprova por
causa do defeito, consertar, ver o teste passar e deixar ele lá pra sempre, assim o
defeito não volta calado. Depois de cada leva de consertos, rodar todos os testes de novo.
No `app/defeitos.md`, anotar em cada defeito a data e o commit do conserto (commit é a
foto do código que o backup guarda no histórico).

### 6. Resumo no chat

Casos rodados, quantos passaram e quantos reprovaram, defeitos por nível, quantos já
consertados, e o caminho do `app/plano-teste.md` e do `app/defeitos.md`. Sem colar a lista
inteira.

## Regras

- Nada vai pro ar com defeito de nível 1 aberto.
- Teste automático roda só no seu app.
- Pagamento só em modo de teste; cobrança real é na `/app-publicar`, com o "pode ir".
- Nunca inventar resultado: caso que não rodou fica sem resultado no plano.

## Depois

A próxima etapa é a `/app-comparar`, que mede quanto do app de referência o seu já faz.
