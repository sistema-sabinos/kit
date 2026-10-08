# Fatos datados do pacote criar app

> Todo preço, limite e regra que pode mudar mora aqui, com a fonte oficial e o dia em que foi conferido.
> As skills do pacote leem daqui antes de mostrar custo ou regra ao aluno. Fato com mais de 60 dias
> se confere na web (buscar em português e inglês, fonte oficial primeiro), e a linha se atualiza
> aqui com a data nova. Mantenha as quatro colunas.
> Linha com o mesmo id em outro fatos.md do kit tem que ficar igual nos dois.
> Isto aqui é informação pra decidir, sem garantia de resultado jurídico. Caso que envolve dinheiro alto ou briga com outra empresa vai pra um advogado.

| id | fato | fonte | conferido_em |
|---|---|---|---|
| app-vercel-hobby | Vercel Hobby: grátis, só pra uso pessoal sem fim comercial; app que cobra do cliente precisa do plano Pro | https://vercel.com/docs/limits/fair-use-guidelines | 2026-10-07 |
| app-vercel-pro | Vercel Pro: US$ 20 por mês | https://vercel.com/docs/limits/fair-use-guidelines | 2026-10-07 |
| app-cloudflare-free | Cloudflare Workers Free: uso comercial liberado; a seção 2.2.1(h) dos termos proíbe processar ou coletar dado de cartão no plano grátis; limite de 100 mil requisições ao servidor por dia por conta (uma visita faz várias), e passou disso o site dá erro 1027 até o dia seguinte, sem troca automática pro plano pago | https://www.cloudflare.com/terms/ e https://developers.cloudflare.com/workers/platform/limits/ | 2026-10-07 |
| app-cloudflare-paid | Cloudflare Workers Paid: mínimo de US$ 5 por mês, com 10 milhões de requisições inclusas; só entra se o aluno contratar | https://developers.cloudflare.com/workers/platform/pricing/ | 2026-10-07 |
| app-cloudflare-nextjs | Next.js na Cloudflare Workers: a Cloudflare recomenda o vinext como caminho padrão; o adaptador OpenNext fica pra app que já usa OpenNext e ainda esbarra em algo que o vinext não cobre | https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/ | 2026-10-07 |
| app-netlify-free | Netlify Free: 300 créditos por mês com teto; acabaram os créditos, todos os projetos ficam pausados até o mês seguinte | https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/ | 2026-10-07 |
| app-render-free | Render Free: o site dorme depois de 15 minutos sem acesso, e a própria documentação pede pra não usar em produção | https://render.com/docs/free | 2026-10-07 |
| app-supabase-free | Supabase Free (banco de dados e login): 500 MB de banco, 50 mil usuários ativos por mês, pausa depois de 1 semana sem uso e sem backup automático | https://supabase.com/pricing | 2026-10-07 |
| app-supabase-chaves | Chaves do Supabase: a publicável (`sb_publishable_...`) pode ir pro código que roda no navegador; a secreta (`sb_secret_...`) fica só no servidor; o nome antigo da publicável é `anon` e o da secreta é `service_role` | https://supabase.com/docs/guides/api/api-keys | 2026-10-08 |
| app-resend-free | Resend Free (e-mail automático do app): 3.000 e-mails por mês, no máximo 100 por dia | https://resend.com/pricing | 2026-10-07 |
| app-expo-free | Expo EAS Free (montar o app de celular): 15 builds de Android e 15 de iPhone por mês | https://expo.dev/pricing | 2026-10-07 |
| app-registro-br | Domínio .com.br no registro.br: R$ 40,00 por ano | https://registro.br/dominio/valores/ | 2026-10-07 |
| app-stripe-taxas | Stripe Brasil: cartão nacional 3,99% + R$ 0,39 por venda; Pix 1,19%, liberado só por convite do Stripe; boleto R$ 3,45 | https://stripe.com/br/pricing | 2026-10-07 |
| app-stripe-reembolso | Stripe: no reembolso, a tarifa da cobrança original fica com o Stripe | https://docs.stripe.com/refunds | 2026-10-07 |
| app-stripe-teste | Stripe em modo de teste: o cartão 4242 4242 4242 4242 aprova e o 4000 0000 0000 0002 é recusado | https://docs.stripe.com/testing | 2026-10-07 |
| app-mp-checkout | Mercado Pago Checkout: Pix 0,99% com o dinheiro na hora; cartão 4,98% na hora, 4,49% em 14 dias ou 3,98% em 30 dias; boleto R$ 3,49 | https://www.mercadopago.com.br/ajuda/33399 | 2026-10-07 |
| app-mp-teste | Mercado Pago em modo de teste: cartão Mastercard 5480 8328 0103 3311 ou Visa 4235 6477 2802 5682, CVV 123, validade 11/30; nome do titular APRO aprova e OTHE recusa | https://www.mercadopago.com.br/developers/pt/docs/checkout-api/additional-content/your-integrations/test/cards | 2026-10-07 |
| app-mp-assinatura | Mercado Pago Assinaturas: cobrança automática todo mês só no cartão; Pix e boleto só no modo pendente, em que o cliente paga cada parcela por um link | https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview | 2026-10-07 |
| app-mp-reembolso | Mercado Pago: devolução feita pelo painel sem cobrar a tarifa do pagamento devolvido | https://vendedores.mercadolivre.com.br/nota/como-fazer-estorno-de-dinheiro-com-o-mercado-pago | 2026-10-07 |
| app-apple-conta | Conta de desenvolvedor da Apple: US$ 99 por ano, cobrada em moeda local na inscrição; a Apple não publica o valor em reais | https://developer.apple.com/support/purchase-activation/ | 2026-10-07 |
| app-google-conta | Conta de desenvolvedor do Google Play: US$ 25, pagamento único | https://support.google.com/googleplay/android-developer/answer/6112435?hl=en | 2026-10-07 |
| app-apple-ficha | Ficha da App Store: nome até 30 caracteres, subtítulo 30, texto promocional 170, palavras-chave 100 bytes (letra com acento conta 2), descrição 4000 | https://developer.apple.com/help/app-store-connect/reference/platform-version-information | 2026-10-07 |
| app-google-ficha | Ficha do Google Play: título até 30 caracteres, descrição curta 80, descrição completa 4000 | https://support.google.com/googleplay/android-developer/answer/9859152?hl=en | 2026-10-07 |
| app-google-metadados | Política de metadados do Google Play: título, ícone e nome do desenvolvedor sem emoji, emoticon ou caractere especial repetido, e sem CAIXA ALTA fora do nome da marca; nada de texto ou imagem que fale de desempenho ou ranking na loja ("App of the year", "#1", "Best of Play 20XX", "Popular", ícone de prêmio), de preço ou promoção ("10% off", "free for limited time only") ou de programa do Google Play ("Editor's choice", "New"); ícone sem símbolo enganoso, como falsa bolinha de notificação | https://support.google.com/googleplay/android-developer/answer/9898842?hl=en | 2026-10-07 |
| app-apple-regras | Regras da App Store: a 4.1 proíbe cópia de outro app e uso do nome ou do ícone dele; a 5.1.1(v) manda app com cadastro deixar o usuário excluir a conta dentro do próprio app | https://developer.apple.com/app-store/review/guidelines/ | 2026-10-07 |
| app-google-imitacao | Regra do Google Play: proíbe app que se passa por outro app ou por outra empresa | https://support.google.com/googleplay/android-developer/answer/9888374?hl=en | 2026-10-07 |
| app-lpi-195 | Concorrência desleal (Lei 9.279, art. 195): desviar cliente de outra empresa por meio fraudulento ou imitar o sinal de propaganda dela a ponto de confundir | https://www.planalto.gov.br/ccivil_03/leis/l9279.htm | 2026-10-07 |
| app-lpi-189-190 | Marca (Lei 9.279, arts. 189 e 190): reproduzir marca registrada dá de 3 meses a 1 ano de detenção; vender produto com marca imitada, de 1 a 3 meses | https://www.planalto.gov.br/ccivil_03/leis/l9279.htm | 2026-10-07 |
| app-trade-dress | Visual do conjunto (trade dress): protegido mesmo sem registro, pela regra da concorrência desleal, com perícia pra provar a confusão (STJ, REsp 1.353.451/MG, Informativo 612) | https://processo.stj.jus.br/jurisprudencia/externo/informativo/ | 2026-10-07 |
| app-lei-software | Lei do Software (Lei 9.609/1998): protege o código escrito; programa parecido só pela função que faz fica liberado (art. 6º, III) | https://www.planalto.gov.br/ccivil_03/leis/l9609.htm | 2026-10-07 |
| app-lei-ideia | Direito autoral (Lei 9.610/1998, art. 8º): ideia, método e plano de negócio ficam sem proteção, qualquer um pode usar | https://www.planalto.gov.br/ccivil_03/leis/l9610.htm | 2026-10-07 |
| app-inpi-busca | Busca de marca no INPI: pelo pePI, grátis e sem precisar de login (busca anônima) | https://busca.inpi.gov.br/pePI/ | 2026-10-07 |
| app-inpi-taxa | Taxa de marca no INPI: pedido com especificação pré-aprovada custa R$ 880 por classe, ou R$ 440 com o desconto de MEI e ME; a concessão sai a R$ 0 | https://www.gov.br/inpi/pt-br/servicos/custos-e-pagamento/NovaTabeladeRetribuiesINPI_MARCAS_Final_20_dez_25.pdf | 2026-10-07 |
| app-inpi-prazo | Prazo do INPI pra decidir a marca: uns 19 meses quando ninguém se opõe, uns 34 quando alguém se opõe (levantamento do TCU) | https://portal.tcu.gov.br/imprensa/noticias/tcu-analisa-sistema-para-solicitar-registro-de-marca-de-produto-no-inpi | 2026-10-07 |
| app-inpi-classes | Classes de marca: o INPI usa a Classificação de Nice NCL 13-2026; programa de computador fica na classe 9 e sistema vendido pela internet (SaaS) na classe 42 | https://www.gov.br/inpi/pt-br/servicos/marcas/classificacao-marcas | 2026-10-07 |
| app-lgpd | LGPD (Lei 13.709/2018): todo uso de dado pessoal precisa de base legal (art. 7º), o titular tem que ser informado do uso (art. 9º), a empresa indica um encarregado (art. 41), e a multa vai até 2%, limitada a R$ 50 milhões (art. 52) | https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm | 2026-10-07 |
| app-anpd-pequeno | ANPD pra pequeno porte (Resolução CD/ANPD 2/2022, art. 11): fica dispensado de indicar encarregado quem mantém um canal de contato com o titular, fora quando o tratamento de dado é de alto risco | https://www.gov.br/anpd/pt-br/documentos-e-publicacoes/regulamentacoes-da-anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022 | 2026-10-07 |
| app-anpd-cookies | Cookies (guia da ANPD v1.0, outubro de 2022): aviso de cookie sem opção já marcada e sem consentimento tácito; o usuário escolhe | https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-cookies-e-protecao-de-dados-pessoais.pdf | 2026-10-07 |
| app-cdc-49 | Arrependimento (Código de Defesa do Consumidor, art. 49): em compra feita fora da loja física, como pela internet, o cliente tem 7 dias pra desistir e recebe o dinheiro de volta na hora | https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm | 2026-10-07 |
| app-decreto-7962 | Comércio eletrônico (Decreto 7.962/2013): o site mostra os dados da empresa e da oferta (art. 2º), tem atendimento pela internet que permita cancelar (art. 4º, V) e deixa o cliente se arrepender pela mesma ferramenta usada pra comprar (art. 5º) | https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm | 2026-10-07 |
| app-decreto-11034 | Decreto 11.034/2022 (regras do SAC): vale só pra serviço regulado pelo governo federal; app comum vendido por assinatura fica fora | https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2022/decreto/d11034.htm | 2026-10-07 |
| app-marco-civil-15 | Marco Civil da Internet (Lei 12.965/2014, art. 15): empresa que oferece aplicação na internet guarda o registro de acesso dos usuários por 6 meses | https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm | 2026-10-07 |
| app-conar-32 | Propaganda comparando com concorrente (CONAR, art. 32): permitida dentro dos limites do código | https://www.conar.org.br/codigos?section=codigo | 2026-10-07 |
| app-wcag | Contraste de cor (WCAG 2.2): nível AA pede 4,5 pra 1 em texto comum e 3 pra 1 em texto grande e em botão ou campo; nível AAA pede 7 pra 1 | https://www.w3.org/TR/WCAG22/ | 2026-10-07 |
| app-axe-core | Ferramenta de teste de acessibilidade @axe-core/playwright: versão 4.13.0, licença MPL-2.0 | https://registry.npmjs.org/@axe-core/playwright | 2026-10-07 |
| app-google-oauth | Login com Google pedindo dado sensível: a verificação do Google leva de 3 a 5 dias úteis pela página de desenvolvedor e até 10 pela ajuda; planejar 10 dias úteis | https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification | 2026-10-07 |
| app-supabase-sessoes | Supabase: trocar a senha encerra as sessões sozinho; o passe de acesso (access token) que o outro aparelho já recebeu continua valendo até vencer, em geral entre 5 minutos e 1 hora | https://supabase.com/docs/guides/auth/sessions e https://supabase.com/docs/guides/auth/signout | 2026-10-08 |
| app-supabase-link-email | Supabase: link mandado por e-mail (troca de senha, confirmação, convite, troca de e-mail e link mágico) vence em 1 hora por padrão; o prazo se ajusta no painel em Authentication > Sign In / Providers > Auth Providers > Email > Email OTP expiration | https://supabase.com/docs/guides/auth/passwordless-login/auth-email-otp | 2026-10-08 |
| app-supabase-vinculo | Supabase: login novo (como o Google) só se junta sozinho a uma conta com o mesmo e-mail já confirmado; ao juntar, identidade sem confirmar ligada à conta é removida | https://supabase.com/docs/guides/auth/auth-identity-linking | 2026-10-08 |
| app-nextjs-server-action | Next.js 16.4: Server Action só aceita POST e compara o cabeçalho Origin com o Host, abortando o pedido se não batem; pra `route.ts` a documentação não descreve proteção pronta e manda auditar à parte | https://nextjs.org/docs/app/guides/data-security | 2026-10-08 |

## Fora da tabela (sem link único)

Licenças de fonte e ícone, conferidas em 2026-10-07 nos repositórios oficiais de cada projeto:
as fontes Inter, Geist, IBM Plex, Manrope e Source Serif usam a licença SIL OFL 1.1; os ícones
Lucide usam ISC, e Phosphor, Heroicons e Tabler usam MIT. Fica fora da tabela porque a fonte é o repositório de cada um, sem um
endereço só; antes de repassar com mais de 60 dias, abrir o repositório da fonte ou do ícone
escolhido e conferir a licença lá.
