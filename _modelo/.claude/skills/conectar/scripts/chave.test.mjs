import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./chave.mjs', import.meta.url))
// isca montada em pedacos: o valor que nunca pode sair na tela
const ISCA = ['zqW', 'v9kT', '4ppL', 'x7'].join('')
const OUTRA = ['mmR', '2hY', 'q8sN'].join('')

function comProjeto(arquivos, fn) {
  const raiz = mkdtempSync(join(tmpdir(), 'chave-'))
  try {
    for (const [rel, txt] of Object.entries(arquivos)) {
      mkdirSync(dirname(join(raiz, rel)), { recursive: true })
      writeFileSync(join(raiz, rel), txt)
    }
    return fn(raiz)
  } finally { rmSync(raiz, { recursive: true, force: true }) }
}

function rodar(cwd, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' })
  return { codigo: r.status, saida: r.stdout, erro: r.stderr, tudo: r.stdout + r.stderr }
}

function semIsca(r, ...valores) {
  for (const v of valores) {
    for (const pedaco of [v, v.slice(0, 5), v.slice(-5)]) {
      assert.ok(!r.tudo.includes(pedaco), 'pedaco do valor saiu na tela')
    }
  }
}

test('chave: tem e falta por nome, sem mostrar o valor', () => {
  comProjeto({ '.env': `A=${ISCA}\nB=\n# C=x\n` }, raiz => {
    const r = rodar(raiz, 'tem', 'A', 'B', 'C', 'D')
    assert.equal(r.codigo, 1)
    assert.deepEqual(r.saida.trim().split(/\r?\n/), ['A: tem', 'B: falta', 'C: falta', 'D: falta'])
    semIsca(r, ISCA)
  })
})

test('chave: todos tem sai 0', () => {
  comProjeto({ '.env': `A=${ISCA}\nB=${OUTRA}\n` }, raiz => {
    const r = rodar(raiz, 'tem', 'A', 'B')
    assert.equal(r.codigo, 0)
    assert.deepEqual(r.saida.trim().split(/\r?\n/), ['A: tem', 'B: tem'])
    semIsca(r, ISCA, OUTRA)
  })
})

test('chave: nomes lista so os nomes com valor, em ordem', () => {
  comProjeto({ '.env': `ZETA=${ISCA}\nVAZIA=\n# COMENTADA=x\nALFA=${OUTRA}\n` }, raiz => {
    const r = rodar(raiz, 'nomes')
    assert.equal(r.codigo, 0)
    assert.deepEqual(r.saida.trim().split(/\r?\n/), ['ALFA', 'ZETA'])
    semIsca(r, ISCA, OUTRA)
  })
})

test('chave: bate so com o mesmo valor na linha de origem', () => {
  const origem = ['# notas', '', `token do painel: ${ISCA} (copiado)`, 'fim'].join('\n')
  const conferir = r => {
    semIsca(r, ISCA, OUTRA)
    assert.ok(!r.tudo.includes('copiado') && !r.tudo.includes('painel'), 'texto da linha de origem saiu na tela')
  }
  comProjeto({ '.env': `A=${ISCA}\n`, 'docs/notas.md': origem }, raiz => {
    const r = rodar(raiz, 'bate', 'A', '--em', 'docs/notas.md:3')
    assert.equal(r.codigo, 0)
    assert.equal(r.saida.trim(), 'A: bate')
    conferir(r)
    const fora = rodar(raiz, 'bate', 'A', '--em', 'docs/notas.md:1')
    assert.equal(fora.saida.trim(), 'A: nao bate')
    conferir(fora)
  })
  comProjeto({ '.env': `A=${OUTRA}\n`, 'docs/notas.md': origem }, raiz => {
    const r = rodar(raiz, 'bate', 'A', '--em', 'docs/notas.md:3')
    assert.equal(r.codigo, 1)
    assert.equal(r.saida.trim(), 'A: nao bate')
    conferir(r)
  })
  comProjeto({ '.env': 'B=1\n', 'docs/notas.md': origem }, raiz => {
    const r = rodar(raiz, 'bate', 'A', '--em', 'docs/notas.md:3')
    assert.equal(r.codigo, 1)
    assert.equal(r.saida.trim(), 'A: falta')
    conferir(r)
  })
})

