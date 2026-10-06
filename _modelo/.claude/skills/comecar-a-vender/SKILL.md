---
name: comecar-a-vender
description: >
  Trilha de quem ainda não vende no Mercado Livre: leva do zero (sem conta, sem produto,
  sem fornecedor) até o primeiro anúncio no ar, pelo dropshipping nacional ou pelo produto
  próprio, mostrando no começo o que precisa ter e quanto custa, e guardando em que etapa a
  pessoa está. Use quando o usuário chamar /comecar-a-vender, disser "quero começar a vender
  no Mercado Livre", "não vendo ainda", "não tenho nada, por onde começo", "preciso de MEI?",
  "preciso de certificado digital?", "como acho fornecedor de drop", ou quando o
  /mercado-livre ouvir que a pessoa ainda não vende.
---

# /comecar-a-vender, do zero ao primeiro anúncio

Esta skill conduz no chat, uma etapa por vez, e guarda onde a pessoa parou em
`_contexto/trilha.md`. Quando o primeiro anúncio vai ao ar, ela entrega a pessoa
pra esteira do `/mercado-livre`.

Caminhos que começam em `referencias/` e `scripts/` são relativos à pasta desta
skill; `_contexto/` e `fornecedores/` são da raiz do projeto.

## Regras que não mudam

- **Número só do `referencias/fatos.md`.** Antes de mostrar custo, taxa ou regra,
  rodar `node .claude/skills/comecar-a-vender/scripts/fatos.mjs vencidos`. Fato
  vencido: pesquisar na web agora (fonte oficial primeiro, em português e em
  inglês), atualizar a linha com a data de hoje, e só então falar. Nunca de
  memória.
- **Senha, código de SMS e cartão são só da pessoa.** Nunca pedir, nunca
  aceitar colado no chat. Se colar, avisar pra trocar a senha.
- **Tela se lê no print.** Nos sites (gov.br, SEFAZ, Mercado Livre, Bling),
  pedir um print da tela a cada passo e dizer o próximo clique olhando o que
  está nele. Nunca descrever tela de memória: plataforma muda botão de lugar.
- **Gasto, compra, mensagem pra fora e publicação só com o "pode ir" da pessoa
  naquele momento.** A skill prepara; quem clica é ela.
- **Uma pergunta por mensagem**, no formato de 4 partes do kit (pergunta
  simples, por que pergunto, dois exemplos, repergunta se vier vago).
- **Contador.** O kit não indica nenhum. Se a pessoa não tem, dizer com todas as
  letras que ela precisa procurar um com urgência, e marcar na trilha cada
  ponto que ficou sem validação dele.
- **Fornecedor.** O kit não indica nenhum: ensina onde procurar
  (`referencias/fornecedor.md`).

## Primeiro de tudo: onde a pessoa está?

Se `_contexto/trilha.md` existe, ler o bloco `trilha` e a tabela, dizer em uma
frase em que etapa ela está e continuar dali. Se não existe, criar copiando
`referencias/trilha-modelo.md` e começar pela etapa 0.

Trilha sem a linha `regime` (começou antes da versão 4.9): antes de seguir, fazer
a pergunta do regime da etapa 0 ("Você já tem CNPJ?") e gravar a linha. Se a
resposta não for MEI e o `_contexto/mercado-livre.md` já tem `imposto_fonte`
começando por `MEI` (a etapa 6 antiga gravava assim pra todo mundo), apagar
`imposto_pct` e `imposto_fonte` e refazer pela regra do item 6 da etapa 6,
mostrando à pessoa o antes e o depois; sem isso o 0 velho seguiria nas contas de
margem, porque a etapa 8 não pergunta o que já está gravado.

Ao fim de cada etapa: marcar `feito` com a data na tabela, atualizar
`etapa_atual` e dizer qual é a próxima em uma frase.

## Etapa 0: diagnóstico e o que você precisa ter

Perguntas, nesta ordem, uma por mensagem:

1. **Em que estado e cidade você mora?** Por que pergunto: inscrição estadual e
   nota fiscal mudam de estado pra estado, e no dropshipping o fornecedor precisa
   ser do seu estado. Gravar o `estado` na trilha só com a sigla de duas letras
   (SP, PE) e a `cidade` no campo separado. Exemplos: "Campinas, SP" / "Recife, PE".
2. **Você quer vender pelo dropshipping ou com produto próprio?** Explicar antes
   em duas frases: no dropshipping você anuncia e vende, e o fornecedor embala e
   despacha em seu nome, sem você ter estoque; no produto próprio você compra,
   guarda, embala e despacha. O caminho do curso é o dropshipping. Exemplos:
   "dropshipping, não quero estoque" / "produto próprio, já tenho onde guardar".
   Gravar o `modelo` exatamente como `dropshipping` ou `estoque` (produto
   próprio grava `estoque`), que são as palavras que o `/mercado-livre` aceita.
3. **Quanto você pode investir pra começar?** Por que pergunto: define o que dá
   pra fazer já e o que espera. Exemplos: "R$ 500" / "uns R$ 3 mil". Gravar em
   `investimento`.
4. **Quantas horas por semana você tem pra isso?** Exemplos: "10 horas" / "só fim
   de semana". Gravar em `horas`.
5. **Você já tem CNPJ? Se tem, ele é MEI, Simples Nacional ou outro regime?**
   Por que pergunto: quem ainda não tem abre o MEI na etapa 4; quem já tem segue
   com o CNPJ dele, e no Simples e nos outros regimes o imposto sai de cada
   venda. Exemplos: "não tenho" / "Simples, tenho contador". Vago ou "não sei":
   reperguntar se paga um valor fixo todo mês (é MEI) ou uma parte de cada
   venda; sem resposta, explicar que a Consulta Optantes da Receita mostra de
   graça, só com o CNPJ, se a empresa é MEI ou Simples (`regime-consulta`), e
   gravar `a conferir`. Gravar em `regime`: `sem CNPJ`, `MEI`,
   `Simples Nacional`, `outro: <nome>` ou `a conferir`.
6. Só com `regime` `sem CNPJ`: **Você tem emprego com carteira assinada?** Por
   que pergunto: dá pra ser MEI tendo carteira, mas isso pode mexer em direitos
   como o seguro-desemprego, e quem confirma é o contador. Exemplos: "tenho,
   CLT" / "não, sou autônomo". Gravar em `carteira`. Se tiver, acrescentar na
   seção "Sem validação do contador" da trilha a linha "MEI com carteira
   assinada: efeitos em direitos".
7. **Você tem conta gov.br? Sabe o nível (bronze, prata, ouro)?** Exemplos: "tenho,
   não sei o nível" / "não tenho". Gravar em `govbr`.
8. **Você já tem contador?** Exemplos: "não tenho" / "tenho, o da minha mãe".
   Gravar em `contador`.

Se o `_contexto/empresa.md` ainda não tem a linha `**Registro:**`, gravá-la
depois da pergunta do contador, com os mesmos valores do bloco Loja do
`/setup`: `MEI`; `sem CNPJ, vende como pessoa física`; `Simples Nacional, com
contador` ou `Simples Nacional, procurando contador`; `<regime>, com contador`
ou `<regime>, procurando contador`; `regime a conferir`.

Quando o `contador` vier `não tem` ou `procurando`, já nesta etapa acrescentar
na seção "Sem validação do contador" da trilha as linhas "inscrição municipal"
e, no dropshipping, "como emitir a nota do dropshipping (venda à ordem)".

Depois rodar o `fatos.mjs vencidos`, conferir o que venceu, e mostrar a lista
do que ela precisa ter, do modelo dela, em três blocos:

