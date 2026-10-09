# Modelo de descrição de anúncio

> Estrutura que toda descrição segue. A descrição ranqueia no Mercado Livre
> desde 2026-04-05 com o mesmo peso do título e da ficha, e continua editável
> depois da primeira venda, quando o título trava. É nela que entram as
> palavras que não couberam no título.

## Objetivo

Descrição que convence gente e ranqueia na busca ao mesmo tempo: as
palavras-chave mais buscadas entram nas posições de maior peso (primeira linha,
primeiro parágrafo, especificações), e o resto do texto responde às dúvidas e
objeções reais dos clientes, na língua deles.

## Os 10 blocos, nesta ordem

1. **Linha de abertura** (até 90 caracteres). Concentra as palavras-chave
   principais do nicho. Ela fica na primeira linha da descrição e funciona
   como reforço de busca; o título do anúncio é outro campo.
2. **Envio, garantia e nota fiscal**, num parágrafo só e destacado, porque são
   as três maiores preocupações de quem compra:

   ```
   ENVIO IMEDIATO | GARANTIA | NOTA FISCAL

   Pedido sai no mesmo dia útil. Acompanha nota fiscal eletrônica e tem a
   garantia de devolução do Mercado Livre.
   ```

   Adaptar ao que é verdade no seu negócio (drop com prazo do fornecedor diz o
   prazo real).
3. **Apresentação do produto** (1 linha), direta, com as palavras essenciais.
4. **Benefícios** (até 2 linhas, texto corrido, sem bullet): como o produto
   resolve o que o cliente veio resolver.
5. **Especificações técnicas**, em itens: marca (`Genérica` em kit, revenda e
   dropshipping; o nome do fabricante só quando você é a dona da marca ou
   revendedora autorizada por escrito, gravado em `marca_autorizada` na
   `decisao.json`; nunca o nome da loja), modelo, material, dimensões, peso, conteúdo da embalagem. Dado que
   não existe fica `[PREENCHER]`, nunca inventado; o `ml-auditor` reprova
   placeholder esquecido.
6. **Funções e características**, em itens: o que o produto faz e tem.
7. **Instruções de uso**, um parágrafo direto. É aqui que se calibra a
   expectativa que evita devolução ("instale onde pega sol direto", "lave só
   com água fria").
8. **Perguntas e respostas**: de 4 a 8, das perguntas reais dos anúncios
   concorrentes e das objeções das avaliações de 1 a 3 estrelas. Formato:

   ```
   P: Pergunta direta do cliente
   R: Resposta clara em 1 ou 2 frases
   ```

9. **Importante**, bloco fixo:

   ```
   Envio imediato. Pronta entrega para todo o Brasil. Acompanha nota fiscal.
   Dúvidas, pergunte aqui no anúncio.
   ```

   Adaptar ao que é verdade no seu negócio, como no bloco 2: drop diz o prazo
   real do fornecedor.

10. **Chamada final**, uma linha: ação clara com um gatilho honesto (prova
    social, autoridade, escassez real), sem agressividade.

## Regras de formato

Regra de plataforma envelhece: os itens abaixo foram lidos em 2026-09-23 e se
conferem ao vivo.

- Sem emoji e sem símbolo decorativo (marketplace rejeita ou exibe errado)
- Linha em branco entre o título de cada bloco e o conteúdo
- Garantia sem prazo em dias (a regra da plataforma muda e o texto ficaria
  errado)
- Sem preço, frete, desconto ou parcelamento no texto: o preço fica no campo
  dele, e o Clips e a descrição ficam no ar pra sempre
- Sem forma de contato (e-mail, site, telefone, WhatsApp, URL), nem do
  fabricante: derruba o anúncio
- Marca de concorrente só no bloco de perguntas, pra comparação técnica útil,
  nunca no título nem nos parágrafos principais
- Termos que o Mercado Livre proíbe fora do texto: "promoção", "grátis",
  "oferta", "brinde", "melhor", "original", porcentagem de desconto (lista
  conferida em 2026-09-23; conferir ao vivo)
- Produto regulado: a frase de regularização e as alegações literais da ficha
  de conformidade da `/pode-vender`, e nada de doença, sintoma ou parte do
  corpo

## Regras de tom

As de `_contexto/preferencias.md`, mais estas: nada de travessão, nada de "não
é X, é Y", nada de primeira pessoa robótica, nada de superlativo vazio ("o
melhor do mercado"). Falar pro comprador, não pro produto. Usar as palavras das
avaliações de 4 e 5 estrelas: elas vendem mais que adjetivo inventado.

## Quando adaptar

Categoria com regra própria (alimento exige advertência, suplemento exige a
ficha de conformidade) adapta o modelo, e a adaptação fica anotada no `copy.md`
do produto.
