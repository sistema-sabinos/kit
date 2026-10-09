const fs = require("fs");
const path = require("path");

function parseArgs(args = process.argv.slice(2)) {
  const opts = { images: [], caption: "", dryRun: false, configurar: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--images") opts.images = args[++i].split(",").map(s => s.trim());
    else if (args[i] === "--caption") opts.caption = args[++i];
    else if (args[i] === "--dry-run") opts.dryRun = true;
    else if (args[i] === "--configurar") opts.configurar = true;
  }
  return opts;
}

// conferido em 2026-10-08 no changelog da Meta; v25.0 vale ate 29/07/2028.
// Versao nova: META_GRAPH_VERSAO=v26.0 no .env, sem mexer aqui.
function graph(env = process.env) {
  return `https://graph.facebook.com/${env.META_GRAPH_VERSAO || "v25.0"}`;
}

const TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const USER_ID = process.env.INSTAGRAM_USER_ID;
const IMGBB_KEY = process.env.IMGBB_API_KEY;
const GRAPH = graph();

// Troca as linhas NOME=valor do .env, mantendo o resto e o final de linha do arquivo.
function gravarEnv(arquivo, trocar, apagar = []) {
  const texto = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, "utf8") : "";
  const quebra = texto.includes("\r\n") ? "\r\n" : "\n";
  const nomes = new Set([...Object.keys(trocar), ...apagar]);
  const linhas = texto.split(/\r?\n/).filter(l => l !== "" && !nomes.has(l.split("=")[0].trim()));
  for (const [nome, valor] of Object.entries(trocar)) linhas.push(`${nome}=${valor}`);
  fs.writeFileSync(arquivo, linhas.join(quebra) + quebra);
}

// Token curto, App ID e App Secret vem do .env (a pessoa grava la, nunca no chat). Troca pelo token
// longo, acha a conta do Instagram ligada a Pagina e grava no .env. Nenhum segredo vai pra tela.
async function configurar({ env = process.env, fetchFn = fetch, envPath = path.join(process.cwd(), ".env"), log = console.log } = {}) {
  const faltam = ["META_APP_ID", "META_APP_SECRET", "INSTAGRAM_TOKEN_CURTO"].filter(n => !env[n]);
  if (faltam.length) throw new Error(`faltam no .env: ${faltam.join(", ")}`);
  const g = graph(env);
  const pedir = async (url, oQue) => {
    const json = await (await fetchFn(url)).json();
    if (json.error) throw new Error(`a Meta recusou ${oQue}: ${json.error.message}`);
    return json;
  };
  const troca = new URLSearchParams({ grant_type: "fb_exchange_token", client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, fb_exchange_token: env.INSTAGRAM_TOKEN_CURTO });
  const longo = (await pedir(`${g}/oauth/access_token?${troca}`, "a troca do token")).access_token;
  if (!longo) throw new Error("a Meta nao devolveu o token longo");
  const comToken = campos => new URLSearchParams({ ...campos, access_token: longo });
  // a lista vem paginada (paging.next): le todas as folhas, com teto pra nao girar sem fim
  const paginas = [];
  let proxima = `${g}/me/accounts?${comToken({})}`;
  for (let folha = 0; proxima && folha < 20; folha++) {
    const j = await pedir(proxima, "a lista de Paginas");
    paginas.push(...(j.data || []));
    proxima = j.paging?.next || null;
  }
  // todas as contas ligadas, nunca a primeira que aparecer: o login pode ter a pessoal e a da loja
  const contas = [];
  for (const p of paginas) {
    const j = await pedir(`${g}/${p.id}?${comToken({ fields: "instagram_business_account" })}`, "a Pagina");
    const id = j.instagram_business_account?.id;
    if (!id || contas.some(c => c.id === id)) continue;
    const c = await pedir(`${g}/${id}?${comToken({ fields: "username" })}`, "a conta do Instagram");
    contas.push({ id, username: c.username || id });
  }
  if (!contas.length) throw new Error("nenhuma Pagina deste login tem conta do Instagram profissional ligada");
  const pedida = (env.INSTAGRAM_CONTA || "").replace(/^@/, "");
  const escolhida = pedida ? contas.find(c => c.username === pedida || c.id === pedida) : contas.length === 1 ? contas[0] : null;
  if (!escolhida) {
    const nomes = contas.map(c => `@${c.username}`).join(", ");
    throw new Error(pedida
      ? `a conta @${pedida} nao esta neste login (achei ${nomes}). Nada gravado`
      : `achei ${contas.length} contas do Instagram neste login: ${nomes}. Escreve no .env a linha INSTAGRAM_CONTA=<a conta que publica> e roda de novo. Nada gravado`);
  }
  gravarEnv(envPath, { INSTAGRAM_ACCESS_TOKEN: longo, INSTAGRAM_USER_ID: escolhida.id }, ["INSTAGRAM_TOKEN_CURTO"]);
  log(`ok, conta @${escolhida.username} ligada`);
  return escolhida.id;
}

