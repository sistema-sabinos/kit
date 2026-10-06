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
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import { baixarVideo, ehYoutube } from './baixar-video.mjs';
import { linhaDeCusto, registrarCusto, tokensDaResposta } from './custo.mjs';

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
    '  2. Compre o crédito inicial (mínimo US$ 10)\n' +
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
    const r = await fetch(`${API}/models?key=${key}&pageSize=300`);
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
  });
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error(`falha ao iniciar upload: HTTP ${start.status} ${(await start.text()).slice(0, 200)}`);

  const up = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Length': String(bytes), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
    body: fs.readFileSync(arquivo),
  });
  const info = await up.json();
  if (!info.file) throw new Error(`falha no upload: ${JSON.stringify(info).slice(0, 300)}`);

  // o vídeo precisa ficar ACTIVE antes de dar pra analisar
  for (let i = 0; i < 90; i++) {
    const r = await fetch(`${API}/${info.file.name}?key=${key}`);
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

if (usarLinkDireto) {
  console.error('[rota] link direto do YouTube (o Gemini busca sozinho)');
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
  if (has('so-baixar')) { console.log(arquivo); process.exit(0); }
  const subido = await subirArquivo(arquivo);
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
  console.error(`ERRO: [${modelo}] a chamada caiu antes da resposta (${e.message}). Pode ter sido cobrada: confira o uso em aistudio.google.com antes de tentar de novo. Vídeo muito longo: tente com --pergunta focada num trecho.`);
  process.exit(1);
}

// a cobranca ja aconteceu quando vem uso de tokens: anota antes de olhar se a resposta presta
// --sem-registro: quem chamou anota o custo ele mesmo (o fiscal do /editar-video), pra nao contar em dobro
let custo = null;
if (j.usageMetadata) {
  custo = linhaDeCusto({ modelo, uso: j.usageMetadata, contexto: `assistir-video ${alvo}`, hoje: new Date().toISOString().slice(0, 10), agora: new Date().toISOString() });
  if (!has('sem-registro')) try { registrarCusto(custo); } catch (e) { console.error(`[custo] chamada cobrada mas nao anotada em dados/custos.jsonl (${e.message}); anote a mao: ${JSON.stringify(custo)}`); }
}

// faxina: arquivo temporário local e cópia no servidor do Gemini
if (temporario) { try { fs.unlinkSync(temporario); } catch {} }
if (nomeRemoto) { fetch(`${API}/${nomeRemoto}?key=${key}`, { method: 'DELETE' }).catch(() => {}); }

if (status !== 200) {
  console.error(`ERRO: [${modelo}] HTTP ${status}: ${(j.error && j.error.message) || JSON.stringify(j).slice(0, 300)}`);
  process.exit(1);
}
const txt = j.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n');
if (!txt) {
  console.error(`ERRO: [${modelo}] resposta vazia: ${JSON.stringify(j).slice(0, 400)}`);
  process.exit(1);
}
const t = tokensDaResposta(j.usageMetadata);
console.error(`(modelo: ${modelo} | tokens entrada: ${t.entrada} | saída com raciocínio: ${t.saida} | custo: ${custo?.usd == null ? 'preço fora da tabela, conferir' : `US$ ${custo.usd}`})`);
console.log(txt);
