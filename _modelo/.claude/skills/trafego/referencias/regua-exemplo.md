# Régua de tráfego

O bloco abaixo é lido pelo `/trafego`. Edite os valores e mantenha os nomes das linhas.

```regua
objetivo: conversa
perfil: local
ticket: 60
margem_minima: 0
origem_do_resultado: meta
contas: 000000000000000
```

- `objetivo`: compra, lead ou conversa
- `perfil`: alto_ticket, low_ticket, leads ou local
- `ticket`: quanto vale um resultado, em reais
- `margem_minima`: piso de retorno abaixo do qual a venda dá prejuízo depois de taxa e imposto. A conta é 1 dividido pela margem de contribuição, e a margem de contribuição é o preço menos custo do produto, frete, taxa de pagamento e imposto, dividido pelo preço. Exemplo: produto de R$ 100 que deixa R$ 40 limpos tem margem 0,40, e 1 dividido por 0,40 dá `margem_minima: 2.5`. Zero quando não se aplica. Quanto maior esse número, mais rígida a régua fica: o piso sobe pra ele e a aprovação fica 30% acima do piso
- `origem_do_resultado`: deixe em `meta`. O valor `checkout` só passa a valer quando a medição de cobertura existir, e até lá a régua ignora a troca em silêncio e segue tratando o dado como vindo da plataforma
- `contas`: os identificadores das contas de anúncio vigiadas, separados por vírgula

## Como cheguei nesse ticket

De cada 10 conversas, 3 viram paciente. Cada paciente paga R$ 800, e 25% pode ir pra anúncio.
Três décimos de 800 são 240, e um quarto disso são R$ 60.