async function uploadToImgbb(filePath) {
  const b64 = fs.readFileSync(filePath, "base64");
  const body = new URLSearchParams({ key: IMGBB_KEY, image: b64, name: path.basename(filePath, path.extname(filePath)) });
  const res = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body });
  const json = await res.json();
  if (!json.success) throw new Error(`imgbb: ${JSON.stringify(json)}`);
  return json.data.url;
}

async function createContainer(imageUrl) {
  const params = new URLSearchParams({ image_url: imageUrl, is_carousel_item: "true", access_token: TOKEN });
  const res = await fetch(`${GRAPH}/${USER_ID}/media`, { method: "POST", body: params });
  const json = await res.json();
  if (json.error) throw new Error(`Container: ${json.error.message}`);
  return json.id;
}

async function pollStatus(containerId, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${GRAPH}/${containerId}?fields=status_code&access_token=${TOKEN}`);
    const json = await res.json();
    if (json.status_code === "FINISHED") return;
    if (json.status_code === "ERROR") throw new Error(`Container ${containerId} com erro`);
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error(`Timeout esperando container ${containerId}`);
}

async function createCarousel(containerIds, caption) {
  const params = new URLSearchParams({
    media_type: "CAROUSEL_ALBUM",
    children: containerIds.join(","),
    caption,
    access_token: TOKEN,
  });
  const res = await fetch(`${GRAPH}/${USER_ID}/media`, { method: "POST", body: params });
  const json = await res.json();
  if (json.error) throw new Error(`Carousel: ${json.error.message}`);
  return json.id;
}

async function publish(carouselId) {
  const params = new URLSearchParams({ creation_id: carouselId, access_token: TOKEN });
  const res = await fetch(`${GRAPH}/${USER_ID}/media_publish`, { method: "POST", body: params });
  const json = await res.json();
  if (json.error) throw new Error(`Publish: ${json.error.message}`);
  return json.id;
}

async function getPermalink(mediaId) {
  const res = await fetch(`${GRAPH}/${mediaId}?fields=permalink&access_token=${TOKEN}`);
  const json = await res.json();
  return json.permalink || "";
}

async function main() {
  const opts = parseArgs();
  if (opts.configurar) { await configurar(); return; }
  if (!TOKEN || !USER_ID || !IMGBB_KEY) { console.error("Faltam variaveis no .env (INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_USER_ID, IMGBB_API_KEY)"); process.exitCode = 1; return; }
  if (opts.images.length < 2 || opts.images.length > 10) { console.error("Instagram aceita entre 2 e 10 imagens por carrossel"); process.exitCode = 1; return; }
  if (opts.caption.length > 2200) { console.error("Legenda max 2200 caracteres"); process.exitCode = 1; return; }

  // Upload pro imgbb
  console.log(`Fazendo upload de ${opts.images.length} imagens pro imgbb...`);
  const imageUrls = [];
  for (const img of opts.images) {
    const url = await uploadToImgbb(img);
    console.log(`  OK: ${path.basename(img)}`);
    imageUrls.push(url);
  }

  // Criar containers
  console.log(`\nCriando containers no Instagram...`);
  const containerIds = [];
  for (const url of imageUrls) {
    const id = await createContainer(url);
    await pollStatus(id);
    console.log(`  OK: ${id}`);
    containerIds.push(id);
  }

  // Criar carrossel
  console.log(`\nMontando carrossel...`);
  const carouselId = await createCarousel(containerIds, opts.caption);
  await pollStatus(carouselId);

  if (opts.dryRun) {
    console.log(`\nDRY RUN: carrossel montado mas nao publicado`);
    console.log(`Carousel ID: ${carouselId}`);
    return;
  }

  // Publicar
  console.log(`\nPublicando...`);
  const mediaId = await publish(carouselId);
  const link = await getPermalink(mediaId);
  console.log(`\nPublicado!`);
  if (link) console.log(`Link: ${link}`);
}

module.exports = { parseArgs, graph, gravarEnv, configurar };

if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