// comum do Codex no chat 7: chave cortada no .env batia por includes e a skill apagaria a unica copia inteira
test('chave: bate exige o valor inteiro, nunca pedaco da chave da origem', () => {
  const curta = ISCA.slice(0, 8)
  const origem = [`token: ${ISCA}`, `jwt: ${curta}.${OUTRA}`, `fim: ${curta}`, `aspas: "${curta}"`].join('\n')
  comProjeto({ '.env': `A=${curta}\n`, 'notas.md': origem }, raiz => {
    for (const linha of ['1', '2']) {
      const r = rodar(raiz, 'bate', 'A', '--em', `notas.md:${linha}`)
      assert.equal(r.saida.trim(), 'A: nao bate', `linha ${linha}: pedaco da chave bateu`)
      semIsca(r, ISCA, OUTRA)
    }
    for (const linha of ['3', '4']) assert.equal(rodar(raiz, 'bate', 'A', '--em', `notas.md:${linha}`).saida.trim(), 'A: bate', `linha ${linha}`)
  })
  // cetico do conserto: corte num simbolo da senha batia, e chave depois de = ou antes de & ou de ponto final travava
  const cortadas = [`senha: ${curta}!xY#9`, `key: ${curta}%2Fqq`, `token: 1|${curta}`, `pw: ${curta}@host`, `pw: ${curta}$Zz`, `x: ${curta}_b`]
  const inteiras = [`ML_TOKEN=${curta}`, `https://api.x.com/v1?access_token=${curta}&x=1`, `a chave e ${curta}.`, `"token":"${curta}"`, `| ${curta} |`, `token ${curta}, outro`, `token: ${curta}, outro`]
  comProjeto({ '.env': `A=${curta}\n`, 'n.md': [...cortadas, ...inteiras].join('\n') }, raiz => {
    const linhaDe = i => rodar(raiz, 'bate', 'A', '--em', `n.md:${i + 1}`).saida.trim()
    cortadas.forEach((t, i) => assert.equal(linhaDe(i), 'A: nao bate', `cortada bateu: linha ${i + 1}`))
    inteiras.forEach((t, i) => assert.equal(linhaDe(cortadas.length + i), 'A: bate', `inteira nao bateu: linha ${cortadas.length + i + 1}`))
  })
})

// interna do fechamento (5.28): faxina, checar, syncar e compartilhar mandam rodar o bate na linha
// achada dentro do .env.example, que sobe pro GitHub e nao e segredo (D6); o .env de verdade segue recusado
test('chave: bate aceita .env.example e irmaos como origem, e segue recusando o .env', () => {
  const modelos = ['.env.example', '.env.sample', '.env.template', '.env.local.example']
  const arquivos = { '.env': `A=${ISCA}\n`, '.env.local': `A=${ISCA}\n`, 'proj/.env': `A=${ISCA}\n` }
  for (const m of modelos) arquivos[m] = `A=${ISCA}\n`
  comProjeto(arquivos, raiz => {
    for (const m of modelos) {
      const r = rodar(raiz, 'bate', 'A', '--em', `${m}:1`)
      assert.equal(r.saida.trim(), 'A: bate', `--em ${m}:1 devia bater (${r.erro.trim()})`)
      semIsca(r, ISCA)
    }
    for (const em of ['.env:1', '.env.local:1', 'proj/.env:1', '.env.example.local:1']) {
      assert.equal(rodar(raiz, 'bate', 'A', '--em', em).codigo, 2, `--em ${em} devia sair 2`)
    }
  })
})

