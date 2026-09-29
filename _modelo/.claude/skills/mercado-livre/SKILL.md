---
name: mercado-livre
description: >
  Chefe do pacote de venda no Mercado Livre. Conduz um produto do "pode vender isso?" até o
  anúncio publicado e a conta auditada, chamando as skills especialistas na ordem certa,
  guardando o estado em arquivo e parando nos pontos em que a decisão é sua. Use quando o
  usuário chamar /mercado-livre, disser "quero vender no Mercado Livre", "roda a esteira na
  categoria X", "leva o produto Y até publicar", "continua o produto de onde parou", "que
  produto está em que etapa", "status da esteira", ou pedir qualquer coisa de marketplace
  sem saber por onde começar.
---

# /mercado-livre, a esteira de anúncios

Esta skill decide a ordem, guarda o estado e para nos gates. Quem faz cada
trabalho são as especialistas do pacote. Nada gasta dinheiro, publica ou altera
a conta sem o "pode ir" da pessoa naquele momento.

## Dependências

- `_contexto/mercado-livre.md`, a configuração do negócio (ERP, imposto,
  margem mínima, SKU, fornecedores), criada pela entrevista abaixo
- `_contexto/empresa.md` e `_contexto/preferencias.md`
- `_contexto/vereditos-legais.md`, escrito pela `/pode-vender`
- `referencias/contratos.md`, os arquivos que passam de uma etapa pra outra
- `referencias/navegador.md`, os cuidados com o Chrome dedicado: ler antes de
  clicar ou navegar
- O Chrome dedicado e a conta do Mercado Livre autorizada (seção "Primeira vez")

Caminhos que começam em `referencias/` e `scripts/` são relativos à pasta desta
skill; `_contexto/`, `dados/`, `fornecedores/` e `anuncios/` são da raiz do projeto.

## Antes de tudo: você já vende?

Se `_contexto/mercado-livre.md` não existe:

- `_contexto/trilha.md` existe e o `etapa_atual` dele é menor que 8: dizer em
  que etapa a pessoa está e oferecer continuar a trilha. Aqui não se pergunta
  se ela já vende.
