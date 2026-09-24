# Contratos da esteira

> O que passa de uma etapa pra outra é JSON com a estrutura daqui. O Markdown
> (briefing, plano, `copy.md`) é a visão de gente; agente lê JSON e nunca
> reinterpreta Markdown. Criado na 3.6 do SabinOS.

## Onde cada coisa mora

```
fornecedores/<nome>/
  catalogo-analisado.csv           saída da /analisar-catalogo
  pesquisa-input-<categoria>.json  entrada da /pesquisar-tendencia
  _raw-pesquisa-<categoria>.json   coleta bruta
  pesquisa-tendencia-<categoria>.md e .csv
  concorrentes/<categoria>/<produto>.md, vocabulario.txt, atributos.json
  concorrentes/<categoria>/_raw-concorrentes-<produto>.json   coleta bruta da espionagem
  bling.json                       CNPJ do fornecedor e categorias no Bling (só com Bling)
  plano-anuncios-<categoria>.md    saída da /decidir-anuncio
anuncios/<slug>/
  copy.md                          copy pra gente ler
  fotos-cruas/                     fotos reais do produto, tiradas pela pessoa
  imagens/                         as imagens do anúncio, prontas
  publicacao-ml.md                 checklist de publicação
  bling-payload.json               o que a /cadastrar-bling manda pro Bling
dados/pipeline/
  _categorias/<fornecedor>-<categoria>.json
  <slug>/status.json, decisao.json, copy.json, imagens.json, auditoria.json, publicacao.json
dados/custos.jsonl                 um evento de gasto por linha
dados/decisoes.jsonl               ata do que foi decidido (inclusive "não mexer")
relatorios/                        auditoria da conta e Ads
dados/ads/                         guard-rails.json (o freio do Ads) e snapshots/
dados/auditoria/snapshots/         fotos da conta, uma por rodada da /auditar-conta
```

## 0. Arquivos do fornecedor (`fornecedores/<nome>/`)

`catalogo-analisado.csv`: a `/analisar-catalogo` escreve; `/pesquisar-tendencia`,
`/decidir-anuncio` e `/montar-anuncio` leem.

```csv
status,categoria,produto,ean,custo,peso_g,dimensoes_cm,variacoes,observacao
OK,doces,"Suspiro Tradicional 1 kg",7890000000000,30.00,1050,30x20x10,,
CUIDADO,doces,"Bala de Gengibre 500 g",,12.50,,,sabores,"veredito PODE COM RESSALVA: descrição sem citar efeito"
BLOQUEADO,eletronicos,"Fone sem fio",7890000000017,42.00,,,,"sem homologação da ANATEL"
```

`status` é `OK`, `CUIDADO` ou `BLOQUEADO`. `categoria` é o nome curto, sem
acento, que vira parte dos nomes de arquivo. Dinheiro com ponto decimal, peso
em gramas, dimensões em centímetros na ordem comprimento x largura x altura.
Campo sem dado fica vazio, nunca inventado.

`pesquisa-tendencia-<categoria>.csv`: a `/pesquisar-tendencia` escreve; a
`/decidir-anuncio` lê.

```csv
produto,custo,preco_min,preco_med,preco_max,margem_bruta_med,margem_pct,anuncios_livres,tem_catalogo,buybox_concorrentes,loja_oficial,nota,classificacao
"Suspiro Tradicional 1 kg",30.00,39.90,54.90,89.90,24.90,45.4,14,sim,3,nao,72,oportunidade forte
```

`margem_bruta_med` é `preco_med` menos `custo`, sem comissão, envio nem
imposto (a conta completa é da `/decidir-anuncio`, pela `precificacao.md`).
`nota` vai de 0 a 100; `classificacao` é `oportunidade forte`, `vale
considerar`, `desafiador` ou `fora`, e `sem dado` quando a busca não trouxe
preço (aí `nota` e os preços ficam vazios). `tem_catalogo` e `loja_oficial` são `sim`
ou `nao`.

`concorrentes/<categoria>/vocabulario.txt`: uma palavra por linha, seguida de
tabulação e de em quantos títulos do topo ela aparece, da mais frequente pra
menos frequente.

`concorrentes/<categoria>/atributos.json`: só atributo preenchido por 4 ou mais
anúncios do topo.

