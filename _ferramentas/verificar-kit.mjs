#!/usr/bin/env node
// Gates de qualidade do kit SabinOS (pasta-mae + _modelo). Nenhum zip sai com gate vermelho.
// Uso: node verificar-kit.mjs <caminho-do-kit>
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, dirname, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { hashArquivo, ignorado, componenteDe } from './atualizar-projeto.mjs'

const CAMPOS_MUDANCA = ['O que é', 'Por quê', 'Te afeta se', 'Como aplicar', 'Como testar']

const PROIBIDOS = [
  'zabinno', 'sabino', 'henrique', 'rhs sabino', 'negocio-01', 'negocio-02',
  'negócio-01', 'negócio-02', 'bling', 'mercado livre', 'mercadolivre',
  'mercadolibre', 'mercado ads', 'orizom', 'takata', 'clickstech', 'sabicolor',
  'mr distribuidora', 'mr-distribuidora', 'qualynutri', 'webcontinental',
  'web continental', 'melhor envio', 'melhorenvio', 'nubimetrics', 'avantpro',
  'e:\\company', 'e:/company', 'sabinoonline', 'canetinha', 'bobbie goods',
  'andre aldo', 'andré aldo', '51.771.722', 'melizabinno',
  // marca do kit de origem (o SabinOS nasceu de um fork): nao pode sobrar no produto.
  // termos exatos, e nao "ratos" solto, porque "contratos" e "extratos" acusariam falso positivo
  'claude code os', 'ccos-ratos', 'ratos de ia', 'ratosdeia', 'ads-ratos', 'ga4-ratos', 'duduesh',
]
// termos permitidos: nome do produto (sabinos) nao pode acusar falso positivo do termo "sabino"
const PERMITIDOS = [/sabinos/gi, /sabinos\.zip/gi]
// o proprio detector (e seu teste) precisa CONTER a lista de termos proibidos e exemplos de
// segredo/MLB como dado pra funcionar e pra se testar; isso nao e vazamento, e auto-referencia
// estrutural (o linter listando suas proprias regras e testando com um caso positivo sintetico)
const ISENTOS_CONTEUDO = ['_ferramentas/verificar-kit.mjs', '_ferramentas/verificar-kit.test.mjs']
const RE_MLB = /\bMLB\d{6,}\b/
const RE_SEGREDO = /(API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|CLIENT_SECRET|BOT_TOKEN|_SECRET|_PASS|_PASSWORD)\s*[:=]\s*['"]?([A-Za-z0-9._\-]{8,})/g
// valor que e placeholder ou leitura de variavel, nao chave real
const RE_PLACEHOLDER = /xxx|aqui|exemplo|placeholder|process\.env|sua.?chave|seu.?token/i
const RE_LINK = /\[[^\]]*\]\(([^)]+)\)/g