(a) **Obrigatório agora:** custo de cada item e a soma, único e mensal
separados. Se o estado dela não tiver o app Nota Fiscal Fácil (conferir na
hora), o certificado A1 (`certificado-a1`) entra aqui, dentro da soma.
(b) **Custos que dependem, fora da soma:** contador (preço varia, pedir
orçamento a 2 ou 3 antes de fechar); certificado A1 quando as vendas
crescerem; no dropshipping, plataforma de drop e Bling só se o fornecedor
exigir.
(c) **No dropshipping**, avisar que o app Nota Fiscal Fácil pra nota do drop
ainda precisa da confirmação do contador na etapa 5, então o certificado A1
pode acabar entrando antes.

Regra: nunca apresentar um total que omita um custo que depende; o total
sempre vem junto com a frase do que ficou de fora.

**Nos dois modelos:** conta gov.br prata ou ouro (grátis); CNPJ: quem ainda não
tem abre MEI com ocupação de comércio (abrir é grátis, `mei-das` por mês); quem
já tem no Simples ou em outro regime segue com ele, o imposto sai de cada venda
e precisa de um contador, que vale procurar com urgência; inscrição estadual
(grátis, obrigatória pra quem vende mercadoria, `ie-comercio`); inscrição municipal
(verificar com o contador); nota fiscal desde a primeira venda (`ml-nota-mei`),
pelo app Nota Fiscal Fácil se o estado dela tiver (`nff`, conferir o estado na
hora) ou pelo emissor do Mercado Livre com certificado A1 (`ml-emissor`,
`certificado-a1`); conta no Mercado Livre como empresa e Conta Negócio no
Mercado Pago (grátis, `mp-conta-pj`); contador.

**Só no dropshipping:** fornecedor do mesmo estado dela (`ml-nota-estado`) que
aceite despachar em nome dela, no mesmo dia ou no prazo do marketplace;
plataforma de drop só se escolher fornecedor de plataforma (`drop-plataformas`);
Bling só quando o fornecedor integrar por ele ou o volume pedir (`bling`).
Nenhum estoque, equipamento ou embalagem.

**Só no produto próprio:** primeiro lote de estoque; impressora térmica
(`impressora`); etiqueta, caixa e fita; balança; código de barras se for marca
própria.

Fechar dizendo o que já tem prazo conhecido: a validação da conta no
Mercado Livre leva até 72 horas (`ml-identidade`). Prazo que não está no
`fatos.md` não se promete.

## Etapa 1: conta gov.br prata

Sem prata ou ouro não abre MEI (`mei-abrir`). Os caminhos pra subir de nível
se conferem na hora, na página oficial do gov.br, antes de listar pra ela
escolher. Guiar pelo print. Anotar o nível alcançado em `govbr`.

## Etapa 2: nicho e produto

Pra quem ainda não tem CNPJ, o nicho vem antes do MEI porque a ocupação do MEI
sai do produto (`mei-ocupacao`). Com o dinheiro e as horas da etapa 0:

1. Conversar 3 a 5 ideias de nicho (gosto dela, o que ela conhece, ticket que
   cabe no investimento).
2. Rodar `/pode-vender` em cada finalista. Reprovado sai.
3. Medir a demanda dos que sobraram pela busca aberta do Mercado Livre, no
   navegador comum dela, sem login, guiada por print: quantos anúncios
   aparecem, a faixa de preço dos primeiros resultados e quantos vendidos eles
   mostram.
4. Fechar com até 3 produtos candidatos e o nicho escolhido.

## Etapa 3: fornecedor

Ler `referencias/fornecedor.md` e seguir. No dropshipping, fornecedor do mesmo
estado dela, sempre. A mensagem de primeiro contato sai pronta; quem manda é ela.
Fornecedor de drop costuma pedir CNPJ pra fechar: quem ainda não tem CNPJ pode
esperar o da etapa 4; quem já tem usa o dele.
Fornecedor aprovado no checklist vira `fornecedores/<nome>/fornecedor.md`,
copiado de `referencias/fornecedor-modelo.md` e preenchido.

## Etapa 4: MEI e inscrições

