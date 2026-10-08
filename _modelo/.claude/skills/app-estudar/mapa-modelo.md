# Mapa do app de referência: {{app}} ({{formato: site, celular ou computador}})

Recorte: {{o pedaço que vai ser construído}}
Pra quem: {{pra quem é o app novo}}
Data: {{AAAA-MM-DD}}

## Fontes

| # | fonte | link | notas |
| --- | --- | --- | --- |
| 1 | central de ajuda | | |

## Caminho principal

{{uma frase: a coisa pela qual o cliente paga}}

## Telas

| código | tela | como se chega nela | pra que serve | peças principais | estados vistos |
| --- | --- | --- | --- | --- | --- |
| T01 | | | | | vazia, preenchida, com erro |

## Caminhos

```
C01 {{objetivo}}
    T01 -> T02 -> T03
    cliques no caminho certo: {{n}}
    casos difíceis: {{casos}}
```

## Peças que se repetem

| peça | tipos | estados | aparece em |
| --- | --- | --- | --- |
| Botão | principal, secundário, discreto, perigo | normal, mouse em cima, selecionado, desativado, carregando | todas |

## Fichas que o sistema guarda

```
{{Ficha}}  {{campos}}
           prova: {{códigos de tela, artigos da ajuda}}
           certeza: alta | média | chute
```

Ligações: {{Cliente 1 pra vários Agendamentos, Serviço 1 pra vários Agendamentos, ...}}

## Lista de funções

Está em `funcoes.csv`. Obrigatórias: {{n}}, importantes: {{n}}, desejáveis: {{n}}, puladas: {{n}}.

## Fora do app (não dá ou não se deve trazer)

- {{conteúdo licenciado, a rede de clientes, acordo com parceiro, ...}}

## Tamanho

Telas {{n}}, caminhos {{n}}, fichas {{n}}. Partes difíceis: {{lista}}. Tamanho: {{P|M|G|GG}}.
