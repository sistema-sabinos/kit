// Vigia do processo pai. No Windows o robo agendado roda como filho do conhost (que esconde
// a janela), e quando o Agendador de Tarefas mata a rodada no limite de execucao, mata so o
// conhost: o node ficava vivo e orfao. O vigia confere o pai de tempos em tempos e sai
// quando ele some.

// process.kill com sinal 0 so pergunta se o processo existe. EPERM quer dizer que existe,
// mas e de outro usuario.
export function paiVivo(pid, matar = process.kill) {
  try {
    matar(pid, 0)
    return true
  } catch (e) {
    return e.code === 'EPERM'
  }
}

export function vigiarPai({ ppid = process.ppid, intervaloMs = 5000, vivo = paiVivo, sair = process.exit } = {}) {
  const relogio = setInterval(() => {
    if (vivo(ppid)) return
    clearInterval(relogio)
    sair(1)
  }, intervaloMs)
  // unref: o vigia nunca segura o processo vivo depois que a rodada terminou.
  relogio.unref()
  return relogio
}
