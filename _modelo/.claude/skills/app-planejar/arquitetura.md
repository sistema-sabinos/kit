# Planta: {{seu app}} (as funções principais de {{app de referência}}, feitas do zero)

Tamanho (do mapa): {{P | M | G | GG}}

## Pilha

| parte | escolha | por quê |
|---|---|---|
| site do app | | |
| componentes acessíveis | | |
| banco de dados | | |
| login | | |
| e-mail automático | | |
| arquivos | | |
| tarefa agendada | | |
| hospedagem | | |
| pagamento | | |
| celular (opcional, depois do site no ar) | | |

## Custo por mês

| serviço | plano grátis | o que faz começar a cobrar | preço quando cobra | id do fato | conferido_em |
|---|---|---|---|---|---|

Total com zero cliente: {{...}}
Total depois dos limites grátis: {{...}}

## Decisão do aluno

Hospedagem: {{Cloudflare | Vercel Pro | em aberto}}
Next.js na Cloudflare: {{caminho de `app-cloudflare-nextjs`, só se a hospedagem for Cloudflare}}
Pagamento: {{Stripe | Mercado Pago | em aberto}}
Segunda opinião: {{data e resumo}}
"Pode ir" em: {{data}}

## Banco de dados

Tabelas: {{n}}. Regra de acesso: {{regra por linha (RLS) | checagem em cada leitura}}.

```sql
-- tabelas, ligações, índices e travas
```

## Rotas

| método e endereço | o que faz | quem pode chamar | o que recebe | o que devolve | caminho do mapa |
|---|---|---|---|---|---|

Webhooks que chegam: {{...}}  Webhooks que saem: {{...}}
Tarefas agendadas: {{nome, horário, o que faz}}

## As partes que mordem

- fuso horário:
- aviso repetido:
- corrida:
- dado pessoal (LGPD) e excluir conta:
- registro de acesso:
- cancelar e se arrepender:

## Ordem de construção

1. Caminho inteiro funcionando: {{caminho C01, telas T01..., tabelas, rotas}}
2. Obrigatórias:
3. Importantes, depois desejáveis:
4. Consertos da /ler-avaliacoes (`app/consertos.md`):
