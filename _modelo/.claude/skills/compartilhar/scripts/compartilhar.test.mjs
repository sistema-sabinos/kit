import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { varrer, extrairDecisoes, conferir } from './compartilhar.mjs'

const SCRIPT = fileURLToPath(new URL('./compartilhar.mjs', import.meta.url))

function projeto(arquivos) {
  const raiz = mkdtempSync(join(tmpdir(), 'compartilhar-'))
  for (const [rel, txt] of Object.entries(arquivos)) {
    mkdirSync(join(raiz, rel, '..'), { recursive: true })
    writeFileSync(join(raiz, rel), txt)
  }
  return raiz
}
const comProjeto = (arquivos, fn) => { const r = projeto(arquivos); try { return fn(r) } finally { rmSync(r, { recursive: true, force: true }) } }

const DECISOES = [
  '# Decisões', '',
  '## 2026-09-01, Acme paga em 30 dias [acme] (dono)', 'Motivo: contrato.', '',
  '## 2026-09-02, frete grátis acima de 79 (dono)', 'Motivo: margem.', '',
  '## 2026-09-20, Acme passa a pagar em 15 dias [acme] (dono)', 'substitui: 2026-09-01', '',
].join('\r\n')

test('varrer acha segredo e .env dentro da pasta', () => {
  comProjeto({ 'clientes/acme/notas.md': 'chave sk-' + 'a1B2c3D4e5F6g7H8i9J0k1L2\n', 'clientes/acme/sub/.env': 'X=1' }, raiz => {
    const r = varrer(join(raiz, 'clientes/acme'))
    assert.deepEqual(r.segredos.map(s => s.arquivo), ['notas.md'])
    assert.deepEqual(r.envs, ['sub/.env'])
  })
})

test('extrairDecisoes leva so as do projeto, em CRLF, e nao duplica na segunda vez', () => {
  comProjeto({ '_memoria/decisoes.md': DECISOES, 'clientes/acme/AGENTS.md': 'x' }, raiz => {
    const pasta = join(raiz, 'clientes/acme')
    assert.deepEqual(extrairDecisoes(raiz, pasta, 'acme', '2026-10-05'), { copiadas: 2, jaEstavam: 0, paraConferir: [] })
    const d = readFileSync(join(pasta, 'decisoes.md'), 'utf8')
    assert.ok(d.startsWith('# Decisões de acme'))
    assert.ok(d.includes('30 dias') && d.includes('15 dias') && d.includes('substitui: 2026-09-01'))
    assert.ok(!d.includes('frete'))
    assert.equal((d.match(/\r/g) || []).length, (d.match(/\n/g) || []).length)
    assert.deepEqual(extrairDecisoes(raiz, pasta, 'acme', '2026-10-05'), { copiadas: 0, jaEstavam: 2, paraConferir: [] })
    assert.ok(readFileSync(join(raiz, '_memoria/decisoes.md'), 'utf8').includes('[acme]'), 'a raiz fica intacta')
  })
})

