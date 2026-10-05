---
name: trafego
description: >
  Cuida do tráfego pago no Instagram e no Facebook (Meta Ads) com método fechado: calcula
  quanto vale um resultado, mede o ponto de empate, classifica cada anúncio em quatro
  faixas e propõe o que cortar e o que escalar. Nada é aplicado na conta sem o "pode ir"
  do usuário. Use quando o usuário chamar /trafego ou falar de anúncio pago no Instagram
  ou no Facebook: "como estão meus anúncios do Instagram", "o que está queimando dinheiro
  na Meta", "o que eu devo pausar", "quanto posso pagar por um lead", "audita minha conta
  de anúncios do Facebook". Anúncio pago do Mercado Livre é com o /mercado-ads; se a
  pessoa disser só "meus anúncios", perguntar de qual plataforma.
---

# /trafego, Anúncio julgado por régua

Esta skill lê, calcula e propõe. Quem aplica na conta é o usuário aprovando, uma ação por vez.

## Dependências

- `_contexto/trafego.md`, a régua do negócio, criada pela entrevista abaixo
- `_contexto/empresa.md`, o que se vende, pra quem e com que margem
- A conta de anúncio conectada pelo `/conectar`, ou um export em `dados/trafego/`

Os caminhos que começam em `referencias/` e `scripts/` são relativos à pasta desta skill, e os que começam em `_contexto/` e `dados/` são relativos à raiz do projeto.

## Primeiro de tudo: existe régua?

Se `_contexto/trafego.md` não existir, rodar a entrevista antes de abrir qualquer número de conta. Julgar anúncio sem saber quanto vale um resultado é chute com cara de método.

## A entrevista

Três perguntas, uma por mensagem, no formato de 4 partes (pergunta simples, por que pergunto, exemplos, repergunta se vier vago). Nesta ordem:

**1. O que conta como resultado pro seu negócio?**

- Por que pergunto: a régua inteira e o evento que a plataforma persegue mudam com a resposta.
- Exemplos: "compra no site", "lead no formulário", "conversa no WhatsApp".
- Vira o campo `objetivo`, com o valor `compra`, `lead` ou `conversa`.

**2. Quanto vale um desses, em reais?**

- Por que pergunto: é o ticket, e todo limite do método é múltiplo dele. Sem ticket não existe corte.
- Se o objetivo é compra, o ticket é o preço do produto, direto.
- Se é lead ou conversa, não existe preço de prateleira, então perguntar as três coisas da conta do ticket: de cada 10 pessoas que entram em contato quantas viram cliente pagante, quanto esse cliente paga, e que fatia dessa receita pode ir pra anúncio depois de custo e imposto. A conta está na seção "O ticket" do `referencias/metodo.md`.
- Fazer a conta e devolver o número em voz alta: "um contato vale até R$ X pra você". O usuário precisa ouvir o ticket antes de ver o primeiro corte.

**3. Quanto tempo leva entre o clique e esse resultado acontecer de verdade?**

- Por que pergunto: esse prazo define o perfil de nicho e quantos dias esperar antes de julgar um anúncio.
- Exemplos: "compram na hora", "respondem no dia e fecham na semana", "demora um mês de conversa".
- Cruzar a resposta com a tabela de perfis do `referencias/metodo.md`, propor o perfil (`alto_ticket`, `low_ticket`, `leads` ou `local`) e confirmar com o usuário.

Ao fim, gravar `_contexto/trafego.md` copiando `referencias/regua-exemplo.md` e trocando os valores do bloco marcado como `regua` pelas respostas. Manter os nomes das linhas, que são o que o script lê. Os três campos que a entrevista não pergunta: `margem_minima` fica em zero enquanto o usuário não declarar um piso próprio de prejuízo, `origem_do_resultado` fica em `meta` enquanto o resultado vier da própria plataforma, e `contas` recebe os identificadores das contas vigiadas.

Mostrar o bloco gravado na conversa e perguntar se ficou certo.

## A leitura da conta

Três fontes, na ordem de atrito, da menor pra maior:

1. O MCP de anúncios, se estiver conectado. É o caminho normal.
2. Um export do gerenciador, colado ou salvo em `dados/trafego/`.
3. Um print lido na conversa, quando não houver outro jeito.

Seja qual for a fonte, o resultado vira sempre o mesmo extrato em JSON, salvo em `dados/trafego/conta-AAAA-MM-DD.json`:

```json
{
  "conta": "<id da conta>",
  "de": "<AAAA-MM-DD>", "ate": "<AAAA-MM-DD>", "hoje": "<AAAA-MM-DD>",
  "resultado_ate": "<AAAA-MM-DD, até quando o resultado já está contabilizado>",
  "gasto_lido_em": "<AAAA-MM-DD, quando o gasto foi lido>",
  "anuncios": [
    {
      "id": "<id>", "nome": "<nome do anúncio>", "campanha": "<id da campanha>",
      "ativo": true,
      "gasto": "<número>", "resultados": "<número>", "receita": "<número>",
      "orcamento_dia_campanha": "<número>",
      "ctr": "<número>", "ctr_base": "<número>",
      "cpm": "<número>", "cpm_base": "<número>",
      "frequencia": "<número>",
      "semana": { "gasto": "<número>", "resultados": "<número>", "receita": "<número>" }
    }
  ]
}
```

