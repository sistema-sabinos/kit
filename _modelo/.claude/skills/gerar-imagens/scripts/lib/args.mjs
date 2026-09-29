// Leitura de argumento de linha de comando, igual em todos os scripts da skill.
export function lerArgs(argv) {
  const a = {}
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (!k.startsWith('--')) continue
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) a[k.slice(2)] = true
    else { a[k.slice(2)] = v; i++ }
  }
  return a
}

export function numero(a, nome, padrao, { min = -Infinity, max = Infinity } = {}) {
  if (a[nome] === undefined) return padrao
  const n = Number(String(a[nome]).replace(',', '.'))
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`--${nome} precisa ser numero entre ${min} e ${max}, e veio "${a[nome]}"`)
  return n
}
