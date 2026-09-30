---
name: pode-vender
description: >
  Crivo legal de produto, o gate 0 da esteira do Mercado Livre. Antes de gastar pesquisa,
  foto, cadastro ou estoque num produto novo, descobre se você pode vendê-lo: se a marca
  ainda vive no Mercado Livre e está limpa na ANVISA, categoria
  regulatória, órgão competente (ANVISA, INMETRO, ANATEL, MAPA), listas de proibidos e
  restritos, exigências do vendedor (CNAE, alvará, notificação) e as regras do marketplace.
  Toda consulta é feita na hora em fonte oficial, e o veredito tem validade de 6 meses.
  Use quando o usuário chamar /pode-vender, disser "posso vender isso?", "isso é legal?",
  "precisa de registro na ANVISA?", "precisa de selo do INMETRO?", "vai dar problema no
  Mercado Livre?", ou sempre que um produto novo entrar na esteira.
---

# /pode-vender, o crivo legal antes de investir no produto

## Por que essa skill existe

Um produto pode liderar a pesquisa de mercado, ter os concorrentes espionados e
uma amostra comprada, e só no rótulo aparecer que ele pertence a uma categoria
que o órgão regulador proíbe fora de farmácia. O mercado gordo que a pesquisa
mediu era mercado irregular, e quem revende responde (multa, apreensão,
interdição). Semanas de trabalho num produto que nunca poderia ser anunciado.

O erro de método é sempre o mesmo: conferir a lista de vetos nominais do
marketplace, onde o produto não aparece, em vez da lista de ingredientes ou
produtos autorizados do órgão; e confiar no volume de anúncios como sinal de que
pode. Volume de anúncio prova só que a fiscalização é reativa.

## Quando roda

- Gate 0 da esteira: produto novo entra aqui antes da pesquisa de mercado.
  Reprovado não avança e não consome pesquisa.
- Fornecedor novo: antes de fechar, rodar em 3 a 5 produtos representativos do
  catálogo dele. O que o crivo revela sobre um costuma valer pro catálogo
  inteiro. Comece pelo gate de marca com a lista de marcas dele (`--marcas`):
  marca reprovada tira do caminho todos os produtos dela de uma vez.
- Avulso, quando a pessoa perguntar "posso vender X?".
- Revalidação: veredito com mais de 6 meses vence e se refaz do zero. Regra
  sanitária muda.

## Dependências

- `_contexto/empresa.md`: o ramo, o CNPJ e o que já está anotado sobre
  restrições do negócio
- `_contexto/mercado-livre.md`: os fornecedores e se o estoque é próprio ou
  drop (muda a exigência de alvará)
- `_contexto/vereditos-legais.md`: a memória dos vereditos. Não existe na
  primeira vez: criar copiando `referencias/vereditos-exemplo.md`
- `_contexto/conformidade/<nicho>/`: a pasta de conformidade do nicho, quando o
  ramo é regulado (seção "A pasta de conformidade do seu nicho")
- O Chrome dedicado do pacote Mercado Livre, pro gate de marca (passo 0). Na
  primeira vez: `npm install --prefix .claude/skills/mercado-livre` (uma vez,
  baixa o Playwright) e `node .claude/skills/mercado-livre/scripts/abrir-chrome.mjs`

Caminhos que começam em `referencias/` são relativos à pasta desta skill;
`_contexto/` é da raiz do projeto.

## Regra de ouro

Nunca responder de memória. Todo veredito sai de consulta feita agora, em fonte
oficial, com a data registrada. Se a busca não achar, o veredito é
INCONCLUSIVO, nunca "deve poder".

Segunda regra: ler o rótulo do produto físico sempre que ele existir. O rótulo
declara a categoria regulatória (suplemento alimentar, fitoterápico,
medicamento, cosmético), e é ela que decide tudo. Serve o rótulo real, nunca a
foto de catálogo do fornecedor.

## Procedimento

### 0. Gate de marca: essa marca pode ser anunciada?

