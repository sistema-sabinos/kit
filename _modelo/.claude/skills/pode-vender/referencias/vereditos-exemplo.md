# Vereditos legais de produto

> Memória do crivo da `/pode-vender`. Cada entrada diz se este negócio pode
> vender aquele produto ou ingrediente, por quê, com a norma e a fonte.
>
> Como usar: antes de pesquisar um produto do zero, procurar aqui. Veredito
> vale pro ingrediente ou tipo, e não só pro código do produto.
>
> Validade: 6 meses. Regra sanitária muda. Veredito vencido se refaz, nunca se
> reaproveita.

---

## <produto ou ingrediente>: <PODE | PODE COM RESSALVA | NÃO PODE | INCONCLUSIVO> (AAAA-MM-DD, revalidar até AAAA-MM-DD)

- **Categoria:** <suplemento, elétrico, brinquedo...> · **Órgão:** <ANVISA, INMETRO, ANATEL, MAPA>
- **Motivo:** <1 a 3 linhas, direto>
- **Normas:** <as que decidem o caso>
- **Fontes consultadas:** <nome e endereço de cada uma, com a data>
- **Gate de marca:** <selo, data e arquivo em dados/gate-marca/, ou "não rodou">
- **Condições ou rota alternativa:** <o que fazer>
- **Ficha de conformidade:** <frase de regularização; alegações autorizadas, literais; palavras proibidas> ou "não se aplica"

---

## Exemplo preenchido (NÃO COPIAR: não vale como veredito)

### EXEMPLO Whey 900 g (suplemento), PODE COM RESSALVA, de 2026-09-29
- **Categoria:** suplemento · **Órgão:** ANVISA
- **Motivo:** rótulo e ingredientes dentro da lista autorizada; a marca está
  viva no Mercado Livre e sem dossiê, mas a busca da ANVISA não achou
  notificação ativa (essa busca é imprecisa).
- **Normas:** RDC 843/2024, art. 32, com o prazo da RDC 990/2025; IN 28/2018
- **Fontes consultadas:** consulta de alimentos da ANVISA e rótulo do produto, 2026-09-29
- **Gate de marca:** ATENÇÃO, 2026-09-29, `dados/gate-marca/fornecedor-exemplo-marcas-suplemento-2026-09-29.json`
- **Condições ou rota alternativa:** só anunciar depois que o fornecedor
  mandar o número de notificação e ele for conferido na consulta da ANVISA; sem
  número, só lote fabricado antes de 01/09/2026, dentro da validade, com nota
  fiscal.
- **Ficha de conformidade:** parcial: frase de regularização espera o número de
  notificação; alegações autorizadas: nenhuma até o número; palavras proibidas:
  doença, sintoma, parte do corpo
