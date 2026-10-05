---
name: publicar-site
description: >
  Publica um arquivo HTML no ar via Cloudflare Pages e retorna um link compartilhável.
  Use quando o usuário disser "coloca esse HTML no ar", "quero um link pra essa página",
  "deploy", "publica esse HTML" ou "publicar-site". Depois de criar proposta ou landing
  page, só oferecer; nunca publicar sem o "pode ir".
---

# /publicar-site, Deploy no Cloudflare Pages

## O que faz

Envia um arquivo HTML pro Cloudflare Pages e retorna uma URL pública com HTTPS.
O link funciona em qualquer dispositivo e pode ser compartilhado direto com o cliente.

## Como usar

Chame `/publicar-site` seguido do caminho do arquivo:
```
/publicar-site propostas/proposta-cliente-x.html
```

Ou chame sem argumento, o Claude vai perguntar qual arquivo publicar.

---

## Pré-requisitos

Para usar essa skill você precisa:

1. **Conta no Cloudflare** (gratuita): cloudflare.com
2. **API Token do Cloudflare** com permissão de Cloudflare Pages
3. **Nome do projeto** no Cloudflare Pages (vai no `.env` como `CLOUDFLARE_PROJECT_NAME`)

Configure as variáveis de ambiente no arquivo `.env` na raiz do projeto:
```
CLOUDFLARE_API_TOKEN=seu_token_aqui
CLOUDFLARE_ACCOUNT_ID=seu_account_id_aqui
CLOUDFLARE_PROJECT_NAME=nome-do-seu-projeto
```

Se o `.env` não existir, a skill vai guiar você na configuração passo a passo.

---

## Workflow

1. Verificar se o arquivo existe e é um HTML válido
2. Verificar se `.env` tem as variáveis necessárias, se não tiver, guiar configuração
3. Mostrar o que vai pro ar (arquivo e nome do projeto) e avisar que o link fica público pra quem tiver ele. Só seguir com o "pode ir" naquele momento
4. Fazer upload via Cloudflare Pages API
5. Retornar a URL pública

**Output:**
> "Publicado. Link: https://[projeto].pages.dev/[arquivo]"

---

## Dica

Pra ter um domínio próprio (ex: propostas.seusite.com.br), conecte seu domínio no painel do Cloudflare Pages depois de publicar. A skill continua funcionando igual.