O que está entre `<>` se troca pelo dado real, e o que está escrito `<número>` entra sem aspas. O que cada campo muda no julgamento:

- `receita` só pesa quando o objetivo é compra. Em lead e conversa o script multiplica os resultados pelo ticket sozinho.
- `campanha` e `orcamento_dia_campanha` são o que deixa o script apurar a fatia diária de cada anúncio. Sem eles, a regra de corte por retorno não roda.
- `ctr_base` e `cpm_base` são a referência de quando o anúncio ainda estava saudável. São eles que separam criativo cansando de criativo queimando.
- `frequencia` só pesa no perfil local.
- `ativo` diz se o anúncio ainda está rodando. Marcar `true` num anúncio já pausado faz a skill propor pausar o que já está parado, e ainda encolhe a fatia diária dos vizinhos da mesma campanha, porque a fatia é o orçamento dividido pelos ativos. Fatia menor deixa a régua mais agressiva com quem está rodando de verdade.
- `semana` é o acumulado da janela de proteção. Sem ele, um dia magro derruba anúncio que já se pagou na semana.
- `resultado_ate` na prática é obrigatório: é ele que denuncia dado parado e segura o corte.

## O cálculo, sempre pelo script

Nunca calcular de cabeça e nunca falar número que não saiu daqui:

```bash
node .claude/skills/trafego/scripts/regua.mjs --dados dados/trafego/conta-AAAA-MM-DD.json --regua _contexto/trafego.md
```

Roda da raiz do projeto. Sem `--regua`, ele procura `_contexto/trafego.md` sozinho. Com `--json` no fim, devolve o quadro estruturado em vez do texto, pra outra ferramenta ler.

Se o script reclamar (bloco `regua` ausente, ticket faltando, `--dados` sem caminho, conta do extrato fora da linha `contas` da régua), a própria mensagem de erro diz o que fazer. Corrigir e rodar de novo, nunca contornar o script.

## Como ler o quadro pro usuário

Os alertas que o script devolver (dado parado, anúncio sem orçamento da campanha, teto de cortes batido) vêm antes de tudo, em voz alta. Teto batido quer dizer que a rodada não entrega lista de corte nenhuma: o que se confere primeiro é o ticket. Anúncio sem orçamento da campanha quer dizer que a regra de corte por retorno ficou desligada nele, então a rodada não confirma que está tudo bem: o que destrava é trazer `orcamento_dia_campanha` e `campanha` de cada anúncio.

Depois, nesta ordem:

1. **CRÍTICO**, um por linha, com o motivo que o script deu em cada um. É a proposta de pausa.
2. **PASSE**, a lista de quem merece mais verba.
3. **AVISO**, quem pede ângulo novo sem mexer na verba.
4. **RONDA** só se o usuário perguntar. É a lista mais longa e não pede ação nenhuma.

## Campanha nova

A estrutura do teste (quantas campanhas, quantos conjuntos de anúncio e quantos anúncios em cada um) e o orçamento diário inicial saem da tabela de perfis do `referencias/metodo.md`, junto com quantos dias esperar antes de julgar. Copy e criativo saem das skills `copy-venda`, `roteiro-post` e `roteiro-video`.

## O gate

Propor a lista e esperar o "pode ir". Nenhuma pausa, nenhuma mudança de verba e nenhuma campanha nova acontece antes disso, e aprovação de ontem não vale pra rodada de hoje.

Com o "pode ir" dado, aplicar pelo MCP um por um, dizendo o que fez a cada passo, e registrar cada ação em `dados/trafego/decisoes.jsonl`, uma linha por ação:

```json
{"data":"<AAAA-MM-DD>","anuncio":"<id>","faixa":"<CRITICO, PASSE ou AVISO>","motivo":"<o motivo que o script deu>","resposta":"<o que o usuário respondeu>"}
```

## Quando o usuário discordar

Discordância entra no mesmo `decisoes.jsonl`, com a resposta dele em `resposta` e o motivo que ele deu. Na terceira discordância do mesmo tipo de corte, parar e dizer em voz alta que o ticket provavelmente está errado, e oferecer refazer a entrevista pra recalcular a régua. É o ajuste que o método manda fazer, e ele só se percebe pelo histórico do arquivo.

## O que esta skill nunca faz

- Aplicar qualquer coisa na conta sem o "pode ir" daquele momento
- Mexer nos limiares do método. Quem muda a agressividade da régua é o ticket em `_contexto/trafego.md`
- Julgar anúncio com dado parado. O script avisa, e a proposta de corte espera dado fresco
- Escrever copy ou criativo, que é trabalho de outra skill

## O método por extenso

[referencias/metodo.md](referencias/metodo.md) traz o método completo: as quatro faixas com as condições exatas, a conta do ticket, o ponto de empate, as três proteções contra corte errado, a tabela de perfis de nicho e de onde vieram os números. Carregar quando a conversa precisar do detalhe do método ou do perfil de nicho.
