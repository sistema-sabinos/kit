# SabinOS, sala de controle

Pasta aberta é um projeto (tem `_contexto/` dentro)? Este arquivo chegou por
herança da pasta de cima: ignorar tudo daqui pra baixo e seguir o `AGENTS.md` do
projeto. Ele é curto de propósito, porque entra em toda conversa de projeto.

Esta pasta cria e gerencia projetos; o trabalho do dia a dia acontece dentro da
pasta de cada projeto, aberta como workspace próprio no VS Code. Regra de bolso
pro usuário: pasta-mãe é a recepção, pasta do projeto é a sua sala.

## Início de conversa aqui

Antes de qualquer coisa, listar as pastas desta raiz. Projeto é pasta com
`_contexto/` dentro; as que começam com `_` ou `.` e a `docs/` nunca são projeto.

- Nenhum projeto: seguir a skill `setup` já nesta resposta, seja qual for a
  primeira mensagem (até "oi"), salvo pedido de outra linha desta lista. Com
  resposta no `RESPONDA-AQUI.txt`, é retomada do `setup`. Com ele em branco e a
  identidade global do SabinOS (bloco sabinos) já na mesa, perguntar antes, com
  botão, se é um projeto novo (`novo-projeto`) ou recomeçar.
- Já tem projeto: "Adicionar projeto novo? (Se quiser refazer ou ajustar um que
  já existe, me diga qual.)" Adicionar é a skill `novo-projeto`.
- Versão nova do kit, zip novo ou atualizar pelo GitHub: skill `atualizar-kit`.
- "Baixa o projeto <pasta> do GitHub" (segundo computador ou sócio): seção "Outro
  computador no mesmo projeto" de `_modelo/.claude/skills/syncar/SKILL.md`.

As skills são o roteiro: nunca improvisar o fluxo.

## Regras de operação

1. Usuário leigo: palavra fácil, frase curta, um passo de cada vez; palavra
   técnica só com a explicação colada. Fora do chat, passo a passo de clique em
   clique, cobrindo Windows e Mac.
2. Pesquisa na internet busca em qualquer idioma, principalmente inglês; a
   entrega sai em português.
3. Setup ou projeto criado: avisar "esse processo fechou, pra economizar abre
   uma conversa nova na pasta do projeto".
4. Erro corrigido no onboarding vira linha datada no `_contexto/licoes.md` do
   projeto criado.
5. Nada que gasta dinheiro, publica, envia mensagem pra fora ou altera conta de terceiros
   roda sem aprovação explícita na hora.
6. Chave e senha só em arquivo `.env`, nunca no chat nem em outro arquivo.
7. Nunca editar `_modelo/` (o molde dos próximos projetos) sem o usuário pedir
   explicitamente.
8. A skill `segunda-opiniao` entra antes do ok do que gasta, publica, envia pra
   fora, apaga ou muda estrutura, e quando o usuário pede. A estrutura de pasta e
   o pacote de skills do `setup` e do `novo-projeto` vão juntos, num pacote só;
   pergunta simples da entrevista (um nome, um sim ou não) não chama revisor.

## Estrutura e outros agentes

`RESPONDA-AQUI.txt` (registro da entrevista do `setup`, e rota pra quem prefere
escrever), `_modelo/` (molde, nunca lugar de trabalhar), `_ferramentas/`
(verificador do kit e biblioteca antitrava), `docs/` (guias) e uma pasta por
projeto. O conteúdo real mora neste `AGENTS.md`; o `CLAUDE.md` é só o
ponteiro `@AGENTS.md`. Funciona também no Codex, sem o backup automático (lá é
`/syncar` no fim da sessão); a ponte `.agents/skills` e a rota do Hermes Agent
estão no `docs/roadmap-avancado.md`.
