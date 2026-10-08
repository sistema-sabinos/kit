// Teste de isolamento entre dois clientes do Playwright. Copiar pra
// app/codigo/e2e/isolamento.spec.ts e adaptar o login e os endereços.
// Usa os dois clientes de mentira do seed da /app-servidor, cada um com a sua ficha:
// o cliente A cria uma ficha e o cliente B, entrando por outro navegador, não pode ver
// essa ficha nem na lista nem abrindo o endereço dela direto.
// O endereço do servidor local vai no baseURL do playwright.config.ts.
import { test, expect, type Page } from '@playwright/test';

// Adaptar: os endereços das telas, como estão no app/mapa.md.
const LOGIN = '/entrar';
const LISTA = '/fichas';
const NOVA = '/fichas/nova';

// Adaptar: a senha que o seed deu aos dois clientes (é de mentira e só vale no servidor
// local) e o nome da ficha que o seed criou pro cliente B.
const SENHA = 'senha-de-teste';
const FICHA_DO_B = 'Ficha do cliente B';

// Adaptar: o título da página que o cliente B vê quando abre a ficha do A (o da página de não
// encontrada, o de sem permissão ou o da tela de login). Serve pra esperar a página terminar
// de carregar. Só o título conta, e sem palavra que aparece em menu ou botão de toda página
// (como "entrar"): um menu "Entrar em contato" liberaria a espera antes da ficha chegar.
const AVISO_DE_FICHA_ALHEIA = /não encontrada|sem permissão|acesse sua conta/i;

// Adaptar: o texto que a lista só mostra quando acabou de carregar, como o contador "3 fichas"
// no topo. Ver a primeira ficha não basta: a lista pode estar no meio do caminho. Se a tela não
// tem nada assim, peça pro app ganhar o contador (ou um atributo data-carregado na lista, e aí
// a espera vira b.locator('[data-carregado]')).
const LISTA_CARREGADA = /^\d+ fichas?$/i;

// Adaptar: os campos e o botão da tela de login do app.
async function entrar(page: Page, email: string) {
  await page.goto(LOGIN);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha').fill(SENHA);
  await page.getByRole('button', { name: /entrar/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith(LOGIN));
}

test('ficha de um cliente fica invisível pro outro', async ({ browser }) => {
  // Cada contexto é um navegador separado, com cookie e login próprios.
  const contextoA = await browser.newContext();
  const contextoB = await browser.newContext();
  try {
    const a = await contextoA.newPage();
    const b = await contextoB.newPage();
    // Marca única, pra uma rodada não achar a ficha que sobrou da rodada anterior.
    const marca = `isolamento-${Date.now()}`;

    // Adaptar: o formulário de ficha nova. Aqui o app abre a ficha depois de salvar; se ele
    // volta pra lista, clicar na ficha nova antes de guardar o endereço.
    await entrar(a, 'cliente-a@exemplo.test');
    await a.goto(NOVA);
    await a.getByLabel('Nome').fill(marca);
    await a.getByRole('button', { name: /salvar/i }).click();
    await expect(a.getByText(marca), 'cliente A não viu a ficha que acabou de criar').toBeVisible();
    const enderecoDaFicha = a.url();

    // Controle: o dono vê. Sem esta parte, um app que esconde tudo de todo mundo passaria.
    await a.goto(LISTA);
    await expect(a.getByText(marca), 'cliente A não viu a própria ficha na lista').toHaveCount(1);
    await a.goto(enderecoDaFicha);
    await expect(a.getByText(marca), 'cliente A não viu a própria ficha pelo endereço').toBeVisible();

    await entrar(b, 'cliente-b@exemplo.test');
    await b.goto(LISTA);
    await expect(b.getByText(FICHA_DO_B), 'cliente B não viu a própria ficha na lista').toBeVisible();
    // Ver a ficha do B não prova que a lista acabou: tela que busca o resto depois de abrir
    // ainda pode acrescentar a ficha do A. Antes de contar zero, espera o sinal de lista pronta.
    // E ainda dá dois segundos a mais: busca disparada por relógio depois que a lista se diz
    // pronta não tem sinal nenhum, e só uma espera fixa pega ela.
    await expect(b.getByText(LISTA_CARREGADA), 'a lista do cliente B não terminou de carregar').toBeVisible();
    await b.waitForTimeout(2000);
    await expect(b.getByText(marca), 'cliente B viu a ficha do cliente A na lista').toHaveCount(0);

    // Abrindo o endereço guardado: 404, 403 ou volta pro login, tanto faz, desde que a ficha
    // do A não apareça. Antes de contar, espera a página mostrar a ficha ou o título do aviso:
    // tela que busca os dados depois de abrir começa vazia, e contar nesse instante daria zero falso.
    await b.goto(enderecoDaFicha);
    await expect(b.getByText(marca).or(b.getByRole('heading', { name: AVISO_DE_FICHA_ALHEIA })).first(),'a página da ficha do A não terminou de carregar pro cliente B').toBeVisible();
    await expect(b.getByText(marca), 'cliente B abriu a ficha do cliente A pelo endereço').toHaveCount(0);
  } finally {
    await contextoA.close();
    await contextoB.close();
  }
});