// interna do fechamento (5.28): pedaco cortado em : = ( batia, e o token do Telegram (<id>:<hash>)
// cortado no : deixava o .env so com o hash. Na forma NOME=valor, NOME: valor ou "chave": "valor"
// vale o valor inteiro dali; no texto solto, so espaco, aspas ou ponta da linha separam.
test('chave: bate exige o valor inteiro da forma e separador de palavra no texto solto', () => {
  const hash = 'A' + ['bC4dE', 'fG7hI', 'jK0lM', 'nO3pQ', 'rS6tU', 'vW9xY', 'zab2'].join('')
  const tg = `123456789:${hash}`
  const cortadas = [
    `TELEGRAM_TOKEN=${tg}`, `token: ${tg}`, `"bot": "${tg}"`, `o bot ${tg} aqui`,
    `X=abc=${hash}`, `chave abc=${hash} fim`, `chave abc(${hash} fim`, `chave ${hash}(x) fim`,
  ]
  const inteiras = [`TELEGRAM_TOKEN=${hash}`, `token: ${hash}`, `"bot": "${hash}",`, `o bot ${hash} aqui`]
  comProjeto({ '.env': `A=${hash}\nT=${tg}\n`, 'n.md': [...cortadas, ...inteiras].join('\n') }, raiz => {
    const linhaDe = (nome, i) => rodar(raiz, 'bate', nome, '--em', `n.md:${i + 1}`).saida.trim()
    cortadas.forEach((t, i) => assert.equal(linhaDe('A', i), 'A: nao bate', `cortada bateu: linha ${i + 1}`))
    inteiras.forEach((t, i) => assert.equal(linhaDe('A', cortadas.length + i), 'A: bate', `inteira nao bateu: linha ${cortadas.length + i + 1}`))
    for (const i of [0, 1, 2, 3]) assert.equal(linhaDe('T', i), 'T: bate', `telegram inteiro nao bateu: linha ${i + 1}`)
  })
})

// conferente da volta 1 do fechamento (5.28): a forma exigia o resto inteiro da linha e travava linha
// de codigo, comentario e .env.example; agora so decide quando o valor dela e um token limpo. E o
// &nome= so vale de link quando a palavra tem ? ou ://
test('chave: forma so decide com valor limpo, e &nome= so de link', () => {
  const hash = 'A' + ['bC4dE', 'fG7hI', 'jK0lM', 'nO3pQ', 'rS6tU', 'vW9xY', 'zab2'].join('')
  const tg = `123456789:${hash}`
  const inteiras = [
    `client = OpenAI(api_key="${hash}")`, `headers = {"Authorization": "Bearer ${hash}"}`,
    `API_KEY = "${hash}"  # do painel`, `Token: ${hash} (do bot)`, `Login: fulano, senha: ${hash}`,
    `"token": "${hash}"}`, `api_key: ${hash}  # comentario`, `TOKEN=${hash};`, `  api_key="${hash}",`,
    `ML_SECRET=${hash} # pegar no painel`,
  ]
  const cortadas = [
    `TELEGRAM_TOKEN=${tg} # do bot`, `TELEGRAM_TOKEN="${tg}";`, `token: ${tg},`,
    `chave abc&def=${hash} fim`, `chave a?b c&def=${hash} fim`,
  ]
  comProjeto({ '.env': `A=${hash}\n`, 'n.md': [...inteiras, ...cortadas].join('\n') }, raiz => {
    const linhaDe = i => rodar(raiz, 'bate', 'A', '--em', `n.md:${i + 1}`).saida.trim()
    inteiras.forEach((t, i) => assert.equal(linhaDe(i), 'A: bate', `inteira nao bateu: linha ${i + 1}`))
    cortadas.forEach((t, i) => assert.equal(linhaDe(inteiras.length + i), 'A: nao bate', `cortada bateu: linha ${inteiras.length + i + 1}`))
  })
})