"Posso vender este produto?" e "posso anunciar esta marca?" são duas perguntas,
e a segunda é mais barata. O Mercado Livre pode limpar uma marca inteira do site
sem avisar ninguém, e a ANVISA pode ter apreendido a marca inteira. Quem pula
essa pergunta gasta pesquisa, foto e cadastro num produto que nunca ia subir.

Rodar da raiz do projeto, com a categoria do produto (`suplemento`, `alimento`,
`cosmetico`, `saneante` ou `outra`):

    node .claude/skills/pode-vender/scripts/gate-marca.mjs --categoria suplemento --marca "Nome da Marca"

Com a lista de marcas de um fornecedor, um arquivo JSON
`{ "marcas": ["Marca A", { "marca": "Marca B", "aliases": ["Linha X"] }] }`
(apelido é o nome de linha que a marca usa sem citar o próprio nome):

    node .claude/skills/pode-vender/scripts/gate-marca.mjs --categoria cosmetico --marcas fornecedores/<fornecedor>/marcas.json

O que ele mede, de graça:

| Gate | Pergunta | Quando roda |
|---|---|---|
| A | a marca aparece no Mercado Livre hoje? | sempre |
| B | a ANVISA já apreendeu ou proibiu produto da marca? | suplemento, alimento, cosmético, saneante |
| C | a marca tem produto notificado ativo na ANVISA? | suplemento |

Toda rodada mede antes uma marca de controle, que sabidamente vende
(`Max Titanium` pra suplemento, `Nestlé` pra alimento, `Nivea` pra cosmético,
`Ypê` pra saneante, `Tramontina` pra outra; troca com `--controle "Outra"`).
Se o controle falha, quem quebrou foi a leitura, e tudo sai INCONCLUSIVO.

A ANVISA tem uma verificação anti-robô. O script abre a página de consultas no
Chrome dedicado e espera o próprio site liberar; às vezes isso leva uns
minutos na primeira consulta, e o terminal avisa enquanto espera. Se em 4
minutos não liberar, a marca sai INCONCLUSIVO: seguir com a busca manual da
seção 3 ("[marca] ANVISA irregular") e rodar o gate de novo mais tarde. Ela
também trava quando recebe muitas consultas seguidas (umas 20 em 10
minutos): rode no máximo 5 marcas por vez e, se travar, espere uns 20
minutos.

Como ler o selo:

- **PODE**: marca viva no Mercado Livre, sem dossiê, e a busca da ANVISA achou
  produto notificado ativo. O resultado lista o número, o produto e a
  empresa: confira que é mesmo da sua marca, porque essa busca da ANVISA traz
  produto de outras empresas junto. O número vai pra ficha de conformidade.
- **PODE MENOS OS VETADOS**: a marca passa, mas os produtos listados têm
  medida da ANVISA e não entram.
- **PODE NA MARCA**: a marca passou; o produto segue pelos passos 1 a 7.
- **ATENÇÃO**: tem sinal pra conferir antes de investir. Três casos: a marca
  não aparece no Mercado Livre mas a busca veio cheia de outras coisas; a
  ANVISA tem medida que cita a marca inteira, mas a marca segue viva no
  Mercado Livre (a medida pode ser contra um revendedor: abrir o dossiê e ver
  a empresa); ou, em suplemento, a busca não achou notificação ativa. Nesse
  último, peça o número ao fornecedor e confira; sem número, só lote
  fabricado antes de 01/09/2026 (fim do prazo de adequação da RDC 843/2024),
  dentro da validade, com nota fiscal.
- **NÃO PODE**: com o motivo e a rota. Sai quando a marca sumiu do Mercado
  Livre com a busca magra, ou quando a ANVISA tem medida contra a marca
  inteira e a marca também sumiu ou está rara no Mercado Livre.
- **INCONCLUSIVO**: vale como NÃO PODE até resolver.

O resultado completo fica em `dados/gate-marca/<nome>-<categoria>-<data>.json`
(rodada nova nunca apaga a anterior). O selo do gate é da marca, nunca do
produto, e não vira entrada própria no `_contexto/vereditos-legais.md`:

- NÃO PODE e INCONCLUSIVO param aqui. O produto não segue pros passos
  seguintes, e a entrada dele no passo 7 registra NÃO PODE ou INCONCLUSIVO com
  o motivo do gate.
- Qualquer outro selo segue pros passos 1 a 7, e o veredito do produto sai de
  lá. ATENÇÃO e PODE MENOS OS VETADOS entram como ressalva: o produto sai no
  máximo PODE COM RESSALVA até o ponto do gate ser conferido.
- No passo 7, a entrada do produto ganha a linha **Gate de marca**, com o
  selo, a data e o arquivo.

### 1. Identificar o que o produto é

Antes de qualquer busca, classificar. A categoria regulatória decide o órgão, e
o órgão decide as regras.

| Se o produto... | Categoria | Órgão | O que investigar |
|---|---|---|---|
| se ingere e tem nutriente ou ativo isolado | suplemento alimentar | ANVISA | ingrediente autorizado, dose, notificação |
| se ingere e é planta ou extrato | fitoterápico ou suplemento (depende do rótulo) | ANVISA | espécie autorizada, categoria no rótulo, canal de venda |
| se ingere e é comida | alimento | ANVISA, e MAPA se for de origem animal | alérgenos, rotulagem, registro no MAPA |
| passa na pele ou no cabelo | cosmético | ANVISA | grau 1 ou 2, notificação ou registro |
| limpa ou desinfeta | saneante | ANVISA | notificação; "mata vírus" é alegação regulada |
| liga na tomada ou tem bateria | elétrico | INMETRO | certificação compulsória, plugue no padrão brasileiro |
| tem Bluetooth, Wi-Fi ou rádio | telecom | ANATEL | homologação obrigatória |
| é feito pra criança até 14 anos | brinquedo | INMETRO | certificação compulsória sempre, selo obrigatório |
| encosta em comida ou bebida | contato com alimento | ANVISA | material aprovado, migração |
| é EPI, arma, químico controlado, tabaco, medicamento | restrito | vários | provavelmente NÃO PODE; confirmar |

Na dúvida entre duas categorias, investigar as duas. É barato.

### 2. Ler o rótulo real

Se existe pote, caixa ou foto legível, extrair e registrar:

- Como o produto se autodeclara (a frase exata: "suplemento alimentar",
  "produto tradicional fitoterápico", "produto notificado nos termos da...")
- Número de registro ou notificação, ou a frase de dispensa, com a norma citada
- Fabricante, CNPJ, responsável técnico e conselho (CRN, CRF, CREA)
- Composição e ingredientes, literal
- Advertências obrigatórias
- EAN, lote, validade

Sinal de alerta forte: rótulo que cita norma revogada (suplemento citando regra
anterior à RDC 843/2024, por exemplo) e rótulo com linguagem de medicamento
nas advertências. Os dois merecem checagem redobrada, e o fornecedor precisa
apresentar o comprovante de notificação ou registro.

### 3. Consultar as fontes oficiais

Sempre por busca e leitura ao vivo, anotando a data ao lado de cada fonte. Os
pontos de partida abaixo foram conferidos em 2026-09-23; norma muda e link
quebra, então a primeira coisa é confirmar que cada um ainda vale.

**ANVISA.** A consulta pública de produtos (`consultas.anvisa.gov.br`, que
inclui a busca de alimentos e suplementos notificados). A lista de
constituintes autorizados em suplemento, com limites de dose e as alegações
permitidas (IN 28/2018): ingrediente fora dela não pode ser suplemento. As
espécies vegetais proibidas ou restritas (IN 410/2025). A regra dos suplementos
e a notificação obrigatória (RDC 243/2018, RDC 843/2024 com a IN 281/2024, e os
prazos alterados pela RDC 990/2025). Fitoterápicos (RDC 1.004/2025, que revogou
a RDC 26/2014). Dispensação de medicamento privativa de farmácia e drogaria
(Lei 5.991/73, art. 6º). Infrações sanitárias e multas (Lei 6.437/77). A base
de produtos e empresas irregulares: buscar "[marca] ANVISA irregular"; marca
com dossiê de proibição some do Mercado Livre inteiro, inclusive o seu
anúncio.