```json
{ "Marca": { "em_quantos": 4, "valores": ["Sem marca", "Genérica"] }, "Peso líquido": { "em_quantos": 5, "valores": ["1 kg", "500 g"] } }
```

## 1. `_categorias/<fornecedor>-<categoria>.json`

```json
{
  "fornecedor": "fornecedor-exemplo",
  "categoria": "doces",
  "etapas": {
    "pesquisa":   { "status": "ok", "em": "2026-09-23", "produtos": 25, "arquivos": ["fornecedores/fornecedor-exemplo/pesquisa-tendencia-doces.md"] },
    "espionagem": { "status": "ok", "em": "2026-09-23", "produtos_analisados": ["kit-5-suspiros"], "arquivos": ["fornecedores/fornecedor-exemplo/concorrentes/doces/"] },
    "decisao":    { "status": "aprovado", "em": "2026-09-23", "plano": "fornecedores/fornecedor-exemplo/plano-anuncios-doces.md", "anuncios_gerados": ["kit-5-suspiros"] }
  }
}
```

`status`: `pendente`, `rodando`, `ok`, `aprovado`, `erro` ou `parcial`.

## 2. `<slug>/status.json` (o coração)

```json
{
  "slug": "kit-5-suspiros",
  "fornecedor": "fornecedor-exemplo",
  "categoria": "doces",
  "etapa_atual": "copy",
  "etapas": {
    "decisao":    { "status": "aprovado", "em": "2026-09-23", "aprovado_por": "usuario" },
    "copy":       { "status": "ok", "em": "2026-09-23", "arquivo": "anuncios/kit-5-suspiros/copy.md" },
    "imagens":    { "status": "pendente" },
    "auditoria":  { "status": "pendente" },
    "cadastro":   { "status": "pendente" },
    "publicacao": { "status": "pendente" }
  },
  "pendencias": ["confirmar alérgenos com o fornecedor"],
  "bloqueios": []
}
```

`etapa_atual`: `decidido`, `copy`, `imagens`, `auditado`, `cadastrado`,
`publicado` ou `pausado`. `pendencias` não travam; `bloqueios` travam, e o
agente para e avisa.

## 3. `<slug>/decisao.json` (a etapa 4, escrita no chat com a pessoa)

```json
{
  "slug": "kit-5-suspiros",
  "tipo": "kit",
  "composicao": [{ "produto": "Suspiro 100g", "custo": 4.5, "qtd": 5 }],
  "custo_total": 22.5,
  "posicionamento": "premium",
  "preco": { "tabela": 56.7, "alvo_pos_desconto": 49.9, "margem_projetada_rs": 10 },
  "titulo_keywords": ["kit", "suspiros", "500g", "festa"],
  "fotos": { "qtd": 7, "slots": [{ "n": 1, "papel": "capa", "mostra": "kit completo", "regras": "fundo branco, sem texto" }] },
  "justificativa": "preço individual saturado; kit foge da comparação direta",
  "riscos": ["loja oficial domina o individual"],
  "aprovado": true,
  "aprovado_em": "2026-09-23"
}
```

## 4. `<slug>/copy.json` (copywriter escreve; designer, auditor e publicador leem)

```json
{
  "slug": "kit-5-suspiros",
  "titulo": "Kit 5 Suspiros 500g Sabores Sortidos Festa Lembrancinha",
  "descricao": "<texto completo>",
  "ficha": { "Marca": "Sem marca", "Peso líquido": "500g" },
  "precos": { "ml_classico": 49.9, "ml_premium": 52.9 },
  "margem_provisoria_rs": 10,
  "gtin": null,
  "ncm": "1905.90.90",
  "keywords_plantadas": ["kit suspiro", "suspiro sortido", "doce pra festa"],
  "mapa_fotos": [
    { "n": 1, "arquivo": "01-capa.jpg", "papel": "capa", "mostra": "kit completo, fundo branco" },
    { "n": 2, "arquivo": "02-sabores.jpg", "papel": "infografico", "mostra": "os 5 sabores nomeados" }
  ],
  "faq": [{ "pergunta": "Tem glúten?", "resposta": "...", "fonte": "perguntas reais dos concorrentes" }]
}
```

Um título só e uma capa só: é um anúncio por produto. `Marca` é a do
fabricante ou `Sem marca`, nunca a da loja. `gtin` fica `null` quando não há
código confiável, e kit montado por você nunca tem GTIN. `ncm` vem do
fornecedor ou da contadora; sem dado, `null` e pendência.

