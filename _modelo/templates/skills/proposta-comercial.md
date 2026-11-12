---
name: proposta-comercial
description: >
  Gera uma proposta comercial profissional em HTML a partir de um texto livre ou da transcrição da reunião.
  Aplica a identidade visual da marca do usuário (cores e fontes do guia visual da marca).
  Use quando o usuário mencionar "proposta", "proposta comercial", "orçamento",
  "apresentação de projeto" ou pedir um documento de venda para um cliente.
---

# /proposta-comercial, Geração de Proposta

## Dependências

- **Identidade visual:** o guia visual da marca (linha "a marca" do Mapa no `AGENTS.md`; pasta de projeto com `marca/` própria usa a dela)
- **Contexto do negócio:** `_contexto/empresa.md`
- **Tom de voz:** a voz da marca (Mapa do `AGENTS.md`), com as proibições de escrita do `_contexto/preferencias.md`

---

## Workflow

### Passo 1, Entender o pedido

O usuário conta do jeito dele: um texto solto ou a transcrição da reunião colada no chat. Tirar dali o que der: cliente e empresa, o problema, o que se propõe fazer, valor, prazo e entregáveis.

Se existe a pasta desse cliente no projeto, ler o `contexto.md` e o `andamento.md` dela antes de perguntar: o que já foi combinado está ali.

Só então perguntar o que ainda falta, uma pergunta por mensagem.

### Passo 2, Ler os arquivos de contexto

- Ler o guia visual da marca pra aplicar cores e fontes
- Ler `_contexto/empresa.md` pra dados do prestador (nome, serviços, contato)
- Ler a voz da marca pra tom da proposta, com as proibições de escrita do `_contexto/preferencias.md`

### Passo 3, Gerar o HTML

Criar um arquivo HTML completo. A ordem, os títulos e o tamanho de cada parte se escolhem pelo caso.

**O que não pode faltar:**
- Pra quem é a proposta e a data
- O problema, do jeito que o cliente vê
- O que você propõe e por que resolve
- O escopo, e o que fica de fora quando isso evita briga depois
- Prazo e entregáveis
- O investimento, visível
- O próximo passo, claro

Logo: se o design guide tiver logo na seção **Logo**, usar a imagem (largura 140-180px), na versão que combina com o fundo (claro ou escuro). Sem logo, o nome da empresa em texto.

**Estilo visual:**
- Aplicar cores e fontes do guia visual da marca
- Se o design guide estiver vazio: visual limpo e neutro, sem inventar marca
- Layout de uma coluna, responsivo, leve
- Seções com espaçamento generoso
- Valor em destaque visual (não escondido)

### Passo 4, Salvar e oferecer publicação

Salvar na pasta do cliente, quando ela existe: `<pasta do cliente>/proposta-[nome-cliente]-[data].html`. Sem pasta do cliente, onde a Tabela de destinos do `AGENTS.md` do projeto manda guardar proposta; sem linha pra proposta lá, em `propostas/proposta-[nome-cliente]-[data].html`.

Perguntar: "Quer que eu publique essa proposta com um link compartilhável? É só chamar `/publicar-site` passando o arquivo."

---

## Regras

- Tom da proposta segue a voz da marca, com as proibições de escrita do `_contexto/preferencias.md`
- Nunca inventar valor, prazo ou escopo, se não foi fornecido, deixar placeholder claro pra preencher
- A proposta deve soar como veio de uma pessoa, não de um template corporativo
- Sem jargão desnecessário ("soluções inovadoras", "entregamos valor", etc)
