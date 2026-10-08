// Leitura de argumento de linha de comando, igual em todos os scripts do pacote.
// O que vem sem -- vai pra lista _ (posicionais). Chave que esta em multiplos junta todos
// os valores ate o proximo --, porque o PowerShell nao expande *.json e a pessoa digita
// os arquivos um por um (--visual a.json b.json).
export function lerArgs(argv, multiplos = []) {
  const a = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (!k.startsWith('--')) { a._.push(k); continue }
    const nome = k.slice(2)
    if (multiplos.includes(nome)) {
      const vals = a[nome] || []
      while (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) vals.push(argv[++i])
      a[nome] = vals
      continue
    }
    const v = argv[i + 1]
    if (v === undefined || v.startsWith('--')) a[nome] = true
    else { a[nome] = v; i++ }
  }
  return a
}

export function numero(a, nome, padrao, { min = -Infinity, max = Infinity } = {}) {
  if (a[nome] === undefined) return padrao
  const n = Number(String(a[nome]).replace(',', '.'))
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`--${nome} precisa ser numero entre ${min} e ${max}, e veio "${a[nome]}"`)
  return n
}