test('extrairDecisoes acrescenta so a nova quando a pasta ja tem decisoes.md', () => {
  comProjeto({ '_memoria/decisoes.md': DECISOES }, raiz => {
    const pasta = join(raiz, 'acme')
    mkdirSync(pasta)
    writeFileSync(join(pasta, 'decisoes.md'), '# Decisões de acme\r\n\r\n## 2026-09-01, Acme paga em 30 dias [acme] (dono)\r\nMotivo: contrato.\r\n')
    assert.deepEqual(extrairDecisoes(raiz, pasta, 'Acme'), { copiadas: 1, jaEstavam: 1, paraConferir: [] })
    const d = readFileSync(join(pasta, 'decisoes.md'), 'utf8')
    assert.equal(d.match(/# Decisões/g).length, 1)
    assert.ok(d.includes('15 dias'))
  })
})

test('extrairDecisoes sem _memoria nao quebra', () => {
  comProjeto({ 'acme/a.md': 'x' }, raiz => assert.deepEqual(extrairDecisoes(raiz, join(raiz, 'acme'), 'acme'), { copiadas: 0, jaEstavam: 0, paraConferir: [] }))
})

test('extrairDecisoes no formato de lista da 4.3a: [projeto] acme casa, [projeto] acme-2 nao', () => {
  const decisoes = [
    '# Decisões', '',
    '- 2026-09-01, dono, [projeto] acme: paga em 30 dias',
    '- 2026-09-02, dono, [projeto] acme-2: outra',
    '- 2026-09-03, dono, [projeto] Acme', '',
  ].join('\r\n')
  comProjeto({ '_memoria/decisoes.md': decisoes }, raiz => {
    const pasta = join(raiz, 'acme')
    mkdirSync(pasta)
    const r = extrairDecisoes(raiz, pasta, 'acme', '2026-10-05')
    assert.deepEqual(r, { copiadas: 2, jaEstavam: 0, paraConferir: [] })
    const d = readFileSync(join(pasta, 'decisoes.md'), 'utf8')
    assert.ok(d.includes('paga em 30 dias'))
    assert.ok(!d.includes('outra'), 'acme-2 nao entra')
    assert.ok(d.indexOf('30 dias') < d.indexOf('2026-09-03'), 'ordem do arquivo')
    assert.deepEqual(extrairDecisoes(raiz, pasta, 'acme', '2026-10-05'), { copiadas: 0, jaEstavam: 2, paraConferir: [] })
  })
})

test('extrairDecisoes acha a decisao nos tres formatos de etiqueta, passada de qualquer jeito', () => {
  const txt = [
    '# Decisões', '',
    '- 2026-09-01, dono, [doceria-da-bia]: bolo sai na sexta. Por quê: forno.',
    '- 2026-09-02, dono, [projeto] doceria-da-bia: paga em 30 dias. Por quê: contrato.',
    '- 2026-09-03, dono, [projeto] clientes/doceria-da-bia: logo novo. Por quê: marca.',
    '- 2026-09-04, dono, [projeto] clientes/doceria-da-bia-2: outra. Por quê: x.',
    '- 2026-09-05, dono: frete grátis acima de 79. Por quê: margem.', '',
  ].join('\r\n')
  for (const etiqueta of ['doceria-da-bia', '[doceria-da-bia]', '[projeto] doceria-da-bia', '[projeto] clientes/doceria-da-bia', 'clientes/doceria-da-bia']) {
    comProjeto({ '_memoria/decisoes.md': txt, 'clientes/doceria-da-bia/a.md': 'x' }, raiz => {
      const pasta = join(raiz, 'clientes', 'doceria-da-bia')
      assert.deepEqual(extrairDecisoes(raiz, pasta, etiqueta, '2026-10-05'), { copiadas: 3, jaEstavam: 0, paraConferir: [] }, etiqueta)
      const dest = readFileSync(join(pasta, 'decisoes.md'), 'utf8')
      assert.ok(dest.startsWith('# Decisões de doceria-da-bia\r\n'), etiqueta)
      assert.ok(!dest.includes('doceria-da-bia-2') && !dest.includes('frete'), etiqueta)
    })
  }
})

test('extrairDecisoes nao vaza decisao sem etiqueta que substitui uma da pasta', () => {
  const decisoes = [
    '# Decisões', '',
    '## 2026-05-01, Acme paga em 30 dias [acme] (dono)', 'Motivo: contrato.', '',
    '## 2026-06-01, frete 79 (dono)', 'substitui: 2026-05-01', '',
  ].join('\r\n')
  comProjeto({ '_memoria/decisoes.md': decisoes }, raiz => {
    const pasta = join(raiz, 'acme')
    mkdirSync(pasta)
    const r = extrairDecisoes(raiz, pasta, 'acme', '2026-10-05')
    assert.equal(r.copiadas, 1)
    assert.deepEqual(r.paraConferir, ['## 2026-06-01, frete 79 (dono)'])
    assert.ok(!readFileSync(join(pasta, 'decisoes.md'), 'utf8').includes('frete'), 'frete 79 nao vai pra pasta')
  })
})

test('conferir aponta caminho absoluto de disco e de usuario', () => {
  const bs = String.fromCharCode(92)
  comProjeto({
    'acme/AGENTS.md': [
      'Planilha em E:' + bs + 'Clientes' + bs + 'acme.xlsx', 'Outra em C:' + '/Users/bia/x.md', 'Mac em /Users/bia/x.md',
      'Linux em /home/bia/x.md', 'Git Bash em /c/Users/bia/x.md', 'site https://acme.com/home/ e http://x.com/Users/ ok', '',
    ].join('\n'),
  }, raiz => {
    assert.deepEqual(conferir(join(raiz, 'acme')).map(f => f.linha), [1, 2, 3, 4, 5])
  })
})

test('varrer lista em naoVarridos o arquivo binario que nao leu', () => {
  comProjeto({ 'acme/a.md': 'tudo certo\n', 'acme/.env': 'X=1' }, raiz => {
    writeFileSync(join(raiz, 'acme', 'planilha.xlsx'), Buffer.from([80, 75, 3, 4, 0, 0, 0, 1]))
    const r = varrer(join(raiz, 'acme'))
    assert.deepEqual(r.naoVarridos, ['planilha.xlsx'])
    assert.deepEqual(r.ilegiveis, [])
  })
})

test('conferir aponta caminho que sai da pasta', () => {
  comProjeto({
    'acme/AGENTS.md': 'Marca em `../../marca/design-guide.md`.\nTabela em ../AGENTS.md\n',
    'acme/contexto.md': 'versão 1..2 e reticências... nada de caminho\n', 'acme/x.txt': '../fora',
  }, raiz => {
    assert.deepEqual(conferir(join(raiz, 'acme')), [{ arquivo: 'AGENTS.md', linha: 1 }, { arquivo: 'AGENTS.md', linha: 2 }])
  })
})

test('CLI: varrer sai 2 com segredo, conferir sai 1 com caminho de fora, 0 limpo', () => {
  comProjeto({ 'suja/a.md': 'senha: ' + 'Bolo2026x\n', 'limpa/a.md': 'tudo certo\n', 'fora/a.md': 'ver ../b.md\n' }, raiz => {
    assert.throws(() => execFileSync('node', [SCRIPT, 'varrer', 'suja'], { cwd: raiz, stdio: 'pipe' }), e => e.status === 2)
    assert.throws(() => execFileSync('node', [SCRIPT, 'conferir', 'fora'], { cwd: raiz, stdio: 'pipe' }), e => e.status === 1)
    const r = JSON.parse(execFileSync('node', [SCRIPT, 'varrer', 'limpa'], { cwd: raiz, encoding: 'utf8' }))
    assert.deepEqual(r, { segredos: [], envs: [], ilegiveis: [], naoVarridos: [] })
    assert.throws(() => execFileSync('node', [SCRIPT, 'varrer', 'nao-existe'], { cwd: raiz, stdio: 'pipe' }), e => e.status === 2)
  })
})

test('extrairDecisoes com tag so na primeira linha, nao em corpo', () => {
  const decisoes = [
    '# Decisões', '',
    '## 2026-09-01, base [acme] (dono)', 'Motivo: contrato. Também [acme] aqui.', '',
    '## 2026-09-02, outro (dono)', 'Motivo: ver o [acme] embaixo.', '',
  ].join('\r\n')
  comProjeto({ '_memoria/decisoes.md': decisoes, 'acme/AGENTS.md': 'x' }, raiz => {
    const pasta = join(raiz, 'acme')
    const r = extrairDecisoes(raiz, pasta, 'acme', '2026-10-05')
    assert.equal(r.copiadas, 1, 'só a primeira entrada com [acme] na heading')
    const d = readFileSync(join(pasta, 'decisoes.md'), 'utf8')
    assert.ok(d.includes('base'))
    assert.ok(!d.includes('outro'))
  })
})

test('extrairDecisoes manda pra paraConferir a entrada sem etiqueta que substitui uma copiada', () => {
  const decisoes = [
    '# Decisões', '',
    '## 2026-09-01, Acme paga em 30 dias [acme] (dono)', 'Motivo: contrato.', '',
    '## 2026-09-20, Acme passa a pagar em 15 dias [acme] (dono)', 'substitui: 2026-09-01', '',
    '## 2026-09-25, prazo novo (dono)', 'substitui: 2026-09-01', '',
  ].join('\r\n')
  comProjeto({ '_memoria/decisoes.md': decisoes }, raiz => {
    const pasta = join(raiz, 'acme')
    mkdirSync(pasta, { recursive: true })
    const r = extrairDecisoes(raiz, pasta, 'acme', '2026-10-05')
    assert.equal(r.copiadas, 2, 'so as duas [acme] diretas')
    assert.deepEqual(r.paraConferir, ['## 2026-09-25, prazo novo (dono)'])
    const d = readFileSync(join(pasta, 'decisoes.md'), 'utf8')
    assert.ok(d.includes('30 dias'))
    assert.ok(d.includes('15 dias'))
    assert.ok(!d.includes('prazo novo'))
  })
})

test('varrer nao relata .env.example', () => {
  comProjeto({ 'acme/.env': 'X=1', 'acme/.env.example': 'X=default', 'acme/.env.local': 'Y=2' }, raiz => {
    const r = varrer(join(raiz, 'acme'))
    assert.deepEqual(r.envs, ['.env', '.env.local'])
  })
})

test('extrairDecisoes CRLF destino com entrada existente + LF projeto com duas entradas', () => {
  const decisoesLF = '# Decisões\n\n## 2026-09-01, Acme paga [acme] (dono)\nMotivo: contrato.\n\n## 2026-09-20, Acme paga 15 dias [acme] (dono)\nsubstitui: 2026-09-01\n'
  comProjeto({ '_memoria/decisoes.md': decisoesLF }, raiz => {
    const pasta = join(raiz, 'pasta')
    mkdirSync(pasta, { recursive: true })
    writeFileSync(join(pasta, 'decisoes.md'), '# Decisões de acme\r\n\r\n## 2026-09-01, Acme paga [acme] (dono)\r\nMotivo: contrato.\r\n')
    extrairDecisoes(raiz, pasta, 'acme', '2026-10-05')
    const d = readFileSync(join(pasta, 'decisoes.md'), 'utf8')
    const crCount = (d.match(/\r/g) || []).length
    const lfCount = (d.match(/\n/g) || []).length
    assert.equal(crCount, lfCount, 'CR deve igualar LF')
    assert.ok(d.includes('15 dias'), 'segunda entrada copiada')
    const lines = d.split('\r\n')
    let blankBeforeNew = false
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i] === '' && lines[i + 1].includes('15 dias')) { blankBeforeNew = true; break }
    }
    assert.ok(blankBeforeNew, 'uma linha em branco antes da nova entrada')
  })
})