const OBRIGATORIOS = [
  'COMECE-AQUI.md', 'README.md', 'CLAUDE.md', 'AGENTS.md', 'RESPONDA-AQUI.txt', '.gitignore',
  '.claude/settings.json',
  '.claude/skills/setup/SKILL.md', '.claude/skills/novo-projeto/SKILL.md',
  '.claude/skills/find-skills/SKILL.md', '.claude/skills/syncar/SKILL.md',
  '.claude/skills/atualizar-kit/SKILL.md',
  '_ferramentas/verificar-kit.mjs',
  '_ferramentas/lib/README.md', '_ferramentas/lib/watchdog.mjs',
  '_ferramentas/lib/fetch-timeout.mjs', '_ferramentas/lib/boot-guard.mjs',
  '_ferramentas/lib/backup-env.mjs',
  'docs/roadmap-avancado.md',
  '_modelo/CLAUDE.md', '_modelo/AGENTS.md', '_modelo/.gitignore', '_modelo/.claude/settings.json',
  '_modelo/.claude/hooks/barrar-perigoso.mjs',
  '_modelo/_contexto/empresa.md', '_modelo/_contexto/preferencias.md',
  '_modelo/_contexto/estrategia.md', '_modelo/_contexto/agora.md',
  '_modelo/_contexto/licoes.md', '_modelo/_contexto/ferramentas.md',
  '_modelo/marca/design-guide.md', '_modelo/dados/README.md',
  '_modelo/.claude/skills/iniciar/SKILL.md', '_modelo/.claude/skills/conectar/SKILL.md',
  '_modelo/.claude/skills/mapear/SKILL.md', '_modelo/.claude/skills/atualizar/SKILL.md',
  '_modelo/.claude/skills/syncar/SKILL.md', '_modelo/.claude/skills/assistir-video/SKILL.md',
  '_modelo/.claude/skills/transcribe/SKILL.md', '_modelo/.claude/skills/bastao/SKILL.md',
  '_modelo/.claude/skills/find-skills/SKILL.md', '_modelo/.claude/skills/otimizar-pc/SKILL.md',
  '_modelo/.claude/skills/checar/SKILL.md',
  '_modelo/.claude/skills/trafego/SKILL.md',
  '_modelo/.claude/skills/trafego/referencias/metodo.md',
  '_modelo/.claude/skills/trafego/referencias/regua-exemplo.md',
  '_modelo/.claude/skills/trafego/scripts/regua.mjs',
  '_modelo/.claude/skills/trafego/scripts/faixas.mjs',
  '_modelo/templates/ferramentas/catalogo.md', '_modelo/templates/skills/catalogo.md',
  '_modelo/templates/skills/financeiro.md', '_modelo/templates/skills/copy-venda.md',
  '_modelo/templates/perfis/agents-md-agencia.md', '_modelo/templates/perfis/agents-md-empresa.md',
  '_modelo/templates/perfis/agents-md-freelancer.md', '_modelo/templates/perfis/agents-md-solopreneur.md',
  'VERSAO', '_ferramentas/atualizar-projeto.mjs', '_ferramentas/componentes.json',
  '_ferramentas/impressoes.json', '_ferramentas/mudancas.md',
  '_modelo/.claude/skills/atualizar-sabinos/SKILL.md',
]

const PASTAS_PROIBIDAS = ['.agents', 'scripts']
const PROIBIDOS_ARQUIVOS = ['.env']

// padrao AGENTS.md: AGENTS.md carrega o conteudo real, CLAUDE.md e so o ponteiro pro Codex ler tambem.
// "so o ponteiro" = depois de tirar espaco em volta e comentario html, sobra exatamente "@AGENTS.md"
function ehSoPonteiroClaude(txt) {
  const semComentarios = txt.replace(/<!--[\s\S]*?-->/g, '')
  return semComentarios.trim() === '@AGENTS.md'
}

// Gate 9: o matcher de um hook PreToolUse e lista de nome exato de ferramenta separada
// por "|" ou "," (doc oficial, code.claude.com/docs/en/hooks, 2026-09-21), entao cobrir
// as duas ferramentas e ter "Bash" E "PowerShell" na lista, em qualquer ordem.
function matcherCobreBashEPowerShell(matcher) {
  if (typeof matcher !== 'string') return false
  const partes = matcher.split(/[|,]/).map(s => s.trim())
  return partes.includes('Bash') && partes.includes('PowerShell')
}

function listar(dir, base = dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    if (nome === '.git' || nome === 'node_modules') continue
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) listar(caminho, base, acc)
    else acc.push(relative(base, caminho).replace(/\\/g, '/'))
  }
  return acc
}

function ehTexto(rel) {
  return /\.(md|json|txt|mjs|js|cjs|yml|yaml|ps1|py|sh)$/i.test(rel)
}

