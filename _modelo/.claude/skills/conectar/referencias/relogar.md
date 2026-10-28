# Relogin automático

Quando o robô usa um site pelo Chrome dedicado do projeto (o Mercado Livre, por exemplo), ele entra com o
login que você fez uma vez nessa janela. Às vezes o site derruba esse login: aí o robô para e te avisa, e
você entra de novo na conta. O relogin automático é pra essa hora: o robô entra de novo sozinho, com o seu
usuário, a sua senha e o código do 2FA, e segue o trabalho.

Vem **desligado**. Só liga na conta que você escolher, uma por uma.

## Antes de ligar, leia isto

Pra entrar sozinho, o robô precisa de três coisas guardadas no `.env` do projeto: o usuário, a senha e a
semente do 2FA (o código secreto que o app autenticador usa pra gerar os 6 números). Com senha e semente no
mesmo arquivo, quem pegar o seu `.env` entra na sua conta sem pedir código; só ligue em conta que pode
perder.

O `.env` nunca vai pro backup do GitHub e o assistente não abre ele. O risco é alguém copiar o arquivo do seu
computador.

## Como ligar

1. Veja na lista de sites testados, lá embaixo, o nome da conta daquele site, em maiúscula (`ML` pro Mercado
   Livre, por exemplo). O nome amarra a senha ao site: a senha do `ML` nunca vai pra outro site.
2. Abra o `.env` na raiz do projeto pelo editor (nunca cole senha no chat) e acrescente três linhas, trocando
   `ML` pelo nome da conta:

   ```
   ML_USUARIO=o email ou usuário da conta
   ML_SENHA=a senha da conta
   ML_TOTP=a semente do 2FA
   ```

3. Onde achar a semente: no site, cadastre o 2FA de novo (o app autenticador é o jeito mais comum). Na tela
   do QR code tem a opção de digitar a chave à mão, com um texto de letras e números: essa é a semente. Copie
   pro `.env` e termine o cadastro no app normalmente.
4. Peça pro assistente conferir. Ele roda
   `node .claude/skills/conectar/scripts/chave.mjs tem ML_USUARIO ML_SENHA ML_TOTP`, que responde só `tem` ou
   `falta`, nunca o que você colou.

## Como o robô usa

Quando um script para avisando que a sessão caiu, o assistente roda
`node .claude/skills/conectar/scripts/relogar.mjs ML`. Esse script lê o `.env` sozinho, entra na conta pela
janela do Chrome dedicado e responde uma palavra só:

- `relogou`: entrou de novo, o trabalho segue;
- `falta-variavel`: falta alguma das três linhas no `.env`;
- `sem-receita`: essa conta não tem site testado (lista abaixo), então o login é com você;
- `captcha`: o site pediu a verificação de "não sou um robô"; resolva na janela e rode de novo;
- `falhou`: não deu certo. O robô tenta uma vez só por queda: se a sessão cair de novo em menos de 10 minutos,
  ele para e te chama, pra o site não travar a conta por tentativa repetida. Ele também para sem preencher
  nem clicar nada se a página de login sair do endereço do site.

## Como desligar

Apague as três linhas da conta no `.env`. Se o `.env` vazou (o computador foi roubado, o arquivo foi parar
num lugar que não devia), troque a senha da conta e cadastre o 2FA de novo no site: a semente antiga deixa de
valer.

## Sites com receita testada

Cada site tem a tela de login de um jeito, e o robô só entra sozinho no site em que a receita foi testada ao
vivo. Nos outros, quando a sessão cai, o robô para e te avisa.

- Mercado Livre (`mercadolivre.com.br`), conta `ML`: testada por quem faz o SabinOS em 2026-10-28. O robô
  entra pela senha e confirma pelo Google Authenticator, então a conta precisa ter o Google Authenticator
  ligado como segundo passo de verificação (Minha conta, Segurança). Se o Mercado Livre mudar a tela de login,
  o robô responde `falhou` e o login volta a ser com você até a receita ser refeita.
