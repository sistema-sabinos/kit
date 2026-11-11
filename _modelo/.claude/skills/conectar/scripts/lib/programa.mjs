// Qual programa roda esta conversa: o VS Code com a extensao do Claude Code ou o app do Claude
// (aba Code). A variavel CLAUDE_CODE_ENTRYPOINT nao e contrato documentado: medida na rodada 5.56
// (claude-vscode na extensao, claude-desktop no app, vazia no subagente do app). O que nao bate
// cai em 'desconhecido', que fala dos dois: errar deixa a frase mais longa, nunca errada.
export function programa(env = process.env) {
  const e = String(env.CLAUDE_CODE_ENTRYPOINT ?? '')
  if (e === 'claude-vscode') return 'vscode'
  if (e.startsWith('claude-desktop')) return 'app'
  return 'desconhecido'
}

const COMO = {
  vscode: 'VS Code: fecha todas as janelas; no Mac, Cmd+Q',
  app: 'app do Claude: ícone perto do relógio, botão direito, Sair; no Mac, Cmd+Q',
  desconhecido: 'VS Code: fecha todas as janelas; app do Claude: ícone perto do relógio, botão direito, Sair; no Mac, Cmd+Q nos dois',
}

// a forma do verbo muda com o lugar da frase ("sai" falando com a pessoa, "saia" no recado
// pra IA, "sair" depois de "pedir pra pessoa"); o miolo e o mesmo
const VERBOS = {
  sai: ['espera', 'fecha', 'abre'],
  saia: ['espere', 'feche', 'abra'],
  sair: ['esperar', 'fechar', 'abrir'],
}

// A frase unica de sair de vez do programa, pra quem acabou de instalar algo que so aparece
// numa sessao nova. Comeca minuscula, pra entrar no meio de outra frase.
export function fraseSair(prog = programa(), forma = 'sai') {
  const [esperar, fechar, abrir] = VERBOS[forma] ?? VERBOS.sai
  return `${esperar} terminar o que roda nas outras conversas e ${fechar} de vez o programa onde você conversa comigo (${COMO[prog] ?? COMO.desconhecido}) e ${abrir} de novo nesta pasta, numa conversa nova. Gerenciador de Tarefas só se não fechar.`
}
