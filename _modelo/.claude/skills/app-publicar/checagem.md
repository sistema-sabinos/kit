# Checagem de publicação: {{nome do app}}

Data: {{AAAA-MM-DD}}  Versão do código (commit, o ponto salvo no backup): {{código}}  "Pode ir" do aluno: {{sim, em AAAA-MM-DD / ainda não}}

Valores de custo e regra pelo id de `.claude/skills/app-planejar/referencias/fatos.md`, com a data
em que foram conferidos.

## Checagem que barra (tudo tem que passar)

- [ ] testes automáticos verdes: {{n passaram / n}}
- [ ] nenhum defeito aberto de gravidade 1 ou 2 (trava tudo ou quebra uma função)
- [ ] paridade: `paridade.mjs app/funcoes.csv --exigir-obrigatorias` saiu com código 0; conferência no texto: todas as obrigatórias feitas ({{n/n}}), nota das funções {{n}}, veredito sem "Ainda nao da pra lancar"
- [ ] varredura de marca limpa (`varrer-marca.mjs` saiu com código 0)
- [ ] ficha da loja aprovada (`ficha-loja.mjs` saiu com código 0), se vai pras lojas
- [ ] montagem de produção (`npm run build`) passou
- [ ] política de privacidade no ar, com cada serviço que recebe dado do cliente e o canal de contato (`app-lgpd`, `app-anpd-pequeno`)
- [ ] termos de uso no ar, com preço, condições, 7 dias pra desistir e cancelamento pela internet (`app-cdc-49`, `app-decreto-7962`)
- [ ] aviso de cookie sem opção já marcada, se usa cookie que não é essencial (`app-anpd-cookies`)
- [ ] registro de acesso guardado por 6 meses (`app-marco-civil-15`)
- [ ] excluir a conta funciona, de dentro do app
- [ ] ícone da aba, títulos, imagem de compartilhamento, e-mails e ícone do app são seus

## Hospedagem

- [ ] escolhida: {{Cloudflare / Vercel Pro}}, valor conferido em {{data}} ({{id}})
- [ ] na Cloudflare grátis: o cartão é digitado só na página do Stripe ou do Mercado Pago (`app-cloudflare-free`)
- [ ] conta criada pelo aluno e anotada em `_contexto/ferramentas.md`

## Produção

- [ ] banco de produção separado do de teste, com backup, e a migração rodando pelo comando de publicação
- [ ] chaves de produção no painel da hospedagem, com os nomes do `.env.example`
- [ ] pagamento no modo real: produtos, preços, webhook de produção e a assinatura secreta dele
- [ ] compra real de teste feita e devolvida; tarifa que ficou: {{R$}} ({{app-stripe-reembolso / app-mp-reembolso}})
- [ ] login com Google: endereços de retorno com o domínio de produção
- [ ] verificação do Google aprovada, se pede dado sensível (`app-google-oauth`)
- [ ] domínio de envio de e-mail verificado

## Domínio

- [ ] comprado pelo aluno: {{domínio}}, {{R$}} ({{app-registro-br}}, conferido em {{data}})
- [ ] A @ -> {{valor do painel}}
- [ ] CNAME www -> {{valor do painel}}
- [ ] SPF, DKIM e DMARC feitos
- [ ] endereço oficial escolhido ({{com / sem www}}), o outro redireciona
- [ ] cadeado (HTTPS) valendo nos dois

## Vigiar

- [ ] monitor de erro
- [ ] monitor de queda
- [ ] registros do servidor guardados e alerta pro aluno
- [ ] caminho principal feito no site real, no computador e no celular

## Celular (opcional)

- [ ] contas de desenvolvedor no nome do aluno (`app-apple-conta`, `app-google-conta`)
- [ ] montagens dentro do limite do mês (`app-expo-free`)
- [ ] TestFlight e teste interno do Google Play rodando
- [ ] enviado pra revisão com a ficha aprovada

## Gastos aprovados

| data | o quê | valor | id do fato | linha em `dados/custos.jsonl` |
|---|---|---|---|---|
| {{AAAA-MM-DD}} | {{serviço}} | {{valor}} | {{id}} | {{sim}} |

## Primeira semana

Erros, quedas, limite da hospedagem, e-mail caindo no spam e os primeiros pedidos de cancelamento.

Endereço no ar: {{https://...}}
