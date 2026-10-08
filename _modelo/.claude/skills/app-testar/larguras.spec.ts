// Teste das larguras de tela do Playwright. Copiar pra app/codigo/e2e/larguras.spec.ts
// e adaptar a lista de telas.
// Abre cada tela em três larguras (celular pequeno, celular comum e computador) e reprova
// se a página rolar pro lado, sinal de que alguma coisa ficou mais larga que a tela.
// O endereço do servidor local vai no baseURL do playwright.config.ts.
import { test, expect } from '@playwright/test';

// Adaptar com as telas do app/mapa.md: o endereço de cada tela T01, T02... e um texto que só
// chega junto com os dados (o nome de um serviço cadastrado, um horário livre, o aviso de
// lista vazia). Nunca o título nem item de menu: eles já vêm no esqueleto da página, antes
// dos dados, e a busca acha o texto até dentro de uma frase maior. Tela que busca os dados
// depois de abrir começa vazia, e medir nesse instante passaria a tela que estoura só quando
// os dados chegam.
const ROTAS = [
  { caminho: '/', pronto: 'Corte masculino' },
  { caminho: '/agenda/corte', pronto: '09:00' },
  { caminho: '/meus-horarios', pronto: 'Nenhum horário marcado' },
];

const LARGURAS = [320, 390, 1440];

// Roda dentro da página. A largura do conteúdo (scrollWidth) maior que a largura visível
// (clientWidth) quer dizer que tem coisa sobrando pro lado. A largura visível desconta a
// barra de rolagem, por isso entra na conta no lugar da largura da janela.
function rolaProLado() {
  const raiz = document.documentElement;
  return raiz.scrollWidth > raiz.clientWidth;
}

for (const { caminho, pronto } of ROTAS) {
  for (const largura of LARGURAS) {
    test(`${caminho} em ${largura} px não rola pro lado`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 800 });
      await page.goto(caminho);
      // Só o que aparece na tela: app que tem uma cópia pro celular e outra pro computador deixa
      // uma delas escondida, e esperar pela escondida nunca termina.
      await expect(page.getByText(pronto).filter({ visible: true }).first(), `a tela ${caminho} não ficou pronta`).toBeVisible();
      expect(await page.evaluate(rolaProLado), `a tela ${caminho} rolou pro lado em ${largura} px`).toBe(false);
    });
  }
}
