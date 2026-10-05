# Configuração de venda no Mercado Livre

O bloco abaixo é lido pelas skills do pacote. Edite os valores e mantenha os
nomes das linhas. O `/mercado-livre` monta ele por entrevista na primeira vez.

```mercado-livre
erp: nenhum
modelo: estoque
estado:
imposto_pct:
imposto_informado_em:
imposto_fonte:
margem_minima_rs:
margem_minima_pct:
margem_minima_kit_rs:
sku_prefixo:
deposito_id:
canal_id:
reputacao:
loja_oficial: nao
full: nao
guia_de_marca: marca/design-guide.md
fornecedores:
limite_gasto_usd: 4
```

- `erp`: `bling` ou `nenhum`. Com `nenhum`, o anúncio é criado pausado direto no Mercado Livre pela API (ou pelo checklist no painel, quando o produto tem variação)
- `modelo`: `dropshipping` (o fornecedor despacha em seu nome, sem estoque seu) ou `estoque` (você guarda e despacha). Muda o que a auditoria confere
- `estado`: a sigla do estado do seu CNPJ (exemplo: SP). No dropshipping, o fornecedor precisa ser do mesmo estado
- `imposto_pct`: a alíquota do mês sobre a venda, em porcentagem (exemplo: 6). Vem da contadora e muda; `imposto_informado_em` guarda a data (exemplo: 2026-09-01) e `imposto_fonte` quem informou (exemplo: contadora). MEI põe 0, porque o imposto dele é o valor fixo do DAS, pago todo mês, e escreve em `imposto_fonte`: MEI, imposto fixo no DAS
- `margem_minima_rs` e `margem_minima_pct`: o piso de lucro por venda, em reais e em porcentagem, abaixo do qual o anúncio novo reprova (exemplo: 8 e 15). `margem_minima_kit_rs` é o piso pra kit (exemplo: 12)
- `sku_prefixo`: as letras que abrem o código dos seus produtos no ERP (exemplo: LOJA, que vira `LOJA-DOC-001`)
- `deposito_id` e `canal_id`: só com ERP. O id do depósito onde entra o estoque e o id do canal do Mercado Livre dentro do ERP
- `reputacao`: a cor atual da sua conta (verde, amarela, laranja, vermelha ou nova; exemplo: verde). Muda o desconto de frete
- `loja_oficial` e `full`: `sim` ou `nao`
- `guia_de_marca`: o arquivo que manda no visual das fotos
- `fornecedores`: os nomes curtos das pastas em `fornecedores/`, separados por vírgula (exemplo: fornecedor-exemplo)
- `limite_gasto_usd`: teto de gasto por rodada de imagens: acima disso o sistema para e pede pra dividir o lote ou subir o teto
