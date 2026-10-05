---
name: mapear
description: >
  Mapeia os processos repetitivos do dia a dia do usuário e os transforma em skills
  personalizadas, promovendo templates da biblioteca quando existir uma que sirva.
  Use quando o usuário chamar /mapear, disser "cria um comando pra isso", "automatiza
  esse processo", "o que dá pra automatizar aqui", ou depois do /setup.
---

# /mapear, Dos processos às skills

## O que faz

Entrevista o usuário sobre o que ele faz repetidamente, escolhe os melhores candidatos e cria skills personalizadas. É aqui que o sistema deixa de ser genérico e vira a operação do negócio.

## Antes de começar (leitura silenciosa)

1. `_contexto/empresa.md`, em especial a seção "O que mais toma tempo hoje" (veio do /setup)
2. `_contexto/estrategia.md`, pra priorizar o que serve ao foco atual
3. `_contexto/ferramentas.md`, pra saber o que já está conectado
4. `../_modelo/templates/skills/` (biblioteca local, na pasta-mãe do SabinOS) e `../_modelo/templates/skills/catalogo.md` (skills externas prontas: documentos Word/Excel/PowerPoint/PDF, transcrição, anúncios)
5. `../_modelo/templates/ferramentas/catalogo.md`, pra saber que API, CLI ou conector pode entrar numa skill
6. `.claude/skills/` e as pastas do projeto, pra não criar duplicata
7. Se `.agents/skills` existir como pasta comum (cópia, não link): anotar pra re-sincronizar no fim

## Passo 1: Colher os processos

Começar pelo que já está na memória e confirmar se segue valendo. Depois aprofundar com perguntas no formato de 4 partes (pergunta simples, por que pergunto, exemplos, repergunta se vier vago):

"Me descreve esse processo do começo ao fim, como se eu fosse te substituir amanhã.

Pergunto porque o comando que eu criar vai seguir exatamente esses passos, então o que ficar de fora ele não faz.

Tipo: 'o cliente manda mensagem pedindo orçamento, eu abro a planilha de preços, calculo com a margem, escrevo a resposta num tom simpático e mando de volta'."

Pra cada processo, capturar: **gatilho** (o que dispara), **passos**, **insumos** (planilha, catálogo, modelo, print), **resultado final** (arquivo? mensagem? decisão?), **onde o resultado é guardado hoje** e **frequência**.

**Insistir até ficar executável.** Resposta como "eu vejo o que precisa e faço" não vira skill. Reperguntar por etapa ("e depois de abrir a planilha, o que você olha primeiro?") até dar pra escrever o passo a passo sem inventar nada. Se depois de duas reperguntas ainda estiver vago, dizer isso na cara limpa: "Esse ainda está solto demais pra virar comando; vamos pro próximo e voltamos nesse quando você fizer ele de novo prestando atenção nos passos".

## Passo 2: Priorizar

Ordenar por frequência x tempo gasto e apresentar o mapa:

> "Identifiquei esses processos:
> 1. **[nome]**, [frequência], [gera arquivo / é um fluxo]
> 2. ...
> Esses dois primeiros te devolvem mais tempo. Começamos por qual?"

Regras de corte:

- Não criar mais que 3 skills numa sessão. Melhor 2 que funcionam que 6 pela metade.
- Processo simples demais (uma mensagem curta, uma pergunta direta) não precisa de skill: "Isso dá pra fazer direto na conversa. Quer um comando mesmo assim ou seguimos pro próximo?"
- Os que ficarem de fora vão pro `tarefas.md`, seção "Processos pra mapear depois", um por linha.

## Passo 3: Checar o que já existe ANTES de criar do zero

Pra cada processo escolhido, nesta ordem:

- Processo que é "rodar sozinho no horário e me avisar" (todo dia conferir estoque, venda, site no ar) vai pro `/agendar`, sem skill nova. Se o `/agendar` não estiver na pasta do projeto (projeto antigo), dizer que ele chega pelo `/atualizar-sabinos`.