**INMETRO.** A lista de produtos com certificação compulsória e a consulta de
registro de objeto. Elétrico, brinquedo, capacete, artigo infantil e material
de construção quase sempre exigem. Sem selo em produto compulsório, o anúncio
cai e a responsabilidade é sua.

**ANATEL.** A consulta de homologação. Qualquer coisa com Bluetooth ou Wi-Fi
precisa, inclusive fone e lâmpada inteligente.

**MAPA.** Produto de origem animal, ração, fertilizante e bebida.

**O marketplace.** As regras dele são mais restritas que a lei, e são elas que
derrubam o anúncio. Na Central de Vendedores do Mercado Livre: as regras para
venda de suplementos, o que são alegações terapêuticas, os produtos que
dependem de aprovação de órgãos (política 1072: a descrição precisa do número
de registro ou da observação de que o órgão foi comunicado) e medicamentos e
produtos para saúde. Amazon e Shopee têm categoria com liberação prévia (nota
fiscal, alvará, CNAE compatível); conferir a exigência do dia antes de contar
com o canal.

### 4. Checar o lado do vendedor

O produto pode ser legal e você ainda não poder vendê-lo.

- CNAE: a atividade está no seu CNPJ? Alimento e suplemento pedem CNAE de
  comércio varejista compatível; produto farmacêutico pede outro.
- Alvará sanitário municipal: obrigatório pra quem armazena alimento ou
  suplemento. Em drop, a responsabilidade sanitária é do fornecedor; estoque
  próprio muda isso.
- AFE (autorização de funcionamento): exigida de quem fabrica, importa,
  distribui ou armazena medicamento, cosmético e saneante; o comércio varejista
  de cosmético, produto de higiene, perfume e saneante é dispensado (RDC
  16/2014, art. 5º, conferido em 2026-09-23; conferir ao vivo). Varejo de
  medicamento é coisa de farmácia e drogaria, que pedem AFE. Alimento não pede.
- Documento do fornecedor: nota fiscal, licença sanitária dele e o comprovante
  de notificação ou registro do produto. Fornecedor que não apresenta é
  bandeira vermelha sobre o catálogo inteiro.

### 5. Dar o veredito

Quatro níveis, sempre com a razão e a fonte:

- **PODE**: produto regular, categoria compatível, marketplace aberto, você
  habilitado. Segue pra esteira.