test('extrairDecisoes LF destino com uma quebra + CRLF projeto', () => {
  const decisoesCRLF = '# Decisões\r\n\r\n## 2026-09-01, algo [tag] (dono)\r\nMotivo: teste.\r\n\r\n## 2026-09-02, outro [tag] (dono)\r\nMotivo: teste2.\r\n'
  comProjeto({ '_memoria/decisoes.md': decisoesCRLF }, raiz => {
    const pasta = join(raiz, 'pasta')
    mkdirSync(pasta, { recursive: true })
    writeFileSync(join(pasta, 'decisoes.md'), '# Decisões de pasta\n\n## 2026-09-01, algo [tag] (dono)\nMotivo: teste.\n')
    extrairDecisoes(raiz, pasta, 'tag', '2026-10-05')
    const d = readFileSync(join(pasta, 'decisoes.md'), 'utf8')
    assert.ok(!d.includes('\r'), 'sem CR, apenas LF')
    assert.ok(d.includes('2026-09-02'), 'segunda entrada copiada')
    const blankLineIndex = d.indexOf('\n\n## 2026-09-02')
    assert.ok(blankLineIndex !== -1, 'uma linha em branco antes da nova entrada')
  })
})

test('extrairDecisoes mantém ordem do arquivo e deixa a sem etiqueta de fora', () => {
  const decisoes = [
    '# Decisões', '',
    '## 2026-09-01, primeira [acme] (dono)', 'Motivo: x.', '',
    '## 2026-09-15, prazo novo (dono)', 'substitui: 2026-09-01', '',
    '## 2026-09-20, segunda [acme] (dono)', 'Motivo: y.', '',
  ].join('\n')
  comProjeto({ '_memoria/decisoes.md': decisoes }, raiz => {
    const pasta = join(raiz, 'acme')
    mkdirSync(pasta, { recursive: true })
    const r = extrairDecisoes(raiz, pasta, 'acme', '2026-10-05')
    assert.equal(r.copiadas, 2)
    assert.deepEqual(r.paraConferir, ['## 2026-09-15, prazo novo (dono)'])
    const d = readFileSync(join(pasta, 'decisoes.md'), 'utf8')
    const primeiraIdx = d.indexOf('primeira')
    const segundaIdx = d.indexOf('segunda')
    assert.ok(primeiraIdx !== -1 && primeiraIdx < segundaIdx, 'ordem: primeira < segunda')
    assert.ok(!d.includes('prazo novo'))
  })
})

test('conferir nao relata caminho em .claude/skills', () => {
  comProjeto({ 'acme/.claude/skills/x/SKILL.md': 'Ver em ../../../y.md\n', 'acme/AGENTS.md': 'tudo bem\n' }, raiz => {
    const r = conferir(join(raiz, 'acme'))
    assert.deepEqual(r, [])
  })
})