- Sem trilha, a primeira pergunta é: "Você já vende no Mercado Livre?" (por
  que pergunto: quem ainda não vende precisa de outras coisas antes, como MEI
  e fornecedor; exemplos: "já vendo há um ano" / "ainda não, estou começando
  do zero"). Já vende: segue daqui, pela configuração abaixo.
- Não vende: chamar a `/comecar-a-vender`, que leva do zero ao primeiro
  anúncio e volta pra cá na etapa 8.

## Primeiro de tudo: existe configuração?

Se `_contexto/mercado-livre.md` não existir, rodar a entrevista antes de
qualquer outra coisa. Uma pergunta por mensagem, no formato de 4 partes
(pergunta simples, por que pergunto, dois exemplos, repergunta se vier vago).
Pular o que `empresa.md` já responde.

1. **Quem te fornece, e como chega o catálogo?** Por que pergunto: cada
   fornecedor vira uma pasta em `fornecedores/`, e o jeito que o catálogo chega
   (PDF, planilha, site) muda a primeira skill que roda. Exemplos: "um
   distribuidor de doces que manda PDF todo mês" / "compro de dois atacados e
   anoto na planilha".
2. **Você usa algum sistema de gestão, tipo Bling?** Por que pergunto: com ERP
   o cadastro sai por API e o anúncio nasce de lá; sem ERP você publica direto
   no painel pelo checklist. Exemplos: "uso o Bling" / "nada, faço na mão".
3. **Você é MEI? Se não, qual a alíquota de imposto sobre a venda neste mês,
   e quem te passou?** Por que pergunto: o imposto entra em toda conta de
   margem. MEI paga um valor fixo por mês (o DAS), então a alíquota sobre a
   venda fica 0. Exemplos: "sou MEI" / "6%, minha contadora". Sem resposta, o
   campo fica vazio e toda skill de preço para até ele existir.
4. **Quanto você precisa lucrar por venda, no mínimo, em reais e em
   porcentagem?** Por que pergunto: é o piso que reprova anúncio novo antes de
   gastar tempo nele. Exemplos: "R$ 8 e 15%" / "R$ 12 num kit".
5. **Se usa ERP: qual o prefixo do seu SKU (o código que você dá a cada produto no sistema), o id do depósito e o id do canal do
   Mercado Livre lá dentro?** Por que pergunto: o cadastro escreve nesses três
   lugares e errar id grava estoque no depósito errado sem avisar. Exemplos:
   "LOJA, depósito 123, canal 456" / "não sei os ids" (então eu mostro onde
   achar no painel do ERP, e o campo espera).
6. **Como está a sua conta: reputação, loja oficial, Full?** Por que pergunto:
   reputação muda o desconto de frete, e loja oficial muda como você briga em
   catálogo. Exemplos: "verde, sem loja oficial, sem Full" / "conta nova".
7. **Qual guia de marca manda nas fotos?** Por que pergunto: o agente `ml-designer` lê esse
   arquivo antes de qualquer imagem. Padrão: `marca/design-guide.md`.
8. **Você vende pelo dropshipping (o fornecedor despacha em seu nome) ou com
   estoque seu? E em que estado é o seu CNPJ?** Por que pergunto: no drop a
   auditoria confere o fornecedor (mesmo estado, prazo de despacho), e a foto e
   o estoque vêm dele. Exemplos: "drop, SP" / "estoque próprio, MG".
   Quando for dropshipping, pra cada fornecedor criar
   `fornecedores/<nome>/fornecedor.md` copiando
   `.claude/skills/comecar-a-vender/referencias/fornecedor-modelo.md` e
   preenchendo com a pessoa, porque é esse arquivo que a auditoria confere.

Ao fim, gravar `_contexto/mercado-livre.md` copiando
`referencias/configuracao-exemplo.md` e trocando os valores do bloco marcado
como `mercado-livre`; pergunta sem resposta deixa o campo vazio, nunca inventa
número. Manter os nomes das linhas, que são o que os scripts leem.
Mostrar o bloco gravado e perguntar se ficou certo.

## Primeira vez: o que precisa estar ligado

Conferir nesta ordem, e resolver na hora o que faltar, explicando em uma frase
cada passo:

1. **Node instalado** (`node --version`). Sem ele, os scripts não rodam; o
   README da pasta-mãe ensina a instalar.
2. **Dependências da skill:** rodar da raiz do projeto
   `npm install --prefix .claude/skills/mercado-livre` (uma vez; baixa o
   Playwright, uns minutos).
3. **Chrome dedicado:** `node .claude/skills/mercado-livre/scripts/abrir-chrome.mjs`.
   Abre um Chrome separado, com perfil só dele em `dados/chrome-perfil/`. Na
   primeira vez a pessoa faz login no Mercado Livre nessa janela, e pronto: o
   login fica salvo lá. Sem ele, pesquisa, espionagem e simulador não rodam,
   porque o Mercado Livre bloqueia navegador sem sessão.
4. **Conta do Mercado Livre autorizada.** Quem veio da `/comecar-a-vender`
   faz este item na etapa 8 da trilha, depois da conta criada na etapa 6 e
   antes da esteira; quem já vende segue como sempre. A pessoa cria um aplicativo no portal
   de desenvolvedor do Mercado Livre (o `/conectar` guia clique a clique, e o
   que o portal pede se confere na tela, nunca de memória), cola
   `ML_CLIENT_ID`, `ML_CLIENT_SECRET` e `ML_REDIRECT_URI` (com `https`: o
   portal recusa `http`, conferido por busca em 2026-09-24, não com o portal
   aberto) no `.env`, e roda
   `node .claude/skills/mercado-livre/scripts/autorizar.mjs --ml --url`. Abre o
   link, autoriza, a página de retorno dá erro (esperado), e cola de volta a
   URL inteira que aparecer na barra:
   `node .claude/skills/mercado-livre/scripts/autorizar.mjs --ml "<url colada>"`.
   Os tokens vão pro `.env` e se renovam sozinhos dali em diante.
5. **Bling, só se `erp: bling`:** o `/conectar`, seção "Mercado Livre e Bling",
   guia. Diferença pro Mercado Livre: o código do Bling vale 1 minuto, então
   o receptor (`autorizar.mjs --bling --ouvir`) liga antes de autorizar.

Nada disso custa dinheiro. A única coisa paga no pacote é gerar imagem por IA,
e ela avisa antes.

## A equipe

| Etapa | Quem faz | Como |
|---|---|---|
| 0 | `/pode-vender` | no chat, antes de tudo |
| 1 | `/analisar-catalogo` | no chat |
| 2 | agente `ml-minerador` | roda a `/pesquisar-tendencia` |
| 3 | agente `ml-espiao` | roda a `/espionar-concorrente` |
| 4 | `/decidir-anuncio` | no chat, com a pessoa: é o gate principal |
| 5 | agente `ml-copywriter` | roda a `/montar-anuncio` |
| 5.5 | agente `ml-designer` | brief de cada foto e, se o Gemini estiver ligado, gera com aviso de custo |
| gate | agente `ml-auditor` | sempre antes do cadastro |
| 6 e 7 | agente `ml-publicador` | roda a `/cadastrar-bling` (se tem ERP) e a `/publicar-marketplace` |
| depois | `/auditar-conta` e `/mercado-ads` | fora da esteira, a pedido |

Agente roda em conversa separada e devolve só um recibo; o dado inteiro fica
nos arquivos de `referencias/contratos.md`. No Codex não existe agente: a
própria conversa roda a skill especialista, na mesma ordem.

## Gate 0, antes de gastar qualquer pesquisa

Produto novo não entra sem veredito válido em `_contexto/vereditos-legais.md`
(PODE, com menos de 6 meses). Veredito ausente, vencido, NÃO PODE ou
INCONCLUSIVO: rodar `/pode-vender` antes da pesquisa. Reprovado não avança e
não consome pesquisa. PODE COM RESSALVA segue, e a ressalva entra em
`status.json` como pendência que o `ml-auditor` cobra. Pesquisa de mercado mede
demanda, e demanda não diz se é legal vender.

## Modos

**`/mercado-livre status`** (ou "como está a esteira"): ler
`dados/pipeline/*/status.json` e `dados/pipeline/_categorias/*.json`, mostrar
tabela curta (slug, etapa, bloqueios), destacar o que espera a pessoa e o que dá
pra tocar agora, oferecer continuar o mais avançado.

**`/mercado-livre <categoria>`** (ex.: "roda a esteira em luminárias"):

0. Gate 0.
1. Ler ou criar `dados/pipeline/_categorias/<fornecedor>-<categoria>.json` e
   achar a próxima etapa pendente.
2. Pesquisa pendente: despachar `ml-minerador`. Ao voltar, mostrar o recibo.
3. Espionagem pendente: propor os finalistas (nota 50 ou mais, maior margem
   primeiro), confirmar, despachar `ml-espiao` em lotes de 2 a 3 produtos.
4. Decisão: rodar `/decidir-anuncio` no chat. Ao aprovar, criar
   `dados/pipeline/<slug>/` com `status.json` e `decisao.json` pra cada
   anúncio aprovado, e atualizar o arquivo da categoria.
5. Seguir o fluxo por produto pra cada slug, na ordem do plano.

**`/mercado-livre <produto>`** (ex.: "leva o kit de suspiros até publicar"):
ler `dados/pipeline/<slug>/status.json` e continuar da etapa atual:

1. Copy pendente: despachar `ml-copywriter`. Mostrar o recibo em 5 linhas e
   seguir (se a pessoa quiser revisar, pausar).
2. Imagens pendentes: conferir `anuncios/<slug>/fotos-cruas/`. Vazia é
   bloqueio: pedir as fotos e parar. Senão, despachar `ml-designer` no modo GERAR.
3. Gate de imagens: mostrar cada imagem com o papel do slot e o custo. Reprovou
   alguma: `ml-designer` no modo REFAZER com o comentário literal. Aprovou:
   `ml-designer` no modo ENTREGAR.
4. Auditoria: despachar `ml-auditor`. Reprovado: despachar a correção pra quem a
   falha aponta e auditar de novo. Aprovado: seguir.
5. Cadastro e publicação: despachar `ml-publicador`. Com `erp: bling`, ele
   só monta o cadastro (`--montar`) e devolve o resumo: mostrar à pessoa e
   esperar o "pode ir". Com ele, despachar de novo dizendo "envio autorizado
   pela pessoa" (ou rodar o `--enviar` da `/cadastrar-bling` nesta conversa).
   Sem ERP, ele gera só o checklist. A publicação em si é a pessoa no painel; quando ela voltar com o
   código do anúncio, registrar em `publicacao.json` e marcar `publicado`.

**`/mercado-livre continuar`**: varrer os `status.json`, achar o produto mais
perto de publicar sem bloqueio e propor continuar ele.

## Regras de orquestração

- Estado primeiro: ler `status.json` antes de despachar. Nunca refazer etapa
  `ok` ou `aprovado` sem a pessoa pedir.
- Recibo, nunca despejo: repassar só o recibo dos agentes.
- Gates invioláveis: decisão (etapa 4) e aprovação de imagens nunca são pulados,
  mesmo que a pessoa diga "roda tudo". Nesses dois pontos, parar e apresentar.
- Custo: antes de qualquer gasto acima de `limite_gasto_usd` da configuração,
  mostrar a estimativa e esperar o "pode ir". O padrão do pacote é custo zero.
- Bloqueio declarado: agente que reporta bloqueio (sem foto, dado faltando do
  fornecedor, Chrome fechado) grava em `status.json` em `bloqueios`; avisar e
  seguir pra outro produto se houver.
- Paralelismo: copies de anúncios diferentes rodam em paralelo, espionagens
  também. Rodar `abrir-chrome.mjs` antes de despachar, pra não abrir dois Chromes. O `ml-designer` é sequencial por produto.
- Fim de ciclo: ao publicar, acrescentar uma linha curta em
  `_contexto/estrategia.md` e lembrar: processo fechou, próximo produto vale
  conversa nova.
- Regra de plataforma citada em qualquer referência leva data. Antes de agir
  sobre ela, conferir ao vivo.

## O que esta skill nunca faz

- Publicar, cadastrar, mexer em campanha ou gastar sem o "pode ir" daquele
  momento
- Fazer o trabalho da especialista no lugar dela
- Guardar número de imposto, margem, depósito ou SKU fora de
  `_contexto/mercado-livre.md`