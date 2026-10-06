import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync, unlinkSync, rmdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { lerDecisoes, planoArquivo, aplicarArquivo, varrerSegredos, cpfValido, orfaos, automacoes, foraDoBackup, memoriaDoAgente, diasEntre, relatorio, diarioRende, frescor, ferramentasSemRegistro } from './faxina.mjs'

const SCRIPT = fileURLToPath(new URL('./faxina.mjs', import.meta.url))
const HOJE = '2026-10-05'

function projeto(arquivos) {
  const raiz = mkdtempSync(join(tmpdir(), 'faxina-'))
  for (const [rel, txt] of Object.entries(arquivos)) {
    mkdirSync(join(raiz, rel, '..'), { recursive: true })
    writeFileSync(join(raiz, rel), txt)
  }
  return raiz
}
const comProjeto = (arquivos, fn) => { const r = projeto(arquivos); try { return fn(r) } finally { rmSync(r, { recursive: true, force: true }) } }

const DECISOES = [
  '# Decisões', '', 'Só acréscimo.', '',
  '## 2026-01-10, frete grátis acima de 99 (dono)', 'Motivo: margem.', '',
  '## 2026-03-01, frete grátis acima de 79 (dono)', 'substitui: 2026-01-10', 'Motivo: concorrência.', '',
  '## 2026-02-01, cliente Acme paga em 30 dias [acme] (dono)', 'Motivo: contrato.', '',
].join('\r\n')

test('diasEntre conta dias de calendario', () => {
  assert.equal(diasEntre('2026-07-07', HOJE), 90)
  assert.equal(diasEntre('2026-07-06', HOJE), 91)
})

test('lerDecisoes separa entradas, substitui e tags', () => {
  const e = lerDecisoes(DECISOES)
  assert.deepEqual(e.map(x => x.data), ['2026-01-10', '2026-03-01', '2026-02-01'])
  assert.deepEqual(e[1].substitui, ['2026-01-10'])
  assert.deepEqual(e[2].tags, ['acme'])
  assert.ok(!e[0].texto.endsWith('\n'), 'linha em branco do fim fica fora da entrada')
})

test('planoArquivo: diario > 90 dias, decisao substituida > 90 dias, recado > 30 dias', () => {
  comProjeto({
    '_memoria/diario/2026-07-06.md': 'velho', '_memoria/diario/2026-07-07.md': 'no limite',
    '_memoria/diario/2026-07-01-robo.md': 'velho de robo', '_memoria/decisoes.md': DECISOES,
    '_memoria/recados/2026-08-01-robo-estoque.md': 'de: robo', '_memoria/recados/2026-10-01-robo-x.md': 'novo',
  }, raiz => {
    const p = planoArquivo(raiz, HOJE)
    assert.deepEqual(p.diarios.map(d => d.de), ['_memoria/diario/2026-07-01-robo.md', '_memoria/diario/2026-07-06.md'])
    assert.equal(p.diarios[1].para, '_memoria/arquivo/2026/2026-07-06.md')
    assert.deepEqual(p.decisoes, [{ data: '2026-01-10', para: '_memoria/arquivo/2026/decisoes-substituidas.md' }])
    assert.deepEqual(p.recadosVelhos, ['_memoria/recados/2026-08-01-robo-estoque.md'])
  })
})

test('planoArquivo: decisao ativa nunca arquiva, por mais velha que seja', () => {
  comProjeto({ '_memoria/decisoes.md': '## 2020-01-01, regra antiga\r\nMotivo: x\r\n' }, raiz => {
    assert.deepEqual(planoArquivo(raiz, HOJE).decisoes, [])
  })
})

test('substitui com trecho citado separa duas decisoes do mesmo dia e arquiva so a certa', () => {
  const txt = [
    '# Decisões', '',
    '- 2026-01-10, dono: frete grátis acima de 99. Por quê: margem.',
    '- 2026-01-10, dono: prazo de entrega 2 dias. Por quê: forno.',
    '- 2026-03-01, dono: frete grátis acima de 79. Por quê: concorrência. substitui: 2026-01-10 "frete grátis acima de 99"', '',
  ].join('\r\n')
  comProjeto({ '_memoria/decisoes.md': txt }, raiz => {
    const p = planoArquivo(raiz, HOJE)
    assert.deepEqual(p.ambiguas, [])
    assert.deepEqual(p.decisoes.map(d => d.trecho), ['frete grátis acima de 99'])
    aplicarArquivo(raiz, HOJE)
    const fica = readFileSync(join(raiz, '_memoria', 'decisoes.md'), 'utf8')
    assert.ok(fica.includes('prazo de entrega 2 dias'), 'a outra do mesmo dia fica')
    assert.ok(!fica.includes('acima de 99. Por'), 'a substituida saiu')
    assert.ok(readFileSync(join(raiz, '_memoria', 'arquivo', '2026', 'decisoes-substituidas.md'), 'utf8').includes('acima de 99'))
  })
})