// conferente da volta 2 do fechamento: NOME= no meio da linha (compose, docker -e, set, --opcao=) e link
// dentro da forma voltam a bater como na base; o corte do Telegram no : segue barrado
test('chave: NOME= no meio da linha e link dentro da forma batem', () => {
  const hash = 'A' + ['bC4dE', 'fG7hI', 'jK0lM', 'nO3pQ', 'rS6tU', 'vW9xY', 'zab2'].join('')
  const tg = `123456789:${hash}`
  const inteiras = [
    `- OPENAI_API_KEY=${hash}`, `  - OPENAI_API_KEY=${hash}`, `docker run -e OPENAI_API_KEY=${hash} img`,
    `set OPENAI_API_KEY=${hash}`, `node app.mjs --api-key=${hash}`, `OPENAI_API_KEY=${hash} node app.mjs`,
    `url: https://x.com/?token=${hash}`, `URL=https://x.com/?a=1&token=${hash}`,
  ]
  const cortadas = [`- TELEGRAM_TOKEN=${tg}`, `set TOKEN=${tg}`, `x=y=${hash}`]
  comProjeto({ '.env': `A=${hash}\n`, 'n.md': [...inteiras, ...cortadas].join('\n') }, raiz => {
    const linhaDe = i => rodar(raiz, 'bate', 'A', '--em', `n.md:${i + 1}`).saida.trim()
    inteiras.forEach((t, i) => assert.equal(linhaDe(i), 'A: bate', `inteira nao bateu: linha ${i + 1}`))
    cortadas.forEach((t, i) => assert.equal(linhaDe(inteiras.length + i), 'A: nao bate', `cortada bateu: linha ${inteiras.length + i + 1}`))
  })
})

// final do Codex no fechamento: variavel vazia ou ausente responde falta antes de comparar (o vazio
// entrava em laco no indexOf)
test('chave: bate com variavel vazia ou ausente responde falta sem comparar', () => {
  comProjeto({ '.env': 'A=\n', 'n.md': 'abc\nundefined\n' }, raiz => {
    for (const [nome, em] of [['A', 'n.md:1'], ['B', 'n.md:2']]) {
      const r = spawnSync(process.execPath, [SCRIPT, 'bate', nome, '--em', em], { cwd: raiz, encoding: 'utf8', timeout: 5000 })
      assert.equal(r.signal, null, `bate ${nome} travou`)
      assert.equal(r.stdout.trim(), `${nome}: falta`)
      assert.equal(r.status, 1)
    }
  })
})

test('chave: bate recusa origem de segredo ou fora do projeto', () => {
  comProjeto({ '.env': `A=${ISCA}\n`, 'dados/sessao/x.json': ISCA, 'dados/totp.json': ISCA }, raiz => {
    for (const em of ['.env:1', '../x.md:1', 'dados/sessao/x.json:1', 'dados/totp.json:1']) {
      const r = rodar(raiz, 'bate', 'A', '--em', em)
      assert.equal(r.codigo, 2, `--em ${em} devia sair 2`)
      assert.ok(r.erro.length > 0, `--em ${em} sem recado`)
      semIsca(r, ISCA)
    }
  })
})

test('chave: arquivo fora da lista sai 2', () => {
  comProjeto({ '.env': `A=${ISCA}\n`, 'segredo.txt': `A=${ISCA}\n` }, raiz => {
    for (const arq of ['segredo.txt', '../../x', 'app/codigo/../../.env', resolve(tmpdir(), 'x')]) {
      const r = rodar(raiz, 'tem', 'A', '--arquivo', arq)
      assert.equal(r.codigo, 2, `--arquivo ${arq} devia sair 2`)
      assert.match(r.erro, /arquivo fora da lista/)
      assert.equal(r.saida, '')
    }
  })
})

test('chave: sem o arquivo da tudo falta e sai 1', () => {
  comProjeto({ 'leia.md': 'x' }, raiz => {
    const r = rodar(raiz, 'tem', 'A', 'B')
    assert.equal(r.codigo, 1)
    assert.deepEqual(r.saida.trim().split(/\r?\n/), ['sem .env', 'A: falta', 'B: falta'])
  })
})