export function rodarGates(dirKit) {
  const falhas = []
  const arquivos = existsSync(dirKit) ? listar(dirKit) : []
  const set = new Set(arquivos)

  // Gate 1: vazamento de informacao nossa
  for (const rel of arquivos) {
    if (!ehTexto(rel)) continue
    if (ISENTOS_CONTEUDO.includes(rel)) continue
    const txt = readFileSync(join(dirKit, rel), 'utf8')
    let baixo = txt.toLowerCase()
    for (const re of PERMITIDOS) baixo = baixo.replace(re, '')
    for (const termo of PROIBIDOS) {
      if (baixo.includes(termo)) falhas.push({ gate: 1, arquivo: rel, detalhe: `termo proibido: ${termo}` })
    }
    if (RE_MLB.test(txt)) falhas.push({ gate: 1, arquivo: rel, detalhe: 'id de anuncio (MLB)' })
    for (const m of txt.matchAll(RE_SEGREDO)) {
      if (!RE_PLACEHOLDER.test(m[2])) falhas.push({ gate: 1, arquivo: rel, detalhe: `valor de segredo atribuido (${m[1]})` })
    }
  }
  for (const rel of arquivos) {
    // pasta proibida so conta como pasta de PRIMEIRO NIVEL do kit ou do _modelo/
    // (scripts/ dentro de .claude/skills/<nome>/ ou de _ferramentas/ e permitido)
    const topo = rel.split('/')[0]
    const topoModelo = rel.startsWith('_modelo/') ? rel.split('/')[1] : null
    for (const proibida of PASTAS_PROIBIDAS) {
      if (topo === proibida || topoModelo === proibida) {
        falhas.push({ gate: 1, arquivo: rel, detalhe: `pasta proibida: ${proibida}` })
      }
    }
    if (PROIBIDOS_ARQUIVOS.includes(rel.split('/').pop())) falhas.push({ gate: 1, arquivo: rel, detalhe: 'arquivo proibido' })
  }

  // Gate 2: frontmatter das skills (pasta-mae, _modelo e templates do _modelo)
  for (const rel of arquivos) {
    const eSkill = (rel.startsWith('.claude/skills/') || rel.startsWith('_modelo/.claude/skills/')) && rel.endsWith('SKILL.md')
    const eTemplate = rel.startsWith('_modelo/templates/skills/') && rel.endsWith('.md') &&
      !rel.includes('/references/') && rel !== '_modelo/templates/skills/catalogo.md'
    if (!eSkill && !eTemplate) continue
    const txt = readFileSync(join(dirKit, rel), 'utf8')
    const m = txt.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!m) { falhas.push({ gate: 2, arquivo: rel, detalhe: 'sem frontmatter' }); continue }
    if (!/^name:\s*\S/m.test(m[1])) falhas.push({ gate: 2, arquivo: rel, detalhe: 'sem name' })
    if (!/^description:\s*\S/m.test(m[1])) falhas.push({ gate: 2, arquivo: rel, detalhe: 'sem description' })
  }

  // Gate 8: skill de trafego instalada precisa de regua declarada.
  // Mora aqui perto do Gate 2 porque olha skill como ele, e leva numero proprio pra
  // saida do CLI nao misturar com a conferencia de frontmatter.
  // No _modelo/ a skill vai sem regua de proposito (ela nasce na entrevista), entao o
  // referencias/regua-exemplo.md ao lado da skill conta como prova de que o caminho existe.
  for (const rel of arquivos) {
    const m = rel.match(/^(.*?)\.claude\/skills\/trafego\/SKILL\.md$/)
    if (!m) continue
    const base = m[1]
    const temRegua = set.has(`${base}_contexto/trafego.md`) ||
      set.has(`${base}.claude/skills/trafego/referencias/regua-exemplo.md`)
    if (!temRegua) falhas.push({ gate: 8, arquivo: rel, detalhe: 'skill de trafego sem regua declarada' })
  }

  // Gate 3: manifesto de arquivos obrigatorios (pasta-mae e _modelo)
  for (const obrig of OBRIGATORIOS) {
    if (!set.has(obrig)) falhas.push({ gate: 3, arquivo: '-', detalhe: `faltando: ${obrig}` })
  }

  // Gate 3 (padrao AGENTS.md): CLAUDE.md so pode ser o ponteiro @AGENTS.md, nunca conteudo proprio
  for (const rel of ['CLAUDE.md', '_modelo/CLAUDE.md']) {
    if (!set.has(rel)) continue
    const txt = readFileSync(join(dirKit, rel), 'utf8')
    if (!ehSoPonteiroClaude(txt)) {
      falhas.push({ gate: 3, arquivo: rel, detalhe: 'CLAUDE.md deve ser so o ponteiro @AGENTS.md' })
    }
  }

  // Gate 3 (padrao AGENTS.md): .gitignore precisa ignorar a ponte .agents/ (criada em tempo de uso)
  for (const rel of ['.gitignore', '_modelo/.gitignore']) {
    if (!set.has(rel)) continue
    const txt = readFileSync(join(dirKit, rel), 'utf8')
    if (!/^\.agents\/\s*$/m.test(txt)) {
      falhas.push({ gate: 3, arquivo: rel, detalhe: '.gitignore precisa da linha .agents/' })
    }
  }

  // Gate 4: links internos resolvem
  for (const rel of arquivos) {
    if (!rel.endsWith('.md')) continue
    const txt = readFileSync(join(dirKit, rel), 'utf8')
    for (const m of txt.matchAll(RE_LINK)) {
      const alvo = m[1].trim()
      if (/^(https?:|mailto:|#)/.test(alvo)) continue
      const limpo = alvo.split('#')[0]
      if (!limpo) continue
      const abs = resolve(dirKit, dirname(rel), limpo)
      if (!existsSync(abs)) falhas.push({ gate: 4, arquivo: rel, detalhe: `link quebrado: ${alvo}` })
    }
  }

  // Gate 5: hook de auto-sync com guarda de repo/remote (pasta-mae e _modelo)
  for (const rel of ['.claude/settings.json', '_modelo/.claude/settings.json']) {
    const settings = join(dirKit, rel)
    if (!existsSync(settings)) continue
    const txt = readFileSync(settings, 'utf8')
    if (/git/.test(txt) && !/git rev-parse --git-dir/.test(txt)) {
      falhas.push({ gate: 5, arquivo: rel, detalhe: 'hook de git sem guarda de repo/remote' })
    }
  }

  // Gate 6: portabilidade Windows/Mac (todo arquivo texto dentro de _modelo/ e do .claude/ da pasta-mae)
  const RE_WIN = /(?:\b[A-Z]:[\\/]{1,2}[\w\\/]|schtasks|\.bat\b|\\\\Users\\\\)/i
  const RE_ENSINA = /windows.*mac|mac.*windows/i
  for (const rel of arquivos) {
    if (!ehTexto(rel)) continue
    if (!(rel.startsWith('_modelo/') || rel.startsWith('.claude/'))) continue
    // a skill otimizar-pc se declara Windows-only no proprio frontmatter (Mac recebe orientacao
    // manual em vez de automacao), entao dependencia de Windows chumbada ali nao e vazamento
    if (rel.includes('/otimizar-pc/')) continue
    const linhas = readFileSync(join(dirKit, rel), 'utf8').split('\n')
    linhas.forEach((l, i) => {
      if (RE_WIN.test(l) && !RE_ENSINA.test(l))
        falhas.push({ gate: 6, arquivo: rel, detalhe: `linha ${i + 1}: dependencia de Windows chumbada` })
    })
  }

  // Gate 6 (final de linha): .mjs com shebang terminando em CR nao roda direto no Unix,
  // porque o CR vira parte do nome do interpretador. Roda no kit inteiro, e nao so no
  // escopo do resto do Gate 6, porque as ferramentas da raiz tambem tem shebang.
  for (const rel of arquivos) {
    if (!rel.endsWith('.mjs')) continue
    const primeira = readFileSync(join(dirKit, rel), 'utf8').split('\n')[0]
    if (primeira.startsWith('#!') && primeira.endsWith('\r'))
      falhas.push({ gate: 6, arquivo: rel, detalhe: 'linha 1: shebang terminando em CR (nao executa no Unix)' })
  }

  // Gate 7: empacotamento do zip de distribuicao (so roda se o zip existir ao lado do kit).
  // A spec ZIP (APPNOTE 4.4.17.1) exige "/" como separador; Compress-Archive grava "\\" e o
  // descompactador do macOS vira 90 arquivos soltos sem pasta. Gerar sempre com tar.exe.
  // o zip se chama SabinOS-Sistema-<versao>.zip (a versao vai no nome do zip, nunca no da pasta)
  const pastaPai = join(dirKit, '..')
  // Com mais de um zip na pasta, conferir o primeiro em ordem alfabetica daria verde
  // olhando o zip velho enquanto o novo (o que vai ser distribuido) passa batido.
  // Entao: confere sempre o de maior versao, e acusa a sobra pra ela ser apagada.
  const zips = existsSync(pastaPai)
    ? readdirSync(pastaPai)
        .filter(n => /^SabinOS-Sistema-\d+\.\d+\.zip$/i.test(n))
        .sort((a, b) => {
          const v = (n) => n.match(/(\d+)\.(\d+)/).slice(1, 3).map(Number)
          const [aM, am] = v(a), [bM, bm] = v(b)
          return bM - aM || bm - am
        })
    : []
  const nomeZip = zips[0]
  if (zips.length > 1)
    falhas.push({ gate: 7, arquivo: nomeZip, detalhe: `${zips.length} zips na pasta (${zips.join(', ')}); conferindo so o mais novo. Apagar os antigos pra nao distribuir o errado` })
  const zipDist = nomeZip ? join(pastaPai, nomeZip) : null
  if (zipDist && existsSync(zipDist)) {
    const buf = readFileSync(zipDist)
    const ASSINATURA_CD = Buffer.from([0x50, 0x4b, 0x01, 0x02])
    let i = buf.indexOf(ASSINATURA_CD)
    let entradas = 0
    let comBarra = 0
    while (i !== -1) {
      const tamNome = buf.readUInt16LE(i + 28)
      const nome = buf.slice(i + 46, i + 46 + tamNome).toString('utf8')
      entradas++
      if (nome.includes('\\')) comBarra++
      i = buf.indexOf(ASSINATURA_CD, i + 46 + tamNome)
    }
    if (entradas === 0)
      falhas.push({ gate: 7, arquivo: nomeZip, detalhe: 'zip sem central directory legivel' })
    else if (comBarra > 0)
      falhas.push({ gate: 7, arquivo: nomeZip, detalhe: `${comBarra} de ${entradas} entradas com "\\" no caminho (quebra a extracao no macOS; gerar com tar.exe, nunca Compress-Archive)` })
  }

  // Gate 9: travas de seguranca do settings.json.
  // Protegem o aluno na origem, em vez de so avisar depois que o estrago aconteceu.
  // Sintaxe conferida na doc oficial (code.claude.com/docs/en/permissions, 2026-09-21):
  // a leitura do .env fica em "ask" (pergunta antes de ler, e a doc confirma que uma
  // regra de Read tambem e a que se consulta pra Edit/Write no mesmo caminho), nunca em
  // "deny", porque "deny" bloquearia de vez a escrita da chave pelo /conectar. Read(./secrets/**)
  // continua em "deny" porque o kit nunca escreve nessa pasta.
  const ASK_OBRIGATORIO = ['Read(./.env)', 'Read(./.env.*)']
  const DENY_OBRIGATORIO = ['Read(./secrets/**)']
  for (const rel of ['.claude/settings.json', '_modelo/.claude/settings.json']) {
    const settings = join(dirKit, rel)
    if (!existsSync(settings)) continue
    let cfg
    try {
      cfg = JSON.parse(readFileSync(settings, 'utf8'))
    } catch {
      falhas.push({ gate: 9, arquivo: rel, detalhe: 'settings.json nao e JSON valido' })
      continue
    }
    const ask = (cfg.permissions && cfg.permissions.ask) || []
    const deny = (cfg.permissions && cfg.permissions.deny) || []
    // tipo errado (numero, string) nao pode estourar nem ser comparado por
    // Array.prototype.includes: string tem includes tambem, mas ai vira "e substring de"
    // em vez de "e um item da lista", e da falha pela metade sem dizer o problema real.
    let tipoOk = true
    if (!Array.isArray(ask)) {
      falhas.push({ gate: 9, arquivo: rel, detalhe: 'permissions.ask existe mas nao e uma lista' })
      tipoOk = false
    }
    if (!Array.isArray(deny)) {
      falhas.push({ gate: 9, arquivo: rel, detalhe: 'permissions.deny existe mas nao e uma lista' })
      tipoOk = false
    }
    if (!tipoOk) continue
    for (const regra of ASK_OBRIGATORIO) {
      if (!ask.includes(regra))
        falhas.push({ gate: 9, arquivo: rel, detalhe: `permissions.ask sem a regra ${regra}` })
    }
    for (const regra of DENY_OBRIGATORIO) {
      if (!deny.includes(regra))
        falhas.push({ gate: 9, arquivo: rel, detalhe: `permissions.deny sem a regra ${regra}` })
    }
    // o hook de comando destrutivo nasce so no _modelo (a pasta que vira projeto do aluno);
    // a pasta-mae faz setup e atualizacao, e nesta rodada leva so a trava de leitura
    if (rel.startsWith('_modelo/')) {
      const pre = (cfg.hooks && cfg.hooks.PreToolUse) || []
      const entradaComBarreira = pre.find(entrada =>
        (entrada.hooks || []).some(h => typeof h.command === 'string' && h.command.includes('barrar-perigoso')))
      if (!entradaComBarreira) {
        falhas.push({ gate: 9, arquivo: rel, detalhe: 'hooks.PreToolUse sem o barrar-perigoso' })
      } else if (!matcherCobreBashEPowerShell(entradaComBarreira.matcher)) {
        // menor 2 (revisao pos-revisao): so conferir que ALGUM PreToolUse cita o hook nao
        // prova que ele roda pras duas ferramentas. Se o matcher voltar a ser so "Bash",
        // a trava do PowerShell morre em silencio e a suite/gates continuavam verdes.
        falhas.push({ gate: 9, arquivo: rel, detalhe: 'hooks.PreToolUse: matcher do barrar-perigoso nao cobre Bash e PowerShell juntos' })
      }
    }
  }

  // Gate 10: atualizador. So roda quando o kit declara componentes (o kit de verdade
  // declara, e o Gate 3 cobra os arquivos). Tabela velha e o erro mais caro daqui: um
  // arquivo do kit novo sem impressao vira "mexido pela pessoa" em todo projeto que
  // atualizar, e o aluno passa a ser perguntado sobre arquivo que nunca tocou.
  const arqComp = join(dirKit, '_ferramentas/componentes.json')
  if (existsSync(arqComp)) {
    const falha10 = (arquivo, detalhe) => falhas.push({ gate: 10, arquivo, detalhe })
    const lerJsonGate = rel => {
      try { return JSON.parse(readFileSync(join(dirKit, rel), 'utf8')) } catch { falha10(rel, 'ausente ou nao e JSON valido'); return null }
    }
    const regras = lerJsonGate('_ferramentas/componentes.json')
    const imp = lerJsonGate('_ferramentas/impressoes.json')
    const versao = set.has('VERSAO') ? readFileSync(join(dirKit, 'VERSAO'), 'utf8').trim() : null
    const topoReadme = set.has('README.md') ? readFileSync(join(dirKit, 'README.md'), 'utf8').split('\n').slice(0, 5).join('\n') : ''
    const mv = topoReadme.match(/Vers.o (\d+\.\d+)/)
    if (!versao) falha10('VERSAO', 'arquivo de versao ausente')
    else if (!mv || mv[1] !== versao) falha10('VERSAO', `VERSAO diz ${versao}, README diz ${mv ? mv[1] : 'nada'}`)
    if (regras && imp) {
      // a bancada so existe na _kits; na pasta-mae do aluno a mensagem precisa dizer o que significa la
      const BANCADA = 'rodar bancada/gerar-impressoes.mjs (bancada de desenvolvimento; na pasta-mae do aluno, significa que um arquivo do _modelo foi mexido depois da versao publicada)'
      if (imp.versao !== versao) falha10('_ferramentas/impressoes.json', `gerada pra ${imp.versao}, kit na ${versao}: ${BANCADA}`)
      for (const rel of arquivos) {
        if (!rel.startsWith('_modelo/')) continue
        const r = rel.slice('_modelo/'.length)
        if (ignorado(r, regras)) continue
        if (!imp.arquivos?.[r]?.[hashArquivo(readFileSync(join(dirKit, rel)))])
          falha10(rel, `impressao digital ausente: ${BANCADA}`)
        if (r.startsWith('.claude/') && !regras.mistos.includes(r) && !componenteDe(r, regras))
          falha10(rel, 'arquivo de .claude/ sem componente: o atualizador nunca o levaria')
      }
      for (const [nome, c] of Object.entries(regras.componentes)) {
        for (const dep of c.depende) if (!regras.componentes[dep]) falha10('_ferramentas/componentes.json', `${nome} depende de ${dep}, que nao existe`)
      }
    }
    if (set.has('_ferramentas/mudancas.md')) {
      // entrada = titulo "## id-em-kebab"; titulo de secao comum ("## Como usar ...") fica fora
      const blocos = readFileSync(join(dirKit, '_ferramentas/mudancas.md'), 'utf8').split(/\r?\n## /).slice(1)
        .filter(b => /^[a-z0-9-]+\s*$/.test(b.split(/\r?\n/)[0]))
      if (!blocos.length) falha10('_ferramentas/mudancas.md', 'nenhuma entrada')
      for (const b of blocos) {
        const id = b.split(/\r?\n/)[0].trim()
        for (const campo of CAMPOS_MUDANCA) if (!b.includes(`**${campo}:**`)) falha10('_ferramentas/mudancas.md', `${id} sem o campo "${campo}"`)
      }
    }
  }

  return { falhas, total: arquivos.length }
}

const NOMES = {
  1: 'Vazamento de informacao', 2: 'Frontmatter das skills',
  3: 'Manifesto de arquivos', 4: 'Links internos', 5: 'Hook de auto-sync',
  6: 'Portabilidade Windows/Mac', 7: 'Empacotamento do zip',
  8: 'Regua do /trafego', 9: 'Travas de seguranca', 10: 'Atualizador',
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const { falhas, total } = rodarGates(dir)
  console.log(`Kit: ${dir} (${total} arquivos)\n`)
  for (const g of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const desse = falhas.filter(f => f.gate === g)
    console.log(`${desse.length ? 'FALHOU' : 'ok    '}  Gate ${g}: ${NOMES[g]}${desse.length ? ` (${desse.length})` : ''}`)
    for (const f of desse.slice(0, 15)) console.log(`        ${f.arquivo}: ${f.detalhe}`)
    if (desse.length > 15) console.log(`        ... e mais ${desse.length - 15}`)
  }
  process.exit(falhas.length ? 1 : 0)
}