test('substitui com trecho que nao casa literal cai na regra da data, nunca some calado', () => {
  const txt = [
    '# Decisões', '',
    '- 2026-01-10, dono: Parar de vender bolo de pote. Por quê: margem.',
    '- 2026-03-01, dono: pote só em evento. Por quê: pedido grande. substitui: 2026-01-10 "Paramos de vender bolo de pote..."',
    '- 2026-02-02, dono: a. Por quê: x.', '- 2026-02-02, dono: b. Por quê: y.',
    '- 2026-04-01, dono: c. Por quê: z. substitui: 2026-02-02 "outra coisa"', '',
  ].join('\n')
  comProjeto({ '_memoria/decisoes.md': txt }, raiz => {
    const p = planoArquivo(raiz, HOJE)
    assert.deepEqual(p.decisoes.map(d => d.data), ['2026-01-10'], 'trecho parafraseado, uma so no dia: arquiva')
    assert.deepEqual(p.ambiguas, [{ data: '2026-02-02', quantas: 2 }], 'trecho que nao casa, duas no dia: pergunta')
  })
})

test('faxina roda em projeto sem o hook do backup (auto-sync recusado), com a lista minima', () => {
  const dir = mkdtempSync(join(tmpdir(), 'faxina-sem-hook-'))
  try {
    const destino = join(dir, '.claude', 'skills', 'faxina', 'scripts')
    mkdirSync(destino, { recursive: true })
    writeFileSync(join(destino, 'faxina.mjs'), readFileSync(fileURLToPath(new URL('./faxina.mjs', import.meta.url))))
    writeFileSync(join(dir, 'notas.md'), 'chave ' + 'sk-' + 'a1B2c3D4e5F6g7H8i9J0k1L2' + '\n')
    const r = JSON.parse(execFileSync(process.execPath, [join(destino, 'faxina.mjs')], { cwd: dir, encoding: 'utf8' }))
    assert.deepEqual(r.segredos.map(s => `${s.arquivo}:${s.tipo}`), ['notas.md:chave de API'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('planoArquivo: duas entradas na mesma data substituida viram ambigua, sem mover', () => {
  const txt = '## 2026-01-10, a\n\n## 2026-01-10, b\n\n## 2026-05-01, c\nsubstitui: 2026-01-10\n'
  comProjeto({ '_memoria/decisoes.md': txt }, raiz => {
    const p = planoArquivo(raiz, HOJE)
    assert.deepEqual(p.decisoes, [])
    assert.deepEqual(p.ambiguas, [{ data: '2026-01-10', quantas: 2 }])
  })
})

test('aplicarArquivo move diario, tira a decisao substituida e preserva CRLF', () => {
  comProjeto({ '_memoria/diario/2026-07-06.md': 'velho', '_memoria/decisoes.md': DECISOES }, raiz => {
    const f = aplicarArquivo(raiz, HOJE)
    assert.deepEqual(f.movidos, ['_memoria/arquivo/2026/2026-07-06.md'])
    assert.ok(existsSync(join(raiz, '_memoria/arquivo/2026/2026-07-06.md')))
    assert.ok(!existsSync(join(raiz, '_memoria/diario/2026-07-06.md')))
    const dec = readFileSync(join(raiz, '_memoria/decisoes.md'), 'utf8')
    assert.ok(!dec.includes('acima de 99'))
    assert.ok(dec.includes('acima de 79') && dec.includes('[acme]') && dec.startsWith('# Decisões'))
    assert.equal((dec.match(/\r/g) || []).length, (dec.match(/\n/g) || []).length, 'continua CRLF')
    assert.ok(!/\r\n\r\n\r\n/.test(dec), 'sem buraco de duas linhas em branco')
    const arq = readFileSync(join(raiz, '_memoria/arquivo/2026/decisoes-substituidas.md'), 'utf8')
    assert.ok(arq.includes('acima de 99') && arq.startsWith('# Decisões substituídas'))
  })
})

test('aplicarArquivo nunca sobrescreve arquivo que ja esta no destino', () => {
  comProjeto({ '_memoria/diario/2026-07-06.md': 'novo', '_memoria/arquivo/2026/2026-07-06.md': 'ja estava' }, raiz => {
    const f = aplicarArquivo(raiz, HOJE)
    assert.deepEqual(f.pulados, ['_memoria/diario/2026-07-06.md'])
    assert.equal(readFileSync(join(raiz, '_memoria/arquivo/2026/2026-07-06.md'), 'utf8'), 'ja estava')
  })
})

test('cpfValido confere os digitos', () => {
  assert.ok(cpfValido('529.982.247-25'))
  assert.ok(!cpfValido('529.982.247-26'))
  assert.ok(!cpfValido('111.111.111-11'))
})

test('varrerSegredos acha chave, token, CPF e pula .env, placeholder e teste', () => {
  const chave = 'sk-' + 'a1B2c3D4e5F6g7H8i9J0k1L2'
  const atrib = 'MEU_' + 'TOKEN=' + 'Zx9Qw8Er7Ty6Ui5O'
  const cpf = '529.982.' + '247-25'
  comProjeto({
    'notas.md': `linha 1\nchave ${chave}\n`, 'cliente.md': `CPF do cliente: ${cpf}\n`,
    'config.txt': atrib + '\n', 'acesso.md': 'login: loja\nsenha: ' + 'Bolo2026x\n',
    'ok.md': 'MEU_' + 'TOKEN=coloque_sua_chave_aqui_depois\nCPF 529.982.247-26\n',
    'codigo.mjs': 'f({ client_secret: cliente.client_secret })\nconst maxToken = MAX_TOKEN_PADRAO\nconst key = carregarChave()\nsenha: env[k]\n',
    '.env': atrib + '\n', 'x.test.mjs': chave + '\n', 'node_modules/p/a.js': chave + '\n',
  }, raiz => {
    const a = varrerSegredos(raiz)
    assert.ok(a.length > 0, 'canario: achou alguma coisa')
    assert.deepEqual(a.map(x => `${x.arquivo}:${x.linha}:${x.tipo}`).sort(), [
      'acesso.md:2:senha escrita', 'cliente.md:1:CPF', 'config.txt:1:token ou chave escrita', 'notas.md:2:chave de API',
    ])
    assert.ok(!JSON.stringify(a).includes('Zx9Qw8'), 'relatorio nunca carrega o valor')
  })
})

// tokens falsos montados por partes, com maiuscula, minuscula e digito
const corpo = n => 'Ab1Cd2Ef3G'.repeat(Math.ceil(n / 10)).slice(0, n)
test('varrerSegredos pega token de Meta, Instagram, Google, Mercado Livre e chave colada sem nome', () => {
  comProjeto({
    'conteudo/notas-instagram.md': 'Token de acesso do Instagram (vale 60 dias): ' + 'IGQV' + corpo(120) + '\n',
    'conteudo/meta.md': 'uso no gerenciador: ' + 'EA' + 'AB' + corpo(150) + '\n',
    'dados/google.txt': 'gemini ' + 'AI' + 'za' + corpo(35) + '\n',
    'dados/ml.md': 'acesso ' + 'APP_' + 'USR-1234567-031820-' + 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6' + '-123456789\n',
    'dados/colada.md': 'a chave do Buffer: ' + corpo(70) + '\n',
    'dados/telegram.md': 'bot ' + '1234567890:' + 'A' + corpo(34) + '\n',
    'dados/slack.md': 'webhook ' + 'xo' + 'xb-' + '1234567890-' + corpo(24) + '\n',
    'dados/stripe.md': 'pagamento ' + 'sk' + '_live_' + corpo(24) + '\n',
    // nao e chave: codigo Pix copia e cola (publico de proposito) e imagem embutida
    'dados/pix.md': '- chave pix: 00020126580014br.gov.bcb.pix0136' + 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' + '5204000053039865802BR5913DOCE' + corpo(70) + '\n',
    'dados/logo.md': 'key: data:image/png;base64,' + corpo(90) + '\n',
    // nao e chave: hash hexadecimal perto da palavra, base64 de imagem, exemplo de doc
    'dados/hash.md': 'key sha256 ' + 'a3f9'.repeat(16) + '\n',
    'dados/doc.md': 'exemplo: Authorization: Bearer ' + 'APP_' + 'USR-12345678-031820-X-12345678\n',
  }, raiz => {
    const a = varrerSegredos(raiz).map(x => `${x.arquivo}:${x.tipo}`).sort()
    assert.deepEqual(a, [
      'conteudo/meta.md:token da Meta', 'conteudo/notas-instagram.md:token do Instagram',
      'dados/colada.md:token ou chave colada', 'dados/google.txt:chave do Google', 'dados/ml.md:token do Mercado Livre',
      'dados/slack.md:token do Slack', 'dados/stripe.md:chave do Stripe', 'dados/telegram.md:token do Telegram',
    ])
  })
})

test('varrerSegredos olha dentro do .env.example e devolve o que nao deu pra varrer', () => {
  const chave = 'sk-' + 'a1B2c3D4e5F6g7H8i9J0k1L2'
  comProjeto({
    '.env.example': 'OPENAI_API_KEY=' + chave + '\n',
    'clientes/acme/.env.example': 'GEMINI_API_KEY=sua_chave_aqui\n',
    'dados/grande.txt': 'x'.repeat(2 * 1024 * 1024 + 10),
  }, raiz => {
    const naoVarridos = []
    const a = varrerSegredos(raiz, [], naoVarridos)
    assert.deepEqual(a.map(x => `${x.arquivo}:${x.tipo}`), ['.env.example:chave de API'])
    assert.deepEqual(naoVarridos, ['dados/grande.txt'])
    assert.deepEqual(relatorio(raiz, '2026-10-05').naoVarridos, ['dados/grande.txt'])
  })
})

test('orfaos: arquivo e pasta que o AGENTS.md nao cita', () => {
  comProjeto({
    'AGENTS.md': 'Leia `_contexto/empresa.md`, o `_memoria/decisoes.md` e a pasta `marca/`.',
    '_contexto/empresa.md': 'x', '_contexto/rascunho-velho.md': 'x', '_memoria/decisoes.md': 'x',
    '_memoria/diario/2026-10-01.md': 'x', 'marca/design-guide.md': 'x', 'propostas/a.md': 'x',
    'solto.txt': 'x', 'tarefas.md': 'x', '.origem': 'dono',
  }, raiz => {
    assert.deepEqual(orfaos(raiz), ['_contexto/rascunho-velho.md', 'propostas/', 'solto.txt'])
  })
})

test('automacoes: rotina sem sinal, robo sem registro e origem desconhecida', () => {
  const tabela = [
    '| nome | o que faz | onde roda | quando | origem que assina | como saber se quebrou |',
    '|---|---|---|---|---|---|',
    '| estoque | confere estoque | este pc | 7h | robo-estoque | recado |',
    '| perguntas | responde | este pc | 9h | `robo-perguntas` | recado |',
    '| vendas | resume vendas | este pc | 8h | robo-vendas | recado |',
  ].join('\n')
  const livro = [JSON.stringify({ robo: 'perguntas', inicio: '2026-10-04T12:00:00.000Z' }), JSON.stringify({ robo: 'precos', inicio: '2026-10-03T12:00:00.000Z' }), '{cortada'].join('\n')
  comProjeto({
    '_contexto/automacoes.md': tabela, 'robos/execucoes.jsonl': livro,
    '_memoria/diario/2026-10-02-notebook.md': 'x', '_memoria/diario/2026-10-02.md': 'x',
    '_memoria/recados/2026-06-01-robo-vendas-aviso-0800.md': 'antigo, fora dos 30 dias',
    '_memoria/recados/2026-10-04-robo-estoque-aviso-0700.md': 'de: robo-estoque',
    '_memoria/recados/2026-10-04-robo-precos-aviso-0700.md': 'de: robo-precos',
    '_memoria/recados/2026-10-04-dono-lembrete.md': 'de: dono',
  }, raiz => {
    const a = automacoes(raiz, HOJE)
    assert.equal(a.registradas, 3)
    assert.deepEqual(a.semSinal, ['vendas'])
    assert.deepEqual(a.robosSemRegistro, ['precos'])
    assert.deepEqual(a.origensSemRegistro, ['notebook'])
    assert.deepEqual(a.recadosSemRegistro, ['2026-10-04-robo-precos-aviso-0700.md'])
  })
})

test('automacoes: origem mais longa ganha quando uma e prefixo da outra', () => {
  const tabela = [
    '| nome | origem |', '|---|---|',
    '| geral | robo |', '| estoque | robo-estoque |',
  ].join('\n')
  comProjeto({ '_contexto/automacoes.md': tabela, '_memoria/recados/2026-10-04-robo-estoque-aviso-0700.md': 'x' }, raiz => {
    assert.deepEqual(automacoes(raiz, HOJE).semSinal, ['geral'])
  })
})

test('orfaos: arquivo e pasta citados por skill instalada nao sao orfaos', () => {
  const base = {
    'AGENTS.md': '## Mapa\nLeia `_contexto/empresa.md`.',
    '_contexto/empresa.md': 'x', '_contexto/mercado-livre.md': 'x', 'producao/a.md': 'x',
  }
  comProjeto(base, raiz => {
    const o = orfaos(raiz)
    assert.ok(o.length > 0, 'canario: sem skill citando, alguma coisa sai')
    assert.deepEqual(o, ['_contexto/mercado-livre.md', 'producao/'], 'sem skill citando, continuam orfaos')
  })
  comProjeto({ ...base, '.claude/skills/mercado-livre/SKILL.md': 'Ler `_contexto/mercado-livre.md` e gravar em `producao/<produto>/`.' }, raiz => {
    assert.deepEqual(orfaos(raiz), [])
  })
})

test('orfaos: so SKILL.md de outra skill, com o caminho entre crases, tira do orfao', () => {
  const base = {
    'AGENTS.md': '## Mapa\nLeia `_contexto/empresa.md`.',
    '_contexto/empresa.md': 'x', '_contexto/mercado-livre.md': 'x', 'producao/a.md': 'x', 'meus-videos/a.mp4': 'x',
  }
  const esperado = ['_contexto/mercado-livre.md', 'meus-videos/', 'producao/']
  // a propria faxina cita os caminhos como exemplo: nao conta
  comProjeto({ ...base, '.claude/skills/faxina/SKILL.md': 'Exemplo: `_contexto/mercado-livre.md`, `producao/`.' }, raiz => {
    assert.deepEqual(orfaos(raiz).sort(), esperado)
  })
  // codigo, exemplo e comentario de script nao contam
  comProjeto({ ...base, '.claude/skills/video/scripts/x.mjs': "// grava em `producao/` e `_contexto/mercado-livre.md`" }, raiz => {
    assert.deepEqual(orfaos(raiz).sort(), esperado)
  })
  // linha de citacao (exemplo de fala, como o do /mapear) nao conta; a mesma pasta fora da citacao conta
  comProjeto({ ...base, '.claude/skills/mapear/SKILL.md': '> - [Salva o resultado em `producao/`]\n' }, raiz => {
    assert.deepEqual(orfaos(raiz).sort(), esperado)
  })
  comProjeto({ ...base, '.claude/skills/video/SKILL.md': 'O vídeo sai em `producao/`.\n' }, raiz => {
    assert.deepEqual(orfaos(raiz).sort(), ['_contexto/mercado-livre.md', 'meus-videos/'])
  })
  // citar videos/ nao tira meus-videos/; caminho sem crase nao conta
  comProjeto({ ...base, '.claude/skills/video/SKILL.md': 'Salva em `videos/` e em producao/ solto.' }, raiz => {
    assert.deepEqual(orfaos(raiz).sort(), esperado)
  })
})

test('automacoes: maquina da linha Equipe e maquinas e origem conhecida', () => {
  const recado = { '_memoria/recados/2026-10-04-notebook-auto-sync-parado.md': 'de: notebook', '_memoria/diario/2026-10-02-notebook.md': 'x' }
  comProjeto(recado, raiz => {
    const a = automacoes(raiz, HOJE)
    assert.deepEqual(a.recadosSemRegistro, ['2026-10-04-notebook-auto-sync-parado.md'], 'sem a linha, vira sem registro')
    assert.deepEqual(a.origensSemRegistro, ['notebook'])
  })
  const ferramentas = '| Ferramenta | Estado | Desde | Nota |\n|---|---|---|---|\n| Equipe e máquinas | dono (este computador), notebook, Bia | 2026-09-01 | cada computador tem o .origem |\n'
  comProjeto({ ...recado, '_contexto/ferramentas.md': ferramentas }, raiz => {
    const a = automacoes(raiz, HOJE)
    assert.deepEqual(a.recadosSemRegistro, [])
    assert.deepEqual(a.origensSemRegistro, [])
  })
})

test('foraDoBackup: copia do atualizador em .sabinos/ e recado de envio parado ficam fora de proposito', () => {
  comProjeto({
    '.gitignore': '*\n!*/\n!*.md\n!.gitignore\n_memoria/recados/*-auto-sync-parado.md\n', 'a.md': 'x', 'video.mp4': 'x',
    '.sabinos/.gitignore': 'antes-*/\ndesfeito-*/\nplano.json\n', '.sabinos/antes-4.3-x/arquivo.md': 'x',
    '_memoria/recados/2026-10-04-notebook-auto-sync-parado.md': 'x',
  }, raiz => {
    execFileSync('git', ['init', '-q', raiz])
    const bruto = execFileSync('git', ['-C', raiz, 'status', '--ignored=matching', '--porcelain=v1'], { encoding: 'utf8' })
    assert.ok(bruto.includes('.sabinos/antes-4.3-x/') && bruto.includes('auto-sync-parado'), 'canario: o git ignora os dois')
    assert.deepEqual(foraDoBackup(raiz).arquivos, ['video.mp4'])
  })
})

test('orfaos: robos/ e bem-vindo.html sao sempre conhecidos', () => {
  comProjeto({ 'AGENTS.md': 'nada citado', 'robos/execucoes.jsonl': 'x', 'bem-vindo.html': 'x', 'solto.txt': 'x' }, raiz => {
    assert.deepEqual(orfaos(raiz), ['solto.txt'])
  })
})

test('foraDoBackup pula pasta ignorada com .git proprio (pasta compartilhada)', () => {
  comProjeto({ '.gitignore': 'clientes/acme/\nvideo.mp4\n', 'a.md': 'x', 'video.mp4': 'x', 'clientes/acme/AGENTS.md': 'x' }, raiz => {
    execFileSync('git', ['init', '-q', raiz])
    execFileSync('git', ['init', '-q', join(raiz, 'clientes', 'acme')])
    const b = foraDoBackup(raiz)
    assert.equal(b.semGit, false)
    assert.deepEqual(b.arquivos, ['video.mp4'])
  })
})

test('aplicarArquivo nao duplica a entrada que ja esta no decisoes-substituidas.md', () => {
  const ja = '# Decisões substituídas\r\n\r\n## 2026-01-10, frete grátis acima de 99 (dono)\r\nMotivo: margem.\r\n\r\n'
  comProjeto({ '_memoria/decisoes.md': DECISOES, '_memoria/arquivo/2026/decisoes-substituidas.md': ja }, raiz => {
    const f = aplicarArquivo(raiz, HOJE)
    assert.deepEqual(f.decisoes, ['2026-01-10'])
    const arq = readFileSync(join(raiz, '_memoria/arquivo/2026/decisoes-substituidas.md'), 'utf8')
    assert.equal(arq.match(/acima de 99/g).length, 1)
    assert.ok(!readFileSync(join(raiz, '_memoria/decisoes.md'), 'utf8').includes('acima de 99'), 'sai do decisoes.md')
  })
})

test('foraDoBackup lista o ignorado que nao e bloqueio de proposito', () => {
  comProjeto({
    '.gitignore': '*\n!*/\n!*.md\n!.gitignore\n', 'a.md': 'x', 'video.mp4': 'x', 'planilha.numbers': 'x',
    '.env': 'x', '.origem': 'dono', 'node_modules/p/a.js': 'x',
    '.claude/skills/x/fonte.ttf': 'x', '.claude/skills/x/referencias/voz.wav': 'x',
  }, raiz => {
    execFileSync('git', ['init', '-q', raiz])
    const b = foraDoBackup(raiz)
    assert.equal(b.semGit, false)
    assert.deepEqual(b.arquivos, ['planilha.numbers', 'video.mp4'])
  })
})

test('foraDoBackup sem git avisa em vez de quebrar', () => {
  comProjeto({ 'a.md': 'x' }, raiz => assert.deepEqual(foraDoBackup(raiz), { semGit: true, arquivos: [], pastas: [] }))
})

test('foraDoBackup junta por pasta quando passa de tres arquivos', () => {
  const arquivos = { '.gitignore': '*\n!*/\n!*.md\n!.gitignore\n', 'a.md': 'x', 'video.mp4': 'x', 'exportes/a.numbers': 'x', 'exportes/b.numbers': 'x' }
  for (let i = 1; i <= 10; i++) arquivos[`fotos/f${i}.jpg`] = 'x'
  comProjeto(arquivos, raiz => {
    execFileSync('git', ['init', '-q', raiz])
    const b = foraDoBackup(raiz)
    assert.ok(b.arquivos.length > 0, 'canario: veio algo')
    assert.deepEqual(b.arquivos, ['exportes/a.numbers', 'exportes/b.numbers', 'video.mp4'])
    assert.deepEqual(b.pastas, [{ pasta: 'fotos/', arquivos: 10 }])
  })
})

test('memoriaDoAgente acha a pasta codificada sem olhar maiuscula', () => {
  const home = mkdtempSync(join(tmpdir(), 'home-'))
  try {
    const raiz = ['E:', 'Clientes', 'loja_bolos'].join(String.fromCharCode(92))
    const cod = 'e--Clientes-loja-bolos'
    mkdirSync(join(home, '.claude', 'projects', cod, 'memory'), { recursive: true })
    writeFileSync(join(home, '.claude', 'projects', cod, 'memory', 'MEMORY.md'), 'indice')
    assert.equal(memoriaDoAgente(raiz, home), null, 'so o indice nao conta')
    writeFileSync(join(home, '.claude', 'projects', cod, 'memory', 'cliente-acme.md'), 'x')
    assert.deepEqual(memoriaDoAgente(raiz, home).arquivos, ['cliente-acme.md'])
  } finally { rmSync(home, { recursive: true, force: true }) }
})

test('CLI: relatorio sai em JSON e arquivar sem --sim recusa', () => {
  comProjeto({ 'AGENTS.md': 'x', '_memoria/diario/2026-01-01.md': 'velho' }, raiz => {
    const r = JSON.parse(execFileSync('node', [SCRIPT, '--hoje', HOJE], { cwd: raiz, encoding: 'utf8' }))
    assert.equal(r.arquivar.diarios.length, 1)
    assert.deepEqual(r.ultimosDiarios, ['_memoria/diario/2026-01-01.md'])
    assert.throws(() => execFileSync('node', [SCRIPT, 'arquivar', '--hoje', HOJE], { cwd: raiz, stdio: 'pipe' }), e => e.status === 2)
    assert.ok(existsSync(join(raiz, '_memoria/diario/2026-01-01.md')), 'nada mexido sem --sim')
    execFileSync('node', [SCRIPT, 'arquivar', '--sim', '--hoje', HOJE], { cwd: raiz })
    assert.ok(existsSync(join(raiz, '_memoria/arquivo/2026/2026-01-01.md')))
  })
})

test('relatorio de projeto sem _memoria nem AGENTS.md nao quebra', () => {
  comProjeto({ 'a.md': 'x' }, raiz => {
    const r = relatorio(raiz, HOJE, raiz)
    assert.deepEqual(r.arquivar.diarios, [])
    assert.deepEqual(r.orfaos, [])
  })
})

test('CLI: rodar por symlink/junction executa normalmente', () => {
  comProjeto({ 'AGENTS.md': 'x', '_memoria/diario/2026-01-01.md': 'velho' }, raiz => {
    const link = join(tmpdir(), 'faxina-link-' + Math.random().toString(36).slice(2))
    try {
      symlinkSync(join(dirname(SCRIPT)), link, 'junction')
      const r = JSON.parse(execFileSync('node', [join(link, 'faxina.mjs'), '--hoje', HOJE], { cwd: raiz, encoding: 'utf8' }))
      assert.ok(r.arquivar, 'relatorio tem chave arquivar')
    } finally {
      try { unlinkSync(link) } catch {}
      try { rmdirSync(link) } catch {}
    }
  })
})

test('varrerSegredos e orfaos nao quebram com arquivo ilegivel (broken junction)', () => {
  comProjeto({
    'AGENTS.md': '## Mapa\nLeia `_contexto/empresa.md`.',
    '_contexto/empresa.md': 'x',
    'solto.txt': 'x',
  }, raiz => {
    const link = join(raiz, 'broken-link')
    const target = join(tmpdir(), 'alvo-' + Math.random().toString(36).slice(2))
    try {
      mkdirSync(target, { recursive: true })
      symlinkSync(target, link, 'junction')
      rmSync(target, { recursive: true, force: true })
      const segreRedos = varrerSegredos(raiz)
      const orfaosList = orfaos(raiz)
      const rel = relatorio(raiz, '2026-10-05', raiz)
      assert.deepEqual(segreRedos, [], 'varrerSegredos ignora broken junction')
      assert.deepEqual(orfaosList, ['solto.txt'], 'orfaos ignora broken junction, retorna somente solto.txt')
      assert.ok(Array.isArray(rel.ilegiveis), 'relatorio.ilegiveis e array')
    } finally {
      try { unlinkSync(link) } catch {}
      try { rmdirSync(link) } catch {}
    }
  })
})

test('orfaos: so checa secoes ## Mapa, ## Tabela de destinos, ## Estrutura de pastas (exact match)', () => {
  comProjeto({
    'AGENTS.md': `## Mapa
Leia \`empresa.md\`.

## Regras de operacao
Menciona \`solto.txt\` aqui.

## Tabela de destinos
Vai pra \`marca/\`.

## Mapas (nao e secao valida)
Menciona \`invalid.txt\` aqui.`,
    'empresa.md': 'x', 'marca/design.md': 'x', 'solto.txt': 'x', 'outro.txt': 'x', 'invalid.txt': 'x',
  }, raiz => {
    const o = orfaos(raiz)
    assert.ok(o.includes('solto.txt'), 'solto.txt nao mencionado nas secoes certas e orfao')
    assert.ok(o.includes('outro.txt'), 'outro.txt e orfao (nao mencionado em lugar nenhum)')
    assert.ok(!o.includes('empresa.md'), 'empresa.md e citado em ## Mapa')
    assert.ok(!o.includes('marca/'), 'marca/ e citado em ## Tabela de destinos')
    assert.ok(o.includes('invalid.txt'), '## Mapas nao e secao valida, entao invalid.txt e orfao')
  })
})

test('foraDoBackup: retorna semGit: true se projeto esta dentro de outro repo', () => {
  const paiRepo = mkdtempSync(join(tmpdir(), 'pai-'))
  try {
    execFileSync('git', ['init', '-q', paiRepo])
    const projeto = join(paiRepo, 'projeto')
    mkdirSync(projeto, { recursive: true })
    writeFileSync(join(projeto, '.gitignore'), '*\n!.gitignore\n!*.md\n')
    writeFileSync(join(projeto, 'video.mp4'), 'x')
    const b = foraDoBackup(projeto)
    assert.deepEqual(b, { semGit: true, arquivos: [], pastas: [] }, 'projeto dentro de outro repo retorna semGit: true')
  } finally {
    rmSync(paiRepo, { recursive: true, force: true })
  }
})

test('foraDoBackup: ignora .DS_Store, Thumbs.db, desktop.ini, ~$lock', () => {
  comProjeto({
    '.gitignore': '*\n!*/\n!*.md\n!.gitignore\n', 'a.md': 'x', 'video.mp4': 'x',
    '.DS_Store': 'x', 'Thumbs.db': 'x', 'desktop.ini': 'x', '~$planilha.xlsx': 'x',
  }, raiz => {
    execFileSync('git', ['init', '-q', raiz])
    const b = foraDoBackup(raiz)
    assert.equal(b.semGit, false)
    assert.deepEqual(b.arquivos, ['video.mp4'])
  })
})


test('CLI: --hoje invalido (nao /\\d{4}-\\d{2}-\\d{2}/) sai com codigo 2 e erro em stderr', () => {
  comProjeto({ 'AGENTS.md': 'x' }, raiz => {
    assert.throws(() => execFileSync('node', [SCRIPT, '--hoje', '2026-10-5'], { cwd: raiz, stdio: 'pipe', encoding: 'utf8' }),
      e => e.status === 2, '--hoje 2026-10-5 sai com codigo 2')
    assert.throws(() => execFileSync('node', [SCRIPT, '--hoje', 'invalido'], { cwd: raiz, stdio: 'pipe', encoding: 'utf8' }),
      e => e.status === 2, '--hoje invalido sai com codigo 2')
  })
})

// repositorio de teste: commit com data marcada, sem conversao de final de linha
function iniciarGit(raiz) {
  execFileSync('git', ['init', '-q', raiz])
  for (const [k, v] of [['core.autocrlf', 'false'], ['user.email', 'teste@exemplo.com'], ['user.name', 'teste'], ['commit.gpgsign', 'false']]) execFileSync('git', ['-C', raiz, 'config', k, v])
}
function commitar(raiz, arquivos, data) {
  for (const [rel, txt] of Object.entries(arquivos)) {
    mkdirSync(join(raiz, rel, '..'), { recursive: true })
    writeFileSync(join(raiz, rel), txt)
    execFileSync('git', ['-C', raiz, 'add', '--', rel])
  }
  const quando = `${data}T12:00:00`
  execFileSync('git', ['-C', raiz, 'commit', '-q', '-m', 'x'], { env: { ...process.env, GIT_AUTHOR_DATE: quando, GIT_COMMITTER_DATE: quando } })
}
const entradas = (n, quem = 'dono') => Array.from({ length: n }, (_, i) => `- 09:${String(i).padStart(2, '0')}, fez a tarefa ${i} (${quem})`).join('\n') + '\n'

test('diarioRende: diario cheio e nada destilado vira alerta; com mudanca destilada, nao', () => {
  comProjeto({}, raiz => {
    iniciarGit(raiz)
    commitar(raiz, {
      '_memoria/diario/2026-10-01.md': '# 2026-10-01\n\n' + entradas(12),
      '_memoria/diario/2026-08-01.md': entradas(30),   // fora dos 30 dias
    }, '2026-10-01')
    commitar(raiz, { '_memoria/decisoes.md': '## 2026-07-01, velha\n' }, '2026-07-01')   // mudanca fora da janela
    const r = diarioRende(raiz, HOJE)
    assert.ok(r.entradas > 0, 'canario: contou entrada')
    assert.deepEqual(r, { semGit: false, entradas: 12, mudancas: 0, alerta: true })
    commitar(raiz, { '_contexto/empresa.md': 'x', 'clientes/acme/andamento.md': 'x' }, '2026-10-02')
    assert.deepEqual(diarioRende(raiz, HOJE), { semGit: false, entradas: 12, mudancas: 1, alerta: true }, 'um commit com dois arquivos e uma mudanca')
    commitar(raiz, { '_memoria/decisoes.md': '## 2026-10-03, nova\n' }, '2026-10-03')
    assert.deepEqual(diarioRende(raiz, HOJE), { semGit: false, entradas: 12, mudancas: 2, alerta: false })
  })
  comProjeto({ '_memoria/diario/2026-10-01.md': entradas(9) }, raiz => {
    iniciarGit(raiz)
    commitar(raiz, { 'a.md': 'x' }, '2026-10-01')
    assert.equal(diarioRende(raiz, HOJE).alerta, false, 'abaixo de 10 entradas nao avisa')
  })
  comProjeto({ '_memoria/diario/2026-10-01.md': entradas(20) }, raiz => {
    assert.deepEqual(diarioRende(raiz, HOJE), { semGit: true }, 'sem git pula')
  })
})

test('frescor: regra parada ha mais de 60 dias com diario vivo; diario parado nao avisa', () => {
  comProjeto({}, raiz => {
    iniciarGit(raiz)
    commitar(raiz, { 'AGENTS.md': 'regras', '_contexto/estrategia.md': 'x' }, '2026-07-01')
    commitar(raiz, { '_contexto/estrategia.md': 'y', '_contexto/empresa.md': 'x', '_memoria/diario/2026-09-01.md': entradas(1) }, '2026-09-20')
    const parado = frescor(raiz, HOJE)
    assert.deepEqual(parado, { semGit: false, parados: [] }, 'diario sem entrada nos ultimos 14 dias: nada')
    commitar(raiz, { '_memoria/diario/2026-10-01.md': entradas(1) }, '2026-10-01')
    const r = frescor(raiz, HOJE)
    assert.ok(r.parados.length > 0, 'canario: achou parado')
    assert.deepEqual(r.parados, [{ arquivo: 'AGENTS.md', dias: diasEntre('2026-07-01', HOJE) }])
    assert.ok(r.parados[0].dias > 60)
  })
  comProjeto({ 'AGENTS.md': 'x', '_memoria/diario/2026-10-01.md': entradas(1) }, raiz => {
    assert.deepEqual(frescor(raiz, HOJE), { semGit: true, parados: [] }, 'sem git pula')
  })
})

test('ferramentasSemRegistro: servidor e variavel que o ferramentas.md nao cita, sem valor', () => {
  const valor = 'Zx9' + 'Qw8Er7Ty6Ui5'
  const base = {
    '.mcp.json': JSON.stringify({ mcpServers: { playwright: {}, 'Mercado-Livre': {}, notion: {} } }),
    '.env': `META_TOKEN=${valor}\r\nOPENAI_API_KEY=${valor}\r\nBLING_CLIENT_ID=1\r\n# COMENTARIO=1\r\nexport GEMINI_API_KEY=${valor}\r\n_ESCONDIDA=1\r\n`,
  }
  comProjeto({ ...base, '_contexto/ferramentas.md': '| Playwright | ligado |\n| mercado-livre | ligado |\n| Meta Ads | ligado |\n| bling_client_id |\n' }, raiz => {
    const r = ferramentasSemRegistro(raiz)
    assert.ok(r.mcp.length > 0 && r.env.length > 0, 'canario: achou alguma coisa')
    assert.deepEqual(r, { mcp: ['notion'], env: ['GEMINI_API_KEY', 'OPENAI_API_KEY', '_ESCONDIDA'] })
    assert.ok(!JSON.stringify(r).includes(valor), 'valor do .env nunca sai')
  })
  comProjeto({ ...base, '_contexto/ferramentas.md': 'notion, openai, gemini e _escondida tambem' }, raiz => {
    assert.deepEqual(ferramentasSemRegistro(raiz).mcp, ['Mercado-Livre', 'playwright'])
    assert.deepEqual(ferramentasSemRegistro(raiz).env, ['BLING_CLIENT_ID', 'META_TOKEN'])
  })
  comProjeto(base, raiz => {
    assert.deepEqual(ferramentasSemRegistro(raiz), { mcp: [], env: [] }, 'sem ferramentas.md pula calado')
  })
})

test('ferramentasSemRegistro: chave PEM de varias linhas nunca vira nome, e prefixo curto nao casa dentro de palavra', () => {
  // a ultima linha de base64 termina em "=" como uma atribuicao; so maiuscula e digito, pra
  // passar no filtro de nome e o que segura ser o pulo do valor entre aspas
  const pedaco = 'KQ9XVBN3SLWPZ8QMR2TYHUE4JF0AGDD5CE7OHIT1VXKWNA'
  const env = ['GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE ' + 'KEY-----', 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASC', pedaco + '=', '-----END PRIVATE ' + 'KEY-----"', 'IG_ACCESS_TOKEN=x', 'ML_CLIENT_ID=1'].join('\n')
  comProjeto({ '.env': env, '_contexto/ferramentas.md': 'O /conectar liga e configura. Pagina em html. google ok.' }, raiz => {
    const r = ferramentasSemRegistro(raiz)
    assert.ok(r.env.length > 0, 'canario: achou alguma coisa')
    assert.ok(!JSON.stringify(r).includes(pedaco), 'pedaco da chave nunca sai')
    assert.deepEqual(r.env, ['IG_ACCESS_TOKEN', 'ML_CLIENT_ID'], '"liga" nao esconde IG_, "html" nao esconde ML_, e "google" cobre GOOGLE_')
  })
})

test('diarioRende: repositorio sem nenhum commit nao vira alerta', () => {
  const linhas = Array.from({ length: 12 }, (_, i) => `- 0${i % 10}:00, coisa ${i}`).join('\n')
  comProjeto({ '_memoria/diario/2026-10-04.md': `# 2026-10-04\n${linhas}\n` }, raiz => {
    execFileSync('git', ['init', '-q', raiz])
    assert.deepEqual(diarioRende(raiz, HOJE), { semGit: true })
  })
})

test('relatorio traz as tres checagens novas', () => {
  comProjeto({ '_contexto/ferramentas.md': 'nada', '.mcp.json': '{"mcpServers":{"notion":{}}}' }, raiz => {
    const r = relatorio(raiz, HOJE, raiz)
    assert.deepEqual(r.diarioRende, { semGit: true })
    assert.deepEqual(r.frescor, { semGit: true, parados: [] })
    assert.deepEqual(r.ferramentasSemRegistro, { mcp: ['notion'], env: [] })
  })
})