test('chave: CRLF, aspas e export', () => {
  comProjeto({ '.env': `export A="${ISCA}"\r\nB=""\r\nC='${OUTRA}'\r\n` }, raiz => {
    const r = rodar(raiz, 'tem', 'A', 'B', 'C')
    assert.deepEqual(r.saida.trim().split(/\r?\n/), ['A: tem', 'B: falta', 'C: tem'])
    semIsca(r, ISCA, OUTRA)
  })
  comProjeto({ '.env': `export A="${ISCA}"\r\n`, 'notas.md': `x ${ISCA} y\r\n` }, raiz => {
    assert.equal(rodar(raiz, 'bate', 'A', '--em', 'notas.md:1').saida.trim(), 'A: bate')
  })
})

test('chave: nome invalido sai 2', () => {
  comProjeto({ '.env': `A=${ISCA}\n` }, raiz => {
    for (const nome of ['1A', 'A-B', 'A=B', '']) {
      const r = rodar(raiz, 'tem', nome)
      assert.equal(r.codigo, 2, `nome ${JSON.stringify(nome)} devia sair 2`)
      semIsca(r, ISCA)
    }
  })
})

test('chave: bate --com compara dois .env sem mostrar o valor', () => {
  comProjeto({ '.env': `A=${ISCA}\nB=${OUTRA}\n`, 'proj/.env': `A=${ISCA}\nB=${ISCA}\n` }, raiz => {
    const proj = join(raiz, 'proj')
    const conferir = (r, linha, codigo) => {
      assert.equal(r.saida.trim(), linha)
      assert.equal(r.codigo, codigo)
      semIsca(r, ISCA, OUTRA)
    }
    conferir(rodar(proj, 'bate', 'A', '--com', '../.env'), 'A: bate', 0)
    conferir(rodar(raiz, 'bate', 'A', '--arquivo', 'proj/.env', '--com', '.env'), 'A: bate', 0)
    conferir(rodar(proj, 'bate', 'B', '--com', '../.env'), 'B: nao bate', 1)
    conferir(rodar(proj, 'bate', 'C', '--com', '../.env'), 'C: falta', 1)
    for (const args of [['--com', 'segredo.txt'], ['--com', '.env'], ['--em', 'x.md:1', '--com', '../.env']]) {
      const r = rodar(proj, 'bate', 'A', ...args)
      assert.equal(r.codigo, 2, `bate A ${args.join(' ')} devia sair 2`)
    }
  })
})

test('chave: pasta de projeto pelo --arquivo, um nivel so', () => {
  comProjeto({ 'Loja-01/.env': `A=${ISCA}\n`, 'a/b/.env': `A=${ISCA}\n`, '.x/.env': `A=${ISCA}\n` }, raiz => {
    const r = rodar(raiz, 'tem', 'A', '--arquivo', 'Loja-01/.env')
    assert.equal(r.saida.trim(), 'A: tem')
    semIsca(r, ISCA)
    for (const arq of ['a/b/.env', '.x/.env', '../Loja-01/.env', 'Loja-01/.env.local', 'Loja-01/x']) {
      assert.equal(rodar(raiz, 'tem', 'A', '--arquivo', arq).codigo, 2, `--arquivo ${arq} devia sair 2`)
    }
  })
})

test('chave: app/codigo/.env.local e ../.env pelo --arquivo', () => {
  comProjeto({ 'proj/app/codigo/.env.local': `LOCAL=${ISCA}\n`, '.env': `MAE=${OUTRA}\n`, 'proj/.env': 'X=1\n' }, raiz => {
    const proj = join(raiz, 'proj')
    const local = rodar(proj, 'tem', 'LOCAL', 'MAE', '--arquivo', 'app/codigo/.env.local')
    assert.deepEqual(local.saida.trim().split(/\r?\n/), ['LOCAL: tem', 'MAE: falta'])
    const barra = String.fromCharCode(92)
    const invertida = rodar(proj, 'tem', 'LOCAL', '--arquivo', ['app', 'codigo', '.env.local'].join(barra))
    assert.equal(invertida.saida.trim(), 'LOCAL: tem')
    const mae = rodar(proj, 'nomes', '--arquivo', '../.env')
    assert.equal(mae.codigo, 0)
    assert.equal(mae.saida.trim(), 'MAE')
    semIsca(local, ISCA, OUTRA)
    semIsca(mae, ISCA, OUTRA)
  })
})