Com `regime` MEI, Simples Nacional ou outro: confirmar que o CNPJ existe, pular
os itens 1 e 2, conferir no cartão do CNPJ se as atividades cobrem o produto
(se não cobrem, falar com o contador antes de anunciar) e seguir do 3. Com
`a conferir`, resolver antes pela Consulta Optantes (`regime-consulta`).

1. Portal do Empreendedor no gov.br, "Quero ser MEI". Avisar antes: anúncio
   patrocinado que cobra pra abrir MEI é golpe (`mei-abrir`).
2. Ocupação principal pelo nicho da etapa 2; secundárias pros produtos
   vizinhos. Buscar a lista oficial na hora e mostrar as 2 ou 3 que casam.
3. Inscrição estadual: pesquisar agora como funciona no estado dela (se sai
   automática com o MEI ou se pede no portal da SEFAZ), com fonte, e guiar.
4. Inscrição municipal: "confirme com o seu contador se a sua prefeitura exige".
5. Anotar o CNPJ em `cnpj` e o número da inscrição estadual em
   `inscricao_estadual` na trilha (são públicos; senha nunca). Só quando o MEI
   foi aberto nesta etapa: gravar `regime: MEI` na trilha e `**Registro:** MEI`
   no `_contexto/empresa.md`; quem chegou com Simples ou outro regime mantém o dele.

## Etapa 5: como emitir nota

Decidir com ela:

- Estado com Nota Fiscal Fácil (`nff`): começa pelo app, grátis e sem
  certificado, bom pra poucas vendas. O arquivo da nota (XML) se anexa na venda
  do Mercado Livre na mão.
- Sem o app, ou quando as vendas crescerem: certificado A1 (`certificado-a1`) e o
  emissor do Mercado Livre (`ml-emissor`). Mostrar 3 a 5 vendedores de
  certificado com o preço de hoje, pesquisado agora. Comprar é com "pode ir".
- Dropshipping: a nota de venda à ordem (a do fornecedor pro comprador e a dela)
  precisa ser validada com o contador antes da primeira venda.

## Etapa 6: conta no Mercado Livre e Mercado Pago

1. Criar a conta já como empresa, com o CNPJ (o do MEI aberto na etapa 4, ou o
   que ela já tinha).
2. Validação de identidade (`ml-identidade`): documento e rosto; até 72 horas.
3. Conta Negócio no Mercado Pago (`mp-conta-pj`).
4. Apresentar o Programa Decola (`ml-decola`) com o custo: é dinheiro parado de
   garantia em troca de reputação verde no começo. A decisão é dela.
5. Explicar em três frases: tarifa (`ml-tarifa`), custo de envio
   (`ml-custo-envio`) e quando o dinheiro cai (`ml-dinheiro`). Com MEI, a
   margem de cada venda não inclui o DAS (`mei-das`), então o lucro do mês
   precisa cobrir o DAS.
6. Gravar o `_contexto/mercado-livre.md` mínimo, copiando
   `.claude/skills/mercado-livre/referencias/configuracao-exemplo.md` e
   preenchendo `modelo` e `estado` do bloco `trilha`, `erp: nenhum` e
   `reputacao: nova`. O imposto sai pelo `regime` da trilha:
   - MEI: `imposto_pct: 0` e `imposto_fonte: MEI, imposto fixo no DAS`.
   - Simples Nacional: a alíquota do mês que o contador passou. Sem ela,
     perguntar se o CNPJ tem 12 meses ou mais e se vendeu mais de R$ 180 mil
     nos últimos 12 meses. Com 12 meses ou mais e até R$ 180 mil, a do
     `simples-anexo1`, com `imposto_fonte: estimativa, conferir com o contador`.
     Nos outros casos, deixar vazio e acrescentar na seção "Sem validação do
     contador" a linha "alíquota do Simples": empresa com menos de 12 meses
     entra na faixa pela receita proporcional, e essa conta é do contador.
     A estimativa só vale pra quem revende produto comprado pronto
     (dropshipping e revenda): quem fabrica ou monta o que vende cai noutro
     anexo do Simples, então o campo fica vazio com a mesma linha pro contador.
   - Outro regime e `a conferir`: a alíquota que o contador passou, ou vazio, e
     a etapa 8 pergunta de novo.
   A etapa 8 completa o resto pela entrevista.

