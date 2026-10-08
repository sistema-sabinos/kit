// Exemplo de teste automático do Playwright pra um caminho. Copiar pra
// app/codigo/e2e/c01-agendar.spec.ts e adaptar.
// O teste acha cada botão pelo papel e pelo nome que a pessoa lê na tela,
// assim ele continua valendo quando o visual e a marca mudam.
// O endereço do servidor local vai no baseURL do playwright.config.ts.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('C01 cliente marca horário no salão', () => {
  // Erro jogado dentro do page.on não reprova o teste com certeza: os problemas
  // vão pra uma lista e o afterEach reprova se ela não estiver vazia.
  let problemas: string[] = [];

  test.beforeEach(async ({ page }) => {
    problemas = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') problemas.push(`erro no console: ${msg.text()}`);
    });
    page.on('pageerror', (err) => problemas.push(`erro na página: ${err.message}`));
    page.on('response', (res) => {
      if (res.status() >= 500) problemas.push(`${res.status()} em ${res.url()}`);
    });
  });

  test.afterEach(() => {
    expect(problemas).toEqual([]);
  });

  test('C01-F1 caminho feliz', async ({ page }) => {
    await page.goto('/agenda/corte');
    await page.getByRole('button', { name: /próximo dia livre/i }).click();
    await page.getByRole('button', { name: /10:00/ }).click();
    await page.getByLabel('Nome').fill('Cliente de Teste');
    await page.getByLabel('E-mail').fill('cliente@exemplo.test');
    await page.getByRole('button', { name: /confirmar/i }).click();
    await expect(page.getByRole('heading', { name: /horário marcado/i })).toBeVisible();

    const acessibilidade = await new AxeBuilder({ page }).analyze();
    expect(acessibilidade.violations).toEqual([]);
  });

  test('C01-B3 clique duplo marca um horário só', async ({ page }) => {
    await page.goto('/agenda/corte');
    await page.getByRole('button', { name: /próximo dia livre/i }).click();
    await page.getByRole('button', { name: /11:00/ }).click();
    await page.getByLabel('Nome').fill('Duas Vezes');
    await page.getByLabel('E-mail').fill('duas@exemplo.test');
    const confirmar = page.getByRole('button', { name: /confirmar/i });
    await Promise.all([confirmar.click(), confirmar.click()]);
    await expect(page.getByRole('heading', { name: /horário marcado/i })).toBeVisible();

    // A tela de confirmação aparece mesmo com reserva duplicada; quem prova é a contagem.
    // Adaptar o endereço da página onde o app lista os horários marcados e o nome do link
    // ou da lista. Se o app tiver uma rota que devolve os agendamentos, dá pra trocar por
    // request.get('/api/agendamentos') e conferir o tamanho da lista que volta.
    await page.goto('/meus-horarios');
    const agendamentos = page.getByRole('listitem').filter({ hasText: 'duas@exemplo.test' });
    await expect(agendamentos).toHaveCount(1);
  });
});