1. **Biblioteca local** (`../_modelo/templates/skills/`). Lá existem skills prontas de: triagem de atendimento, catálogo de produto, controle de estoque, financeiro (precificação e fechamento de mês), copy de venda, roteiro de vídeo (gravação), roteiro de post (texto: post, thread, newsletter), carrossel, proposta comercial, slide, análise de dados, email profissional, publicação de site e Instagram. **Existe template que serve:** mostrar um resumo curto do fluxo dele (não o arquivo inteiro) e perguntar "esse fluxo bate com o seu? o que muda?". Depois promover: copiar pra `.claude/skills/<nome>/SKILL.md` (pasta inteira se o template for pasta) e **adaptar ao negócio**: produtos, tom, passos e arquivos reais do usuário. Nunca ativar template cru. Tráfego pago saiu desta biblioteca e virou skill própria: mora em `../_modelo/.claude/skills/trafego/` e se copia inteira, sem promover template. Venda em marketplace também tem pacote próprio, com catorze skills e seis agentes, listados no componente `mercado-livre` de `../_ferramentas/componentes.json`: quando o processo descrito é vender em marketplace, oferecer o pacote inteiro (as skills dividem scripts e não funcionam soltas) e ler o bloco "Venda em marketplace" em `../.claude/skills/setup/SKILL.md` e seguir a cópia e os três registros de lá (linha no `AGENTS.md`, linha no `_contexto/ferramentas.md`, nota no `tarefas.md`). Vídeo e redes sociais também têm pacote: os componentes `video` (três skills) e `midia-social` (seis skills). Quando o processo descrito é fazer vídeo, oferecer o `video` e seguir o bloco "Vídeo" do mesmo `setup/SKILL.md`, lembrando que ele depende do pacote de marketplace (os scripts do vídeo usam a biblioteca dele, campo `depende` do componente): sem o marketplace no projeto, dizer isso e oferecer os dois juntos, ou nenhum; quando é postar ou agendar em rede social, oferecer o `midia-social` e seguir o bloco "Mídia social" de lá. Postar no Instagram vai sempre pelo pacote (posta no Instagram, TikTok e YouTube de uma vez, pelo Buffer): o template `publicar-instagram` só entra se a pessoa recusar o Buffer, e nunca num projeto que já tem o pacote, senão ficam duas rotas pro mesmo trabalho, com chave e pasta diferentes.
2. **Skill externa pronta** (`../_modelo/templates/skills/catalogo.md`). Se o processo é "fazer proposta em Word" ou "planilha com fórmula", a skill oficial de documento resolve o miolo: "Já existe uma skill pronta pra isso, a `/docx`. Quer usar ela direto, ou eu crio um comando seu que chama ela com o seu modelo e o seu tom?". Na segunda opção, a skill nova é curta e delega o pesado pra externa.
3. **Ecossistema** (`find-skills`, em português e em inglês). Política do SabinOS: skill encontrada não se instala às cegas. Ler o conteúdo, aproveitar o que serve e gerar skill própria adaptada ao negócio.
4. **Nada em lugar nenhum:** criar do zero (Passo 5).

## Passo 4: Mostrar o plano antes de criar

Nada é criado sem o usuário ver o plano. Decidir e apresentar:

- **Precisa de pasta de saída?** Se o processo gera arquivo com destino fixo (relatório, proposta, post), usar uma pasta que já existe quando fizer sentido; criar nova só se nenhuma servir, com `README.md` de uma linha dentro. Processo que é só fluxo (classificar, responder, decidir) não ganha pasta.
- **Precisa de ferramenta?** Cruzar com `../_modelo/templates/ferramentas/catalogo.md` e `_contexto/ferramentas.md`: publica em rede social, gera imagem, lê site, renderiza HTML em PNG, lê planilha do Google. Se a conexão ainda não existe, a skill nasce mesmo assim, e a pendência de rodar `/conectar` vai pro `tarefas.md`.
- **Gasta dinheiro ou publica pra fora?** Então a skill nasce com gate humano escrito dentro dela: preparar, mostrar, esperar o "pode ir".

