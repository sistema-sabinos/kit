#!/usr/bin/env node
/*
 * ver-video.mjs: motor da skill /assistir-video
 *
 * Manda o Gemini ASSISTIR um vídeo, processando ÁUDIO E IMAGEM (~1fps). Diferente
 * de uma transcrição, ele enxerga o que aparece na TELA (painéis, sites, prints,
 * demonstrações).
 *
 * Aceita:
 *   - YouTube        -> vai direto pelo link (o Gemini busca sozinho, não baixa nada aqui)
 *   - Instagram/TikTok/Kwai/Facebook/X/Vimeo/etc -> baixa o arquivo e sobe pela Files API
 *   - arquivo local  -> sobe pela Files API
 *
 * Uso:
 *   node ver-video.mjs "<url ou arquivo>" [--pergunta "..."] [--lowres] [--barato]
 *                                         [--model gemini-3.1-pro-preview] [--baixar] [--manter]
 *
 * Modelo: por padrão o script PERGUNTA pra API quais modelos existem e escolhe o
 * melhor na hora (pro mais novo). Modelo em preview some sem aviso, então não
 * chumbar nome de modelo aqui.
 *
 * Chave: procura GEMINI_API_KEY nesta ordem ->
 *   1) variável de ambiente
 *   2) .env subindo a partir do cwd
 *   3) ~/.claude/.env
 * Se não achar, avisa como criar (ver /conectar) e sai.
 *
 * Saída: o texto da análise no stdout; modelo, rota e uso de tokens no stderr.
 *
 * Gasto (5.52, chat 3): chamado direto, passa pela trava do gasto do kit antes de subir o vídeo, com
 * --usd <estimativa> e, com o sim da pessoa, --autorizado (sem ele, só a permissão de gasto do
 * _contexto/autonomia.md libera). Parou: sai 3, com o motivo no stderr.
 * Conserto da interna (5.52, chat 3): nenhuma opção pula a trava sem prova. --reserva <id> é de script que já passou
 * pela trava e anota o custo ele mesmo (o gemini-cru e o fiscal do /editar-video): o ver-video confere, sob a trava
 * do orçamento, que a reserva existe em dados/orcamento-reservas.json, é do processo que o chamou e ainda não foi
 * usada; aí não confere o saldo de novo (senão a mesma chamada reservaria duas vezes) e não anota o custo.
 * --sem-registro só tira a linha de custo (quem chamou anota): a trava roda inteira, e com orçamento do mês ele
 * para e pede a --reserva. --raiz <pasta> (a raiz de quem chamou) só vale junto de uma das duas.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import { baixarVideo, ehYoutube } from './baixar-video.mjs';
import { linhaDeCusto, registrarCusto, tokensDaResposta, dataLocal, RAIZ } from './custo.mjs';
import { liberarGasto, fecharReserva, avisoDaPermissao, comTrava } from '../conectar/scripts/lib/orcamento.mjs';

// ---------------- chave ----------------
function readKeyFrom(file) {
  try {
    const m = fs.readFileSync(file, 'utf8').match(/^GEMINI_API_KEY=(.+)$/m);
    return m ? m[1].trim() : null;
  } catch { return null; }
}
function loadApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const k = readKeyFrom(path.join(dir, '.env'));
    if (k) return k;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  const globalEnv = readKeyFrom(path.join(os.homedir(), '.claude', '.env'));
  if (globalEnv) return globalEnv;
  console.error(
    'GEMINI_API_KEY não encontrada.\n' +
    'Essa skill usa a API do Gemini (paga, pré-paga). Pra ligar:\n' +
    '  1. Crie uma chave em https://aistudio.google.com\n' +
    '  2. Compre o crédito inicial (o mínimo aparece na tela de compra)\n' +
    '  3. Salve no arquivo .env da raiz do projeto: GEMINI_API_KEY=<sua chave aqui>\n' +
    'O comando /conectar te guia nisso passo a passo.'
  );
  process.exit(2);
}

// ---------------- argumentos ----------------
const argv = process.argv.slice(2);
const alvo = argv.find((a) => !a.startsWith('--'));
const flag = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes('--' + n);
if (!alvo) {
  console.error('uso: node ver-video.mjs "<url ou arquivo>" [--pergunta "..."] [--lowres] [--barato] [--model m] [--baixar] [--manter]');
  process.exit(2);
}

const pergunta = flag('pergunta', null);
const promptPadrao = `Você assistiu este vídeo (áudio E imagem). Análise COMPLETA em português brasileiro, separando:
1. RESUMO: do que é, canal/autor, proposta.
2. O QUE FOI DITO: ideias e passos principais da narração, com nomes de ferramentas, preços e promessas ditos.
3. O QUE APARECEU NA TELA: ferramentas, sites, painéis, prints, demonstrações (descreva o que dava pra ver, não só o que foi falado).
4. PASSO A PASSO: se for tutorial, o workflow exato demonstrado.
5. AFIRMAÇÕES VERIFICÁVEIS: bullets com toda alegação factual feita (ferramenta, preço, capacidade, resultado prometido).
Use timestamps [m:ss] quando relevante.`;
const prompt = pergunta
  ? `Assista o vídeo (áudio e imagem) e responda em português brasileiro, citando o que aparece na tela e timestamps quando útil:\n${pergunta}`
  : promptPadrao;

// --so-baixar nunca chama o Gemini: roda sem chave, e a rota gratis de quem usa esta skill depende disso
const key = has('so-baixar') ? null : loadApiKey();
const API ='https://generativelanguage.googleapis.com/v1beta';

// ---------------- trava do gasto (chamado direto) ----------------
const RESERVA_DE_QUEM_CHAMOU = has('reserva') ? String(flag('reserva', '')) : null;
if (has('raiz') && RESERVA_DE_QUEM_CHAMOU === null && !has('sem-registro')) {
  console.error('parou: o --raiz é só de script que já passou pela trava (com --reserva <id> ou --sem-registro). Chamado direto, vale a raiz do projeto.');
  process.exit(2);
}
const RAIZ_GASTO = flag('raiz', RAIZ);
let reservaDoGasto = null;
// a estimativa que a trava liberou (--usd): vale como custo quando o preco do modelo nao esta na tabela
let estimativaDoGasto = null;
// sem registro: quem chamou anota o custo (com a reserva dele, ou no teto por lote sem reserva)
let semRegistro = false;
const numeroDe = (v) => Number(String(v).replace(',', '.'));
// A reserva que o chamador passou tem de existir, ser dele (o pai deste processo) e nao ter linha de custo ainda
function conferirReserva(id) {
  if (!id || id.startsWith('--')) return 'faltou o id depois do --reserva';
  try {
    return comTrava(RAIZ_GASTO, () => {
      const arq = path.join(RAIZ_GASTO, 'dados', 'orcamento-reservas.json');
      const texto = fs.existsSync(arq) ? fs.readFileSync(arq, 'utf8') : '';
      const lista = texto.trim() ? JSON.parse(texto) : [];
      const r = Array.isArray(lista) ? lista.find((x) => x && x.id === id) : null;
      if (!r) return `a reserva ${id} não existe em dados/orcamento-reservas.json`;
      if (r.pid !== process.ppid) return `a reserva ${id} não é do processo que chamou o ver-video`;
      const custos = path.join(RAIZ_GASTO, 'dados', 'custos.jsonl');
      const usada = fs.existsSync(custos) && fs.readFileSync(custos, 'utf8').split(/\r?\n/).some((l) => { try { return JSON.parse(l).reserva === id; } catch { return false; } });
      if (usada) return `a reserva ${id} já tem linha de custo: foi usada por outra chamada`;
      // Codex comum (5.52, chat 3): a primeira conferencia marca a reserva como usada, sob a mesma trava, e a
      // segunda chamada com o mesmo id para antes da rede (antes, dois filhos passavam antes do pai anotar o custo)
      if (r.usada_por !== undefined) return `a reserva ${id} já foi usada por outra chamada`;
      r.usada_por = process.pid;
      fs.writeFileSync(arq, JSON.stringify(lista, null, 2) + '\n');
      return null;
    });
  } catch (e) { return `não consegui conferir a reserva (${e.message})`; }
}
function passarPelaTrava() {
  if (RESERVA_DE_QUEM_CHAMOU !== null) {
    const motivo = conferirReserva(RESERVA_DE_QUEM_CHAMOU);
    if (motivo) {
      console.error(`parou: ${motivo}. Sem reserva conferida, o ver-video passa pela trava: rode com --usd <estimativa> e, com o sim, --autorizado.`);
      process.exitCode = 3;
      return false;
    }
    semRegistro = true;
    return true;
  }
  const usd = numeroDe(flag('usd', ''));
  if (!has('usd') || !Number.isFinite(usd) || usd <= 0) {
    console.error('parou: assistir com o Gemini é pago. Estime o custo (segundos do vídeo x 91 tokens x preço de entrada do dia, na página oficial), mostre à pessoa e rode de novo com --usd <estimativa> e, com o sim, --autorizado (com a permissão de gasto do _contexto/autonomia.md, sem o --autorizado).');
    process.exitCode = 3;
    return false;
  }
  const acima = flag('acima-do-teto', undefined);
  const lib = liberarGasto({ estimativaUsd: usd, autorizado: has('autorizado'), acimaDoTetoUsd: acima === undefined ? undefined : numeroDe(acima) },
    { raiz: RAIZ_GASTO, contexto: `assistir-video ${alvo}` });
  if (lib.aviso) console.error(`[aviso] ${lib.aviso}`);
  if (lib.codigo !== 0) {
    console.error(`parou: ${lib.parou}${lib.fora_da_permissao ? ` (fora da permissão: ${lib.fora_da_permissao})` : ''}`);
    process.exitCode = 3;
    return false;
  }
  if (has('sem-registro')) {
    // com orcamento do mes, sem linha de custo a reserva ficaria aberta sem dono: quem chama passa a reserva dele
    if (lib.reserva) {
      try { fecharReserva(lib.reserva, { raiz: RAIZ_GASTO, devolver: true }); } catch {}
      console.error('parou: com o orçamento do mês, o --sem-registro não vale; o script que chama passa pela trava e manda a reserva dele (--reserva <id>).');
      process.exitCode = 3;
      return false;
    }
    semRegistro = true;
  }
  const permissao = avisoDaPermissao(lib);
  if (permissao) console.error(permissao);
  reservaDoGasto = lib.reserva || null;
  estimativaDoGasto = usd;
  return true;
}
// devolve ao saldo o que a reserva não gastou; chamada que caiu no meio deixa a reserva aberta (pode ter cobrado).
// Daqui so se chega antes da analise sair pra rede ou com a linha de custo gravada: a liberacao pela permissao que nao
// cobrou devolve o teto. Codex final (5.52, chat 3): depois que a analise saiu, nada devolve (cobranca incerta)
function fecharGasto() {
  if (!reservaDoGasto) return;
  const id = reservaDoGasto;
  reservaDoGasto = null;
  try { fecharReserva(id, { raiz: RAIZ_GASTO, devolver: true }); } catch (e) { console.error(`[orcamento] não consegui fechar a reserva ${id} (${e.message}); feche pelo --saldo do /configurar-video`); }
}
const reservaAberta = () => reservaDoGasto ? ` A reserva ${reservaDoGasto} do orçamento do mês ficou aberta: anote em dados/custos.jsonl o que foi cobrado e feche pelo --saldo do /configurar-video.` : '';

// ---------------- escolha do modelo (viva, não chumbada) ----------------
const LIXO = /image|tts|lite|robotics|embedding|computer-use|customtools|deep-research|antigravity|omni|thinking/i;

function pontuar(id) {
  const m = id.match(/^gemini-(\d+(?:\.\d+)?)-(pro|flash)/);
  if (m) return { versao: parseFloat(m[1]), tier: m[2] === 'pro' ? 1 : 0, preview: /preview/.test(id) ? 1 : 0 };
  if (id === 'gemini-pro-latest') return { versao: 0.5, tier: 1, preview: 0 };
  if (id === 'gemini-flash-latest') return { versao: 0.5, tier: 0, preview: 0 };
  return null;
}

async function escolherModelo() {
  const pedido = flag('model', null);
  if (pedido) return pedido;
  try {
    const r = await fetch(`${API}/models?key=${key}&pageSize=300`, { signal: AbortSignal.timeout(PRAZO_CURTO_MS) });
    const j = await r.json();
    const ids = (j.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''))
      .filter((id) => id.startsWith('gemini-') && !LIXO.test(id));
    const preferirFlash = has('barato');
    const ranked = ids
      .map((id) => ({ id, ...(pontuar(id) || {}) }))
      .filter((x) => x.versao !== undefined)
      .sort((a, b) => {
        const tierA = preferirFlash ? 1 - a.tier : a.tier;
        const tierB = preferirFlash ? 1 - b.tier : b.tier;
        if (tierA !== tierB) return tierB - tierA;
        if (a.versao !== b.versao) return b.versao - a.versao;
        return a.preview - b.preview;
      });
    if (ranked.length) return ranked[0].id;
    console.error('[modelo] a API não listou nenhum gemini utilizável, usando o alias estável');
  } catch (e) {
    console.error(`[modelo] não consegui listar modelos (${e.message}), usando o alias estável`);
  }
  return has('barato') ? 'gemini-flash-latest' : 'gemini-pro-latest';
}

// Prazos do fetch: o do Node so desiste aos 5 minutos, e uma conexao presa deixava a tela
// parada. Curto pra listar, perguntar se ficou pronto e apagar; longo pro envio do video,
// que pode ser grande. A analise em si vai pelo postarJson, com teto proprio de 30 minutos.
const PRAZO_CURTO_MS = 30_000;
const PRAZO_ENVIO_MS = 30 * 60 * 1000;

// ---------------- upload de arquivo local (Files API) ----------------
const MIMES = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.mpeg': 'video/mpeg', '.m4v': 'video/mp4' };

async function subirArquivo(arquivo) {
  const bytes = fs.statSync(arquivo).size;
  const mime = MIMES[path.extname(arquivo).toLowerCase()] || 'video/mp4';
  const start = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${key}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes),
      'X-Goog-Upload-Header-Content-Type': mime,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: path.basename(arquivo) } }),
    signal: AbortSignal.timeout(PRAZO_CURTO_MS),
  });
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error(`falha ao iniciar upload: HTTP ${start.status} ${(await start.text()).slice(0, 200)}`);

  const up = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Length': String(bytes), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
    body: fs.readFileSync(arquivo),
    signal: AbortSignal.timeout(PRAZO_ENVIO_MS),
  });
  const info = await up.json();
  if (!info.file) throw new Error(`falha no upload: ${JSON.stringify(info).slice(0, 300)}`);
  nomeRemoto = info.file.name; // daqui em diante a copia existe no Gemini: a faxina apaga mesmo se o processamento cair

  // o vídeo precisa ficar ACTIVE antes de dar pra analisar
  for (let i = 0; i < 90; i++) {
    const r = await fetch(`${API}/${info.file.name}?key=${key}`, { signal: AbortSignal.timeout(PRAZO_CURTO_MS) });
    const j = await r.json();
    if (j.state === 'ACTIVE') return { uri: j.uri, mime: j.mimeType || mime, name: j.name };
    if (j.state === 'FAILED') throw new Error('o Gemini não conseguiu processar o vídeo');
    await new Promise((s) => setTimeout(s, 2000));
  }
  throw new Error('o vídeo não ficou pronto a tempo (timeout no processamento)');
}

// ---------------- roteiro principal ----------------
const ehArquivoLocal = fs.existsSync(alvo);
const usarLinkDireto = !ehArquivoLocal && ehYoutube(alvo) && !has('baixar') && !has('so-baixar');

let filePart;
let temporario = null;
let nomeRemoto = null;

// faxina: arquivo temporário local e cópia no servidor do Gemini. Roda também quando
// algo cai no meio (upload, processamento, chamada), porque o return pula o resto.
async function faxina() {
  if (temporario) { try { fs.unlinkSync(temporario); } catch {} temporario = null; }
  if (nomeRemoto) { const n = nomeRemoto; nomeRemoto = null; await fetch(`${API}/${n}?key=${key}`, { method: 'DELETE', signal: AbortSignal.timeout(PRAZO_CURTO_MS) }).catch(() => {}); }
}

async function main() {
  if (usarLinkDireto) {
    console.error('[rota] link direto do YouTube (o Gemini busca sozinho)');
    if (!passarPelaTrava()) return;
    filePart = { file_data: { file_uri: alvo } };
  } else {
    let arquivo = alvo;
    if (!ehArquivoLocal) {
      console.error('[rota] baixando o vídeo (URL que o Gemini não busca sozinho)');
      const base = path.join(os.tmpdir(), `assistir-video-${Date.now()}`);
      arquivo = await baixarVideo(alvo, base);
      if (!has('manter')) temporario = arquivo;
    } else {
      console.error('[rota] arquivo local');
    }
    if (has('so-baixar')) { console.log(arquivo); return; }
    if (!passarPelaTrava()) { await faxina(); return; }
    let subido;
    // o envio do arquivo nao cobra: falhou antes da analise, a reserva volta pro saldo
    try { subido = await subirArquivo(arquivo); } catch (e) { await faxina(); fecharGasto(); throw e; }
    nomeRemoto = subido.name;
    filePart = { file_data: { file_uri: subido.uri, mime_type: subido.mime } };
  }

  // resolução de mídia é config da REQUISIÇÃO (já foi campo do file_data e mudou de lugar)
  const corpo = { contents: [{ parts: [{ text: prompt }, filePart] }] };
  if (has('lowres')) corpo.generationConfig = { mediaResolution: 'MEDIA_RESOLUTION_LOW' };

  // Aula longa (20 min ou mais) faz o Gemini pensar mais de 5 minutos antes de responder, e o fetch
  // do Node desiste nos 5 minutos (HeadersTimeoutError). Aqui vai https puro, com teto de 30 minutos.
  function postarJson(url, dados, tetoMs = 30 * 60 * 1000) {
    return new Promise((ok, falha) => {
      const corpoTxt = JSON.stringify(dados);
      const req = https.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(corpoTxt) } }, (r) => {
        let txt = '';
        r.setEncoding('utf8');
        r.on('data', (c) => { txt += c; });
        r.on('end', () => { try { ok({ status: r.statusCode, json: JSON.parse(txt) }); } catch { ok({ status: r.statusCode, json: { error: { message: txt.slice(0, 300) } } }); } });
        // a conexao que cai no meio do corpo vira erro da chamada (cobranca incerta), nunca um corpo pela metade
        r.on('error', falha);
      });
      req.setTimeout(tetoMs, () => req.destroy(new Error(`o Gemini passou de ${tetoMs / 60000} minutos sem responder`)));
      req.on('error', falha);
      req.end(corpoTxt);
    });
  }

  const modelo = await escolherModelo();
  let status, j;
  try {
    ({ status, json: j } = await postarJson(`${API}/models/${modelo}:generateContent?key=${key}`, corpo));
  } catch (e) {
    console.error(`ERRO: [${modelo}] a chamada caiu antes da resposta (${e.message}). Pode ter sido cobrada: confira o uso em aistudio.google.com antes de tentar de novo. Vídeo muito longo: tente com --pergunta focada num trecho.${reservaAberta()}`);
    await faxina(); // a chamada caiu
    process.exitCode = 1;
    return;
  }

  // a cobranca ja aconteceu quando vem uso de tokens: anota antes de olhar se a resposta presta
  // com a reserva conferida (ou o --sem-registro no teto por lote), quem chamou anota o custo, pra nao contar em dobro
  let custo = null;
  if (j.usageMetadata) {
    custo = linhaDeCusto({ modelo, uso: j.usageMetadata, contexto: `assistir-video ${alvo}`, hoje: dataLocal(), agora: new Date().toISOString() });
    // Codex comum (5.52, chat 3): preco fora da tabela (usd null) saia da soma do mes com a cobranca feita; conta a
    // estimativa liberada, marcada com usd_estimado, e nunca solta a reserva de graca
    if (custo.usd == null && estimativaDoGasto !== null) { custo.usd = estimativaDoGasto; custo.usd_estimado = true; }
    if (reservaDoGasto) custo.reserva = reservaDoGasto;
    if (!semRegistro) try { registrarCusto(custo, RAIZ_GASTO); fecharGasto(); } catch (e) { console.error(`[custo] chamada cobrada mas nao anotada em dados/custos.jsonl (${e.message}); anote a mao: ${JSON.stringify(custo)}.${reservaAberta()}`); }
  } else {
    // Codex final (5.52, chat 3): a analise ja saiu; resposta sem uso de tokens (erro HTTP, corpo cortado, JSON
    // invalido) pode ter sido cobrada, entao a reserva fica aberta e o teto da permissao nao volta
    console.error(`[custo] a resposta do Gemini veio sem o uso de tokens. Pode ter sido cobrada: confira o uso em aistudio.google.com antes de tentar de novo.${reservaAberta()}`);
  }

  await faxina();

  if (status !== 200) {
    console.error(`ERRO: [${modelo}] HTTP ${status}: ${(j.error && j.error.message) || JSON.stringify(j).slice(0, 300)}`);
    process.exitCode = 1; return;
  }
  const txt = j.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n');
  if (!txt) {
    console.error(`ERRO: [${modelo}] resposta vazia: ${JSON.stringify(j).slice(0, 400)}`);
    process.exitCode = 1; return;
  }
  const t = tokensDaResposta(j.usageMetadata);
  console.error(`(modelo: ${modelo} | tokens entrada: ${t.entrada} | saída com raciocínio: ${t.saida} | custo: ${custo?.usd == null ? 'preço fora da tabela, conferir' : custo.usd_estimado ? `preço fora da tabela, contado pela estimativa de US$ ${custo.usd}` : `US$ ${custo.usd}`})`);
  console.log(txt);
}

await main();