- **PODE COM RESSALVA**: pode vender, com condição dura e explícita ("desde
  que a descrição nunca cite doença", "na Shopee só depois de liberar a
  categoria", "assim que a nota fiscal do fornecedor chegar"). A ressalva vira
  pendência em `status.json`, e o `ml-auditor` cobra antes de publicar.
- **NÃO PODE**: com o motivo, a norma e, obrigatoriamente, a rota alternativa
  mais próxima: outro fornecedor, outra forma do mesmo produto, outro canal, ou
  "reavaliar se a norma X mudar". Nunca entregar beco sem saída.
- **INCONCLUSIVO**: não achei fonte confiável. Vale como NÃO PODE até resolver,
  e a resposta diz exatamente qual pergunta fazer e pra quem (fornecedor,
  contadora, vigilância municipal, canal de ajuda do marketplace).

### 6. Produto regulado: a ficha de conformidade do anúncio

O veredito de produto sozinho não protege: um anúncio de produto regular cai em
minutos se a descrição fala de finalidade fora da lista autorizada ou não
declara a regularização. Toda rodada de produto regulado (suplemento, alimento,
cosmético, saúde) entrega, junto do veredito, uma ficha com três campos, que o
`ml-copywriter` copia e o `ml-auditor` confere:

- **Frase de regularização** que vai na descrição: o número de notificação ou
  registro, ou a observação de que o órgão foi comunicado, com a norma citada.
- **Alegações autorizadas**, transcritas literalmente da norma aplicável, com o
  requisito de quantidade mínima e a fonte. Se não existe alegação pro ativo,
  escrever "nenhuma: o anúncio não fala de finalidade".
- **Palavras proibidas** naquele caso (doença, sintoma, parte do corpo), pra
  virar busca automática na copy e no texto das imagens.

### 7. Gravar o veredito

Toda rodada acrescenta uma entrada em `_contexto/vereditos-legais.md`, no
formato do `referencias/vereditos-exemplo.md`:

```
## <produto ou ingrediente>: <VEREDITO> (AAAA-MM-DD, revalidar até AAAA-MM-DD)
- **Categoria:** <suplemento, elétrico...> · **Órgão:** <ANVISA, INMETRO...>
- **Motivo:** <1 a 3 linhas, direto>
- **Normas:** <as que decidem o caso>
- **Fontes consultadas:** <nome e endereço, com a data>
- **Gate de marca:** <selo, data e arquivo em dados/gate-marca/, ou "não rodou">
- **Condições ou rota alternativa:** <o que fazer>
- **Ficha de conformidade:** <os três campos da seção 6, ou "não se aplica">
```

Veredito serve pro ingrediente ou tipo, e não só pro código do produto: "essa
espécie não pode" vale pra ela em qualquer marca. Antes de pesquisar do zero,
ler o arquivo: veredito válido se reaproveita, dizendo a data. Veredito
corrigido depois ganha um parágrafo datado abaixo da entrada original, nunca
edita o que estava escrito: o histórico do erro é parte da proteção.

## A pasta de conformidade do seu nicho

Ramo regulado merece memória própria, porque a pesquisa é cara e a regra muda.
Na primeira rodada de um nicho regulado, criar `_contexto/conformidade/<nicho>/`
com:

- `README.md`: as regras que valem pro nicho, uma por parágrafo, cada uma com
  norma, data da leitura e "revalidar até" 6 meses depois
- `fontes/`: o texto salvo de cada norma ou página lida, com a data no nome do
  arquivo (`in28-2018-lida-AAAA-MM-DD.txt`), porque a página de amanhã pode
  ser outra
- `fichas.md`: as fichas de conformidade de anúncio da seção 6, uma por produto

A pasta é lida antes de qualquer veredito novo do mesmo nicho, e o `README.md`
vencido se refaz antes de reaproveitar qualquer coisa dele.

## Regras duras

1. Reprovar é barato; anúncio irregular é caro. Na dúvida, reprova e investiga.
2. Nunca usar "tem muita gente vendendo" como argumento.
3. Ingrediente por ingrediente em fórmula combinada. Basta um proibido pra
   derrubar o produto inteiro.
4. Nunca inventar número de registro, notificação ou norma. Não achou: é
   INCONCLUSIVO.
5. Sem aconselhamento jurídico definitivo. A skill levanta e documenta o risco
   com fonte. Decisão que envolve CNPJ, tributo e alvará passa pela contadora
   e pela vigilância municipal, e a resposta diz isso.
6. Marca com dossiê que cita a marca inteira ("TODOS OS ... MARCA X") é NÃO
   PODE quando a marca também sumiu ou está rara no Mercado Livre: o
   marketplace remove a marca inteira, e o seu anúncio junto. Com a marca
   viva no Mercado Livre, é ATENÇÃO até conferir contra quem é a medida.
   Dossiê de um produto só veta aquele produto (PODE MENOS OS VETADOS).

## O que essa skill não faz

- Não substitui contadora, advogado nem vigilância sanitária.
- Não escreve nem revisa a copy (isso é a `/montar-anuncio` e o `ml-auditor`,
  que usam a ficha da seção 6).
- Não audita anúncio já publicado (a `/auditar-conta` faz isso, e chama esta
  skill quando encontra produto sem veredito).
- Não fala de imposto, ICMS-ST nem NCM: é assunto da contadora.

## Saída no chat

Curto. Veredito na primeira linha, motivo em até 3 linhas, condições ou rota
alternativa, e o caminho do arquivo onde gravou. O detalhamento vai pro
arquivo.