## Etapa 7: só no produto próprio, primeiro lote e material

No dropshipping, marcar esta etapa como "não se aplica" e pular pra 8.

1. Uma vez, da raiz do projeto: `npm install --prefix .claude/skills/mercado-livre`
   (baixa o navegador de automação que o simulador usa; leva uns minutos).
2. Simular a margem de cada candidato:
   `node .claude/skills/montar-anuncio/scripts/simular.mjs --termo "<produto>" --preco <X,XX> --tipo classico --frete gratis --custo <C>`
   (precisa do Chrome dedicado do pacote: `node .claude/skills/mercado-livre/scripts/abrir-chrome.mjs`).
3. Comprar o lote só com "pode ir", no tamanho que o dinheiro da etapa 0 aguenta
   mais os dias até o dinheiro cair (`ml-dinheiro`).
4. Impressora, etiqueta, caixa, fita, balança: lista com preço de hoje.

## Etapa 8: configurar o pacote e o primeiro anúncio

1. Rodar a entrevista do `/mercado-livre` (a de quem já vende) pra completar o
   `_contexto/mercado-livre.md` gravado na etapa 6: o que já está lá (`modelo`,
   `estado`, `erp`, imposto, `reputacao`) não se pergunta de novo; `erp` só
   muda pra `bling` se ela usar.
2. Seguir a seção "Primeira vez" do `/mercado-livre`, inclusive o item 4
   (autorizar a conta do Mercado Livre), que pra quem vem da trilha acontece
   aqui, com a conta da etapa 6 criada e antes da esteira.
3. Fotos: produto próprio, a pessoa fotografa (`ml-fotos`); dropshipping, as
   fotos do fornecedor, com a autorização de uso dele.
4. Código de barras (`ml-gtin`): o do fabricante, nunca inventado.
5. Seguir a esteira do `/mercado-livre` com esse produto até o
   `/publicar-marketplace`, que cria o anúncio pausado pela API. Agora que
   existem conta, fornecedor e autorização, a `/pesquisar-tendencia` entra
   como parte da esteira e mede a demanda com os dados do Mercado Livre. Ela
   confere o anúncio pausado no painel, com o print aberto e a skill
   conferindo cada campo, e ativa.
6. Avisar sobre o nome que confunde: no painel, "Dropshipping" é uma forma de
   envio pelos Correios (`ml-drop-nome`), sem ligação com vender sem estoque.

## Etapa 9: primeira venda

- Dropshipping: mandar pro fornecedor o pedido e a etiqueta no mesmo dia e
  conferir que ele postou no prazo; atraso dele derruba a reputação dela
  (`ml-reputacao`).
- Produto próprio: embalar, imprimir etiqueta, levar na agência no prazo.
- Nota: emitir antes de despachar (etapa 5).
- Dinheiro: cai uns 12 dias depois da entrega (`ml-dinheiro`).

## Etapa 10: o que vem depois

Gravar na trilha, como gatilhos:

- Certificado A1 e emissor: quando o app de nota não der conta.
- Bling: segundo canal de venda, Full, ou uns 5 a 10 pedidos por dia (`bling`).
- Flex: quando a reputação permitir e der pra entregar no mesmo dia; o
  Programa Decola dá acesso (`ml-decola`).
- Full: só pra produto próprio, porque é o Mercado Livre guardando e
  despachando o seu estoque.
- Contador: se ainda não tem, agora.
- Sair do MEI (só quem é MEI): média acima de R$ 6.750 por mês, conversar com o contador
  (`mei-teto`).

Fechar dizendo que dali em diante o trabalho é na esteira: `/mercado-livre`.