> "Pra esse processo, o plano é:
> - Comando `/[nome]`, em `.claude/skills/[nome]/SKILL.md`
> - [Lê a planilha de `dados/precos.xlsx` e o tom de `_contexto/preferencias.md`]
> - [Salva o resultado em `propostas/`] (só se houver arquivo de saída)
> - [Precisa do Playwright ligado; ainda não está, anoto no tarefas.md]
> Bora?"

Só criar depois do "bora".

## Passo 5: Criar

### Caminho A, adaptar template ou skill externa

Escrever direto a partir do que foi escolhido no Passo 3, garantindo:

1. Frontmatter `name` e `description` (a description diz QUANDO usar, com as frases que o usuário falaria)
2. Leitura do contexto certo no início (`_contexto/preferencias.md`; `marca/design-guide.md` se for visual; `empresa.md` se depender de produto, política ou prazo)
3. Passo a passo que reflete o que o usuário descreveu, não o fluxo genérico do template
4. Onde salvar, se gera arquivo
5. Toda pergunta dentro da skill segue o formato de 4 partes
6. Se usa ferramenta do catálogo, as instruções de uso ficam dentro da skill

### Caminho B, criar do zero (delegar pra skill-creator)

Quando não há template nem skill externa, não escrever na mão: montar um briefing e invocar a skill `skill-creator` (oficial da Anthropic; se não aparecer no `/`, instalar pelo `/plugin`, marketplace oficial). O briefing leva:

- **Processo** em uma frase, **gatilho** e **frequência**
- **Passo a passo** exatamente como o usuário descreveu, sem etapa inventada
- **Entregável**: formato e pasta de destino, se houver
- **Ferramentas** que se aplicam, do catálogo
- **Contexto do negócio** que importa: tom, restrições de ramo regulado (pergunta 7 do questionário), produtos
- **Identidade visual**: `marca/design-guide.md`, se o output for visual
- **Onde salvar**: `.claude/skills/<nome>/SKILL.md`

Quando a skill-creator devolver, **revisar antes de mostrar**: frontmatter claro? tom bate com `preferencias.md`? lê os arquivos certos no início? os gatilhos usam o vocabulário do usuário? exemplo dentro da skill contradiz alguma restrição do ramo? Ajustar o que precisar. Se a skill-creator não estiver disponível, escrever seguindo a seção "Criação de skills" do `AGENTS.md`.

### Estrutura final (vale pros dois caminhos)

```
.claude/skills/<nome>/
  SKILL.md              (instruções)
  template.html         (se gera HTML)
  referencia.md         (material de apoio, se houver)
```

## Passo 6: Testar na hora

1. Rodar a skill de verdade com um caso real do usuário (a conversa de cliente de verdade, a planilha de verdade)
2. Ajustar com o feedback dele até o resultado prestar
3. Erro no teste (a skill errou, o passo descrito não batia com a realidade) vira uma linha datada em `_contexto/licoes.md`
4. Registrar no `AGENTS.md` (lista de skills ou estrutura de pastas, se houver) e avisar: "a partir de agora é só chamar `/<nome>`"

## Passo 7: Continuar ou encerrar

Depois de cada skill: "Quer mapear o próximo da lista?". Ao encerrar:

1. Salvar os não mapeados em `tarefas.md` ("Processos pra mapear depois")
2. Se `.agents/skills` for cópia (pasta comum, não link), copiar de novo `.claude/skills` por cima pra o Codex enxergar a skill nova. Se for link ou junction, não precisa fazer nada.
3. Fechar: "[N] processos mapeados, [N] comandos criados. Sempre que você notar que está fazendo algo pela terceira vez, me fala que vira comando."

## Regras

- Uma pergunta por vez, formato de 4 partes, sem interrogatório
- Sempre checar o que já existe antes de criar pasta ou skill nova
- Sempre mostrar o plano antes de criar; nunca criar skill que o usuário não confirmou
- Skill que gasta dinheiro ou publica pra fora nasce com gate humano escrito dentro dela
- Nunca chumbar nome de modelo de IA em código dentro da skill (regra 9 do `AGENTS.md`)
