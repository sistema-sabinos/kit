# SabinOS, sala de controle

Pasta aberta é um projeto (tem `_contexto/` dentro)? Este arquivo chegou por
herança da pasta de cima: ignorar tudo daqui pra baixo e seguir o `AGENTS.md` do
projeto. Ele é curto de propósito, porque entra em toda conversa de projeto.

Esta pasta cria e gerencia projetos; o trabalho do dia a dia acontece dentro da
pasta de cada projeto, com a conversa aberta escolhendo a pasta do projeto. Regra
de bolso pro usuário: pasta-mãe é a recepção, pasta do projeto é a sua sala.
Pedido de trabalho de projeto feito daqui (anúncio, cliente, conteúdo): avisar em
uma linha que o `/atualizar` e a memória daquele projeto só valem numa conversa
aberta na pasta dele, e seguir com o pedido.

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
- Existe `.backup-falhou` nesta raiz: ler o arquivo e avisar na primeira resposta,
  em uma linha, o que ele conta. Envio que falhou: "Seu último backup no GitHub
  falhou, o trabalho está só neste computador. Rode `/syncar` pra resolver."
  Arquivo da pasta-mãe que ficou fora do backup (cara de chave, grande): dizer
  quais e por quê, como o arquivo conta. Depois, seguir com o pedido.

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
   roda sem aprovação explícita na hora. Exceções: gasto dentro da permissão escrita
   no `_contexto/autonomia.md` de cada projeto, e uso dentro da assinatura (Claude e
   Codex do plano) e atualizar ferramenta, que rodam sem pedir; crédito avulso pede.
   Robô do `/agendar`: o "pode ir" se dá ao agendar e vale pra toda execução.
6. Chave de API só no `.env`, nunca no chat nem em outro arquivo. Senha de site também vai no `.env`: a IA lê pra fazer o login, nunca mostra no chat (o `/conectar` explica).
7. Nunca editar `_modelo/` (o molde dos próximos projetos) sem o usuário pedir
   explicitamente.
8. A skill `segunda-opiniao` entra antes do ok do que é de risco alto (sem
   volta, gasto fora da permissão, publicar, mandar pra fora; lista no
   `_modelo/.claude/detalhe-regras.md`), uma vez quando nasce permissão nova no
   `autonomia.md` de um projeto, e quando o usuário pede. Aqui, a estrutura de
   pasta e o pacote de skills do `setup` e do `novo-projeto` são risco alto e vão
   juntos, num pacote só; pergunta simples da entrevista (um nome, um sim ou não)
   não chama revisor.
9. O usuário nunca digita no terminal: quem roda comando é a IA, e dele só se
   pede clique (login, Autorizar, senha do computador) ou o que ele escreve no
   chat. Último caso (a IA ainda não existe na máquina, ou passo que só ele
   faz): clique a clique.
10. Trava barrou ("Barrada pela trava X, regra Y"): repetir o nome da trava e
   da regra pro usuário e decidir o próximo passo (seguir sem o passo, se era
   acessório, ou pedir o que falta), sem refazer a ação por outro caminho.
   Só na regra erro-interno do barrar-perigoso, em que a trava não conseguiu
   ler o comando, dá pra reescrever ele mais simples ou usar uma ferramenta
   equivalente, avisando o usuário. O usuário queria mesmo aquilo: anotar no
   `_contexto/licoes.md` do projeto que o `/setup` ou o `/novo-projeto` está
   criando (ainda sem a pasta, guardar a linha e gravar quando ela nascer; fora
   deles, no projeto que o usuário indicar) a lição com a marca `[trava X/regra Y]`.

## Estrutura e outros agentes

`RESPONDA-AQUI.txt` (registro da entrevista do `setup`, e rota pra quem prefere
escrever), `_modelo/` (molde, nunca lugar de trabalhar), `_ferramentas/`
(verificador do kit e biblioteca antitrava), `docs/` (guias), `agentes/` (cópia-mestra dos conselheiros da `/clonar-especialista`, do aluno; o que vale é a cópia instalada em `~/.claude`) e uma pasta por projeto. O conteúdo real mora neste `AGENTS.md`; o `CLAUDE.md` é só o
ponteiro `@AGENTS.md`. Funciona também no Codex, sem o backup automático (lá é
`/syncar` no fim da sessão); a ponte `.agents/skills` e a rota do Hermes Agent
estão no `docs/roadmap-avancado.md`.