## 5. `<slug>/imagens.json` (designer escreve)

```json
{
  "slug": "kit-5-suspiros",
  "formato": "1:1",
  "imagens": [
    { "n": 1, "arquivo": "anuncios/kit-5-suspiros/imagens/01-capa.jpg", "papel": "capa", "aprovada": true },
    { "n": 2, "arquivo": "anuncios/kit-5-suspiros/imagens/02-sabores.jpg", "papel": "infografico", "aprovada": true }
  ],
  "custo_usd_total": 0,
  "aprovado_pelo_usuario": true,
  "em": "2026-09-23"
}
```

As imagens ficam no computador. O envio pro anúncio é pelo painel, e o
checklist de publicação diz a ordem.

## 6. `<slug>/auditoria.json` (auditor escreve, publicador exige)

```json
{
  "slug": "kit-5-suspiros",
  "veredito": "aprovado",
  "modalidade_escolhida": "classico",
  "checks": {
    "titulo_max_60": { "ok": true, "valor": 56 },
    "margem_recalculada": { "ok": true, "detalhe": "R$ 10,02 com comissão 14% e imposto 6%" },
    "capa_fundo_branco_sem_texto": { "ok": true },
    "termos_proibidos": { "ok": true },
    "veredito_legal": { "ok": true, "detalhe": "PODE, 2026-09-01" },
    "sem_contato_externo": { "ok": true }
  },
  "falhas": [],
  "em": "2026-09-23"
}
```

`veredito`: `aprovado` ou `reprovado`. `modalidade_escolhida` (`classico` ou
`premium`) é a que o simulador apontou com mais lucro líquido. Em `falhas`,
cada item diz o que corrigir e quem corrige (`copywriter`, `designer` ou
`decisao`).

## 7. `<slug>/publicacao.json`

```json
{
  "slug": "kit-5-suspiros",
  "erp": { "sistema": "bling", "id": 0, "sku": "LOJA-DOC-001", "em": "2026-09-23" },
  "canais": [{ "canal": "mercado-livre", "anuncio_id": "", "modalidade": "classico", "preco": 49.9, "em": "2026-09-23" }]
}
```

Sem ERP, `erp` fica `null`. `anuncio_id` é o código que o Mercado Livre dá ao
anúncio, informado pela pessoa depois de publicar.

A `/cadastrar-bling` cria o arquivo com o bloco `erp` e `canais` vazio; a
`/publicar-marketplace` só acrescenta em `canais`.

## 8. `dados/custos.jsonl`

```json
{"em":"2026-09-23T14:00:00Z","servico":"gemini-imagem","usd":0.13,"contexto":"designer kit-5-suspiros"}
```

## 9. `dados/decisoes.jsonl` (a ata)

Uma decisão por linha. Linha nunca se edita nem se apaga: pra reabrir,
grava-se outra pro mesmo alvo, e a mais recente é a que vale.

```json
{"ts":"2026-09-23T14:00:00.000Z","escopo":"ads","alvo":{"id":"123","nome":"Campanha kits"},"decisao":"nao_mexer","resumo":"deixar aprender mais uma semana","motivo":"o lance mudou há 3 dias","baseline":{"acos_7d":0.18},"reavaliar_em":"2026-09-30","esperado":"ACOS abaixo do teto"}
```

`escopo` é `ads` (campanha, na `/mercado-ads`) ou `conta` (anúncio, na
`/auditar-conta`). `decisao` é livre (`nao_mexer`, `reduzir`, `pausar`,
`aposentar`). Obrigatórios: `ts` (data e hora ISO), `escopo`, `alvo.id`,
`decisao`, `resumo`, `motivo` e `baseline` (pode ser `{}`). Sem
`reavaliar_em`, vale 7 dias; `permanente: true` cala de vez e não leva
`reavaliar_em`. Quem lê e grava é `mercado-livre/scripts/lib/decisoes.mjs`.

## Regras gerais

- Data em ISO (`AAAA-MM-DD`; com hora, ISO 8601)
- Dinheiro em número, em reais, salvo campo com sufixo `_usd`
- Quem escreve um contrato é dono dele; os outros só leem
- Campo desconhecido: `null`, nunca inventado
- `status.json` é atualizado pelo `/mercado-livre` ou pelo agente ao fechar a etapa dele
