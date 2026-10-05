// Dinheiro escrito como se escreve em português: US$ 3,20, nunca US$ 3.2.
// Fica num módulo próprio porque quem imprime custo nesta skill são dois
// arquivos que não se importam entre si (o clipe.mjs, que fala com o Veo e sabe
// o preço, e o gerar-video.mjs, que soma a rodada). Com duas formatações
// soltas a mesma skill imprimia "US$ 3,20" numa linha e "US$ 0.8" na outra.
export const usd = (n) => `US$ ${Number(n).toFixed(2).replace('.', ',')}`;
